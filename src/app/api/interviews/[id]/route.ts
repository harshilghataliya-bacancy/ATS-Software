import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateInterview, cancelInterview, getInterviewById } from '@/lib/services/interviews'
import { getValidAccessToken, sendGmailEmail } from '@/lib/services/gmail'
import { createCalendarEvent, deleteCalendarEvent } from '@/lib/services/google-calendar'
import { logActivity } from '@/lib/services/activity'
import { getOrCreateTemplate, renderEmail, buildDetailTable } from '@/lib/email-templates'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(isoString: string) {
  const d = new Date(isoString)
  const dateStr = d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' })
  const timeStr = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) + ' IST'
  return { dateStr, timeStr }
}

interface EmailRecipient { email: string; name?: string }

async function collectRecipients(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interview: any,
  orgId: string,
  schedulerEmail?: string,
  schedulerName?: string,
): Promise<EmailRecipient[]> {
  const recipients: EmailRecipient[] = []
  const seen = new Set<string>()

  // Candidate
  const cand = interview.application?.candidate
  if (cand?.email) {
    seen.add(cand.email.toLowerCase())
    recipients.push({ email: cand.email, name: `${cand.first_name} ${cand.last_name}` })
  }

  // Panelists — use admin client to bypass RLS and look up emails
  if (interview.interview_panelists?.length) {
    const adminSupabase = createAdminClient()
    const userIds = interview.interview_panelists.map((p: { user_id: string }) => p.user_id)
    const { data: { users } } = await adminSupabase.auth.admin.listUsers()

    for (const uid of userIds) {
      const authUser = users?.find((u) => u.id === uid)
      const email = authUser?.email
      if (email && !seen.has(email.toLowerCase())) {
        seen.add(email.toLowerCase())
        const name = authUser?.user_metadata?.full_name || email.split('@')[0]
        recipients.push({ email, name })
      }
    }
  }

  // Legacy interviewer_email
  if (interview.interviewer_email && !seen.has(interview.interviewer_email.toLowerCase())) {
    seen.add(interview.interviewer_email.toLowerCase())
    recipients.push({ email: interview.interviewer_email })
  }

  // Scheduler/recruiter who triggered the action
  if (schedulerEmail && !seen.has(schedulerEmail.toLowerCase())) {
    seen.add(schedulerEmail.toLowerCase())
    recipients.push({ email: schedulerEmail, name: schedulerName || schedulerEmail.split('@')[0] })
  }

  console.log(`[collectRecipients] Found ${recipients.length} recipients:`, recipients.map(r => r.email))
  return recipients
}

// ---------------------------------------------------------------------------
// PUT — Update interview + send update emails
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: interviewId } = await params
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
  const orgId = membership.organization_id

  // Fetch interview before update to detect changes
  const { data: oldInterview } = await getInterviewById(supabase, interviewId, orgId)
  if (!oldInterview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 })

  const body = await request.json()
  const {
    interview_type,
    scheduled_at,
    duration_minutes,
    location,
    meeting_link,
    notes,
  } = body

  const tokenResult = await getValidAccessToken(supabase, user.id, orgId)
  const candidate = oldInterview.application?.candidate
  const job = oldInterview.application?.job
  const candName = candidate ? `${candidate.first_name} ${candidate.last_name}` : 'Candidate'
  const isVideo = interview_type !== 'onsite'

  // Delete old calendar event if it exists
  if (oldInterview.google_calendar_event_id && tokenResult.accessToken) {
    try {
      await deleteCalendarEvent(tokenResult.accessToken, oldInterview.google_calendar_event_id)
    } catch (err) {
      console.error('[Interview Update] Failed to delete old calendar event:', err)
    }
  }

  // Create new calendar event for the updated interview
  let finalMeetingLink: string | null = meeting_link || null
  let newCalendarEventId: string | null = null

  if (tokenResult.accessToken) {
    try {
      const panelistEmails: string[] = []
      if (oldInterview.interview_panelists?.length) {
        const adminSupabase = createAdminClient()
        const { data: { users: allUsers } } = await adminSupabase.auth.admin.listUsers()
        for (const p of oldInterview.interview_panelists as { user_id: string }[]) {
          const authUser = allUsers?.find((u) => u.id === p.user_id)
          if (authUser?.email) panelistEmails.push(authUser.email)
        }
      }
      const attendees = [candidate?.email, user.email, ...panelistEmails].filter(Boolean) as string[]
      const calResult = await createCalendarEvent(tokenResult.accessToken, {
        summary: `Interview: ${candName} - ${job?.title || 'Position'}`,
        description: isVideo ? 'Video call interview' : `Face-to-face interview${location ? ` at ${location}` : ''}`,
        startDateTime: scheduled_at || oldInterview.scheduled_at,
        durationMinutes: duration_minutes || oldInterview.duration_minutes,
        attendees,
        location: !isVideo ? (location || undefined) : undefined,
        includeMeetLink: isVideo,
      })
      newCalendarEventId = calResult.eventId
      if (isVideo && calResult.meetLink) {
        finalMeetingLink = calResult.meetLink
      }
    } catch (err) {
      console.error('[Interview Update] Failed to create calendar event:', err)
    }
  }

  // Perform update
  const { error: updateError } = await updateInterview(supabase, interviewId, orgId, {
    interview_type,
    scheduled_at,
    duration_minutes,
    location: !isVideo ? (location || null) : null,
    meeting_link: isVideo ? finalMeetingLink : null,
    notes: notes || null,
  })

  // Store new calendar event ID
  if (newCalendarEventId) {
    await supabase.from('interviews').update({ google_calendar_event_id: newCalendarEventId }).eq('id', interviewId)
  } else if (oldInterview.google_calendar_event_id) {
    await supabase.from('interviews').update({ google_calendar_event_id: null }).eq('id', interviewId)
  }

  if (updateError) {
    return NextResponse.json({ error: updateError.message ?? 'Failed to update' }, { status: 500 })
  }

  // Fetch updated interview
  const { data: updatedInterview } = await getInterviewById(supabase, interviewId, orgId)
  if (!updatedInterview) {
    return NextResponse.json({ success: true })
  }

  // Get org info
  const { data: org } = await supabase.from('organizations').select('name, slug').eq('id', orgId).single()
  const companyName = org?.name || 'Our Company'
  const orgSlug = org?.slug || ''
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

  const updCandidate = updatedInterview.application?.candidate
  const updJob = updatedInterview.application?.job
  const candidateName = updCandidate ? `${updCandidate.first_name} ${updCandidate.last_name}` : 'Candidate'
  const jobTitle = updJob?.title || 'Position'
  const schedulerName = user.user_metadata?.full_name || user.email?.split('@')[0] || ''

  const { dateStr, timeStr } = formatDateTime(updatedInterview.scheduled_at)
  const updMeetLink = updatedInterview.meeting_link
  const interviewLocation = updatedInterview.location
  const publicJobUrl = orgSlug && job?.id ? `${appUrl}/careers/${orgSlug}/${job.id}` : null

  // Build detail table
  const detailTable = buildDetailTable([
    { label: 'Candidate', value: candidateName },
    { label: 'Job', value: jobTitle, href: publicJobUrl || undefined },
    { label: 'Interview Date & Time', value: `${dateStr} | ${timeStr}` },
    { label: 'Duration', value: `${updatedInterview.duration_minutes} minutes` },
    { label: 'Type', value: updatedInterview.interview_type === 'onsite' ? 'Face-to-Face' : 'Video Call' },
    { label: 'Location', value: interviewLocation || null },
    { label: 'Meeting Link', value: updMeetLink ? 'Join Meeting' : null, href: updMeetLink || undefined },
  ])

  const notesSection = updatedInterview.notes ? `<p><strong>Notes:</strong> ${updatedInterview.notes}</p>` : ''

  // Detect changes for activity log
  const changes: string[] = []
  if (oldInterview.interview_type !== updatedInterview.interview_type) {
    const oldType = oldInterview.interview_type === 'onsite' ? 'Face-to-Face' : 'Video Call'
    const newType = updatedInterview.interview_type === 'onsite' ? 'Face-to-Face' : 'Video Call'
    changes.push(`Type changed from ${oldType} to ${newType}`)
  }
  if (oldInterview.scheduled_at !== updatedInterview.scheduled_at) changes.push('Date/time has been updated')
  if (oldInterview.duration_minutes !== updatedInterview.duration_minutes) changes.push('Duration has been updated')
  if (oldInterview.location !== updatedInterview.location) changes.push('Location has been updated')
  if (oldInterview.meeting_link !== updatedInterview.meeting_link) changes.push('Meeting link has been updated')

  // Send update emails
  if (tokenResult.accessToken) {
    const fromEmail = tokenResult.fromEmail || user.email!
    const recipients = await collectRecipients(updatedInterview, orgId, user.email || '', schedulerName)

    const updateTemplate = await getOrCreateTemplate(supabase, orgId, 'interview_updated')
    const { subject: updateSubject, html: updateHtml } = renderEmail(updateTemplate, {
      candidate_name: candidateName,
      job_title: jobTitle,
      company_name: companyName,
      interview_date: dateStr,
      interview_time: timeStr,
      duration_minutes: String(updatedInterview.duration_minutes),
      interview_type: updatedInterview.interview_type === 'onsite' ? 'Face-to-Face' : 'Video Call',
      location: interviewLocation || '',
      meeting_link: updMeetLink || '',
      scheduler_name: `${schedulerName} (${user.email})`,
      notes: updatedInterview.notes || '',
      detail_table: detailTable,
      notes_section: notesSection,
    }, companyName)

    for (const r of recipients) {
      try {
        await sendGmailEmail(tokenResult.accessToken, {
          from: fromEmail,
          to: r.email,
          subject: updateSubject,
          html: updateHtml,
        })
        console.log(`[Interview Update Email] Sent to: ${r.email}`)
      } catch (err) {
        console.error(`[Interview Update Email Error] ${r.email}:`, err)
      }
    }
  }

  // Log activity
  logActivity(supabase, orgId, user.id, 'application', updatedInterview.application_id, 'interview_updated', {
    interview_id: interviewId,
    candidate_name: candidateName,
    changes,
  }).catch(() => {})

  return NextResponse.json({ success: true, data: updatedInterview })
}

// ---------------------------------------------------------------------------
// DELETE — Cancel interview + send cancellation emails
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: interviewId } = await params
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
  const orgId = membership.organization_id

  // Read optional cancellation reason from body
  let cancelReason: string | null = null
  try {
    const body = await request.json()
    cancelReason = body?.reason || null
  } catch {
    // No body — that's fine
  }

  // Fetch interview before cancelling
  const { data: interview } = await getInterviewById(supabase, interviewId, orgId)
  if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 })

  const candidate = interview.application?.candidate
  const job = interview.application?.job
  const candidateName = candidate ? `${candidate.first_name} ${candidate.last_name}` : 'Candidate'
  const jobTitle = job?.title || 'Position'

  // Cancel
  const { error: cancelError } = await cancelInterview(supabase, interviewId, orgId)
  if (cancelError) {
    return NextResponse.json({ error: cancelError.message ?? 'Failed to cancel' }, { status: 500 })
  }

  // Delete Google Calendar event if it exists
  if (interview.google_calendar_event_id) {
    try {
      const calTokenResult = await getValidAccessToken(supabase, user.id, orgId)
      if (calTokenResult.accessToken) {
        await deleteCalendarEvent(calTokenResult.accessToken, interview.google_calendar_event_id)
      }
    } catch (err) {
      console.error('[Calendar Event Delete Error]', err)
    }
  }

  // Get org info
  const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).single()
  const companyName = org?.name || 'Our Company'
  const schedulerName = user.user_metadata?.full_name || user.email?.split('@')[0] || ''

  const { dateStr, timeStr } = formatDateTime(interview.scheduled_at)

  // Build detail table for cancellation
  const detailTable = buildDetailTable([
    { label: 'Candidate', value: candidateName },
    { label: 'Position', value: `${jobTitle} at ${companyName}` },
    { label: 'Was Scheduled', value: `${dateStr} at ${timeStr}` },
    { label: 'Duration', value: `${interview.duration_minutes} minutes` },
  ])

  const reasonSection = cancelReason ? `<p><strong>Reason:</strong> ${cancelReason}</p>` : ''

  // Send cancellation emails
  const tokenResult = await getValidAccessToken(supabase, user.id, orgId)
  if (tokenResult.accessToken) {
    const fromEmail = tokenResult.fromEmail || user.email!
    const recipients = await collectRecipients(interview, orgId, user.email || '', schedulerName)

    const cancelTemplate = await getOrCreateTemplate(supabase, orgId, 'interview_cancelled')
    const { subject: cancelSubject, html: cancelHtml } = renderEmail(cancelTemplate, {
      candidate_name: candidateName,
      job_title: jobTitle,
      company_name: companyName,
      interview_date: dateStr,
      interview_time: timeStr,
      duration_minutes: String(interview.duration_minutes),
      scheduler_name: `${schedulerName} (${user.email})`,
      cancel_reason: cancelReason || '',
      detail_table: detailTable,
      reason_section: reasonSection,
    }, companyName)

    for (const r of recipients) {
      try {
        await sendGmailEmail(tokenResult.accessToken, {
          from: fromEmail,
          to: r.email,
          subject: cancelSubject,
          html: cancelHtml,
        })
        console.log(`[Interview Cancel Email] Sent to: ${r.email}`)
      } catch (err) {
        console.error(`[Interview Cancel Email Error] ${r.email}:`, err)
      }
    }
  }

  // Log activity
  logActivity(supabase, orgId, user.id, 'application', interview.application_id, 'interview_cancelled', {
    interview_id: interviewId,
    candidate_name: candidateName,
    job_title: jobTitle,
    reason: cancelReason,
  }).catch(() => {})

  return NextResponse.json({ success: true })
}
