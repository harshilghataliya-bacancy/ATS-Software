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
  getSourceBreakdown,
} from '@/lib/services/reports'
import { getJobs } from '@/lib/services/jobs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CheckCircle2, Clock, Mail, Users, BarChart3, CalendarDays, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'

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

const RecruiterPerformance = dynamic(() => import('./recruiter-performance'), {
  loading: () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[110px] rounded-xl" />)}
      </div>
      <Skeleton className="h-[380px] rounded-xl" />
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

interface SourceData {
  source: string
  total: number
  hired: number
  rejected: number
  active: number
  hire_rate: number
}

// Date range presets
const DATE_PRESETS: { label: string; value: string; getRange: () => { from: string; to: string } | undefined }[] = [
  { label: 'All Time', value: 'all', getRange: () => undefined },
  {
    label: 'This Month',
    value: 'this_month',
    getRange: () => {
      const now = new Date()
      const from = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: from.toISOString(), to: now.toISOString() }
    },
  },
  {
    label: 'Last 3 Months',
    value: 'last_3m',
    getRange: () => {
      const now = new Date()
      const from = new Date(now)
      from.setMonth(from.getMonth() - 3)
      return { from: from.toISOString(), to: now.toISOString() }
    },
  },
  {
    label: 'Last 6 Months',
    value: 'last_6m',
    getRange: () => {
      const now = new Date()
      const from = new Date(now)
      from.setMonth(from.getMonth() - 6)
      return { from: from.toISOString(), to: now.toISOString() }
    },
  },
  {
    label: 'This Year',
    value: 'this_year',
    getRange: () => {
      const now = new Date()
      const from = new Date(now.getFullYear(), 0, 1)
      return { from: from.toISOString(), to: now.toISOString() }
    },
  },
  {
    label: 'Last Year',
    value: 'last_year',
    getRange: () => {
      const now = new Date()
      const from = new Date(now.getFullYear() - 1, 0, 1)
      const to = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59)
      return { from: from.toISOString(), to: to.toISOString() }
    },
  },
]

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
  const { canViewReports, canViewFullReports } = useRole()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(canViewFullReports ? 'overview' : 'recruiter')

  const [stats, setStats] = useState<Stats | null>(null)
  const [pipeline, setPipeline] = useState<PipelineStage[]>([])
  const [timeToHire, setTimeToHire] = useState<TimeToHireData | null>(null)
  const [offerRate, setOfferRate] = useState<OfferRate | null>(null)
  const [velocity, setVelocity] = useState<VelocityPoint[]>([])
  const [jobs, setJobs] = useState<JobOption[]>([])
  const [jobStatusData, setJobStatusData] = useState<JobStatusData[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string>('all')
  const [datePreset, setDatePreset] = useState<string>('all')
  const [sourceData, setSourceData] = useState<SourceData[]>([])

  const loadReports = useCallback(async () => {
    if (!organization) return
    setLoading(true)

    // Recruiters only see their own performance tab — skip overview data
    if (!canViewFullReports) {
      setLoading(false)
      return
    }

    const supabase = createClient()
    const dateRange = DATE_PRESETS.find((p) => p.value === datePreset)?.getRange()
    const jobFilter = selectedJobId !== 'all' ? selectedJobId : undefined

    const [statsRes, pipelineRes, tthRes, offerRes, velRes, jobsRes, sourceRes, appsRes] =
      await Promise.all([
        getDashboardStats(supabase, organization.id, jobFilter),
        getPipelineConversion(supabase, organization.id, jobFilter, dateRange),
        getTimeToHire(supabase, organization.id, dateRange, jobFilter),
        getOfferAcceptanceRate(supabase, organization.id, dateRange, jobFilter),
        getHiringVelocity(supabase, organization.id, 6, dateRange, jobFilter),
        getJobs(supabase, organization.id, { limit: 100 }),
        getSourceBreakdown(supabase, organization.id, dateRange, jobFilter),
        (() => {
          let q = supabase
            .from('applications')
            .select('status, job:jobs(title)')
            .eq('organization_id', organization.id)
          if (jobFilter) q = q.eq('job_id', jobFilter)
          if (dateRange) q = q.gte('created_at', dateRange.from).lte('created_at', dateRange.to)
          return q
        })(),
      ])

    if (statsRes.data) setStats(statsRes.data)
    if (pipelineRes.data) setPipeline(pipelineRes.data)
    if (tthRes.data) setTimeToHire(tthRes.data)
    if (offerRes.data) setOfferRate(offerRes.data)
    if (velRes.data) setVelocity(velRes.data)
    if (jobsRes.data) setJobs(jobsRes.data.map((j: Record<string, unknown>) => ({ id: j.id as string, title: j.title as string })))
    if (sourceRes.data) setSourceData(sourceRes.data)

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization, selectedJobId, datePreset, canViewFullReports])

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

  function exportExcel() {
    if (activeTab !== 'overview') return

    const selectedDate = DATE_PRESETS.find((p) => p.value === datePreset)?.label ?? 'All Time'
    const selectedJob = selectedJobId !== 'all' ? jobs.find((j) => j.id === selectedJobId)?.title ?? '' : 'All Jobs'

    const wb = XLSX.utils.book_new()

    // Sheet 1: KPI Summary
    const kpiData = [
      ['HireFlow - Overview Report'],
      ['Generated', new Date().toLocaleDateString()],
      ['Date Range', selectedDate],
      ['Job Filter', selectedJob],
      [],
      ['Metric', 'Value'],
      ['Total Hires', kpiValues.total_hires],
      ['Avg Time-to-Hire (days)', kpiValues.avg_days],
      ['Offer Acceptance (%)', kpiValues.acceptance_pct],
      ['Active Pipeline', kpiValues.active_pipeline],
      ['Open Jobs', stats?.open_jobs ?? 0],
      ['Interviews This Week', stats?.interviews_this_week ?? 0],
      ['Pending Offers', stats?.pending_offers ?? 0],
      ['Offers Sent', offerRate?.total_sent ?? 0],
      ['Offers Accepted', offerRate?.accepted ?? 0],
      ['Offers Declined', offerRate?.declined ?? 0],
    ]
    const wsKpi = XLSX.utils.aoa_to_sheet(kpiData)
    wsKpi['!cols'] = [{ wch: 25 }, { wch: 15 }]
    XLSX.utils.book_append_sheet(wb, wsKpi, 'KPI Summary')

    // Sheet 2: Job Status
    if (jobStatusData.length > 0) {
      const jobData = [
        ['Job Title', 'Active', 'Hired', 'Rejected', 'Total'],
        ...jobStatusData.map((j) => [j.job_title, j.active, j.hired, j.rejected, j.active + j.hired + j.rejected]),
      ]
      const wsJobs = XLSX.utils.aoa_to_sheet(jobData)
      wsJobs['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }]
      XLSX.utils.book_append_sheet(wb, wsJobs, 'Job Status')
    }

    // Sheet 3: Pipeline Conversion
    if (pipeline.length > 0) {
      const pipeData = [
        ['Stage', 'Current Count', 'Total Reached', 'Conversion Rate (%)'],
        ...pipeline.map((s) => [s.stage_name, s.current_count, s.total_reached, s.conversion_rate]),
      ]
      const wsPipe = XLSX.utils.aoa_to_sheet(pipeData)
      wsPipe['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 }]
      XLSX.utils.book_append_sheet(wb, wsPipe, 'Pipeline')
    }

    // Sheet 4: Source Effectiveness
    if (sourceData.length > 0) {
      const srcData = [
        ['Source', 'Total', 'Hired', 'Rejected', 'Active', 'Hire Rate (%)'],
        ...sourceData.map((s) => [s.source, s.total, s.hired, s.rejected, s.active, s.hire_rate]),
      ]
      const wsSrc = XLSX.utils.aoa_to_sheet(srcData)
      wsSrc['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 15 }]
      XLSX.utils.book_append_sheet(wb, wsSrc, 'Source Effectiveness')
    }

    // Sheet 5: Hiring Velocity
    if (velocity.length > 0) {
      const velData = [
        ['Month', 'Hires'],
        ...velocity.map((v) => [v.month, v.hires]),
      ]
      const wsVel = XLSX.utils.aoa_to_sheet(velData)
      wsVel['!cols'] = [{ wch: 15 }, { wch: 10 }]
      XLSX.utils.book_append_sheet(wb, wsVel, 'Hiring Velocity')
    }

    // Sheet 6: Time-to-Hire
    if (timeToHire?.breakdown && timeToHire.breakdown.length > 0) {
      const tthData = [
        ['Department', 'Avg Days', 'Total Hires'],
        ...timeToHire.breakdown.map((d) => [d.department, d.average_days, d.total_hires]),
      ]
      const wsTth = XLSX.utils.aoa_to_sheet(tthData)
      wsTth['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }]
      XLSX.utils.book_append_sheet(wb, wsTth, 'Time-to-Hire')
    }

    // Offer Acceptance sheet
    if (offerRate) {
      const offerData = [
        ['Total Sent', 'Accepted', 'Declined', 'Acceptance Rate (%)'],
        [offerRate.total_sent, offerRate.accepted, offerRate.declined, offerRate.acceptance_rate_pct],
      ]
      const wsOffer = XLSX.utils.aoa_to_sheet(offerData)
      wsOffer['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 }]
      XLSX.utils.book_append_sheet(wb, wsOffer, 'Offer Acceptance')
    }

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `hireflow-overview-report-${new Date().toISOString().split('T')[0]}.xlsx`
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
          {activeTab === 'overview' && (
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportExcel}>
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export Report
            </Button>
          )}
          {activeTab === 'overview' && (
            <>
              <div className="w-44">
                <Select value={datePreset} onValueChange={setDatePreset}>
                  <SelectTrigger className="h-9 bg-white border-gray-200 text-sm">
                    <CalendarDays className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                    <SelectValue placeholder="Date range" />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {canViewFullReports && <TabsTrigger value="overview">Overview</TabsTrigger>}
          <TabsTrigger value="recruiter">Recruiter Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-6">
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
              sourceData={sourceData}
              selectedJobTitle={selectedJobId !== 'all' ? jobs.find((j) => j.id === selectedJobId)?.title : undefined}
            />
          </div>
        </TabsContent>

        <TabsContent value="recruiter">
          <RecruiterPerformance />
        </TabsContent>
      </Tabs>
    </div>
  )
}
