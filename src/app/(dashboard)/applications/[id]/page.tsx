'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getApplicationById, moveApplication, hireApplication } from '@/lib/services/applications'
import { getMatchScore } from '@/lib/services/ai-matching'
import { updateCandidate } from '@/lib/services/candidates'
import { CANDIDATE_SOURCES, MAX_FILE_SIZE } from '@/lib/constants'
import { getComments, addComment, deleteComment } from '@/lib/services/comments'
import { EDUCATION_LABELS, GENDER_OPTIONS, NOTICE_PERIOD_OPTIONS } from '@/lib/validators/candidate'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ScheduleInterviewDialog } from '@/app/(dashboard)/jobs/[id]/applications/schedule-interview-dialog'
import { SendEmailDialog } from '@/components/email/send-email-dialog'
import { SendWhatsAppDialog } from '@/components/whatsapp/send-whatsapp-dialog'
import { InterviewFeedbackDialog } from '@/app/(dashboard)/jobs/[id]/applications/interview-feedback-dialog'
import { resolveUserNames } from '@/app/(dashboard)/interviews/actions'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = Record<string, any>

interface PipelineStage {
  id: string
  name: string
  stage_type: string
  display_order: number
}

const INTERVIEW_TYPES_MAP: Record<string, string> = {
  phone: 'Phone Screen',
  video: 'Video Call',
  onsite: 'On-site',
  technical: 'Technical',
  cultural: 'Cultural Fit',
}

const INTERVIEW_STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-800',
}

type HiringPhase = 'NEW' | 'INTERVIEW_SCHEDULED' | 'AWAITING_FEEDBACK' | 'READY_FOR_NEXT' | 'OFFER' | 'DECIDED'

function getHiringPhase(app: AnyData): HiringPhase {
  if (['hired', 'rejected', 'withdrawn'].includes(app.status)) return 'DECIDED'
  if (app.offer_letters?.length > 0) return 'OFFER'
  const interviews: AnyData[] = app.interviews || []
  if (interviews.length === 0) return 'NEW'
  const completed = interviews.filter((iv: AnyData) => iv.status === 'completed')
  const scheduled = interviews.filter((iv: AnyData) => iv.status === 'scheduled')
  if (completed.some((iv: AnyData) => !iv.interview_feedback || iv.interview_feedback.length === 0)) return 'AWAITING_FEEDBACK'
  if (scheduled.length > 0) return 'INTERVIEW_SCHEDULED'
  if (completed.length > 0) return 'READY_FOR_NEXT'
  return 'NEW'
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  withdrawn: 'bg-gray-100 text-gray-800',
  rejected: 'bg-red-100 text-red-800',
  hired: 'bg-emerald-100 text-emerald-800',
}

const OFFER_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  sent: 'bg-blue-100 text-blue-800',
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  revoked: 'bg-red-100 text-red-800',
  expired: 'bg-yellow-100 text-yellow-800',
}

export default function ApplicationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'personal')
  const { user, organization, isLoading: userLoading } = useUser()
  const { canManageCandidates, isInterviewer, canSendWhatsApp } = useRole()
  const [application, setApplication] = useState<AnyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Resume drawer
  const [resumeOpen, setResumeOpen] = useState(false)

  // Action dialogs
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [whatsappOpen, setWhatsappOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [userNames, setUserNames] = useState<Record<string, string>>({})

  // Assessment state
  const [assessmentInvitations, setAssessmentInvitations] = useState<AnyData[]>([])
  const [sendingAssessment, setSendingAssessment] = useState(false)

  // AI match score
  const [matchScore, setMatchScore] = useState<AnyData | null>(null)

  // Notes state
  const [notes, setNotes] = useState<AnyData[]>([])
  const [noteInput, setNoteInput] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)

  // Interviewers only have access to Dashboard + Interviews
  useEffect(() => {
    if (!userLoading && isInterviewer) {
      router.replace('/interviews')
    }
  }, [userLoading, isInterviewer, router])

  const loadApplication = useCallback(async () => {
    if (!organization) return
    setError(null)
    const supabase = createClient()
    const { data, error: fetchError } = await getApplicationById(
      supabase, params.id as string, organization.id
    )
    if (fetchError) {
      setError(fetchError.message)
    } else if (data) {
      setApplication(data)

      // Resolve panelist + feedback user names
      const interviews = data.interviews ?? []
      const allUserIds = interviews.flatMap((iv: AnyData) => [
        ...(iv.interview_panelists ?? []).map((p: AnyData) => p.user_id),
        ...(iv.interview_feedback ?? []).map((f: AnyData) => f.user_id),
      ]).filter((id: string, i: number, arr: string[]) => id && arr.indexOf(id) === i)
      if (allUserIds.length > 0) {
        resolveUserNames(allUserIds).then(setUserNames)
      }

      // Fetch assessment invitations for this application
      try {
        const res = await fetch(`/api/assessments?application_id=${data.id}`)
        if (res.ok) {
          const { invitations } = await res.json()
          setAssessmentInvitations(invitations || [])
        }
      } catch {
        // Silently fail
      }

      // Load application notes
      const supabase2 = createClient()
      const commentsResult = await getComments(supabase2, organization.id, 'application', data.id)
      setNotes(commentsResult.data || [])

      // Load AI match score (silently)
      try {
        const supabase3 = createClient()
        const { data: score } = await getMatchScore(supabase3, data.id)
        setMatchScore(score ?? null)
      } catch {
        // ignore
      }
    }
    setLoading(false)
  }, [organization, params.id])

  useEffect(() => {
    if (!organization) return
    loadApplication()
  }, [organization, loadApplication])

  async function handleReject() {
    if (!organization || !user || !application) return
    setRejecting(true)
    try {
      const res = await fetch('/api/applications/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: application.id,
          reason: rejectReason,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to reject application')
      } else {
        setRejectOpen(false)
        setRejectReason('')
        await loadApplication()
      }
    } catch {
      setError('Failed to reject application')
    }
    setRejecting(false)
  }

  async function handleHire() {
    if (!organization || !user || !application) return
    const supabase = createClient()
    const { error: hireError } = await hireApplication(supabase, application.id, organization.id, user.id)
    if (hireError) {
      setError(hireError.message)
    } else {
      await loadApplication()
    }
  }

  async function handleOfferRespond(offerId: string, status: 'accepted' | 'declined' | 'revoked') {
    setError(null)
    try {
      const res = await fetch(`/api/offers/${offerId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `Failed to mark offer as ${status}`)
      } else {
        await loadApplication()
      }
    } catch {
      setError(`Failed to mark offer as ${status}`)
    }
  }

  async function handleStageChange(newStageId: string) {
    if (!organization || !user || !application || newStageId === application.current_stage?.id) return

    const targetStage = stages.find((s) => s.id === newStageId)

    if (targetStage?.stage_type === 'rejected') {
      // Auto-reject: update status + send rejection email + move stage
      try {
        const res = await fetch('/api/applications/reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId: application.id, reason: '', stageId: newStageId }),
        })
        if (!res.ok) {
          const data = await res.json()
          setError(data.error || 'Failed to reject application')
        }
      } catch {
        setError('Failed to reject application')
      }
      await loadApplication()
      return
    }

    const supabase = createClient()
    const { error: moveError } = await moveApplication(
      supabase, application.id, organization.id, newStageId, user.id
    )
    if (moveError) {
      setError(moveError.message)
    } else {
      await loadApplication()
    }
  }

  async function handleSendAssessment(assessmentName: string, assessmentLink: string, instructions: string, expiryDate: string) {
    if (!application) return
    setSendingAssessment(true)
    setError(null)
    try {
      const res = await fetch('/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: application.id,
          assessment_name: assessmentName || null,
          assessment_link: assessmentLink,
          instructions: instructions || null,
          expiry_date: expiryDate || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to send assessment')
      } else {
        // Auto-advance to 'assessment' stage if not already past it
        await autoAdvanceStage('assessment')
      }
    } catch {
      setError('Failed to send assessment')
    }
    setSendingAssessment(false)
  }

  async function autoAdvanceStage(toType: string) {
    const pipelineStages: PipelineStage[] = ((application?.job as AnyData)?.pipeline_stages || [])
      .sort((a: PipelineStage, b: PipelineStage) => a.display_order - b.display_order)
    const currentStage = pipelineStages.find((s: PipelineStage) => s.id === (application?.current_stage as AnyData)?.id)
    const targetStage = pipelineStages.find((s: PipelineStage) => s.stage_type === toType)
    if (targetStage && (!currentStage || currentStage.display_order < targetStage.display_order)) {
      await handleStageChange(targetStage.id) // also calls loadApplication internally
    } else {
      await loadApplication()
    }
  }

  async function handleInterviewScheduled() {
    await autoAdvanceStage('interview')
  }

  async function handleSaveScore(invitationId: string, score: number) {
    setError(null)
    try {
      const res = await fetch(`/api/assessments/${invitationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to save score')
      } else {
        await loadApplication()
      }
    } catch {
      setError('Failed to save score')
    }
  }

  async function handleAddNote() {
    if (!noteInput.trim() || !organization || !user || !application) return
    setAddingNote(true)
    setNoteError(null)
    const supabase = createClient()
    const { data: newNote, error } = await addComment(
      supabase, organization.id, user.id, 'application', application.id, noteInput.trim()
    )
    if (error) {
      setNoteError(error.message)
    } else if (newNote) {
      setNotes((prev) => [...prev, newNote])
      setNoteInput('')
    }
    setAddingNote(false)
  }

  async function handleDeleteNote(commentId: string) {
    if (!organization || !user) return
    const supabase = createClient()
    const { error } = await deleteComment(supabase, commentId, organization.id, user.id)
    if (!error) {
      setNotes((prev) => prev.filter((n) => n.id !== commentId))
    }
  }

  // Block render while redirecting interviewer
  if (isInterviewer) {
    return null
  }

  if (userLoading || loading) {
    return (
      <div className="space-y-6 max-w-6xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (!application) {
    return <div className="text-center py-12 text-gray-500">Application not found</div>
  }

  const candidate = application.candidate
  const job = application.job
  const phase = getHiringPhase(application)
  const isActive = application.status === 'active'
  const stages: PipelineStage[] = (job?.pipeline_stages || [])
    .sort((a: PipelineStage, b: PipelineStage) => a.display_order - b.display_order)
  const interviews: AnyData[] = (application.interviews || []).sort(
    (a: AnyData, b: AnyData) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  )
  const sourceLabel = CANDIDATE_SOURCES.find((s) => s.value === candidate?.source)?.label ?? candidate?.source
  const educationLabel = candidate?.education ? (EDUCATION_LABELS[candidate.education] || candidate.education) : null
  const genderLabel = candidate?.gender ? (GENDER_OPTIONS.find((g: AnyData) => g.value === candidate.gender)?.label || candidate.gender) : null
  const noticeLabel = candidate?.notice_period ? (NOTICE_PERIOD_OPTIONS.find((n: AnyData) => n.value === candidate.notice_period)?.label || candidate.notice_period) : null
  return (
    <div className="max-w-6xl space-y-6">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        Back
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-lg font-semibold">
            {candidate?.first_name?.[0]}{candidate?.last_name?.[0]}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {candidate?.first_name} {candidate?.last_name}
              </h1>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[application.status] || 'bg-gray-100 text-gray-800'}`}>
                {application.status}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-0.5">
              Applied for{' '}
              <Link href={`/jobs/${job?.id}`} className="text-blue-600 hover:underline font-medium">
                {job?.title || 'Unknown Job'}
              </Link>
              {job?.department && <span className="text-gray-400"> &middot; {job.department}</span>}
            </p>
            {/* Stage selector inline */}
            {isActive && canManageCandidates && stages.length > 0 && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs text-gray-500">Stage:</span>
                <Select value={application.current_stage?.id || ''} onValueChange={handleStageChange}>
                  <SelectTrigger className="h-7 w-[180px] text-xs">
                    <SelectValue placeholder="Move stage..." />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* Header actions */}
        <div className="flex flex-wrap gap-2">
          {canManageCandidates && (
            <Button size="sm" variant="outline" onClick={() => setEmailOpen(true)}>
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
              Email
            </Button>
          )}
          {canSendWhatsApp && candidate?.phone && (
            <Button size="sm" variant="outline" onClick={() => setWhatsappOpen(true)} className="text-green-700 border-green-200 hover:bg-green-50">
              <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp
            </Button>
          )}
          {canManageCandidates && (
            <Link href={`/candidates/${candidate?.id}`}>
              <Button size="sm" variant="outline">View Profile</Button>
            </Link>
          )}
          {isActive && canManageCandidates && (
            <Button size="sm" variant="destructive" onClick={() => setRejectOpen(true)}>
              Reject
            </Button>
          )}
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>}

      {/* ====== TABS ====== */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="personal">Personal Details</TabsTrigger>
          <TabsTrigger value="assessment">
            Assessment
            {assessmentInvitations.length > 0 && (
              <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700">
                {assessmentInvitations.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="interview">
            Interviews
            {interviews.length > 0 && (
              <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700">{interviews.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="offer">
            Offer & Hire
            {application.offer_letters?.length > 0 && (
              <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700">{application.offer_letters.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="notes">
            Notes
            {notes.length > 0 && (
              <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700">{notes.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ============ TAB 1: Personal Details ============ */}
        <TabsContent value="personal" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* ====== LEFT COLUMN — All Details ====== */}
            <div className="lg:col-span-3 space-y-0">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Section: Personal */}
                <div className="px-5 py-4 border-b border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Personal</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <InfoField label="Full Name" value={`${candidate?.first_name || ''} ${candidate?.last_name || ''}`} />
                    <InfoField label="Email" value={candidate?.email} />
                    <InfoField label="Phone" value={candidate?.phone} />
                    <InfoField label="Location" value={candidate?.location} />
                    <InfoField label="Gender" value={genderLabel} />
                    <InfoField label="Date of Birth" value={candidate?.date_of_birth ? new Date(candidate.date_of_birth).toLocaleDateString() : null} />
                    <InfoField label="Source" value={sourceLabel} />
                  </div>
                </div>
                {/* Section: Professional */}
                <div className="px-5 py-4 border-b border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Professional</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <InfoField label="Current Company" value={candidate?.current_company} />
                    <InfoField label="Current Title" value={candidate?.current_title} />
                    <InfoField label="Experience" value={candidate?.experience_years != null ? `${candidate.experience_years} years` : null} />
                    <InfoField label="Notice Period" value={noticeLabel} />
                    <InfoField label="Education" value={educationLabel} />
                    <LinkField label="LinkedIn" url={candidate?.linkedin_url} text="View Profile" />
                    <LinkField label="Portfolio" url={candidate?.portfolio_url} text="View Website" />
                  </div>
                </div>
                {/* Section: Compensation */}
                <div className="px-5 py-4 border-b border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Compensation</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <InfoField label="Current CTC (Annual)" value={candidate?.current_salary != null ? `₹${Number(candidate.current_salary).toLocaleString()}` : null} />
                    <InfoField label="Expected CTC (Annual)" value={candidate?.expected_salary != null ? `₹${Number(candidate.expected_salary).toLocaleString()}` : null} />
                  </div>
                </div>
                {/* Cover Letter */}
                {candidate?.cover_letter && (
                  <div className="px-5 py-4 border-b border-gray-100">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Cover Letter</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{candidate.cover_letter}</p>
                  </div>
                )}
                {/* Candidate Notes */}
                {candidate?.notes && (
                  <div className="px-5 py-4 border-b border-gray-100">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Candidate Notes</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{candidate.notes}</p>
                  </div>
                )}
                {/* AI Score & Summary */}
                {matchScore && (
                  <div className="px-5 py-4 border-b border-gray-100">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">AI Match</p>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                        matchScore.overall_score >= 80 ? 'bg-green-100 text-green-700' :
                        matchScore.overall_score >= 60 ? 'bg-yellow-100 text-yellow-700' :
                        matchScore.overall_score >= 40 ? 'bg-orange-100 text-orange-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {matchScore.overall_score}%
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800 capitalize">{(matchScore.recommendation ?? '').replace(/_/g, ' ')}</p>
                        <div className="flex gap-3 mt-0.5 text-xs text-gray-400">
                          <span>Skills {matchScore.skill_score}%</span>
                          <span>Exp {matchScore.experience_score}%</span>
                          <span>Semantic {matchScore.semantic_score}%</span>
                        </div>
                      </div>
                    </div>
                    {matchScore.ai_summary && (
                      <p className="text-sm text-gray-600 leading-relaxed">{matchScore.ai_summary}</p>
                    )}
                  </div>
                )}

                {/* Resume */}
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Resume</p>
                    {candidate?.resume_url && (
                      <a
                        href={candidate.resume_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded-md px-2 py-1 hover:border-gray-300 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                        Download
                      </a>
                    )}
                  </div>
                  {candidate?.resume_url ? (
                    <div className="rounded-md border border-gray-200 overflow-hidden bg-gray-50" style={{ height: '700px' }}>
                      <iframe
                        src={`${candidate.resume_url}#toolbar=0&navpanes=0&scrollbar=1`}
                        className="w-full h-full border-0"
                        title="Resume Preview"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-gray-200 rounded-md">
                      <svg className="w-10 h-10 text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <p className="text-sm text-gray-400 mb-1">No resume uploaded</p>
                      <p className="text-xs text-gray-300 mb-3">PDF only, max 10MB</p>
                      {canManageCandidates && (
                        <ResumeUploadButton
                          candidateId={candidate?.id}
                          orgId={organization!.id}
                          onUploadComplete={(url) => {
                            setApplication((prev: AnyData | null) =>
                              prev ? { ...prev, candidate: { ...prev.candidate, resume_url: url } } : prev
                            )
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ====== RIGHT COLUMN — Actions + Overview ====== */}
            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-6 space-y-4 max-h-[calc(100vh-3rem)] overflow-y-auto">

                {/* Quick Actions */}
                {isActive && canManageCandidates && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                    <div className="px-6 py-4 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-900">Quick Actions</h3></div>
                    <div className="p-5 space-y-2">
                      <Button size="sm" variant="outline" className="w-full justify-start gap-2 h-8 text-xs" onClick={() => setScheduleOpen(true)}>
                        <svg className="w-3.5 h-3.5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                        Schedule Interview
                      </Button>
                      <Link href={`/offers/new?applicationId=${application.id}`} className="block">
                        <Button size="sm" variant="outline" className="w-full justify-start gap-2 h-8 text-xs">
                          <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                          Create Offer
                        </Button>
                      </Link>
                      <Button size="sm" variant="outline" className="w-full justify-start gap-2 h-8 text-xs" onClick={() => setEmailOpen(true)}>
                        <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                        Send Email
                      </Button>
                      {canSendWhatsApp && candidate?.phone && (
                        <Button size="sm" variant="outline" className="w-full justify-start gap-2 h-8 text-xs text-green-700 border-green-200 hover:bg-green-50" onClick={() => setWhatsappOpen(true)}>
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                          Send WhatsApp
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Overview Card */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="px-6 py-4 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-900">Overview</h3>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="text-sm space-y-2">
                      <InfoRow label="Applied" value={new Date(application.applied_at || application.created_at).toLocaleDateString()} />
                      <InfoRow label="Source" value={sourceLabel || '-'} />
                      {application.current_stage && (
                        <InfoRow label="Current Stage" value={application.current_stage.name} />
                      )}
                      {candidate?.experience_years != null && <InfoRow label="Experience" value={`${candidate.experience_years} yrs`} />}
                      {noticeLabel && <InfoRow label="Notice Period" value={noticeLabel} />}
                      {educationLabel && <InfoRow label="Education" value={educationLabel} />}
                      {candidate?.current_salary != null && <InfoRow label="Current CTC" value={`₹${Number(candidate.current_salary).toLocaleString()}`} />}
                      {candidate?.expected_salary != null && <InfoRow label="Expected CTC" value={`₹${Number(candidate.expected_salary).toLocaleString()}`} />}
                    </div>

                    <Separator />

                    {/* Tags */}
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Tags & Skills</h4>
                      {candidate?.tags?.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {candidate.tags.map((tag: string) => (
                            <span key={tag} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">{tag}</span>
                          ))}
                        </div>
                      ) : <p className="text-sm text-gray-400">No tags</p>}
                    </div>

                    <Separator />

                    {/* Resume */}
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Resume</h4>
                      {candidate?.resume_url ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1.5"
                            onClick={() => setResumeOpen(true)}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            See Resume
                          </Button>
                          <a
                            href={candidate.resume_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-gray-400 hover:text-gray-700 hover:underline"
                          >
                            Download
                          </a>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-gray-400">No resume uploaded</p>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setResumeOpen(true)}>
                            Upload
                          </Button>
                        </div>
                      )}
                    </div>

                  </div>
                </div>

                {/* View Profile Link */}
                <Link href={`/candidates/${candidate?.id}`} className="block">
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-8 text-xs">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                    View Full Profile
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ============ TAB 2: Assessment ============ */}
        <TabsContent value="assessment" className="mt-6 space-y-6">
          <AssessmentTab
            assessmentInvitations={assessmentInvitations}
            isActive={isActive}
            canManage={canManageCandidates}
            sending={sendingAssessment}
            onSend={handleSendAssessment}
            onSaveScore={handleSaveScore}
          />
        </TabsContent>

        {/* ============ TAB 3: Interviews ============ */}
        <TabsContent value="interview" className="mt-6 space-y-6">
          {/* Schedule button */}
          {isActive && canManageCandidates && (
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Interviews ({interviews.length})
              </h2>
              <Button onClick={() => setScheduleOpen(true)}>
                Schedule Interview
              </Button>
            </div>
          )}

          {interviews.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="py-12 text-center">
                <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                <p className="text-gray-500 text-sm">No interviews scheduled yet</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {interviews.map((iv: AnyData, idx: number) => {
                const typeLabel = INTERVIEW_TYPES_MAP[iv.interview_type] || iv.interview_type
                const feedback = iv.interview_feedback?.[0]
                const hasFeedback = feedback != null

                return (
                  <div key={iv.id} className="bg-white rounded-xl border border-gray-200 shadow-sm">
                    <div className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm">Round {idx + 1}: {typeLabel}</h3>
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${INTERVIEW_STATUS_COLORS[iv.status] || 'bg-gray-100 text-gray-800'}`}>
                              {iv.status}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">
                            {new Date(iv.scheduled_at).toLocaleDateString()} at {new Date(iv.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {iv.duration_minutes && ` (${iv.duration_minutes} min)`}
                          </p>
                          {iv.location && <p className="text-xs text-gray-400">{iv.location}</p>}
                          {iv.meeting_link && (
                            <a href={iv.meeting_link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                              Join Meeting
                            </a>
                          )}
                        </div>
                        <Link href={`/interviews/${iv.id}?from=application`}>
                          <Button variant="outline" size="sm" className="text-xs">View Details</Button>
                        </Link>
                      </div>

                      {/* Panelists */}
                      {iv.interview_panelists?.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs text-gray-500 mb-1">Panelists:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {iv.interview_panelists.map((p: AnyData) => (
                              <span key={p.id} className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-gray-200 text-gray-700">
                                {userNames[p.user_id] || p.user_id?.slice(0, 8)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Feedback */}
                      {hasFeedback ? (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-700">Feedback:</span>
                            <span className="text-amber-500 text-xs">
                              {'★'.repeat(feedback.overall_rating)}{'☆'.repeat(5 - feedback.overall_rating)}
                            </span>
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-gray-200 text-gray-700">
                              {feedback.recommendation}
                            </span>
                          </div>
                        </div>
                      ) : iv.status === 'completed' ? (
                        <div className="mt-3 p-3 bg-amber-50 rounded-lg flex items-center justify-between">
                          <span className="text-xs text-amber-700">Awaiting feedback</span>
                          <Link href={`/interviews/${iv.id}?from=application`} className="text-xs text-blue-600 hover:underline">
                            Submit Feedback
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Feedback summary button */}
          {application.feedback?.length > 0 && (
            <Button variant="outline" onClick={() => setFeedbackOpen(true)}>
              View All Feedback ({application.feedback.length})
            </Button>
          )}
        </TabsContent>

        {/* ============ TAB 4: Offer & Hire ============ */}
        <TabsContent value="offer" className="mt-6 space-y-6">
          {/* Status banner */}
          {application.status === 'hired' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center gap-3">
              <svg className="w-6 h-6 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-semibold text-emerald-800">Candidate Hired</p>
                {application.hired_at && (
                  <p className="text-xs text-emerald-600">on {new Date(application.hired_at).toLocaleDateString()}</p>
                )}
              </div>
            </div>
          )}

          {application.status === 'rejected' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="font-semibold text-red-800">Application Rejected</p>
              {application.rejection_reason && (
                <p className="text-sm text-red-600 mt-1">{application.rejection_reason}</p>
              )}
              {application.rejected_at && (
                <p className="text-xs text-red-400 mt-1">on {new Date(application.rejected_at).toLocaleDateString()}</p>
              )}
            </div>
          )}

          {/* Offer Letters */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Offer Letters ({application.offer_letters?.length || 0})
            </h2>
            {isActive && canManageCandidates && (
              <Button onClick={() => router.push(`/offers/new?applicationId=${application.id}`)}>
                Create Offer
              </Button>
            )}
          </div>

          {application.offer_letters?.length > 0 ? (
            <div className="space-y-4">
              {application.offer_letters.map((offer: AnyData) => (
                <div key={offer.id} className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="p-6 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm">
                            {offer.salary_currency} {Number(offer.salary).toLocaleString()}
                          </h3>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${OFFER_STATUS_COLORS[offer.status] || 'bg-gray-100 text-gray-800'}`}>
                            {offer.status}
                          </span>
                        </div>
                        {offer.sent_at && (
                          <p className="text-xs text-gray-500">
                            Sent on {new Date(offer.sent_at).toLocaleDateString()}
                          </p>
                        )}
                        {offer.responded_at && (
                          <p className="text-xs text-gray-500">
                            Responded on {new Date(offer.responded_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <Link href={`/offers/${offer.id}?from=application`}>
                        <Button variant="outline" size="sm" className="text-xs">View Offer</Button>
                      </Link>
                    </div>
                    {/* Action buttons for sent/draft offers */}
                    {(offer.status === 'sent' || offer.status === 'draft') && canManageCandidates && (
                      <div className="flex items-center gap-2 pt-2 border-t">
                        <span className="text-xs text-gray-500 mr-1">Response:</span>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-xs h-7"
                          onClick={() => handleOfferRespond(offer.id, 'accepted')}
                        >
                          Accepted
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          onClick={() => handleOfferRespond(offer.id, 'declined')}
                        >
                          Declined
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="text-xs h-7"
                          onClick={() => handleOfferRespond(offer.id, 'revoked')}
                        >
                          Revoked by Company
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="py-12 text-center">
                <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <p className="text-gray-500 text-sm">No offers created yet</p>
                {isActive && canManageCandidates && (
                  <Button className="mt-4" onClick={() => router.push(`/offers/new?applicationId=${application.id}`)}>
                    Create Offer
                  </Button>
                )}
              </div>
            </div>
          )}

          <Separator />

          {/* Hire / Reject Actions */}
          {isActive && canManageCandidates && phase !== 'DECIDED' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100"><h3 className="text-base font-semibold text-gray-900">Decision</h3></div>
              <div className="p-5 space-y-3">
                {phase === 'OFFER' ? (
                  <p className="text-sm text-gray-600">
                    An offer has been extended. You can now mark the candidate as hired or reject the application.
                  </p>
                ) : (
                  <p className="text-sm text-gray-600">
                    You can reject this application at any time. To hire, first create and send an offer.
                  </p>
                )}
                <div className="flex gap-2">
                  {phase === 'OFFER' && (
                    <Button className="bg-green-600 hover:bg-green-700" onClick={handleHire}>
                      <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Mark as Hired
                    </Button>
                  )}
                  <Button variant="destructive" onClick={() => setRejectOpen(true)}>
                    Reject Application
                  </Button>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ============ TAB 5: Notes ============ */}
        <TabsContent value="notes" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Input column */}
            <div className="lg:col-span-3 space-y-4">
              {canManageCandidates ? (
                <div className="space-y-2.5">
                  <Textarea
                    rows={4}
                    placeholder="Write a note about this candidate... (Cmd+Enter to submit)"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote()
                    }}
                    className="resize-none"
                  />
                  {noteError && <p className="text-xs text-red-600">{noteError}</p>}
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={handleAddNote}
                      disabled={addingNote || !noteInput.trim()}
                      className="gap-1.5"
                    >
                      {addingNote ? (
                        <>
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          Saving…
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                          Add Note
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}

              {/* Notes timeline */}
              {notes.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
                  <svg className="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                  <p className="text-sm text-gray-500">No notes yet</p>
                  <p className="text-xs text-gray-400 mt-0.5">Team notes are visible only to your organization</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {notes.map((note, idx) => (
                    <div key={note.id} className="flex gap-3 group">
                      {/* Timeline line */}
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-semibold shrink-0">
                          {(note.user_email || 'U')[0].toUpperCase()}
                        </div>
                        {idx < notes.length - 1 && (
                          <div className="w-px flex-1 bg-gray-100 my-1" />
                        )}
                      </div>
                      {/* Content */}
                      <div className={`flex-1 pb-4 ${idx < notes.length - 1 ? '' : ''}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500">
                            {new Date(note.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                          </span>
                          {user?.id === note.user_id && (
                            <button
                              onClick={() => handleDeleteNote(note.id)}
                              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                              title="Delete note"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{note.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Info sidebar */}
            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-6 rounded-lg border border-gray-100 bg-gray-50/60 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
                  <span className="font-medium text-gray-700">About Notes</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Notes are internal and only visible to your organization team. Use them to track conversations, decisions, or any context about this candidate.
                </p>
                <div className="pt-2 border-t border-gray-200 text-xs text-gray-400 space-y-1">
                  <p><span className="font-medium text-gray-500">{notes.length}</span> note{notes.length !== 1 ? 's' : ''} added</p>
                  <p>Tip: Press <kbd className="bg-white border border-gray-200 rounded px-1 py-0.5 text-[10px] font-mono">⌘</kbd> + <kbd className="bg-white border border-gray-200 rounded px-1 py-0.5 text-[10px] font-mono">↵</kbd> to submit</p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

      </Tabs>

      {/* ====== ACTION DIALOGS ====== */}

      {scheduleOpen && (
        <ScheduleInterviewDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          applicationId={application.id}
          candidateName={`${candidate?.first_name} ${candidate?.last_name}`}
          candidateEmail={candidate?.email}
          jobTitle={job?.title || ''}
          onSuccess={handleInterviewScheduled}
        />
      )}

      {emailOpen && (
        <SendEmailDialog
          open={emailOpen}
          onOpenChange={setEmailOpen}
          candidateId={candidate?.id}
          candidateName={`${candidate?.first_name} ${candidate?.last_name}`}
          candidateEmail={candidate?.email}
          jobTitle={job?.title || undefined}
          applicationId={application.id}
        />
      )}

      {whatsappOpen && (
        <SendWhatsAppDialog
          open={whatsappOpen}
          onOpenChange={setWhatsappOpen}
          candidateId={candidate?.id}
          candidateName={`${candidate?.first_name} ${candidate?.last_name}`}
          candidatePhone={candidate?.phone}
          jobTitle={job?.title || undefined}
          applicationId={application.id}
        />
      )}

      {feedbackOpen && (
        <InterviewFeedbackDialog
          open={feedbackOpen}
          onOpenChange={setFeedbackOpen}
          applicationId={application.id}
          candidateName={`${candidate?.first_name} ${candidate?.last_name}`}
          orgId={organization!.id}
        />
      )}

      {/* ====== RESUME DRAWER ====== */}
      {/* Backdrop */}
      {resumeOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] transition-opacity"
          onClick={() => setResumeOpen(false)}
        />
      )}
      {/* Slide-over panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-2xl border-l border-gray-200 transition-transform duration-300 ease-in-out ${
          resumeOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ width: '820px', maxWidth: '95vw' }}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50/60 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              {candidate?.first_name} {candidate?.last_name}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Resume</p>
          </div>
          <div className="flex items-center gap-2">
            {candidate?.resume_url && (
              <a
                href={candidate.resume_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 bg-white rounded-md px-2.5 py-1.5 hover:border-gray-300 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                Download
              </a>
            )}
            <button
              onClick={() => setResumeOpen(false)}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
              title="Close"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Drawer body — iframe fills remaining height */}
        <div className="flex-1 overflow-hidden">
          {candidate?.resume_url ? (
            <iframe
              src={`${candidate.resume_url}#toolbar=0&navpanes=0&scrollbar=1`}
              className="w-full h-full border-0 bg-white"
              title="Resume Preview"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <svg className="w-14 h-14 text-gray-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <p className="text-sm font-medium text-gray-500 mb-1">No resume uploaded</p>
              <p className="text-xs text-gray-400 mb-4">PDF only, max 10MB</p>
              <ResumeUploadButton
                candidateId={candidate?.id}
                orgId={organization!.id}
                onUploadComplete={(url) => {
                  setApplication((prev: AnyData | null) =>
                    prev ? { ...prev, candidate: { ...prev.candidate, resume_url: url } } : prev
                  )
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Application</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting {candidate?.first_name}&apos;s application for {job?.title}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Rejection Reason</Label>
            <Textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter the reason for rejection..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={rejecting || !rejectReason.trim()}>
              {rejecting ? 'Rejecting...' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ====== Resume Upload Button (used in drawer empty state) ====== */

function ResumeUploadButton({
  candidateId, orgId, onUploadComplete,
}: {
  candidateId: string
  orgId: string
  onUploadComplete: (url: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') { setError('Only PDF files are allowed'); return }
    if (file.size > MAX_FILE_SIZE) { setError('File size must be under 10MB'); return }
    setUploading(true)
    setError(null)
    const supabase = createClient()
    const filePath = `${orgId}/${candidateId}/resume.pdf`
    const { error: uploadError } = await supabase.storage.from('resumes').upload(filePath, file, { upsert: true })
    if (uploadError) { setError(uploadError.message); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('resumes').getPublicUrl(filePath)
    const { error: updateError } = await updateCandidate(supabase, candidateId, orgId, { resume_url: publicUrl })
    if (!updateError) onUploadComplete(publicUrl)
    else setError(updateError.message)
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleUpload} className="hidden" />
      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
        {uploading ? 'Uploading...' : 'Upload Resume'}
      </Button>
    </div>
  )
}

/* ====== Helper Components ====== */

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="text-gray-500 text-xs uppercase tracking-wide">{label}</span>
      <p className="font-medium mt-0.5">{value || <span className="text-gray-300">-</span>}</p>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function LinkField({ label, url, text }: { label: string; url: string | null | undefined; text: string }) {
  return (
    <div>
      <span className="text-gray-500 text-xs uppercase tracking-wide">{label}</span>
      <p className="font-medium mt-0.5">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{text}</a>
        ) : <span className="text-gray-300">-</span>}
      </p>
    </div>
  )
}

/* ====== Assessment Tab Component ====== */

const ASSESSMENT_STATUS_COLORS: Record<string, string> = {
  invited: 'bg-amber-100 text-amber-700',
  started: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  expired: 'bg-gray-100 text-gray-500',
}
const ASSESSMENT_STATUS_LABELS: Record<string, string> = {
  invited: 'Sent',
  started: 'In Progress',
  completed: 'Completed',
  expired: 'Expired',
}

function AssessmentTab({ assessmentInvitations, isActive, canManage, sending, onSend, onSaveScore }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assessmentInvitations: any[]
  isActive: boolean
  canManage: boolean
  sending: boolean
  onSend: (name: string, link: string, instructions: string, expiryDate: string) => void
  onSaveScore: (invitationId: string, score: number) => void
}) {
  const [name, setName] = useState('')
  const [link, setLink] = useState('')
  const [instructions, setInstructions] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({})
  const [savingScore, setSavingScore] = useState<Record<string, boolean>>({})

  async function handleScoreSave(invId: string) {
    const n = parseFloat(scoreInputs[invId] || '')
    if (isNaN(n) || n < 0 || n > 100) return
    setSavingScore((prev) => ({ ...prev, [invId]: true }))
    await onSaveScore(invId, n)
    setSavingScore((prev) => ({ ...prev, [invId]: false }))
  }

  function handleSend() {
    if (!link.trim()) return
    onSend(name, link, instructions, expiryDate)
    setName('')
    setLink('')
    setInstructions('')
    setExpiryDate('')
  }

  const STATUS_BORDER: Record<string, string> = {
    invited: 'border-l-amber-400',
    started: 'border-l-blue-400',
    completed: 'border-l-emerald-400',
    expired: 'border-l-slate-300',
  }

  const hasHistory = assessmentInvitations.length > 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

      {/* ── LEFT: Send Form ── */}
      <div className="lg:col-span-3 space-y-6">
        {isActive && canManage && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">
                {!hasHistory ? 'Send Assessment' : 'Send Another Assessment'}
              </h3>
              <p className="text-sm text-gray-500 mt-1">Send an online assessment link to this candidate via email.</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Assessment Name</Label>
                  <input
                    type="text"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="e.g. Technical Round 1"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Expiry Date</Label>
                  <input
                    type="date"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Assessment Link <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                  <input
                    type="url"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="https://your-platform.com/test/..."
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Instructions for Candidate</Label>
                <Textarea
                  rows={2}
                  className="resize-none"
                  placeholder="Optional preparation notes or guidelines..."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </div>

              <Button onClick={handleSend} disabled={sending || !link.trim()} className="gap-1.5">
                {sending ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Sending…
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                    Send Assessment Email
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Empty state (no history, read-only) */}
        {!hasHistory && (!isActive || !canManage) && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="py-12 text-center">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
              <p className="text-sm text-gray-500">No assessments sent yet</p>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT: History Sidebar ── */}
      <div className="lg:col-span-2">
        <div className="lg:sticky lg:top-6 space-y-3">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">Assessment History</h3>
                {hasHistory && (
                  <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {assessmentInvitations.length}
                  </span>
                )}
              </div>
            </div>
            <div className="p-0">
              {hasHistory ? (
                <div className="divide-y divide-gray-100">
                  {assessmentInvitations.map((inv) => {
                    const statusColor = ASSESSMENT_STATUS_COLORS[inv.status] || 'bg-gray-100 text-gray-700'
                    const statusLabel = ASSESSMENT_STATUS_LABELS[inv.status] || inv.status
                    const borderColor = STATUS_BORDER[inv.status] || 'border-l-gray-300'

                    return (
                      <div key={inv.id} className={`px-5 py-4 border-l-4 ${borderColor} first:rounded-none last:rounded-b-lg`}>
                        {/* Header row */}
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm font-semibold text-gray-900 truncate">
                                {inv.assessment_name || 'Assessment'}
                              </p>
                              <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusColor}`}>
                                {statusLabel}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {new Date(inv.sent_at || inv.invited_at).toLocaleDateString()}
                              {inv.expiry_date && (
                                <span className="ml-1.5 text-amber-500">· exp {new Date(inv.expiry_date).toLocaleDateString()}</span>
                              )}
                            </p>
                          </div>
                          {inv.score != null && (
                            <div className="shrink-0 w-10 h-10 rounded-full border-2 border-green-200 bg-green-50 flex items-center justify-center">
                              <span className="text-xs font-bold text-green-700 leading-none">{Math.round(inv.score)}</span>
                            </div>
                          )}
                        </div>

                        {/* Link */}
                        {inv.assessment_link && (
                          <a
                            href={inv.assessment_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mb-2"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                            Open link
                          </a>
                        )}

                        {/* Instructions */}
                        {inv.instructions && (
                          <p className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1.5 mb-2 whitespace-pre-wrap">
                            {inv.instructions}
                          </p>
                        )}

                        {/* Score entry */}
                        {canManage && inv.status !== 'completed' && (
                          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                            <span className="text-[11px] text-gray-400">Score</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              className="h-7 w-16 rounded-md border border-input bg-transparent px-2 text-xs text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              placeholder="0–100"
                              value={scoreInputs[inv.id] || ''}
                              onChange={(e) => setScoreInputs((prev) => ({ ...prev, [inv.id]: e.target.value }))}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs px-2"
                              onClick={() => handleScoreSave(inv.id)}
                              disabled={savingScore[inv.id] || !scoreInputs[inv.id]}
                            >
                              {savingScore[inv.id] ? '…' : 'Save'}
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="px-5 pb-5 text-center">
                  <svg className="w-8 h-8 mx-auto text-gray-200 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-gray-400">No assessments sent yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
