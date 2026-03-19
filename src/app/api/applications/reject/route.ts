import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rejectApplication } from '@/lib/services/applications'
import { getEmailTemplates, logEmail } from '@/lib/services/email'
import { getValidAccessToken, sendGmailEmail } from '@/lib/services/gmail'
import { logActivity } from '@/lib/services/activity'

const DEFAULT_REJECTION_SUBJECT = 'Update on Your Application for {{job_title}}'
const DEFAULT_REJECTION_BODY = `<p>Dear {{candidate_name}},</p>
<p>Thank you for your interest in the <strong>{{job_title}}</strong> position at <strong>{{company_name}}</strong> and for taking the time to go through our interview process.</p>
<p>After careful consideration, we have decided to move forward with other candidates whose qualifications more closely match our current needs.</p>
<p>We truly appreciate the time and effort you invested in your application. We encourage you to apply for future openings that align with your skills and experience.</p>
<p>We wish you all the best in your career journey.</p>
<p>Warm regards,<br/>{{company_name}} Hiring Team</p>`

function substituteVariables(
  text: string,
  vars: Record<string, string>
): string {
  let result = text
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }
  return result
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
  const { applicationId, reason, stageId } = body as {
    applicationId: string
    reason: string
    stageId?: string
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

  // 2. Send rejection email in background (don't block response)
  sendRejectionEmail(supabase, user.id, orgId, applicationId, companyName).catch((err) => {
    console.error('[Auto Rejection Email Error]', err)
  })

  return NextResponse.json({ success: true })
}

async function sendRejectionEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  orgId: string,
  applicationId: string,
  companyName: string
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

  // Try to find a rejection email template for this org
  const { data: templates } = await getEmailTemplates(supabase, orgId, 'rejection')
  let subject: string
  let bodyHtml: string
  let templateId: string | undefined

  if (templates && templates.length > 0) {
    const template = templates[0]
    subject = substituteVariables(template.subject, vars)
    bodyHtml = substituteVariables(template.body_html, vars)
    templateId = template.id
  } else {
    // Use default built-in template
    subject = substituteVariables(DEFAULT_REJECTION_SUBJECT, vars)
    bodyHtml = substituteVariables(DEFAULT_REJECTION_BODY, vars)
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
      to: candidateEmail,
      subject,
      html: bodyHtml,
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
