'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getApplicationById, moveApplication, hireApplication } from '@/lib/services/applications'
import { updateCandidate } from '@/lib/services/candidates'
import { CANDIDATE_SOURCES, MAX_FILE_SIZE } from '@/lib/constants'
import { getComments, addComment, deleteComment } from '@/lib/services/comments'
import { EDUCATION_LABELS, GENDER_OPTIONS, NOTICE_PERIOD_OPTIONS } from '@/lib/validators/candidate'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
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
  const { user, organization, isLoading: userLoading } = useUser()
  const { canManageCandidates, isInterviewer, canSendWhatsApp } = useRole()
  const [application, setApplication] = useState<AnyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      const supabase = createClient()
      const commentsResult = await getComments(supabase, organization.id, 'application', data.id)
      setNotes(commentsResult.data || [])
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
        await loadApplication()
      }
    } catch {
      setError('Failed to send assessment')
    }
    setSendingAssessment(false)
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
  const completedInterviews = interviews.filter((iv: AnyData) => iv.status === 'completed')
  const nextRoundNumber = completedInterviews.length + 1
  const sourceLabel = CANDIDATE_SOURCES.find((s) => s.value === candidate?.source)?.label ?? candidate?.source
  const educationLabel = candidate?.education ? (EDUCATION_LABELS[candidate.education] || candidate.education) : null
  const genderLabel = candidate?.gender ? (GENDER_OPTIONS.find((g: AnyData) => g.value === candidate.gender)?.label || candidate.gender) : null
  const noticeLabel = candidate?.notice_period ? (NOTICE_PERIOD_OPTIONS.find((n: AnyData) => n.value === candidate.notice_period)?.label || candidate.notice_period) : null
  const parsedResume = candidate?.resume_parsed_data && Object.keys(candidate.resume_parsed_data).length > 0 ? candidate.resume_parsed_data : null

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
              <Badge className={`text-xs ${STATUS_COLORS[application.status] || 'bg-gray-100 text-gray-800'}`}>
                {application.status}
              </Badge>
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
      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="personal">Personal Details</TabsTrigger>
          <TabsTrigger value="resume">Resume</TabsTrigger>
          <TabsTrigger value="assessment">
            Assessment
            {assessmentInvitations.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1.5">
                {assessmentInvitations.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="interview">
            Interviews
            {interviews.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1.5">{interviews.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="offer">
            Offer & Hire
            {application.offer_letters?.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1.5">{application.offer_letters.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="notes">
            Notes
            {notes.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1.5">{notes.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ============ TAB 1: Personal Details ============ */}
        <TabsContent value="personal" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* ====== LEFT COLUMN — Detail Cards ====== */}
            <div className="lg:col-span-3 space-y-6">
              {/* Personal Info */}
              <Card className="shadow-sm">
                <CardHeader><CardTitle className="text-base">Personal Information</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-y-4 text-sm">
                    <InfoField label="Full Name" value={`${candidate?.first_name || ''} ${candidate?.last_name || ''}`} />
                    <InfoField label="Email" value={candidate?.email} />
                    <InfoField label="Phone" value={candidate?.phone} />
                    <InfoField label="Location" value={candidate?.location} />
                    <InfoField label="Gender" value={genderLabel} />
                    <InfoField label="Date of Birth" value={candidate?.date_of_birth ? new Date(candidate.date_of_birth).toLocaleDateString() : null} />
                    <InfoField label="Source" value={sourceLabel} />
                  </div>
                </CardContent>
              </Card>

              {/* Professional Details */}
              <Card className="shadow-sm">
                <CardHeader><CardTitle className="text-base">Professional Details</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-y-4 text-sm">
                    <InfoField label="Current Company" value={candidate?.current_company} />
                    <InfoField label="Current Title" value={candidate?.current_title} />
                    <InfoField label="Experience" value={candidate?.experience_years != null ? `${candidate.experience_years} years` : null} />
                    <InfoField label="Notice Period" value={noticeLabel} />
                    <InfoField label="Highest Education" value={educationLabel} />
                    <LinkField label="LinkedIn" url={candidate?.linkedin_url} text="Profile" />
                    <LinkField label="Portfolio" url={candidate?.portfolio_url} text="Website" />
                  </div>
                </CardContent>
              </Card>

              {/* Compensation */}
              <Card className="shadow-sm">
                <CardHeader><CardTitle className="text-base">Compensation</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-y-4 text-sm">
                    <InfoField label="Current Salary (Annual)" value={candidate?.current_salary != null ? `₹${Number(candidate.current_salary).toLocaleString()}` : null} />
                    <InfoField label="Expected Salary (Annual)" value={candidate?.expected_salary != null ? `₹${Number(candidate.expected_salary).toLocaleString()}` : null} />
                  </div>
                </CardContent>
              </Card>

              {/* Cover Letter */}
              {candidate?.cover_letter && (
                <Card className="shadow-sm">
                  <CardHeader><CardTitle className="text-base">Cover Letter</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{candidate.cover_letter}</p>
                  </CardContent>
                </Card>
              )}

              {/* Notes */}
              {candidate?.notes && (
                <Card className="shadow-sm">
                  <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{candidate.notes}</p>
                  </CardContent>
                </Card>
              )}

              {/* AI Parsed Resume Data */}
              {parsedResume && (
                <Card className="shadow-sm">
                  <CardHeader><CardTitle className="text-base">AI-Parsed Resume Data</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {parsedResume.summary && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-1">Summary</h4>
                        <p className="text-sm text-gray-600">{parsedResume.summary}</p>
                      </div>
                    )}
                    {parsedResume.skills?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Skills</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {parsedResume.skills.map((skill: string) => (
                            <span key={skill} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">{skill}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {parsedResume.experience?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Experience</h4>
                        <div className="space-y-3">
                          {parsedResume.experience.map((exp: AnyData, i: number) => (
                            <div key={i} className="border-l-2 border-indigo-200 pl-3">
                              <p className="text-sm font-medium">{exp.title}</p>
                              <p className="text-xs text-gray-500">{exp.company}{exp.duration ? ` | ${exp.duration}` : ''}</p>
                              {exp.description && <p className="text-xs text-gray-600 mt-1">{exp.description}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {parsedResume.education?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Education</h4>
                        <div className="space-y-2">
                          {parsedResume.education.map((edu: AnyData, i: number) => (
                            <div key={i} className="border-l-2 border-green-200 pl-3">
                              <p className="text-sm font-medium">{edu.degree}</p>
                              <p className="text-xs text-gray-500">{edu.institution}{edu.year ? ` | ${edu.year}` : ''}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* ====== RIGHT COLUMN — Overview Sidebar ====== */}
            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-6 space-y-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
                {/* Overview Card */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold">Overview</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
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

                    {/* Resume link */}
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Resume</h4>
                      {candidate?.resume_url ? (
                        <a
                          href={candidate.resume_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                          Download Resume
                        </a>
                      ) : (
                        <p className="text-sm text-gray-400">No resume uploaded</p>
                      )}
                    </div>

                    <Separator />

                    {/* Links */}
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Links</h4>
                      <div className="space-y-1.5">
                        {candidate?.linkedin_url ? (
                          <a href={candidate.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                            LinkedIn Profile
                          </a>
                        ) : (
                          <p className="text-sm text-gray-400">No LinkedIn</p>
                        )}
                        {candidate?.portfolio_url && (
                          <a href={candidate.portfolio_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" /></svg>
                            Portfolio Website
                          </a>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Quick Actions Card */}
                {isActive && canManageCandidates && (
                  <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button className="w-full justify-start" size="sm" variant="outline" onClick={() => setScheduleOpen(true)}>
                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                        Schedule Interview
                      </Button>
                      <Button className="w-full justify-start" size="sm" variant="outline" onClick={() => router.push(`/offers/new?applicationId=${application.id}`)}>
                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                        Create Offer
                      </Button>
                      <Button className="w-full justify-start" size="sm" variant="outline" onClick={() => setEmailOpen(true)}>
                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                        Send Email
                      </Button>
                      {candidate?.phone && (
                        <Button className="w-full justify-start text-green-700" size="sm" variant="outline" onClick={() => setWhatsappOpen(true)}>
                          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                          Send WhatsApp
                        </Button>
                      )}
                      <Link href={`/candidates/${candidate?.id}`} className="block">
                        <Button className="w-full justify-start" size="sm" variant="outline">
                          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                          View Full Profile
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ============ TAB 2: Resume ============ */}
        <TabsContent value="resume" className="mt-6">
          <ResumeSection
            candidateId={candidate?.id}
            orgId={organization!.id}
            resumeUrl={candidate?.resume_url}
            onUploadComplete={(url) => {
              setApplication((prev: AnyData | null) => prev ? { ...prev, candidate: { ...prev.candidate, resume_url: url } } : prev)
            }}
          />
        </TabsContent>

        {/* ============ TAB 2.5: Assessment ============ */}
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
                Schedule Round {nextRoundNumber}
              </Button>
            </div>
          )}

          {interviews.length === 0 ? (
            <Card className="shadow-sm">
              <CardContent className="py-12 text-center">
                <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                <p className="text-gray-500 text-sm">No interviews scheduled yet</p>
                {isActive && canManageCandidates && (
                  <Button className="mt-4" onClick={() => setScheduleOpen(true)}>
                    Schedule First Interview
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {interviews.map((iv: AnyData, idx: number) => {
                const typeLabel = INTERVIEW_TYPES_MAP[iv.interview_type] || iv.interview_type
                const feedback = iv.interview_feedback?.[0]
                const hasFeedback = feedback != null

                return (
                  <Card key={iv.id} className="shadow-sm">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm">Round {idx + 1}: {typeLabel}</h3>
                            <Badge className={`text-[10px] ${INTERVIEW_STATUS_COLORS[iv.status] || 'bg-gray-100 text-gray-800'}`}>
                              {iv.status}
                            </Badge>
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
                              <Badge key={p.id} variant="outline" className="text-[10px]">
                                {userNames[p.user_id] || p.user_id?.slice(0, 8)}
                              </Badge>
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
                            <Badge variant="outline" className="text-[10px]">
                              {feedback.recommendation}
                            </Badge>
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
                    </CardContent>
                  </Card>
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
                <Card key={offer.id} className="shadow-sm">
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm">
                            {offer.salary_currency} {Number(offer.salary).toLocaleString()}
                          </h3>
                          <Badge className={`text-[10px] ${OFFER_STATUS_COLORS[offer.status] || 'bg-gray-100 text-gray-800'}`}>
                            {offer.status}
                          </Badge>
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
                    {/* Action buttons for sent offers */}
                    {offer.status === 'sent' && canManageCandidates && (
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
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="shadow-sm">
              <CardContent className="py-12 text-center">
                <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <p className="text-gray-500 text-sm">No offers created yet</p>
                {isActive && canManageCandidates && (
                  <Button className="mt-4" onClick={() => router.push(`/offers/new?applicationId=${application.id}`)}>
                    Create Offer
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Hire / Reject Actions */}
          {isActive && canManageCandidates && phase !== 'DECIDED' && (
            <Card className="shadow-sm">
              <CardHeader><CardTitle className="text-base">Decision</CardTitle></CardHeader>
              <CardContent className="space-y-3">
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
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ============ TAB 5: Notes ============ */}
        <TabsContent value="notes" className="mt-6">
          <div className="max-w-2xl space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Candidate Notes</CardTitle>
                <p className="text-sm text-gray-500">
                  Internal notes about {candidate?.first_name} {candidate?.last_name} for this application. Only visible to your team.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {canManageCandidates && (
                  <div className="space-y-2">
                    <Textarea
                      rows={3}
                      placeholder="Add a note about this candidate..."
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote()
                      }}
                    />
                    {noteError && <p className="text-xs text-red-600">{noteError}</p>}
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={handleAddNote}
                        disabled={addingNote || !noteInput.trim()}
                      >
                        {addingNote ? 'Adding...' : 'Add Note'}
                      </Button>
                    </div>
                  </div>
                )}

                <Separator />

                {notes.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <svg className="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                    <p className="text-sm">No notes yet</p>
                    <p className="text-xs mt-1">Add your first note above</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {notes.map((note) => (
                      <div key={note.id} className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-gray-800 whitespace-pre-wrap flex-1">{note.content}</p>
                          {user?.id === note.user_id && (
                            <button
                              onClick={() => handleDeleteNote(note.id)}
                              className="text-gray-400 hover:text-red-500 transition-colors shrink-0 mt-0.5"
                              title="Delete note"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1.5">
                          {new Date(note.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
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
          onSuccess={loadApplication}
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

/* ====== Resume Section (inline, with upload + PDF viewer) ====== */

function ResumeSection({
  candidateId, orgId, resumeUrl, onUploadComplete,
}: {
  candidateId: string
  orgId: string
  resumeUrl?: string | null
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
    if (updateError) { setError(updateError.message) } else { onUploadComplete(publicUrl) }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Resume</CardTitle>
          <div className="flex gap-2">
            {resumeUrl && (
              <a
                href={resumeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                Download
              </a>
            )}
            <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleUpload} className="hidden" />
            <Button variant="outline" size="sm" className="text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading...' : resumeUrl ? 'Replace' : 'Upload'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && <div className="bg-red-50 text-red-700 text-sm p-2 rounded mb-3">{error}</div>}
        {resumeUrl ? (
          <iframe
            src={`${resumeUrl}#toolbar=0&navpanes=0&scrollbar=1`}
            className="w-full rounded-lg border bg-white"
            style={{ height: '600px' }}
            title="Resume Preview"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-gray-200 rounded-lg">
            <svg className="w-10 h-10 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p className="text-sm text-gray-400">No resume uploaded</p>
            <p className="text-xs text-gray-300 mt-0.5">PDF only, max 10MB</p>
          </div>
        )}
      </CardContent>
    </Card>
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
    // Reset form after send
    setName('')
    setLink('')
    setInstructions('')
    setExpiryDate('')
  }

  return (
    <div className="space-y-6">
      {/* Create New Assessment — always visible when active */}
      {isActive && canManage && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              {assessmentInvitations.length === 0 ? 'Send Assessment' : 'Send Another Assessment'}
            </CardTitle>
            <p className="text-sm text-gray-500">
              Send an online assessment link to this candidate via email.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 max-w-lg">
            <div className="space-y-2">
              <Label>Assessment Name</Label>
              <input
                type="text"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="e.g. Technical Round 1, Aptitude Test..."
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Assessment Link <span className="text-red-500">*</span></Label>
              <input
                type="url"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="https://your-assessment-platform.com/test/..."
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Expiry Date</Label>
              <input
                type="date"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Instructions for Candidate</Label>
              <Textarea
                rows={3}
                placeholder="Optional instructions or notes for the candidate..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </div>
            <Button onClick={handleSend} disabled={sending || !link.trim()}>
              {sending ? 'Sending...' : 'Send Assessment Email'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* List of sent assessments */}
      {assessmentInvitations.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Sent Assessments ({assessmentInvitations.length})
          </h3>
          {assessmentInvitations.map((inv) => {
            const statusColor = ASSESSMENT_STATUS_COLORS[inv.status] || 'bg-gray-100 text-gray-700'
            const statusLabel = ASSESSMENT_STATUS_LABELS[inv.status] || inv.status

            return (
              <Card key={inv.id} className="shadow-sm">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-sm">
                          {inv.assessment_name || 'Assessment'}
                        </h4>
                        <Badge className={`text-xs ${statusColor}`}>{statusLabel}</Badge>
                      </div>
                      <p className="text-xs text-gray-500">
                        Sent on {new Date(inv.sent_at || inv.invited_at).toLocaleDateString()}
                        {inv.expiry_date && ` · Expires ${new Date(inv.expiry_date).toLocaleDateString()}`}
                      </p>
                    </div>
                    {inv.score != null && (
                      <span className="text-2xl font-bold text-green-700">{Math.round(inv.score)}%</span>
                    )}
                  </div>

                  {inv.assessment_link && (
                    <a
                      href={inv.assessment_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-sm text-blue-600 hover:underline truncate"
                    >
                      {inv.assessment_link}
                    </a>
                  )}

                  {inv.instructions && (
                    <p className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded p-2">
                      {inv.instructions}
                    </p>
                  )}

                  {inv.completed_at && (
                    <p className="text-xs text-gray-500">
                      Scored on {new Date(inv.completed_at).toLocaleDateString()}
                    </p>
                  )}

                  {canManage && inv.status !== 'completed' && (
                    <div className="border-t pt-3 space-y-1.5">
                      <Label className="text-xs font-medium text-gray-600">Enter Score (0–100)</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className="flex h-8 w-24 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          placeholder="e.g. 78"
                          value={scoreInputs[inv.id] || ''}
                          onChange={(e) =>
                            setScoreInputs((prev) => ({ ...prev, [inv.id]: e.target.value }))
                          }
                        />
                        <Button
                          size="sm"
                          className="h-8"
                          onClick={() => handleScoreSave(inv.id)}
                          disabled={savingScore[inv.id] || !scoreInputs[inv.id]}
                        >
                          {savingScore[inv.id] ? 'Saving...' : 'Save Score'}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Empty state when no assessments and not active/manager */}
      {assessmentInvitations.length === 0 && (!isActive || !canManage) && (
        <Card className="shadow-sm">
          <CardContent className="py-12 text-center">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
            <p className="text-gray-500 text-sm">No assessments sent yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
