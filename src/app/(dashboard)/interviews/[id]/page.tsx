'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getInterviewById, updateInterview, cancelInterview } from '@/lib/services/interviews'
import { resolveUserNames, resolveUserDetails } from '../actions'
import { submitFeedback } from '@/lib/services/feedback'
import { getScorecardCriteria } from '@/lib/services/jobs'
import { INTERVIEW_TYPES, RECOMMENDATION_OPTIONS, RATING_LABELS } from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

interface InterviewDetail {
  id: string
  application_id: string
  interview_type: string
  status: string
  scheduled_at: string
  duration_minutes: number
  location?: string | null
  meeting_link?: string | null
  notes?: string | null
  interviewer_email?: string | null
  created_by?: string | null
  application: {
    id: string
    candidate: {
      id: string
      first_name: string
      last_name: string
      email: string
    }
    job: { id: string; title: string; department: string; status: string }
    current_stage: { id: string; name: string; stage_type: string } | null
  }
  interview_panelists: Array<{ user_id: string; role: string }>
  feedback: Array<{
    id: string
    overall_rating: number
    recommendation: string
    strengths?: string | null
    weaknesses?: string | null
    notes?: string | null
    user_id: string
    created_at: string
  }>
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  scheduled: { label: 'Scheduled', variant: 'default' },
  completed: { label: 'Completed', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
  no_show: { label: 'No Show', variant: 'outline' },
}

export default function InterviewDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, organization, isLoading: userLoading } = useUser()
  const { canManageJobs } = useRole()
  const [interview, setInterview] = useState<InterviewDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Edit form
  const [editType, setEditType] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editDuration, setEditDuration] = useState(60)
  const [editLocation, setEditLocation] = useState('')
  const [editMeetingLink, setEditMeetingLink] = useState('')
  const [editNotes, setEditNotes] = useState('')

  // Feedback form
  const [showFeedback, setShowFeedback] = useState(false)
  const [fbRating, setFbRating] = useState(3)
  const [fbRecommendation, setFbRecommendation] = useState('neutral')
  const [fbStrengths, setFbStrengths] = useState('')
  const [fbWeaknesses, setFbWeaknesses] = useState('')
  const [fbNotes, setFbNotes] = useState('')
  const [fbSaving, setFbSaving] = useState(false)

  // Scorecard criteria
  const [scorecardCriteria, setScorecardCriteria] = useState<Array<{ id: string; name: string; description?: string; weight: number }>>([])
  const [criteriaRatings, setCriteriaRatings] = useState<Record<string, number>>({})
  const [userNames, setUserNames] = useState<Record<string, string>>({})
  const [userDetails, setUserDetails] = useState<Record<string, { name: string; email: string }>>({})

  const loadInterview = useCallback(async () => {
    if (!organization) return
    const supabase = createClient()
    const { data, error: fetchError } = await getInterviewById(supabase, params.id as string, organization.id)
    if (fetchError) {
      console.error('[Interview Detail Error]', fetchError)
      setError(fetchError.message)
    } else if (data) {
      const interviewData = data as InterviewDetail
      setInterview(interviewData)

      // Resolve panelist + feedback reviewer names
      const panelists = interviewData.interview_panelists ?? []
      const feedbackUsers = interviewData.feedback ?? []
      const allUserIds = [
        ...panelists.map((p) => p.user_id),
        ...feedbackUsers.map((f) => f.user_id),
      ].filter((id, i, arr) => arr.indexOf(id) === i)
      if (allUserIds.length > 0) {
        resolveUserNames(allUserIds).then(setUserNames)
        resolveUserDetails(allUserIds).then(setUserDetails)
      }

      // Load scorecard criteria for this job
      const jobId = interviewData.application?.job?.id
      if (jobId) {
        const { data: criteriaData } = await getScorecardCriteria(supabase, jobId, organization.id)
        if (criteriaData) {
          setScorecardCriteria(criteriaData as Array<{ id: string; name: string; description?: string; weight: number }>)
        }
      }
    } else {
      setError('Interview not found or you do not have access.')
    }
    setLoading(false)
  }, [organization, params.id])

  useEffect(() => {
    if (organization) loadInterview()
  }, [organization, loadInterview])

  function startEdit() {
    if (!interview) return
    setEditType(interview.interview_type)
    setEditDate(interview.scheduled_at ? new Date(interview.scheduled_at).toISOString().slice(0, 16) : '')
    setEditDuration(interview.duration_minutes)
    setEditLocation(interview.location ?? '')
    setEditMeetingLink(interview.meeting_link ?? '')
    setEditNotes(interview.notes ?? '')
    setEditing(true)
  }

  async function handleSave() {
    if (!organization || !interview) return
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { error: updateError } = await updateInterview(supabase, interview.id, organization.id, {
      interview_type: editType,
      scheduled_at: new Date(editDate).toISOString(),
      duration_minutes: editDuration,
      location: editLocation || null,
      meeting_link: editMeetingLink || null,
      notes: editNotes || null,
    })

    if (updateError) {
      setError(updateError.message)
    } else {
      setEditing(false)
      loadInterview()
    }
    setSaving(false)
  }

  async function handleMarkCompleted() {
    if (!organization || !interview) return
    const supabase = createClient()
    const { error: updateError } = await updateInterview(supabase, interview.id, organization.id, {
      status: 'completed',
    })
    if (updateError) {
      setError(updateError.message)
    } else {
      loadInterview()
    }
  }

  async function handleCancel() {
    if (!organization || !interview) return
    const supabase = createClient()
    await cancelInterview(supabase, interview.id, organization.id)
    loadInterview()
  }

  async function handleSubmitFeedback() {
    if (!organization || !user || !interview) return
    setFbSaving(true)
    setError(null)

    const supabase = createClient()
    const feedbackData: Record<string, unknown> = {
      interview_id: interview.id,
      application_id: interview.application_id,
      overall_rating: fbRating,
      recommendation: fbRecommendation,
      strengths: fbStrengths || undefined,
      weaknesses: fbWeaknesses || undefined,
      notes: fbNotes || undefined,
    }

    // Add criteria ratings if any were filled
    const filledRatings = Object.entries(criteriaRatings)
      .filter(([, rating]) => rating > 0)
      .map(([criteria_id, rating]) => ({ criteria_id, rating }))
    if (filledRatings.length > 0) {
      feedbackData.criteria_ratings = filledRatings
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: fbError } = await submitFeedback(
      supabase,
      organization.id,
      feedbackData as any,
      user.id
    )

    if (fbError) {
      setError(fbError.message)
    } else {
      setShowFeedback(false)
      setFbRating(3)
      setFbRecommendation('neutral')
      setFbStrengths('')
      setFbWeaknesses('')
      setFbNotes('')
      setCriteriaRatings({})
      loadInterview()
    }
    setFbSaving(false)
  }

  if (userLoading || loading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (!interview) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">{error || 'Interview not found'}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/interviews')}>
          Back to Interviews
        </Button>
      </div>
    )
  }

  const candidate = interview.application?.candidate
  const job = interview.application?.job
  const statusConfig = STATUS_CONFIG[interview.status]
  const typeLabel = INTERVIEW_TYPES.find((t) => t.value === interview.interview_type)?.label ?? interview.interview_type
  const hasSubmittedFeedback = interview.feedback?.some((f) => f.user_id === user?.id)

  function formatDateTime(dateStr: string) {
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              Interview: {candidate?.first_name} {candidate?.last_name}
            </h1>
            {statusConfig && <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>}
          </div>
          {job && (
            <p className="text-gray-500 mt-1">
              {typeLabel} for{' '}
              <Link href={`/jobs/${job.id}`} className="text-blue-600 hover:underline">
                {job.title}
              </Link>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {interview.status === 'scheduled' && canManageJobs && (
            <>
              <Button variant="outline" onClick={startEdit}>Edit</Button>
              <Button onClick={handleMarkCompleted}>Mark Completed</Button>
              <Button variant="destructive" onClick={handleCancel}>Cancel</Button>
            </>
          )}
          {interview.status === 'completed' && !hasSubmittedFeedback && (
            <Button onClick={() => setShowFeedback(true)}>Submit Feedback</Button>
          )}
          <Button variant="outline" onClick={() => router.push('/interviews')}>Back</Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Details */}
        <div className="col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Interview Details</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select value={editType} onValueChange={setEditType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {INTERVIEW_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Duration (minutes)</Label>
                      <Input type="number" min={15} max={480} value={editDuration} onChange={(e) => setEditDuration(Number(e.target.value))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Date & Time</Label>
                    <Input type="datetime-local" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Location</Label>
                      <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} placeholder="Office, Room 3B" />
                    </div>
                    <div className="space-y-2">
                      <Label>Meeting Link</Label>
                      <Input value={editMeetingLink} onChange={(e) => setEditMeetingLink(e.target.value)} placeholder="https://meet.google.com/..." />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
                    <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-y-4 text-sm">
                  <div>
                    <span className="text-gray-500">Type</span>
                    <p className="font-medium">{typeLabel}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Duration</span>
                    <p className="font-medium">{interview.duration_minutes} minutes</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Scheduled</span>
                    <p className="font-medium">{formatDateTime(interview.scheduled_at)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Status</span>
                    <p className="font-medium capitalize">{interview.status}</p>
                  </div>
                  {interview.location && (
                    <div>
                      <span className="text-gray-500">Location</span>
                      <p className="font-medium">{interview.location}</p>
                    </div>
                  )}
                  {interview.meeting_link && (
                    <div>
                      <span className="text-gray-500">Meeting Link</span>
                      <p className="font-medium">
                        <a href={interview.meeting_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          Join Meeting
                        </a>
                      </p>
                    </div>
                  )}
                  {interview.notes && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Notes</span>
                      <p className="font-medium whitespace-pre-wrap">{interview.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Feedback Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Feedback</CardTitle>
            </CardHeader>
            <CardContent>
              {showFeedback ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Rating</Label>
                      <Select value={String(fbRating)} onValueChange={(v) => setFbRating(Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5].map((r) => (
                            <SelectItem key={r} value={String(r)}>{r} - {RATING_LABELS[r]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Recommendation</Label>
                      <Select value={fbRecommendation} onValueChange={setFbRecommendation}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RECOMMENDATION_OPTIONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {scorecardCriteria.length > 0 && (
                    <div className="space-y-3 border rounded-lg p-4 bg-gray-50">
                      <Label className="text-sm font-medium">Evaluation Criteria</Label>
                      {scorecardCriteria.map((c) => (
                        <div key={c.id} className="flex items-center gap-3">
                          <div className="flex-1">
                            <span className="text-sm text-gray-700">{c.name}</span>
                            <Badge variant="outline" className="ml-2 text-[10px]">w:{c.weight}</Badge>
                          </div>
                          <Select
                            value={String(criteriaRatings[c.id] ?? 0)}
                            onValueChange={(v) => setCriteriaRatings((prev) => ({ ...prev, [c.id]: Number(v) }))}
                          >
                            <SelectTrigger className="w-32 h-8 text-xs">
                              <SelectValue placeholder="Rate" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">Not rated</SelectItem>
                              {[1, 2, 3, 4, 5].map((r) => (
                                <SelectItem key={r} value={String(r)}>{r} - {RATING_LABELS[r]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Strengths</Label>
                    <Textarea rows={3} value={fbStrengths} onChange={(e) => setFbStrengths(e.target.value)} placeholder="What went well?" />
                  </div>
                  <div className="space-y-2">
                    <Label>Weaknesses</Label>
                    <Textarea rows={3} value={fbWeaknesses} onChange={(e) => setFbWeaknesses(e.target.value)} placeholder="Areas of concern?" />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea rows={2} value={fbNotes} onChange={(e) => setFbNotes(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSubmitFeedback} disabled={fbSaving}>
                      {fbSaving ? 'Submitting...' : 'Submit Feedback'}
                    </Button>
                    <Button variant="outline" onClick={() => setShowFeedback(false)}>Cancel</Button>
                  </div>
                </div>
              ) : interview.feedback && interview.feedback.length > 0 ? (
                <div className="space-y-4">
                  {interview.feedback.map((fb) => {
                    const rec = RECOMMENDATION_OPTIONS.find((r) => r.value === fb.recommendation)
                    return (
                      <div key={fb.id} className="border rounded-lg p-4">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <span key={star} className={`text-sm ${star <= fb.overall_rating ? 'text-yellow-500' : 'text-gray-200'}`}>
                                &#9733;
                              </span>
                            ))}
                          </div>
                          {rec && (
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${rec.color}`}>
                              {rec.label}
                            </span>
                          )}
                          <span className="text-xs text-gray-600 font-medium">
                            {userNames[fb.user_id] ?? 'Reviewer'}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(fb.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {fb.strengths && (
                          <div className="mt-2">
                            <p className="text-xs text-gray-500 font-medium">Strengths</p>
                            <p className="text-sm text-gray-700">{fb.strengths}</p>
                          </div>
                        )}
                        {fb.weaknesses && (
                          <div className="mt-2">
                            <p className="text-xs text-gray-500 font-medium">Weaknesses</p>
                            <p className="text-sm text-gray-700">{fb.weaknesses}</p>
                          </div>
                        )}
                        {fb.notes && (
                          <div className="mt-2">
                            <p className="text-xs text-gray-500 font-medium">Notes</p>
                            <p className="text-sm text-gray-700">{fb.notes}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  {interview.status === 'completed'
                    ? 'No feedback submitted yet.'
                    : 'Feedback can be submitted after the interview is completed.'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Candidate</CardTitle>
            </CardHeader>
            <CardContent>
              {candidate && (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-semibold">
                      {candidate.first_name?.[0]}{candidate.last_name?.[0]}
                    </div>
                    <div>
                      <Link href={`/candidates/${candidate.id}`} className="font-medium text-blue-600 hover:underline">
                        {candidate.first_name} {candidate.last_name}
                      </Link>
                      <p className="text-gray-500 text-xs">{candidate.email}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Job</CardTitle>
            </CardHeader>
            <CardContent>
              {job && (
                <div className="text-sm space-y-1">
                  <Link href={`/jobs/${job.id}`} className="font-medium text-blue-600 hover:underline">
                    {job.title}
                  </Link>
                  <p className="text-gray-500">{job.department}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Panel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {interview.interview_panelists?.map((panelist, idx) => {
                  const details = userDetails[panelist.user_id]
                  return (
                    <div key={idx} className="text-sm flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-gray-700 truncate font-medium">{details?.name ?? userNames[panelist.user_id] ?? 'Loading...'}</p>
                        {details?.email && (
                          <p className="text-xs text-gray-400 truncate">{details.email}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] capitalize shrink-0">
                        {panelist.role === 'lead' ? 'Scheduled by' : panelist.role}
                      </Badge>
                    </div>
                  )
                })}
                {interview.interviewer_email && !interview.interview_panelists?.some(
                  (p) => userDetails[p.user_id]?.email?.toLowerCase() === interview.interviewer_email?.toLowerCase()
                ) && (
                  <div className="text-sm flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-gray-700 truncate font-medium">{interview.interviewer_email}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">Interviewer</Badge>
                  </div>
                )}
                {!interview.interview_panelists?.length && !interview.interviewer_email && (
                  <p className="text-sm text-gray-500">No panel members assigned.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Button variant="outline" className="w-full" onClick={() => router.push('/interviews')}>
            Back to Interviews
          </Button>
        </div>
      </div>
    </div>
  )
}
