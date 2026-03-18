'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

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

    // Get user's interview IDs
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

    // Get completed interviews
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

    // Get feedback already submitted by this user
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
    <Card className={`shadow-sm hover:shadow-md transition-shadow ${pending.length > 0 ? 'border-l-4 border-l-orange-400' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Pending Feedback</CardTitle>
          {pending.length > 0 && (
            <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
              {pending.length}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[120px] w-full" />
        ) : pending.length === 0 ? (
          <div className="text-center py-6">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-2">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p className="text-sm font-medium text-green-700">All caught up!</p>
            <p className="text-xs text-gray-400 mt-1">No pending feedback to submit</p>
          </div>
        ) : (
          <div className="space-y-1">
            {pending.map((iv) => (
              <Link key={iv.id} href={`/interviews/${iv.id}`}>
                <div className="flex items-center justify-between p-2.5 rounded-lg hover:bg-orange-50/50 transition-colors cursor-pointer">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{iv.candidate_name}</p>
                    <p className="text-xs text-gray-500 truncate">{iv.job_title}</p>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-xs text-gray-500">
                      {new Date(iv.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-[10px] text-orange-600 font-medium">Submit</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface FeedbackStat {
  total: number
  avgRating: number
  recommendations: Record<string, number>
}

const RECOMMENDATION_COLORS: Record<string, string> = {
  select: 'bg-green-100 text-green-700',
  reject: 'bg-red-100 text-red-700',
  hold: 'bg-yellow-100 text-yellow-700',
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

  function renderStars(rating: number) {
    return Array.from({ length: 5 }, (_, i) => (
      <svg
        key={i}
        className={`w-4 h-4 ${i < Math.round(rating) ? 'text-amber-400' : 'text-gray-200'}`}
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    ))
  }

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">My Feedback Stats</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[100px] w-full" />
        ) : stats?.total === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">No feedback submitted yet</p>
        ) : stats ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                <p className="text-xs text-gray-500">Total submitted</p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-0.5">{renderStars(stats.avgRating)}</div>
                <p className="text-xs text-gray-500 mt-0.5">{stats.avgRating.toFixed(1)} avg rating</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(stats.recommendations)
                .sort(([a], [b]) => {
                  const order = ['select', 'hold', 'reject']
                  return order.indexOf(a) - order.indexOf(b)
                })
                .map(([rec, count]) => (
                  <span
                    key={rec}
                    className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${RECOMMENDATION_COLORS[rec] ?? 'bg-gray-100 text-gray-600'}`}
                  >
                    {RECOMMENDATION_LABELS[rec] ?? rec} ({count})
                  </span>
                ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
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
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Today&apos;s Schedule</CardTitle>
          {todayItems.length > 0 && (
            <span className="text-xs text-gray-400">{todayItems.length} interview{todayItems.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {todayItems.length === 0 ? (
          <div className="text-center py-6">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-2">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">No interviews today</p>
            <p className="text-xs text-gray-400 mt-1">Enjoy your free schedule</p>
          </div>
        ) : (
          <div className="space-y-1">
            {todayItems.map((item) => {
              const soon = isWithin30Min(item.scheduled_at)
              return (
                <Link key={item.id} href={`/interviews/${item.id}`}>
                  <div className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors cursor-pointer ${
                    soon ? 'bg-blue-50 hover:bg-blue-100/70' : 'hover:bg-gray-50'
                  }`}>
                    <div className="flex flex-col items-center shrink-0 w-14">
                      {soon && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse mb-0.5" />
                      )}
                      <span className={`text-xs font-semibold ${soon ? 'text-blue-700' : 'text-gray-700'}`}>
                        {new Date(item.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.candidate_name}</p>
                      <p className="text-xs text-gray-500 truncate">{item.job_title}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 capitalize shrink-0">{item.interview_type}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
