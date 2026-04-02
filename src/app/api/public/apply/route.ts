import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkReapplyRestriction } from '@/lib/services/applications'
import { sendGmailEmail } from '@/lib/services/gmail'
import { logEmail } from '@/lib/services/email'
import { getOrCreateTemplate, renderEmail } from '@/lib/email-templates'

/** Prepend https:// if a URL-like string is missing a protocol */
function normalizeUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^(www\.|linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com)/i.test(trimmed)) {
    return `https://${trimmed}`
  }
  return trimmed
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const {
    jobId, orgId, form, resumeUrl,
  } = body as {
    jobId: string
    orgId: string
    form: Record<string, string>
    resumeUrl?: string
  }

  if (!jobId || !orgId || !form?.email || !form?.first_name || !form?.last_name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Normalize URLs before processing
  form.linkedin_url = normalizeUrl(form.linkedin_url) ?? ''
  form.portfolio_url = normalizeUrl(form.portfolio_url) ?? ''

  const supabase = createAdminClient()

  // 1. Create or find candidate
  const { data: existingCandidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('organization_id', orgId)
    .eq('email', form.email)
    .maybeSingle()

  const currentSalary = form.current_salary ? parseFloat(form.current_salary) : null
  const expectedSalary = form.expected_salary ? parseFloat(form.expected_salary) : null
  const experienceYears = form.experience_years ? parseFloat(form.experience_years) : null

  const candidatePayload = {
    first_name: form.first_name,
    last_name: form.last_name,
    phone: form.phone || null,
    linkedin_url: form.linkedin_url || null,
    portfolio_url: form.portfolio_url || null,
    current_company: form.current_company || null,
    current_title: form.current_title || null,
    location: form.location || null,
    current_salary: currentSalary,
    expected_salary: expectedSalary,
    education: form.education || null,
    experience_years: experienceYears,
    notice_period: form.notice_period || null,
    gender: form.gender || null,
    date_of_birth: form.date_of_birth || null,
    cover_letter: form.cover_letter || null,
  }

  let candidateId: string

  if (existingCandidate) {
    const { error: updateError } = await supabase
      .from('candidates')
      .update({ ...candidatePayload, updated_at: new Date().toISOString() })
      .eq('id', existingCandidate.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
    candidateId = existingCandidate.id
  } else {
    const { data: newCandidate, error: createError } = await supabase
      .from('candidates')
      .insert({
        ...candidatePayload,
        organization_id: orgId,
        email: form.email,
        source: 'careers_page',
        gdpr_consent: true,
        gdpr_consent_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (createError) {
      // Race condition: candidate was created between our check and insert
      if (createError.message.includes('candidates_org_email_unique')) {
        const { data: raceCandidate } = await supabase
          .from('candidates')
          .select('id')
          .eq('organization_id', orgId)
          .eq('email', form.email)
          .single()

        if (raceCandidate) {
          await supabase
            .from('candidates')
            .update({ ...candidatePayload, updated_at: new Date().toISOString() })
            .eq('id', raceCandidate.id)
          candidateId = raceCandidate.id
        } else {
          return NextResponse.json({ error: 'A candidate with this email already exists. Please try again.' }, { status: 409 })
        }
      } else {
        return NextResponse.json({ error: createError.message }, { status: 500 })
      }
    } else {
      candidateId = newCandidate.id
    }
  }

  // 2. Update resume URL if provided
  if (resumeUrl) {
    await supabase
      .from('candidates')
      .update({ resume_url: resumeUrl })
      .eq('id', candidateId)
  }

  // 3. Find first pipeline stage
  const { data: firstStage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('job_id', jobId)
    .eq('organization_id', orgId)
    .order('display_order', { ascending: true })
    .limit(1)
    .single()

  if (!firstStage) {
    return NextResponse.json({ error: 'Unable to process application. Please try again later.' }, { status: 500 })
  }

  // 4. Check for duplicate — one candidate can only have one active application
  const { data: existingApp } = await supabase
    .from('applications')
    .select('id, job:jobs(title)')
    .eq('candidate_id', candidateId)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (existingApp) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jobTitle = (existingApp.job as any)?.title ?? 'another position'
    return NextResponse.json({ error: `You already have an active application for "${jobTitle}". You can only apply to one job at a time.` }, { status: 409 })
  }

  // 4b. Reapply restriction check — block if rejected or declined offer within restriction window
  const reapplyCheck = await checkReapplyRestriction(supabase, candidateId, orgId)
  if (!reapplyCheck.allowed) {
    return NextResponse.json({ error: reapplyCheck.message }, { status: 409 })
  }

  // 5. Create application
  const { error: appError } = await supabase
    .from('applications')
    .insert({
      organization_id: orgId,
      candidate_id: candidateId,
      job_id: jobId,
      current_stage_id: firstStage.id,
      status: 'active',
      applied_at: new Date().toISOString(),
    })

  if (appError) {
    return NextResponse.json({ error: appError.message }, { status: 500 })
  }

  // 6. Fire-and-forget resume parsing
  if (resumeUrl) {
    fetch(`${request.nextUrl.origin}/api/resumes/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: candidateId, organization_id: orgId }),
    }).catch(() => {})
  }

  // 7. Fire-and-forget acknowledgment email to candidate
  sendApplicationAcknowledgment(supabase, orgId, candidateId, jobId, form).catch((err) => {
    console.error('[Application Acknowledgment Email Error]', err)
  })

  return NextResponse.json({ success: true, candidateId })
}

// ---------------------------------------------------------------------------
// Acknowledgment email — sent automatically after public application
// ---------------------------------------------------------------------------

async function sendApplicationAcknowledgment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  candidateId: string,
  jobId: string,
  form: Record<string, string>
) {
  const adminSupabase = createAdminClient()

  // Fetch org name + job title
  const [orgResult, jobResult] = await Promise.all([
    adminSupabase.from('organizations').select('name').eq('id', orgId).single(),
    adminSupabase.from('jobs').select('title, department').eq('id', jobId).single(),
  ])

  const companyName = orgResult.data?.name || 'Our Company'
  const jobTitle = jobResult.data?.title || 'the position'
  const candidateName = `${form.first_name} ${form.last_name}`.trim()
  const candidateEmail = form.email

  if (!candidateEmail) return

  // Find any admin's Gmail token to send from
  const { data: adminMembers } = await adminSupabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', orgId)
    .eq('role', 'admin')
    .is('deleted_at', null)

  if (!adminMembers || adminMembers.length === 0) return

  let accessToken: string | null = null
  let fromEmail = ''
  let senderDisplayName: string | null = null

  for (const admin of adminMembers) {
    const { data: tokenRow } = await adminSupabase
      .from('google_oauth_tokens')
      .select('*')
      .eq('user_id', admin.user_id)
      .eq('organization_id', orgId)
      .eq('provider', 'gmail')
      .maybeSingle()

    if (tokenRow) {
      const { getValidAccessToken } = await import('@/lib/services/gmail')
      const result = await getValidAccessToken(supabase, admin.user_id, orgId)
      if (result.accessToken) {
        accessToken = result.accessToken
        fromEmail = result.fromEmail
        senderDisplayName = result.displayName || null
        break
      }
    }
  }

  if (!accessToken) return

  // Use the unified template system
  const template = await getOrCreateTemplate(adminSupabase, orgId, 'application_received')

  const vars: Record<string, string> = {
    candidate_name: candidateName,
    job_title: jobTitle,
    company_name: companyName,
    department: jobResult.data?.department || '',
  }

  const { subject, html } = renderEmail(template, vars, companyName)

  try {
    await sendGmailEmail(accessToken, {
      from: fromEmail,
      fromName: senderDisplayName || companyName,
      to: candidateEmail,
      subject,
      html,
    })

    await logEmail(adminSupabase, orgId, {
      candidate_id: candidateId,
      subject,
      body_html: html,
      to_email: candidateEmail,
      from_email: fromEmail,
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[Acknowledgment Email Send Error]', err)
    await logEmail(adminSupabase, orgId, {
      candidate_id: candidateId,
      subject,
      body_html: html,
      to_email: candidateEmail,
      from_email: fromEmail,
      status: 'failed',
    }).catch(() => {})
  }
}
