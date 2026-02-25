import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }
    candidateId = newCandidate.id
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

  // 4. Check for duplicate
  const { data: existingApp } = await supabase
    .from('applications')
    .select('id')
    .eq('candidate_id', candidateId)
    .eq('job_id', jobId)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .maybeSingle()

  if (existingApp) {
    return NextResponse.json({ error: 'You have already applied for this position.' }, { status: 409 })
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

  return NextResponse.json({ success: true, candidateId })
}
