import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateInterview, cancelInterview, getInterviewById } from '@/lib/services/interviews'
import { getValidAccessToken, sendGmailEmail } from '@/lib/services/gmail'
import { createCalendarEvent, deleteCalendarEvent } from '@/lib/services/google-calendar'
import { logActivity } from '@/lib/services/activity'
import { logEmail } from '@/lib/services/email'
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

  // Send update emails: 1 to candidate (CC recruiter), 1 to all interviewers
  if (tokenResult.accessToken) {
    const fromEmail = tokenResult.fromEmail || user.email!
    const schedulerEmail = user.email || ''

    const updateTemplate = await getOrCreateTemplate(supabase, orgId, 'interview_updated')
    const viewInterviewLink = `${appUrl}/interviews/${interviewId}`
    const baseUpdateVars = {
      candidate_name: candidateName,
      job_title: jobTitle,
      company_name: companyName,
      interview_date: dateStr,
      interview_time: timeStr,
      duration_minutes: String(updatedInterview.duration_minutes),
      interview_type: updatedInterview.interview_type === 'onsite' ? 'Face-to-Face' : 'Video Call',
      location: interviewLocation || '',
      meeting_link: updMeetLink || '',
      scheduler_name: `${schedulerName} (${schedulerEmail})`,
      notes: updatedInterview.notes || '',
      detail_table: detailTable,
      notes_section: notesSection,
    }
    // Candidate email: no view button
    const { subject: updateSubject, html: candidateUpdateHtml } = renderEmail(updateTemplate, { ...baseUpdateVars, view_interview_link: '' }, companyName)
    // Interviewer email: with view button
    const { html: interviewerUpdateHtml } = renderEmail(updateTemplate, { ...baseUpdateVars, view_interview_link: viewInterviewLink }, companyName)

    // Email 1: To candidate, CC recruiter
    const candidateEmail = updCandidate?.email
    if (candidateEmail) {
      try {
        await sendGmailEmail(tokenResult.accessToken, {
          from: fromEmail,
          fromName: tokenResult.displayName || companyName,
          to: candidateEmail,
          cc: schedulerEmail !== candidateEmail ? schedulerEmail : undefined,
          subject: updateSubject,
          html: candidateUpdateHtml,
          refreshToken: tokenResult.refreshToken,
        })
        console.log(`[Interview Update Email] Sent to candidate: ${candidateEmail}`)
        logEmail(supabase, orgId, {
          candidate_id: updatedInterview.application?.candidate_id || updCandidate?.id || '',
          application_id: updatedInterview.application_id,
          subject: updateSubject,
          body_html: candidateUpdateHtml,
          to_email: candidateEmail,
          from_email: fromEmail,
          status: 'sent',
          sent_at: new Date().toISOString(),
        }).catch(() => {})
      } catch (err) {
        console.error('[Interview Update Email - Candidate]', err)
      }
    }

    // Email 2: To interviewers only (exclude lead/recruiter)
    const interviewerEmails: string[] = []
    if (updatedInterview.interview_panelists?.length) {
      const adminSupabase = createAdminClient()
      const { data: { users } } = await adminSupabase.auth.admin.listUsers()
      for (const p of updatedInterview.interview_panelists as { user_id: string; role: string }[]) {
        if (p.role === 'lead') continue
        const authUser = users?.find((u) => u.id === p.user_id)
        if (authUser?.email && authUser.email.toLowerCase() !== candidateEmail?.toLowerCase() && authUser.email.toLowerCase() !== schedulerEmail.toLowerCase()) {
          interviewerEmails.push(authUser.email)
        }
      }
    }
    if (updatedInterview.interviewer_email && !interviewerEmails.includes(updatedInterview.interviewer_email) && updatedInterview.interviewer_email.toLowerCase() !== schedulerEmail.toLowerCase()) {
      interviewerEmails.push(updatedInterview.interviewer_email)
    }

    if (interviewerEmails.length > 0) {
      try {
        await sendGmailEmail(tokenResult.accessToken, {
          from: fromEmail,
          fromName: tokenResult.displayName || companyName,
          to: interviewerEmails.join(', '),
          subject: updateSubject,
          html: interviewerUpdateHtml,
          refreshToken: tokenResult.refreshToken,
        })
        console.log(`[Interview Update Email] Sent to interviewers: ${interviewerEmails.join(', ')}`)
      } catch (err) {
        console.error('[Interview Update Email - Interviewers]', err)
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
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
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

  // Send cancellation emails: 1 to candidate (CC recruiter), 1 to all interviewers
  const tokenResult = await getValidAccessToken(supabase, user.id, orgId)
  if (tokenResult.accessToken) {
    const fromEmail = tokenResult.fromEmail || user.email!
    const schedulerEmail = user.email || ''

    const viewInterviewLink = `${appUrl}/interviews/${interviewId}`
    const cancelTemplate = await getOrCreateTemplate(supabase, orgId, 'interview_cancelled')
    const baseCancelVars = {
      candidate_name: candidateName,
      job_title: jobTitle,
      company_name: companyName,
      interview_date: dateStr,
      interview_time: timeStr,
      duration_minutes: String(interview.duration_minutes),
      scheduler_name: `${schedulerName} (${schedulerEmail})`,
      cancel_reason: cancelReason || '',
      detail_table: detailTable,
      reason_section: reasonSection,
    }
    // Candidate email: no view button
    const { subject: cancelSubject, html: candidateCancelHtml } = renderEmail(cancelTemplate, { ...baseCancelVars, view_interview_link: '' }, companyName)
    // Interviewer email: with view button
    const { html: interviewerCancelHtml } = renderEmail(cancelTemplate, { ...baseCancelVars, view_interview_link: viewInterviewLink }, companyName)

    // Email 1: To candidate, CC recruiter
    const candidateEmail = candidate?.email
    if (candidateEmail) {
      try {
        await sendGmailEmail(tokenResult.accessToken, {
          from: fromEmail,
          fromName: tokenResult.displayName || companyName,
          to: candidateEmail,
          cc: schedulerEmail !== candidateEmail ? schedulerEmail : undefined,
          subject: cancelSubject,
          html: candidateCancelHtml,
          refreshToken: tokenResult.refreshToken,
        })
        console.log(`[Interview Cancel Email] Sent to candidate: ${candidateEmail}`)
        logEmail(supabase, orgId, {
          candidate_id: interview.application?.candidate_id || candidate?.id || '',
          application_id: interview.application_id,
          subject: cancelSubject,
          body_html: candidateCancelHtml,
          to_email: candidateEmail,
          from_email: fromEmail,
          status: 'sent',
          sent_at: new Date().toISOString(),
        }).catch(() => {})
      } catch (err) {
        console.error('[Interview Cancel Email - Candidate]', err)
      }
    }

    // Email 2: To interviewers only (exclude lead/recruiter)
    const interviewerEmails: string[] = []
    if (interview.interview_panelists?.length) {
      const adminSupabase = createAdminClient()
      const { data: { users } } = await adminSupabase.auth.admin.listUsers()
      for (const p of interview.interview_panelists as { user_id: string; role: string }[]) {
        if (p.role === 'lead') continue
        const authUser = users?.find((u) => u.id === p.user_id)
        if (authUser?.email && authUser.email.toLowerCase() !== candidateEmail?.toLowerCase() && authUser.email.toLowerCase() !== schedulerEmail.toLowerCase()) {
          interviewerEmails.push(authUser.email)
        }
      }
    }
    if (interview.interviewer_email && !interviewerEmails.includes(interview.interviewer_email) && interview.interviewer_email.toLowerCase() !== schedulerEmail.toLowerCase()) {
      interviewerEmails.push(interview.interviewer_email)
    }

    if (interviewerEmails.length > 0) {
      try {
        await sendGmailEmail(tokenResult.accessToken, {
          from: fromEmail,
          fromName: tokenResult.displayName || companyName,
          to: interviewerEmails.join(', '),
          subject: cancelSubject,
          html: interviewerCancelHtml,
          refreshToken: tokenResult.refreshToken,
        })
        console.log(`[Interview Cancel Email] Sent to interviewers: ${interviewerEmails.join(', ')}`)
      } catch (err) {
        console.error('[Interview Cancel Email - Interviewers]', err)
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
