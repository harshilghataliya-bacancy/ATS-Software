import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseResumeFromBytes } from '@/lib/services/resume-parser'
import { checkReapplyRestriction } from '@/lib/services/applications'

export const maxDuration = 300

const MAX_PDFS = 50
const MAX_PDF_SIZE = 10 * 1024 * 1024 // 10MB

interface BulkResult {
  filename: string
  status: 'created' | 'updated' | 'skipped' | 'failed'
  candidateId?: string
  candidateName?: string
  error?: string
}

export async function POST(request: NextRequest) {
  try {
    // 1. Auth
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Org membership + role check
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'No organization' }, { status: 403 })
    }

    const allowedRoles = ['admin', 'recruiter', 'hiring_manager']
    if (!allowedRoles.includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const orgId = membership.organization_id

    // 3. Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const jobId = formData.get('jobId') as string | null

    if (!file || !jobId) {
      return NextResponse.json({ error: 'file and jobId are required' }, { status: 400 })
    }

    // 4. Verify job exists in this org
    const { data: job } = await supabase
      .from('jobs')
      .select('id')
      .eq('id', jobId)
      .eq('organization_id', orgId)
      .single()

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // 5. Get first pipeline stage for this job
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('job_id', jobId)
      .eq('organization_id', orgId)
      .order('display_order', { ascending: true })
      .limit(1)
      .single()

    if (!firstStage) {
      return NextResponse.json({ error: 'No pipeline stages found for this job' }, { status: 400 })
    }

    // 6. Extract ZIP
    const zipBuffer = await file.arrayBuffer()
    const zip = await JSZip.loadAsync(zipBuffer)

    // Filter resume entries (skip __MACOSX, directories, non-resume files)
    const RESUME_EXTS = ['.pdf', '.doc', '.docx']
    const pdfEntries = Object.entries(zip.files).filter(([name, entry]) => {
      if (entry.dir) return false
      if (name.startsWith('__MACOSX/')) return false
      if (name.startsWith('.')) return false
      return RESUME_EXTS.some(ext => name.toLowerCase().endsWith(ext))
    })

    if (pdfEntries.length === 0) {
      return NextResponse.json({ error: 'No resume files (PDF, DOC, DOCX) found in ZIP' }, { status: 400 })
    }

    if (pdfEntries.length > MAX_PDFS) {
      return NextResponse.json({ error: `Too many files. Maximum is ${MAX_PDFS}.` }, { status: 400 })
    }

    // 7. Process PDFs in batches of 5
    const adminClient = createAdminClient()
    const results: BulkResult[] = []
    const candidateIdsForDeepParse: string[] = []

    for (let i = 0; i < pdfEntries.length; i += 5) {
      const batch = pdfEntries.slice(i, i + 5)
      const batchResults = await Promise.allSettled(
        batch.map(([filename, entry]) => processPdf(filename, entry, orgId, jobId, firstStage.id, adminClient, candidateIdsForDeepParse))
      )

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j]
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          results.push({
            filename: batch[j][0].split('/').pop() || batch[j][0],
            status: 'failed',
            error: result.reason?.message || 'Unknown error',
          })
        }
      }
    }

    // 8. Fire-and-forget deep parse for all successfully processed candidates
    if (candidateIdsForDeepParse.length > 0) {
      const origin = request.headers.get('origin') || request.nextUrl.origin
      fetch(`${origin}/api/resumes/parse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: request.headers.get('cookie') || '',
        },
        body: JSON.stringify({ candidate_ids: candidateIdsForDeepParse }),
      }).catch(() => {
        // Fire-and-forget — ignore errors
      })
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.status === 'created').length,
      updated: results.filter((r) => r.status === 'updated').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results,
    }

    return NextResponse.json({ data: summary })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to process bulk upload'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function processPdf(
  filepath: string,
  entry: JSZip.JSZipObject,
  orgId: string,
  jobId: string,
  stageId: string,
  adminClient: ReturnType<typeof createAdminClient>,
  candidateIdsForDeepParse: string[]
): Promise<BulkResult> {
  const filename = filepath.split('/').pop() || filepath

  // Extract bytes — make a copy for storage upload since parseResumeFromBytes may detach the buffer
  const rawBytes = await entry.async('uint8array')

  // Size check
  if (rawBytes.length > MAX_PDF_SIZE) {
    return { filename, status: 'failed', error: 'File exceeds 10MB limit' }
  }

  // Copy bytes so the original stays valid for storage upload
  const bytesForParse = new Uint8Array(rawBytes)
  const bytesForUpload = new Uint8Array(rawBytes)

  // Parse resume via GPT-4o (may fail — that's OK, we still create the candidate)
  const { data: parsed } = await parseResumeFromBytes(bytesForParse, filename)

  const email = parsed?.email?.toLowerCase().trim() || null
  const firstName = parsed?.first_name || filename.replace(/\.(pdf|docx?|doc)$/i, '').replace(/[_-]/g, ' ')
  const lastName = parsed?.last_name || ''
  const candidateName = `${firstName} ${lastName}`.trim()

  // If we have an email, check for existing candidate
  let existing: { id: string; phone: string | null; current_title: string | null; current_company: string | null; location: string | null } | null = null
  if (email) {
    const { data } = await adminClient
      .from('candidates')
      .select('id, phone, current_title, current_company, location')
      .eq('organization_id', orgId)
      .eq('email', email)
      .is('deleted_at', null)
      .single()
    existing = data
  }

  let candidateId: string
  let resultStatus: 'created' | 'updated'

  if (existing) {
    candidateId = existing.id
    resultStatus = 'updated'

    // Update only empty fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {}
    if (!existing.phone && parsed?.phone) updates.phone = parsed.phone
    if (!existing.current_title && parsed?.current_title) updates.current_title = parsed.current_title
    if (!existing.current_company && parsed?.current_company) updates.current_company = parsed.current_company
    if (!existing.location && parsed?.location) updates.location = parsed.location
    if (parsed?.experience_years != null) updates.experience_years = parsed.experience_years

    if (Object.keys(updates).length > 0) {
      await adminClient
        .from('candidates')
        .update(updates)
        .eq('id', candidateId)
    }
  } else {
    // Create new candidate
    const { data: newCandidate, error: insertError } = await adminClient
      .from('candidates')
      .insert({
        organization_id: orgId,
        first_name: firstName,
        last_name: lastName,
        email,
        phone: parsed?.phone || null,
        current_title: parsed?.current_title || null,
        current_company: parsed?.current_company || null,
        location: parsed?.location || null,
        experience_years: parsed?.experience_years ?? null,
        source: 'direct',
        source_details: 'Bulk resume upload',
        created_by: null,
      })
      .select('id')
      .single()

    if (insertError || !newCandidate) {
      if (insertError?.message?.includes('candidates_org_email_unique') && email != null) {
        // Race condition: another parallel request created this candidate first — look it up and continue
        const { data: raceCandidate } = await adminClient
          .from('candidates')
          .select('id')
          .eq('organization_id', orgId)
          .eq('email', email)
          .is('deleted_at', null)
          .single()

        if (raceCandidate) {
          candidateId = raceCandidate.id
          resultStatus = 'updated'
        } else {
          return { filename, status: 'failed', candidateName, error: 'Failed to resolve candidate after conflict' }
        }
      } else {
        return { filename, status: 'failed', error: insertError?.message || 'Failed to create candidate' }
      }
    } else {
      candidateId = newCandidate.id
      resultStatus = 'created'
    }
  }

  // Upload resume to storage
  const fileExt = filename.split('.').pop()?.toLowerCase() || 'pdf'
  const mimeTypes: Record<string, string> = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
  const storagePath = `${orgId}/${candidateId}/resume.${fileExt}`
  const { error: uploadError } = await adminClient.storage
    .from('resumes')
    .upload(storagePath, bytesForUpload, {
      contentType: mimeTypes[fileExt] || 'application/pdf',
      upsert: true,
    })

  if (uploadError) {
    return { filename, status: 'failed', error: `Storage upload failed: ${uploadError.message}` }
  }

  // Get public URL and update candidate
  const { data: urlData } = adminClient.storage.from('resumes').getPublicUrl(storagePath)
  await adminClient
    .from('candidates')
    .update({ resume_url: urlData.publicUrl })
    .eq('id', candidateId)

  // Check for duplicate application
  const { data: existingApp } = await adminClient
    .from('applications')
    .select('id')
    .eq('job_id', jobId)
    .eq('candidate_id', candidateId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .single()

  if (existingApp) {
    candidateIdsForDeepParse.push(candidateId)
    return { filename, status: 'skipped', candidateId, candidateName, error: 'Already has active application for this job' }
  }

  // Reapply restriction check
  const reapplyCheck = await checkReapplyRestriction(adminClient, candidateId, orgId)
  if (!reapplyCheck.allowed) {
    candidateIdsForDeepParse.push(candidateId)
    return { filename, status: 'skipped', candidateId, candidateName, error: reapplyCheck.message }
  }

  // Create application
  const { error: appError } = await adminClient
    .from('applications')
    .insert({
      organization_id: orgId,
      job_id: jobId,
      candidate_id: candidateId,
      current_stage_id: stageId,
      status: 'active',
      applied_at: new Date().toISOString(),
    })

  if (appError) {
    return { filename, status: 'failed', error: `Failed to create application: ${appError.message}` }
  }

  candidateIdsForDeepParse.push(candidateId)
  return { filename, status: resultStatus, candidateId, candidateName }
}
