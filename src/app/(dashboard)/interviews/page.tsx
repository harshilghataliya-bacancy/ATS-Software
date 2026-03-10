'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getInterviews, cancelInterview, updateInterview } from '@/lib/services/interviews'
import { INTERVIEW_TYPES, ITEMS_PER_PAGE } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Pagination } from '@/components/ui/pagination'

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
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-600', dot: 'bg-red-400' },
  no_show:   { label: 'No Show',   color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-400' },
}

const STATUS_BORDER: Record<string, string> = {
  scheduled: 'border-l-blue-500',
  completed:  'border-l-emerald-500',
  cancelled:  'border-l-red-400',
  no_show:    'border-l-amber-400',
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

export default function InterviewsPage() {
  const { user, organization, isLoading } = useUser()
  const { canManageJobs, isInterviewer } = useRole()
  const router = useRouter()

  const [interviews, setInterviews] = useState<Interview[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('scheduled')
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<ViewMode>('list')

  const loadInterviews = useCallback(async () => {
    if (!organization) return
    setLoading(true)
    const supabase = createClient()
    const filters: Record<string, unknown> = { page }
    if (statusFilter !== 'all') filters.status = statusFilter
    if (isInterviewer && user?.id) filters.panelistUserId = user.id
    const { data, count } = await getInterviews(supabase, organization.id, filters)
    if (data) setInterviews(data as Interview[])
    if (count !== undefined && count !== null) setTotal(count)
    setLoading(false)
  }, [organization, statusFilter, page, isInterviewer, user])

  useEffect(() => {
    if (organization) loadInterviews()
  }, [organization, loadInterviews])

  useEffect(() => { setPage(1) }, [statusFilter])

  async function handleCancel(interviewId: string) {
    if (!organization) return
    setCancelError(null)
    const supabase = createClient()
    const { error: err } = await cancelInterview(supabase, interviewId, organization.id)
    if (err) setCancelError(err.message ?? 'Failed to cancel interview')
    await loadInterviews()
  }

  async function handleMarkComplete(interviewId: string) {
    if (!organization) return
    setCancelError(null)
    const supabase = createClient()
    const { error: err } = await updateInterview(supabase, interviewId, organization.id, { status: 'completed' })
    if (err) setCancelError(err.message ?? 'Failed to mark as completed')
    await loadInterviews()
  }

  async function handleNoShow(interviewId: string) {
    if (!organization) return
    setCancelError(null)
    const supabase = createClient()
    const { error: err } = await updateInterview(supabase, interviewId, organization.id, { status: 'no_show' })
    if (err) setCancelError(err.message ?? 'Failed to mark as no show')
    await loadInterviews()
  }

  const typeLabel = (val: string) => INTERVIEW_TYPES.find((t) => t.value === val)?.label ?? val

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  const now = new Date()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  // List view: Not Shown → Cancel → Mark Complete
  function ListActionButtons({ interview }: { interview: Interview }) {
    const candidate = interview.application?.candidate
    if (interview.status !== 'scheduled') return null
    return (
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-orange-600 border-orange-200 hover:bg-orange-50">
              Not Shown
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Candidate not shown?</AlertDialogTitle>
              <AlertDialogDescription>
                Mark that {candidate?.first_name} {candidate?.last_name} did not show up for this interview.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Go Back</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleNoShow(interview.id)} className="bg-orange-600 hover:bg-orange-700">
                Candidate Not Shown
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {canManageJobs && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-red-600">Cancel</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel interview?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will cancel the interview with {candidate?.first_name} {candidate?.last_name}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleCancel(interview.id)} className="bg-red-600 hover:bg-red-700">
                  Cancel Interview
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <Button size="sm" onClick={() => handleMarkComplete(interview.id)}>
          Mark Complete
        </Button>
      </div>
    )
  }

  // Card view: Not Shown + Cancel, then Mark Complete last
  function CardActionButtons({ interview }: { interview: Interview }) {
    const candidate = interview.application?.candidate
    if (interview.status !== 'scheduled') return null
    return (
      <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs text-orange-600 border-orange-200 hover:bg-orange-50">Not Shown</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Candidate not shown?</AlertDialogTitle>
              <AlertDialogDescription>
                Mark that {candidate?.first_name} {candidate?.last_name} did not show up for this interview.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Go Back</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleNoShow(interview.id)} className="bg-orange-600 hover:bg-orange-700">Candidate Not Shown</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {canManageJobs && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:bg-red-50">Cancel</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel interview?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will cancel the interview with {candidate?.first_name} {candidate?.last_name}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleCancel(interview.id)} className="bg-red-600 hover:bg-red-700">Cancel Interview</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <Button size="sm" className="h-7 text-xs ml-auto" onClick={() => handleMarkComplete(interview.id)}>
          Mark Complete
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-gray-900">
            {isInterviewer ? 'My Interviews' : 'Interviews'}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5 font-medium">
            {isInterviewer
              ? total > 0 ? `${total} interviews assigned to you` : 'No interviews assigned yet'
              : total > 0 ? `${total} total interviews` : 'Manage interview schedules'}
          </p>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-1">
          <button
            onClick={() => setViewMode('list')}
            title="List view"
            className={`flex items-center justify-center w-8 h-7 rounded-md transition-all duration-150 ${
              viewMode === 'list'
                ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <IconList active={viewMode === 'list'} />
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
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="no_show">No Show</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {cancelError && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{cancelError}</div>
      )}

      {loading ? (
        viewMode === 'list' ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
          </div>
        )
      ) : interviews.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="py-16 text-center">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              </div>
              <p className="text-gray-900 font-medium mb-1">No interviews found</p>
              <p className="text-gray-500 text-sm">Schedule interviews from a candidate&apos;s pipeline.</p>
            </div>
          </div>
        </div>

      ) : viewMode === 'list' ? (
        /* ── LIST VIEW ── */
        <div className="space-y-3">
          {interviews.map((interview) => {
            const statusConfig = STATUS_CONFIG[interview.status]
            const isPast = new Date(interview.scheduled_at) < now
            const candidate = interview.application?.candidate
            const job = interview.application?.job
            const initials = candidate
              ? `${candidate.first_name?.[0] ?? ''}${candidate.last_name?.[0] ?? ''}`.toUpperCase()
              : '??'

            return (
              <div
                key={interview.id}
                onClick={() => router.push(`/interviews/${interview.id}?from=interviews`)}
                className={`bg-white rounded-xl border border-gray-200 shadow-sm border-l-4 ${STATUS_BORDER[interview.status] ?? 'border-l-gray-300'} transition-shadow hover:shadow-md cursor-pointer ${isPast && interview.status === 'scheduled' ? 'bg-amber-50/40' : ''}`}
              >
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-semibold shrink-0">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-semibold text-gray-900">
                            {candidate ? `${candidate.first_name} ${candidate.last_name}` : 'Unknown'}
                          </span>
                          {statusConfig && (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusConfig.color}`}>
                              {statusConfig.label}
                            </span>
                          )}
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-gray-200 text-gray-700">{typeLabel(interview.interview_type)}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
                          {job && (
                            <span className="flex items-center gap-1">
                              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                              {job.title}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                            {formatDate(interview.scheduled_at)} at {formatTime(interview.scheduled_at)}
                          </span>
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {interview.duration_minutes} min
                          </span>
                          {interview.location && (
                            <span className="flex items-center gap-1">
                              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                              {interview.location}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <ListActionButtons interview={interview} />
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
            {interviews.map((interview) => {
              const statusConfig = STATUS_CONFIG[interview.status]
              const isPast = new Date(interview.scheduled_at) < now
              const candidate = interview.application?.candidate
              const job = interview.application?.job
              const initials = candidate
                ? `${candidate.first_name?.[0] ?? ''}${candidate.last_name?.[0] ?? ''}`.toUpperCase()
                : '??'

              return (
                <div
                  key={interview.id}
                  onClick={() => router.push(`/interviews/${interview.id}?from=interviews`)}
                  className={`group bg-white rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-t-4 ${
                    interview.status === 'scheduled' ? 'border-t-blue-500' :
                    interview.status === 'completed' ? 'border-t-emerald-500' :
                    interview.status === 'cancelled' ? 'border-t-red-400' : 'border-t-amber-400'
                  } ${isPast && interview.status === 'scheduled' ? 'bg-amber-50/30' : ''}`}
                >
                  <div className="p-4 space-y-3">
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-semibold shrink-0">
                          {initials}
                        </div>
                        <div>
                          <p className="text-[14px] font-bold text-gray-900 group-hover:text-blue-700 transition-colors leading-tight">
                            {candidate ? `${candidate.first_name} ${candidate.last_name}` : 'Unknown'}
                          </p>
                          {candidate?.email && (
                            <p className="text-[11px] text-gray-400 truncate max-w-[160px]">{candidate.email}</p>
                          )}
                        </div>
                      </div>
                      {statusConfig && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${statusConfig.color}`}>
                          {statusConfig.label}
                        </span>
                      )}
                    </div>

                    {/* Job */}
                    {job && (
                      <div className="flex items-center gap-1.5 text-[12px] text-gray-600">
                        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        <span className="font-medium truncate">{job.title}</span>
                        <span className="text-gray-400">· {job.department}</span>
                      </div>
                    )}

                    {/* Meta */}
                    <div className="space-y-1 text-[12px] text-gray-500">
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                        <span>{formatDate(interview.scheduled_at)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          {formatTime(interview.scheduled_at)} · {interview.duration_minutes} min
                        </span>
                      </div>
                      {interview.location && (
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                          <span>{interview.location}</span>
                        </div>
                      )}
                    </div>

                    {/* Type badge + meeting link */}
                    <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-gray-200 text-gray-700">{typeLabel(interview.interview_type)}</span>
                      {interview.meeting_link && (
                        <a
                          href={interview.meeting_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
                          Join
                        </a>
                      )}
                    </div>

                    {/* Action buttons */}
                    {interview.status === 'scheduled' && (
                      <div className="pt-1 border-t border-gray-100">
                        <CardActionButtons interview={interview} />
                      </div>
                    )}
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
