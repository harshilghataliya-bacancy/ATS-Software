'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useUser } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getDashboardStats } from '@/lib/services/reports'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

export default function DashboardPage() {
  const { user, organization, isLoading } = useUser()
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
    if (!organization) return
    const supabase = createClient()

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
        .gt('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(5),
    ])

    if (statsResult.data) setStats(statsResult.data)
    if (activityResult.data) setActivities(activityResult.data as ActivityLog[])
    if (interviewsResult.data) setInterviews(interviewsResult.data as unknown as UpcomingInterview[])
    setLoading(false)
  }, [organization])

  useEffect(() => {
    if (organization) loadDashboard()
  }, [organization, loadDashboard])

  if (isLoading || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.full_name?.split(' ')[0]}
        </h1>
        <p className="text-gray-500 mt-1">
          Here&apos;s what&apos;s happening at {organization?.name}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/jobs">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="pb-2">
              <CardDescription>Open Jobs</CardDescription>
              <CardTitle className="text-3xl">{stats?.open_jobs ?? 0}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500">Published job postings</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/candidates">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="pb-2">
              <CardDescription>Active Candidates</CardDescription>
              <CardTitle className="text-3xl">{stats?.active_candidates ?? 0}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500">With active applications</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/interviews">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="pb-2">
              <CardDescription>Interviews This Week</CardDescription>
              <CardTitle className="text-3xl">{stats?.interviews_this_week ?? 0}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500">Scheduled this week</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/offers">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="pb-2">
              <CardDescription>Pending Offers</CardDescription>
              <CardTitle className="text-3xl">{stats?.pending_offers ?? 0}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500">Awaiting response</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Charts — lazy-loaded, won't block initial render */}
      {organization && <DashboardCharts orgId={organization.id} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No activity yet. Start by creating a job posting.
              </p>
            ) : (
              <div className="space-y-3">
                {activities.map((activity) => (
                  <div key={activity.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="text-[10px] shrink-0 capitalize">
                        {activity.entity_type}
                      </Badge>
                      <span className="text-gray-700 truncate">{formatAction(activity)}</span>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{timeAgo(activity.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upcoming Interviews</CardTitle>
          </CardHeader>
          <CardContent>
            {interviews.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No interviews scheduled.
              </p>
            ) : (
              <div className="space-y-3">
                {interviews.map((iv) => {
                  const candidate = (iv.application as unknown as { candidate: { first_name: string; last_name: string } })?.candidate
                  const job = (iv.application as unknown as { job: { title: string } })?.job
                  return (
                    <Link key={iv.id} href={`/interviews/${iv.id}`}>
                      <div className="flex items-center justify-between gap-3 text-sm p-2 rounded hover:bg-gray-50 cursor-pointer">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {candidate?.first_name} {candidate?.last_name}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{job?.title}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-700">
                            {new Date(iv.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {new Date(iv.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </p>
                          <Badge variant="outline" className="text-[10px] capitalize">{iv.interview_type}</Badge>
                        </div>
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
