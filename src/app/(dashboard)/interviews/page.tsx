'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getInterviews } from '@/lib/services/interviews'
import { INTERVIEW_TYPES, ITEMS_PER_PAGE } from '@/lib/constants'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
// AlertDialog imports removed — actions moved to interview detail page
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Pagination } from '@/components/ui/pagination'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  List, LayoutGrid, Calendar, Briefcase, Clock, MapPin, Eye,
  ExternalLink, Star, MoreHorizontal, Filter,
  Video, Users2,
} from 'lucide-react'

type ViewMode = 'list' | 'card'

interface InterviewCandidate {
  id: string
  first_name: string
  last_name: string
  email: string
}

interface InterviewApplication {
  id: string
  candidate: InterviewCandidate
  job: { id: string; title: string; department: string }
}

interface InterviewFeedback {
  id: string
  interview_id: string
  user_id: string
  rating: number
  recommendation: string
  strengths: string | null
  weaknesses: string | null
  notes: string | null
  created_at: string
  criteria_ratings?: Array<{ criteria_id: string; criteria_name: string; rating: number; weight: number }> | null
}

interface Interview {
  id: string
  application: InterviewApplication
  interview_type: string
  status: string
  scheduled_at: string
  duration_minutes: number
  location?: string | null
  meeting_link?: string | null
  notes?: string | null
  interview_panelists?: Array<{ user_id: string; role: string }>
  interview_feedback?: InterviewFeedback[]
}

/* ── Status styling ── */
const STATUS_DOT: Record<string, string> = {
  scheduled:  'bg-blue-500',
  completed:  'bg-emerald-500',
  cancelled:  'bg-rose-400',
  no_show:    'bg-amber-400',
}

const STATUS_PILL: Record<string, string> = {
  scheduled:  'bg-blue-50 text-blue-700 border-blue-200',
  completed:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled:  'bg-rose-50 text-rose-600 border-rose-200',
  no_show:    'bg-amber-50 text-amber-600 border-amber-200',
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show:   'No Show',
}

/* ── Interview type styling ── */
const TYPE_DOT: Record<string, string> = {
  video:  'bg-violet-500',
  onsite: 'bg-emerald-500',
}

/* ── Gradient avatars (same as jobs page) ── */
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

/* ── Recommendation styling ── */
const RECOMMENDATION_DOT: Record<string, string> = {
  select: 'bg-emerald-500',
  reject: 'bg-rose-500',
  hold:   'bg-amber-500',
}

const RECOMMENDATION_PILL: Record<string, string> = {
  select: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  reject: 'bg-rose-50 text-rose-600 border-rose-200',
  hold:   'bg-amber-50 text-amber-600 border-amber-200',
}

export default function InterviewsPage() {
  const { user, organization, isLoading } = useUser()
  const { isInterviewer } = useRole()
  const router = useRouter()

  const [interviews, setInterviews] = useState<Interview[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('scheduled')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<ViewMode>('card')
  const [showFilters, setShowFilters] = useState(false)
  const [feedbackInterview, setFeedbackInterview] = useState<Interview | null>(null)

  const loadInterviews = useCallback(async () => {
    if (!organization) return
    setLoading(true)
    const supabase = createClient()
    const filters: Record<string, unknown> = { page }
    if (statusFilter !== 'all') filters.status = statusFilter
    if (typeFilter !== 'all') filters.interview_type = typeFilter
    if (isInterviewer && user?.id) filters.panelistUserId = user.id
    const { data, count } = await getInterviews(supabase, organization.id, filters)
    if (data) setInterviews(data as Interview[])
    if (count !== undefined && count !== null) setTotal(count)
    setLoading(false)
  }, [organization, statusFilter, typeFilter, page, isInterviewer, user])

  useEffect(() => {
    if (organization) loadInterviews()
  }, [organization, loadInterviews])

  useEffect(() => { setPage(1) }, [statusFilter, typeFilter])

  const typeLabel = (val: string) => INTERVIEW_TYPES.find((t) => t.value === val)?.label ?? val

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  function relativeDate(dateStr: string): { label: string; urgent: boolean } {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = d.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    const today = now.toDateString() === d.toDateString()
    if (today) return { label: 'Today', urgent: true }
    if (diffDays === 1) return { label: 'Tomorrow', urgent: false }
    if (diffDays > 1 && diffDays <= 7) return { label: `In ${diffDays} days`, urgent: false }
    if (diffDays < 0) return { label: `${Math.abs(diffDays)}d ago`, urgent: true }
    return { label: formatDate(dateStr), urgent: false }
  }

  const now = new Date()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)
  const activeFilterCount = [statusFilter, typeFilter].filter(f => f !== 'all').length

  // Status summary counts
  const statusCounts = interviews.reduce<Record<string, number>>((acc, iv) => {
    acc[iv.status] = (acc[iv.status] || 0) + 1
    return acc
  }, {})

  /* ── Dropdown actions for each interview (used in both views) ── */
  function InterviewActions({ interview }: { interview: Interview }) {
    const candidate = interview.application?.candidate
    const candidateName = candidate ? `${candidate.first_name} ${candidate.last_name}` : 'Unknown'
    const hasActions = interview.status === 'scheduled' || (interview.interview_feedback?.length ?? 0) > 0

    if (!hasActions) return null

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => router.push(`/interviews/${interview.id}?from=interviews`)}>
            <Eye className="w-3.5 h-3.5 mr-2 text-gray-400" />
            <span className="text-[13px]">View Details</span>
          </DropdownMenuItem>

          {(interview.interview_feedback?.length ?? 0) > 0 && (
            <DropdownMenuItem onClick={() => setFeedbackInterview(interview)}>
              <Star className="w-3.5 h-3.5 mr-2 text-gray-400" />
              <span className="text-[13px]">View Feedback ({interview.interview_feedback?.length})</span>
            </DropdownMenuItem>
          )}

          {interview.meeting_link && (
            <DropdownMenuItem asChild>
              <a href={interview.meeting_link} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5 mr-2 text-gray-400" />
                <span className="text-[13px]">Join Meeting</span>
              </a>
            </DropdownMenuItem>
          )}

          {/* Mark Complete, No Show, and Cancel actions are available on the interview detail page */}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">
            {isInterviewer ? 'My Interviews' : 'Interviews'}
          </h1>
          <p className="text-[13px] text-gray-400 mt-0.5">
            {isInterviewer
              ? total > 0 ? `${total} interview${total !== 1 ? 's' : ''} assigned to you` : 'No interviews assigned yet'
              : total > 0 ? `${total} total interview${total !== 1 ? 's' : ''}` : 'Manage interview schedules'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle — dark active state */}
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
              onClick={() => setViewMode('list')}
              className={`flex items-center justify-center w-8 h-7 rounded-md transition-all duration-150 ${
                viewMode === 'list'
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[12px] font-medium transition-all ${
              showFilters || activeFilterCount > 0
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                showFilters ? 'bg-white text-gray-900' : 'bg-gray-900 text-white'
              }`}>
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Status summary pills ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {Object.entries(STATUS_LABEL).map(([key, label]) => {
          const count = statusCounts[key] || 0
          const isActive = statusFilter === key
          return (
            <button
              key={key}
              onClick={() => setStatusFilter(isActive ? 'all' : key)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                isActive
                  ? STATUS_PILL[key]
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[key]}`} />
              {label}
              {count > 0 && <span className="text-[10px] opacity-70">{count}</span>}
            </button>
          )
        })}
        {statusFilter !== 'all' && statusFilter !== 'scheduled' && (
          <button
            onClick={() => setStatusFilter('all')}
            className="text-[11px] text-gray-400 hover:text-gray-600 ml-1 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Collapsible Filters ── */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Type</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-40 h-8 text-[12px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {INTERVIEW_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(typeFilter !== 'all') && (
              <button
                onClick={() => { setTypeFilter('all') }}
                className="self-end text-[11px] text-gray-400 hover:text-gray-600 pb-2 transition-colors"
              >
                Reset all
              </button>
            )}
          </div>
        </div>
      )}


      {/* ── Content ── */}
      {loading ? (
        viewMode === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        )
      ) : interviews.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100">
          <div className="py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-5 h-5 text-gray-300" />
            </div>
            <p className="text-[13px] font-medium text-gray-500">No interviews found</p>
            <p className="text-[12px] text-gray-400 mt-0.5">Schedule interviews from a candidate&apos;s pipeline.</p>
          </div>
        </div>

      ) : viewMode === 'card' ? (
        /* ── CARD VIEW ── */
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {interviews.map((interview) => {
              const isPast = new Date(interview.scheduled_at) < now
              const candidate = interview.application?.candidate
              const job = interview.application?.job
              const candidateName = candidate ? `${candidate.first_name} ${candidate.last_name}` : 'Unknown'
              const initials = candidate
                ? `${candidate.first_name?.[0] ?? ''}${candidate.last_name?.[0] ?? ''}`.toUpperCase()
                : '??'
              const rel = relativeDate(interview.scheduled_at)
              const feedbackCount = interview.interview_feedback?.length ?? 0

              return (
                <div
                  key={interview.id}
                  onClick={() => router.push(`/interviews/${interview.id}?from=interviews`)}
                  className={`group bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden ${
                    isPast && interview.status === 'scheduled' ? 'bg-amber-50/20' : ''
                  }`}
                >
                  {/* Top accent line */}
                  <div className={`h-[2px] ${STATUS_DOT[interview.status] ?? 'bg-gray-200'}`} />

                  <div className="p-4 space-y-3">
                    {/* Header: Avatar + Name + Actions */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getGradient(candidateName)} flex items-center justify-center shrink-0`}>
                          <span className="text-[11px] font-semibold text-white">{initials}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                            {candidateName}
                          </p>
                          {candidate?.email && (
                            <p className="text-[11px] text-gray-400 truncate">{candidate.email}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {/* Status pill */}
                        <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_PILL[interview.status]}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[interview.status]}`} />
                          {STATUS_LABEL[interview.status]}
                        </span>
                        <InterviewActions interview={interview} />
                      </div>
                    </div>

                    {/* Job */}
                    {job && (
                      <div className="flex items-center gap-1.5 text-[12px] text-gray-500">
                        <Briefcase className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                        <span className="truncate">{job.title}</span>
                        {job.department && <span className="text-gray-300">·</span>}
                        {job.department && <span className="text-gray-400">{job.department}</span>}
                      </div>
                    )}

                    {/* Schedule info */}
                    <div className="flex items-center gap-4 text-[11px] text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-gray-300" />
                        <span className={rel.urgent ? 'text-amber-600 font-medium' : ''}>{rel.label}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-gray-300" />
                        {formatTime(interview.scheduled_at)} · {interview.duration_minutes}m
                      </span>
                      {interview.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-gray-300" />
                          <span className="truncate max-w-[100px]">{interview.location}</span>
                        </span>
                      )}
                    </div>

                    {/* Footer: Type + Feedback + Meeting link */}
                    <div className="flex items-center justify-between pt-2.5 border-t border-gray-50">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-gray-200 text-gray-600">
                          <span className={`w-1.5 h-1.5 rounded-full ${TYPE_DOT[interview.interview_type] ?? 'bg-gray-300'}`} />
                          {typeLabel(interview.interview_type)}
                        </span>
                        {feedbackCount > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setFeedbackInterview(interview) }}
                            className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors border border-blue-200"
                          >
                            <Star className="w-3 h-3" />
                            {feedbackCount}
                          </button>
                        )}
                        {(interview.interview_panelists?.length ?? 0) > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-gray-400">
                            <Users2 className="w-3 h-3" />
                            {interview.interview_panelists?.length}
                          </span>
                        )}
                      </div>
                      {interview.meeting_link && (
                        <a
                          href={interview.meeting_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-[10px] text-blue-600 font-medium hover:text-blue-700 transition-colors"
                        >
                          <Video className="w-3 h-3" />
                          Join
                        </a>
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
        /* ── LIST / TABLE VIEW ── */
        <>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-50 hover:bg-transparent">
                  <TableHead className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider py-3 pl-4">Candidate</TableHead>
                  <TableHead className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider py-3">Job</TableHead>
                  <TableHead className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider py-3">Schedule</TableHead>
                  <TableHead className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider py-3">Type</TableHead>
                  <TableHead className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider py-3">Status</TableHead>
                  <TableHead className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider py-3">Feedback</TableHead>
                  <TableHead className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider py-3 pr-4 w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interviews.map((interview) => {
                  const isPast = new Date(interview.scheduled_at) < now
                  const candidate = interview.application?.candidate
                  const job = interview.application?.job
                  const candidateName = candidate ? `${candidate.first_name} ${candidate.last_name}` : 'Unknown'
                  const initials = candidate
                    ? `${candidate.first_name?.[0] ?? ''}${candidate.last_name?.[0] ?? ''}`.toUpperCase()
                    : '??'
                  const rel = relativeDate(interview.scheduled_at)
                  const feedbackCount = interview.interview_feedback?.length ?? 0

                  return (
                    <TableRow
                      key={interview.id}
                      onClick={() => router.push(`/interviews/${interview.id}?from=interviews`)}
                      className={`group cursor-pointer border-gray-50 hover:bg-gray-50/50 transition-colors ${
                        isPast && interview.status === 'scheduled' ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      {/* Candidate */}
                      <TableCell className="py-3 pl-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getGradient(candidateName)} flex items-center justify-center shrink-0`}>
                            <span className="text-[10px] font-semibold text-white">{initials}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[12px] font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                              {candidateName}
                            </p>
                            {candidate?.email && (
                              <p className="text-[11px] text-gray-400 truncate max-w-[180px]">{candidate.email}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Job */}
                      <TableCell className="py-3">
                        <div className="min-w-0">
                          <p className="text-[12px] text-gray-700 truncate max-w-[160px]">{job?.title ?? 'Unknown'}</p>
                          {job?.department && (
                            <p className="text-[11px] text-gray-400">{job.department}</p>
                          )}
                        </div>
                      </TableCell>

                      {/* Schedule */}
                      <TableCell className="py-3">
                        <div>
                          <p className={`text-[12px] font-medium ${rel.urgent ? 'text-amber-600' : 'text-gray-700'}`}>
                            {rel.label}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {formatTime(interview.scheduled_at)} · {interview.duration_minutes}m
                          </p>
                        </div>
                      </TableCell>

                      {/* Type */}
                      <TableCell className="py-3">
                        <span className="flex items-center gap-1.5 text-[11px] text-gray-600">
                          <span className={`w-1.5 h-1.5 rounded-full ${TYPE_DOT[interview.interview_type] ?? 'bg-gray-300'}`} />
                          {typeLabel(interview.interview_type)}
                        </span>
                      </TableCell>

                      {/* Status */}
                      <TableCell className="py-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_PILL[interview.status]}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[interview.status]}`} />
                          {STATUS_LABEL[interview.status]}
                        </span>
                      </TableCell>

                      {/* Feedback */}
                      <TableCell className="py-3">
                        {feedbackCount > 0 ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setFeedbackInterview(interview) }}
                            className="flex items-center gap-1 text-[11px] text-blue-600 font-medium hover:text-blue-700 transition-colors"
                          >
                            <Star className="w-3 h-3" />
                            {feedbackCount} review{feedbackCount > 1 ? 's' : ''}
                          </button>
                        ) : (
                          <span className="text-[11px] text-gray-300">—</span>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="py-3 pr-4" onClick={(e) => e.stopPropagation()}>
                        <InterviewActions interview={interview} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}

      {/* ── Feedback Dialog ── */}
      <Dialog open={!!feedbackInterview} onOpenChange={(open) => { if (!open) setFeedbackInterview(null) }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[15px]">
              Feedback — {typeLabel(feedbackInterview?.interview_type || '')}
            </DialogTitle>
          </DialogHeader>
          {feedbackInterview?.interview_feedback && feedbackInterview.interview_feedback.length > 0 ? (
            <div className="space-y-3">
              {feedbackInterview.interview_feedback.map((fb) => (
                <div key={fb.id} className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="bg-gray-50/80 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      {/* Star rating */}
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star key={s} className={`w-3 h-3 ${s <= fb.rating ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'}`} />
                        ))}
                      </div>
                      {/* Recommendation pill with dot */}
                      <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${RECOMMENDATION_PILL[fb.recommendation] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${RECOMMENDATION_DOT[fb.recommendation] ?? 'bg-gray-400'}`} />
                        {fb.recommendation?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 tabular-nums">
                      {new Date(fb.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <div className="px-4 py-3 space-y-2.5">
                    {fb.criteria_ratings && fb.criteria_ratings.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Criteria</p>
                        <div className="flex flex-wrap gap-1.5">
                          {fb.criteria_ratings.map((cr) => (
                            <span key={cr.criteria_id} className="text-[11px] bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
                              {cr.criteria_name}: <strong>{cr.rating}/5</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {fb.strengths && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Strengths</p>
                        <p className="text-[12px] text-gray-600">{fb.strengths}</p>
                      </div>
                    )}
                    {fb.weaknesses && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Weaknesses</p>
                        <p className="text-[12px] text-gray-600">{fb.weaknesses}</p>
                      </div>
                    )}
                    {fb.notes && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Notes</p>
                        <p className="text-[12px] text-gray-600">{fb.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-gray-400 text-center py-6">No feedback submitted yet.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
