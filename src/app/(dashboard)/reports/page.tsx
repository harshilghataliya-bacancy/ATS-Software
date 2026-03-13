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
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckCircle2, Clock, Mail, Users, Download, BarChart3 } from 'lucide-react'

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
    icon: <CheckCircle2 className="w-5 h-5" />,
    bg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    accent: 'border-l-emerald-500',
  },
  {
    key: 'avg_days',
    label: 'Avg Time-to-Hire',
    sub: 'From application to hire',
    suffix: 'days',
    icon: <Clock className="w-5 h-5" />,
    bg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    accent: 'border-l-blue-500',
  },
  {
    key: 'acceptance_pct',
    label: 'Offer Acceptance',
    sub: '',
    suffix: '%',
    icon: <Mail className="w-5 h-5" />,
    bg: 'bg-purple-50',
    iconColor: 'text-purple-600',
    accent: 'border-l-purple-500',
  },
  {
    key: 'active_pipeline',
    label: 'Active Pipeline',
    sub: '',
    icon: <Users className="w-5 h-5" />,
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

  function exportCsv() {
    const rows: string[][] = []

    // KPI Summary
    rows.push(['--- KPI Summary ---'])
    rows.push(['Metric', 'Value'])
    rows.push(['Total Hires', String(kpiValues.total_hires)])
    rows.push(['Avg Time-to-Hire (days)', String(kpiValues.avg_days)])
    rows.push(['Offer Acceptance (%)', String(kpiValues.acceptance_pct)])
    rows.push(['Active Pipeline', String(kpiValues.active_pipeline)])
    rows.push(['Open Jobs', String(stats?.open_jobs ?? 0)])
    rows.push(['Interviews This Week', String(stats?.interviews_this_week ?? 0)])
    rows.push(['Pending Offers', String(stats?.pending_offers ?? 0)])
    rows.push([])

    // Pipeline Conversion
    if (pipeline.length > 0) {
      rows.push(['--- Pipeline Conversion ---'])
      rows.push(['Stage', 'Current Count', 'Total Reached', 'Conversion Rate (%)'])
      for (const s of pipeline) {
        rows.push([s.stage_name, String(s.current_count), String(s.total_reached), String(s.conversion_rate)])
      }
      rows.push([])
    }

    // Hiring Velocity
    if (velocity.length > 0) {
      rows.push(['--- Hiring Velocity ---'])
      rows.push(['Month', 'Hires'])
      for (const v of velocity) {
        rows.push([v.month, String(v.hires)])
      }
      rows.push([])
    }

    // Time-to-Hire by Department
    if (timeToHire?.breakdown && timeToHire.breakdown.length > 0) {
      rows.push(['--- Time-to-Hire by Department ---'])
      rows.push(['Department', 'Avg Days', 'Total Hires'])
      for (const d of timeToHire.breakdown) {
        rows.push([d.department, String(d.average_days), String(d.total_hires)])
      }
      rows.push([])
    }

    // Offer Acceptance
    if (offerRate) {
      rows.push(['--- Offer Acceptance ---'])
      rows.push(['Total Sent', 'Accepted', 'Declined', 'Acceptance Rate (%)'])
      rows.push([String(offerRate.total_sent), String(offerRate.accepted), String(offerRate.declined), String(offerRate.acceptance_rate_pct)])
      rows.push([])
    }

    // Job Status Breakdown
    if (jobStatusData.length > 0) {
      rows.push(['--- Job Status Breakdown ---'])
      rows.push(['Job Title', 'Active', 'Hired', 'Rejected'])
      for (const j of jobStatusData) {
        rows.push([j.job_title, String(j.active), String(j.hired), String(j.rejected)])
      }
    }

    // Build CSV string with proper escaping
    const csvContent = rows
      .map((row) => row.map((cell) => {
        if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
          return `"${cell.replace(/"/g, '""')}"`
        }
        return cell
      }).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `hireflow-report-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center shadow-sm shadow-violet-200">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
            <p className="text-sm text-gray-400 mt-0.5">Hiring analytics and metrics</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportCsv}>
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
          <div className="w-56">
            <Select value={selectedJobId} onValueChange={setSelectedJobId}>
              <SelectTrigger className="h-9 bg-white border-gray-200 text-sm">
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
