'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getJobs, deleteJob, getJobRecruiters } from '@/lib/services/jobs'
import { resolveUserNames } from './actions'
import {
  JOB_STATUS_CONFIG, EMPLOYMENT_TYPES, EXPERIENCE_LEVELS,
  REMOTE_POLICIES, JOB_PRIORITIES, ITEMS_PER_PAGE,
} from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Pagination } from '@/components/ui/pagination'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Search, Plus, Download, LayoutGrid, List, Users, Briefcase, User,
  Building2, MapPin, DollarSign, CalendarDays, GraduationCap,
  MoreHorizontal, Pencil, Trash2, ArrowUpRight, UserCircle, Filter,
} from 'lucide-react'

type ViewMode = 'card' | 'table'

interface Job {
  id: string
  title: string
  department: string
  location: string
  employment_type: string
  status: string
  application_count: number
  created_at: string
  num_openings: number
  application_deadline: string | null
  priority: string
  experience_level: string | null
  remote_policy: string
  salary_min: number | null
  salary_max: number | null
  salary_currency: string
  skills: string[] | null
  education_level: string | null
  experience_min: number | null
  experience_max: number | null
  assigned_to: string | null
  active_candidate_count?: number
}

const STATUS_DOT: Record<string, string> = {
  published: 'bg-emerald-500',
  draft:     'bg-slate-300',
  closed:    'bg-rose-400',
  archived:  'bg-amber-400',
}

const STATUS_PILL: Record<string, string> = {
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  draft:     'bg-slate-50 text-slate-600 border-slate-200',
  closed:    'bg-rose-50 text-rose-600 border-rose-200',
  archived:  'bg-amber-50 text-amber-600 border-amber-200',
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  high:   'bg-orange-400',
  medium: 'bg-blue-400',
  low:    'bg-slate-300',
}

const PRIORITY_CONFIG: Record<string, { label: string; cls: string }> = {
  urgent: { label: 'Urgent', cls: 'bg-red-50 text-red-700 border-red-200' },
  high:   { label: 'High',   cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  medium: { label: 'Medium', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  low:    { label: 'Low',    cls: 'bg-slate-50 text-slate-600 border-slate-200' },
}

// Avatar gradient based on name hash
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

export default function JobsPage() {
  const { user, organization, isLoading } = useUser()
  const { canManageJobs, canCreateJobs, isAdmin } = useRole()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deptFilter, setDeptFilter] = useState<string>('all')
  const [locationFilter, setLocationFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [myJobsOnly, setMyJobsOnly] = useState(false)
  const [departments, setDepartments] = useState<string[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [recruiterNames, setRecruiterNames] = useState<Record<string, string>>({})
  const [jobRecruitersMap, setJobRecruitersMap] = useState<Record<string, string[]>>({})
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<ViewMode>('card')
  const [showFilters, setShowFilters] = useState(false)
  const [candidateSearch, setCandidateSearch] = useState('')
  const [candidateResults, setCandidateResults] = useState<Array<{ id: string; application_id: string; job_id: string; job_title: string; first_name: string; last_name: string; email: string }>>([])
  const [candidateSearching, setCandidateSearching] = useState(false)
  const [showCandidateResults, setShowCandidateResults] = useState(false)
  const candidateSearchRef = useRef<HTMLDivElement>(null)
  const candidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (!organization) return
    loadJobs()
  }, [organization, statusFilter, deptFilter, locationFilter, typeFilter, priorityFilter, myJobsOnly, page])

  useEffect(() => { setPage(1) }, [statusFilter, deptFilter, locationFilter, typeFilter, priorityFilter, myJobsOnly])

  async function loadJobs() {
    if (!organization) return
    setLoading(true)
    const supabase = createClient()
    const filters: Record<string, unknown> = { page }
    if (statusFilter !== 'all') filters.status = statusFilter
    if (deptFilter !== 'all') filters.department = deptFilter
    if (locationFilter !== 'all') filters.location = locationFilter
    if (typeFilter !== 'all') filters.employment_type = typeFilter
    if (priorityFilter !== 'all') filters.priority = priorityFilter
    if (search) filters.search = search
    if (myJobsOnly && user) filters.assigned_to = user.id
    const { data, count } = await getJobs(supabase, organization.id, filters)
    if (data) {
      const jobList = data as Job[]
      setJobs(jobList)
      if (deptFilter === 'all' && locationFilter === 'all' && typeFilter === 'all' && statusFilter === 'all' && !search) {
        const depts = Array.from(new Set(jobList.map((j) => j.department).filter(Boolean))).sort()
        const locs = Array.from(new Set(jobList.map((j) => j.location).filter(Boolean))).sort()
        setDepartments(depts)
        setLocations(locs)
      }
      const recruiterMap: Record<string, string[]> = {}
      await Promise.all(
        jobList.map(async (job) => {
          const ids = await getJobRecruiters(supabase, job.id)
          recruiterMap[job.id] = ids
        })
      )
      setJobRecruitersMap(recruiterMap)

      const allRecruiterIds = new Set<string>()
      jobList.forEach((j) => {
        if (j.assigned_to) allRecruiterIds.add(j.assigned_to)
      })
      Object.values(recruiterMap).forEach((ids) => {
        ids.forEach((id) => allRecruiterIds.add(id))
      })
      const newIds = Array.from(allRecruiterIds).filter((id) => !recruiterNames[id])
      if (newIds.length > 0) {
        const { data: names } = await resolveUserNames(newIds)
        if (names) setRecruiterNames((prev) => ({ ...prev, ...names }))
      }
    }
    if (count !== undefined && count !== null) setTotal(count)
    setLoading(false)
  }

  async function handleSearch() { setPage(1); loadJobs() }

  function handleCandidateSearch(query: string) {
    setCandidateSearch(query)
    if (candidateTimerRef.current) clearTimeout(candidateTimerRef.current)
    if (!query.trim()) {
      setCandidateResults([])
      setShowCandidateResults(false)
      return
    }
    setCandidateSearching(true)
    setShowCandidateResults(true)
    candidateTimerRef.current = setTimeout(async () => {
      if (!organization) return
      const supabase = createClient()
      const term = query.trim()
      const { data } = await supabase
        .from('applications')
        .select('id, job_id, jobs!inner(title), candidates!inner(id, first_name, last_name, email)')
        .eq('jobs.organization_id', organization.id)
        .is('deleted_at', null)
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`, { referencedTable: 'candidates' })
        .limit(10)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results = (data || []).map((row: any) => ({
        id: row.candidates.id,
        application_id: row.id,
        job_id: row.job_id,
        job_title: row.jobs.title,
        first_name: row.candidates.first_name,
        last_name: row.candidates.last_name,
        email: row.candidates.email,
      }))
      setCandidateResults(results)
      setCandidateSearching(false)
    }, 300)
  }

  async function handleDelete(jobId: string) {
    if (!organization) return
    const supabase = createClient()
    await deleteJob(supabase, jobId, organization.id)
    setJobs((prev) => prev.filter((j) => j.id !== jobId))
  }

  function getJobRecruiterNames(jobId: string): string[] {
    const ids = jobRecruitersMap[jobId] ?? []
    return ids.map((id) => recruiterNames[id]).filter(Boolean)
  }

  function getJobOwnerName(job: Job): string | null {
    if (!job.assigned_to) return null
    return recruiterNames[job.assigned_to] || null
  }

  const employmentLabel = (val: string) => EMPLOYMENT_TYPES.find((t) => t.value === val)?.label ?? val
  const experienceLabel = (val: string) => EXPERIENCE_LEVELS.find((l) => l.value === val)?.label ?? val
  const remoteLabel = (val: string) => REMOTE_POLICIES.find((r) => r.value === val)?.label ?? val

  function formatSalary(min: number | null, max: number | null, currency: string) {
    if (!min && !max) return null
    const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : n.toString()
    if (min && max) return `${currency} ${fmt(min)} – ${fmt(max)}`
    if (min) return `${currency} ${fmt(min)}+`
    if (max) return `Up to ${currency} ${fmt(max)}`
    return null
  }

  function formatDeadline(date: string | null) {
    if (!date) return null
    const d = new Date(date)
    const now = new Date()
    const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    if (diff < 0) return { text: 'Expired', urgentLabel: formatted, urgent: true }
    if (diff <= 7) return { text: `${diff}d left`, urgentLabel: formatted, urgent: true }
    return { text: formatted, urgentLabel: null, urgent: false }
  }

  function downloadCSV() {
    if (jobs.length === 0) return
    const headers = ['Title', 'Department', 'Location', 'Employment Type', 'Status', 'Priority', 'Openings', 'Applicants', 'Active Candidates', 'Deadline', 'Assigned Recruiters', 'Created At']
    const rows = jobs.map((job) => [
      job.title, job.department || '', job.location || '',
      employmentLabel(job.employment_type), job.status, job.priority || '',
      String(job.num_openings || 1), String(job.application_count),
      String(job.active_candidate_count ?? 0),
      job.application_deadline || '',
      getJobRecruiterNames(job.id).join(', '),
      new Date(job.created_at).toLocaleDateString(),
    ])
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `jobs-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)
  const activeFilterCount = [statusFilter, deptFilter, locationFilter, typeFilter, priorityFilter].filter(f => f !== 'all').length + (myJobsOnly ? 1 : 0)

  // Status summary counts
  const statusCounts = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] || 0) + 1
    return acc
  }, {})

  function DeleteDialog({ job, trigger }: { job: Job; trigger?: React.ReactNode }) {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          {trigger || (
            <button className="w-full text-left text-[13px] text-red-600 px-2 py-1.5 rounded-md hover:bg-red-50 transition-colors">
              Delete
            </button>
          )}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this job?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>&quot;{job.title}&quot;</strong> and all related data — applications, interviews, offers, pipeline stages, and scores. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDelete(job.id)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Jobs</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">
            {total > 0 ? `${total} position${total !== 1 ? 's' : ''}` : 'Manage your job postings'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
            <button
              onClick={() => setViewMode('card')}
              className={`flex items-center justify-center w-8 h-7 rounded-md transition-all duration-150 ${
                viewMode === 'card'
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center justify-center w-8 h-7 rounded-md transition-all duration-150 ${
                viewMode === 'table'
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          <Button
            variant="outline" size="sm"
            onClick={downloadCSV} disabled={jobs.length === 0}
            className="h-9 gap-1.5 text-gray-500 border-gray-200"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>

          {canCreateJobs && (
            <Link href="/jobs/new">
              <Button size="sm" className="h-9 gap-1.5 bg-gray-900 hover:bg-gray-800 text-white shadow-sm">
                <Plus className="w-3.5 h-3.5" />
                New Job
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* ── Search + Filter Bar ─────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search jobs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-9 h-9 bg-white border-gray-200 text-[13px]"
            />
          </div>

          {/* Candidate Search */}
          <div className="relative flex-1 max-w-xs" ref={candidateSearchRef}>
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search candidates…"
              value={candidateSearch}
              onChange={(e) => handleCandidateSearch(e.target.value)}
              onFocus={() => { if (candidateResults.length > 0) setShowCandidateResults(true) }}
              onBlur={() => setTimeout(() => setShowCandidateResults(false), 200)}
              className="pl-9 h-9 bg-white border-gray-200 text-[13px]"
            />
            {showCandidateResults && (
              <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                {candidateSearching ? (
                  <div className="px-3 py-4 text-center text-[12px] text-gray-400">Searching...</div>
                ) : candidateResults.length === 0 ? (
                  <div className="px-3 py-4 text-center text-[12px] text-gray-400">No candidates found</div>
                ) : (
                  candidateResults.map((c) => (
                    <button
                      key={c.application_id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        router.push(`/applications/${c.application_id}`)
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold shrink-0">
                        {(c.first_name || c.email)[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-gray-800 truncate">{c.first_name} {c.last_name}</p>
                        <p className="text-[11px] text-gray-400 truncate">{c.email}</p>
                      </div>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full truncate max-w-[140px] shrink-0">{c.job_title}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <Button
            variant="outline" size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={`h-9 gap-1.5 border-gray-200 ${showFilters ? 'bg-gray-100 border-gray-300' : ''}`}
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-0.5 w-5 h-5 rounded-full bg-gray-900 text-white text-[10px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {(isAdmin || canManageJobs) && (
            <Button
              variant={myJobsOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMyJobsOnly(!myJobsOnly)}
              className={`h-9 ${myJobsOnly
                ? 'bg-gray-900 hover:bg-gray-800 text-white'
                : 'border-gray-200 text-gray-500'
              }`}
            >
              My Jobs
            </Button>
          )}

          {/* Status quick-pills */}
          <div className="hidden lg:flex items-center gap-1.5 ml-auto">
            {['published', 'draft', 'closed', 'archived'].map(s => {
              const count = statusCounts[s] || 0
              const isActive = statusFilter === s
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(isActive ? 'all' : s)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ${
                    isActive
                      ? STATUS_PILL[s] + ' border-current'
                      : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s]}`} />
                  {JOB_STATUS_CONFIG[s as keyof typeof JOB_STATUS_CONFIG]?.label ?? s}
                  {count > 0 && <span className="tabular-nums">{count}</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 pt-1 pb-1">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[130px] border-gray-200 bg-white text-[12px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>

            {departments.length > 0 && (
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger className="h-8 w-[140px] border-gray-200 bg-white text-[12px]">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {locations.length > 0 && (
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="h-8 w-[140px] border-gray-200 bg-white text-[12px]">
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 w-[130px] border-gray-200 bg-white text-[12px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {EMPLOYMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-8 w-[130px] border-gray-200 bg-white text-[12px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                {JOB_PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>

            {activeFilterCount > 0 && (
              <button
                onClick={() => { setStatusFilter('all'); setDeptFilter('all'); setLocationFilter('all'); setTypeFilter('all'); setPriorityFilter('all'); setMyJobsOnly(false) }}
                className="h-8 px-2.5 text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {loading ? (
        viewMode === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-white p-5 space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-20 w-full rounded-lg" />
                <div className="flex gap-2">
                  <Skeleton className="h-7 flex-1 rounded-md" />
                  <Skeleton className="h-7 flex-1 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
            <Skeleton className="h-11 w-full" />
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full mt-px" />)}
          </div>
        )
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-20 bg-white">
          <div className="flex flex-col items-center text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <Briefcase className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-[14px] font-semibold text-gray-600 mb-1">No jobs found</p>
            <p className="text-[13px] text-gray-400 mb-5 max-w-xs">
              {search || statusFilter !== 'all' ? 'Try adjusting your filters.' : 'Create your first job posting to start receiving applications.'}
            </p>
            {canCreateJobs && !search && statusFilter === 'all' && (
              <Link href="/jobs/new">
                <Button size="sm" className="gap-1.5 bg-gray-900 hover:bg-gray-800 text-white">
                  <Plus className="w-3.5 h-3.5" /> New Job
                </Button>
              </Link>
            )}
          </div>
        </div>

      ) : viewMode === 'card' ? (
        /* ── Card View ─────────────────────────────────────────────────── */
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {jobs.map((job) => {
              const statusConfig = JOB_STATUS_CONFIG[job.status as keyof typeof JOB_STATUS_CONFIG]
              const priority = PRIORITY_CONFIG[job.priority] || PRIORITY_CONFIG.medium
              const salary = formatSalary(job.salary_min, job.salary_max, job.salary_currency)
              const deadline = formatDeadline(job.application_deadline)
              const openings = job.num_openings || 1
              const recruiterNamesList = getJobRecruiterNames(job.id)
              const ownerName = getJobOwnerName(job)

              return (
                <div
                  key={job.id}
                  className="group relative rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:shadow-md transition-all duration-200 flex flex-col overflow-hidden cursor-pointer"
                  onClick={() => router.push(`/jobs/${job.id}/applications`)}
                >
                  {/* Top bar — status color accent */}
                  <div className={`h-1 ${STATUS_DOT[job.status]?.replace('bg-', 'bg-') || 'bg-gray-200'}`} />

                  <div className="p-5 flex flex-col flex-1">
                    {/* Header: title + actions */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[15px] font-bold text-gray-900 leading-snug line-clamp-2 group-hover:text-blue-700 transition-colors">
                          {job.title}
                        </h3>
                        <div className="flex items-center gap-2 mt-1.5 text-[12px] text-gray-400">
                          {job.department && (
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {job.department}
                            </span>
                          )}
                          {job.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {job.location}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions dropdown */}
                      <div onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="w-7 h-7 rounded-md flex items-center justify-center text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-600 transition-all">
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => router.push(`/jobs/${job.id}`)} className="gap-2 text-[13px]">
                              <Pencil className="w-3.5 h-3.5" /> Edit Job
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/jobs/${job.id}/applications`)} className="gap-2 text-[13px]">
                              <Users className="w-3.5 h-3.5" /> Applications
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/jobs/${job.id}/pipeline`)} className="gap-2 text-[13px]">
                              <ArrowUpRight className="w-3.5 h-3.5" /> Pipeline
                            </DropdownMenuItem>
                            {isAdmin && (
                              <>
                                <DropdownMenuSeparator />
                                <DeleteDialog
                                  job={job}
                                  trigger={
                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="gap-2 text-[13px] text-red-600 focus:text-red-600">
                                      <Trash2 className="w-3.5 h-3.5" /> Delete Job
                                    </DropdownMenuItem>
                                  }
                                />
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Tags row: status + priority + type */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-4">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_PILL[job.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[job.status] || 'bg-gray-300'}`} />
                        {statusConfig?.label ?? job.status}
                      </span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${priority.cls}`}>
                        {priority.label}
                      </span>
                      <span className="text-[11px] text-gray-500 px-2 py-0.5 rounded-full bg-gray-50 border border-gray-100">
                        {employmentLabel(job.employment_type)}
                      </span>
                      {job.remote_policy && job.remote_policy !== 'on_site' && (
                        <span className="text-[11px] text-gray-500 px-2 py-0.5 rounded-full bg-gray-50 border border-gray-100">
                          {remoteLabel(job.remote_policy)}
                        </span>
                      )}
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="text-center p-2.5 rounded-lg bg-gray-50/80">
                        <p className="text-[18px] font-bold text-gray-900 tabular-nums">{job.application_count}</p>
                        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mt-0.5">Applicants</p>
                      </div>
                      <div className="text-center p-2.5 rounded-lg bg-gray-50/80">
                        <p className="text-[18px] font-bold text-emerald-600 tabular-nums">{job.active_candidate_count ?? 0}</p>
                        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mt-0.5">Active</p>
                      </div>
                      <div className="text-center p-2.5 rounded-lg bg-gray-50/80">
                        <p className="text-[18px] font-bold text-gray-900 tabular-nums">{openings}</p>
                        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mt-0.5">Opening{openings !== 1 ? 's' : ''}</p>
                      </div>
                    </div>

                    {/* Meta info */}
                    <div className="space-y-1.5 text-[12px] text-gray-500 mb-3">
                      {salary && (
                        <div className="flex items-center gap-1.5 font-semibold text-emerald-700">
                          <DollarSign className="w-3 h-3 shrink-0" />
                          {salary}
                        </div>
                      )}
                      {job.experience_level && (
                        <div className="flex items-center gap-1.5">
                          <GraduationCap className="w-3 h-3 shrink-0 text-gray-400" />
                          {experienceLabel(job.experience_level)}
                          {(job.experience_min !== null || job.experience_max !== null) && (
                            <span className="text-gray-400">· {job.experience_min ?? 0}{job.experience_max ? `–${job.experience_max}` : '+'} yrs</span>
                          )}
                        </div>
                      )}
                      {deadline && (
                        <div className={`flex items-center gap-1.5 ${deadline.urgent ? 'text-red-600 font-semibold' : ''}`}>
                          <CalendarDays className="w-3 h-3 shrink-0" />
                          Deadline: {deadline.text}
                          {deadline.urgentLabel && <span className="text-gray-400 font-normal">({deadline.urgentLabel})</span>}
                        </div>
                      )}
                    </div>

                    {/* Skills */}
                    {job.skills && job.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {job.skills.slice(0, 4).map((s) => (
                          <span key={s} className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded font-medium">
                            {s}
                          </span>
                        ))}
                        {job.skills.length > 4 && (
                          <span className="text-[10px] text-gray-400 px-1 py-0.5">+{job.skills.length - 4}</span>
                        )}
                      </div>
                    )}

                    {/* Footer: recruiters */}
                    <div className="mt-auto pt-3 border-t border-gray-100">
                      {recruiterNamesList.length > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <div className="flex -space-x-1.5">
                            {recruiterNamesList.slice(0, 3).map((name, i) => {
                              const gradient = getGradient(name)
                              const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                              return (
                                <div
                                  key={i}
                                  className={`w-6 h-6 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center ring-2 ring-white`}
                                  title={name + (name === ownerName ? ' (Owner)' : '')}
                                >
                                  <span className="text-[8px] font-bold text-white">{initials}</span>
                                </div>
                              )
                            })}
                            {recruiterNamesList.length > 3 && (
                              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center ring-2 ring-white">
                                <span className="text-[9px] font-bold text-gray-500">+{recruiterNamesList.length - 3}</span>
                              </div>
                            )}
                          </div>
                          <span className="text-[11px] text-gray-400 truncate">
                            {recruiterNamesList.slice(0, 2).join(', ')}{recruiterNamesList.length > 2 ? ` +${recruiterNamesList.length - 2}` : ''}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-gray-300 flex items-center gap-1">
                          <UserCircle className="w-3 h-3" /> No recruiters assigned
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>

      ) : (
        /* ── Table View ──────────────────────────────────────────────────── */
        <>
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/60 hover:bg-gray-50/60 border-b border-gray-100">
                    <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-[280px] pl-5">Job</TableHead>
                    <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Location</TableHead>
                    <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Type</TableHead>
                    <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Priority</TableHead>
                    <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-center">Apps</TableHead>
                    <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-center">Active</TableHead>
                    <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Deadline</TableHead>
                    <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Recruiters</TableHead>
                    <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => {
                    const statusConfig = JOB_STATUS_CONFIG[job.status as keyof typeof JOB_STATUS_CONFIG]
                    const priority = PRIORITY_CONFIG[job.priority] || PRIORITY_CONFIG.medium
                    const deadline = formatDeadline(job.application_deadline)
                    const recruiterNamesList = getJobRecruiterNames(job.id)
                    const ownerName = getJobOwnerName(job)

                    return (
                      <TableRow
                        key={job.id}
                        onClick={() => router.push(`/jobs/${job.id}/applications`)}
                        className="group transition-colors hover:bg-gray-50/80 border-b border-gray-50 cursor-pointer"
                      >
                        {/* Job Title + Dept */}
                        <TableCell className="pl-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-1 h-8 rounded-full shrink-0 ${STATUS_DOT[job.status] || 'bg-gray-200'}`} />
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                                {job.title}
                              </p>
                              {job.department && (
                                <p className="text-[11px] text-gray-400 mt-0.5">{job.department}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Location */}
                        <TableCell className="py-3">
                          <div>
                            <p className="text-[12px] text-gray-600">{job.location || '—'}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">{remoteLabel(job.remote_policy)}</p>
                          </div>
                        </TableCell>

                        {/* Type */}
                        <TableCell className="py-3">
                          <span className="text-[12px] text-gray-600">{employmentLabel(job.employment_type)}</span>
                        </TableCell>

                        {/* Status */}
                        <TableCell className="py-3">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_PILL[job.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[job.status] || 'bg-gray-300'}`} />
                            {statusConfig?.label ?? job.status}
                          </span>
                        </TableCell>

                        {/* Priority */}
                        <TableCell className="py-3">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${priority.cls}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[job.priority] || 'bg-gray-300'}`} />
                            {priority.label}
                          </span>
                        </TableCell>

                        {/* Applications */}
                        <TableCell className="text-center py-3">
                          <span className={`text-[13px] font-bold tabular-nums ${
                            job.application_count > 0 ? 'text-gray-800' : 'text-gray-300'
                          }`}>
                            {job.application_count}
                          </span>
                        </TableCell>

                        {/* Active */}
                        <TableCell className="text-center py-3">
                          <span className={`text-[13px] font-bold tabular-nums ${
                            (job.active_candidate_count ?? 0) > 0 ? 'text-emerald-600' : 'text-gray-300'
                          }`}>
                            {job.active_candidate_count ?? 0}
                          </span>
                        </TableCell>

                        {/* Deadline */}
                        <TableCell className="py-3">
                          {deadline ? (
                            <span className={`text-[12px] font-medium ${deadline.urgent ? 'text-red-600' : 'text-gray-500'}`}>
                              {deadline.text}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-[12px]">—</span>
                          )}
                        </TableCell>

                        {/* Recruiters */}
                        <TableCell className="py-3">
                          {recruiterNamesList.length > 0 ? (
                            <div className="flex items-center gap-1.5">
                              <div className="flex -space-x-1">
                                {recruiterNamesList.slice(0, 3).map((name, i) => {
                                  const gradient = getGradient(name)
                                  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                                  return (
                                    <div
                                      key={i}
                                      className={`w-5 h-5 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center ring-1.5 ring-white`}
                                      title={name + (name === ownerName ? ' (Owner)' : '')}
                                    >
                                      <span className="text-[7px] font-bold text-white">{initials}</span>
                                    </div>
                                  )
                                })}
                              </div>
                              {recruiterNamesList.length > 3 && (
                                <span className="text-[11px] text-gray-400">+{recruiterNamesList.length - 3}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300 text-[12px]">—</span>
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="pr-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="w-7 h-7 rounded-md flex items-center justify-center text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-600 transition-all">
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => router.push(`/jobs/${job.id}`)} className="gap-2 text-[13px]">
                                <Pencil className="w-3.5 h-3.5" /> Edit Job
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => router.push(`/jobs/${job.id}/applications`)} className="gap-2 text-[13px]">
                                <Users className="w-3.5 h-3.5" /> Applications
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => router.push(`/jobs/${job.id}/pipeline`)} className="gap-2 text-[13px]">
                                <ArrowUpRight className="w-3.5 h-3.5" /> Pipeline
                              </DropdownMenuItem>
                              {isAdmin && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DeleteDialog
                                    job={job}
                                    trigger={
                                      <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="gap-2 text-[13px] text-red-600 focus:text-red-600">
                                        <Trash2 className="w-3.5 h-3.5" /> Delete Job
                                      </DropdownMenuItem>
                                    }
                                  />
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}
