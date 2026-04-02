import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken, sendGmailEmail } from '@/lib/services/gmail'
import { logEmail } from '@/lib/services/email'
import { logActivity } from '@/lib/services/activity'

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
    .is('deleted_at', null)
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

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: 'Invalid email address format' }, { status: 400 })
  }

  // Get a valid access token (auto-refreshes if needed)
  const tokenResult = await getValidAccessToken(supabase, user.id, orgId)
  if (!tokenResult.accessToken) {
    return NextResponse.json({ error: tokenResult.error }, { status: 400 })
  }

  const fromEmail = tokenResult.fromEmail || user.email!
  const accessToken = tokenResult.accessToken

  // Fetch org name for fromName
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single()
  const orgName = org?.name || 'Our Company'

  try {
    await sendGmailEmail(accessToken, {
      from: fromEmail,
      fromName: tokenResult.displayName || orgName,
      to,
      subject,
      html,
      refreshToken: tokenResult.refreshToken,
    })

    // Log activity
    const entityId = applicationId || candidateId
    const entityType = applicationId ? 'application' : 'candidate'
    logActivity(supabase, orgId, user.id, entityType as 'application' | 'candidate', entityId, 'email_sent', {
      subject,
      to_email: to,
    }).catch(() => {})

    // Log the email in background
    logEmail(supabase, orgId, {
      candidate_id: candidateId,
      application_id: applicationId,
      template_id: templateId,
      subject,
      body_html: html,
      to_email: to,
      from_email: fromEmail,
      status: 'sent',
      sent_at: new Date().toISOString(),
    }).catch((err) => console.error('[Email Log Error]', err))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Gmail Send Error]', err)

    // Log the failed email in background
    logEmail(supabase, orgId, {
      candidate_id: candidateId,
      application_id: applicationId,
      template_id: templateId,
      subject,
      body_html: html,
      to_email: to,
      from_email: fromEmail,
      status: 'failed',
    }).catch((logErr) => console.error('[Email Log Error]', logErr))

    const message = err instanceof Error ? err.message : 'Failed to send email'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
