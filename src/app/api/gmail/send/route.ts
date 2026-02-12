import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken, sendGmailEmail } from '@/lib/services/gmail'
import { logEmail } from '@/lib/services/email'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  const orgId = membership.organization_id

  const body = await request.json()
  const { to, subject, html, candidateId, applicationId, templateId } = body as {
    to: string
    subject: string
    html: string
    candidateId: string
    applicationId?: string
    templateId?: string
  }

  if (!to || !subject || !html || !candidateId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Get a valid access token (auto-refreshes if needed)
  const tokenResult = await getValidAccessToken(supabase, user.id, orgId)
  if (!tokenResult.accessToken) {
    return NextResponse.json({ error: tokenResult.error }, { status: 400 })
  }

  const fromEmail = tokenResult.fromEmail || user.email!
  const accessToken = tokenResult.accessToken

  try {
    await sendGmailEmail(accessToken, {
      from: fromEmail,
      to,
      subject,
      html,
    })

    // Log the email
    await logEmail(supabase, orgId, {
      candidate_id: candidateId,
      application_id: applicationId,
      template_id: templateId,
      subject,
      body_html: html,
      to_email: to,
      from_email: fromEmail,
      status: 'sent',
      sent_at: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Gmail Send Error]', err)

    // Log the failed email - wrap in try/catch so logging failure doesn't mask the real error
    try {
      await logEmail(supabase, orgId, {
        candidate_id: candidateId,
        application_id: applicationId,
        template_id: templateId,
        subject,
        body_html: html,
        to_email: to,
        from_email: fromEmail,
        status: 'failed',
      })
    } catch (logErr) {
      console.error('[Email Log Error]', logErr)
    }

    const message = err instanceof Error ? err.message : 'Failed to send email'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
