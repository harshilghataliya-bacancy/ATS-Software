import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { respondToOffer, expireOffer, revokeOffer } from '@/lib/services/offers'
import { hireApplication } from '@/lib/services/applications'
import { logActivity } from '@/lib/services/activity'
import { getOrCreateTemplate, renderEmail } from '@/lib/email-templates'
import { getValidAccessToken, sendGmailEmail } from '@/lib/services/gmail'
import { logEmail } from '@/lib/services/email'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  const body = await request.json()
  const { status, notes } = body as { status: 'accepted' | 'declined' | 'expired' | 'revoked'; notes?: string }

  if (!status || !['accepted', 'declined', 'expired', 'revoked'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status. Must be accepted, declined, expired, or revoked.' }, { status: 400 })
  }

  const orgId = membership.organization_id

  if (status === 'expired') {
    const { data, error } = await expireOffer(supabase, id, orgId)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (data?.application_id) logActivity(supabase, orgId, user.id, 'application', data.application_id, 'offer_expired', { offer_id: id }).catch(() => {})
    return NextResponse.json({ success: true, data })
  }

  if (status === 'revoked') {
    const { data, error } = await revokeOffer(supabase, id, orgId, notes)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Fetch offer details for email + activity
    const { data: offerDetail } = await supabase
      .from('offer_letters')
      .select('application_id, applications(candidate_id, candidates(first_name, last_name, email), jobs(title, department))')
      .eq('id', id)
      .single()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info = offerDetail as any
    const candidate = info?.applications?.candidates
    const job = info?.applications?.jobs
    const candidateName = candidate ? `${candidate.first_name} ${candidate.last_name}` : ''
    const candidateEmail = candidate?.email || ''
    const applicationId = info?.application_id || data?.application_id

    // Log activity with reason
    if (applicationId) {
      logActivity(supabase, orgId, user.id, 'application', applicationId, 'offer_revoked', {
        offer_id: id,
        reason: notes || undefined,
        candidate_name: candidateName,
        job_title: job?.title || undefined,
      }).catch(() => {})
    }

    // Send revocation email to candidate (CC recruiter)
    if (candidateEmail) {
      sendRevokeEmail(supabase, orgId, user, candidateEmail, candidateName, job, notes, applicationId, candidate?.id).catch((err) =>
        console.error('[Revoke Email Error]', err)
      )
    }

    return NextResponse.json({ success: true, data })
  }

  const { data, error } = await respondToOffer(
    supabase,
    id,
    orgId,
    status,
    notes
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const action = status === 'accepted' ? 'offer_accepted' : 'offer_declined'
  if (data?.application_id) logActivity(supabase, orgId, user.id, 'application', data.application_id, action, { offer_id: id }).catch(() => {})

  // Auto-hire the application when offer is accepted
  if (status === 'accepted' && data?.application_id) {
    await hireApplication(supabase, data.application_id, orgId, user.id)
    // Fetch candidate info for activity log
    const { data: appInfo } = await supabase
      .from('applications')
      .select('candidates(first_name, last_name), jobs(title)')
      .eq('id', data.application_id)
      .single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info = appInfo as any
    logActivity(supabase, orgId, user.id, 'application', data.application_id, 'application_hired', {
      candidate_name: info?.candidates ? `${info.candidates.first_name} ${info.candidates.last_name}` : undefined,
      job_title: info?.jobs?.title || undefined,
    }).catch(() => {})
  }

  return NextResponse.json({ success: true, data })
}

// ---------------------------------------------------------------------------
// Send revocation email helper
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendRevokeEmail(
  supabase: any,
  orgId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any,
  candidateEmail: string,
  candidateName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  job: any,
  reason: string | undefined,
  applicationId: string | undefined,
  candidateId: string | undefined,
) {
  // Get org name
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single()

  const companyName = org?.name || 'Our Company'

  // Get Gmail token
  const tokenResult = await getValidAccessToken(supabase, user.id, orgId)
  if (!tokenResult.accessToken) return

  // Get template and render (reason is internal only — not included in candidate email)
  const template = await getOrCreateTemplate(supabase, orgId, 'offer_revoked', user.id)
  const vars: Record<string, string> = {
    candidate_name: candidateName,
    job_title: job?.title || '',
    company_name: companyName,
    revoke_reason: '',
    reason_section: '',
  }

  const { subject, html } = renderEmail(template, vars, companyName)
  const fromEmail = tokenResult.fromEmail || user.email!
  const recruiterCc = user.email || undefined

  await sendGmailEmail(tokenResult.accessToken, {
    from: fromEmail,
    fromName: companyName,
    to: candidateEmail,
    cc: recruiterCc,
    subject,
    html,
  })

  // Log the email
  if (candidateId) {
    await logEmail(supabase, orgId, {
      candidate_id: candidateId,
      application_id: applicationId,
      template_id: template.template_id || undefined,
      subject,
      body_html: html,
      to_email: candidateEmail,
      from_email: fromEmail,
      status: 'sent',
      sent_at: new Date().toISOString(),
    }).catch(() => {})
  }
}
