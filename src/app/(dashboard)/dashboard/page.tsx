'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getDashboardStats } from '@/lib/services/reports'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

const DashboardCharts = dynamic(() => import('./dashboard-charts'), {
  loading: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <div className="p-6"><Skeleton className="h-[220px] w-full" /></div>
        </Card>
      ))}
    </div>
  ),
  ssr: false,
})

interface ActivityLog {
  id: string
  entity_type: string
  entity_id: string
  action: string
  metadata: Record<string, unknown>
  created_at: string
}

interface UpcomingInterview {
  id: string
  scheduled_at: string
  interview_type: string
  application: {
    candidate: {
      first_name: string
      last_name: string
    }
    job: {
      title: string
    }
  }
}

const KPI_CONFIG = [
  {
    key: 'open_jobs',
    label: 'Open Jobs',
    sub: 'Published job postings',
    href: '/jobs',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
      </svg>
    ),
    bg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    accent: 'border-l-blue-500',
  },
  {
    key: 'active_candidates',
    label: 'Active Candidates',
    sub: 'With active applications',
    href: '/candidates',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    bg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    accent: 'border-l-emerald-500',
  },
  {
    key: 'interviews_this_week',
    label: 'Interviews This Week',
    sub: 'Scheduled this week',
    href: '/interviews',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
    bg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    accent: 'border-l-amber-500',
  },
  {
    key: 'pending_offers',
    label: 'Pending Offers',
    sub: 'Awaiting response',
    href: '/offers',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    ),
    bg: 'bg-purple-50',
    iconColor: 'text-purple-600',
    accent: 'border-l-purple-500',
  },
]

const ENTITY_COLORS: Record<string, string> = {
  application: 'bg-blue-100 text-blue-700',
  interview: 'bg-amber-100 text-amber-700',
  offer: 'bg-purple-100 text-purple-700',
  job: 'bg-emerald-100 text-emerald-700',
  candidate: 'bg-rose-100 text-rose-700',
}

export default function DashboardPage() {
  const { user, organization, isLoading } = useUser()
  const { isInterviewer } = useRole()
  const [stats, setStats] = useState<{
    open_jobs: number
    active_candidates: number
    interviews_this_week: number
    pending_offers: number
  } | null>(null)
  const [activities, setActivities] = useState<ActivityLog[]>([])
  const [interviews, setInterviews] = useState<UpcomingInterview[]>([])
  const [loading, setLoading] = useState(true)

  const loadDashboard = useCallback(async () => {
    if (!organization || !user) return
    const supabase = createClient()

    if (isInterviewer) {
      // Interviewer: only fetch their assigned interviews
      // First get interview IDs from panelist table
      const { data: panelistData } = await supabase
        .from('interview_panelists')
        .select('interview_id')
        .eq('user_id', user.id)

      const myInterviewIds = (panelistData ?? []).map((p: { interview_id: string }) => p.interview_id)

      if (myInterviewIds.length === 0) {
        setStats({ open_jobs: 0, active_candidates: 0, interviews_this_week: 0, pending_offers: 0 })
        setInterviews([])
        setActivities([])
        setLoading(false)
        return
      }

      // Fetch upcoming interviews assigned to this interviewer
      const { data: upcomingData } = await supabase
        .from('interviews')
        .select(`
          id, scheduled_at, interview_type,
          application:applications(
            candidate:candidates(first_name, last_name),
            job:jobs(title)
          )
        `)
        .in('id', myInterviewIds)
        .eq('organization_id', organization.id)
        .eq('status', 'scheduled')
        .is('deleted_at', null)
        .gte('scheduled_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(10)

      // Count this week's interviews
      const startOfWeek = new Date()
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
      startOfWeek.setHours(0, 0, 0, 0)
      const endOfWeek = new Date(startOfWeek)
      endOfWeek.setDate(endOfWeek.getDate() + 7)

      const { count: weekCount } = await supabase
        .from('interviews')
        .select('id', { count: 'exact', head: true })
        .in('id', myInterviewIds)
        .eq('organization_id', organization.id)
        .eq('status', 'scheduled')
        .is('deleted_at', null)
        .gte('scheduled_at', startOfWeek.toISOString())
        .lt('scheduled_at', endOfWeek.toISOString())

      // Count total scheduled
      const { count: totalScheduled } = await supabase
        .from('interviews')
        .select('id', { count: 'exact', head: true })
        .in('id', myInterviewIds)
        .eq('organization_id', organization.id)
        .eq('status', 'scheduled')
        .is('deleted_at', null)

      // Count completed
      const { count: totalCompleted } = await supabase
        .from('interviews')
        .select('id', { count: 'exact', head: true })
        .in('id', myInterviewIds)
        .eq('organization_id', organization.id)
        .eq('status', 'completed')
        .is('deleted_at', null)

      setStats({
        open_jobs: totalScheduled ?? 0,
        active_candidates: totalCompleted ?? 0,
        interviews_this_week: weekCount ?? 0,
        pending_offers: (upcomingData ?? []).length,
      })
      if (upcomingData) setInterviews(upcomingData as unknown as UpcomingInterview[])
      setActivities([])
      setLoading(false)
      return
    }

    // Full dashboard for non-interviewers
    const [statsResult, activityResult, interviewsResult] = await Promise.all([
      getDashboardStats(supabase, organization.id),
      supabase
        .from('activity_logs')
        .select('id, entity_type, entity_id, action, metadata, created_at')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('interviews')
        .select(`
          id, scheduled_at, interview_type,
          application:applications(
            candidate:candidates(first_name, last_name),
            job:jobs(title)
          )
        `)
        .eq('organization_id', organization.id)
        .eq('status', 'scheduled')
        .is('deleted_at', null)
        .gte('scheduled_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(5),
    ])

    if (statsResult.data) setStats(statsResult.data)
    if (activityResult.data) setActivities(activityResult.data as ActivityLog[])
    if (interviewsResult.data) setInterviews(interviewsResult.data as unknown as UpcomingInterview[])
    setLoading(false)
  }, [organization, user, isInterviewer])

  useEffect(() => {
    if (organization) loadDashboard()
  }, [organization, loadDashboard])

  if (isLoading || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[120px] rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[280px] rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  function formatAction(activity: ActivityLog): string {
    const meta = activity.metadata as Record<string, string>
    const entity = activity.entity_type
    const action = activity.action

    if (entity === 'application' && action === 'stage_changed') {
      return `${meta.candidate_name ?? 'Candidate'} moved to ${meta.to_stage ?? 'new stage'}`
    }
    if (entity === 'interview') {
      return `Interview ${action.replace(/_/g, ' ')}${meta.candidate_name ? ` - ${meta.candidate_name}` : ''}`
    }
    if (entity === 'offer') {
      return `Offer ${action.replace(/_/g, ' ')}${meta.candidate_name ? ` for ${meta.candidate_name}` : ''}`
    }
    if (entity === 'job') {
      return `Job ${action.replace(/_/g, ' ')}${meta.title ? `: ${meta.title}` : ''}`
    }
    if (entity === 'candidate') {
      return `Candidate ${action.replace(/_/g, ' ')}${meta.candidate_name ? `: ${meta.candidate_name}` : ''}`
    }
    return `${entity} ${action}`.replace(/_/g, ' ')
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  const today = new Date()
  const greeting =
    today.getHours() < 12 ? 'Good morning' : today.getHours() < 18 ? 'Good afternoon' : 'Good evening'

  // Interviewer-specific KPI config
  const INTERVIEWER_KPI = [
    {
      key: 'open_jobs',
      label: 'Upcoming Interviews',
      sub: 'Scheduled & assigned to you',
      href: '/interviews',
      icon: KPI_CONFIG[2].icon,
      bg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      accent: 'border-l-blue-500',
    },
    {
      key: 'active_candidates',
      label: 'Completed',
      sub: 'Interviews completed',
      href: '/interviews',
      icon: KPI_CONFIG[1].icon,
      bg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      accent: 'border-l-emerald-500',
    },
    {
      key: 'interviews_this_week',
      label: 'This Week',
      sub: 'Interviews this week',
      href: '/interviews',
      icon: KPI_CONFIG[2].icon,
      bg: 'bg-amber-50',
      iconColor: 'text-amber-600',
      accent: 'border-l-amber-500',
    },
  ]

  const kpiList = isInterviewer ? INTERVIEWER_KPI : KPI_CONFIG

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {greeting}, {user?.full_name?.split(' ')[0]}
          </h1>
          <p className="text-gray-500 mt-1">
            {isInterviewer
              ? 'Here are your assigned interviews'
              : `Here\u0027s what\u0027s happening at ${organization?.name}`}
          </p>
        </div>
        <p className="text-sm text-gray-400">
          {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* KPI Cards */}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${isInterviewer ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-4`}>
        {kpiList.map((kpi) => (
          <Link key={kpi.key} href={kpi.href}>
            <Card className={`hover:shadow-lg transition-all duration-200 cursor-pointer border-l-4 ${kpi.accent} group`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">{kpi.label}</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">
                      {stats?.[kpi.key as keyof typeof stats] ?? 0}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{kpi.sub}</p>
                  </div>
                  <div className={`p-2.5 rounded-lg ${kpi.bg} ${kpi.iconColor} group-hover:scale-110 transition-transform`}>
                    {kpi.icon}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Charts — only for non-interviewers */}
      {!isInterviewer && organization && <DashboardCharts orgId={organization.id} />}

      {/* Activity + Interviews */}
      <div className={`grid grid-cols-1 ${isInterviewer ? '' : 'lg:grid-cols-2'} gap-6`}>
        {/* Recent Activity — only for non-interviewers */}
        {!isInterviewer && (
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
                <span className="text-xs text-gray-400">{activities.length} events</span>
              </div>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <div className="text-center py-10">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500">No activity yet</p>
                  <p className="text-xs text-gray-400 mt-1">Start by creating a job posting</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge
                          className={`text-[10px] shrink-0 capitalize font-medium border-0 ${
                            ENTITY_COLORS[activity.entity_type] ?? 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {activity.entity_type}
                        </Badge>
                        <span className="text-sm text-gray-700 truncate">{formatAction(activity)}</span>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0 tabular-nums">{timeAgo(activity.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">
                {isInterviewer ? 'My Upcoming Interviews' : 'Upcoming Interviews'}
              </CardTitle>
              {interviews.length > 0 && (
                <Link href="/interviews" className="text-xs text-blue-600 hover:underline">
                  View all
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {interviews.length === 0 ? (
              <div className="text-center py-10">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500">
                  {isInterviewer ? 'No interviews assigned to you' : 'No interviews scheduled'}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {isInterviewer ? 'You will be notified when assigned' : 'Interviews will appear here when scheduled'}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {interviews.map((iv) => {
                  const candidate = (iv.application as unknown as { candidate: { first_name: string; last_name: string } })?.candidate
                  const job = (iv.application as unknown as { job: { title: string } })?.job
                  const initials = `${candidate?.first_name?.[0] ?? ''}${candidate?.last_name?.[0] ?? ''}`.toUpperCase()
                  return (
                    <Link key={iv.id} href={`/interviews/${iv.id}`}>
                      <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group">
                        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold shrink-0 group-hover:bg-indigo-200 transition-colors">
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {candidate?.first_name} {candidate?.last_name}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{job?.title}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-medium text-gray-700">
                            {new Date(iv.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {new Date(iv.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px] capitalize shrink-0">{iv.interview_type}</Badge>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
