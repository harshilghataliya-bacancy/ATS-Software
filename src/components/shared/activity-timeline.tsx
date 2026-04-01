'use client'

import { formatDistanceToNow } from 'date-fns'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = Record<string, any>

const ACTION_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  'stage_changed': { icon: 'stage', color: 'bg-purple-100 text-purple-600', label: 'Stage Changed' },
  'interview_scheduled': { icon: 'calendar', color: 'bg-blue-100 text-blue-600', label: 'Interview Scheduled' },
  'interview_completed': { icon: 'check', color: 'bg-green-100 text-green-600', label: 'Interview Completed' },
  'interview_cancelled': { icon: 'x', color: 'bg-gray-100 text-gray-600', label: 'Interview Cancelled' },
  'offer_created': { icon: 'doc', color: 'bg-emerald-100 text-emerald-600', label: 'Offer Created' },
  'offer_sent': { icon: 'send', color: 'bg-blue-100 text-blue-600', label: 'Offer Sent' },
  'offer_accepted': { icon: 'check', color: 'bg-green-100 text-green-600', label: 'Offer Accepted' },
  'offer_declined': { icon: 'x', color: 'bg-red-100 text-red-600', label: 'Offer Declined' },
  'offer_revoked': { icon: 'x', color: 'bg-orange-100 text-orange-600', label: 'Offer Revoked' },
  'email_sent': { icon: 'email', color: 'bg-sky-100 text-sky-600', label: 'Email Sent' },
  'feedback_submitted': { icon: 'feedback', color: 'bg-amber-100 text-amber-600', label: 'Feedback Submitted' },
  'application_created': { icon: 'plus', color: 'bg-blue-100 text-blue-600', label: 'Application Created' },
  'application_rejected': { icon: 'x', color: 'bg-red-100 text-red-600', label: 'Application Rejected' },
  'application_hired': { icon: 'check', color: 'bg-green-100 text-green-600', label: 'Hired' },
  'candidate_created': { icon: 'plus', color: 'bg-blue-100 text-blue-600', label: 'Candidate Added' },
  'candidate_updated': { icon: 'edit', color: 'bg-gray-100 text-gray-600', label: 'Profile Updated' },
  'assessment_sent': { icon: 'send', color: 'bg-indigo-100 text-indigo-600', label: 'Assessment Sent' },
  'assessment_completed': { icon: 'check', color: 'bg-indigo-100 text-indigo-600', label: 'Assessment Completed' },
  'resume_uploaded': { icon: 'doc', color: 'bg-teal-100 text-teal-600', label: 'Resume Uploaded' },
  'resume_parsed': { icon: 'doc', color: 'bg-teal-100 text-teal-600', label: 'Resume Parsed' },
  'whatsapp_sent': { icon: 'send', color: 'bg-green-100 text-green-600', label: 'WhatsApp Sent' },
  'note_added': { icon: 'edit', color: 'bg-yellow-100 text-yellow-600', label: 'Note Added' },
  'note_edited': { icon: 'edit', color: 'bg-yellow-100 text-yellow-600', label: 'Note Edited' },
  'note_deleted': { icon: 'x', color: 'bg-gray-100 text-gray-600', label: 'Note Deleted' },
}

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] || {
    icon: 'default',
    color: 'bg-gray-100 text-gray-500',
    label: action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  }
}

function ActionIcon({ icon, className }: { icon: string; className?: string }) {
  const cls = className || 'w-3.5 h-3.5'
  switch (icon) {
    case 'stage':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
    case 'calendar':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
    case 'check':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    case 'x':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    case 'doc':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
    case 'send':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
    case 'email':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
    case 'feedback':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>
    case 'plus':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
    case 'edit':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
    default:
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  }
}

function getMetadataDescription(action: string, metadata: AnyData | null): string | null {
  if (!metadata) return null
  const parts: string[] = []

  if (action === 'stage_changed') {
    if (metadata.from_stage && metadata.to_stage) {
      parts.push(`${metadata.from_stage} → ${metadata.to_stage}`)
    } else if (metadata.to_stage) {
      parts.push(`Moved to ${metadata.to_stage}`)
    }
  }
  if (action === 'interview_scheduled' && metadata.interview_type) {
    parts.push(`${metadata.interview_type} interview`)
    if (metadata.scheduled_at) {
      parts.push(`on ${new Date(metadata.scheduled_at).toLocaleDateString()}`)
    }
  }
  if (action === 'feedback_submitted' && metadata.recommendation) {
    parts.push(`Recommendation: ${metadata.recommendation}`)
  }
  if (action === 'email_sent' && metadata.subject) {
    parts.push(`Subject: ${metadata.subject}`)
  }
  if (action === 'application_rejected' && metadata.reason) {
    parts.push(`Reason: ${metadata.reason}`)
  }
  if (action === 'assessment_completed' && metadata.assessment_name) {
    parts.push(`${metadata.assessment_name}: ${metadata.score}%`)
  }
  if (metadata.job_title && action !== 'interview_cancelled') {
    parts.push(`Job: ${metadata.job_title}`)
  }

  return parts.length > 0 ? parts.join(' | ') : null
}

function getActionSentence(action: string, metadata: AnyData | null): string {
  switch (action) {
    case 'stage_changed':
      if (metadata?.from_stage && metadata?.to_stage)
        return `moved candidate from ${metadata.from_stage} to ${metadata.to_stage}`
      if (metadata?.to_stage) return `moved candidate to ${metadata.to_stage}`
      return 'changed stage'
    case 'interview_scheduled':
      return 'scheduled an interview'
    case 'interview_completed':
      return 'completed an interview'
    case 'interview_cancelled':
      return 'cancelled an interview'
    case 'offer_created':
      return 'created an offer'
    case 'offer_sent':
      return 'sent an offer'
    case 'offer_accepted':
      return 'marked offer as accepted'
    case 'offer_declined':
      return 'marked offer as declined'
    case 'offer_revoked':
      return 'revoked the offer'
    case 'email_sent':
      return 'sent an email'
    case 'feedback_submitted':
      return 'submitted feedback'
    case 'application_created':
      return metadata?.job_title ? `applied candidate to ${metadata.job_title}` : 'created an application'
    case 'application_rejected':
      return metadata?.candidate_name ? `rejected ${metadata.candidate_name}` : 'rejected the application'
    case 'application_hired':
      return metadata?.candidate_name ? `hired ${metadata.candidate_name}` : 'hired the candidate'
    case 'candidate_created':
      return metadata?.candidate_name ? `added candidate ${metadata.candidate_name} (${metadata.source || 'direct'})` : 'added the candidate'
    case 'candidate_updated':
      return 'updated candidate profile'
    case 'resume_uploaded':
      return 'uploaded a resume'
    case 'resume_parsed':
      return 'parsed the resume'
    case 'assessment_sent':
      return 'sent an assessment'
    case 'assessment_completed':
      return metadata?.score != null ? `scored assessment at ${metadata.score}%` : 'completed an assessment'
    case 'whatsapp_sent':
      return 'sent a WhatsApp message'
    case 'note_added':
      return metadata?.note_preview ? `added a note: "${metadata.note_preview}"` : 'added a note'
    case 'note_edited':
      return metadata?.note_preview ? `edited a note: "${metadata.note_preview}"` : 'edited a note'
    case 'note_deleted':
      return 'deleted a note'
    default:
      return action.replace(/_/g, ' ')
  }
}

interface ActivityTimelineProps {
  activities: AnyData[]
  loading?: boolean
  emptyMessage?: string
}

export function ActivityTimeline({ activities, loading, emptyMessage = 'No activity recorded yet' }: ActivityTimelineProps) {
  if (loading) {
    return (
      <div className="space-y-4 py-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3 bg-gray-100 rounded w-3/4" />
              <div className="h-2.5 bg-gray-50 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
        <svg className="w-10 h-10 mx-auto text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-gray-500">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {activities.map((activity, idx) => {
        const config = getActionConfig(activity.action)
        const description = getMetadataDescription(activity.action, activity.metadata)
        const timeAgo = formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })

        return (
          <div key={activity.id} className="flex gap-3 group">
            {/* Timeline connector */}
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${config.color}`}>
                <ActionIcon icon={config.icon} />
              </div>
              {idx < activities.length - 1 && (
                <div className="w-px flex-1 bg-gray-100 my-1" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 pb-5 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  {(activity.metadata?.user_name || activity.metadata?.source === 'candidate') && (
                    <span className="text-sm font-semibold text-gray-900">
                      {activity.metadata?.user_name || activity.metadata?.candidate_name || 'Candidate'}{' '}
                    </span>
                  )}
                  <span className="text-sm font-medium text-gray-600">{getActionSentence(activity.action, activity.metadata)}</span>
                </div>
                <span className="text-[11px] text-gray-400 whitespace-nowrap shrink-0" title={new Date(activity.created_at).toLocaleString()}>
                  {timeAgo}
                </span>
              </div>
              {activity.action === 'application_rejected' && activity.metadata?.reason && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mt-1.5">
                  <p className="text-[11px] font-medium text-rose-700">Reason:</p>
                  <p className="text-[12px] text-rose-600 mt-0.5">{activity.metadata.reason}</p>
                </div>
              )}
              {activity.action === 'interview_cancelled' && activity.metadata?.reason && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mt-1.5">
                  <p className="text-[11px] font-medium text-rose-700">Reason:</p>
                  <p className="text-[12px] text-rose-600 mt-0.5">{activity.metadata.reason}</p>
                </div>
              )}
              {activity.action === 'offer_revoked' && activity.metadata?.reason && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mt-1.5">
                  <p className="text-[11px] font-medium text-orange-700">Revocation Reason:</p>
                  <p className="text-[12px] text-orange-600 mt-0.5">{activity.metadata.reason}</p>
                </div>
              )}
              {description && activity.action !== 'application_rejected' && activity.action !== 'interview_cancelled' && activity.action !== 'offer_revoked' && (
                <p className="text-xs text-gray-500 mt-0.5">{description}</p>
              )}
              {activity.entity_type && activity.action !== 'stage_changed' && !activity.metadata?.user_name && (
                <span className="inline-block text-[10px] font-medium text-gray-400 mt-1 uppercase tracking-wide">
                  {activity.entity_type}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
