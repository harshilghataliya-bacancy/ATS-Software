import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createInterview } from '@/lib/services/interviews'
import { moveApplication } from '@/lib/services/applications'
import { getValidAccessToken, sendGmailEmail } from '@/lib/services/gmail'
import { logEmail } from '@/lib/services/email'
import { logActivity } from '@/lib/services/activity'
import { getOrCreateTemplate, renderEmail, buildDetailTable } from '@/lib/email-templates'

async function autoInviteInterviewer(
  supabase: ReturnType<typeof createAdminClient>,
  email: string,
  orgId: string,
  companyName: string,
  accessToken: string | null,
  fromEmail: string,
  appUrl: string,
  senderName?: string,
  refreshToken?: string | null,
): Promise<string | null> {
  try {
    const { data: { users: allUsers } } = await supabase.auth.admin.listUsers()
    const existingAuthUser = allUsers?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    )

    let interviewerUserId: string | null = null
    const redirectTo = `${appUrl}/callback`

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        data: {
          full_name: existingAuthUser?.user_metadata?.full_name || email.split('@')[0],
          invited_to_org: orgId,
          invited_role: 'interviewer',
        },
        redirectTo,
      },
    })

    if (!linkError && linkData?.user) {
      interviewerUserId = linkData.user.id

      if (accessToken) {
        const inviteLink = linkData.properties.action_link
        // Use template system for invite email
        const inviteContent = `<p>Click the button below to accept your invitation and set up your account:</p>
<div style="margin:24px 0;">
  <a href="${inviteLink}" style="display:inline-block;background-color:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;">Accept Invitation</a>
</div>
<p style="color:#6b7280;font-size:13px;">If the button doesn't work, copy and paste this link:<br/><a href="${inviteLink}" style="color:#2563eb;word-break:break-all;">${inviteLink}</a></p>`

        const template = await getOrCreateTemplate(supabase, orgId, 'interviewer_invite')
        const { subject, html } = renderEmail(template, {
          company_name: companyName,
          invite_link: inviteLink,
          email,
          app_url: appUrl,
          invite_content: inviteContent,
        }, companyName)

        sendGmailEmail(accessToken, { from: fromEmail, fromName: senderName || companyName, to: email, subject, html, refreshToken: refreshToken || undefined })
          .catch((err) => console.error('[Invite email error]', err))
      }
    } else {
      if (existingAuthUser) {
        interviewerUserId = existingAuthUser.id
      } else {
        const tempPassword = `Temp${Date.now()}!${Math.random().toString(36).slice(2, 8)}`
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            full_name: email.split('@')[0],
            invited_to_org: orgId,
            invited_role: 'interviewer',
          },
        })

        if (!createError && newUser?.user) {
          interviewerUserId = newUser.user.id

          if (accessToken) {
            const inviteContent = `<p>An account has been created for you:</p>
<div style="background:#f3f4f6;padding:16px;border-radius:8px;margin:16px 0;">
  <p style="margin:0;"><strong>Email:</strong> ${email}</p>
  <p style="margin:8px 0 0 0;"><strong>Temporary Password:</strong> ${tempPassword}</p>
</div>
<p style="color:#dc2626;font-size:13px;">Please change your password after first login.</p>
<div style="margin:24px 0;">
  <a href="${appUrl}/login" style="display:inline-block;background-color:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;">Login to HireFlow</a>
</div>`

            const template = await getOrCreateTemplate(supabase, orgId, 'interviewer_invite')
            const { subject, html } = renderEmail(template, {
              company_name: companyName,
              email,
              temp_password: tempPassword,
              app_url: appUrl,
              invite_content: inviteContent,
            }, companyName)

            sendGmailEmail(accessToken, { from: fromEmail, fromName: senderName || companyName, to: email, subject, html, refreshToken: refreshToken || undefined })
              .catch((err) => console.error('[Credentials email error]', err))
          }
        } else {
          console.error('[Auto-create interviewer error]', createError)
        }
      }
    }

    if (interviewerUserId) {
      const { data: existingMember } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', orgId)
        .eq('user_id', interviewerUserId)
        .is('deleted_at', null)
        .maybeSingle()

      if (!existingMember) {
        await supabase.from('organization_members').insert({
          organization_id: orgId,
          user_id: interviewerUserId,
          role: 'interviewer',
          joined_at: new Date().toISOString(),
        })
      }
    }

    return interviewerUserId
  } catch (err) {
    console.error('[Auto-invite interviewer error]', err)
    return null
  }
}

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
  const {
    application_id,
    title: interviewTitle,
    interview_type,
    scheduled_at,
    duration_minutes = 60,
    interviewer_email,
    interviewer_emails,
    candidate_email,
    candidate_name,
    job_title,
    job_description,
    location: interviewLocation,
    notes,
    scorecard_id,
  } = body

  // Normalize to array — support both single email (legacy) and array
  const interviewerEmails: string[] = interviewer_emails
    ? (Array.isArray(interviewer_emails) ? interviewer_emails : [interviewer_emails])
    : (interviewer_email ? [interviewer_email] : [])

  if (!application_id || !interview_type || !scheduled_at) {
    return NextResponse.json(
      { error: 'application_id, interview_type, and scheduled_at are required' },
      { status: 400 }
    )
  }

  if (!candidate_email) {
    return NextResponse.json(
      { error: 'Candidate email is required to schedule an interview. Please add an email to the candidate profile first.' },
      { status: 400 }
    )
  }

  if (new Date(scheduled_at) < new Date()) {
    return NextResponse.json({ error: 'Cannot schedule an interview in the past' }, { status: 400 })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  for (const email of interviewerEmails) {
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: `Invalid interviewer email format: ${email}` }, { status: 400 })
    }
  }
  if (candidate_email && !emailRegex.test(candidate_email)) {
    return NextResponse.json({ error: 'Invalid candidate email format' }, { status: 400 })
  }

  // Get org name and slug for public job URL
  const { data: org } = await supabase
    .from('organizations')
    .select('name, slug')
    .eq('id', orgId)
    .single()

  const companyName = org?.name || 'Our Company'
  const orgSlug = org?.slug || ''

  // Get job_id + candidate resume from application
  const { data: appData } = await supabase
    .from('applications')
    .select('job_id, candidate_id, candidates(resume_url)')
    .eq('id', application_id)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidateResumeUrl: string | null = (appData as any)?.candidates?.resume_url || null

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  const publicJobUrl = orgSlug && appData?.job_id
    ? `${appUrl}/careers/${orgSlug}/${appData.job_id}`
    : null

  // Get scheduler's name for email signatures
  const schedulerEmail = user.email || ''
  const schedulerName = user.user_metadata?.full_name || schedulerEmail.split('@')[0]

  // Try to create Google Calendar event with Meet link
  let meetLink: string | null = null
  let calendarEventId: string | null = null

  const tokenResult = await getValidAccessToken(supabase, user.id, orgId)
  if (tokenResult.accessToken) {
    try {
      const { createCalendarEvent } = await import('@/lib/services/google-calendar')
      const isOnsite = interview_type === 'onsite'
      const attendees = Array.from(new Set([candidate_email, ...interviewerEmails, schedulerEmail].filter(Boolean)))
      const jobDescSnippet = job_description
        ? `\n\nJob Description:\n${job_description.replace(/<[^>]*>/g, '').slice(0, 500)}`
        : ''
      const jobUrlSnippet = publicJobUrl ? `\nJob Posting: ${publicJobUrl}` : ''
      const result = await createCalendarEvent(tokenResult.accessToken, {
        summary: interviewTitle ? `${interviewTitle}: ${candidate_name} - ${job_title}` : `Interview: ${candidate_name} - ${job_title}`,
        description: [
          `Interview for ${job_title} at ${companyName}`,
          `Candidate: ${candidate_name}`,
          `Scheduled by: ${schedulerName} (${schedulerEmail})`,
          `Type: ${interview_type}`,
          isOnsite && interviewLocation ? `Location: ${interviewLocation}` : '',
          notes ? `\nNotes: ${notes}` : '',
          jobUrlSnippet,
          jobDescSnippet,
        ].filter(Boolean).join('\n'),
        startDateTime: scheduled_at,
        durationMinutes: duration_minutes,
        attendees,
        location: isOnsite ? interviewLocation : undefined,
        includeMeetLink: !isOnsite,
      })
      meetLink = result.meetLink
      calendarEventId = result.eventId
    } catch (err) {
      console.error('[Calendar Event Error]', err)
    }
  }

  // Build panelists: scheduler (lead) + all interviewers
  const panelists: Array<{ user_id: string; role: string }> = [
    { user_id: user.id, role: 'lead' },
  ]

  // Look up all org members to match interviewer emails
  const { data: orgMembers } = await supabase
    .from('organization_members')
    .select('user_id, user:user_id(email)')
    .eq('organization_id', orgId)
    .is('deleted_at', null)

  const fromEmail = tokenResult.fromEmail || user.email!

  for (const email of interviewerEmails) {
    const matchedMember = orgMembers?.find(
      (m: Record<string, unknown>) => {
        const u = m.user as Record<string, unknown> | null
        return u?.email?.toString().toLowerCase() === email.toLowerCase()
      }
    )

    if (matchedMember && matchedMember.user_id !== user.id) {
      panelists.push({ user_id: matchedMember.user_id, role: 'interviewer' })
    } else if (matchedMember && matchedMember.user_id === user.id) {
      // Scheduler is already added as lead, skip
    } else {
      // Auto-invite
      const adminSupabase = createAdminClient()
      const userId = await autoInviteInterviewer(
        adminSupabase,
        email,
        orgId,
        companyName,
        tokenResult.accessToken,
        fromEmail,
        appUrl,
        tokenResult.displayName || undefined,
        tokenResult.refreshToken,
      )
      if (userId) {
        panelists.push({ user_id: userId, role: 'interviewer' })
      }
    }
  }

  // Create interview record
  const { data: interview, error: interviewError } = await createInterview(
    supabase,
    orgId,
    {
      application_id,
      title: interviewTitle || undefined,
      interview_type,
      scheduled_at,
      duration_minutes,
      location: interviewLocation || undefined,
      meeting_link: meetLink || undefined,
      notes: notes || undefined,
      interviewer_email: interviewerEmails[0] || undefined,
      scorecard_id: scorecard_id || undefined,
      panelists,
    },
    user.id
  )

  if (interviewError) {
    return NextResponse.json(
      { error: interviewError.message ?? 'Failed to create interview' },
      { status: 500 }
    )
  }

  // Store calendar event ID if we have one
  if (calendarEventId && interview?.id) {
    await supabase
      .from('interviews')
      .update({ google_calendar_event_id: calendarEventId })
      .eq('id', interview.id)
  }

  // --- Build shared variables for email templates ---
  const scheduledDate = new Date(scheduled_at)
  const dateStr = scheduledDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' })
  const timeStr = scheduledDate.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) + ' IST'

  // Detail table for CANDIDATE email (no panel members)
  const candidateDetailTable = buildDetailTable([
    { label: 'Job', value: job_title, href: publicJobUrl || undefined },
    { label: 'Interview Date & Time', value: `${dateStr} | ${timeStr}` },
    { label: 'Duration', value: `${duration_minutes} minutes` },
    { label: 'Type', value: interview_type === 'onsite' ? 'Face-to-Face' : interview_type },
    { label: 'Location', value: interviewLocation || null },
    { label: 'Meeting Link', value: meetLink ? 'Join Meeting' : null, href: meetLink || undefined },
  ])

  // Detail table for INTERVIEWER email (includes panel members)
  const interviewerDetailTable = buildDetailTable([
    { label: 'Candidate', value: candidate_name },
    { label: 'Job', value: job_title, href: publicJobUrl || undefined },
    { label: 'Interview Date & Time', value: `${dateStr} | ${timeStr}` },
    { label: 'Duration', value: `${duration_minutes} minutes` },
    { label: 'Type', value: interview_type === 'onsite' ? 'Face-to-Face' : interview_type },
    { label: 'Location', value: interviewLocation || null },
    { label: 'Meeting Link', value: meetLink ? 'Join Meeting' : null, href: meetLink || undefined },
    { label: 'Panel Members', value: interviewerEmails.length > 1 ? interviewerEmails.join(', ') : null },
  ])

  const notesSection = notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''

  const viewInterviewLink = interview?.id ? `${appUrl}/interviews/${interview.id}` : ''

  // Shared vars for candidate email
  const candidateVars: Record<string, string> = {
    candidate_name,
    candidate_email: candidate_email || '',
    job_title,
    company_name: companyName,
    interview_date: dateStr,
    interview_time: timeStr,
    duration_minutes: String(duration_minutes),
    interview_type: interview_type === 'onsite' ? 'Face-to-Face' : interview_type,
    location: interviewLocation || '',
    meeting_link: meetLink || '',
    scheduler_name: `${schedulerName} (${schedulerEmail})`,
    panel_members: '',
    notes: notes || '',
    detail_table: candidateDetailTable,
    notes_section: notesSection,
    view_interview_link: viewInterviewLink,
  }

  // Shared vars for interviewer email
  const interviewerVars: Record<string, string> = {
    candidate_name,
    candidate_email: candidate_email || '',
    job_title,
    company_name: companyName,
    interview_date: dateStr,
    interview_time: timeStr,
    duration_minutes: String(duration_minutes),
    interview_type: interview_type === 'onsite' ? 'Face-to-Face' : interview_type,
    location: interviewLocation || '',
    meeting_link: meetLink || '',
    scheduler_name: `${schedulerName} (${schedulerEmail})`,
    panel_members: interviewerEmails.join(', '),
    notes: notes || '',
    detail_table: interviewerDetailTable,
    notes_section: notesSection,
    view_interview_link: viewInterviewLink,
  }

  // --- Fetch candidate resume for attachment ---
  let resumeAttachment: { filename: string; content: Buffer | Uint8Array; contentType: string } | null = null
  if (candidateResumeUrl) {
    try {
      const res = await fetch(candidateResumeUrl)
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer())
        const urlPath = new URL(candidateResumeUrl).pathname
        const ext = urlPath.split('.').pop() || 'pdf'
        const safeName = candidate_name.replace(/[^a-zA-Z0-9]/g, '_')
        resumeAttachment = {
          filename: `${safeName}_Resume.${ext}`,
          content: buffer,
          contentType: ext === 'pdf' ? 'application/pdf' : 'application/octet-stream',
        }
      }
    } catch (err) {
      console.error('[Resume fetch for attachment]', err)
    }
  }

  // --- Email to candidate (no panel members, recruiter in CC) ---
  if (tokenResult.accessToken && candidate_email) {
    try {
      const candidateTemplate = await getOrCreateTemplate(supabase, orgId, 'interview_scheduled')
      const { subject: candidateSubject, html: candidateHtml } = renderEmail(candidateTemplate, candidateVars, companyName)

      await sendGmailEmail(tokenResult.accessToken, {
        from: fromEmail,
        fromName: tokenResult.displayName || companyName,
        to: candidate_email,
        cc: schedulerEmail !== candidate_email ? schedulerEmail : undefined,
        subject: candidateSubject,
        html: candidateHtml,
        refreshToken: tokenResult.refreshToken,
      })
      logEmail(supabase, orgId, {
        candidate_id: interview.application?.candidate?.id ?? '',
        application_id,
        subject: candidateSubject,
        body_html: candidateHtml,
        to_email: candidate_email,
        from_email: fromEmail,
        status: 'sent',
        sent_at: new Date().toISOString(),
      }).catch((err) => console.error('[Email log error]', err))
    } catch (err) {
      console.error('[Candidate Email Error]', err)
    }
  }

  // --- Email to ALL interviewers (recruiter in CC, resume attached) ---
  if (tokenResult.accessToken) {
    const interviewerTemplate = await getOrCreateTemplate(supabase, orgId, 'interview_scheduled_interviewer')
    const { subject: interviewerSubject, html: interviewerHtml } = renderEmail(interviewerTemplate, interviewerVars, companyName)

    try {
      await sendGmailEmail(tokenResult.accessToken, {
        from: fromEmail,
        fromName: tokenResult.displayName || companyName,
        to: interviewerEmails.join(', '),
        subject: interviewerSubject,
        html: interviewerHtml,
        attachments: resumeAttachment ? [resumeAttachment] : undefined,
        refreshToken: tokenResult.refreshToken,
      })
      console.log(`[Interview Email] Sent to interviewers: ${interviewerEmails.join(', ')}`)
    } catch (err) {
      console.error('[Interviewer Email Error]', err)
    }
  }

  // Log activity (fire-and-forget)
  logActivity(
    supabase,
    orgId,
    user.id,
    'application',
    application_id,
    'interview_scheduled',
    {
      interview_id: interview.id,
      candidate_name,
      job_title,
      interview_type,
      scheduled_at,
      meeting_link: meetLink,
      interviewer_count: interviewerEmails.length,
    }
  ).catch((err: unknown) => console.error('[Activity Log Error]', err))

  // Auto-advance to 'interview' stage if not already past it
  try {
    const { data: appWithStage } = await supabase
      .from('applications')
      .select('job_id, current_stage_id, pipeline_stages:current_stage_id(display_order)')
      .eq('id', application_id)
      .single()

    if (appWithStage) {
      const { data: interviewStage } = await supabase
        .from('pipeline_stages')
        .select('id, display_order')
        .eq('job_id', appWithStage.job_id)
        .eq('stage_type', 'interview')
        .maybeSingle()

      if (interviewStage) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const currentOrder = (appWithStage.pipeline_stages as any)?.display_order ?? -1
        if (currentOrder < interviewStage.display_order) {
          await moveApplication(supabase, application_id, orgId, interviewStage.id, user.id)
        }
      }
    }
  } catch { /* silently skip stage advance */ }

  return NextResponse.json({ success: true, data: interview })
}
