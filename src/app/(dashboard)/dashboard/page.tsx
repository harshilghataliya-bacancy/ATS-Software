'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getDashboardStats } from '@/lib/services/reports'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Briefcase, Users, Calendar, Mail, MessageSquare,
  ArrowUpRight, Clock, Activity,
} from 'lucide-react'

const DashboardCharts = dynamic(() => import('./dashboard-charts'), {
  loading: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100">
          <div className="p-6"><Skeleton className="h-[220px] w-full rounded-lg" /></div>
        </div>
      ))}
    </div>
  ),
  ssr: false,
})

const AdminWidgets = dynamic(() => import('./admin-widgets'), {
  loading: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[1, 2].map((i) => <Skeleton key={i} className="h-[200px] rounded-xl" />)}
    </div>
  ),
  ssr: false,
})

const RecruiterWidgets = dynamic(() => import('./recruiter-widgets'), {
  loading: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[1, 2].map((i) => <Skeleton key={i} className="h-[200px] rounded-xl" />)}
    </div>
  ),
  ssr: false,
})

const InterviewerWidgets = dynamic(
  () => import('./interviewer-widgets').then((mod) => ({
    default: ({ orgId, userId, interviews }: { orgId: string; userId: string; interviews: UpcomingInterview[] }) => (
      <>
        <mod.TodaysScheduleCard interviews={interviews as never[]} />
        <mod.PendingFeedbackCard orgId={orgId} userId={userId} />
        <mod.FeedbackStatsCard orgId={orgId} userId={userId} />
      </>
    ),
  })),
  { ssr: false }
)

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

/* ── Gradient avatars (same system as jobs page) ── */
const GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-blue-600',
  'from-fuchsia-500 to-purple-600',
  'from-lime-500 to-emerald-600',
]
function getGradient(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]
}

/* ── Entity styling ── */
const ENTITY_DOT: Record<string, string> = {
  application: 'bg-blue-500',
  interview: 'bg-amber-500',
  offer: 'bg-violet-500',
  job: 'bg-emerald-500',
  candidate: 'bg-rose-500',
}

const ENTITY_LABEL: Record<string, string> = {
  application: 'Application',
  interview: 'Interview',
  offer: 'Offer',
  job: 'Job',
  candidate: 'Candidate',
}

/* ── Interview type config ── */
const INTERVIEW_TYPE_DOT: Record<string, string> = {
  phone: 'bg-blue-400',
  video: 'bg-violet-400',
  onsite: 'bg-emerald-400',
  technical: 'bg-amber-400',
  hr: 'bg-rose-400',
}

/* ── KPI config ── */
const KPI_CONFIG = [
  {
    key: 'open_jobs',
    label: 'Open Jobs',
    sub: 'Published postings',
    href: '/jobs',
    icon: Briefcase,
    gradient: 'from-blue-500 to-blue-600',
    lightBg: 'bg-blue-50',
    lightText: 'text-blue-600',
  },
  {
    key: 'active_candidates',
    label: 'Active Candidates',
    sub: 'In pipeline',
    href: '/candidates',
    icon: Users,
    gradient: 'from-emerald-500 to-emerald-600',
    lightBg: 'bg-emerald-50',
    lightText: 'text-emerald-600',
  },
  {
    key: 'interviews_this_week',
    label: 'This Week',
    sub: 'Interviews scheduled',
    href: '/interviews',
    icon: Calendar,
    gradient: 'from-amber-500 to-orange-500',
    lightBg: 'bg-amber-50',
    lightText: 'text-amber-600',
  },
  {
    key: 'pending_offers',
    label: 'Pending Offers',
    sub: 'Awaiting response',
    href: '/offers',
    icon: Mail,
    gradient: 'from-violet-500 to-purple-600',
    lightBg: 'bg-violet-50',
    lightText: 'text-violet-600',
  },
]

export default function DashboardPage() {
  const router = useRouter()
  const { user, organization, isLoading } = useUser()
  const { isAdmin, isRecruiter, isInterviewer, canViewDashboard } = useRole()
  const [stats, setStats] = useState<{
    open_jobs: number
    active_candidates: number
    interviews_this_week: number
    pending_offers: number
    team_members?: number
    pending_feedback?: number
  } | null>(null)
  const [activities, setActivities] = useState<ActivityLog[]>([])
  const [interviews, setInterviews] = useState<UpcomingInterview[]>([])
  const [loading, setLoading] = useState(true)

  const loadDashboard = useCallback(async () => {
    if (!organization || !user) return
    const supabase = createClient()

    if (isInterviewer) {
      const { data: panelistData } = await supabase
        .from('interview_panelists')
        .select('interview_id')
        .eq('user_id', user.id)

      const myInterviewIds = (panelistData ?? []).map((p: { interview_id: string }) => p.interview_id)

      if (myInterviewIds.length === 0) {
        setStats({ open_jobs: 0, active_candidates: 0, interviews_this_week: 0, pending_offers: 0, pending_feedback: 0 })
        setInterviews([])
        setActivities([])
        setLoading(false)
        return
      }

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

      const { count: totalScheduled } = await supabase
        .from('interviews')
        .select('id', { count: 'exact', head: true })
        .in('id', myInterviewIds)
        .eq('organization_id', organization.id)
        .eq('status', 'scheduled')
        .is('deleted_at', null)

      const { count: totalCompleted } = await supabase
        .from('interviews')
        .select('id', { count: 'exact', head: true })
        .in('id', myInterviewIds)
        .eq('organization_id', organization.id)
        .eq('status', 'completed')
        .is('deleted_at', null)

      const completedIds = await supabase
        .from('interviews')
        .select('id')
        .in('id', myInterviewIds)
        .eq('organization_id', organization.id)
        .eq('status', 'completed')
        .is('deleted_at', null)

      let pendingFeedbackCount = 0
      if (completedIds.data && completedIds.data.length > 0) {
        const cIds = completedIds.data.map((i: { id: string }) => i.id)
        const { count: feedbackCount } = await supabase
          .from('interview_feedback')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('organization_id', organization.id)
          .in('interview_id', cIds)
        pendingFeedbackCount = cIds.length - (feedbackCount ?? 0)
      }

      setStats({
        open_jobs: totalScheduled ?? 0,
        active_candidates: totalCompleted ?? 0,
        interviews_this_week: weekCount ?? 0,
        pending_offers: (upcomingData ?? []).length,
        pending_feedback: Math.max(0, pendingFeedbackCount),
      })
      if (upcomingData) setInterviews(upcomingData as unknown as UpcomingInterview[])
      setActivities([])
      setLoading(false)
      return
    }

    const [statsResult, activityResult, interviewsResult, teamResult] = await Promise.all([
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
      isAdmin
        ? supabase
            .from('organization_members')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organization.id)
            .not('user_id', 'is', null)
            .is('deleted_at', null)
        : Promise.resolve({ count: null }),
    ])

    if (statsResult.data) {
      setStats({
        ...statsResult.data,
        ...(isAdmin && teamResult.count != null ? { team_members: teamResult.count } : {}),
      })
    }
    if (activityResult.data) setActivities(activityResult.data as ActivityLog[])
    if (interviewsResult.data) setInterviews(interviewsResult.data as unknown as UpcomingInterview[])
    setLoading(false)
  }, [organization, user, isInterviewer, isAdmin])

  useEffect(() => {
    if (organization) loadDashboard()
  }, [organization, loadDashboard])

  if (isLoading || loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <Skeleton className="h-7 w-56 rounded-lg" />
            <Skeleton className="h-4 w-72 mt-2 rounded-lg" />
          </div>
          <Skeleton className="h-4 w-40 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[110px] rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <Skeleton className="lg:col-span-3 h-[340px] rounded-xl" />
          <Skeleton className="lg:col-span-2 h-[340px] rounded-xl" />
        </div>
      </div>
    )
  }

  if (!isLoading && !canViewDashboard && !isInterviewer) {
    router.replace('/jobs')
    return null
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

  const ADMIN_KPI = [
    ...KPI_CONFIG,
    {
      key: 'team_members',
      label: 'Team Size',
      sub: 'Active members',
      href: '/settings',
      icon: Users,
      gradient: 'from-slate-600 to-gray-700',
      lightBg: 'bg-gray-50',
      lightText: 'text-gray-600',
    },
  ]

  const INTERVIEWER_KPI = [
    {
      key: 'open_jobs',
      label: 'Upcoming',
      sub: 'Scheduled interviews',
      href: '/interviews',
      icon: Calendar,
      gradient: 'from-blue-500 to-blue-600',
      lightBg: 'bg-blue-50',
      lightText: 'text-blue-600',
    },
    {
      key: 'active_candidates',
      label: 'Completed',
      sub: 'Interviews done',
      href: '/interviews',
      icon: Users,
      gradient: 'from-emerald-500 to-emerald-600',
      lightBg: 'bg-emerald-50',
      lightText: 'text-emerald-600',
    },
    {
      key: 'interviews_this_week',
      label: 'This Week',
      sub: 'Scheduled this week',
      href: '/interviews',
      icon: Calendar,
      gradient: 'from-amber-500 to-orange-500',
      lightBg: 'bg-amber-50',
      lightText: 'text-amber-600',
    },
    {
      key: 'pending_feedback',
      label: 'Pending Feedback',
      sub: 'Awaiting your review',
      href: '/interviews',
      icon: MessageSquare,
      gradient: 'from-orange-500 to-red-500',
      lightBg: 'bg-orange-50',
      lightText: 'text-orange-600',
    },
  ]

  const kpiList = isInterviewer ? INTERVIEWER_KPI : isAdmin ? ADMIN_KPI : KPI_CONFIG

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">
            {greeting}, {user?.full_name?.split(' ')[0]}
          </h1>
          <p className="text-[13px] text-gray-400 mt-0.5">
            {isInterviewer
              ? 'Here are your assigned interviews'
              : `Here\u0027s what\u0027s happening at ${organization?.name}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-gray-400 tabular-nums">
            {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${isAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-3`}>
        {kpiList.map((kpi) => {
          const Icon = kpi.icon
          const value = stats?.[kpi.key as keyof typeof stats] ?? 0
          return (
            <Link key={kpi.key} href={kpi.href}>
              <div className="group relative bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-200 p-4 overflow-hidden">
                {/* Subtle gradient accent line at top */}
                <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${kpi.gradient} opacity-60`} />

                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{kpi.label}</p>
                    <p className="text-[28px] font-bold text-gray-900 leading-none tracking-tight">{value}</p>
                    <p className="text-[11px] text-gray-400">{kpi.sub}</p>
                  </div>
                  <div className={`p-2 rounded-lg ${kpi.lightBg} group-hover:scale-105 transition-transform`}>
                    <Icon className={`w-4 h-4 ${kpi.lightText}`} />
                  </div>
                </div>

                {/* Hover arrow */}
                <ArrowUpRight className="absolute bottom-3 right-3 w-3.5 h-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          )
        })}
      </div>

      {/* ── Role-specific widgets ── */}
      {isAdmin && organization && <AdminWidgets orgId={organization.id} />}
      {isRecruiter && organization && user && <RecruiterWidgets orgId={organization.id} userId={user.id} />}

      {/* ── Charts ── */}
      {!isInterviewer && organization && <DashboardCharts orgId={organization.id} />}

      {/* ── Interviewer widgets ── */}
      {isInterviewer && organization && user && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <InterviewerWidgets orgId={organization.id} userId={user.id} interviews={interviews} />
        </div>
      )}

      {/* ── Activity + Interviews ── */}
      <div className={`grid grid-cols-1 ${isInterviewer ? '' : 'lg:grid-cols-5'} gap-4`}>
        {/* Recent Activity */}
        {!isInterviewer && (
          <div className="lg:col-span-3 bg-white rounded-xl border border-gray-100">
            <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-gray-400" />
                <h3 className="text-[13px] font-semibold text-gray-900">Recent Activity</h3>
              </div>
              <span className="text-[11px] text-gray-300">{activities.length} events</span>
            </div>
            <div className="p-3">
              {activities.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-2.5">
                    <Clock className="w-5 h-5 text-gray-300" />
                  </div>
                  <p className="text-[13px] text-gray-400">No activity yet</p>
                  <p className="text-[11px] text-gray-300 mt-0.5">Start by creating a job posting</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {activities.map((activity, idx) => {
                    const candidateName = (activity.metadata as Record<string, string>).candidate_name
                    return (
                      <div
                        key={activity.id}
                        className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-gray-50/80 transition-colors group"
                        style={{ animationDelay: `${idx * 50}ms` }}
                      >
                        {/* Entity dot */}
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ENTITY_DOT[activity.entity_type] ?? 'bg-gray-400'}`} />

                        {/* Avatar for candidate-related activities */}
                        {candidateName ? (
                          <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${getGradient(candidateName)} flex items-center justify-center shrink-0`}>
                            <span className="text-[10px] font-semibold text-white">
                              {candidateName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                            <span className="text-[9px] font-medium text-gray-400">
                              {ENTITY_LABEL[activity.entity_type]?.[0] ?? '?'}
                            </span>
                          </div>
                        )}

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] text-gray-600 truncate">{formatAction(activity)}</p>
                        </div>

                        {/* Time */}
                        <span className="text-[11px] text-gray-300 shrink-0 tabular-nums group-hover:text-gray-400 transition-colors">
                          {timeAgo(activity.created_at)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Upcoming Interviews */}
        <div className={`${isInterviewer ? '' : 'lg:col-span-2'} bg-white rounded-xl border border-gray-100`}>
          <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <h3 className="text-[13px] font-semibold text-gray-900">
                {isInterviewer ? 'My Interviews' : 'Upcoming Interviews'}
              </h3>
            </div>
            {interviews.length > 0 && (
              <Link href="/interviews" className="text-[11px] text-blue-600 hover:text-blue-700 font-medium transition-colors">
                View all
              </Link>
            )}
          </div>
          <div className="p-3">
            {interviews.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-2.5">
                  <Calendar className="w-5 h-5 text-gray-300" />
                </div>
                <p className="text-[13px] text-gray-400">
                  {isInterviewer ? 'No interviews assigned' : 'No interviews scheduled'}
                </p>
                <p className="text-[11px] text-gray-300 mt-0.5">
                  {isInterviewer ? 'You will be notified when assigned' : 'Interviews will appear here'}
                </p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {interviews.map((iv) => {
                  const candidate = (iv.application as unknown as { candidate: { first_name: string; last_name: string } })?.candidate
                  const job = (iv.application as unknown as { job: { title: string } })?.job
                  const name = `${candidate?.first_name ?? ''} ${candidate?.last_name ?? ''}`.trim()
                  const initials = `${candidate?.first_name?.[0] ?? ''}${candidate?.last_name?.[0] ?? ''}`.toUpperCase()
                  const isToday = new Date(iv.scheduled_at).toDateString() === today.toDateString()

                  return (
                    <Link key={iv.id} href={`/interviews/${iv.id}`}>
                      <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-gray-50/80 transition-colors group">
                        {/* Candidate avatar */}
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getGradient(name)} flex items-center justify-center shrink-0`}>
                          <span className="text-[10px] font-semibold text-white">{initials}</span>
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                            {name}
                          </p>
                          <p className="text-[11px] text-gray-400 truncate">{job?.title}</p>
                        </div>

                        {/* Time */}
                        <div className="text-right shrink-0">
                          <p className={`text-[11px] font-medium tabular-nums ${isToday ? 'text-blue-600' : 'text-gray-600'}`}>
                            {isToday ? 'Today' : new Date(iv.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                          <p className="text-[10px] text-gray-400 tabular-nums">
                            {new Date(iv.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        </div>

                        {/* Type dot */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`w-1.5 h-1.5 rounded-full ${INTERVIEW_TYPE_DOT[iv.interview_type] ?? 'bg-gray-300'}`} />
                          <span className="text-[10px] text-gray-400 capitalize">{iv.interview_type}</span>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
