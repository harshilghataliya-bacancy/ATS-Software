import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rejectApplication } from '@/lib/services/applications'
import { logEmail } from '@/lib/services/email'
import { getValidAccessToken, sendGmailEmail } from '@/lib/services/gmail'
import { logActivity } from '@/lib/services/activity'
import { getOrCreateTemplate, renderEmail, substituteVariables } from '@/lib/email-templates'
import { wrapEmailHtml } from '@/lib/email-templates/wrapper'

// Ensure plain text gets wrapped in <p> tags for proper email rendering
function ensureHtml(text: string): string {
  if (/<(p|br|div|h[1-6]|ul|ol|li|table)\b/i.test(text)) return text
  return text
    .split(/\n\s*\n/)
    .map((para) => `<p>${para.trim().replace(/\n/g, '<br/>')}</p>`)
    .filter((p) => p !== '<p></p>')
    .join('\n')
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, organization:organizations(name)')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  const orgId = membership.organization_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyName = (membership.organization as any)?.name || 'Our Company'

  const body = await request.json()
  const { applicationId, reason, stageId, sendEmail, customSubject, customBody } = body as {
    applicationId: string
    reason: string
    stageId?: string
    sendEmail?: boolean
    customSubject?: string
    customBody?: string
  }

  if (!applicationId) {
    return NextResponse.json({ error: 'Missing applicationId' }, { status: 400 })
  }

  // 1. Reject the application in the database (optionally move to rejected stage)
  const { error: rejectError } = await rejectApplication(
    supabase, applicationId, orgId, reason || '', user.id, stageId
  )

  if (rejectError) {
    return NextResponse.json({ error: rejectError.message }, { status: 500 })
  }

  // Fetch candidate name for activity log
  const admin = createAdminClient()
  const { data: appData } = await admin
    .from('applications')
    .select('candidates(first_name, last_name), jobs(title)')
    .eq('id', applicationId)
    .single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appInfo = appData as any

  // Log activity
  logActivity(supabase, orgId, user.id, 'application', applicationId, 'application_rejected', {
    reason: reason || '',
    candidate_name: appInfo?.candidates ? `${appInfo.candidates.first_name} ${appInfo.candidates.last_name}` : undefined,
    job_title: appInfo?.jobs?.title || undefined,
  }).catch(() => {})

  // 2. Send rejection email only if explicitly requested
  if (sendEmail) {
    sendRejectionEmail(supabase, user.id, orgId, applicationId, companyName, customSubject, customBody).catch((err) => {
      console.error('[Auto Rejection Email Error]', err)
    })
  }

  return NextResponse.json({ success: true })
}

async function sendRejectionEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  orgId: string,
  applicationId: string,
  companyName: string,
  customSubject?: string,
  customBody?: string
) {
  const adminSupabase = createAdminClient()

  // Fetch application with candidate and job details
  const { data: app } = await adminSupabase
    .from('applications')
    .select(`
      id, candidate_id,
      candidate:candidates(id, first_name, last_name, email),
      job:jobs(id, title, department)
    `)
    .eq('id', applicationId)
    .eq('organization_id', orgId)
    .single()

  if (!app?.candidate || !app?.job) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidate = app.candidate as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job = app.job as any
  const candidateEmail = candidate.email
  if (!candidateEmail) return

  const vars: Record<string, string> = {
    candidate_name: `${candidate.first_name} ${candidate.last_name}`.trim(),
    job_title: job.title || 'the position',
    company_name: companyName,
    department: job.department || '',
  }

  let subject: string
  let bodyHtml: string
  let templateId: string | undefined

  // If custom subject/body provided (user edited in dialog), use those directly
  if (customSubject && customBody) {
    subject = substituteVariables(customSubject, vars)
    const innerHtml = ensureHtml(substituteVariables(customBody, vars))
    bodyHtml = wrapEmailHtml(innerHtml, companyName)
  } else {
    // Use template system — auto-seeds default if not yet in DB
    const template = await getOrCreateTemplate(supabase, orgId, 'rejection', userId)
    templateId = template.template_id || undefined
    const rendered = renderEmail(template, vars, companyName)
    subject = rendered.subject
    bodyHtml = rendered.html
  }

  // Get Gmail access token (falls back to admin's token)
  const tokenResult = await getValidAccessToken(supabase, userId, orgId)
  if (!tokenResult.accessToken) {
    console.error('[Auto Rejection Email] No Gmail token available:', tokenResult.error)
    return
  }

  try {
    await sendGmailEmail(tokenResult.accessToken, {
      from: tokenResult.fromEmail,
      fromName: tokenResult.displayName || companyName,
      to: candidateEmail,
      subject,
      html: bodyHtml,
      refreshToken: tokenResult.refreshToken,
    })

    await logEmail(supabase, orgId, {
      candidate_id: candidate.id,
      application_id: applicationId,
      template_id: templateId,
      subject,
      body_html: bodyHtml,
      to_email: candidateEmail,
      from_email: tokenResult.fromEmail,
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[Auto Rejection Email Send Error]', err)
    try {
      await logEmail(supabase, orgId, {
        candidate_id: candidate.id,
        application_id: applicationId,
        template_id: templateId,
        subject,
        body_html: bodyHtml,
        to_email: candidateEmail,
        from_email: tokenResult.fromEmail,
        status: 'failed',
      })
    } catch (logErr) {
      console.error('[Auto Rejection Email Log Error]', logErr)
    }
  }
}
