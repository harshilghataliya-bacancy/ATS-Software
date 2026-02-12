'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getInterviews, cancelInterview } from '@/lib/services/interviews'
import { INTERVIEW_TYPES } from '@/lib/constants'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

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

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  scheduled: { label: 'Scheduled', variant: 'default' },
  completed: { label: 'Completed', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
  no_show: { label: 'No Show', variant: 'outline' },
}

export default function InterviewsPage() {
  const { organization, isLoading } = useUser()
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('scheduled')
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)

  const loadInterviews = useCallback(async () => {
    if (!organization) return
    setLoading(true)
    const supabase = createClient()
    const filters: Record<string, unknown> = {}
    if (statusFilter !== 'all') filters.status = statusFilter
    const { data, count } = await getInterviews(supabase, organization.id, filters)
    if (data) setInterviews(data as Interview[])
    if (count !== undefined && count !== null) setTotal(count)
    setLoading(false)
  }, [organization, statusFilter])

  useEffect(() => {
    if (organization) loadInterviews()
  }, [organization, loadInterviews])

  async function handleCancel(interviewId: string) {
    if (!organization) return
    setCancelError(null)
    const supabase = createClient()
    const { error: err } = await cancelInterview(supabase, interviewId, organization.id)
    if (err) {
      console.error('[Cancel Interview Error]', err)
      setCancelError(err.message ?? 'Failed to cancel interview')
    }
    await loadInterviews()
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  const typeLabel = (val: string) =>
    INTERVIEW_TYPES.find((t) => t.value === val)?.label ?? val

  function formatDate(dateStr: string) {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function formatTime(dateStr: string) {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  const now = new Date()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Interviews</h1>
          <p className="text-gray-500 mt-1">
            {total > 0 ? `${total} total interviews` : 'Manage interview schedules'}
          </p>
        </div>
      </div>

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
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : interviews.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">No interviews found. Schedule interviews from a candidate&apos;s pipeline.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {interviews.map((interview) => {
            const statusConfig = STATUS_CONFIG[interview.status]
            const scheduledDate = new Date(interview.scheduled_at)
            const isPast = scheduledDate < now
            const candidate = interview.application?.candidate
            const job = interview.application?.job
            const initials = candidate
              ? `${candidate.first_name?.[0] ?? ''}${candidate.last_name?.[0] ?? ''}`.toUpperCase()
              : '??'

            return (
              <Card key={interview.id} className={`transition-shadow hover:shadow-md ${isPast && interview.status === 'scheduled' ? 'border-yellow-200 bg-yellow-50/30' : ''}`}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-semibold shrink-0">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <Link href={`/interviews/${interview.id}`} className="text-base font-semibold text-gray-900 hover:text-blue-600">
                            {candidate ? `${candidate.first_name} ${candidate.last_name}` : 'Unknown'}
                          </Link>
                          {statusConfig && (
                            <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                          )}
                          <Badge variant="outline">{typeLabel(interview.interview_type)}</Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                          {job && <span>{job.title}</span>}
                          <span>{formatDate(interview.scheduled_at)} at {formatTime(interview.scheduled_at)}</span>
                          <span>{interview.duration_minutes} min</span>
                          {interview.location && <span>{interview.location}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/interviews/${interview.id}`}>
                        <Button variant="outline" size="sm">View</Button>
                      </Link>
                      {interview.status === 'scheduled' && (
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
