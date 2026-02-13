'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getJobs, deleteJob } from '@/lib/services/jobs'
import { JOB_STATUS_CONFIG, EMPLOYMENT_TYPES } from '@/lib/constants'
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

interface Job {
  id: string
  title: string
  department: string
  location: string
  employment_type: string
  status: string
  application_count: number
  created_at: string
}

export default function JobsPage() {
  const { organization, isLoading } = useUser()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    if (!organization) return
    loadJobs()
  }, [organization, statusFilter])

  async function loadJobs() {
    if (!organization) return
    setLoading(true)
    const supabase = createClient()
    const filters: Record<string, unknown> = {}
    if (statusFilter !== 'all') filters.status = statusFilter
    if (search) filters.search = search
    const { data } = await getJobs(supabase, organization.id, filters)
    if (data) setJobs(data as Job[])
    setLoading(false)
  }

  async function handleSearch() {
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

  function downloadCSV() {
    if (jobs.length === 0) return
    const headers = ['Title', 'Department', 'Location', 'Employment Type', 'Status', 'Applicants', 'Created At']
    const rows = jobs.map((job) => [
      job.title,
      job.department || '',
      job.location || '',
      employmentLabel(job.employment_type),
      job.status,
      String(job.application_count),
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
          <p className="text-gray-500 mt-1">Manage your job postings</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={downloadCSV} disabled={jobs.length === 0}>
            Download CSV
          </Button>
          <Link href="/jobs/new">
            <Button>+ New Job</Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="flex-1">
          <Input
            placeholder="Search jobs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
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
      </div>

      {/* Jobs List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 mb-4">No jobs found. Create your first job posting!</p>
            <Link href="/jobs/new">
              <Button>Create Job</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const statusConfig = JOB_STATUS_CONFIG[job.status as keyof typeof JOB_STATUS_CONFIG]
            return (
              <Card key={job.id} className="hover:shadow-md transition-shadow">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <Link href={`/jobs/${job.id}`} className="text-lg font-semibold text-gray-900 hover:text-blue-600">
                          {job.title}
                        </Link>
                        <Badge variant={statusConfig?.variant ?? 'secondary'}>
                          {statusConfig?.label ?? job.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-sm text-gray-500">
                        {job.department && <span>{job.department}</span>}
                        {job.location && <span>{job.location}</span>}
                        <span>{employmentLabel(job.employment_type)}</span>
                        <span>{job.application_count} applicant{job.application_count !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/jobs/${job.id}`}>
                        <Button variant="outline" size="sm">View</Button>
                      </Link>
                      <Link href={`/jobs/${job.id}/applications`}>
                        <Button variant="outline" size="sm">Applications</Button>
                      </Link>
                      <Link href={`/jobs/${job.id}/pipeline`}>
                        <Button variant="outline" size="sm">Pipeline</Button>
                      </Link>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-red-600">Delete</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete job?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will soft-delete &quot;{job.title}&quot;. It can be restored later.
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
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
