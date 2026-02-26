'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getJobs, deleteJob } from '@/lib/services/jobs'
import { resolveUserNames } from './actions'
import {
  JOB_STATUS_CONFIG, EMPLOYMENT_TYPES, EXPERIENCE_LEVELS,
  REMOTE_POLICIES, JOB_PRIORITIES, ITEMS_PER_PAGE,
} from '@/lib/constants'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Pagination } from '@/components/ui/pagination'

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
      // Resolve recruiter names for assigned jobs
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

  async function handleSearch() {
    setPage(1)
    loadJobs()
  }

  async function handleDelete(jobId: string) {
    if (!organization) return
    const supabase = createClient()
    await deleteJob(supabase, jobId, organization.id)
    setJobs((prev) => prev.filter((j) => j.id !== jobId))
  }

  const employmentLabel = (val: string) =>
    EMPLOYMENT_TYPES.find((t) => t.value === val)?.label ?? val

  const experienceLabel = (val: string) =>
    EXPERIENCE_LEVELS.find((l) => l.value === val)?.label ?? val

  const remoteLabel = (val: string) =>
    REMOTE_POLICIES.find((r) => r.value === val)?.label ?? val

  const priorityConfig: Record<string, { label: string; color: string }> = {
    urgent: { label: 'Urgent', color: 'bg-red-100 text-red-700 border-red-200' },
    high: { label: 'High', color: 'bg-orange-100 text-orange-700 border-orange-200' },
    medium: { label: 'Medium', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    low: { label: 'Low', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  }

  function formatSalary(min: number | null, max: number | null, currency: string) {
    if (!min && !max) return null
    const fmt = (n: number) => {
      if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
      return n.toString()
    }
    if (min && max) return `${currency} ${fmt(min)} - ${fmt(max)}`
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
    if (diff < 0) return { text: `Expired ${formatted}`, urgent: true }
    if (diff <= 7) return { text: `${formatted} (${diff}d left)`, urgent: true }
    return { text: formatted, urgent: false }
  }

  function downloadCSV() {
    if (jobs.length === 0) return
    const headers = ['Title', 'Department', 'Location', 'Employment Type', 'Status', 'Priority', 'Openings', 'Applicants', 'Deadline', 'Assigned Recruiter', 'Created At']
    const rows = jobs.map((job) => [
      job.title,
      job.department || '',
      job.location || '',
      employmentLabel(job.employment_type),
      job.status,
      job.priority || '',
      String(job.num_openings || 1),
      String(job.application_count),
      job.application_deadline || '',
      job.assigned_to ? (recruiterNames[job.assigned_to] || '') : '',
      new Date(job.created_at).toLocaleDateString(),
    ])
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `jobs-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="text-gray-500 mt-1">{total > 0 ? `${total} total jobs` : 'Manage your job postings'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={downloadCSV} disabled={jobs.length === 0}>
            Download CSV
          </Button>
          {canManageJobs && (
            <Link href="/jobs/new">
              <Button>+ New Job</Button>
            </Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Search jobs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        {(isAdmin || canManageJobs) && (
          <Button
            variant={myJobsOnly ? 'default' : 'outline'}
            onClick={() => setMyJobsOnly(!myJobsOnly)}
            className={myJobsOnly ? 'bg-blue-600 hover:bg-blue-700' : ''}
          >
            My Assigned Jobs
          </Button>
        )}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
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
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {locations.length > 0 && (
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {EMPLOYMENT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            {JOB_PRIORITIES.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Jobs Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </div>
              <p className="text-gray-900 font-medium mb-1">No jobs found</p>
              <p className="text-gray-500 text-sm mb-4">Create your first job posting to get started.</p>
              {canManageJobs && (
                <Link href="/jobs/new">
                  <Button>Create Job</Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {jobs.map((job) => {
              const statusConfig = JOB_STATUS_CONFIG[job.status as keyof typeof JOB_STATUS_CONFIG]
              const priority = priorityConfig[job.priority] || priorityConfig.medium
              const salary = formatSalary(job.salary_min, job.salary_max, job.salary_currency)
              const deadline = formatDeadline(job.application_deadline)
              const openings = job.num_openings || 1

              return (
                <Card key={job.id} className="hover:shadow-lg transition-shadow flex flex-col">
                  <CardContent className="pt-5 pb-4 flex flex-col flex-1">
                    {/* Header: Status + Priority */}
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant={statusConfig?.variant ?? 'secondary'} className={statusConfig?.className}>
                        {statusConfig?.label ?? job.status}
                      </Badge>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${priority.color}`}>
                        {priority.label}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-lg font-semibold text-gray-900 mb-1 line-clamp-2">
                      {job.title}
                    </h3>

                    {/* Department & Location */}
                    <div className="flex items-center gap-3 text-sm text-gray-500 mb-3">
                      {job.department && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>
                          {job.department}
                        </span>
                      )}
                      {job.location && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                          {job.location}
                        </span>
                      )}
                    </div>

                    {/* Assigned Recruiter */}
                    {job.assigned_to && recruiterNames[job.assigned_to] && (
                      <div className="flex items-center gap-1.5 text-sm text-indigo-600 mb-2">
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                        {recruiterNames[job.assigned_to]}
                      </div>
                    )}

                    {/* Info Grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-3">
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {employmentLabel(job.employment_type)}
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" /></svg>
                        {remoteLabel(job.remote_policy)}
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                        {openings} opening{openings !== 1 ? 's' : ''}
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                        {job.application_count} applicant{job.application_count !== 1 ? 's' : ''}
                      </div>
                    </div>

                    {/* Experience Level */}
                    {job.experience_level && (
                      <div className="flex items-center gap-1.5 text-sm text-gray-600 mb-2">
                        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" /></svg>
                        {experienceLabel(job.experience_level)}
                        {(job.experience_min !== null || job.experience_max !== null) && (
                          <span className="text-gray-400">
                            ({job.experience_min ?? 0}{job.experience_max ? `-${job.experience_max}` : '+'} yrs)
                          </span>
                        )}
                      </div>
                    )}

                    {/* Salary */}
                    {salary && (
                      <div className="flex items-center gap-1.5 text-sm font-medium text-green-700 mb-2">
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {salary}
                      </div>
                    )}

                    {/* Deadline */}
                    {deadline && (
                      <div className={`flex items-center gap-1.5 text-sm mb-2 ${deadline.urgent ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                        Deadline: {deadline.text}
                      </div>
                    )}

                    {/* Skills */}
                    {job.skills && job.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3 mt-auto">
                        {job.skills.slice(0, 4).map((s) => (
                          <span key={s} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s}</span>
                        ))}
                        {job.skills.length > 4 && (
                          <span className="text-xs text-gray-400 px-1 py-0.5">+{job.skills.length - 4}</span>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 mt-auto pt-3 border-t">
                      <Link href={`/jobs/${job.id}`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full">
                          View / Edit
                        </Button>
                      </Link>
                      <Link href={`/jobs/${job.id}/applications`} className="flex-1">
                        <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700">
                          Applications ({job.application_count})
                        </Button>
                      </Link>
                      {isAdmin && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 px-2">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete job?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will delete &quot;{job.title}&quot; and all related data (applications, interviews, offers, pipeline stages, scores).
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(job.id)} className="bg-red-600 hover:bg-red-700">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          <Pagination page={page} totalPages={Math.ceil(total / ITEMS_PER_PAGE)} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}
