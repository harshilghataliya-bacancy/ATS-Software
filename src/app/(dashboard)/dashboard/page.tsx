'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getDashboardStats } from '@/lib/services/reports'
import { resolveUserNames } from '../jobs/actions'
import { Skeleton } from '@/components/ui/skeleton'
import AvailabilitySection from './availability-section'
import {
  Briefcase, Users, Calendar, Mail, MessageSquare,
  ArrowUpRight, Clock, Activity, ChevronLeft, ChevronRight,
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

interface DetailedInterview {
  id: string
  scheduled_at: string
  duration_minutes: number
  interview_type: string
  location: string | null
  meeting_link: string | null
  status: string
  notes: string | null
  created_by: string
  application: {
    candidate: { first_name: string; last_name: string; email: string }
    job: { title: string }
  }
  interview_panelists: { user_id: string; user: { email: string; raw_user_meta_data: Record<string, unknown> } }[]
}

interface PendingFeedbackItem {
  interview_id: string
  scheduled_at: string
  interview_type: string
  interview_status: string
  candidate_name: string
  job_title: string
  application_id: string
  panelist_names: string[]
}

interface RecentFeedbackItem {
  id: string
  interview_id: string
  overall_rating: number
  recommendation: string
  submitted_at: string
  candidate_name: string
  job_title: string
  submitted_by: string
}

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
  const [detailedInterviews, setDetailedInterviews] = useState<DetailedInterview[]>([])
  const [pastInterviews, setPastInterviews] = useState<DetailedInterview[]>([])
  const [pendingFeedbacks, setPendingFeedbacks] = useState<PendingFeedbackItem[]>([])
  const [recentFeedbacks, setRecentFeedbacks] = useState<RecentFeedbackItem[]>([])
  const [interviewsLoaded, setInterviewsLoaded] = useState(false)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'interviews'>('dashboard')
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

  const loadDetailedInterviews = useCallback(async () => {
    if (!organization || interviewsLoaded) return
    const supabase = createClient()
    const now = new Date().toISOString()

    // Upcoming interviews
    const { data: upcoming } = await supabase
      .from('interviews')
      .select(`
        id, scheduled_at, duration_minutes, interview_type, location, meeting_link, status, notes, created_by,
        application:applications(
          candidate:candidates(first_name, last_name, email),
          job:jobs(title)
        ),
        interview_panelists(user_id)
      `)
      .eq('organization_id', organization.id)
      .eq('status', 'scheduled')
      .is('deleted_at', null)
      .gte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(20)

    // Past interviews (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const { data: past } = await supabase
      .from('interviews')
      .select(`
        id, scheduled_at, duration_minutes, interview_type, location, meeting_link, status, notes, created_by,
        application:applications(
          candidate:candidates(first_name, last_name, email),
          job:jobs(title)
        ),
        interview_panelists(user_id)
      `)
      .eq('organization_id', organization.id)
      .in('status', ['completed', 'scheduled'])
      .is('deleted_at', null)
      .lt('scheduled_at', now)
      .gte('scheduled_at', weekAgo)
      .order('scheduled_at', { ascending: false })
      .limit(20)

    // Resolve all user names via server action (uses admin client)
    const allInterviews = [...(upcoming ?? []), ...(past ?? [])]
    const allUserIds: string[] = Array.from(new Set([
      ...allInterviews.map((i) => i.created_by).filter(Boolean),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...allInterviews.flatMap((i) => ((i as any).interview_panelists ?? []).map((p: any) => p.user_id)).filter(Boolean),
    ]))
    let userNameMap: Record<string, string> = {}
    if (allUserIds.length > 0) {
      const { data: nameMap } = await resolveUserNames(allUserIds)
      if (nameMap) userNameMap = nameMap
    }
    setCreatorNames(userNameMap)

    if (upcoming) setDetailedInterviews(upcoming as unknown as DetailedInterview[])
    if (past) setPastInterviews(past as unknown as DetailedInterview[])

    // Fetch pending feedbacks — completed interviews in last 30 days without feedback
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
    const { data: completedInterviews } = await supabase
      .from('interviews')
      .select(`
        id, scheduled_at, interview_type, status, application_id,
        application:applications(
          candidate:candidates(first_name, last_name),
          job:jobs(title)
        ),
        interview_panelists(user_id)
      `)
      .eq('organization_id', organization.id)
      .in('status', ['completed', 'scheduled'])
      .is('deleted_at', null)
      .gte('scheduled_at', thirtyDaysAgo)
      .order('scheduled_at', { ascending: false })
      .limit(50)

    if (completedInterviews && completedInterviews.length > 0 && user) {
      const completedIds = completedInterviews.map((i: { id: string }) => i.id)
      const { data: existingFeedback } = await supabase
        .from('interview_feedback')
        .select('interview_id')
        .eq('user_id', user.id)
        .in('interview_id', completedIds)

      const feedbackInterviewIds = new Set((existingFeedback ?? []).map((f: { interview_id: string }) => f.interview_id))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pendingInterviews = completedInterviews.filter((i: any) => !feedbackInterviewIds.has(i.id))

      // Resolve panelist names for pending interviews via server action
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pendingPanelistIds: string[] = Array.from(new Set(pendingInterviews.flatMap((i: any) => (i.interview_panelists ?? []).map((p: any) => p.user_id as string)).filter(Boolean)))
      const missingPanelistIds = pendingPanelistIds.filter((id) => !userNameMap[id])
      if (missingPanelistIds.length > 0) {
        const { data: pNames } = await resolveUserNames(missingPanelistIds)
        if (pNames) {
          Object.assign(userNameMap, pNames)
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pending = pendingInterviews.map((i: any) => ({
        interview_id: i.id,
        scheduled_at: i.scheduled_at,
        interview_type: i.interview_type,
        interview_status: i.status,
        candidate_name: `${i.application?.candidate?.first_name ?? ''} ${i.application?.candidate?.last_name ?? ''}`.trim(),
        job_title: i.application?.job?.title ?? 'Unknown Position',
        application_id: i.application_id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        panelist_names: (i.interview_panelists ?? []).map((p: any) => userNameMap[p.user_id] || 'Unknown'),
      }))
      setPendingFeedbacks(pending)
      setCreatorNames({ ...userNameMap })
    }

    // Fetch new feedbacks (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const { data: recentFb } = await supabase
      .from('interview_feedback')
      .select(`
        id, interview_id, overall_rating, recommendation, submitted_at, user_id,
        interview:interview_id(
          scheduled_at,
          application:applications(
            candidate:candidates(first_name, last_name),
            job:jobs(title)
          )
        )
      `)
      .eq('organization_id', organization.id)
      .gte('submitted_at', sevenDaysAgo)
      .order('submitted_at', { ascending: false })
      .limit(20)

    if (recentFb && recentFb.length > 0) {
      // Resolve feedback submitter names via server action
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fbUserIds: string[] = Array.from(new Set(recentFb.map((fb: any) => fb.user_id as string).filter(Boolean)))
      const missingIds = fbUserIds.filter((id) => !userNameMap[id])
      if (missingIds.length > 0) {
        const { data: fbNames } = await resolveUserNames(missingIds)
        if (fbNames) {
          Object.assign(userNameMap, fbNames)
          setCreatorNames({ ...userNameMap })
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped = recentFb.map((fb: any) => ({
        id: fb.id,
        interview_id: fb.interview_id,
        overall_rating: fb.overall_rating,
        recommendation: fb.recommendation,
        submitted_at: fb.submitted_at,
        candidate_name: `${fb.interview?.application?.candidate?.first_name ?? ''} ${fb.interview?.application?.candidate?.last_name ?? ''}`.trim(),
        job_title: fb.interview?.application?.job?.title ?? 'Unknown Position',
        submitted_by: userNameMap[fb.user_id] || 'Unknown',
      }))
      setRecentFeedbacks(mapped)
    }

    setInterviewsLoaded(true)
  }, [organization, interviewsLoaded])

  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({})

  // Recruiters default to interviews tab (no dashboard tab for them)
  useEffect(() => {
    if (isRecruiter && !isAdmin) setActiveTab('interviews')
  }, [isRecruiter, isAdmin])

  useEffect(() => {
    if (activeTab === 'interviews' && !interviewsLoaded) {
      loadDetailedInterviews()
    }
  }, [activeTab, interviewsLoaded, loadDetailedInterviews])

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

  if (!isLoading && !canViewDashboard && !isRecruiter && !isInterviewer) {
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

      {/* ── Tabs ── */}
      {!isInterviewer && (
        <div className="flex items-center gap-6 border-b border-gray-200">
          {isAdmin && (
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`pb-2.5 text-[13px] font-medium transition-colors relative ${
                activeTab === 'dashboard'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Dashboard
            </button>
          )}
          <button
            onClick={() => setActiveTab('interviews')}
            className={`pb-2.5 text-[13px] font-medium transition-colors relative ${
              activeTab === 'interviews'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Interviews
          </button>
        </div>
      )}

      {/* ── Interviews Tab ── */}
      {activeTab === 'interviews' && !isInterviewer && (
        <InterviewsTab
          detailedInterviews={detailedInterviews}
          pastInterviews={pastInterviews}
          pendingFeedbacks={pendingFeedbacks}
          recentFeedbacks={recentFeedbacks}
          interviewsLoaded={interviewsLoaded}
          creatorNames={creatorNames}
          getGradient={getGradient}
          userId={user?.id ?? ''}
        />
      )}

      {/* ── Dashboard Tab ── */}
      {activeTab === 'dashboard' && (
      <>

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
        <>
          <AvailabilitySection userId={user.id} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <InterviewerWidgets orgId={organization.id} userId={user.id} interviews={interviews} />
          </div>
        </>
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
      </>
      )}
    </div>
  )
}

/* ── Interviews Tab Component ── */
function InterviewsTab({
  detailedInterviews,
  pastInterviews,
  pendingFeedbacks,
  recentFeedbacks,
  interviewsLoaded,
  creatorNames,
  getGradient: getGrad,
  userId,
}: {
  detailedInterviews: DetailedInterview[]
  pastInterviews: DetailedInterview[]
  pendingFeedbacks: PendingFeedbackItem[]
  recentFeedbacks: RecentFeedbackItem[]
  interviewsLoaded: boolean
  creatorNames: Record<string, string>
  getGradient: (name: string) => string
  userId: string
}) {
  if (!interviewsLoaded) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[140px] rounded-xl" />)}
      </div>
    )
  }

  function formatTimeRange(scheduledAt: string, durationMinutes: number) {
    const start = new Date(scheduledAt)
    const end = new Date(start.getTime() + durationMinutes * 60000)
    const fmt = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    return `${fmt(start)} - ${fmt(end)}`
  }

  function getRelativeDay(dateStr: string) {
    const date = new Date(dateStr)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.toDateString() === today.toDateString()) return { label: 'Today', color: 'text-blue-600 bg-blue-50' }
    if (date.toDateString() === tomorrow.toDateString()) return { label: 'Tomorrow', color: 'text-amber-600 bg-amber-50' }

    const diffDays = Math.ceil((date.getTime() - today.getTime()) / 86400000)
    if (diffDays > 0 && diffDays <= 7) return { label: `In ${diffDays} days`, color: 'text-gray-600 bg-gray-50' }
    if (diffDays < 0) {
      const ago = Math.abs(diffDays)
      return { label: ago === 1 ? 'Yesterday' : `${ago} days ago`, color: 'text-gray-400 bg-gray-50' }
    }
    return { label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), color: 'text-gray-500 bg-gray-50' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getPanelistName(panelist: any): string {
    return creatorNames[panelist.user_id] || panelist.user?.raw_user_meta_data?.full_name || panelist.user?.email || 'Unknown'
  }

  function renderInterviewCard(iv: DetailedInterview) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidate = (iv.application as any)?.candidate
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = (iv.application as any)?.job
    const name = `${candidate?.first_name ?? ''} ${candidate?.last_name ?? ''}`.trim()
    const initials = `${candidate?.first_name?.[0] ?? ''}${candidate?.last_name?.[0] ?? ''}`.toUpperCase()
    const scheduledDate = new Date(iv.scheduled_at)
    const relDay = getRelativeDay(iv.scheduled_at)
    const panelists = iv.interview_panelists ?? []
    const scheduledBy = creatorNames[iv.created_by] || 'Unknown'
    const isPast = new Date(iv.scheduled_at) < new Date()

    return (
      <Link key={iv.id} href={`/interviews/${iv.id}`}>
        <div className={`group bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-200 p-5 ${isPast ? 'opacity-75' : ''}`}>
          <div className="flex gap-5">
            {/* Date block */}
            <div className="shrink-0 text-center w-16">
              <div className="bg-red-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-t-lg px-2 py-0.5">
                {scheduledDate.toLocaleDateString('en-US', { month: 'short' })}
              </div>
              <div className="border border-t-0 border-gray-200 rounded-b-lg py-1.5">
                <div className="text-[22px] font-bold text-gray-900 leading-none">{scheduledDate.getDate()}</div>
                <div className="text-[10px] text-gray-400 uppercase font-medium mt-0.5">
                  {scheduledDate.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${getGrad(name)} flex items-center justify-center shrink-0`}>
                      <span className="text-[9px] font-semibold text-white">{initials}</span>
                    </div>
                    <h4 className="text-[14px] font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                      {name}
                    </h4>
                  </div>
                  <p className="text-[12px] text-gray-500 mt-1">{job?.title ?? 'Unknown Position'}</p>
                </div>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${relDay.color}`}>
                  {relDay.label}
                </span>
              </div>

              {/* Time + Type + Location */}
              <div className="flex items-center gap-3 text-[12px] text-gray-500">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  {formatTimeRange(iv.scheduled_at, iv.duration_minutes)}
                </span>
                <span className="w-px h-3 bg-gray-200" />
                <span className="capitalize flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${INTERVIEW_TYPE_DOT[iv.interview_type] ?? 'bg-gray-300'}`} />
                  {iv.interview_type}
                </span>
                {(iv.meeting_link || iv.location) && (
                  <>
                    <span className="w-px h-3 bg-gray-200" />
                    <span className="text-gray-400 truncate max-w-[200px]">
                      {iv.meeting_link ? 'Google Meet' : iv.location}
                    </span>
                  </>
                )}
              </div>

              {/* Panelists */}
              {panelists.length > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className="text-gray-400 font-medium">Interviewer</span>
                  <span>{panelists.map(getPanelistName).join(', ')}</span>
                </div>
              )}

              {/* Scheduled by */}
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-gray-400">
                  Scheduled by <span className="text-gray-500 font-medium">{scheduledBy}</span>
                </div>
                {iv.meeting_link && !isPast && (
                  <a
                    href={iv.meeting_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    Join Meeting
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </Link>
    )
  }

  return (
    <div className="space-y-8">
      {/* My Availability */}
      {userId && <AvailabilitySection userId={userId} />}

      {/* Upcoming Interviews */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-gray-900">Upcoming Interviews</h2>
          <Link href="/interviews" className="text-[12px] text-blue-600 hover:text-blue-700 font-medium">
            View all interviews
          </Link>
        </div>

        {detailedInterviews.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-[13px] text-gray-400 font-medium">No upcoming interviews</p>
            <p className="text-[11px] text-gray-300 mt-0.5">Scheduled interviews will appear here</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {detailedInterviews.map(renderInterviewCard)}
          </div>
        )}
      </div>

      {/* Recent Interviews (Top 10) */}
      {pastInterviews.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold text-gray-900">Recent Interviews</h2>
            <span className="text-[11px] text-gray-400">{pastInterviews.slice(0, 10).length} of {pastInterviews.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pastInterviews.slice(0, 10).map((iv) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const candidate = (iv.application as any)?.candidate
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const job = (iv.application as any)?.job
              const name = `${candidate?.first_name ?? ''} ${candidate?.last_name ?? ''}`.trim()
              const initials = `${candidate?.first_name?.[0] ?? ''}${candidate?.last_name?.[0] ?? ''}`.toUpperCase()
              const scheduledDate = new Date(iv.scheduled_at)
              const relDay = getRelativeDay(iv.scheduled_at)
              const panelists = iv.interview_panelists ?? []

              return (
                <Link key={iv.id} href={`/interviews/${iv.id}`}>
                  <div className="group bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-200 p-4">
                    <div className="flex items-center gap-3 mb-2.5">
                      <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getGrad(name)} flex items-center justify-center shrink-0`}>
                        <span className="text-[10px] font-semibold text-white">{initials}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">{name}</p>
                        <p className="text-[11px] text-gray-400 truncate">{job?.title ?? 'Unknown Position'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-2 text-[11px] text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-gray-400" />
                        {scheduledDate.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}
                      </span>
                      <span className="w-px h-3 bg-gray-200" />
                      <span className="capitalize flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${INTERVIEW_TYPE_DOT[iv.interview_type] ?? 'bg-gray-300'}`} />
                        {iv.interview_type}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      {panelists.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {panelists.slice(0, 2).map((p, idx) => (
                            <span key={idx} className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                              {getPanelistName(p)}
                            </span>
                          ))}
                          {panelists.length > 2 && (
                            <span className="text-[10px] text-gray-400">+{panelists.length - 2}</span>
                          )}
                        </div>
                      )}
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${relDay.color}`}>
                        {relDay.label}
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* New Feedbacks (last 7 days) */}
      <div>
        <h2 className="text-[15px] font-semibold text-gray-900 mb-4">New Feedbacks (Last 7 Days)</h2>

        {recentFeedbacks.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
              <MessageSquare className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-[13px] text-gray-400 font-medium">No New Feedbacks</p>
            <p className="text-[11px] text-gray-300 mt-0.5">Feedbacks submitted in the last 7 days will appear here</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {recentFeedbacks.map((fb) => {
              const initials = fb.candidate_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
              const ratingColor = fb.overall_rating >= 4 ? 'text-emerald-600 bg-emerald-50' : fb.overall_rating >= 3 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50'
              const recLabel = fb.recommendation === 'strong_yes' ? 'Strong Yes' : fb.recommendation === 'yes' ? 'Yes' : fb.recommendation === 'no' ? 'No' : fb.recommendation === 'strong_no' ? 'Strong No' : fb.recommendation
              const recColor = fb.recommendation.includes('yes') ? 'text-emerald-600' : 'text-red-600'

              return (
                <Link key={fb.id} href={`/interviews/${fb.interview_id}`}>
                  <div className="bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-200 p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getGrad(fb.candidate_name)} flex items-center justify-center shrink-0`}>
                        <span className="text-[11px] font-semibold text-white">{initials}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-gray-900 truncate">{fb.candidate_name}</p>
                        <p className="text-[11px] text-gray-400 truncate">{fb.job_title}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${ratingColor}`}>
                        {fb.overall_rating}/5
                      </span>
                      <span className={`text-[11px] font-medium capitalize ${recColor}`}>
                        {recLabel}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-gray-400">
                      <span>by {fb.submitted_by}</span>
                      <span>{new Date(fb.submitted_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Pending Feedbacks */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-gray-900">Pending Feedbacks (Last 30 Days)</h2>
          {pendingFeedbacks.length > 0 && (
            <Link href="/interviews" className="text-[12px] text-blue-600 hover:text-blue-700 font-medium">
              View All
            </Link>
          )}
        </div>

        {pendingFeedbacks.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
              <MessageSquare className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-[13px] text-gray-400 font-medium">No Pending Feedbacks</p>
            <p className="text-[11px] text-gray-300 mt-0.5">All feedbacks are up to date</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {pendingFeedbacks.map((fb) => {
              const initials = fb.candidate_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
              const daysAgo = Math.floor((Date.now() - new Date(fb.scheduled_at).getTime()) / 86400000)
              const daysLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`
              const urgencyColor = daysAgo >= 14 ? 'text-red-500' : daysAgo >= 7 ? 'text-orange-500' : 'text-amber-500'

              return (
                <div key={fb.interview_id} className="bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-200 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getGrad(fb.candidate_name)} flex items-center justify-center shrink-0`}>
                      <span className="text-[11px] font-semibold text-white">{initials}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-gray-900 truncate">{fb.candidate_name}</p>
                      <p className="text-[11px] text-gray-400 truncate">{fb.job_title}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-[11px] text-gray-500">
                      {new Date(fb.scheduled_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      fb.interview_status === 'completed'
                        ? 'text-emerald-600 bg-emerald-50'
                        : 'text-blue-600 bg-blue-50'
                    }`}>
                      {fb.interview_status === 'completed' ? 'Completed' : 'Scheduled'}
                    </span>
                  </div>
                  {fb.panelist_names.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {fb.panelist_names.map((name, idx) => (
                        <span key={idx} className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-medium ${urgencyColor}`}>{daysLabel}</span>
                    <Link
                      href={`/interviews/${fb.interview_id}`}
                      className="text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      Give Feedback
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* All Planned Interviews — Calendar View */}
      <InterviewCalendarView
        interviews={[...detailedInterviews, ...pastInterviews]}
        getGradient={getGrad}
        creatorNames={creatorNames}
      />
    </div>
  )
}

/* ── Interview Calendar View ── */
function InterviewCalendarView({
  interviews,
  getGradient: getGrad,
  creatorNames,
}: {
  interviews: DetailedInterview[]
  getGradient: (name: string) => string
  creatorNames: Record<string, string>
}) {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [calendarMonth, setCalendarMonth] = useState(new Date())

  // Get interviews for the selected date
  const dayInterviews = interviews
    .filter((iv) => {
      const d = new Date(iv.scheduled_at)
      return d.toDateString() === selectedDate.toDateString()
    })
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

  // Dates with interviews for dots on calendar
  const interviewDates = new Set(
    interviews.map((iv) => new Date(iv.scheduled_at).toDateString())
  )

  // Calendar helpers
  const year = calendarMonth.getFullYear()
  const month = calendarMonth.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDayOfWeek = (firstDay.getDay() + 6) % 7 // Monday = 0
  const daysInMonth = lastDay.getDate()

  const prevMonth = () => setCalendarMonth(new Date(year, month - 1, 1))
  const nextMonth = () => setCalendarMonth(new Date(year, month + 1, 1))

  const today = new Date()
  const HOURS = Array.from({ length: 24 }, (_, i) => i)

  // Get interview position on timeline
  function getInterviewStyle(iv: DetailedInterview) {
    const start = new Date(iv.scheduled_at)
    const topMinutes = start.getHours() * 60 + start.getMinutes()
    const heightMinutes = iv.duration_minutes || 60
    return {
      top: `${(topMinutes / 60) * 64}px`,
      height: `${Math.max((heightMinutes / 60) * 64, 28)}px`,
    }
  }

  return (
    <div>
      <h2 className="text-[15px] font-semibold text-gray-900 mb-4">All Planned Interviews</h2>
      <div className="flex gap-4">
        {/* Left: Day Timeline */}
        <div className="flex-1 bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-[13px] font-medium text-gray-700">
              {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
            <span className="text-[11px] text-gray-400">
              {dayInterviews.length} interview{dayInterviews.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="relative overflow-y-auto" style={{ height: 340 }}>
            {/* Hour grid lines */}
            {HOURS.map((hour) => (
              <div key={hour} className="flex items-start" style={{ height: 64 }}>
                <div className="w-16 shrink-0 pr-3 text-right">
                  <span className="text-[11px] text-gray-400 tabular-nums">
                    {hour === 0 ? '12:00 AM' : hour < 12 ? `${hour}:00 AM` : hour === 12 ? '12:00 PM' : `${hour - 12}:00 PM`}
                  </span>
                </div>
                <div className="flex-1 border-t border-gray-100 relative" />
              </div>
            ))}

            {/* Interview blocks overlaid on timeline */}
            <div className="absolute inset-0" style={{ left: 64 }}>
              {dayInterviews.map((iv) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const candidate = (iv.application as any)?.candidate
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const job = (iv.application as any)?.job
                const name = `${candidate?.first_name ?? ''} ${candidate?.last_name ?? ''}`.trim()
                const initials = `${candidate?.first_name?.[0] ?? ''}${candidate?.last_name?.[0] ?? ''}`.toUpperCase()
                const startTime = new Date(iv.scheduled_at)
                const style = getInterviewStyle(iv)
                const typeColor = iv.interview_type === 'video' ? 'border-l-violet-400 bg-violet-50/60' :
                  iv.interview_type === 'phone' ? 'border-l-blue-400 bg-blue-50/60' :
                  iv.interview_type === 'onsite' ? 'border-l-emerald-400 bg-emerald-50/60' :
                  iv.interview_type === 'technical' ? 'border-l-amber-400 bg-amber-50/60' :
                  'border-l-rose-400 bg-rose-50/60'

                return (
                  <Link key={iv.id} href={`/interviews/${iv.id}`}>
                    <div
                      className={`absolute right-2 left-1 rounded-md border-l-[3px] ${typeColor} hover:shadow-md transition-shadow cursor-pointer px-2.5 py-1.5 overflow-hidden`}
                      style={style}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${getGrad(name)} flex items-center justify-center shrink-0`}>
                          <span className="text-[7px] font-semibold text-white">{initials}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-gray-900 truncate">{name}</p>
                          <p className="text-[10px] text-gray-500 truncate">
                            {startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {job?.title ?? 'Unknown'} · {iv.interview_type}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>

            {/* Current time indicator */}
            {selectedDate.toDateString() === today.toDateString() && (
              <div
                className="absolute left-16 right-0 flex items-center z-10 pointer-events-none"
                style={{ top: `${((today.getHours() * 60 + today.getMinutes()) / 60) * 64}px` }}
              >
                <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                <div className="flex-1 h-px bg-red-500" />
              </div>
            )}
          </div>
        </div>

        {/* Right: Mini Calendar + Search */}
        <div className="w-[280px] shrink-0 space-y-3">
          {/* Mini Calendar */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-3">
              <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded transition-colors">
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <span className="text-[13px] font-semibold text-gray-900">
                {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded transition-colors">
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <div key={i} className="text-center text-[11px] font-medium text-gray-400 py-1">{d}</div>
              ))}
            </div>

            {/* Date cells */}
            <div className="grid grid-cols-7">
              {/* Empty cells for offset */}
              {Array.from({ length: startDayOfWeek }, (_, i) => (
                <div key={`empty-${i}`} className="h-9" />
              ))}

              {/* Day cells */}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1
                const date = new Date(year, month, day)
                const dateStr = date.toDateString()
                const isToday = dateStr === today.toDateString()
                const isSelected = dateStr === selectedDate.toDateString()
                const hasInterview = interviewDates.has(dateStr)
                const isSunday = date.getDay() === 0

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(date)}
                    className={`h-9 flex flex-col items-center justify-center rounded-lg text-[12px] relative transition-colors ${
                      isSelected
                        ? 'bg-blue-600 text-white font-semibold'
                        : isToday
                        ? 'bg-blue-50 text-blue-600 font-semibold'
                        : isSunday
                        ? 'text-red-400 hover:bg-gray-50'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {day}
                    {hasInterview && !isSelected && (
                      <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-red-400" />
                    )}
                    {hasInterview && isSelected && (
                      <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-white" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Selected day summary */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2">
              {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
            {dayInterviews.length === 0 ? (
              <p className="text-[12px] text-gray-400">No interviews scheduled</p>
            ) : (
              <div className="space-y-2">
                {dayInterviews.map((iv) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const candidate = (iv.application as any)?.candidate
                  const name = `${candidate?.first_name ?? ''} ${candidate?.last_name ?? ''}`.trim()
                  const startTime = new Date(iv.scheduled_at)
                  const panelists = iv.interview_panelists ?? []

                  return (
                    <Link key={iv.id} href={`/interviews/${iv.id}`}>
                      <div className="flex items-center gap-2 py-1.5 hover:bg-gray-50 rounded px-1 -mx-1 transition-colors">
                        <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${getGrad(name)} flex items-center justify-center shrink-0`}>
                          <span className="text-[8px] font-semibold text-white">
                            {`${candidate?.first_name?.[0] ?? ''}${candidate?.last_name?.[0] ?? ''}`.toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium text-gray-900 truncate">{name}</p>
                          <p className="text-[10px] text-gray-400">
                            {startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            {panelists.length > 0 && ` · ${creatorNames[panelists[0].user_id] || 'Panel'}`}
                          </p>
                        </div>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${INTERVIEW_TYPE_DOT[iv.interview_type] ?? 'bg-gray-300'}`} />
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
