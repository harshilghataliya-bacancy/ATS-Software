import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createAssessmentInvitation,
  getAssessmentInvitationsForJob,
  getAssessmentInvitationsForApplication,
} from '@/lib/services/assessments'
import { getValidAccessToken, sendGmailEmail } from '@/lib/services/gmail'
import { moveApplication } from '@/lib/services/applications'

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

  // Get org name for email
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', membership.organization_id)
    .single()

  // Try to send email via Gmail (non-blocking if not connected)
  const tokenResult = await getValidAccessToken(supabase, user.id, membership.organization_id)
  if (tokenResult.accessToken) {
    const candidateName = `${candidate.first_name} ${candidate.last_name}`
    const orgName = org?.name || 'Our Company'
    const jobTitle = job?.title || 'the position'
    const assessmentLabel = assessment_name || 'Online Assessment'

    const emailHtml = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#1f2937;">Assessment Invitation – ${assessmentLabel}</h2>
  <p style="color:#374151;">Dear ${candidateName},</p>
  <p style="color:#374151;">
    Thank you for applying for the <strong>${jobTitle}</strong> position at <strong>${orgName}</strong>.
    As part of our hiring process, we'd like you to complete an online assessment: <strong>${assessmentLabel}</strong>.
  </p>
  ${instructions ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px;margin:16px 0;"><p style="color:#374151;margin:0;white-space:pre-wrap;">${instructions}</p></div>` : ''}
  ${expiry_date ? `<p style="color:#6b7280;font-size:14px;">Please complete the assessment by <strong>${new Date(expiry_date).toLocaleDateString('en-US', { dateStyle: 'long' })}</strong>.</p>` : ''}
  <div style="text-align:center;margin:32px 0;">
    <a href="${assessment_link}" style="display:inline-block;padding:12px 32px;background-color:#4f46e5;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:16px;">Start Assessment</a>
  </div>
  <p style="color:#6b7280;font-size:14px;">Or copy this link: <a href="${assessment_link}" style="color:#4f46e5;">${assessment_link}</a></p>
  <p style="color:#374151;margin-top:24px;">Best regards,<br/>${orgName} Talent Team</p>
</div>`

    sendGmailEmail(tokenResult.accessToken, {
      from: tokenResult.fromEmail || user.email!,
      to: candidate.email,
      subject: `Assessment Invitation – ${assessmentLabel} | ${jobTitle} at ${orgName}`,
      html: emailHtml,
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
