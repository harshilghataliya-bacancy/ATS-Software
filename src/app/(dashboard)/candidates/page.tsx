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
  const [locations, setLocations] = useState<string[]>([])
  const [titles, setTitles] = useState<string[]>([])
  const [availableJobs, setAvailableJobs] = useState<{ id: string; title: string }[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<ViewMode>('table')

  useEffect(() => {
    if (!organization) return
    loadCandidates()
  }, [organization, sourceFilter, titleFilter, page])

  useEffect(() => { setPage(1) }, [sourceFilter, locationFilter, titleFilter, appStatusFilter, jobFilter])

  async function loadCandidates() {
    if (!organization) return
    setLoading(true)
    const supabase = createClient()
    const filters: Record<string, unknown> = { page }
    if (sourceFilter !== 'all') filters.source = sourceFilter
    if (titleFilter !== 'all') filters.current_title = titleFilter
    if (search) filters.search = search
    const { data, count } = await getCandidates(supabase, organization.id, filters)
    if (data) {
      const list = data as Candidate[]
      setCandidates(list)
      if (sourceFilter === 'all' && locationFilter === 'all' && titleFilter === 'all' && !search) {
        // Normalize to city-only (first segment before comma) to avoid duplicates like "Ahmedabad" / "Ahmedabad, GJ" / "Ahmedabad, India"
        const citySet = new Set<string>()
        list.forEach((c) => {
          if (c.location) citySet.add(c.location.split(',')[0].trim())
        })
        const locs = Array.from(citySet).filter(Boolean).sort()
        const tls = Array.from(new Set(list.map((c) => c.current_title).filter(Boolean) as string[])).sort()
        setLocations(locs)
        setTitles(tls)
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

  async function handleSearch() {
    setPage(1)
    loadCandidates()
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-gray-900">Candidates</h1>
          <p className="text-sm text-gray-400 mt-0.5 font-medium">
            {total > 0 ? `${total} total candidate${total !== 1 ? 's' : ''}` : 'Manage your candidate pool'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-1">
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
          </div>

          <Button variant="outline" size="sm" className="h-9" onClick={downloadCSV} disabled={candidates.length === 0}>
            Export CSV
          </Button>
          {canManageCandidates && (
            <Link href="/candidates/new">
              <Button size="sm" className="h-9 bg-blue-600 hover:bg-blue-700 text-white">
                + Add Candidate
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="h-9 bg-white border-gray-200"
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
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6 py-16 text-center">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
              </div>
              <p className="text-gray-900 font-medium mb-1">No candidates found</p>
              <p className="text-gray-500 text-sm mb-4">
                {search || sourceFilter !== 'all' || hasClientFilters ? 'Try adjusting your filters.' : 'Add your first candidate to get started.'}
              </p>
              {canManageCandidates && !search && sourceFilter === 'all' && !hasClientFilters && (
                <Link href="/candidates/new">
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">Add Candidate</Button>
                </Link>
              )}
            </div>
          </div>
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
                        <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                        </svg>
                        <span className="truncate">{candidate.email}</span>
                      </div>
                      {candidate.phone && (
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                          </svg>
                          <span>{candidate.phone}</span>
                        </div>
                      )}
                      {(candidate.current_title || candidate.current_company) && (
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                          <span className="truncate">
                            {[candidate.current_title, candidate.current_company].filter(Boolean).join(' · ')}
                          </span>
                        </div>
                      )}
                      {candidate.location && (
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                          </svg>
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
    </div>
  )
}
