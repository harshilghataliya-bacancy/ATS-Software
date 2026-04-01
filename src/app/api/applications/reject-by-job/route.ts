import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rejectApplication } from '@/lib/services/applications'
import { getEmailTemplates, logEmail } from '@/lib/services/email'
import { getValidAccessToken, sendGmailEmail } from '@/lib/services/gmail'

const DEFAULT_REJECTION_SUBJECT = 'Update on Your Application for {{job_title}}'
const DEFAULT_REJECTION_BODY = `<p>Dear {{candidate_name}},</p>
<p>Thank you for your interest in the <strong>{{job_title}}</strong> position at <strong>{{company_name}}</strong> and for taking the time to go through our interview process.</p>
<p>After careful consideration, we regret to inform you that this position has been closed and we will not be proceeding further with applications at this time.</p>
<p>We truly appreciate the time and effort you invested in your application. We encourage you to apply for future openings that align with your skills and experience.</p>
<p>We wish you all the best in your career journey.</p>
<p>Warm regards,<br/>{{company_name}} Hiring Team</p>`

function substituteVariables(text: string, vars: Record<string, string>): string {
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
  const { jobId } = body as { jobId: string }

  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
  }

  // Get all active applications for this job
  const { data: activeApps, error: appsError } = await supabase
    .from('applications')
    .select('id')
    .eq('job_id', jobId)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .is('deleted_at', null)

  if (appsError) {
    return NextResponse.json({ error: appsError.message }, { status: 500 })
  }

  if (!activeApps || activeApps.length === 0) {
    return NextResponse.json({ success: true, rejected: 0 })
  }

  // Get the rejected stage for this job
  const { data: rejectedStage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('job_id', jobId)
    .eq('organization_id', orgId)
    .eq('stage_type', 'rejected')
    .single()

  const rejectedStageId = rejectedStage?.id

  // Reject all active applications
  let rejectedCount = 0
  for (const app of activeApps) {
    const { error } = await rejectApplication(
      supabase, app.id, orgId, 'Job closed/archived', user.id, rejectedStageId
    )
    if (!error) rejectedCount++
  }

  // Send rejection emails in background (fire and forget)
  sendBulkRejectionEmails(supabase, user.id, orgId, activeApps.map(a => a.id), companyName).catch((err) => {
    console.error('[Bulk Rejection Email Error]', err)
  })

  return NextResponse.json({ success: true, rejected: rejectedCount })
}

async function sendBulkRejectionEmails(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  orgId: string,
  applicationIds: string[],
  companyName: string
) {
  const adminSupabase = createAdminClient()

  // Get Gmail token once
  const tokenResult = await getValidAccessToken(supabase, userId, orgId)
  if (!tokenResult.accessToken) {
    console.error('[Bulk Rejection Email] No Gmail token available:', tokenResult.error)
    return
  }

  // Get rejection email template
  const { data: templates } = await getEmailTemplates(supabase, orgId, 'rejection')
  const template = templates && templates.length > 0 ? templates[0] : null

  // Process each application
  for (const appId of applicationIds) {
    try {
      const { data: app } = await adminSupabase
        .from('applications')
        .select(`
          id, candidate_id,
          candidate:candidates(id, first_name, last_name, email),
          job:jobs(id, title, department)
        `)
        .eq('id', appId)
        .eq('organization_id', orgId)
        .single()

      if (!app?.candidate || !app?.job) continue

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const candidate = app.candidate as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const job = app.job as any
      const candidateEmail = candidate.email
      if (!candidateEmail) continue

      const vars: Record<string, string> = {
        candidate_name: `${candidate.first_name} ${candidate.last_name}`.trim(),
        job_title: job.title || 'the position',
        company_name: companyName,
        department: job.department || '',
      }

      let subject: string
      let bodyHtml: string
      let templateId: string | undefined

      if (template) {
        subject = substituteVariables(template.subject, vars)
        bodyHtml = substituteVariables(template.body_html, vars)
        templateId = template.id
      } else {
        subject = substituteVariables(DEFAULT_REJECTION_SUBJECT, vars)
        bodyHtml = substituteVariables(DEFAULT_REJECTION_BODY, vars)
      }

      await sendGmailEmail(tokenResult.accessToken, {
        from: tokenResult.fromEmail,
        fromName: companyName,
        to: candidateEmail,
        subject,
        html: bodyHtml,
      })

      await logEmail(supabase, orgId, {
        candidate_id: candidate.id,
        application_id: appId,
        template_id: templateId,
        subject,
        body_html: bodyHtml,
        to_email: candidateEmail,
        from_email: tokenResult.fromEmail,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
    } catch (err) {
      console.error(`[Bulk Rejection Email] Failed for app ${appId}:`, err)
    }
  }
}
