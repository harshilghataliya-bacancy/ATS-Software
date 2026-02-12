import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createInterview } from '@/lib/services/interviews'
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
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  const orgId = membership.organization_id

  const body = await request.json()
  const {
    application_id,
    interview_type,
    scheduled_at,
    duration_minutes = 60,
    interviewer_email,
    candidate_email,
    candidate_name,
    job_title,
    notes,
  } = body

  if (!application_id || !interview_type || !scheduled_at) {
    return NextResponse.json(
      { error: 'application_id, interview_type, and scheduled_at are required' },
      { status: 400 }
    )
  }

  // Get org name
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single()

  const companyName = org?.name || 'Our Company'

  // Try to create Google Calendar event with Meet link
  let meetLink: string | null = null
  let calendarEventId: string | null = null

  const tokenResult = await getValidAccessToken(supabase, user.id, orgId)
  if (tokenResult.accessToken) {
    try {
      const attendees = [candidate_email, interviewer_email].filter(Boolean) as string[]
      const result = await createCalendarEvent(tokenResult.accessToken, {
        summary: `Interview: ${candidate_name} - ${job_title}`,
        description: [
          `Interview for ${job_title} at ${companyName}`,
          `Candidate: ${candidate_name}`,
          `Type: ${interview_type}`,
          notes ? `\nNotes: ${notes}` : '',
        ].filter(Boolean).join('\n'),
        startDateTime: scheduled_at,
        durationMinutes: duration_minutes,
        attendees,
      })
      meetLink = result.meetLink
      calendarEventId = result.eventId
    } catch (err) {
      console.error('[Calendar Event Error]', err)
      // Continue without calendar — graceful fallback
    }
  }

  // Create interview record
  const { data: interview, error: interviewError } = await createInterview(
    supabase,
    orgId,
    {
      application_id,
      interview_type,
      scheduled_at,
      duration_minutes,
      meeting_link: meetLink || undefined,
      notes: notes || undefined,
      panelists: [{ user_id: user.id, role: 'interviewer' }],
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
  const dateStr = scheduledDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = scheduledDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const meetInfo = meetLink ? `<p><strong>Meeting Link:</strong> <a href="${meetLink}">${meetLink}</a></p>` : ''

  if (tokenResult.accessToken && candidate_email) {
    try {
      const candidateHtml = `
        <p>Dear ${candidate_name},</p>
        <p>You have been scheduled for an interview for the <strong>${job_title}</strong> position at <strong>${companyName}</strong>.</p>
        <p><strong>Date:</strong> ${dateStr}<br/><strong>Time:</strong> ${timeStr}<br/><strong>Duration:</strong> ${duration_minutes} minutes<br/><strong>Type:</strong> ${interview_type}</p>
        ${meetInfo}
        ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
        <p>Best regards,<br/>${companyName}</p>
      `
      const candidateSubject = `Interview Scheduled: ${job_title} at ${companyName}`

      await sendGmailEmail(tokenResult.accessToken, {
        from: fromEmail,
        to: candidate_email,
        subject: candidateSubject,
        html: candidateHtml,
      })

      await logEmail(supabase, orgId, {
        candidate_id: interview.application?.candidate?.id ?? '',
        application_id,
        subject: candidateSubject,
        body_html: candidateHtml,
        to_email: candidate_email,
        from_email: fromEmail,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
    } catch (err) {
      console.error('[Candidate Email Error]', err)
    }
  }

  if (tokenResult.accessToken && interviewer_email) {
    try {
      const interviewerHtml = `
        <p>You have been scheduled to interview <strong>${candidate_name}</strong> for the <strong>${job_title}</strong> position.</p>
        <p><strong>Date:</strong> ${dateStr}<br/><strong>Time:</strong> ${timeStr}<br/><strong>Duration:</strong> ${duration_minutes} minutes<br/><strong>Type:</strong> ${interview_type}</p>
        ${meetInfo}
        ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
      `
      await sendGmailEmail(tokenResult.accessToken, {
        from: fromEmail,
        to: interviewer_email,
        subject: `Interview: ${candidate_name} - ${job_title}`,
        html: interviewerHtml,
      })
    } catch (err) {
      console.error('[Interviewer Email Error]', err)
    }
  }

  // Log activity
  await logActivity(
    supabase,
    orgId,
    user.id,
    'interview',
    interview.id,
    'interview_scheduled',
    {
      candidate_name,
      job_title,
      interview_type,
      scheduled_at,
      meeting_link: meetLink,
    }
  )

  return NextResponse.json({ success: true, data: interview })
}
