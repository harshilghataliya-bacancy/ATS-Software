import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateInterview, cancelInterview, getInterviewById } from '@/lib/services/interviews'
import { getValidAccessToken, sendGmailEmail } from '@/lib/services/gmail'
import { createCalendarEvent } from '@/lib/services/google-calendar'
import { logActivity } from '@/lib/services/activity'

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

  // Auto-generate meeting link if switching to video and no link provided
  let finalMeetingLink = meeting_link || null
  const switchingToVideo = interview_type !== 'onsite' && oldInterview.interview_type === 'onsite' && !meeting_link
  const tokenResult = await getValidAccessToken(supabase, user.id, orgId)

  if (switchingToVideo && tokenResult.accessToken) {
    const candidate = oldInterview.application?.candidate
    const job = oldInterview.application?.job
    const candName = candidate ? `${candidate.first_name} ${candidate.last_name}` : 'Candidate'
    try {
      const calResult = await createCalendarEvent(tokenResult.accessToken, {
        summary: `Interview: ${candName} - ${job?.title || 'Position'}`,
        description: `Updated interview — switched to video call`,
        startDateTime: scheduled_at || oldInterview.scheduled_at,
        durationMinutes: duration_minutes || oldInterview.duration_minutes,
        attendees: [candidate?.email, user.email].filter(Boolean) as string[],
        includeMeetLink: true,
      })
      if (calResult.meetLink) {
        finalMeetingLink = calResult.meetLink
        console.log('[Interview Update] Auto-generated Meet link:', calResult.meetLink)
      }
    } catch (err) {
      console.error('[Interview Update] Failed to create calendar event for Meet link:', err)
    }
  }

  // Perform update
  const { error: updateError } = await updateInterview(supabase, interviewId, orgId, {
    interview_type,
    scheduled_at,
    duration_minutes,
    location: interview_type === 'onsite' ? (location || null) : null,
    meeting_link: interview_type !== 'onsite' ? finalMeetingLink : null,
    notes: notes || null,
  })

  if (updateError) {
    return NextResponse.json({ error: updateError.message ?? 'Failed to update' }, { status: 500 })
  }

  // Fetch updated interview
  const { data: updatedInterview } = await getInterviewById(supabase, interviewId, orgId)
  if (!updatedInterview) {
    return NextResponse.json({ success: true }) // saved but can't fetch — still ok
  }

  // Get org info
  const { data: org } = await supabase.from('organizations').select('name, slug').eq('id', orgId).single()
  const companyName = org?.name || 'Our Company'
  const orgSlug = org?.slug || ''
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

  const candidate = updatedInterview.application?.candidate
  const job = updatedInterview.application?.job
  const candidateName = candidate ? `${candidate.first_name} ${candidate.last_name}` : 'Candidate'
  const jobTitle = job?.title || 'Position'
  const schedulerName = user.user_metadata?.full_name || user.email?.split('@')[0] || ''

  const { dateStr, timeStr } = formatDateTime(updatedInterview.scheduled_at)
  const meetLink = updatedInterview.meeting_link
  const interviewLocation = updatedInterview.location
  const meetInfo = meetLink ? `<p><strong>Meeting Link:</strong> <a href="${meetLink}">${meetLink}</a></p>` : ''
  const locationInfo = interviewLocation ? `<p><strong>Location:</strong> ${interviewLocation}</p>` : ''
  const publicJobUrl = orgSlug && job?.id ? `${appUrl}/careers/${orgSlug}/${job.id}` : null
  const jobUrlInfo = publicJobUrl ? `<p><strong>Job Details:</strong> <a href="${publicJobUrl}">View Job Posting</a></p>` : ''

  // Detect what changed (for activity log only)
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

  const jobDescSection = job?.description
    ? `<h3 style="font-size:14px;margin:16px 0 6px;">Job Description</h3><div style="background:#f9fafb;padding:12px;border-radius:8px;font-size:13px;color:#374151;">${job.description}</div>`
    : ''

  // Send update emails (tokenResult already fetched above)
  if (tokenResult.accessToken) {
    const fromEmail = tokenResult.fromEmail || user.email!
    const recipients = await collectRecipients(updatedInterview, orgId, user.email || '', schedulerName)

    const updateHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#2563eb;color:white;padding:16px 20px;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;font-size:18px;">Interview Updated</h2>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px;">
          <p>The interview for <strong>${candidateName}</strong> — <strong>${jobTitle}</strong> at <strong>${companyName}</strong> has been updated.</p>
          <h3 style="font-size:14px;margin:16px 0 6px;">Updated Details</h3>
          <p><strong>Date:</strong> ${dateStr}<br/><strong>Time:</strong> ${timeStr}<br/><strong>Duration:</strong> ${updatedInterview.duration_minutes} minutes<br/><strong>Type:</strong> ${updatedInterview.interview_type === 'onsite' ? 'Face-to-Face' : 'Video Call'}</p>
          ${locationInfo}
          ${meetInfo}
          ${jobUrlInfo}
          ${updatedInterview.notes ? `<p><strong>Notes:</strong> ${updatedInterview.notes}</p>` : ''}
          <p style="font-size:13px;color:#6b7280;"><strong>Updated by:</strong> ${schedulerName} (${user.email})</p>
          ${jobDescSection}
        </div>
      </div>
    `

    for (const r of recipients) {
      try {
        await sendGmailEmail(tokenResult.accessToken, {
          from: fromEmail,
          to: r.email,
          subject: `[Updated] Interview: ${candidateName} - ${jobTitle}`,
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

  // Get org info
  const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).single()
  const companyName = org?.name || 'Our Company'
  const schedulerName = user.user_metadata?.full_name || user.email?.split('@')[0] || ''

  const { dateStr, timeStr } = formatDateTime(interview.scheduled_at)

  // Send cancellation emails
  const tokenResult = await getValidAccessToken(supabase, user.id, orgId)
  if (tokenResult.accessToken) {
    const fromEmail = tokenResult.fromEmail || user.email!
    const recipients = await collectRecipients(interview, orgId, user.email || '', schedulerName)

    const cancelHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#dc2626;color:white;padding:16px 20px;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;font-size:18px;">Interview Cancelled</h2>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px;">
          <p>The following interview has been <strong>cancelled</strong>:</p>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;margin:12px 0;">
            <p style="margin:0;"><strong>Candidate:</strong> ${candidateName}</p>
            <p style="margin:6px 0 0;"><strong>Position:</strong> ${jobTitle} at ${companyName}</p>
            <p style="margin:6px 0 0;"><strong>Was Scheduled:</strong> ${dateStr} at ${timeStr}</p>
            <p style="margin:6px 0 0;"><strong>Duration:</strong> ${interview.duration_minutes} minutes</p>
          </div>
          <p style="font-size:13px;color:#6b7280;"><strong>Cancelled by:</strong> ${schedulerName} (${user.email})</p>
          <p style="font-size:13px;color:#6b7280;">If you have any questions, please reach out to the recruiting team.</p>
        </div>
      </div>
    `

    for (const r of recipients) {
      try {
        await sendGmailEmail(tokenResult.accessToken, {
          from: fromEmail,
          to: r.email,
          subject: `[Cancelled] Interview: ${candidateName} - ${jobTitle}`,
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
  }).catch(() => {})

  return NextResponse.json({ success: true })
}
