import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createAssessmentInvitation,
  getAssessmentInvitationsForJob,
  getAssessmentInvitationsForApplication,
} from '@/lib/services/assessments'
import { getValidAccessToken, sendGmailEmail } from '@/lib/services/gmail'
import { moveApplication } from '@/lib/services/applications'
import { logActivity } from '@/lib/services/activity'
import { getOrCreateTemplate, renderEmail } from '@/lib/email-templates'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const applicationId = searchParams.get('application_id')
  const jobId = searchParams.get('job_id')

  if (applicationId) {
    const { data, error } = await getAssessmentInvitationsForApplication(
      supabase, applicationId, membership.organization_id
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ invitations: data })
  }

  if (!jobId) return NextResponse.json({ error: 'application_id or job_id required' }, { status: 400 })

  const { data, error } = await getAssessmentInvitationsForJob(supabase, jobId, membership.organization_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ invitations: data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const body = await request.json()
  const { application_id, assessment_name, assessment_link, instructions, expiry_date } = body

  if (!application_id || !assessment_link) {
    return NextResponse.json({ error: 'application_id and assessment_link are required' }, { status: 400 })
  }

  // Resolve application → candidate + job
  const { data: application } = await supabase
    .from('applications')
    .select('id, candidate_id, job_id, candidates(first_name, last_name, email), jobs(title)')
    .eq('id', application_id)
    .eq('organization_id', membership.organization_id)
    .single()

  if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidate = (application as any).candidates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job = (application as any).jobs

  if (!candidate?.email) {
    return NextResponse.json({ error: 'Candidate email not found' }, { status: 400 })
  }

  // Create invitation record
  const { data: invitation, error: invError } = await createAssessmentInvitation(
    supabase,
    membership.organization_id,
    {
      application_id,
      candidate_id: application.candidate_id,
      job_id: application.job_id,
      assessment_name: assessment_name || null,
      assessment_link,
      instructions: instructions || null,
      expiry_date: expiry_date || null,
      invited_by: user.id,
    }
  )

  if (invError) return NextResponse.json({ error: invError.message }, { status: 500 })

  // Log activity
  const candidateName = `${candidate.first_name} ${candidate.last_name}`
  const jobTitle = job?.title || 'Position'
  logActivity(supabase, membership.organization_id, user.id, 'application', application_id as string, 'assessment_sent', {
    assessment_name: assessment_name || 'Assessment',
    candidate_name: candidateName,
    job_title: jobTitle,
  }).catch(() => {})

  // Get org name for email
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', membership.organization_id)
    .single()

  const orgName = org?.name || 'Our Company'
  const assessmentLabel = assessment_name || 'Online Assessment'

  // Build dynamic sections
  const instructionsSection = instructions
    ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px;margin:16px 0;"><p style="color:#374151;margin:0;white-space:pre-wrap;">${instructions}</p></div>`
    : ''
  const expirySection = expiry_date
    ? `<p style="color:#6b7280;font-size:14px;">Please complete the assessment by <strong>${new Date(expiry_date).toLocaleDateString('en-US', { dateStyle: 'long' })}</strong>.</p>`
    : ''

  // Try to send email via Gmail
  const tokenResult = await getValidAccessToken(supabase, user.id, membership.organization_id)
  if (tokenResult.accessToken) {
    const template = await getOrCreateTemplate(supabase, membership.organization_id, 'assessment_invitation', user.id)
    const { subject, html } = renderEmail(template, {
      candidate_name: candidateName,
      job_title: jobTitle,
      company_name: orgName,
      assessment_name: assessmentLabel,
      assessment_link,
      instructions: instructions || '',
      expiry_date: expiry_date ? new Date(expiry_date).toLocaleDateString('en-US', { dateStyle: 'long' }) : '',
      instructions_section: instructionsSection,
      expiry_section: expirySection,
    }, orgName)

    const senderEmail = tokenResult.fromEmail || user.email!
    sendGmailEmail(tokenResult.accessToken, {
      from: senderEmail,
      fromName: tokenResult.displayName || orgName,
      to: candidate.email,
      cc: user.email !== candidate.email ? user.email! : undefined,
      subject,
      html,
      refreshToken: tokenResult.refreshToken,
    }).catch(() => { /* Email failed — non-fatal */ })
  }

  // Auto-advance to 'assessment' stage if not already past it
  try {
    const { data: appWithStage } = await supabase
      .from('applications')
      .select('current_stage_id, pipeline_stages:current_stage_id(display_order)')
      .eq('id', application_id)
      .single()

    const { data: assessmentStage } = await supabase
      .from('pipeline_stages')
      .select('id, display_order')
      .eq('job_id', application.job_id)
      .eq('stage_type', 'assessment')
      .maybeSingle()

    if (assessmentStage && appWithStage) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentOrder = (appWithStage.pipeline_stages as any)?.display_order ?? -1
      if (currentOrder < assessmentStage.display_order) {
        await moveApplication(supabase, application_id, membership.organization_id, assessmentStage.id, user.id)
      }
    }
  } catch { /* silently skip */ }

  return NextResponse.json({ success: true, data: invitation })
}
