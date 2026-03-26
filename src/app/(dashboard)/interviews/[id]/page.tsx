'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getInterviewById, updateInterview } from '@/lib/services/interviews'
import { logActivity } from '@/lib/services/activity'
import { resolveUserNames, resolveUserDetails } from '../actions'
import { submitFeedback, updateFeedback } from '@/lib/services/feedback'
import { getScorecardCriteria } from '@/lib/services/jobs'
import { getScorecardCriteriaByInterviewId } from '@/lib/services/scorecards'
import { INTERVIEW_TYPES, RECOMMENDATION_OPTIONS, RATING_LABELS, SCORECARD_RATING_TYPES } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { ArrowLeft, ExternalLink, PenLine, X, Ban, CheckCircle2, MessageSquare, Eye, Download, ClipboardList, AlertTriangle } from 'lucide-react'

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
      phone?: string | null
      current_title?: string | null
      current_company?: string | null
      location?: string | null
      resume_url?: string | null
    }
    job: { id: string; title: string; department: string; status: string; description?: string | null }
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

const STATUS_META: Record<string, { label: string; bg: string; text: string; dot: string; border: string; topBorder: string }> = {
  scheduled: { label: 'Scheduled', bg: 'bg-slate-50',   text: 'text-slate-700',   dot: 'bg-slate-400',   border: 'border-slate-200', topBorder: 'border-t-slate-400' },
  completed: { label: 'Completed', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200', topBorder: 'border-t-emerald-500' },
  cancelled: { label: 'Cancelled', bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500',     border: 'border-red-200',    topBorder: 'border-t-red-400' },
  no_show:   { label: 'No Show',   bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   border: 'border-amber-200',  topBorder: 'border-t-amber-400' },
}

export default function InterviewDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, organization, isLoading: userLoading } = useUser()
  const { canManageJobs, isInterviewer } = useRole()

  const [interview, setInterview] = useState<InterviewDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showResume, setShowResume] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const [editType, setEditType] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editDuration, setEditDuration] = useState(60)
  const [editLocation, setEditLocation] = useState('')
  const [editMeetingLink, setEditMeetingLink] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [interviewLocations, setInterviewLocations] = useState<{ id: string; name: string }[]>([])
  const [cancelling, setCancelling] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)

  const [showFeedback, setShowFeedback] = useState(false)
  const [fbRating, setFbRating] = useState(3)
  const [fbRecommendation, setFbRecommendation] = useState('hold')
  const [fbStrengths, setFbStrengths] = useState('')
  const [fbWeaknesses, setFbWeaknesses] = useState('')
  const [fbNotes, setFbNotes] = useState('')
  const [fbSaving, setFbSaving] = useState(false)

  const [editingFeedbackId, setEditingFeedbackId] = useState<string | null>(null)
  const [scorecardCriteria, setScorecardCriteria] = useState<Array<{ id: string; name: string; description?: string; weight: number; rating_type?: string }>>([])
  const [criteriaRatings, setCriteriaRatings] = useState<Record<string, number>>({})
  const [criteriaTextValues, setCriteriaTextValues] = useState<Record<string, string>>({})
  const [userNames, setUserNames] = useState<Record<string, string>>({})
  const [userDetails, setUserDetails] = useState<Record<string, { name: string; email: string }>>({})
  const [feedbackCriteriaRatings, setFeedbackCriteriaRatings] = useState<Record<string, Array<{ criteria_id: string; rating: number; notes?: string }>>>({})
  const [scorecardName, setScorecardName] = useState<string | null>(null)

  const loadInterview = useCallback(async () => {
    if (!organization) return
    const supabase = createClient()
    const { data, error: fetchError } = await getInterviewById(supabase, params.id as string, organization.id)
    if (fetchError) {
      setError(fetchError.message)
    } else if (data) {
      const d = data as InterviewDetail
      setInterview(d)
      const panelists = d.interview_panelists ?? []
      const feedbackUsers = d.feedback ?? []
      const allUserIds = [...panelists.map((p) => p.user_id), ...feedbackUsers.map((f) => f.user_id)]
        .filter((id, i, arr) => arr.indexOf(id) === i)
      if (allUserIds.length > 0) {
        resolveUserNames(allUserIds).then(setUserNames)
        resolveUserDetails(allUserIds).then(setUserDetails)
      }
      // Load criteria: prefer interview-linked scorecard, fall back to job-level
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const interviewScorecardId = (d as any).scorecard_id
      if (interviewScorecardId) {
        // Fetch scorecard name
        const { data: scData } = await supabase
          .from('scorecards')
          .select('title')
          .eq('id', interviewScorecardId)
          .single()
        if (scData) setScorecardName(scData.title)

        const { data: templateCriteria } = await getScorecardCriteriaByInterviewId(supabase, d.id, organization.id)
        if (templateCriteria && templateCriteria.length > 0) {
          setScorecardCriteria(templateCriteria as Array<{ id: string; name: string; description?: string; weight: number; rating_type?: string }>)
        }
      } else {
        setScorecardName(null)
        const jobId = d.application?.job?.id
        if (jobId) {
          const { data: criteriaData } = await getScorecardCriteria(supabase, jobId, organization.id)
          if (criteriaData) setScorecardCriteria(criteriaData as Array<{ id: string; name: string; description?: string; weight: number; rating_type?: string }>)
        }
      }
      // Fetch criteria ratings for each feedback
      if (d.feedback?.length > 0) {
        const feedbackIds = d.feedback.map((f: { id: string }) => f.id)
        const { data: ratingsData } = await supabase
          .from('scorecard_ratings')
          .select('feedback_id, criteria_id, rating, notes, rating_type, text_value')
          .in('feedback_id', feedbackIds)
        if (ratingsData) {
          const grouped: Record<string, Array<{ criteria_id: string; rating: number; notes?: string }>> = {}
          ratingsData.forEach((r: { feedback_id: string; criteria_id: string; rating: number; notes?: string; text_value?: string }) => {
            if (!grouped[r.feedback_id]) grouped[r.feedback_id] = []
            grouped[r.feedback_id].push({ criteria_id: r.criteria_id, rating: r.rating ?? 0, notes: r.text_value || r.notes || undefined })
          })
          setFeedbackCriteriaRatings(grouped)
        }
      }
    } else {
      setError('Interview not found or you do not have access.')
    }
    setLoading(false)
  }, [organization, params.id])

  useEffect(() => { if (organization) loadInterview() }, [organization, loadInterview])

  function startEdit() {
    if (!interview) return
    setEditType(interview.interview_type)
    setEditDate(interview.scheduled_at ? new Date(interview.scheduled_at).toISOString().slice(0, 16) : '')
    setEditDuration(interview.duration_minutes)
    setEditLocation(interview.location ?? '')
    setEditMeetingLink(interview.meeting_link ?? '')
    setEditNotes(interview.notes ?? '')
    setEditing(true)
    // Fetch interview locations for dropdown
    fetch('/api/interview-locations')
      .then((r) => r.json())
      .then(({ data }) => { if (data) setInterviewLocations(data) })
      .catch(() => {})
  }

  async function handleSave() {
    if (!organization || !interview) return
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/interviews/${interview.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interview_type: editType,
          scheduled_at: new Date(editDate).toISOString(),
          duration_minutes: editDuration,
          location: editType === 'onsite' ? (editLocation || null) : null,
          meeting_link: editType !== 'onsite' ? (editMeetingLink || null) : null,
          notes: editNotes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to update interview')
      } else {
        setEditing(false)
        loadInterview()
      }
    } catch {
      setError('Failed to update interview')
    }
    setSaving(false)
  }

  async function handleMarkCompleted() {
    if (!organization || !interview || !user) return
    const supabase = createClient()
    const { error: e } = await updateInterview(supabase, interview.id, organization.id, { status: 'completed' })
    if (e) { setError(e.message) } else {
      logActivity(supabase, organization.id, user.id, 'application', interview.application_id, 'interview_completed', {
        interview_id: interview.id,
        candidate_name: `${interview.application.candidate.first_name} ${interview.application.candidate.last_name}`,
      }).catch(() => {})
      loadInterview()
    }
  }

  async function handleNoShow() {
    if (!organization || !interview || !user) return
    const supabase = createClient()
    const { error: e } = await updateInterview(supabase, interview.id, organization.id, { status: 'no_show' })
    if (e) { setError(e.message) } else {
      logActivity(supabase, organization.id, user.id, 'application', interview.application_id, 'interview_no_show', {
        interview_id: interview.id,
        candidate_name: `${interview.application.candidate.first_name} ${interview.application.candidate.last_name}`,
      }).catch(() => {})
      loadInterview()
    }
  }

  async function handleCancelConfirmed() {
    if (!organization || !interview || !user) return
    setShowCancelDialog(false)
    setCancelling(true)
    try {
      const res = await fetch(`/api/interviews/${interview.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to cancel interview')
      } else {
        loadInterview()
      }
    } catch {
      setError('Failed to cancel interview')
    }
    setCancelling(false)
  }

  function startEditFeedback(fb: InterviewDetail['feedback'][0]) {
    setFbRating(fb.overall_rating)
    setFbRecommendation(fb.recommendation)
    setFbStrengths(fb.strengths ?? '')
    setFbWeaknesses(fb.weaknesses ?? '')
    setFbNotes(fb.notes ?? '')
    setEditingFeedbackId(fb.id)
    // Load existing criteria ratings for this feedback
    const existingRatings = feedbackCriteriaRatings[fb.id]
    if (existingRatings) {
      const ratingsMap: Record<string, number> = {}
      const textMap: Record<string, string> = {}
      existingRatings.forEach((cr: { criteria_id: string; rating: number; notes?: string }) => {
        // Find the criteria to determine rating_type
        const criteria = scorecardCriteria.find((sc) => sc.id === cr.criteria_id)
        const rt = criteria?.rating_type || 'rating'
        if (rt === 'text') {
          textMap[cr.criteria_id] = cr.notes || ''
        } else {
          ratingsMap[cr.criteria_id] = cr.rating
        }
      })
      setCriteriaRatings(ratingsMap)
      setCriteriaTextValues(textMap)
    } else {
      setCriteriaRatings({})
      setCriteriaTextValues({})
    }
    setShowFeedback(true)
  }

  function buildCriteriaRatingsPayload() {
    const ratings: Array<{ criteria_id: string; rating: number; notes?: string }> = []
    for (const c of scorecardCriteria) {
      const rt = c.rating_type || 'rating'
      if (rt === 'text') {
        const textVal = criteriaTextValues[c.id]?.trim()
        if (textVal) ratings.push({ criteria_id: c.id, rating: 0, notes: textVal })
      } else if (rt === 'yes_no') {
        const val = criteriaRatings[c.id]
        if (val) ratings.push({ criteria_id: c.id, rating: val, notes: val === 5 ? 'Yes' : 'No' })
      } else {
        const val = criteriaRatings[c.id]
        if (val && val > 0) ratings.push({ criteria_id: c.id, rating: val })
      }
    }
    return ratings
  }

  async function handleSubmitFeedback() {
    if (!organization || !user || !interview) return
    if (!fbStrengths.trim()) { setError('Strengths is required'); return }
    if (!fbWeaknesses.trim()) { setError('Weaknesses is required'); return }
    if (!fbNotes.trim()) { setError('Notes is required'); return }
    if (scorecardCriteria.length > 0) {
      const unrated = scorecardCriteria.filter((c) => {
        const rt = c.rating_type || 'rating'
        if (rt === 'text') return !criteriaTextValues[c.id]?.trim()
        return !criteriaRatings[c.id] || criteriaRatings[c.id] === 0
      })
      if (unrated.length > 0) { setError(`Please complete: ${unrated.map((c) => c.name).join(', ')}`); return }
    }
    setFbSaving(true); setError(null)
    const supabase = createClient()

    if (editingFeedbackId) {
      // Update existing feedback
      const updateData: Record<string, unknown> = {
        overall_rating: fbRating,
        recommendation: fbRecommendation,
        strengths: fbStrengths,
        weaknesses: fbWeaknesses,
        notes: fbNotes,
      }
      const filledCriteriaRatings = buildCriteriaRatingsPayload()
      if (filledCriteriaRatings.length > 0) updateData.criteria_ratings = filledCriteriaRatings
      const { error: fbError } = await updateFeedback(supabase, editingFeedbackId, organization.id, updateData)
      if (fbError) {
        setError(fbError.message)
      } else {
        setShowFeedback(false); setEditingFeedbackId(null)
        setFbRating(3); setFbRecommendation('hold')
        setFbStrengths(''); setFbWeaknesses(''); setFbNotes(''); setCriteriaRatings({}); setCriteriaTextValues({})
        loadInterview()
      }
    } else {
      // Submit new feedback
      const feedbackData: Record<string, unknown> = {
        interview_id: interview.id,
        application_id: interview.application_id,
        overall_rating: fbRating,
        recommendation: fbRecommendation,
        strengths: fbStrengths,
        weaknesses: fbWeaknesses,
        notes: fbNotes,
      }
      const filledRatings = buildCriteriaRatingsPayload()
      if (filledRatings.length > 0) feedbackData.criteria_ratings = filledRatings
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: fbError } = await submitFeedback(supabase, organization.id, feedbackData as any, user.id)
      if (fbError) {
        setError(fbError.message)
      } else {
        logActivity(supabase, organization.id, user.id, 'application', interview.application_id, 'feedback_submitted', {
          interview_id: interview.id,
          recommendation: fbRecommendation,
          overall_rating: fbRating,
        }).catch(() => {})
        setShowFeedback(false); setFbRating(3); setFbRecommendation('hold')
        setFbStrengths(''); setFbWeaknesses(''); setFbNotes(''); setCriteriaRatings({}); setCriteriaTextValues({})
        loadInterview()
      }
    }
    setFbSaving(false)
  }

  if (userLoading || loading) {
    return (
      <div className="space-y-4 max-w-5xl">
        <Skeleton className="h-44 rounded-2xl" />
        <div className="grid grid-cols-5 gap-4">
          <div className="col-span-3 space-y-4">
            <Skeleton className="h-52 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
          <div className="col-span-2 space-y-4">
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  if (!interview) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">{error || 'Interview not found'}</p>
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-gray-500 hover:text-gray-900 mt-4" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />Back
        </Button>
      </div>
    )
  }

  const candidate = interview.application?.candidate
  const job = interview.application?.job
  const statusMeta = STATUS_META[interview.status] ?? STATUS_META.scheduled
  const typeLabel = INTERVIEW_TYPES.find((t) => t.value === interview.interview_type)?.label ?? interview.interview_type
  const hasSubmittedFeedback = interview.feedback?.some((f) => f.user_id === user?.id)
  const isPanelist = interview.interview_panelists?.some((p) => p.user_id === user?.id)
  const canManageThisInterview = canManageJobs || (isInterviewer && isPanelist)

  const scheduledDate = new Date(interview.scheduled_at)
  const dayNum = scheduledDate.toLocaleDateString('en-US', { day: '2-digit' })
  const monthName = scheduledDate.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  const weekday = scheduledDate.toLocaleDateString('en-US', { weekday: 'long' })
  const timeStr = scheduledDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const initials = candidate
    ? `${candidate.first_name?.[0] ?? ''}${candidate.last_name?.[0] ?? ''}`.toUpperCase()
    : '??'

  return (
    <div className="flex gap-4">
    {/* Main content — shrinks when resume panel is open */}
    <div className={`space-y-4 ${showResume && candidate?.resume_url ? 'max-w-3xl flex-1 min-w-0' : 'max-w-5xl w-full'}`}>

      {/* ── BACK ── */}
      <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-gray-500 hover:text-gray-900" onClick={() => router.back()}>
        <ArrowLeft className="w-4 h-4" />Back to Interviews
      </Button>

      {/* ── HERO CARD ── */}
      <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden border-t-[3px] ${statusMeta.topBorder}`}>
        <div className="px-6 pt-5 pb-4">
          {/* Top row: avatar + info + calendar */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="w-12 h-12 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center text-base font-bold shrink-0 mt-0.5">
                {initials}
              </div>
              {/* Name + meta */}
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-[18px] font-bold text-gray-900 tracking-tight leading-tight">
                    {(interview as any).title || `${candidate?.first_name} ${candidate?.last_name}`}
                  </h1>
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${statusMeta.bg} ${statusMeta.text} ${statusMeta.border}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
                    {statusMeta.label}
                  </span>
                </div>
                {(interview as any).title && (
                  <p className="text-sm text-gray-600 mt-0.5">{candidate?.first_name} {candidate?.last_name}</p>
                )}
                <p className="text-sm text-gray-500 mt-0.5">
                  <span className="font-medium text-gray-700">{typeLabel}</span>
                  {job && <> &nbsp;·&nbsp; {job.title}<span className="text-gray-400"> in {job.department}</span></>}
                </p>
                {candidate?.current_title && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {candidate.current_title}{candidate.current_company ? ` · ${candidate.current_company}` : ''}
                  </p>
                )}
              </div>
            </div>

            {/* Calendar tile */}
            <div className="shrink-0 hidden sm:block">
              <div className="w-[72px] rounded-xl overflow-hidden border border-gray-200 text-center shadow-sm">
                <div className="py-1 text-[9px] font-bold tracking-[0.15em] bg-gray-800 text-white">
                  {monthName}
                </div>
                <div className="bg-white py-1 border-b border-gray-100">
                  <p className="text-[28px] font-bold text-gray-900 leading-none">{dayNum}</p>
                  <p className="text-gray-400 text-[9px] font-semibold mt-0.5 tracking-wide">{weekday.slice(0, 3).toUpperCase()}</p>
                </div>
                <div className="bg-gray-50 py-1.5">
                  <p className="text-[11px] font-semibold text-gray-600">{timeStr}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Action strip */}
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-2">
            {interview.meeting_link && interview.status === 'scheduled' && (
              <a href={interview.meeting_link} target="_blank" rel="noopener noreferrer">
                <button className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Join Meeting
                </button>
              </a>
            )}
            {interview.status === 'scheduled' && canManageJobs && (
              <>
                <button onClick={startEdit} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
                  <PenLine className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button onClick={() => setShowCancelDialog(true)} disabled={cancelling} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50">
                  <X className="w-3.5 h-3.5" />
                  {cancelling ? 'Cancelling…' : 'Cancel Interview'}
                </button>
              </>
            )}
            {interview.status === 'scheduled' && canManageThisInterview && (
              <>
                <button onClick={handleNoShow} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 transition-colors">
                  <Ban className="w-3.5 h-3.5" />
                  Not Shown
                </button>
                <button onClick={handleMarkCompleted} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 transition-colors">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Mark Completed
                </button>
              </>
            )}
            {interview.status === 'completed' && !hasSubmittedFeedback && (
              <button onClick={() => setShowFeedback(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                <PenLine className="w-3.5 h-3.5" />
                Submit Feedback
              </button>
            )}
            {interview.status === 'completed' && hasSubmittedFeedback && (
              <button onClick={() => {
                const myFeedback = interview.feedback?.find((f) => f.user_id === user?.id)
                if (myFeedback) startEditFeedback(myFeedback)
              }} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
                <PenLine className="w-3.5 h-3.5" />
                Edit My Feedback
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      {/* ── BODY: 3 + 2 grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* ── LEFT COLUMN: Details + Feedback ── */}
        <div className="lg:col-span-3 space-y-4">

          {/* Interview Details Card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
              <h2 className="text-sm font-semibold text-gray-900">Interview Details</h2>
              {!editing && interview.status === 'scheduled' && canManageJobs && (
                <button onClick={startEdit} className="text-xs text-gray-400 hover:text-gray-700 font-medium transition-colors">
                  Edit
                </button>
              )}
            </div>

            {editing ? (
              <div className="px-5 py-4 space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">Type</Label>
                    <Select value={editType} onValueChange={setEditType}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {INTERVIEW_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">Duration (min)</Label>
                    <Input type="number" min={15} max={480} value={editDuration} onChange={(e) => setEditDuration(Number(e.target.value))} className="h-9 text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Date & Time</Label>
                  <Input type="datetime-local" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-9 text-sm" />
                </div>
                {/* Conditional: Location for face-to-face, Meeting Link for video */}
                {editType === 'onsite' ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">Location *</Label>
                    {interviewLocations.length > 0 ? (
                      <Select value={editLocation} onValueChange={setEditLocation}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select location" /></SelectTrigger>
                        <SelectContent>
                          {interviewLocations.map((loc) => (
                            <SelectItem key={loc.id} value={loc.name}>{loc.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} placeholder="Room 3B, Office" className="h-9 text-sm" />
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">Meeting Link</Label>
                    <Input value={editMeetingLink} onChange={(e) => setEditMeetingLink(e.target.value)} placeholder="https://meet.google.com/…" className="h-9 text-sm" />
                    <p className="text-[10px] text-gray-400">Leave empty to keep existing link</p>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Notes</Label>
                  <Textarea rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="text-sm resize-none" />
                </div>
                <div className="flex gap-2 pt-0.5">
                  <Button size="sm" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white">
                    {saving ? 'Saving…' : 'Save Changes'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="px-5 py-4">
                {/* Metric tiles */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { icon: '🕐', label: 'Time', value: timeStr },
                    { icon: '⏱', label: 'Duration', value: `${interview.duration_minutes} min` },
                    { icon: '📋', label: 'Type', value: typeLabel },
                  ].map((item) => (
                    <div key={item.label} className="bg-gray-50 rounded-xl px-3 py-3 text-center">
                      <p className="text-base mb-0.5">{item.icon}</p>
                      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">{item.label}</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5 truncate">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-0 divide-y divide-gray-50">
                  <DetailRow label="Scheduled" value={scheduledDate.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} />
                  <DetailRow label="Status" value={
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusMeta.bg} ${statusMeta.text} ${statusMeta.border}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
                      {statusMeta.label}
                    </span>
                  } />
                  {scorecardName && (
                    <DetailRow label="Scorecard" value={
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700">
                        <ClipboardList className="w-3.5 h-3.5" />
                        {scorecardName}
                      </span>
                    } />
                  )}
                  {interview.location && <DetailRow label="Location" value={interview.location} />}
                  {interview.meeting_link && interview.status === 'scheduled' && (
                    <DetailRow label="Meeting" value={
                      <a href={interview.meeting_link} target="_blank" rel="noopener noreferrer" className="text-gray-700 hover:underline font-medium">
                        Join Meeting →
                      </a>
                    } />
                  )}
                  {interview.notes && (
                    <div className="pt-3 mt-1">
                      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Notes</p>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{interview.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── FEEDBACK CARD (inside left column) ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-900">Feedback</h2>
                {interview.feedback?.length > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold">
                    {interview.feedback.length}
                  </span>
                )}
              </div>
              {interview.status === 'completed' && !hasSubmittedFeedback && !showFeedback && (
                <button onClick={() => setShowFeedback(true)} className="text-xs text-gray-400 hover:text-gray-700 font-medium transition-colors">
                  + Add Feedback
                </button>
              )}
            </div>

            <div className="px-5 py-4">
              {showFeedback ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-gray-500">Overall Rating <span className="text-red-400">*</span></Label>
                      <div className="flex items-center gap-1 py-1">
                        {[1,2,3,4,5].map((star) => (
                          <button
                            key={star}
                            onClick={() => setFbRating(star)}
                            className={`text-2xl leading-none transition-transform hover:scale-110 ${star <= fbRating ? 'text-amber-400' : 'text-gray-200'}`}
                          >★</button>
                        ))}
                        <span className="text-xs text-gray-400 ml-1">{RATING_LABELS[fbRating]}</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-gray-500">Recommendation <span className="text-red-400">*</span></Label>
                      <Select value={fbRecommendation} onValueChange={setFbRecommendation}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RECOMMENDATION_OPTIONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {scorecardCriteria.length > 0 && (
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Evaluation Criteria <span className="text-red-400">*</span></p>
                      {scorecardCriteria.map((c) => {
                        const rt = c.rating_type || 'rating'
                        const ratingTypeLabel = SCORECARD_RATING_TYPES.find((t) => t.value === rt)?.label
                        return (
                          <div key={c.id} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <span className="text-sm text-gray-700 font-medium">{c.name}</span>
                                <span className="ml-2 text-[10px] text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded">w:{c.weight}</span>
                                {rt !== 'rating' && (
                                  <span className="ml-1 text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">{ratingTypeLabel}</span>
                                )}
                              </div>
                              {rt === 'rating' && (
                                <div className="flex items-center gap-1 shrink-0">
                                  {[1,2,3,4,5].map((r) => (
                                    <button
                                      key={r}
                                      onClick={() => setCriteriaRatings((prev) => ({ ...prev, [c.id]: r }))}
                                      className={`w-6 h-6 rounded text-xs font-bold transition-all ${
                                        criteriaRatings[c.id] === r
                                          ? 'bg-blue-600 text-white'
                                          : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                                      }`}
                                    >{r}</button>
                                  ))}
                                </div>
                              )}
                              {rt === 'yes_no' && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    onClick={() => setCriteriaRatings((prev) => ({ ...prev, [c.id]: 5 }))}
                                    className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                                      criteriaRatings[c.id] === 5
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                                    }`}
                                  >Yes</button>
                                  <button
                                    onClick={() => setCriteriaRatings((prev) => ({ ...prev, [c.id]: 1 }))}
                                    className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                                      criteriaRatings[c.id] === 1
                                        ? 'bg-red-600 text-white'
                                        : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                                    }`}
                                  >No</button>
                                </div>
                              )}
                            </div>
                            {rt === 'text' && (
                              <Textarea
                                rows={2}
                                value={criteriaTextValues[c.id] || ''}
                                onChange={(e) => setCriteriaTextValues((prev) => ({ ...prev, [c.id]: e.target.value }))}
                                placeholder={`Feedback for ${c.name}...`}
                                className="text-sm resize-none"
                              />
                            )}
                            {c.description && (
                              <p className="text-[10px] text-gray-400 pl-0.5">{c.description}</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">Strengths <span className="text-red-400">*</span></Label>
                    <Textarea rows={3} value={fbStrengths} onChange={(e) => setFbStrengths(e.target.value)} placeholder="What went well?" className="text-sm resize-none" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">Weaknesses <span className="text-red-400">*</span></Label>
                    <Textarea rows={3} value={fbWeaknesses} onChange={(e) => setFbWeaknesses(e.target.value)} placeholder="Areas of concern?" className="text-sm resize-none" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">Notes <span className="text-red-400">*</span></Label>
                    <Textarea rows={2} value={fbNotes} onChange={(e) => setFbNotes(e.target.value)} placeholder="Additional observations…" className="text-sm resize-none" />
                  </div>
                  {error && <div className="bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2 rounded-lg">{error}</div>}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={handleSubmitFeedback} disabled={fbSaving} className="bg-blue-600 hover:bg-blue-500 text-white">
                      {fbSaving ? (editingFeedbackId ? 'Updating…' : 'Submitting…') : (editingFeedbackId ? 'Update Feedback' : 'Submit Feedback')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setShowFeedback(false); setEditingFeedbackId(null) }}>Cancel</Button>
                  </div>
                </div>
              ) : interview.feedback?.length > 0 ? (
                <div className="space-y-3">
                  {interview.feedback.map((fb) => {
                    const rec = RECOMMENDATION_OPTIONS.find((r) => r.value === fb.recommendation)
                    return (
                      <div key={fb.id} className="rounded-xl border border-gray-100 overflow-hidden">
                        <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs font-bold shrink-0">
                              {(userNames[fb.user_id] ?? 'R').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-800">{userNames[fb.user_id] ?? 'Reviewer'}</p>
                              <p className="text-[10px] text-gray-400">{new Date(fb.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-0.5">
                              {[1,2,3,4,5].map((s) => (
                                <span key={s} className={`text-sm ${s <= fb.overall_rating ? 'text-amber-400' : 'text-gray-200'}`}>★</span>
                              ))}
                            </div>
                            {rec && (
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${rec.color}`}>{rec.label}</span>
                            )}
                            <button
                              onClick={() => startEditFeedback(fb)}
                              className="text-[10px] font-medium text-gray-400 hover:text-gray-700 transition-colors ml-1"
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                        <div className="px-4 py-3 space-y-2.5">
                          {feedbackCriteriaRatings[fb.id] && feedbackCriteriaRatings[fb.id].length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Evaluation Criteria</p>
                              <div className="space-y-1.5">
                                {feedbackCriteriaRatings[fb.id].map((cr) => {
                                  const criteria = scorecardCriteria.find((c) => c.id === cr.criteria_id)
                                  const rt = criteria?.rating_type || 'rating'
                                  return (
                                    <div key={cr.criteria_id}>
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs text-gray-600">{criteria?.name ?? 'Unknown'}</span>
                                        {rt === 'rating' && (
                                          <div className="flex items-center gap-0.5">
                                            {[1,2,3,4,5].map((r) => (
                                              <span key={r} className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
                                                r === cr.rating ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-300'
                                              }`}>{r}</span>
                                            ))}
                                          </div>
                                        )}
                                        {rt === 'yes_no' && (
                                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                            cr.rating === 5 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                                          }`}>
                                            {cr.rating === 5 ? 'Yes' : 'No'}
                                          </span>
                                        )}
                                        {rt === 'text' && !cr.notes && (
                                          <span className="text-[10px] text-gray-400">No response</span>
                                        )}
                                      </div>
                                      {rt === 'text' && cr.notes && (
                                        <p className="text-xs text-gray-600 mt-0.5 pl-2 border-l-2 border-gray-200">{cr.notes}</p>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                          {fb.strengths && (
                            <div>
                              <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-0.5">Strengths</p>
                              <p className="text-sm text-gray-700 leading-relaxed">{fb.strengths}</p>
                            </div>
                          )}
                          {fb.weaknesses && (
                            <div>
                              <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-0.5">Weaknesses</p>
                              <p className="text-sm text-gray-700 leading-relaxed">{fb.weaknesses}</p>
                            </div>
                          )}
                          {fb.notes && (
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Notes</p>
                              <p className="text-sm text-gray-700 leading-relaxed">{fb.notes}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="py-10 text-center">
                  <div className="w-10 h-10 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto mb-3">
                    <MessageSquare className="w-5 h-5 text-gray-300" />
                  </div>
                  <p className="text-sm text-gray-400">
                    {interview.status === 'completed'
                      ? 'No feedback submitted yet.'
                      : 'Feedback can be added once the interview is completed.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Candidate + Position + Panel ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Candidate */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-50">
              <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Candidate</h2>
            </div>
            {candidate ? (
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-sm font-bold shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <Link href={`/candidates/${candidate.id}`} className="text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors block truncate">
                      {candidate.first_name} {candidate.last_name}
                    </Link>
                    <p className="text-xs text-gray-400 truncate">{candidate.email}</p>
                  </div>
                </div>
                <div className="space-y-2 text-xs pt-1">
                  {candidate.phone && <SidebarRow label="Phone" value={candidate.phone} />}
                  {candidate.current_title && (
                    <SidebarRow label="Role" value={`${candidate.current_title}${candidate.current_company ? ` · ${candidate.current_company}` : ''}`} />
                  )}
                  {candidate.location && <SidebarRow label="Location" value={candidate.location} />}
                  {candidate.resume_url && (
                    <div className="flex items-center gap-2 pt-0.5">
                      <button
                        onClick={() => setShowResume(!showResume)}
                        className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800 font-medium"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {showResume ? 'Hide Resume' : 'View Resume'}
                      </button>
                      <a href={candidate.resume_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800 font-medium">
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="px-5 py-4 text-xs text-gray-400">No candidate data.</p>
            )}
          </div>

          {/* Resume Preview moved to right sidebar panel */}

          {/* Position */}
          {job && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-50">
                <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Position</h2>
              </div>
              <div className="px-5 py-4">
                {isInterviewer ? (
                  <p className="text-sm font-semibold text-gray-900">{job.title}</p>
                ) : (
                  <Link href={`/jobs/${job.id}`} className="text-sm font-semibold text-gray-800 hover:text-gray-600 transition-colors">
                    {job.title} →
                  </Link>
                )}
                <p className="text-xs text-gray-400 mt-0.5">{job.department}</p>
                {interview.application?.current_stage && (
                  <div className="mt-3 pt-3 border-t border-gray-50">
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Current Stage</p>
                    <span className="inline-flex items-center text-xs font-medium bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">
                      {interview.application.current_stage.name}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Interview Panel */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-50">
              <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Interview Panel</h2>
            </div>
            <div className="px-5 py-4 space-y-3">
              {interview.interview_panelists?.map((panelist, idx) => {
                const details = userDetails[panelist.user_id]
                const name = details?.name ?? userNames[panelist.user_id] ?? 'Loading…'
                return (
                  <div key={idx} className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold shrink-0">
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{name}</p>
                      {details?.email && <p className="text-[10px] text-gray-400 truncate">{details.email}</p>}
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded shrink-0">
                      {panelist.role === 'lead' ? 'Lead' : panelist.role}
                    </span>
                  </div>
                )
              })}
              {interview.interviewer_email && !interview.interview_panelists?.some(
                (p) => userDetails[p.user_id]?.email?.toLowerCase() === interview.interviewer_email?.toLowerCase()
              ) && (
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-gray-50 text-gray-500 flex items-center justify-center text-xs font-bold shrink-0">
                    {interview.interviewer_email.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 truncate">{interview.interviewer_email}</p>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded shrink-0">
                    Interviewer
                  </span>
                </div>
              )}
              {!interview.interview_panelists?.length && !interview.interviewer_email && (
                <p className="text-xs text-gray-400">No panel members assigned.</p>
              )}
            </div>
          </div>

          {/* Job Description (collapsible) */}
          {interview.application?.job?.description && (
            <details className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <summary className="px-5 py-3.5 cursor-pointer select-none hover:bg-gray-50 transition-colors">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Job Description</span>
              </summary>
              <div
                className="px-5 py-4 text-sm text-gray-700 prose prose-sm max-w-none border-t border-gray-50"
                dangerouslySetInnerHTML={{ __html: interview.application.job.description }}
              />
            </details>
          )}

        </div>
      </div>
    </div>

    {/* ── RESUME PANEL — fixed right side ── */}
    {showResume && candidate?.resume_url && (
      <div className="fixed top-0 right-0 h-screen bg-white border-l border-gray-200 shadow-xl z-50" style={{ width: '42vw' }}>
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">Resume</h2>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={candidate.resume_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 font-medium"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
            <a
              href={candidate.resume_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open
            </a>
            <button
              onClick={() => setShowResume(false)}
              className="p-1 rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div style={{ height: 'calc(100vh - 49px)' }}>
          <iframe
            src={candidate.resume_url.toLowerCase().endsWith('.pdf')
              ? `${candidate.resume_url}#toolbar=0&navpanes=0`
              : `/api/resumes/preview-docx?url=${encodeURIComponent(candidate.resume_url)}`
            }
            title="Candidate Resume"
            className="w-full h-full border-0"
          />
        </div>
      </div>
    )}

    {/* Cancel Interview Confirmation Dialog */}
    <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <AlertDialogTitle className="text-center text-lg">Cancel this interview?</AlertDialogTitle>
          <AlertDialogDescription className="text-center text-sm text-gray-500">
            This will cancel the interview
            {interview?.application?.candidate && (
              <> with <span className="font-medium text-gray-700">{interview.application.candidate.first_name} {interview.application.candidate.last_name}</span></>
            )}. All participants will be notified by email. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex gap-2 sm:justify-center pt-2">
          <AlertDialogCancel className="flex-1 sm:flex-none">Keep Interview</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCancelConfirmed}
            className="flex-1 sm:flex-none bg-red-600 hover:bg-red-700 text-white"
          >
            Yes, Cancel Interview
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    </div>
  )
}

/* ── Helpers ── */

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-xs text-gray-400 font-medium shrink-0 w-20">{label}</span>
      <span className="text-sm text-gray-800 text-right leading-snug">{value}</span>
    </div>
  )
}

function SidebarRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className="text-gray-700 font-medium text-right truncate">{value}</span>
    </div>
  )
}
