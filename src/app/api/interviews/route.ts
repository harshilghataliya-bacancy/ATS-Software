import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createInterview } from '@/lib/services/interviews'
import { moveApplication } from '@/lib/services/applications'
import { getValidAccessToken, sendGmailEmail } from '@/lib/services/gmail'
import { createCalendarEvent } from '@/lib/services/google-calendar'
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
  const {
    application_id,
    title: interviewTitle,
    interview_type,
    scheduled_at,
    duration_minutes = 60,
    interviewer_email,
    candidate_email,
    candidate_name,
    job_title,
    location: interviewLocation,
    notes,
    scorecard_id,
  } = body

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

  // Reject past scheduled times (must check before creating anything)
  if (new Date(scheduled_at) < new Date()) {
    return NextResponse.json({ error: 'Cannot schedule an interview in the past' }, { status: 400 })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (interviewer_email && !emailRegex.test(interviewer_email)) {
    return NextResponse.json({ error: 'Invalid interviewer email format' }, { status: 400 })
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

  // Get job_id from application for public job URL
  const { data: appData } = await supabase
    .from('applications')
    .select('job_id')
    .eq('id', application_id)
    .single()

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  const publicJobUrl = orgSlug && appData?.job_id
    ? `${appUrl}/careers/${orgSlug}/${appData.job_id}`
    : null

  // Try to create Google Calendar event with Meet link
  let meetLink: string | null = null
  let calendarEventId: string | null = null

  const tokenResult = await getValidAccessToken(supabase, user.id, orgId)
  if (tokenResult.accessToken) {
    try {
      const isOnsite = interview_type === 'onsite'
      const attendees = [candidate_email, interviewer_email].filter(Boolean) as string[]
      const result = await createCalendarEvent(tokenResult.accessToken, {
        summary: interviewTitle ? `${interviewTitle}: ${candidate_name} - ${job_title}` : `Interview: ${candidate_name} - ${job_title}`,
        description: [
          `Interview for ${job_title} at ${companyName}`,
          `Candidate: ${candidate_name}`,
          `Type: ${interview_type}`,
          isOnsite && interviewLocation ? `Location: ${interviewLocation}` : '',
          notes ? `\nNotes: ${notes}` : '',
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
      // Continue without calendar — graceful fallback
    }
  }

  // Build panelists: scheduler (lead) + interviewer (if found by email)
  const panelists: Array<{ user_id: string; role: string }> = [
    { user_id: user.id, role: 'lead' },
  ]

  if (interviewer_email) {
    // Look up interviewer by email in auth.users via organization_members
    const { data: interviewerMember } = await supabase
      .from('organization_members')
      .select('user_id, user:user_id(email)')
      .eq('organization_id', orgId)
      .is('deleted_at', null)

    const matchedMember = interviewerMember?.find(
      (m: Record<string, unknown>) => {
        const u = m.user as Record<string, unknown> | null
        return u?.email?.toString().toLowerCase() === interviewer_email.toLowerCase()
      }
    )

    if (matchedMember && matchedMember.user_id !== user.id) {
      panelists.push({ user_id: matchedMember.user_id, role: 'interviewer' })
    } else if (!matchedMember) {
      // Auto-invite interviewer: add to org members + send invite email
      try {
        const adminSupabase = createAdminClient()
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

        // Check if user already exists in auth
        const { data: { users: allUsers } } = await adminSupabase.auth.admin.listUsers()
        const existingAuthUser = allUsers?.find(
          (u) => u.email?.toLowerCase() === interviewer_email.toLowerCase()
        )

        let interviewerUserId: string | null = null
        const redirectTo = `${appUrl}/callback`

        // Generate invite link — works for both new and existing users
        const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
          type: 'invite',
          email: interviewer_email,
          options: {
            data: {
              full_name: existingAuthUser?.user_metadata?.full_name || interviewer_email.split('@')[0],
              invited_to_org: orgId,
              invited_role: 'interviewer',
            },
            redirectTo,
          },
        })

        if (!linkError && linkData?.user) {
          interviewerUserId = linkData.user.id

          // Send "Accept Invitation" email with set-password link
          if (tokenResult.accessToken) {
            const inviteLink = linkData.properties.action_link
            sendGmailEmail(tokenResult.accessToken, {
              from: tokenResult.fromEmail || user.email!,
              to: interviewer_email,
              subject: `You're invited to join ${companyName} on HireFlow`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2>You're invited to join ${companyName}!</h2>
                  <p>You have been invited to join <strong>${companyName}</strong> on HireFlow as an <strong>Interviewer</strong>.</p>
                  <p>Click the button below to accept your invitation and set up your account:</p>
                  <div style="margin: 24px 0;">
                    <a href="${inviteLink}"
                       style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                      Accept Invitation
                    </a>
                  </div>
                  <p style="color: #6b7280; font-size: 14px;">If the button doesn&rsquo;t work, copy and paste this link into your browser:</p>
                  <p style="color: #6b7280; font-size: 14px; word-break: break-all;">${inviteLink}</p>
                </div>
              `,
            }).catch((err) => console.error('[Invite email error]', err))
          }
        } else {
          // Fallback: if generateLink fails, create user with temp password
          if (existingAuthUser) {
            interviewerUserId = existingAuthUser.id
          } else {
            const tempPassword = `Temp${Date.now()}!${Math.random().toString(36).slice(2, 8)}`
            const { data: newUser, error: createError } = await adminSupabase.auth.admin.createUser({
              email: interviewer_email,
              password: tempPassword,
              email_confirm: true,
              user_metadata: {
                full_name: interviewer_email.split('@')[0],
                invited_to_org: orgId,
                invited_role: 'interviewer',
              },
            })

            if (!createError && newUser?.user) {
              interviewerUserId = newUser.user.id

              if (tokenResult.accessToken) {
                sendGmailEmail(tokenResult.accessToken, {
                  from: tokenResult.fromEmail || user.email!,
                  to: interviewer_email,
                  subject: `You've been invited to ${companyName} on HireFlow`,
                  html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                      <h2>Welcome to ${companyName}!</h2>
                      <p>You have been invited to join <strong>${companyName}</strong> on HireFlow as an <strong>Interviewer</strong>.</p>
                      <p>An account has been created for you:</p>
                      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
                        <p style="margin: 0;"><strong>Email:</strong> ${interviewer_email}</p>
                        <p style="margin: 8px 0 0 0;"><strong>Temporary Password:</strong> ${tempPassword}</p>
                      </div>
                      <p style="color: #dc2626; font-size: 14px;">Please change your password after first login.</p>
                      <div style="margin: 24px 0;">
                        <a href="${appUrl}/login"
                           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                          Login to HireFlow
                        </a>
                      </div>
                    </div>
                  `,
                }).catch((err) => console.error('[Credentials email error]', err))
              }
            } else {
              console.error('[Auto-create interviewer error]', createError)
            }
          }
        }

        if (interviewerUserId) {
          // Add to org members if not already a member
          const { data: existingMember } = await adminSupabase
            .from('organization_members')
            .select('id')
            .eq('organization_id', orgId)
            .eq('user_id', interviewerUserId)
            .is('deleted_at', null)
            .maybeSingle()

          if (!existingMember) {
            await adminSupabase.from('organization_members').insert({
              organization_id: orgId,
              user_id: interviewerUserId,
              role: 'interviewer',
              joined_at: new Date().toISOString(),
            })
          }

          panelists.push({ user_id: interviewerUserId, role: 'interviewer' })
        }
      } catch (err) {
        console.error('[Auto-invite interviewer error]', err)
        // Continue without adding them as panelist - graceful fallback
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
      interviewer_email: interviewer_email || undefined,
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

  // Send emails via Gmail (best effort)
  const fromEmail = tokenResult.fromEmail || user.email!
  const scheduledDate = new Date(scheduled_at)
  const dateStr = scheduledDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' })
  const timeStr = scheduledDate.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) + ' IST'
  const meetInfo = meetLink ? `<p><strong>Meeting Link:</strong> <a href="${meetLink}">${meetLink}</a></p>` : ''
  const locationInfo = interviewLocation ? `<p><strong>Location:</strong> ${interviewLocation}</p>` : ''

  if (tokenResult.accessToken && candidate_email) {
    const jobUrlInfo = publicJobUrl
      ? `<p><strong>Job Details:</strong> <a href="${publicJobUrl}">View Job Posting</a></p>`
      : ''

    const candidateHtml = `
      <p>Dear ${candidate_name},</p>
      <p>You have been scheduled for an interview for the <strong>${job_title}</strong> position at <strong>${companyName}</strong>.</p>
      <p><strong>Date:</strong> ${dateStr}<br/><strong>Time:</strong> ${timeStr}<br/><strong>Duration:</strong> ${duration_minutes} minutes<br/><strong>Type:</strong> ${interview_type}</p>
      ${locationInfo}
      ${meetInfo}
      ${jobUrlInfo}
      ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
      <p>Best regards,<br/>${companyName}</p>
    `
    const candidateSubject = `Interview Scheduled: ${job_title} at ${companyName}`

    // Fire-and-forget: send email in background
    sendGmailEmail(tokenResult.accessToken, {
      from: fromEmail,
      to: candidate_email,
      subject: candidateSubject,
      html: candidateHtml,
    }).then(() =>
      logEmail(supabase, orgId, {
        candidate_id: interview.application?.candidate?.id ?? '',
        application_id,
        subject: candidateSubject,
        body_html: candidateHtml,
        to_email: candidate_email,
        from_email: fromEmail,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
    ).catch((err) => console.error('[Candidate Email Error]', err))
  }

  if (tokenResult.accessToken && interviewer_email) {
    try {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

      const interviewerHtml = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2>Interview Assignment</h2>
          <p>You have been scheduled to interview <strong>${candidate_name}</strong> for the <strong>${job_title}</strong> position at <strong>${companyName}</strong>.</p>
          <h3>Interview Details</h3>
          <p><strong>Date:</strong> ${dateStr}<br/><strong>Time:</strong> ${timeStr}<br/><strong>Duration:</strong> ${duration_minutes} minutes<br/><strong>Type:</strong> ${interview_type}</p>
          ${locationInfo}
          ${meetInfo}
          ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
          <h3>Candidate Details</h3>
          <p><strong>Name:</strong> ${candidate_name}<br/><strong>Email:</strong> ${candidate_email || 'N/A'}<br/><strong>Position:</strong> ${job_title}</p>
          <p><a href="${appUrl}/interviews" style="background-color:#2563eb;color:white;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;">View in HireFlow</a></p>
        </div>
      `
      // Fire-and-forget: send interview details email
      sendGmailEmail(tokenResult.accessToken, {
        from: fromEmail,
        to: interviewer_email,
        subject: `Interview Assignment: ${candidate_name} - ${job_title}`,
        html: interviewerHtml,
      }).catch((err) => console.error('[Interviewer Email Error]', err))
    } catch (err) {
      console.error('[Interviewer Email Setup Error]', err)
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
