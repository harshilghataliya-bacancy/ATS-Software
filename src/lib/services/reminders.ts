import { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken, sendGmailEmail } from './gmail'
import { getOrCreateTemplate, renderEmail, buildDetailTable } from '@/lib/email-templates'
import type { SystemEmailType } from '@/lib/email-templates'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InterviewForReminder {
  id: string
  organization_id: string
  application_id: string
  job_id: string
  candidate_id: string
  scheduled_at: string
  duration_minutes: number
  location: string | null
  meeting_link: string | null
  interview_type: string
  notes: string | null
  created_by: string
  candidates: {
    first_name: string
    last_name: string
    email: string
  }
  jobs: {
    title: string
    department: string
  }
  interview_panelists: Array<{
    user_id: string
    role: string
    user?: { email: string; raw_user_meta_data: Record<string, unknown> }
  }>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeUntil(minutes: number): string {
  if (minutes >= 1440) return `in ${Math.round(minutes / 1440)} day(s)`
  if (minutes >= 60) return `in ${Math.round(minutes / 60)} hour(s)`
  return `in ${minutes} minutes`
}

function formatDate(dateStr: string): { date: string; time: string } {
  const d = new Date(dateStr)
  return {
    date: d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' }),
    time: d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) + ' IST',
  }
}

const INTERVIEW_TYPE_LABELS: Record<string, string> = {
  video: 'Online Video',
  onsite: 'Offline Face to Face',
  phone: 'Phone',
  technical: 'Technical',
  cultural: 'Cultural Fit',
}

// ---------------------------------------------------------------------------
// Main: Process reminders for all orgs
// ---------------------------------------------------------------------------

export async function processInterviewReminders(): Promise<{ sent: number; errors: number }> {
  const supabase = createAdminClient()
  let sent = 0
  let errors = 0

  // 1. Get all orgs with their reminder_intervals
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name, reminder_intervals')

  if (!orgs || orgs.length === 0) return { sent: 0, errors: 0 }

  const now = new Date()

  for (const org of orgs) {
    const intervals: number[] = org.reminder_intervals || [60]

    for (const intervalMinutes of intervals) {
      try {
        const result = await processOrgReminders(supabase, org.id, org.name, intervalMinutes, now)
        sent += result.sent
        errors += result.errors
      } catch (err) {
        console.error(`[Reminders] Error for org ${org.id}, interval ${intervalMinutes}:`, err)
        errors++
      }
    }
  }

  return { sent, errors }
}

// ---------------------------------------------------------------------------
// Process reminders for a single org + interval
// ---------------------------------------------------------------------------

async function processOrgReminders(
  supabase: SupabaseClient,
  orgId: string,
  orgName: string,
  intervalMinutes: number,
  now: Date
): Promise<{ sent: number; errors: number }> {
  let sent = 0
  let errors = 0

  // Window: interview is between (now + interval - 5min) and (now + interval + 5min)
  // This 10-minute window catches interviews even if cron runs slightly off schedule
  const windowStart = new Date(now.getTime() + (intervalMinutes - 5) * 60_000)
  const windowEnd = new Date(now.getTime() + (intervalMinutes + 5) * 60_000)

  // Find scheduled interviews in the window
  const { data: interviews } = await supabase
    .from('interviews')
    .select(`
      id, organization_id, application_id, job_id, candidate_id,
      scheduled_at, duration_minutes, location, meeting_link,
      interview_type, notes, created_by,
      candidates(first_name, last_name, email),
      jobs(title, department),
      interview_panelists(user_id, role)
    `)
    .eq('organization_id', orgId)
    .eq('status', 'scheduled')
    .gte('scheduled_at', windowStart.toISOString())
    .lte('scheduled_at', windowEnd.toISOString())

  if (!interviews || interviews.length === 0) return { sent: 0, errors: 0 }

  // Check which ones already had reminders sent for this interval
  const interviewIds = interviews.map((i) => i.id)
  const { data: alreadySent } = await supabase
    .from('interview_reminders_sent')
    .select('interview_id')
    .in('interview_id', interviewIds)
    .eq('reminder_minutes', intervalMinutes)

  const sentSet = new Set((alreadySent || []).map((r) => r.interview_id))
  const toRemind = interviews.filter((i) => !sentSet.has(i.id)) as unknown as InterviewForReminder[]

  if (toRemind.length === 0) return { sent: 0, errors: 0 }

  // Get an admin user to send emails from
  const { data: adminMember } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', orgId)
    .eq('role', 'admin')
    .is('deleted_at', null)
    .limit(1)
    .single()

  if (!adminMember) return { sent: 0, errors: 0 }

  const tokenResult = await getValidAccessToken(supabase, adminMember.user_id, orgId)
  if (tokenResult.error) {
    console.error(`[Reminders] No Gmail token for org ${orgId}: ${tokenResult.error}`)
    return { sent: 0, errors: toRemind.length }
  }

  const accessToken = tokenResult.accessToken!
  const fromEmail = tokenResult.fromEmail!
  const displayName = tokenResult.displayName

  // Resolve panelist emails
  const allPanelistUserIds = Array.from(new Set(toRemind.flatMap((i) => i.interview_panelists.map((p) => p.user_id))))
  const { data: panelistUsers } = await supabase.auth.admin.listUsers()
  const userMap = new Map<string, { email: string; name: string }>()
  if (panelistUsers?.users) {
    for (const u of panelistUsers.users) {
      if (allPanelistUserIds.includes(u.id)) {
        userMap.set(u.id, {
          email: u.email || '',
          name: (u.user_metadata?.full_name as string) || u.email || '',
        })
      }
    }
  }

  // Get recruiter (created_by) info for CC
  const creatorIds = Array.from(new Set(toRemind.map((i) => i.created_by)))
  const recruiterMap = new Map<string, string>()
  if (panelistUsers?.users) {
    for (const u of panelistUsers.users) {
      if (creatorIds.includes(u.id)) {
        recruiterMap.set(u.id, u.email || '')
      }
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  for (const interview of toRemind) {
    try {
      const candidate = interview.candidates
      const job = interview.jobs
      const { date, time } = formatDate(interview.scheduled_at)
      const timeUntil = formatTimeUntil(intervalMinutes)
      const recruiterEmail = recruiterMap.get(interview.created_by) || ''

      const detailTable = buildDetailTable([
        { label: 'Position', value: job.title },
        { label: 'Date', value: date },
        { label: 'Time', value: time },
        { label: 'Duration', value: `${interview.duration_minutes} minutes` },
        { label: 'Type', value: INTERVIEW_TYPE_LABELS[interview.interview_type] || interview.interview_type },
        { label: 'Location', value: interview.location },
        { label: 'Meeting Link', value: interview.meeting_link, href: interview.meeting_link || undefined },
      ])

      const notesSection = interview.notes
        ? `<div style="margin:16px 0;padding:12px 16px;background:#f9fafb;border-left:3px solid #e5e7eb;border-radius:4px;"><strong>Notes:</strong> ${interview.notes}</div>`
        : ''

      // --- Send to Candidate ---
      const candidateTemplate = await getOrCreateTemplate(supabase, orgId, 'interview_reminder_candidate' as SystemEmailType)
      const candidateVars: Record<string, string> = {
        candidate_name: `${candidate.first_name} ${candidate.last_name}`,
        job_title: job.title,
        company_name: orgName,
        interview_date: date,
        interview_time: time,
        duration_minutes: String(interview.duration_minutes),
        interview_type: INTERVIEW_TYPE_LABELS[interview.interview_type] || interview.interview_type,
        location: interview.location || '',
        meeting_link: interview.meeting_link || '',
        time_until: timeUntil,
        detail_table: detailTable,
        notes_section: notesSection,
      }

      const candidateEmail = renderEmail(candidateTemplate, candidateVars, orgName)

      await sendGmailEmail(accessToken, {
        from: fromEmail,
        fromName: displayName || orgName,
        to: candidate.email,
        cc: recruiterEmail || undefined,
        subject: candidateEmail.subject,
        html: candidateEmail.html,
      })

      // --- Send to Each Panelist ---
      const panelistNames = interview.interview_panelists
        .map((p) => userMap.get(p.user_id)?.name || '')
        .filter(Boolean)
        .join(', ')

      const interviewerTemplate = await getOrCreateTemplate(supabase, orgId, 'interview_reminder_interviewer' as SystemEmailType)

      for (const panelist of interview.interview_panelists) {
        const pUser = userMap.get(panelist.user_id)
        if (!pUser?.email) continue

        const interviewerVars: Record<string, string> = {
          candidate_name: `${candidate.first_name} ${candidate.last_name}`,
          candidate_email: candidate.email,
          job_title: job.title,
          company_name: orgName,
          interview_date: date,
          interview_time: time,
          duration_minutes: String(interview.duration_minutes),
          interview_type: INTERVIEW_TYPE_LABELS[interview.interview_type] || interview.interview_type,
          location: interview.location || '',
          meeting_link: interview.meeting_link || '',
          panel_members: panelistNames,
          time_until: timeUntil,
          detail_table: detailTable,
          notes_section: notesSection,
          view_interview_link: `${appUrl}/interviews/${interview.id}`,
        }

        const interviewerEmail = renderEmail(interviewerTemplate, interviewerVars, orgName)

        await sendGmailEmail(accessToken, {
          from: fromEmail,
          fromName: displayName || orgName,
          to: pUser.email,
          cc: recruiterEmail || undefined,
          subject: interviewerEmail.subject,
          html: interviewerEmail.html,
        })
      }

      // Mark as sent
      await supabase.from('interview_reminders_sent').insert({
        interview_id: interview.id,
        organization_id: orgId,
        reminder_minutes: intervalMinutes,
      })

      sent++
    } catch (err) {
      console.error(`[Reminders] Failed to send reminder for interview ${interview.id}:`, err)
      errors++
    }
  }

  return { sent, errors }
}
