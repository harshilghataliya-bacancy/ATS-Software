'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useUser } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import {
  getDashboardStats,
  getTimeToHire,
  getPipelineConversion,
  getOfferAcceptanceRate,
  getHiringVelocity,
} from '@/lib/services/reports'
import { getJobs } from '@/lib/services/jobs'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

const ReportCharts = dynamic(() => import('./report-charts'), {
  loading: () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-[380px]" />
        <Skeleton className="h-[380px]" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-[380px]" />
        <Skeleton className="h-[380px]" />
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

export default function ReportsPage() {
  const { organization, isLoading: userLoading } = useUser()
  const [loading, setLoading] = useState(true)

  const [stats, setStats] = useState<Stats | null>(null)
  const [pipeline, setPipeline] = useState<PipelineStage[]>([])
  const [timeToHire, setTimeToHire] = useState<TimeToHireData | null>(null)
  const [offerRate, setOfferRate] = useState<OfferRate | null>(null)
  const [velocity, setVelocity] = useState<VelocityPoint[]>([])
  const [jobs, setJobs] = useState<JobOption[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string>('all')

  const loadReports = useCallback(async () => {
    if (!organization) return
    const supabase = createClient()

    const [statsRes, pipelineRes, tthRes, offerRes, velRes, jobsRes] =
      await Promise.all([
        getDashboardStats(supabase, organization.id),
        getPipelineConversion(supabase, organization.id, selectedJobId !== 'all' ? selectedJobId : undefined),
        getTimeToHire(supabase, organization.id),
        getOfferAcceptanceRate(supabase, organization.id),
        getHiringVelocity(supabase, organization.id),
        getJobs(supabase, organization.id, { limit: 100 }),
      ])

    if (statsRes.data) setStats(statsRes.data)
    if (pipelineRes.data) setPipeline(pipelineRes.data)
    if (tthRes.data) setTimeToHire(tthRes.data)
    if (offerRes.data) setOfferRate(offerRes.data)
    if (velRes.data) setVelocity(velRes.data)
    if (jobsRes.data) setJobs(jobsRes.data.map((j: Record<string, unknown>) => ({ id: j.id as string, title: j.title as string })))
    setLoading(false)
  }, [organization, selectedJobId])

  useEffect(() => {
    if (organization) loadReports()
  }, [organization, loadReports])

  if (userLoading || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500 mt-1">Hiring analytics and metrics</p>
        </div>
        <div className="w-64">
          <Select value={selectedJobId} onValueChange={setSelectedJobId}>
            <SelectTrigger>
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
        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm text-gray-500">Total Hires</p>
            <p className="text-3xl font-bold">{timeToHire?.total_hires ?? 0}</p>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-gray-500">All-time completed hires</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm text-gray-500">Avg Time-to-Hire</p>
            <p className="text-3xl font-bold">{timeToHire?.average_days ?? 0}<span className="text-base font-normal text-gray-500 ml-1">days</span></p>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-gray-500">From application to hire</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm text-gray-500">Offer Acceptance Rate</p>
            <p className="text-3xl font-bold">{offerRate?.acceptance_rate_pct ?? 0}<span className="text-base font-normal text-gray-500 ml-1">%</span></p>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-gray-500">{offerRate?.accepted ?? 0} accepted / {offerRate?.total_sent ?? 0} sent</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm text-gray-500">Active Pipeline</p>
            <p className="text-3xl font-bold">{stats?.active_candidates ?? 0}</p>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-gray-500">{stats?.open_jobs ?? 0} open jobs</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts — lazy-loaded */}
      <ReportCharts
        pipeline={pipeline}
        offerRate={offerRate}
        velocity={velocity}
        timeToHire={timeToHire}
      />
    </div>
  )
}
