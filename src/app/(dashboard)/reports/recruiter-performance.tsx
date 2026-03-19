'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getRecruiterPerformance, getCandidateStageTimeline, type RecruiterMetrics, type CandidateStageTime, type DateRange } from '@/lib/services/reports'
import { getJobs } from '@/lib/services/jobs'
import { getRecruitersWithDetails, type RecruiterInfo } from './actions'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Users, CheckCircle2, Mail, Clock, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Download, User, FileSpreadsheet, CalendarDays, Filter } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const RecruiterCharts = dynamic(() => import('./recruiter-charts'), { ssr: false })

type SortKey = 'name' | 'applications_managed' | 'offers_created' | 'hires_closed' | 'rejections' | 'acceptance_rate' | 'hire_rate' | 'avg_time_to_hire'

interface MergedRow {
  user_id: string
  name: string
  email: string
  role: string
  metrics: RecruiterMetrics
}

// Fixed pipeline stage order for legend and display
const STAGE_ORDER = ['Applied', 'Screening', 'Assessment', 'Interview', 'Offer', 'Hired', 'Rejected']

// Stage colors — each visually distinct
const STAGE_COLOR_MAP: Record<string, string> = {
  Applied: '#3b82f6',
  Screening: '#f59e0b',
  Assessment: '#8b5cf6',
  Interview: '#ec4899',
  Offer: '#06b6d4',
  Hired: '#22c55e',
  Rejected: '#ef4444',
}
const STAGE_PALETTE_FALLBACK = ['#6366f1', '#14b8a6', '#f97316', '#a855f7', '#0ea5e9']

const STATUS_DOT: Record<string, string> = {
  active: 'bg-emerald-500',
  hired: 'bg-blue-500',
  rejected: 'bg-rose-400',
  withdrawn: 'bg-amber-400',
}

const STATUS_PILL: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  hired: 'bg-blue-50 text-blue-700 border-blue-200',
  rejected: 'bg-rose-50 text-rose-600 border-rose-200',
  withdrawn: 'bg-amber-50 text-amber-600 border-amber-200',
}

/* ── Gradient avatars ── */
const GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-blue-600',
]

function getGradient(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]
}

// Date range presets
const DATE_PRESETS: { label: string; value: string; getRange: () => DateRange | undefined }[] = [
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

interface JobOption {
  id: string
  title: string
}

/* ── KPI Config ── */
const KPI_CONFIG = [
  { key: 'total_processed', label: 'Total Processed', suffix: '', icon: <Users className="w-4 h-4" />, gradient: 'from-amber-500 to-orange-600', iconBg: 'bg-amber-50 text-amber-600' },
  { key: 'total_hires', label: 'Total Hires', suffix: '', icon: <CheckCircle2 className="w-4 h-4" />, gradient: 'from-emerald-500 to-teal-600', iconBg: 'bg-emerald-50 text-emerald-600' },
  { key: 'avg_acceptance', label: 'Hire Rate', suffix: '%', icon: <Mail className="w-4 h-4" />, gradient: 'from-violet-500 to-purple-600', iconBg: 'bg-violet-50 text-violet-600' },
  { key: 'avg_tth', label: 'Avg Time-to-Hire', suffix: 'days', icon: <Clock className="w-4 h-4" />, gradient: 'from-blue-500 to-indigo-600', iconBg: 'bg-blue-50 text-blue-600' },
]

export default function RecruiterPerformance() {
  const { user, organization } = useUser()
  const { isAdmin } = useRole()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<MergedRow[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('hires_closed')
  const [sortAsc, setSortAsc] = useState(false)
  const [candidateTimeline, setCandidateTimeline] = useState<CandidateStageTime[]>([])
  const [selectedRecruiterId, setSelectedRecruiterId] = useState<string>('all')
  const [datePreset, setDatePreset] = useState<string>('all')
  const [jobs, setJobs] = useState<JobOption[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string>('all')
  const [tablePage, setTablePage] = useState(1)
  const [timelinePage, setTimelinePage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const PAGE_SIZE = 10

  const activeFilterCount = [
    datePreset !== 'all' ? datePreset : '',
    selectedJobId !== 'all' ? selectedJobId : '',
    selectedRecruiterId !== 'all' ? selectedRecruiterId : '',
  ].filter(Boolean).length

  const loadData = useCallback(async () => {
    if (!organization || !user) return
    setLoading(true)
    const supabase = createClient()

    const recruiterId = isAdmin ? undefined : user.id
    const dateRange = DATE_PRESETS.find((p) => p.value === datePreset)?.getRange()
    const jobFilter = selectedJobId !== 'all' ? selectedJobId : undefined

    const [metricsRes, recruitersRes, timelineRes, jobsRes] = await Promise.all([
      getRecruiterPerformance(supabase, organization.id, recruiterId, dateRange, jobFilter),
      getRecruitersWithDetails(organization.id),
      getCandidateStageTimeline(supabase, organization.id, recruiterId, dateRange, jobFilter),
      getJobs(supabase, organization.id, { limit: 100 }),
    ])

    if (jobsRes.data) {
      setJobs(jobsRes.data.map((j: { id: string; title: string }) => ({ id: j.id, title: j.title })))
    }

    if (metricsRes.data && recruitersRes.data) {
      const recruiterMap = new Map<string, RecruiterInfo>()
      for (const r of recruitersRes.data) recruiterMap.set(r.user_id, r)

      const merged: MergedRow[] = metricsRes.data
        .filter((m) => recruiterMap.has(m.user_id))
        .map((m) => {
          const r = recruiterMap.get(m.user_id)!
          return { user_id: m.user_id, name: r.full_name, email: r.email, role: r.role, metrics: m }
        })

      if (isAdmin) {
        for (const r of recruitersRes.data) {
          if (!merged.find((m) => m.user_id === r.user_id)) {
            merged.push({
              user_id: r.user_id,
              name: r.full_name,
              email: r.email,
              role: r.role,
              metrics: {
                user_id: r.user_id,
                candidates_added: 0,
                applications_managed: 0,
                interviews_scheduled: 0,
                offers_created: 0,
                hires_closed: 0,
                rejections: 0,
                offer_acceptance_rate: 0,
                avg_time_to_hire: 0,
              },
            })
          }
        }
      }

      setRows(merged)
    }

    if (timelineRes.data) setCandidateTimeline(timelineRes.data)
    setLoading(false)
  }, [organization, user, isAdmin, datePreset, selectedJobId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredRows = useMemo(() => {
    setTablePage(1)
    setTimelinePage(1)
    if (!isAdmin || selectedRecruiterId === 'all') return rows
    return rows.filter((r) => r.user_id === selectedRecruiterId)
  }, [rows, selectedRecruiterId, isAdmin])

  const filteredTimeline = useMemo(() => {
    if (!isAdmin || selectedRecruiterId === 'all') return candidateTimeline
    return candidateTimeline
  }, [candidateTimeline, selectedRecruiterId, isAdmin])

  const isSingleView = !isAdmin || (selectedRecruiterId !== 'all' && filteredRows.length === 1)

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      if (sortKey === 'name') {
        return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
      }
      if (sortKey === 'acceptance_rate') {
        const aVal = a.metrics.offer_acceptance_rate
        const bVal = b.metrics.offer_acceptance_rate
        return sortAsc ? aVal - bVal : bVal - aVal
      }
      if (sortKey === 'hire_rate') {
        const aRate = a.metrics.applications_managed > 0 ? a.metrics.hires_closed / a.metrics.applications_managed : 0
        const bRate = b.metrics.applications_managed > 0 ? b.metrics.hires_closed / b.metrics.applications_managed : 0
        return sortAsc ? aRate - bRate : bRate - aRate
      }
      const aVal = a.metrics[sortKey as keyof RecruiterMetrics] as number
      const bVal = b.metrics[sortKey as keyof RecruiterMetrics] as number
      return sortAsc ? aVal - bVal : bVal - aVal
    })
  }, [filteredRows, sortKey, sortAsc])

  const kpiValues = useMemo(() => {
    const totalProcessed = filteredRows.reduce((s, r) => s + r.metrics.hires_closed + r.metrics.rejections, 0)
    const totalHires = filteredRows.reduce((s, r) => s + r.metrics.hires_closed, 0)
    const totalApps = filteredRows.reduce((s, r) => s + r.metrics.applications_managed, 0)
    const avgAcceptance = totalApps > 0 ? Math.round((totalHires / totalApps) * 100) : 0
    const withTth = filteredRows.filter((r) => r.metrics.avg_time_to_hire > 0)
    const avgTth = withTth.length > 0
      ? Math.round(withTth.reduce((s, r) => s + r.metrics.avg_time_to_hire, 0) / withTth.length)
      : 0
    return { total_processed: totalProcessed, total_hires: totalHires, avg_acceptance: avgAcceptance, avg_tth: avgTth }
  }, [filteredRows])

  const chartData = useMemo(() => {
    return sortedRows
      .filter((r) => r.role === 'recruiter')
      .map((r) => ({
        name: r.name,
        applications: r.metrics.applications_managed,
        offers: r.metrics.offers_created,
        hired: r.metrics.hires_closed,
        rejected: r.metrics.rejections,
        avg_days: r.metrics.avg_time_to_hire,
      }))
  }, [sortedRows])

  const allStageNames = useMemo(() => {
    const stageSet = new Set<string>()
    for (const ct of filteredTimeline) {
      for (const s of ct.stages) stageSet.add(s.stage_name)
    }
    return Array.from(stageSet).sort((a, b) => {
      const ai = STAGE_ORDER.indexOf(a)
      const bi = STAGE_ORDER.indexOf(b)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  }, [filteredTimeline])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) return null
    return sortAsc ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />
  }

  function downloadCsvFile(csvRows: string[][], filename: string) {
    const csvContent = csvRows
      .map((row) => row.map((cell) => {
        if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
          return `"${cell.replace(/"/g, '""')}"`
        }
        return cell
      }).join(','))
      .join('\r\n')

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  function exportRecruiterExcel() {
    const wb = XLSX.utils.book_new()

    const perfData = [
      ['Name', 'Role', 'Applications', 'Offers', 'Hires', 'Rejected', 'Acceptance %', 'Hire Rate %', 'Avg TTH (days)'],
      ...sortedRows.map((row) => [
        row.name,
        row.role,
        row.metrics.applications_managed,
        row.metrics.offers_created,
        row.metrics.hires_closed,
        row.metrics.rejections,
        row.metrics.offer_acceptance_rate,
        row.metrics.applications_managed > 0 ? Math.round((row.metrics.hires_closed / row.metrics.applications_managed) * 100) : 0,
        row.metrics.avg_time_to_hire,
      ]),
    ]
    const wsPerf = XLSX.utils.aoa_to_sheet(perfData)
    wsPerf['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 15 }]
    XLSX.utils.book_append_sheet(wb, wsPerf, 'Recruiter Performance')

    if (filteredTimeline.length > 0) {
      const timelineData = [
        ['Candidate', 'Job', 'Status', ...allStageNames, 'Total Days'],
        ...filteredTimeline.map((ct) => {
          const stageMap = new Map<string, number>()
          for (const s of ct.stages) stageMap.set(s.stage_name, (stageMap.get(s.stage_name) ?? 0) + s.days)
          return [
            ct.candidate_name,
            ct.job_title,
            ct.status,
            ...allStageNames.map((sn) => stageMap.get(sn) ?? 0),
            ct.total_days,
          ]
        }),
      ]
      const wsTimeline = XLSX.utils.aoa_to_sheet(timelineData)
      wsTimeline['!cols'] = [
        { wch: 22 }, { wch: 28 }, { wch: 10 },
        ...allStageNames.map(() => ({ wch: 12 })),
        { wch: 12 },
      ]
      XLSX.utils.book_append_sheet(wb, wsTimeline, 'Pipeline Timeline')
    }

    const kpiSheet = [
      ['HireFlow - Recruiter Performance Report'],
      ['Generated', new Date().toLocaleDateString()],
      [],
      ['Metric', 'Value'],
      ['Total Processed', kpiValues.total_processed],
      ['Total Hires', kpiValues.total_hires],
      ['Hire Rate (%)', kpiValues.avg_acceptance],
      ['Avg Time-to-Hire (days)', kpiValues.avg_tth],
      ['Team Members', filteredRows.length],
    ]
    const wsKpi = XLSX.utils.aoa_to_sheet(kpiSheet)
    wsKpi['!cols'] = [{ wch: 28 }, { wch: 15 }]
    XLSX.utils.book_append_sheet(wb, wsKpi, 'Summary')

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `hireflow-recruiter-report-${new Date().toISOString().split('T')[0]}.xlsx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[100px] rounded-xl" />)}
        </div>
        <Skeleton className="h-[360px] rounded-xl" />
        <Skeleton className="h-[280px] rounded-xl" />
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-16">
        <Users className="w-8 h-8 mx-auto text-gray-300 mb-3" />
        <p className="text-[13px] text-gray-500 font-medium">No recruiter performance data available</p>
        <p className="text-[11px] text-gray-400 mt-1">Data will appear once recruiters start managing applications</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Filters bar ── */}
      <div className="flex items-center gap-2 flex-wrap">
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

        <div className="flex-1" />

        <button onClick={exportRecruiterExcel} className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Export
        </button>
      </div>

      {/* ── Collapsible Filters ── */}
      {showFilters && (
        <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Date Range</label>
              <Select value={datePreset} onValueChange={setDatePreset}>
                <SelectTrigger className="h-8 w-[160px] text-[12px]">
                  <CalendarDays className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                  <SelectValue />
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
                <SelectTrigger className="h-8 w-[180px] text-[12px]">
                  <SelectValue placeholder="All Jobs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Jobs</SelectItem>
                  {jobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isAdmin && (
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Recruiter</label>
                <Select value={selectedRecruiterId} onValueChange={setSelectedRecruiterId}>
                  <SelectTrigger className="h-8 w-[180px] text-[12px]">
                    <SelectValue placeholder="All Recruiters" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Recruiters</SelectItem>
                    {rows.filter((r) => r.role === 'recruiter').map((r) => (
                      <SelectItem key={r.user_id} value={r.user_id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {activeFilterCount > 0 && (
              <div className="pt-4">
                <button
                  onClick={() => { setDatePreset('all'); setSelectedJobId('all'); setSelectedRecruiterId('all') }}
                  className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {KPI_CONFIG.map((kpi) => (
          <div key={kpi.key} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className={`h-[2px] bg-gradient-to-r ${kpi.gradient}`} />
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{kpi.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
                    {kpiValues[kpi.key as keyof typeof kpiValues]}
                    {kpi.suffix && (
                      <span className="text-[12px] font-normal text-gray-400 ml-1">{kpi.suffix}</span>
                    )}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {isSingleView
                      ? (selectedRecruiterId !== 'all' ? filteredRows[0]?.name ?? 'Selected recruiter' : 'Your performance')
                      : `Across ${filteredRows.length} team members`}
                  </p>
                </div>
                <div className={`p-2 rounded-lg ${kpi.iconBg}`}>
                  {kpi.icon}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Leaderboard Table ── */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-gray-400" />
            <div>
              <h3 className="text-[13px] font-semibold text-gray-900">Recruiter Performance</h3>
              <p className="text-[10px] text-gray-400">{isSingleView ? 'Your recruiting metrics' : 'All team members performance breakdown'}</p>
            </div>
          </div>
          <button
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-gray-200 text-[11px] font-medium text-gray-500 hover:bg-gray-50 transition-colors"
            onClick={() => {
              const csvRows: string[][] = []
              csvRows.push(['Name', 'Role', 'Applications', 'Offers', 'Hires', 'Rejected', 'Acceptance %', 'Hire Rate %', 'Avg TTH (days)'])
              for (const row of sortedRows) {
                csvRows.push([
                  row.name, row.role,
                  String(row.metrics.applications_managed),
                  String(row.metrics.offers_created),
                  String(row.metrics.hires_closed),
                  String(row.metrics.rejections),
                  String(row.metrics.offer_acceptance_rate),
                  row.metrics.applications_managed > 0 ? String(Math.round((row.metrics.hires_closed / row.metrics.applications_managed) * 100)) : '0',
                  row.metrics.avg_time_to_hire > 0 ? String(row.metrics.avg_time_to_hire) : '0',
                ])
              }
              downloadCsvFile(csvRows, `recruiter-performance-${new Date().toISOString().split('T')[0]}.csv`)
            }}
          >
            <Download className="w-3 h-3" />
            CSV
          </button>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-b border-gray-100 hover:bg-transparent">
              {([
                ['name', 'Name'],
                ['applications_managed', 'Applications'],
                ['offers_created', 'Offers'],
                ['hires_closed', 'Hires'],
                ['rejections', 'Rejected'],
                ['acceptance_rate', 'Acceptance %'],
                ['hire_rate', 'Hire Rate %'],
                ['avg_time_to_hire', 'Avg TTH'],
              ] as [SortKey, string][]).map(([key, label]) => (
                <TableHead
                  key={key}
                  className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 select-none whitespace-nowrap"
                  onClick={() => handleSort(key)}
                >
                  {label}
                  <SortIcon column={key} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE).map((row) => {
              const grad = getGradient(row.name)
              const initials = row.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
              return (
                <TableRow key={row.user_id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <TableCell className="py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${grad} text-white flex items-center justify-center text-[10px] font-bold shrink-0`}>
                        {initials}
                      </div>
                      <div>
                        <p className="text-[12px] font-medium text-gray-900">{row.name}</p>
                        <p className="text-[10px] text-gray-400">{row.role}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-3 text-[12px] text-gray-600 tabular-nums">{row.metrics.applications_managed}</TableCell>
                  <TableCell className="py-3 text-[12px] text-gray-600 tabular-nums">{row.metrics.offers_created}</TableCell>
                  <TableCell className="py-3">
                    <span className="text-[12px] font-semibold text-emerald-600 tabular-nums">{row.metrics.hires_closed}</span>
                  </TableCell>
                  <TableCell className="py-3">
                    <span className={`text-[12px] font-semibold tabular-nums ${row.metrics.rejections > 0 ? 'text-rose-500' : 'text-gray-300'}`}>{row.metrics.rejections}</span>
                  </TableCell>
                  <TableCell className="py-3 text-[12px] text-gray-600 tabular-nums">
                    {row.metrics.offer_acceptance_rate > 0 ? `${row.metrics.offer_acceptance_rate}%` : '—'}
                  </TableCell>
                  <TableCell className="py-3 text-[12px] text-gray-600 tabular-nums">
                    {row.metrics.applications_managed > 0 ? `${Math.round((row.metrics.hires_closed / row.metrics.applications_managed) * 100)}%` : '—'}
                  </TableCell>
                  <TableCell className="py-3 text-[12px] text-gray-600 tabular-nums">
                    {row.metrics.avg_time_to_hire > 0 ? `${row.metrics.avg_time_to_hire}d` : '—'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {sortedRows.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <p className="text-[11px] text-gray-400">
              Showing {(tablePage - 1) * PAGE_SIZE + 1}–{Math.min(tablePage * PAGE_SIZE, sortedRows.length)} of {sortedRows.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setTablePage(tablePage - 1)}
                disabled={tablePage === 1}
                className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] text-gray-500 px-2 tabular-nums">
                {tablePage} / {Math.ceil(sortedRows.length / PAGE_SIZE)}
              </span>
              <button
                onClick={() => setTablePage(tablePage + 1)}
                disabled={tablePage >= Math.ceil(sortedRows.length / PAGE_SIZE)}
                className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Recruiter Comparison Chart ── */}
      {!isSingleView && <RecruiterCharts data={chartData} isSingleRecruiter={false} />}

      {/* ── Candidate Stage Timeline ── */}
      {filteredTimeline.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <User className="w-4 h-4 text-gray-400" />
              <div>
                <h3 className="text-[13px] font-semibold text-gray-900">Candidate Pipeline Timeline</h3>
                <p className="text-[10px] text-gray-400">Days each candidate spent in every pipeline stage</p>
              </div>
            </div>
            <button
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-gray-200 text-[11px] font-medium text-gray-500 hover:bg-gray-50 transition-colors"
              onClick={() => {
                const csvRows: string[][] = []
                csvRows.push(['Candidate', 'Job', 'Status', ...allStageNames, 'Total Days'])
                for (const ct of filteredTimeline) {
                  const stageMap = new Map<string, number>()
                  for (const s of ct.stages) stageMap.set(s.stage_name, (stageMap.get(s.stage_name) ?? 0) + s.days)
                  csvRows.push([
                    ct.candidate_name, ct.job_title, ct.status,
                    ...allStageNames.map((sn) => String(stageMap.get(sn) ?? 0)),
                    String(ct.total_days),
                  ])
                }
                downloadCsvFile(csvRows, `candidate-timeline-${new Date().toISOString().split('T')[0]}.csv`)
              }}
            >
              <Download className="w-3 h-3" />
              CSV
            </button>
          </div>

          {/* Stage color legend */}
          <div className="flex flex-wrap gap-3 px-5 pb-3">
            {allStageNames.map((name, i) => (
              <div key={name} className="flex items-center gap-1.5 text-[10px] text-gray-500">
                <div
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: STAGE_COLOR_MAP[name] ?? STAGE_PALETTE_FALLBACK[i % STAGE_PALETTE_FALLBACK.length] }}
                />
                {name}
              </div>
            ))}
          </div>

          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-100 hover:bg-transparent">
                <TableHead className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Candidate</TableHead>
                <TableHead className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Job</TableHead>
                <TableHead className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Status</TableHead>
                <TableHead className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap min-w-[280px]">Stage Timeline (days)</TableHead>
                <TableHead className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTimeline.slice((timelinePage - 1) * PAGE_SIZE, timelinePage * PAGE_SIZE).map((ct) => {
                const maxDays = Math.max(...filteredTimeline.map((c) => c.total_days))
                const grad = getGradient(ct.candidate_name)
                const initials = ct.candidate_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
                return (
                  <TableRow key={ct.application_id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${grad} text-white flex items-center justify-center text-[9px] font-bold shrink-0`}>
                          {initials}
                        </div>
                        <span className="text-[12px] font-medium text-gray-900">{ct.candidate_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-[11px] text-gray-500">{ct.job_title}</TableCell>
                    <TableCell className="py-3">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[ct.status] ?? 'bg-gray-300'}`} />
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_PILL[ct.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                          {ct.status}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      {(() => {
                        const consolidated = new Map<string, number>()
                        const order: string[] = []
                        for (const s of ct.stages) {
                          consolidated.set(s.stage_name, (consolidated.get(s.stage_name) ?? 0) + s.days)
                          if (!order.includes(s.stage_name)) order.push(s.stage_name)
                        }
                        order.sort((a, b) => {
                          const ai = STAGE_ORDER.indexOf(a)
                          const bi = STAGE_ORDER.indexOf(b)
                          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
                        })
                        return (
                          <div className="flex items-center gap-0 h-6 rounded-md overflow-hidden bg-gray-100" title={order.map((name) => `${name}: ${consolidated.get(name)}d`).join(' → ')}>
                            {order.map((name, i) => {
                              const days = consolidated.get(name)!
                              const stageCount = order.length
                              const widthPct = maxDays === 0 ? (100 / stageCount) : Math.max((days / maxDays) * 100, 100 / (stageCount * 3))
                              const fallbackIdx = allStageNames.indexOf(name)
                              const color = STAGE_COLOR_MAP[name] ?? STAGE_PALETTE_FALLBACK[(fallbackIdx >= 0 ? fallbackIdx : i) % STAGE_PALETTE_FALLBACK.length]
                              return (
                                <TooltipProvider key={name} delayDuration={100}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div
                                        className="h-full flex items-center justify-center text-[9px] font-medium text-white overflow-hidden cursor-default"
                                        style={{
                                          width: `${widthPct}%`,
                                          backgroundColor: color,
                                          minWidth: '22px',
                                        }}
                                      >
                                        {days === 0 ? '<1' : days}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-[11px] font-medium">
                                      {name}: {days === 0 ? '<1' : days} day{days !== 1 ? 's' : ''}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )
                            })}
                          </div>
                        )
                      })()}
                    </TableCell>
                    <TableCell className="py-3 text-[12px] font-semibold text-gray-900 tabular-nums">{ct.total_days === 0 ? '<1d' : `${ct.total_days}d`}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {filteredTimeline.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
              <p className="text-[11px] text-gray-400">
                Showing {(timelinePage - 1) * PAGE_SIZE + 1}–{Math.min(timelinePage * PAGE_SIZE, filteredTimeline.length)} of {filteredTimeline.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTimelinePage(timelinePage - 1)}
                  disabled={timelinePage === 1}
                  className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] text-gray-500 px-2 tabular-nums">
                  {timelinePage} / {Math.ceil(filteredTimeline.length / PAGE_SIZE)}
                </span>
                <button
                  onClick={() => setTimelinePage(timelinePage + 1)}
                  disabled={timelinePage >= Math.ceil(filteredTimeline.length / PAGE_SIZE)}
                  className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
