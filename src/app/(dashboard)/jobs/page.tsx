'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getJobs, deleteJob } from '@/lib/services/jobs'
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
import { Pagination } from '@/components/ui/pagination'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

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
}

// Status → left border accent color
const STATUS_BORDER: Record<string, string> = {
  published: 'border-l-emerald-500',
  draft:     'border-l-slate-300',
  closed:    'border-l-rose-400',
  archived:  'border-l-amber-400',
}

const PRIORITY_CONFIG: Record<string, { label: string; cls: string }> = {
  urgent: { label: 'Urgent', cls: 'bg-red-50 text-red-700 border border-red-200' },
  high:   { label: 'High',   cls: 'bg-orange-50 text-orange-700 border border-orange-200' },
  medium: { label: 'Medium', cls: 'bg-blue-50 text-blue-700 border border-blue-200' },
  low:    { label: 'Low',    cls: 'bg-slate-50 text-slate-600 border border-slate-200' },
}

// ── Minimal SVG icons ──────────────────────────────────────────────────────

function IconGrid({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3">
      <rect x="1" y="1" width="5.5" height="5.5" rx="1" />
      <rect x="8.5" y="1" width="5.5" height="5.5" rx="1" />
      <rect x="1" y="8.5" width="5.5" height="5.5" rx="1" />
      <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" />
    </svg>
  )
}

function IconList({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="5" y1="3.5" x2="13.5" y2="3.5" />
      <line x1="5" y1="7.5" x2="13.5" y2="7.5" />
      <line x1="5" y1="11.5" x2="13.5" y2="11.5" />
      <circle cx="2" cy="3.5" r="0.8" fill={active ? 'currentColor' : 'none'} />
      <circle cx="2" cy="7.5" r="0.8" fill={active ? 'currentColor' : 'none'} />
      <circle cx="2" cy="11.5" r="0.8" fill={active ? 'currentColor' : 'none'} />
    </svg>
  )
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="7" y1="1" x2="7" y2="13" /><line x1="1" y1="7" x2="13" y2="7" />
    </svg>
  )
}

function IconDownload() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 1v8M4 6l3 3 3-3M2 11h10" />
    </svg>
  )
}

function IconEye() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function JobsPage() {
  const { user, organization, isLoading } = useUser()
  const { canManageJobs, isAdmin } = useRole()
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
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<ViewMode>('card')
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
      const assignedIds = Array.from(new Set(jobList.map((j) => j.assigned_to).filter(Boolean))) as string[]
      const newIds = assignedIds.filter((id) => !recruiterNames[id])
      if (newIds.length > 0) {
        const { data: names } = await resolveUserNames(newIds)
        if (names) setRecruiterNames((prev) => ({ ...prev, ...names }))
      }
    }
    if (count !== undefined && count !== null) setTotal(count)
    setLoading(false)
  }

  async function handleSearch() { setPage(1); loadJobs() }

  async function handleDelete(jobId: string) {
    if (!organization) return
    const supabase = createClient()
    await deleteJob(supabase, jobId, organization.id)
    setJobs((prev) => prev.filter((j) => j.id !== jobId))
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
    if (diff < 0) return { text: `Expired`, urgentLabel: formatted, urgent: true }
    if (diff <= 7) return { text: `${diff}d left`, urgentLabel: formatted, urgent: true }
    return { text: formatted, urgentLabel: null, urgent: false }
  }

  function downloadCSV() {
    if (jobs.length === 0) return
    const headers = ['Title', 'Department', 'Location', 'Employment Type', 'Status', 'Priority', 'Openings', 'Applicants', 'Deadline', 'Assigned Recruiter', 'Created At']
    const rows = jobs.map((job) => [
      job.title, job.department || '', job.location || '',
      employmentLabel(job.employment_type), job.status, job.priority || '',
      String(job.num_openings || 1), String(job.application_count),
      job.application_deadline || '',
      job.assigned_to ? (recruiterNames[job.assigned_to] || '') : '',
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

  // ── Shared: Delete Dialog ─────────────────────────────────────────────────
  function DeleteDialog({ job }: { job: Job }) {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost" size="sm"
            className="h-8 w-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete job"
          >
            <IconTrash />
          </Button>
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

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-400 mt-0.5 font-medium">
            {total > 0 ? `${total} position${total !== 1 ? 's' : ''}` : 'Manage your job postings'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-1">
            <button
              onClick={() => setViewMode('card')}
              title="Card view"
              className={`flex items-center justify-center w-8 h-7 rounded-md transition-all duration-150 ${
                viewMode === 'card'
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <IconGrid active={viewMode === 'card'} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="Table view"
              className={`flex items-center justify-center w-8 h-7 rounded-md transition-all duration-150 ${
                viewMode === 'table'
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <IconList active={viewMode === 'table'} />
            </button>
          </div>

          <Button
            variant="outline" size="sm"
            onClick={downloadCSV} disabled={jobs.length === 0}
            className="h-9 gap-1.5 text-gray-600 border-gray-200 hover:border-gray-300"
          >
            <IconDownload />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>

          {canManageJobs && (
            <Link href="/jobs/new">
              <Button
                size="sm"
                className="h-9 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
              >
                <IconPlus />
                New Job
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Search jobs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="h-9 bg-white border-gray-200 focus-visible:ring-indigo-500/30 focus-visible:border-indigo-400"
          />
        </div>

        {(isAdmin || canManageJobs) && (
          <Button
            variant={myJobsOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMyJobsOnly(!myJobsOnly)}
            className={`h-9 ${myJobsOnly
              ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600'
              : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            My Jobs
          </Button>
        )}

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[130px] border-gray-200 bg-white text-sm">
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
            <SelectTrigger className="h-9 w-[140px] border-gray-200 bg-white text-sm">
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
            <SelectTrigger className="h-9 w-[140px] border-gray-200 bg-white text-sm">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-[130px] border-gray-200 bg-white text-sm">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {EMPLOYMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="h-9 w-[130px] border-gray-200 bg-white text-sm">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            {JOB_PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {loading ? (
        viewMode === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-60 rounded-xl" />)}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <Skeleton className="h-11 w-full" />
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full mt-px" />)}
          </div>
        )
      ) : jobs.length === 0 ? (
        /* ── Empty State ── */
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 py-16">
          <div className="flex flex-col items-center text-center px-6">
            <div className="w-14 h-14 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-700 mb-1">No jobs found</p>
            <p className="text-sm text-gray-400 mb-5 max-w-xs">
              {search || statusFilter !== 'all' ? 'Try adjusting your filters.' : 'Create your first job posting to start receiving applications.'}
            </p>
            {canManageJobs && !search && statusFilter === 'all' && (
              <Link href="/jobs/new">
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
                  <IconPlus />New Job
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
              const borderColor = STATUS_BORDER[job.status] || 'border-l-gray-200'

              return (
                <div
                  key={job.id}
                  onClick={() => router.push(`/jobs/${job.id}/applications`)}
                  className={`group relative border-l-4 ${borderColor} border border-gray-200 rounded-xl hover:shadow-md transition-all duration-200 flex flex-col overflow-hidden bg-white cursor-pointer`}
                >
                  <div className="pt-4 pb-4 px-5 flex flex-col flex-1 gap-0">

                    {/* Status + Priority row */}
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusConfig?.className ?? 'bg-gray-100 text-gray-600'}`}>
                        {statusConfig?.label ?? job.status}
                      </span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${priority.cls}`}>
                        {priority.label}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-[15px] font-bold text-gray-900 leading-snug mb-1 line-clamp-2 group-hover:text-blue-700 transition-colors">
                      {job.title}
                    </h3>

                    {/* Department + Location */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-gray-500 mb-3">
                      {job.department && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                          </svg>
                          {job.department}
                        </span>
                      )}
                      {job.location && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                          </svg>
                          {job.location}
                        </span>
                      )}
                    </div>

                    {/* Assigned recruiter */}
                    {job.assigned_to && recruiterNames[job.assigned_to] && (
                      <div className="flex items-center gap-1.5 text-[12px] text-blue-600 font-medium mb-2.5">
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                        </svg>
                        {recruiterNames[job.assigned_to]}
                      </div>
                    )}

                    {/* Key stats grid */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] text-gray-600 mb-3 bg-gray-50/70 rounded-lg px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {employmentLabel(job.employment_type)}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
                        </svg>
                        {remoteLabel(job.remote_policy)}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                        </svg>
                        <span>{openings} opening{openings !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        <span className="font-semibold text-gray-800">{job.application_count}</span>
                        <span>applicant{job.application_count !== 1 ? 's' : ''}</span>
                      </div>
                    </div>

                    {/* Experience */}
                    {job.experience_level && (
                      <div className="flex items-center gap-1.5 text-[12px] text-gray-500 mb-1.5">
                        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
                        </svg>
                        {experienceLabel(job.experience_level)}
                        {(job.experience_min !== null || job.experience_max !== null) && (
                          <span className="text-gray-400">· {job.experience_min ?? 0}{job.experience_max ? `–${job.experience_max}` : '+'} yrs</span>
                        )}
                      </div>
                    )}

                    {/* Salary */}
                    {salary && (
                      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700 mb-1.5">
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {salary}
                      </div>
                    )}

                    {/* Deadline */}
                    {deadline && (
                      <div className={`flex items-center gap-1.5 text-[12px] mb-1.5 ${deadline.urgent ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                        </svg>
                        Deadline: {deadline.text}
                        {deadline.urgentLabel && <span className="text-gray-400 font-normal">({deadline.urgentLabel})</span>}
                      </div>
                    )}

                    {/* Skills */}
                    {job.skills && job.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-auto pt-2">
                        {job.skills.slice(0, 4).map((s) => (
                          <span key={s} className="text-[11px] bg-blue-50 text-blue-600 border border-indigo-100 px-2 py-0.5 rounded-full font-medium">
                            {s}
                          </span>
                        ))}
                        {job.skills.length > 4 && (
                          <span className="text-[11px] text-gray-400 px-1 py-0.5 font-medium">+{job.skills.length - 4}</span>
                        )}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 mt-auto pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      <Link href={`/jobs/${job.id}`} className="flex-1">
                        <button className="w-full h-8 text-[12px] font-semibold border border-gray-200 text-gray-700 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50/50 transition-colors rounded-md">
                          View / Edit
                        </button>
                      </Link>
                      <Link href={`/jobs/${job.id}/applications`} className="flex-1">
                        <button className="w-full h-8 text-[12px] font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors rounded-md">
                          Applications
                          <span className="ml-1 bg-blue-500/60 rounded px-1 py-0.5 text-[10px] leading-none">
                            {job.application_count}
                          </span>
                        </button>
                      </Link>
                      {isAdmin && <DeleteDialog job={job} />}
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
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
            <div className="px-5 py-2.5 border-b border-gray-100 bg-gray-50/60">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {total} Job{total !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/40 hover:bg-gray-50/40 border-b border-gray-100">
                    <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-[260px] pl-5">Job Title</TableHead>
                    <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Location</TableHead>
                    <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Type</TableHead>
                    <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Priority</TableHead>
                    <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-center">Open</TableHead>
                    <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-center">Apps</TableHead>
                    <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Deadline</TableHead>
                    <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Recruiter</TableHead>
                    <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-right pr-5">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job, idx) => {
                    const statusConfig = JOB_STATUS_CONFIG[job.status as keyof typeof JOB_STATUS_CONFIG]
                    const priority = PRIORITY_CONFIG[job.priority] || PRIORITY_CONFIG.medium
                    const deadline = formatDeadline(job.application_deadline)
                    const openings = job.num_openings || 1

                    return (
                      <TableRow
                        key={job.id}
                        onClick={() => router.push(`/jobs/${job.id}/applications`)}
                        className={`transition-colors hover:bg-blue-50/30 border-b border-gray-50 cursor-pointer ${idx % 2 === 1 ? 'bg-gray-50/25' : 'bg-white'}`}
                      >
                        {/* Title + Dept */}
                        <TableCell className="pl-5 py-3.5">
                          <div>
                            <Link
                              href={`/jobs/${job.id}`}
                              className="text-[13px] font-semibold text-gray-900 hover:text-blue-600 transition-colors leading-snug"
                            >
                              {job.title}
                            </Link>
                            {job.department && (
                              <p className="text-[11px] text-gray-400 mt-0.5 font-medium">{job.department}</p>
                            )}
                          </div>
                        </TableCell>

                        {/* Location + Remote */}
                        <TableCell className="py-3.5">
                          <div>
                            <p className="text-[12px] text-gray-700 font-medium">{job.location || '—'}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">{remoteLabel(job.remote_policy)}</p>
                          </div>
                        </TableCell>

                        {/* Type */}
                        <TableCell className="py-3.5">
                          <span className="text-[12px] text-gray-600 font-medium">{employmentLabel(job.employment_type)}</span>
                        </TableCell>

                        {/* Status */}
                        <TableCell className="py-3.5">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusConfig?.className ?? 'bg-gray-100 text-gray-700'}`}>
                            {statusConfig?.label ?? job.status}
                          </span>
                        </TableCell>

                        {/* Priority */}
                        <TableCell className="py-3.5">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${priority.cls}`}>
                            {priority.label}
                          </span>
                        </TableCell>

                        {/* Openings */}
                        <TableCell className="text-center py-3.5">
                          <span className="text-[13px] font-bold text-gray-800">{openings}</span>
                        </TableCell>

                        {/* Applicants */}
                        <TableCell className="text-center py-3.5">
                          <span className={`text-[13px] font-bold ${
                            job.application_count > 0 ? 'text-blue-600' : 'text-gray-400'
                          }`}>
                            {job.application_count}
                          </span>
                        </TableCell>

                        {/* Deadline */}
                        <TableCell className="py-3.5">
                          {deadline ? (
                            <span className={`text-[12px] font-medium ${deadline.urgent ? 'text-red-600' : 'text-gray-600'}`}>
                              {deadline.text}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-[12px]">—</span>
                          )}
                        </TableCell>

                        {/* Recruiter */}
                        <TableCell className="py-3.5">
                          {job.assigned_to && recruiterNames[job.assigned_to] ? (
                            <span className="text-[12px] text-gray-600 font-medium">{recruiterNames[job.assigned_to]}</span>
                          ) : (
                            <span className="text-gray-300 text-[12px]">—</span>
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right pr-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Link href={`/jobs/${job.id}`}>
                              <Button
                                variant="ghost" size="sm"
                                className="h-8 w-8 p-0 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                                title="View / Edit"
                              >
                                <IconEye />
                              </Button>
                            </Link>
                            <Link href={`/jobs/${job.id}/applications`}>
                              <Button
                                variant="ghost" size="sm"
                                className="h-8 w-8 p-0 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                title="View Applications"
                              >
                                <IconUsers />
                              </Button>
                            </Link>
                            {isAdmin && <DeleteDialog job={job} />}
                          </div>
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
