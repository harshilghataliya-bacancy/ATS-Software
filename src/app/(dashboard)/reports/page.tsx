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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckCircle2, Clock, Mail, Users, BarChart3, CalendarDays, FileSpreadsheet, Filter } from 'lucide-react'
import * as XLSX from 'xlsx'

const ReportCharts = dynamic(() => import('./report-charts'), {
  loading: () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-[360px] rounded-xl" />
        <Skeleton className="h-[360px] rounded-xl" />
      </div>
    </div>
  ),
  ssr: false,
})

const RecruiterPerformance = dynamic(() => import('./recruiter-performance'), {
  loading: () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[100px] rounded-xl" />)}
      </div>
      <Skeleton className="h-[360px] rounded-xl" />
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

/* ── KPI gradient accents ── */
const KPI_CONFIG = [
  { key: 'total_hires', label: 'Total Hires', suffix: '', icon: <CheckCircle2 className="w-4 h-4" />, gradient: 'from-emerald-500 to-teal-600', iconBg: 'bg-emerald-50 text-emerald-600' },
  { key: 'avg_days', label: 'Avg Time-to-Hire', suffix: 'days', icon: <Clock className="w-4 h-4" />, gradient: 'from-blue-500 to-indigo-600', iconBg: 'bg-blue-50 text-blue-600' },
  { key: 'acceptance_pct', label: 'Offer Acceptance', suffix: '%', icon: <Mail className="w-4 h-4" />, gradient: 'from-violet-500 to-purple-600', iconBg: 'bg-violet-50 text-violet-600' },
  { key: 'active_pipeline', label: 'Active Pipeline', suffix: '', icon: <Users className="w-4 h-4" />, gradient: 'from-amber-500 to-orange-600', iconBg: 'bg-amber-50 text-amber-600' },
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
  const [showFilters, setShowFilters] = useState(false)

  const activeFilterCount = [selectedJobId !== 'all' ? selectedJobId : '', datePreset !== 'all' ? datePreset : ''].filter(Boolean).length

  const loadReports = useCallback(async () => {
    if (!organization) return
    setLoading(true)

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
      <div className="text-center py-16">
        <BarChart3 className="w-8 h-8 text-gray-300 mx-auto mb-3" />
        <h2 className="text-[13px] font-semibold text-gray-900">Access Denied</h2>
        <p className="text-[11px] text-gray-400 mt-1">Only administrators and recruiters can view reports.</p>
      </div>
    )
  }

  if (userLoading || loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[100px] rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map((i) => <Skeleton key={i} className="h-[360px] rounded-xl" />)}
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

    if (jobStatusData.length > 0) {
      const jobData = [
        ['Job Title', 'Active', 'Hired', 'Rejected', 'Total'],
        ...jobStatusData.map((j) => [j.job_title, j.active, j.hired, j.rejected, j.active + j.hired + j.rejected]),
      ]
      const wsJobs = XLSX.utils.aoa_to_sheet(jobData)
      wsJobs['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }]
      XLSX.utils.book_append_sheet(wb, wsJobs, 'Job Status')
    }

    if (pipeline.length > 0) {
      const pipeData = [
        ['Stage', 'Current Count', 'Total Reached', 'Conversion Rate (%)'],
        ...pipeline.map((s) => [s.stage_name, s.current_count, s.total_reached, s.conversion_rate]),
      ]
      const wsPipe = XLSX.utils.aoa_to_sheet(pipeData)
      wsPipe['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 }]
      XLSX.utils.book_append_sheet(wb, wsPipe, 'Pipeline')
    }

    if (sourceData.length > 0) {
      const srcData = [
        ['Source', 'Total', 'Hired', 'Rejected', 'Active', 'Hire Rate (%)'],
        ...sourceData.map((s) => [s.source, s.total, s.hired, s.rejected, s.active, s.hire_rate]),
      ]
      const wsSrc = XLSX.utils.aoa_to_sheet(srcData)
      wsSrc['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 15 }]
      XLSX.utils.book_append_sheet(wb, wsSrc, 'Source Effectiveness')
    }

    if (velocity.length > 0) {
      const velData = [
        ['Month', 'Hires'],
        ...velocity.map((v) => [v.month, v.hires]),
      ]
      const wsVel = XLSX.utils.aoa_to_sheet(velData)
      wsVel['!cols'] = [{ wch: 15 }, { wch: 10 }]
      XLSX.utils.book_append_sheet(wb, wsVel, 'Hiring Velocity')
    }

    if (timeToHire?.breakdown && timeToHire.breakdown.length > 0) {
      const tthData = [
        ['Department', 'Avg Days', 'Total Hires'],
        ...timeToHire.breakdown.map((d) => [d.department, d.average_days, d.total_hires]),
      ]
      const wsTth = XLSX.utils.aoa_to_sheet(tthData)
      wsTth['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }]
      XLSX.utils.book_append_sheet(wb, wsTth, 'Time-to-Hire')
    }

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
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[15px] font-semibold text-gray-900">Reports</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">Hiring analytics and performance metrics</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'overview' && (
            <button onClick={exportExcel} className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export
            </button>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
          {canViewFullReports && (
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                activeTab === 'overview' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Overview
            </button>
          )}
          <button
            onClick={() => setActiveTab('recruiter')}
            className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
              activeTab === 'recruiter' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Recruiter Performance
          </button>
        </div>

        <div className="flex-1" />

        {activeTab === 'overview' && (
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[12px] font-medium transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${showFilters ? 'bg-white/20 text-white' : 'bg-gray-900 text-white'}`}>
                {activeFilterCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* ── Collapsible Filters ── */}
      {activeTab === 'overview' && showFilters && (
        <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Date Range</label>
              <Select value={datePreset} onValueChange={setDatePreset}>
                <SelectTrigger className="h-8 w-[160px] text-[12px]">
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
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Job</label>
              <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                <SelectTrigger className="h-8 w-[200px] text-[12px]">
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
            {activeFilterCount > 0 && (
              <div className="pt-4">
                <button
                  onClick={() => { setDatePreset('all'); setSelectedJobId('all') }}
                  className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Overview Tab ── */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {KPI_CONFIG.map((kpi) => (
              <div key={kpi.key} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className={`h-[2px] bg-gradient-to-r ${kpi.gradient}`} />
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{kpi.label}</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
                        {kpiValues[kpi.key]}
                        {kpi.suffix && (
                          <span className="text-[12px] font-normal text-gray-400 ml-1">{kpi.suffix}</span>
                        )}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{kpiSubs[kpi.key]}</p>
                    </div>
                    <div className={`p-2 rounded-lg ${kpi.iconBg}`}>
                      {kpi.icon}
                    </div>
                  </div>
                </div>
              </div>
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
      )}

      {/* ── Recruiter Performance Tab ── */}
      {activeTab === 'recruiter' && (
        <RecruiterPerformance />
      )}
    </div>
  )
}
