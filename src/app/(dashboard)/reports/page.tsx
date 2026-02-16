'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import {
  getDashboardStats,
  getTimeToHire,
  getPipelineConversion,
  getOfferAcceptanceRate,
  getHiringVelocity,
} from '@/lib/services/reports'
import { getJobs } from '@/lib/services/jobs'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

const ReportCharts = dynamic(() => import('./report-charts'), {
  loading: () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-[400px] rounded-xl" />
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-[400px] rounded-xl" />
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
    </div>
  ),
  ssr: false,
})

interface Stats {
  open_jobs: number
  active_candidates: number
  interviews_this_week: number
  pending_offers: number
}

interface PipelineStage {
  stage_name: string
  stage_type: string
  display_order: number
  current_count: number
  total_reached: number
  conversion_rate: number
}

interface TimeToHireData {
  average_days: number
  total_hires: number
  breakdown: Array<{ department: string; average_days: number; total_hires: number }>
}

interface OfferRate {
  total_sent: number
  accepted: number
  declined: number
  acceptance_rate_pct: number
}

interface VelocityPoint {
  month: string
  hires: number
}

interface JobOption {
  id: string
  title: string
}

interface JobStatusData {
  job_title: string
  active: number
  hired: number
  rejected: number
}

const KPI_CONFIG = [
  {
    key: 'total_hires',
    label: 'Total Hires',
    sub: 'All-time completed hires',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    bg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    accent: 'border-l-emerald-500',
  },
  {
    key: 'avg_days',
    label: 'Avg Time-to-Hire',
    sub: 'From application to hire',
    suffix: 'days',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    bg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    accent: 'border-l-blue-500',
  },
  {
    key: 'acceptance_pct',
    label: 'Offer Acceptance',
    sub: '',
    suffix: '%',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    ),
    bg: 'bg-purple-50',
    iconColor: 'text-purple-600',
    accent: 'border-l-purple-500',
  },
  {
    key: 'active_pipeline',
    label: 'Active Pipeline',
    sub: '',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    bg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    accent: 'border-l-amber-500',
  },
]

export default function ReportsPage() {
  const { organization, isLoading: userLoading } = useUser()
  const { canViewReports } = useRole()
  const [loading, setLoading] = useState(true)

  const [stats, setStats] = useState<Stats | null>(null)
  const [pipeline, setPipeline] = useState<PipelineStage[]>([])
  const [timeToHire, setTimeToHire] = useState<TimeToHireData | null>(null)
  const [offerRate, setOfferRate] = useState<OfferRate | null>(null)
  const [velocity, setVelocity] = useState<VelocityPoint[]>([])
  const [jobs, setJobs] = useState<JobOption[]>([])
  const [jobStatusData, setJobStatusData] = useState<JobStatusData[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string>('all')

  const loadReports = useCallback(async () => {
    if (!organization) return
    setLoading(true)
    const supabase = createClient()

    const [statsRes, pipelineRes, tthRes, offerRes, velRes, jobsRes, appsRes] =
      await Promise.all([
        getDashboardStats(supabase, organization.id),
        getPipelineConversion(supabase, organization.id, selectedJobId !== 'all' ? selectedJobId : undefined),
        getTimeToHire(supabase, organization.id),
        getOfferAcceptanceRate(supabase, organization.id),
        getHiringVelocity(supabase, organization.id),
        getJobs(supabase, organization.id, { limit: 100 }),
        (() => {
          let q = supabase
            .from('applications')
            .select('status, job:jobs(title)')
            .eq('organization_id', organization.id)
          if (selectedJobId !== 'all') q = q.eq('job_id', selectedJobId)
          return q
        })(),
      ])

    if (statsRes.data) setStats(statsRes.data)
    if (pipelineRes.data) setPipeline(pipelineRes.data)
    if (tthRes.data) setTimeToHire(tthRes.data)
    if (offerRes.data) setOfferRate(offerRes.data)
    if (velRes.data) setVelocity(velRes.data)
    if (jobsRes.data) setJobs(jobsRes.data.map((j: Record<string, unknown>) => ({ id: j.id as string, title: j.title as string })))

    // Build job status data
    if (appsRes.data) {
      const jobMap = new Map<string, { active: number; hired: number; rejected: number }>()
      for (const app of appsRes.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const title = (app.job as any)?.title ?? 'Unknown'
        const existing = jobMap.get(title) ?? { active: 0, hired: 0, rejected: 0 }
        if (app.status === 'active') existing.active += 1
        else if (app.status === 'hired') existing.hired += 1
        else if (app.status === 'rejected') existing.rejected += 1
        jobMap.set(title, existing)
      }
      setJobStatusData(
        Array.from(jobMap.entries())
          .map(([job_title, counts]) => ({ job_title, ...counts }))
          .sort((a, b) => (b.active + b.hired + b.rejected) - (a.active + a.hired + a.rejected))
      )
    }

    setLoading(false)
  }, [organization, selectedJobId])

  useEffect(() => {
    if (organization) loadReports()
  }, [organization, loadReports])

  if (!userLoading && !canViewReports) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold text-gray-900">Access Denied</h2>
        <p className="text-gray-500 mt-1">Only administrators and recruiters can view reports.</p>
      </div>
    )
  }

  if (userLoading || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[110px] rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[380px] rounded-xl" />)}
        </div>
      </div>
    )
  }

  const kpiValues: Record<string, number> = {
    total_hires: timeToHire?.total_hires ?? 0,
    avg_days: timeToHire?.average_days ?? 0,
    acceptance_pct: offerRate?.acceptance_rate_pct ?? 0,
    active_pipeline: stats?.active_candidates ?? 0,
  }

  const kpiSubs: Record<string, string> = {
    total_hires: 'All-time completed hires',
    avg_days: 'From application to hire',
    acceptance_pct: `${offerRate?.accepted ?? 0} accepted / ${offerRate?.total_sent ?? 0} sent`,
    active_pipeline: `${stats?.open_jobs ?? 0} open jobs`,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500 mt-1">Hiring analytics and metrics</p>
        </div>
        <div className="w-64">
          <Select value={selectedJobId} onValueChange={setSelectedJobId}>
            <SelectTrigger className="bg-white">
              <SelectValue placeholder="Filter by job" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Jobs</SelectItem>
              {jobs.map((j) => (
                <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {KPI_CONFIG.map((kpi) => (
          <Card key={kpi.key} className={`border-l-4 ${kpi.accent} shadow-sm hover:shadow-md transition-shadow`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">{kpi.label}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {kpiValues[kpi.key]}
                    {'suffix' in kpi && kpi.suffix && (
                      <span className="text-base font-normal text-gray-400 ml-1">{kpi.suffix}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{kpiSubs[kpi.key]}</p>
                </div>
                <div className={`p-2.5 rounded-lg ${kpi.bg} ${kpi.iconColor}`}>
                  {kpi.icon}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <ReportCharts
        pipeline={pipeline}
        jobStatusData={jobStatusData}
        velocity={velocity}
        timeToHire={timeToHire}
        selectedJobTitle={selectedJobId !== 'all' ? jobs.find((j) => j.id === selectedJobId)?.title : undefined}
      />
    </div>
  )
}
