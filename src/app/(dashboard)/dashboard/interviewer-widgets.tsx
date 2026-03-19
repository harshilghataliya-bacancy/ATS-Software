'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar, MessageSquare, Star } from 'lucide-react'

/* ── Gradient avatars ── */
const GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-blue-600',
]
function getGradient(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]
}

interface PendingInterview {
  id: string
  scheduled_at: string
  candidate_name: string
  job_title: string
}

export function PendingFeedbackCard({ orgId, userId }: { orgId: string; userId: string }) {
  const [pending, setPending] = useState<PendingInterview[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const supabase = createClient()

    const { data: panelData } = await supabase
      .from('interview_panelists')
      .select('interview_id')
      .eq('user_id', userId)
      .eq('organization_id', orgId)

    if (!panelData || panelData.length === 0) {
      setLoading(false)
      return
    }

    const interviewIds = panelData.map((p: { interview_id: string }) => p.interview_id)

    const { data: completedInterviews } = await supabase
      .from('interviews')
      .select(`
        id, scheduled_at,
        application:applications(
          candidate:candidates(first_name, last_name),
          job:jobs(title)
        )
      `)
      .in('id', interviewIds)
      .eq('organization_id', orgId)
      .eq('status', 'completed')
      .is('deleted_at', null)
      .order('scheduled_at', { ascending: false })

    if (!completedInterviews || completedInterviews.length === 0) {
      setLoading(false)
      return
    }

    const { data: feedbackData } = await supabase
      .from('interview_feedback')
      .select('interview_id')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .in('interview_id', completedInterviews.map((i: { id: string }) => i.id))

    const submittedIds = new Set((feedbackData ?? []).map((f: { interview_id: string }) => f.interview_id))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pendingList = completedInterviews
      .filter((i: { id: string }) => !submittedIds.has(i.id))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((i: any) => ({
        id: i.id,
        scheduled_at: i.scheduled_at,
        candidate_name: `${i.application?.candidate?.first_name ?? ''} ${i.application?.candidate?.last_name ?? ''}`.trim(),
        job_title: i.application?.job?.title ?? 'Unknown',
      }))
      .slice(0, 5)

    setPending(pendingList)
    setLoading(false)
  }, [orgId, userId])

  useEffect(() => { load() }, [load])

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {pending.length > 0 && <div className="h-[2px] bg-gradient-to-r from-orange-400 to-red-500" />}
      <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-gray-400" />
          <h3 className="text-[13px] font-semibold text-gray-900">Pending Feedback</h3>
        </div>
        {pending.length > 0 && (
          <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
            {pending.length}
          </span>
        )}
      </div>
      <div className="p-3">
        {loading ? (
          <Skeleton className="h-[120px] w-full rounded-lg" />
        ) : pending.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-2">
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p className="text-[12px] font-medium text-emerald-600">All caught up!</p>
            <p className="text-[11px] text-gray-300 mt-0.5">No pending feedback</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {pending.map((iv) => (
              <Link key={iv.id} href={`/interviews/${iv.id}`}>
                <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-orange-50/40 transition-colors group">
                  <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${getGradient(iv.candidate_name)} flex items-center justify-center shrink-0`}>
                    <span className="text-[9px] font-semibold text-white">
                      {iv.candidate_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-gray-900 truncate group-hover:text-orange-600 transition-colors">{iv.candidate_name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{iv.job_title}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-gray-400 tabular-nums">
                      {new Date(iv.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-[10px] text-orange-500 font-medium">Submit</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface FeedbackStat {
  total: number
  avgRating: number
  recommendations: Record<string, number>
}

const RECOMMENDATION_DOT: Record<string, string> = {
  select: 'bg-emerald-500',
  reject: 'bg-red-500',
  hold: 'bg-amber-500',
}

const RECOMMENDATION_LABELS: Record<string, string> = {
  select: 'Select',
  reject: 'Reject',
  hold: 'Hold',
}

export function FeedbackStatsCard({ orgId, userId }: { orgId: string; userId: string }) {
  const [stats, setStats] = useState<FeedbackStat | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const supabase = createClient()

    const { data } = await supabase
      .from('interview_feedback')
      .select('overall_rating, recommendation')
      .eq('user_id', userId)
      .eq('organization_id', orgId)

    if (data && data.length > 0) {
      const total = data.length
      const avgRating = data.reduce((s: number, f: { overall_rating: number }) => s + f.overall_rating, 0) / total
      const recommendations: Record<string, number> = {}
      for (const f of data) {
        recommendations[f.recommendation] = (recommendations[f.recommendation] ?? 0) + 1
      }
      setStats({ total, avgRating, recommendations })
    } else {
      setStats({ total: 0, avgRating: 0, recommendations: {} })
    }
    setLoading(false)
  }, [orgId, userId])

  useEffect(() => { load() }, [load])

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
        <Star className="w-4 h-4 text-gray-400" />
        <h3 className="text-[13px] font-semibold text-gray-900">My Feedback Stats</h3>
      </div>
      <div className="p-4">
        {loading ? (
          <Skeleton className="h-[100px] w-full rounded-lg" />
        ) : stats?.total === 0 ? (
          <p className="text-[12px] text-gray-300 text-center py-8">No feedback submitted yet</p>
        ) : stats ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[28px] font-bold text-gray-900 leading-none">{stats.total}</p>
                <p className="text-[11px] text-gray-400 mt-1">Total submitted</p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }, (_, i) => (
                    <svg
                      key={i}
                      className={`w-3.5 h-3.5 ${i < Math.round(stats.avgRating) ? 'text-amber-400' : 'text-gray-200'}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5 tabular-nums">{stats.avgRating.toFixed(1)} avg</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.recommendations)
                .sort(([a], [b]) => {
                  const order = ['select', 'hold', 'reject']
                  return order.indexOf(a) - order.indexOf(b)
                })
                .map(([rec, count]) => (
                  <div key={rec} className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${RECOMMENDATION_DOT[rec] ?? 'bg-gray-400'}`} />
                    <span className="text-[11px] text-gray-500">
                      {RECOMMENDATION_LABELS[rec] ?? rec} ({count})
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

interface ScheduleItem {
  id: string
  scheduled_at: string
  interview_type: string
  candidate_name: string
  job_title: string
}

export function TodaysScheduleCard({ interviews }: { interviews: Array<{
  id: string
  scheduled_at: string
  interview_type: string
  application: {
    candidate: { first_name: string; last_name: string }
    job: { title: string }
  }
}> }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const todayItems: ScheduleItem[] = interviews
    .filter((iv) => {
      const d = new Date(iv.scheduled_at)
      return d >= today && d < tomorrow
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((iv: any) => ({
      id: iv.id,
      scheduled_at: iv.scheduled_at,
      interview_type: iv.interview_type,
      candidate_name: `${iv.application?.candidate?.first_name ?? ''} ${iv.application?.candidate?.last_name ?? ''}`.trim(),
      job_title: iv.application?.job?.title ?? 'Unknown',
    }))

  function isWithin30Min(dateStr: string): boolean {
    const diff = new Date(dateStr).getTime() - Date.now()
    return diff > 0 && diff <= 30 * 60 * 1000
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <h3 className="text-[13px] font-semibold text-gray-900">Today&apos;s Schedule</h3>
        </div>
        {todayItems.length > 0 && (
          <span className="text-[11px] text-gray-300">{todayItems.length} interview{todayItems.length !== 1 ? 's' : ''}</span>
        )}
      </div>
      <div className="p-3">
        {todayItems.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-2">
              <Calendar className="w-4 h-4 text-gray-300" />
            </div>
            <p className="text-[12px] text-gray-400">No interviews today</p>
            <p className="text-[11px] text-gray-300 mt-0.5">Enjoy your free schedule</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {todayItems.map((item) => {
              const soon = isWithin30Min(item.scheduled_at)
              return (
                <Link key={item.id} href={`/interviews/${item.id}`}>
                  <div className={`flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors group ${
                    soon ? 'bg-blue-50/60 hover:bg-blue-50' : 'hover:bg-gray-50/80'
                  }`}>
                    {/* Time */}
                    <div className="flex flex-col items-center shrink-0 w-12">
                      {soon && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse mb-0.5" />
                      )}
                      <span className={`text-[11px] font-semibold tabular-nums ${soon ? 'text-blue-600' : 'text-gray-600'}`}>
                        {new Date(item.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Avatar */}
                    <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${getGradient(item.candidate_name)} flex items-center justify-center shrink-0`}>
                      <span className="text-[9px] font-semibold text-white">
                        {item.candidate_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">{item.candidate_name}</p>
                      <p className="text-[11px] text-gray-400 truncate">{item.job_title}</p>
                    </div>

                    <span className="text-[10px] text-gray-400 capitalize shrink-0">{item.interview_type}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
