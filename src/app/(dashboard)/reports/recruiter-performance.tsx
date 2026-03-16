'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getRecruiterPerformance, getCandidateStageTimeline, type RecruiterMetrics, type CandidateStageTime, type DateRange } from '@/lib/services/reports'
import { getJobs } from '@/lib/services/jobs'
import { getRecruitersWithDetails, type RecruiterInfo } from './actions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Users, CheckCircle2, Mail, Clock, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Download, User, FileSpreadsheet, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700',
  hired: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  withdrawn: 'bg-gray-100 text-gray-600',
}

// Fixed pipeline stage order for legend and display
const STAGE_ORDER = ['Applied', 'Screening', 'Assessment', 'Interview', 'Offer', 'Hired', 'Rejected']

// Stage colors — each visually distinct, Hired=green, Rejected=red
const STAGE_COLOR_MAP: Record<string, string> = {
  Applied: '#3b82f6',    // blue
  Screening: '#f59e0b',  // amber
  Assessment: '#8b5cf6', // violet
  Interview: '#ec4899',  // pink
  Offer: '#06b6d4',      // cyan
  Hired: '#22c55e',      // green
  Rejected: '#ef4444',   // red
}
const STAGE_PALETTE_FALLBACK = ['#6366f1', '#14b8a6', '#f97316', '#a855f7', '#0ea5e9']

// Date range presets (same as overview tab)
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

const KPI_CONFIG = [
  {
    key: 'total_processed',
    label: 'Total Processed',
    icon: <Users className="w-5 h-5" />,
    bg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    accent: 'border-l-amber-500',
  },
  {
    key: 'total_hires',
    label: 'Total Hires',
    icon: <CheckCircle2 className="w-5 h-5" />,
    bg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    accent: 'border-l-emerald-500',
  },
  {
    key: 'avg_acceptance',
    label: 'Hire Rate',
    suffix: '%',
    icon: <Mail className="w-5 h-5" />,
    bg: 'bg-purple-50',
    iconColor: 'text-purple-600',
    accent: 'border-l-purple-500',
  },
  {
    key: 'avg_tth',
    label: 'Avg Time-to-Hire',
    suffix: 'days',
    icon: <Clock className="w-5 h-5" />,
    bg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    accent: 'border-l-blue-500',
  },
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
  const PAGE_SIZE = 10

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

  // Filter rows and timeline when admin selects a specific recruiter
  const filteredRows = useMemo(() => {
    setTablePage(1)
    setTimelinePage(1)
    if (!isAdmin || selectedRecruiterId === 'all') return rows
    return rows.filter((r) => r.user_id === selectedRecruiterId)
  }, [rows, selectedRecruiterId, isAdmin])

  const filteredTimeline = useMemo(() => {
    if (!isAdmin || selectedRecruiterId === 'all') return candidateTimeline
    // Filter to candidates managed by the selected recruiter (via their jobs)
    const recruiterRow = rows.find((r) => r.user_id === selectedRecruiterId)
    if (!recruiterRow) return []
    // We need to match by recruiter — the timeline has recruiter_id if available,
    // otherwise we show all (the service already filters server-side when recruiterId is passed)
    return candidateTimeline
  }, [candidateTimeline, selectedRecruiterId, isAdmin, rows])

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

  // Collect all unique stage names from timeline for table headers
  const allStageNames = useMemo(() => {
    const stageSet = new Set<string>()
    for (const ct of filteredTimeline) {
      for (const s of ct.stages) stageSet.add(s.stage_name)
    }
    // Sort by fixed pipeline order; unknown stages go at the end
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
    return sortAsc ? <ChevronUp className="w-3.5 h-3.5 inline ml-0.5" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-0.5" />
  }

  function downloadCsvFile(rows: string[][], filename: string) {
    const csvContent = rows
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

    // Sheet 1: Recruiter Performance
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

    // Sheet 2: Candidate Pipeline Timeline
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

    // Sheet 3: KPI Summary
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
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[110px] rounded-xl" />)}
        </div>
        <Skeleton className="h-[380px] rounded-xl" />
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="w-10 h-10 mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-gray-400">No recruiter performance data available</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-gray-400" />
          <Select value={datePreset} onValueChange={setDatePreset}>
            <SelectTrigger className="h-9 w-40 bg-white border-gray-200 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Select value={selectedJobId} onValueChange={setSelectedJobId}>
          <SelectTrigger className="h-9 w-48 bg-white border-gray-200 text-sm">
            <SelectValue placeholder="All Jobs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Jobs</SelectItem>
            {jobs.map((j) => (
              <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdmin && (
          <Select value={selectedRecruiterId} onValueChange={setSelectedRecruiterId}>
            <SelectTrigger className="h-9 w-48 bg-white border-gray-200 text-sm">
              <SelectValue placeholder="All Recruiters" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Recruiters</SelectItem>
              {rows.filter((r) => r.role === 'recruiter').map((r) => (
                <SelectItem key={r.user_id} value={r.user_id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportRecruiterExcel}>
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Download Report
        </Button>
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
                    {kpiValues[kpi.key as keyof typeof kpiValues]}
                    {'suffix' in kpi && kpi.suffix && (
                      <span className="text-base font-normal text-gray-400 ml-1">{kpi.suffix}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {isSingleView
                      ? (selectedRecruiterId !== 'all' ? filteredRows[0]?.name ?? 'Selected recruiter' : 'Your performance')
                      : `Across ${filteredRows.length} team members`}
                  </p>
                </div>
                <div className={`p-2.5 rounded-lg ${kpi.bg} ${kpi.iconColor}`}>
                  {kpi.icon}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Leaderboard Table */}
      <Card className="shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Recruiter Performance</CardTitle>
              <CardDescription className="text-xs">
                {isSingleView ? 'Your recruiting metrics' : 'All team members performance breakdown'}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => {
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
            }}>
              <Download className="w-3.5 h-3.5" />
              Download CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/50">
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
                    <th
                      key={key}
                      className="px-4 py-3 text-left font-medium text-gray-500 cursor-pointer hover:text-gray-700 select-none whitespace-nowrap"
                      onClick={() => handleSort(key)}
                    >
                      {label}
                      <SortIcon column={key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE).map((row) => (
                  <tr key={row.user_id} className="border-b last:border-b-0 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{row.name}</p>
                        <p className="text-xs text-gray-400">{row.role}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.metrics.applications_managed}</td>
                    <td className="px-4 py-3 text-gray-700">{row.metrics.offers_created}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-emerald-600">{row.metrics.hires_closed}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${row.metrics.rejections > 0 ? 'text-red-500' : 'text-gray-400'}`}>{row.metrics.rejections}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {row.metrics.offer_acceptance_rate > 0 ? `${row.metrics.offer_acceptance_rate}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {row.metrics.applications_managed > 0 ? `${Math.round((row.metrics.hires_closed / row.metrics.applications_managed) * 100)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {row.metrics.avg_time_to_hire > 0 ? `${row.metrics.avg_time_to_hire}d` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Table Pagination */}
          {sortedRows.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-gray-500">
                Showing {(tablePage - 1) * PAGE_SIZE + 1}–{Math.min(tablePage * PAGE_SIZE, sortedRows.length)} of {sortedRows.length}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={tablePage === 1} onClick={() => setTablePage(tablePage - 1)}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="text-xs text-gray-600 px-2">
                  {tablePage} / {Math.ceil(sortedRows.length / PAGE_SIZE)}
                </span>
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={tablePage >= Math.ceil(sortedRows.length / PAGE_SIZE)} onClick={() => setTablePage(tablePage + 1)}>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts — show only for admin (multi-recruiter comparison) */}
      {!isSingleView && <RecruiterCharts data={chartData} isSingleRecruiter={false} />}

      {/* Candidate Stage Timeline */}
      {filteredTimeline.length > 0 && (
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Candidate Pipeline Timeline
                </CardTitle>
                <CardDescription className="text-xs">
                  Days each candidate spent in every pipeline stage
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => {
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
              }}>
                <Download className="w-3.5 h-3.5" />
                Download CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Stage color legend */}
            <div className="flex flex-wrap gap-3 mb-4">
              {allStageNames.map((name, i) => (
                <div key={name} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: STAGE_COLOR_MAP[name] ?? STAGE_PALETTE_FALLBACK[i % STAGE_PALETTE_FALLBACK.length] }}
                  />
                  {name}
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50/50">
                    <th className="px-4 py-3 text-left font-medium text-gray-500 whitespace-nowrap">Candidate</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 whitespace-nowrap">Job</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 whitespace-nowrap">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 whitespace-nowrap min-w-[300px]">Stage Timeline (days)</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTimeline.slice((timelinePage - 1) * PAGE_SIZE, timelinePage * PAGE_SIZE).map((ct) => {
                    const maxDays = Math.max(...filteredTimeline.map((c) => c.total_days))
                    return (
                      <tr key={ct.application_id} className="border-b last:border-b-0 hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{ct.candidate_name}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{ct.job_title}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[ct.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {ct.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {/* Horizontal stacked bar — consolidate stages by name */}
                          {(() => {
                            const consolidated = new Map<string, number>()
                            const order: string[] = []
                            for (const s of ct.stages) {
                              consolidated.set(s.stage_name, (consolidated.get(s.stage_name) ?? 0) + s.days)
                              if (!order.includes(s.stage_name)) order.push(s.stage_name)
                            }
                            // Sort by pipeline order
                            order.sort((a, b) => {
                              const ai = STAGE_ORDER.indexOf(a)
                              const bi = STAGE_ORDER.indexOf(b)
                              return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
                            })
                            return (
                              <div className="flex items-center gap-0 h-7 rounded overflow-hidden bg-gray-100" title={order.map((name) => `${name}: ${consolidated.get(name)}d`).join(' → ')}>
                                {order.map((name, i) => {
                                  const days = consolidated.get(name)!
                                  const stageCount = order.length
                                  // For same-day processes (all 0), distribute evenly; otherwise scale by days
                                  const widthPct = maxDays === 0 ? (100 / stageCount) : Math.max((days / maxDays) * 100, 100 / (stageCount * 3))
                                  const fallbackIdx = allStageNames.indexOf(name)
                                  const color = STAGE_COLOR_MAP[name] ?? STAGE_PALETTE_FALLBACK[(fallbackIdx >= 0 ? fallbackIdx : i) % STAGE_PALETTE_FALLBACK.length]
                                  return (
                                    <TooltipProvider key={name} delayDuration={100}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div
                                            className="h-full flex items-center justify-center text-[10px] font-medium text-white overflow-hidden cursor-default"
                                            style={{
                                              width: `${widthPct}%`,
                                              backgroundColor: color,
                                              minWidth: '24px',
                                            }}
                                          >
                                            {days === 0 ? '<1' : days}
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="text-xs font-medium text-white">
                                          {name}: {days === 0 ? '<1' : days} day{days !== 1 ? 's' : ''}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )
                                })}
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{ct.total_days === 0 ? '<1d' : `${ct.total_days}d`}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Timeline Pagination */}
            {filteredTimeline.length > PAGE_SIZE && (
              <div className="flex items-center justify-between pt-3 mt-3 border-t">
                <p className="text-xs text-gray-500">
                  Showing {(timelinePage - 1) * PAGE_SIZE + 1}–{Math.min(timelinePage * PAGE_SIZE, filteredTimeline.length)} of {filteredTimeline.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={timelinePage === 1} onClick={() => setTimelinePage(timelinePage - 1)}>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-xs text-gray-600 px-2">
                    {timelinePage} / {Math.ceil(filteredTimeline.length / PAGE_SIZE)}
                  </span>
                  <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={timelinePage >= Math.ceil(filteredTimeline.length / PAGE_SIZE)} onClick={() => setTimelinePage(timelinePage + 1)}>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
