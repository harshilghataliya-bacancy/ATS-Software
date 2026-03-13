'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getCandidates, deleteCandidate } from '@/lib/services/candidates'
import { CANDIDATE_SOURCES, ITEMS_PER_PAGE } from '@/lib/constants'
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
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { BulkResumeUploadDialog } from '@/components/bulk-upload/bulk-resume-upload-dialog'
import { getJobs } from '@/lib/services/jobs'
import {
  LayoutGrid, List, Download, Upload, Plus, Users, Search,
  Mail, Phone, Briefcase, MapPin,
} from 'lucide-react'

type ViewMode = 'table' | 'card'

interface CandidateApplication {
  id: string
  status: string
  job: { id: string; title: string; department: string } | null
  current_stage: { name: string; stage_type: string } | null
}

interface Candidate {
  id: string
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  current_company?: string | null
  current_title?: string | null
  location?: string | null
  source: string
  tags?: string[] | null
  created_at: string
  applications?: CandidateApplication[]
  application_count?: number
}

export default function CandidatesPage() {
  const { organization, isLoading } = useUser()
  const { canManageCandidates, isInterviewer } = useRole()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && isInterviewer) {
      router.replace('/interviews')
    }
  }, [isLoading, isInterviewer, router])

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [locationFilter, setLocationFilter] = useState<string>('all')
  const [titleFilter, setTitleFilter] = useState<string>('all')
  const [appStatusFilter, setAppStatusFilter] = useState<string>('all')
  const [jobFilter, setJobFilter] = useState<string>('all')
  const [tagFilter, setTagFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('date_desc')
  const [locations, setLocations] = useState<string[]>([])
  const [titles, setTitles] = useState<string[]>([])
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [availableJobs, setAvailableJobs] = useState<{ id: string; title: string }[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('candidates-view') as ViewMode) || 'table'
    }
    return 'table'
  })

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode)
    localStorage.setItem('candidates-view', mode)
  }

  // Bulk upload state
  const [bulkJobPickerOpen, setBulkJobPickerOpen] = useState(false)
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false)
  const [bulkSelectedJob, setBulkSelectedJob] = useState<{ id: string; title: string } | null>(null)
  const [allJobs, setAllJobs] = useState<{ id: string; title: string }[]>([])
  const [loadingJobs, setLoadingJobs] = useState(false)

  async function openBulkUpload() {
    if (allJobs.length === 0) {
      setLoadingJobs(true)
      const supabase = createClient()
      const { data } = await getJobs(supabase, organization!.id, { status: 'published' })
      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAllJobs(data.map((j: any) => ({ id: j.id, title: j.title })))
      }
      setLoadingJobs(false)
    }
    setBulkJobPickerOpen(true)
  }

  function handleBulkJobSelect(jobId: string) {
    const job = allJobs.find((j) => j.id === jobId)
    if (job) {
      setBulkSelectedJob(job)
      setBulkJobPickerOpen(false)
      setBulkUploadOpen(true)
    }
  }

  const [debouncedSearch, setDebouncedSearch] = useState(search)

  // Debounce search: reload when user stops typing or clears the field
  useEffect(() => {
    if (search === '') {
      // Immediately reload when cleared
      setDebouncedSearch('')
      return
    }
    const timer = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!organization) return
    loadCandidates()
  }, [organization, sourceFilter, titleFilter, tagFilter, page, debouncedSearch])

  useEffect(() => { setPage(1) }, [sourceFilter, locationFilter, titleFilter, appStatusFilter, jobFilter, tagFilter])

  async function loadCandidates() {
    if (!organization) return
    setLoading(true)
    const supabase = createClient()
    const filters: Record<string, unknown> = { page }
    if (sourceFilter !== 'all') filters.source = sourceFilter
    if (titleFilter !== 'all') filters.current_title = titleFilter
    if (tagFilter !== 'all') filters.tags = [tagFilter]
    if (debouncedSearch) filters.search = debouncedSearch
    const { data, count } = await getCandidates(supabase, organization.id, filters)
    if (data) {
      const list = data as Candidate[]
      setCandidates(list)
      if (sourceFilter === 'all' && locationFilter === 'all' && titleFilter === 'all' && tagFilter === 'all' && !search) {
        // Normalize to city-only (first segment before comma) to avoid duplicates like "Ahmedabad" / "Ahmedabad, GJ" / "Ahmedabad, India"
        const citySet = new Set<string>()
        list.forEach((c) => {
          if (c.location) citySet.add(c.location.split(',')[0].trim())
        })
        const locs = Array.from(citySet).filter(Boolean).sort()
        const tls = Array.from(new Set(list.map((c) => c.current_title).filter(Boolean) as string[])).sort()
        setLocations(locs)
        setTitles(tls)
        // Collect unique tags across all candidates
        const tagSet = new Set<string>()
        list.forEach((c) => c.tags?.forEach((t) => tagSet.add(t)))
        setAvailableTags(Array.from(tagSet).sort())
        // Collect unique jobs across all candidates' applications
        const jobMap = new Map<string, string>()
        list.forEach((c) => c.applications?.forEach((a) => {
          if (a.job) jobMap.set(a.job.id, a.job.title)
        }))
        setAvailableJobs(Array.from(jobMap.entries()).map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title)))
      }
    }
    if (count !== undefined && count !== null) setTotal(count)
    setLoading(false)
  }

  function handleSearch() {
    setPage(1)
    setDebouncedSearch(search)
  }

  async function handleDelete(candidateId: string) {
    if (!organization) return
    const supabase = createClient()
    await deleteCandidate(supabase, candidateId, organization.id)
    setCandidates((prev) => prev.filter((c) => c.id !== candidateId))
  }

  const sourceLabel = (val: string) =>
    CANDIDATE_SOURCES.find((s) => s.value === val)?.label ?? val

  const appStatusColor: Record<string, string> = {
    active:    'bg-green-100 text-green-700',
    hired:     'bg-emerald-100 text-emerald-700',
    rejected:  'bg-red-100 text-red-700',
    withdrawn: 'bg-gray-100 text-gray-600',
  }

  // Client-side filter by app status / job / location (city-normalized)
  const filteredCandidates = candidates.filter((c) => {
    if (appStatusFilter !== 'all') {
      if (!c.applications?.some((a) => a.status === appStatusFilter)) return false
    }
    if (jobFilter !== 'all') {
      if (!c.applications?.some((a) => a.job?.id === jobFilter)) return false
    }
    if (locationFilter !== 'all') {
      const city = locationFilter.toLowerCase()
      if (!c.location || !c.location.toLowerCase().startsWith(city)) return false
    }
    return true
  }).sort((a, b) => {
    switch (sortBy) {
      case 'name_asc':
        return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
      case 'name_desc':
        return `${b.first_name} ${b.last_name}`.localeCompare(`${a.first_name} ${a.last_name}`)
      case 'date_asc':
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      case 'location_asc':
        return (a.location ?? '').localeCompare(b.location ?? '')
      case 'location_desc':
        return (b.location ?? '').localeCompare(a.location ?? '')
      case 'date_desc':
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    }
  })

  const hasClientFilters = appStatusFilter !== 'all' || jobFilter !== 'all' || locationFilter !== 'all'

  function downloadCSV() {
    if (candidates.length === 0) return
    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Source', 'Current Title', 'Current Company', 'Location', 'Tags', 'Created At']
    const rows = candidates.map((c) => [
      c.first_name, c.last_name, c.email, c.phone || '',
      sourceLabel(c.source), c.current_title || '', c.current_company || '',
      c.location || '', (c.tags ?? []).join('; '),
      new Date(c.created_at).toLocaleDateString(),
    ])
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `candidates-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isInterviewer) return null

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  function DeleteDialog({ candidate }: { candidate: Candidate }) {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost" size="sm"
            className="h-8 px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
            onClick={(e) => e.stopPropagation()}
          >
            Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete candidate?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete <strong>{candidate.first_name} {candidate.last_name}</strong> and all related data (applications, interviews, offers, scores).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleDelete(candidate.id)} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-sm shadow-blue-200">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Candidates</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {total > 0 ? `${total} total candidate${total !== 1 ? 's' : ''}` : 'Manage your candidate pool'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-1">
            <button
              onClick={() => changeViewMode('table')}
              title="Table view"
              className={`flex items-center justify-center w-8 h-7 rounded-md transition-all duration-150 ${
                viewMode === 'table'
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => changeViewMode('card')}
              title="Card view"
              className={`flex items-center justify-center w-8 h-7 rounded-md transition-all duration-150 ${
                viewMode === 'card'
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>

          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={downloadCSV} disabled={candidates.length === 0}>
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
          {canManageCandidates && (
            <>
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={openBulkUpload}>
                <Upload className="w-3.5 h-3.5" />
                Bulk Upload
              </Button>
              <Link href="/candidates/new">
                <Button size="sm" className="h-9 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                  <Plus className="w-4 h-4" />
                  Add Candidate
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="h-9 bg-white border-gray-200 pl-9"
          />
        </div>
        <Select value={appStatusFilter} onValueChange={setAppStatusFilter}>
          <SelectTrigger className="h-9 w-[150px] border-gray-200 bg-white text-sm">
            <SelectValue placeholder="Hiring Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="hired">Hired</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="withdrawn">Withdrawn</SelectItem>
          </SelectContent>
        </Select>
        {availableJobs.length > 0 && (
          <Select value={jobFilter} onValueChange={setJobFilter}>
            <SelectTrigger className="h-9 w-[180px] border-gray-200 bg-white text-sm">
              <SelectValue placeholder="Job" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Jobs</SelectItem>
              {availableJobs.map((j) => (
                <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="h-9 w-[130px] border-gray-200 bg-white text-sm">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {CANDIDATE_SOURCES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {locations.length > 0 && (
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="h-9 w-[130px] border-gray-200 bg-white text-sm">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {titles.length > 0 && (
          <Select value={titleFilter} onValueChange={setTitleFilter}>
            <SelectTrigger className="h-9 w-[150px] border-gray-200 bg-white text-sm">
              <SelectValue placeholder="Title" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Titles</SelectItem>
              {titles.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {availableTags.length > 0 && (
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="h-9 w-[140px] border-gray-200 bg-white text-sm">
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tags</SelectItem>
              {availableTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="h-9 w-[150px] border-gray-200 bg-white text-sm">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date_desc">Newest First</SelectItem>
            <SelectItem value="date_asc">Oldest First</SelectItem>
            <SelectItem value="name_asc">Name A-Z</SelectItem>
            <SelectItem value="name_desc">Name Z-A</SelectItem>
            <SelectItem value="location_asc">Location A-Z</SelectItem>
            <SelectItem value="location_desc">Location Z-A</SelectItem>
          </SelectContent>
        </Select>
        {hasClientFilters && (
          <Button
            variant="ghost" size="sm"
            className="h-9 text-xs text-gray-500 hover:text-gray-900"
            onClick={() => { setAppStatusFilter('all'); setJobFilter('all'); setLocationFilter('all') }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        viewMode === 'table' ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
          </div>
        )
      ) : filteredCandidates.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-xl">
          <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 font-medium">No candidates found</p>
          <p className="text-xs text-gray-400 mt-1">
            {search || sourceFilter !== 'all' || hasClientFilters ? 'Try adjusting your filters.' : 'Add your first candidate to get started.'}
          </p>
          {canManageCandidates && !search && sourceFilter === 'all' && !hasClientFilters && (
            <Link href="/candidates/new">
              <Button size="sm" className="mt-4 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="w-3.5 h-3.5" />
                Add Candidate
              </Button>
            </Link>
          )}
        </div>

      ) : viewMode === 'table' ? (
        /* ── TABLE VIEW (card-list style) ── */
        <div className="space-y-3">
          {filteredCandidates.map((candidate) => {
            const initials = `${candidate.first_name?.[0] ?? ''}${candidate.last_name?.[0] ?? ''}`.toUpperCase()
            return (
              <div
                key={candidate.id}
                onClick={() => router.push(`/candidates/${candidate.id}`)}
                className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold shrink-0">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-semibold text-gray-900">
                            {candidate.first_name} {candidate.last_name}
                          </span>
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                            {sourceLabel(candidate.source)}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-0.5 text-sm text-gray-500">
                          <span>{candidate.email}</span>
                          {candidate.phone && <span>{candidate.phone}</span>}
                          {candidate.location && <span>{candidate.location}</span>}
                        </div>
                        {candidate.applications && candidate.applications.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {candidate.applications.slice(0, 3).map((app) => (
                              <span key={app.id} className="inline-flex items-center gap-1.5 text-xs bg-gray-50 border border-gray-200 rounded-full px-2.5 py-0.5">
                                <span className="font-medium text-gray-700 truncate max-w-[120px]">{app.job?.title ?? 'Unknown Job'}</span>
                                {app.current_stage && (
                                  <span className="text-gray-400">· {app.current_stage.name}</span>
                                )}
                                <span className={`px-1.5 py-0 rounded-full text-[10px] font-semibold ${appStatusColor[app.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                  {app.status}
                                </span>
                              </span>
                            ))}
                            {candidate.applications.length > 3 && (
                              <span className="text-xs text-gray-400 self-center">+{candidate.applications.length - 3} more</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {canManageCandidates && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <DeleteDialog candidate={candidate} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>

      ) : (
        /* ── CARD VIEW ── */
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredCandidates.map((candidate) => {
              const initials = `${candidate.first_name?.[0] ?? ''}${candidate.last_name?.[0] ?? ''}`.toUpperCase()
              return (
                <div
                  key={candidate.id}
                  onClick={() => router.push(`/candidates/${candidate.id}`)}
                  className="group bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer"
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold shrink-0">
                          {initials}
                        </div>
                        <div>
                          <p className="text-[14px] font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
                            {candidate.first_name} {candidate.last_name}
                          </p>
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 mt-0.5 inline-block">{sourceLabel(candidate.source)}</span>
                        </div>
                      </div>
                      {canManageCandidates && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <DeleteDialog candidate={candidate} />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5 text-[12px] text-gray-500">
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3 h-3 text-gray-400 shrink-0" />
                        <span className="truncate">{candidate.email}</span>
                      </div>
                      {candidate.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                          <span>{candidate.phone}</span>
                        </div>
                      )}
                      {(candidate.current_title || candidate.current_company) && (
                        <div className="flex items-center gap-1.5">
                          <Briefcase className="w-3 h-3 text-gray-400 shrink-0" />
                          <span className="truncate">
                            {[candidate.current_title, candidate.current_company].filter(Boolean).join(' · ')}
                          </span>
                        </div>
                      )}
                      {candidate.location && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                          <span>{candidate.location}</span>
                        </div>
                      )}
                    </div>

                    {candidate.tags && candidate.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-gray-100">
                        {candidate.tags.slice(0, 4).map((tag) => (
                          <span key={tag} className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full font-medium">
                            {tag}
                          </span>
                        ))}
                        {candidate.tags.length > 4 && (
                          <span className="text-[10px] text-gray-400 px-1 py-0.5">+{candidate.tags.length - 4}</span>
                        )}
                      </div>
                    )}

                    {candidate.applications && candidate.applications.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                        {candidate.applications.slice(0, 2).map((app) => (
                          <div key={app.id} className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium text-gray-700 truncate">{app.job?.title ?? 'Unknown Job'}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              {app.current_stage && (
                                <span className="text-[10px] text-gray-400">{app.current_stage.name}</span>
                              )}
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${appStatusColor[app.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                {app.status}
                              </span>
                            </div>
                          </div>
                        ))}
                        {candidate.applications.length > 2 && (
                          <p className="text-[10px] text-gray-400">+{candidate.applications.length - 2} more application{candidate.applications.length - 2 !== 1 ? 's' : ''}</p>
                        )}
                      </div>
                    )}

                    <p className="text-[11px] text-gray-400 mt-2.5">
                      Added {new Date(candidate.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
      {/* Bulk Upload: Job Picker Dialog */}
      <Dialog open={bulkJobPickerOpen} onOpenChange={setBulkJobPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select a Job for Bulk Upload</DialogTitle>
            <DialogDescription>
              Choose which job posting these resumes should be applied to.
            </DialogDescription>
          </DialogHeader>
          {loadingJobs ? (
            <div className="py-8 text-center text-sm text-gray-500">Loading jobs...</div>
          ) : allJobs.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">No published jobs found. Create a job first.</div>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {allJobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => handleBulkJobSelect(job.id)}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm font-medium text-gray-800"
                >
                  {job.title}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Upload Dialog */}
      {bulkSelectedJob && (
        <BulkResumeUploadDialog
          open={bulkUploadOpen}
          onOpenChange={(open) => {
            setBulkUploadOpen(open)
            if (!open) setBulkSelectedJob(null)
          }}
          jobId={bulkSelectedJob.id}
          jobTitle={bulkSelectedJob.title}
          onComplete={() => loadCandidates()}
        />
      )}
    </div>
  )
}
