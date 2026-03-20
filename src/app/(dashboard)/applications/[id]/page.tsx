'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getApplicationById, moveApplication, hireApplication, assignRecruiter } from '@/lib/services/applications'
import { getJobRecruiters } from '@/lib/services/jobs'
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
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScheduleInterviewDialog } from '@/app/(dashboard)/jobs/[id]/applications/schedule-interview-dialog'
import { SendEmailDialog } from '@/components/email/send-email-dialog'
import { SendWhatsAppDialog } from '@/components/whatsapp/send-whatsapp-dialog'
import { InterviewFeedbackDialog } from '@/app/(dashboard)/jobs/[id]/applications/interview-feedback-dialog'
import { logActivity } from '@/lib/services/activity'
import { fetchApplicationActivities } from '../actions'
import { ActivityTimeline } from '@/components/shared/activity-timeline'
import { resolveUserNames } from '@/app/(dashboard)/interviews/actions'
import {
  ArrowLeft, Mail, MessageSquare, FileText, UserCircle, Calendar, Link as LinkIcon,
  Download, X, Eye, Plus, Trash2, CheckCircle2, XCircle, Clock, ChevronDown,
  ClipboardList, Loader2, PenLine, Info, ExternalLink,
  User, MoreHorizontal,
} from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = Record<string, any>

interface PipelineStage {
  id: string
  name: string
  stage_type: string
  display_order: number
}

const INTERVIEW_TYPES_MAP: Record<string, string> = {
  video: 'Online Video',
  onsite: 'Offline Face to Face',
  phone: 'Phone Screen',
  technical: 'Technical',
  cultural: 'Cultural Fit',
}

const INTERVIEW_STATUS_DOT: Record<string, string> = {
  scheduled: 'bg-blue-500',
  completed: 'bg-emerald-500',
  cancelled: 'bg-gray-400',
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

const STATUS_DOT_COLORS: Record<string, string> = {
  active: 'bg-emerald-500',
  withdrawn: 'bg-gray-400',
  rejected: 'bg-rose-500',
  hired: 'bg-emerald-500',
}

const STATUS_PILL_COLORS: Record<string, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  withdrawn: 'border-gray-200 bg-gray-50 text-gray-600',
  rejected: 'border-rose-200 bg-rose-50 text-rose-700',
  hired: 'border-emerald-200 bg-emerald-50 text-emerald-700',
}

const OFFER_STATUS_DOT: Record<string, string> = {
  draft: 'bg-gray-400',
  sent: 'bg-blue-500',
  accepted: 'bg-emerald-500',
  declined: 'bg-rose-500',
  revoked: 'bg-rose-500',
  expired: 'bg-amber-500',
}

const OFFER_STATUS_PILL: Record<string, string> = {
  draft: 'border-gray-200 bg-gray-50 text-gray-600',
  sent: 'border-blue-200 bg-blue-50 text-blue-700',
  accepted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  declined: 'border-rose-200 bg-rose-50 text-rose-700',
  revoked: 'border-rose-200 bg-rose-50 text-rose-700',
  expired: 'border-amber-200 bg-amber-50 text-amber-700',
}

// Hash-based gradient for avatar
const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-violet-500 to-purple-600',
  'from-pink-500 to-rose-600',
  'from-amber-500 to-orange-600',
  'from-emerald-500 to-teal-600',
  'from-cyan-500 to-blue-600',
  'from-fuchsia-500 to-pink-600',
  'from-lime-500 to-green-600',
]

function getAvatarGradient(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]
}

export default function ApplicationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'personal')
  const { user, organization, isLoading: userLoading } = useUser()
  const { canManageCandidates, isInterviewer, canSendWhatsApp, isAdmin } = useRole()
  const [application, setApplication] = useState<AnyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Resume drawer
  const [resumeOpen, setResumeOpen] = useState(false)

  // Action dialogs
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [expandedFeedback, setExpandedFeedback] = useState<Record<string, boolean>>({})
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

  // Activity log state
  const [activityLogs, setActivityLogs] = useState<AnyData[]>([])
  const [activityLoading, setActivityLoading] = useState(false)

  // Recruiter assignment
  const [jobRecruiterIds, setJobRecruiterIds] = useState<string[]>([])
  const [recruiterNames, setRecruiterNames] = useState<Record<string, string>>({})

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

      // Load activity logs
      setActivityLoading(true)
      const { data: activities } = await fetchApplicationActivities(organization.id, data.id, data.candidate_id)
      setActivityLogs(activities || [])
      setActivityLoading(false)

      // Load job recruiters for assignment dropdown
      if (data.job?.id) {
        const supabase4 = createClient()
        const rIds = await getJobRecruiters(supabase4, data.job.id)
        setJobRecruiterIds(rIds)
        if (rIds.length > 0) {
          const rNames = await resolveUserNames(rIds)
          setRecruiterNames(rNames)
        }
      }
    }
    setLoading(false)
  }, [organization, params.id])

  useEffect(() => {
    if (!organization) return
    loadApplication()
  }, [organization, loadApplication])

  async function handleReject(sendEmail: boolean) {
    if (!organization || !user || !application) return
    setRejecting(true)
    try {
      const res = await fetch('/api/applications/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: application.id,
          reason: rejectReason,
          sendEmail,
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
      logActivity(supabase, organization.id, user.id, 'application', application.id, 'application_hired', {
        candidate_name: `${application.candidate?.first_name} ${application.candidate?.last_name}`,
        job_title: application.job?.title,
      }).catch(() => {})
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
      logActivity(supabase, organization.id, user.id, 'application', application.id, 'stage_changed', {
        to_stage: targetStage?.name,
        to_stage_id: newStageId,
        candidate_name: `${application.candidate?.first_name} ${application.candidate?.last_name}`,
      }).catch(() => {})
      await loadApplication()
    }
  }

  async function handleRecruiterChange(recruiterId: string) {
    if (!organization || !application) return
    const newId = recruiterId === 'unassigned' ? null : recruiterId
    if (newId === (application.assigned_recruiter_id || null)) return
    const supabase = createClient()
    const { error: assignError } = await assignRecruiter(supabase, application.id, organization.id, newId)
    if (assignError) {
      setError(assignError.message)
    } else {
      setApplication((prev: AnyData | null) => prev ? { ...prev, assigned_recruiter_id: newId } : prev)
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
  const candidateFullName = `${candidate?.first_name || ''} ${candidate?.last_name || ''}`.trim()
  const avatarGradient = getAvatarGradient(candidateFullName || 'U')

  return (
    <div className="max-w-6xl space-y-6">
      {/* Back + Header */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="px-6 py-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${avatarGradient} text-white flex items-center justify-center text-[13px] font-semibold shadow-sm`}>
                {candidate?.first_name?.[0]}{candidate?.last_name?.[0]}
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-[15px] font-semibold text-gray-900">
                    {candidate?.first_name} {candidate?.last_name}
                  </h1>
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${STATUS_PILL_COLORS[application.status] || 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT_COLORS[application.status] || 'bg-gray-400'}`} />
                    {application.status}
                  </span>
                </div>
                <p className="text-[12px] text-gray-500 mt-0.5">
                  Applied for{' '}
                  <Link href={`/jobs/${job?.id}`} className="text-gray-900 hover:underline font-medium">
                    {job?.title || 'Unknown Job'}
                  </Link>
                  {job?.department && <span className="text-gray-400"> &middot; {job.department}</span>}
                </p>
              </div>
            </div>

            {/* Header actions */}
            <div className="flex items-center gap-2">
              {canManageCandidates && (
                <Button size="sm" className="gap-1.5 bg-gray-900 hover:bg-gray-800 text-white h-8 text-[12px]" onClick={() => setEmailOpen(true)}>
                  <Mail className="w-3.5 h-3.5" />
                  Email
                </Button>
              )}
              {canSendWhatsApp && candidate?.phone && (
                <Button size="sm" variant="outline" onClick={() => setWhatsappOpen(true)} className="gap-1.5 text-green-700 border-green-200 hover:bg-green-50 h-8 text-[12px]">
                  <MessageSquare className="w-3.5 h-3.5" />
                  WhatsApp
                </Button>
              )}
              {isActive && canManageCandidates && (
                <Button size="sm" variant="outline" className="gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50 h-8 text-[12px]" onClick={() => setRejectOpen(true)}>
                  <XCircle className="w-3.5 h-3.5" />
                  Reject
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {job?.id && (
                    <DropdownMenuItem asChild>
                      <Link href={`/jobs/${job.id}`} className="flex items-center gap-2 text-[12px]">
                        <FileText className="w-3.5 h-3.5 text-gray-500" />
                        View Job Description
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {canManageCandidates && (
                    <DropdownMenuItem asChild>
                      <Link href={`/candidates/${candidate?.id}`} className="flex items-center gap-2 text-[12px]">
                        <UserCircle className="w-3.5 h-3.5 text-gray-500" />
                        View Candidate Profile
                      </Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Stage + Recruiter selectors */}
          {isActive && canManageCandidates && stages.length > 0 && (
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Stage</span>
                <Select value={application.current_stage?.id || ''} onValueChange={handleStageChange}>
                  <SelectTrigger className="h-7 w-[180px] text-[12px] rounded-lg border-gray-200">
                    <SelectValue placeholder="Move stage..." />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.filter((s) => s.stage_type !== 'hired' && s.stage_type !== 'rejected').map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-[12px]">{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isAdmin && jobRecruiterIds.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Assigned</span>
                  <Select value={application.assigned_recruiter_id || 'unassigned'} onValueChange={handleRecruiterChange}>
                    <SelectTrigger className="h-7 w-[180px] text-[12px] rounded-lg border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned" className="text-[12px]">Unassigned</SelectItem>
                      {jobRecruiterIds.map((rid) => (
                        <SelectItem key={rid} value={rid} className="text-[12px]">
                          {recruiterNames?.[rid] ?? rid.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-[12px] p-3 rounded-xl flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ====== TABS ====== */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start bg-transparent border-b border-gray-200 rounded-none p-0 h-auto">
          <TabsTrigger value="personal" className="text-[12px] data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-gray-900 rounded-none pb-2.5 pt-1 px-4">
            Personal Details
          </TabsTrigger>
          <TabsTrigger value="assessment" className="text-[12px] data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-gray-900 rounded-none pb-2.5 pt-1 px-4">
            Assessment
            {assessmentInvitations.length > 0 && (
              <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-900 text-white">
                {assessmentInvitations.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="interview" className="text-[12px] data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-gray-900 rounded-none pb-2.5 pt-1 px-4">
            Interviews
            {interviews.length > 0 && (
              <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-900 text-white">{interviews.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="offer" className="text-[12px] data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-gray-900 rounded-none pb-2.5 pt-1 px-4">
            Offer & Hire
            {application.offer_letters?.length > 0 && (
              <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-900 text-white">{application.offer_letters.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="notes" className="text-[12px] data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-gray-900 rounded-none pb-2.5 pt-1 px-4">
            Notes
            {notes.length > 0 && (
              <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-900 text-white">{notes.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="activity" className="text-[12px] data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-gray-900 rounded-none pb-2.5 pt-1 px-4">
            Activity
            {activityLogs.length > 0 && (
              <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-900 text-white">{activityLogs.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ============ TAB 1: Personal Details ============ */}
        <TabsContent value="personal" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* ====== LEFT COLUMN -- All Details ====== */}
            <div className="lg:col-span-3 space-y-0">
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                {/* Section: Personal */}
                <div className="px-5 py-4 border-b border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Personal</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-[13px]">
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
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-[13px]">
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
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-[13px]">
                    <InfoField label="Current CTC (Annual)" value={candidate?.current_salary != null ? `₹${Number(candidate.current_salary).toLocaleString()}` : null} />
                    <InfoField label="Expected CTC (Annual)" value={candidate?.expected_salary != null ? `₹${Number(candidate.expected_salary).toLocaleString()}` : null} />
                  </div>
                </div>
                {/* Cover Letter */}
                {candidate?.cover_letter && (
                  <div className="px-5 py-4 border-b border-gray-100">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Cover Letter</p>
                    <p className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed">{candidate.cover_letter}</p>
                  </div>
                )}
                {/* Candidate Notes */}
                {candidate?.notes && (
                  <div className="px-5 py-4 border-b border-gray-100">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Candidate Notes</p>
                    <p className="text-[13px] text-gray-700 whitespace-pre-wrap">{candidate.notes}</p>
                  </div>
                )}
                {/* AI Score & Summary */}
                {matchScore && (
                  <div className="px-5 py-4 border-b border-gray-100">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">AI Match</p>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-[13px] font-bold shrink-0 ${
                        matchScore.overall_score >= 80 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        matchScore.overall_score >= 60 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        matchScore.overall_score >= 40 ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                        'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {matchScore.overall_score}%
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-gray-800 capitalize">{(matchScore.recommendation ?? '').replace(/_/g, ' ')}</p>
                        <div className="flex gap-3 mt-0.5 text-[11px] text-gray-400">
                          <span>Skills {matchScore.skill_score}%</span>
                          <span>Exp {matchScore.experience_score}%</span>
                          <span>Semantic {matchScore.semantic_score}%</span>
                        </div>
                      </div>
                    </div>
                    {matchScore.ai_summary && (
                      <p className="text-[13px] text-gray-600 leading-relaxed">{matchScore.ai_summary}</p>
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
                        className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1 hover:border-gray-300 transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        Download
                      </a>
                    )}
                  </div>
                  {candidate?.resume_url ? (
                    <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50" style={{ height: '700px' }}>
                      <iframe
                        src={candidate.resume_url.toLowerCase().endsWith('.pdf')
                          ? `${candidate.resume_url}#toolbar=0&navpanes=0&scrollbar=1`
                          : `/api/resumes/preview-docx?url=${encodeURIComponent(candidate.resume_url)}`
                        }
                        className="w-full h-full border-0"
                        title="Resume Preview"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-gray-200 rounded-xl bg-white">
                      <FileText className="w-10 h-10 text-gray-200 mb-3" />
                      <p className="text-[13px] text-gray-400 mb-1">No resume uploaded</p>
                      <p className="text-[11px] text-gray-300 mb-3">PDF, DOC, DOCX — max 10MB</p>
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

            {/* ====== RIGHT COLUMN -- Actions + Overview ====== */}
            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-6 space-y-4 max-h-[calc(100vh-3rem)] overflow-y-auto">

                {/* Quick Actions */}
                {isActive && canManageCandidates && (
                  <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="px-5 py-3.5 border-b border-gray-100">
                      <h3 className="text-[12px] font-semibold text-gray-900 uppercase tracking-wide">Quick Actions</h3>
                    </div>
                    <div className="p-4 space-y-1.5">
                      <Button size="sm" variant="outline" className="w-full justify-start gap-2 h-8 text-[12px] rounded-lg" onClick={() => setScheduleOpen(true)}>
                        <Calendar className="w-3.5 h-3.5 text-purple-500" />
                        Schedule Interview
                      </Button>
                      <Link href={`/offers/new?applicationId=${application.id}`} className="block">
                        <Button size="sm" variant="outline" className="w-full justify-start gap-2 h-8 text-[12px] rounded-lg">
                          <FileText className="w-3.5 h-3.5 text-emerald-500" />
                          Create Offer
                        </Button>
                      </Link>
                      <Button size="sm" variant="outline" className="w-full justify-start gap-2 h-8 text-[12px] rounded-lg" onClick={() => setEmailOpen(true)}>
                        <Mail className="w-3.5 h-3.5 text-blue-500" />
                        Send Email
                      </Button>
                      {canSendWhatsApp && candidate?.phone && (
                        <Button size="sm" variant="outline" className="w-full justify-start gap-2 h-8 text-[12px] text-green-700 border-green-200 hover:bg-green-50 rounded-lg" onClick={() => setWhatsappOpen(true)}>
                          <MessageSquare className="w-3.5 h-3.5" />
                          Send WhatsApp
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Overview Card */}
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="px-5 py-3.5 border-b border-gray-100">
                    <h3 className="text-[12px] font-semibold text-gray-900 uppercase tracking-wide">Overview</h3>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="text-[13px] space-y-2.5">
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
                      <h4 className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2">Tags & Skills</h4>
                      {candidate?.tags?.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {candidate.tags.map((tag: string) => (
                            <span key={tag} className="text-[11px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md border border-gray-200">{tag}</span>
                          ))}
                        </div>
                      ) : <p className="text-[13px] text-gray-400">No tags</p>}
                    </div>

                    <Separator />

                    {/* Resume */}
                    <div>
                      <h4 className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2">Resume</h4>
                      {candidate?.resume_url ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] gap-1.5 rounded-lg"
                            onClick={() => setResumeOpen(true)}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            See Resume
                          </Button>
                          <a
                            href={candidate.resume_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-gray-400 hover:text-gray-700 hover:underline"
                          >
                            Download
                          </a>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] text-gray-400">No resume uploaded</p>
                          <Button size="sm" variant="outline" className="h-7 text-[11px] rounded-lg" onClick={() => setResumeOpen(true)}>
                            Upload
                          </Button>
                        </div>
                      )}
                    </div>

                  </div>
                </div>

                {/* View Profile Link */}
                <Link href={`/candidates/${candidate?.id}`} className="block">
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-8 text-[12px] rounded-lg">
                    <User className="w-3.5 h-3.5" />
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
              <h2 className="text-[15px] font-semibold text-gray-900">
                Interviews ({interviews.length})
              </h2>
              <Button onClick={() => setScheduleOpen(true)} className="bg-gray-900 hover:bg-gray-800 text-white text-[12px] h-8 gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Schedule Interview
              </Button>
            </div>
          )}

          {interviews.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl bg-white">
              <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-[13px] text-gray-500 font-medium">No interviews scheduled yet</p>
              <p className="text-[11px] text-gray-400 mt-1">Schedule an interview to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {interviews.map((iv: AnyData, idx: number) => {
                const typeLabel = INTERVIEW_TYPES_MAP[iv.interview_type] || iv.interview_type
                const feedback = iv.interview_feedback?.[0]
                const hasFeedback = feedback != null

                return (
                  <div key={iv.id} className="rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-[13px] text-gray-900">{iv.title || `Round ${idx + 1}`}: {typeLabel}</h3>
                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                              iv.status === 'scheduled' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                              iv.status === 'completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                              'border-gray-200 bg-gray-50 text-gray-600'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${INTERVIEW_STATUS_DOT[iv.status] || 'bg-gray-400'}`} />
                              {iv.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500">
                            {new Date(iv.scheduled_at).toLocaleDateString()} at {new Date(iv.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {iv.duration_minutes && ` (${iv.duration_minutes} min)`}
                          </p>
                          {iv.location && <p className="text-[11px] text-gray-400">{iv.location}</p>}
                          {iv.meeting_link && (
                            <a href={iv.meeting_link} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 hover:underline">
                              Join Meeting
                            </a>
                          )}
                        </div>
                        <Link href={`/interviews/${iv.id}?from=application`}>
                          <Button variant="outline" size="sm" className="text-[11px] h-7 rounded-lg">View Details</Button>
                        </Link>
                      </div>

                      {/* Panelists */}
                      {iv.interview_panelists?.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[11px] text-gray-400 mb-1.5">Panelists</p>
                          <div className="flex flex-wrap gap-1.5">
                            {iv.interview_panelists.map((p: AnyData) => (
                              <span key={p.id} className="text-[10px] font-medium px-2 py-0.5 rounded-md border border-gray-200 bg-gray-50 text-gray-700">
                                {userNames[p.user_id] || p.user_id?.slice(0, 8)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Feedback -- collapsible */}
                      {hasFeedback ? (
                        <div className="mt-3">
                          <button
                            onClick={() => setExpandedFeedback((prev) => ({ ...prev, [iv.id]: !prev[iv.id] }))}
                            className="w-full p-3 bg-gray-50 rounded-lg flex items-center justify-between hover:bg-gray-100 transition-colors border border-gray-100"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-medium text-gray-700">Feedback:</span>
                              <span className="text-amber-500 text-[11px]">
                                {'★'.repeat(feedback.overall_rating)}{'☆'.repeat(5 - feedback.overall_rating)}
                              </span>
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md border border-gray-200 bg-white text-gray-700">
                                {feedback.recommendation}
                              </span>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expandedFeedback[iv.id] ? 'rotate-180' : ''}`} />
                          </button>
                          {expandedFeedback[iv.id] && (
                            <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden">
                              {iv.interview_feedback.map((fb: AnyData) => {
                                const fbDate = fb.submitted_at || fb.created_at
                                return (
                                  <div key={fb.id} className="p-4 space-y-3 border-b border-gray-100 last:border-b-0">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[12px] font-semibold text-gray-800">
                                          {userNames[fb.user_id] || 'Reviewer'}
                                        </span>
                                        <span className="text-amber-500 text-[11px]">
                                          {'★'.repeat(fb.overall_rating || 0)}{'☆'.repeat(5 - (fb.overall_rating || 0))}
                                        </span>
                                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md border border-gray-200 text-gray-700">
                                          {fb.recommendation?.replace(/_/g, ' ')}
                                        </span>
                                      </div>
                                      {fbDate && (
                                        <span className="text-[10px] text-gray-400">
                                          {new Date(fbDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </span>
                                      )}
                                    </div>
                                    {fb.scorecard_ratings?.length > 0 && (
                                      <div>
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Evaluation Criteria</p>
                                        <div className="flex flex-wrap gap-1.5">
                                          {fb.scorecard_ratings.map((cr: AnyData) => (
                                            <span key={cr.id} className="text-[10px] bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-md text-gray-600">
                                              {cr.criteria?.name || 'Criteria'}: <strong>{cr.rating}/5</strong>
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {fb.strengths && (
                                      <div>
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Strengths</p>
                                        <p className="text-[12px] text-gray-700 mt-0.5">{fb.strengths}</p>
                                      </div>
                                    )}
                                    {fb.weaknesses && (
                                      <div>
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Weaknesses</p>
                                        <p className="text-[12px] text-gray-700 mt-0.5">{fb.weaknesses}</p>
                                      </div>
                                    )}
                                    {fb.notes && (
                                      <div>
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Notes</p>
                                        <p className="text-[12px] text-gray-700 mt-0.5">{fb.notes}</p>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      ) : iv.status === 'completed' ? (
                        <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-lg flex items-center justify-between">
                          <span className="text-[11px] text-amber-700">Awaiting feedback</span>
                          <Link href={`/interviews/${iv.id}?from=application`} className="text-[11px] text-blue-600 hover:underline">
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

          {/* View All Feedback button removed -- feedback is now collapsible inside each interview card */}
        </TabsContent>

        {/* ============ TAB 4: Offer & Hire ============ */}
        <TabsContent value="offer" className="mt-6 space-y-6">
          {/* Status banner */}
          {application.status === 'hired' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="font-semibold text-[13px] text-emerald-800">Candidate Hired</p>
                {application.hired_at && (
                  <p className="text-[11px] text-emerald-600">on {new Date(application.hired_at).toLocaleDateString()}</p>
                )}
              </div>
            </div>
          )}

          {/* Offer Letters */}
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-gray-900">
              Offer Letters ({application.offer_letters?.length || 0})
            </h2>
            {isActive && canManageCandidates && (
              <Button onClick={() => router.push(`/offers/new?applicationId=${application.id}`)} className="bg-gray-900 hover:bg-gray-800 text-white text-[12px] h-8 gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Create Offer
              </Button>
            )}
          </div>

          {application.offer_letters?.length > 0 ? (
            <div className="space-y-3">
              {application.offer_letters.map((offer: AnyData) => (
                <div key={offer.id} className="rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-[13px] text-gray-900">
                            {offer.salary_currency} {Number(offer.salary).toLocaleString()}
                          </h3>
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full border ${OFFER_STATUS_PILL[offer.status] || 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${OFFER_STATUS_DOT[offer.status] || 'bg-gray-400'}`} />
                            {offer.status}
                          </span>
                        </div>
                        {offer.sent_at && (
                          <p className="text-[11px] text-gray-500">
                            Sent on {new Date(offer.sent_at).toLocaleDateString()}
                          </p>
                        )}
                        {offer.responded_at && (
                          <p className="text-[11px] text-gray-500">
                            Responded on {new Date(offer.responded_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <Link href={`/offers/${offer.id}?from=application`}>
                        <Button variant="outline" size="sm" className="text-[11px] h-7 rounded-lg">View Offer</Button>
                      </Link>
                    </div>
                    {/* Action buttons for sent/draft offers */}
                    {(offer.status === 'sent' || offer.status === 'draft') && canManageCandidates && (
                      <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                        <span className="text-[11px] text-gray-400 mr-1">Response:</span>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-[11px] h-7 rounded-lg"
                          onClick={() => handleOfferRespond(offer.id, 'accepted')}
                        >
                          Accepted
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[11px] h-7 rounded-lg"
                          onClick={() => handleOfferRespond(offer.id, 'declined')}
                        >
                          Declined
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[11px] h-7 text-rose-600 border-rose-200 hover:bg-rose-50 rounded-lg"
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
            <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl bg-white">
              <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-[13px] text-gray-500 font-medium">No offers created yet</p>
                <p className="text-[11px] text-gray-400 mt-1">Create an offer letter to extend to this candidate</p>
                {isActive && canManageCandidates && (
                  <Button className="mt-4 gap-1.5 bg-gray-900 hover:bg-gray-800 text-white text-[12px]" onClick={() => router.push(`/offers/new?applicationId=${application.id}`)}>
                    <Plus className="w-3.5 h-3.5" />
                    Create Offer
                  </Button>
                )}
            </div>
          )}

          <Separator />

          {/* Hire / Reject Actions */}
          {isActive && canManageCandidates && phase !== 'DECIDED' && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="px-5 py-3.5 border-b border-gray-100">
                <h3 className="text-[13px] font-semibold text-gray-900">Decision</h3>
              </div>
              <div className="p-5 space-y-3">
                {phase === 'OFFER' ? (
                  <p className="text-[12px] text-gray-600">
                    An offer has been extended. You can now mark the candidate as hired or reject the application.
                  </p>
                ) : (
                  <p className="text-[12px] text-gray-600">
                    You can reject this application at any time. To hire, first create and send an offer.
                  </p>
                )}
                <div className="flex gap-2">
                  {phase === 'OFFER' && (
                    <Button className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 text-[12px] h-8" onClick={handleHire}>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Mark as Hired
                    </Button>
                  )}
                  <Button variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50 text-[12px] h-8" onClick={() => setRejectOpen(true)}>
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
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-3">
                  <Textarea
                    rows={4}
                    placeholder="Write a note about this candidate... (Cmd+Enter to submit)"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote()
                    }}
                    className="resize-none text-[13px] rounded-lg"
                  />
                  {noteError && <p className="text-[11px] text-rose-600">{noteError}</p>}
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={handleAddNote}
                      disabled={addingNote || !noteInput.trim()}
                      className="gap-1.5 bg-gray-900 hover:bg-gray-800 text-white text-[12px] h-8"
                    >
                      {addingNote ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          Add Note
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}

              {/* Notes timeline */}
              {notes.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl bg-white">
                  <PenLine className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-[13px] text-gray-500">No notes yet</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Team notes are visible only to your organization</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {notes.map((note, idx) => {
                    const noteUserName = (note.user_email || 'User')
                    const noteGradient = getAvatarGradient(noteUserName)
                    return (
                      <div key={note.id} className="flex gap-3 group">
                        {/* Timeline line */}
                        <div className="flex flex-col items-center">
                          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${noteGradient} text-white flex items-center justify-center text-[11px] font-semibold shrink-0`}>
                            {noteUserName[0].toUpperCase()}
                          </div>
                          {idx < notes.length - 1 && (
                            <div className="w-px flex-1 bg-gray-100 my-1" />
                          )}
                        </div>
                        {/* Content */}
                        <div className={`flex-1 pb-4 ${idx < notes.length - 1 ? '' : ''}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] text-gray-400">
                              {new Date(note.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                            </span>
                            {user?.id === note.user_id && (
                              <button
                                onClick={() => handleDeleteNote(note.id)}
                                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-rose-500 transition-all"
                                title="Delete note"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <p className="text-[13px] text-gray-800 whitespace-pre-wrap leading-relaxed">{note.content}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Info sidebar */}
            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-6 rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-3">
                <div className="flex items-center gap-2 text-[12px] text-gray-500">
                  <Info className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-700">About Notes</span>
                </div>
                <p className="text-[12px] text-gray-500 leading-relaxed">
                  Notes are internal and only visible to your organization team. Use them to track conversations, decisions, or any context about this candidate.
                </p>
                <div className="pt-3 border-t border-gray-100 text-[11px] text-gray-400 space-y-1">
                  <p><span className="font-medium text-gray-600">{notes.length}</span> note{notes.length !== 1 ? 's' : ''} added</p>
                  <p>Tip: Press <kbd className="bg-gray-50 border border-gray-200 rounded px-1 py-0.5 text-[10px] font-mono">Cmd</kbd> + <kbd className="bg-gray-50 border border-gray-200 rounded px-1 py-0.5 text-[10px] font-mono">Enter</kbd> to submit</p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ============ TAB 6: Activity ============ */}
        <TabsContent value="activity" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="px-5 py-3.5 border-b border-gray-100">
                  <h3 className="text-[13px] font-semibold text-gray-900">
                    Activity Timeline
                    {activityLogs.length > 0 && (
                      <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-900 text-white">
                        {activityLogs.length}
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">All actions performed on this application and candidate</p>
                </div>
                <div className="p-5">
                  <ActivityTimeline
                    activities={activityLogs}
                    loading={activityLoading}
                    emptyMessage="No activity recorded yet"
                  />
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-6 rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-3">
                <div className="flex items-center gap-2 text-[12px] text-gray-500">
                  <Info className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-700">About Activity</span>
                </div>
                <p className="text-[12px] text-gray-500 leading-relaxed">
                  This timeline shows all actions performed by your team -- stage changes, interviews scheduled, offers sent, profile updates, and more.
                </p>
                <div className="pt-3 border-t border-gray-100 text-[11px] text-gray-400 space-y-1">
                  <p><span className="font-medium text-gray-600">{activityLogs.length}</span> activit{activityLogs.length !== 1 ? 'ies' : 'y'} recorded</p>
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
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${avatarGradient} text-white flex items-center justify-center text-[11px] font-semibold`}>
              {candidate?.first_name?.[0]}{candidate?.last_name?.[0]}
            </div>
            <div>
              <h2 className="text-[13px] font-semibold text-gray-900">
                {candidate?.first_name} {candidate?.last_name}
              </h2>
              <p className="text-[11px] text-gray-400">Resume</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {candidate?.resume_url && (
              <a
                href={candidate.resume_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800 border border-gray-200 bg-white rounded-lg px-2.5 py-1.5 hover:border-gray-300 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </a>
            )}
            <button
              onClick={() => setResumeOpen(false)}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Drawer body -- iframe fills remaining height */}
        <div className="flex-1 overflow-hidden">
          {candidate?.resume_url ? (
            <iframe
              src={candidate.resume_url.toLowerCase().endsWith('.pdf')
                ? `${candidate.resume_url}#toolbar=0&navpanes=0&scrollbar=1`
                : `/api/resumes/preview-docx?url=${encodeURIComponent(candidate.resume_url)}`
              }
              className="w-full h-full border-0 bg-white"
              title="Resume Preview"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <FileText className="w-14 h-14 text-gray-200 mb-4" />
              <p className="text-[13px] font-medium text-gray-500 mb-1">No resume uploaded</p>
              <p className="text-[11px] text-gray-400 mb-4">PDF, DOC, DOCX — max 10MB</p>
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
        <DialogContent className="rounded-xl sm:max-w-[420px] p-5">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-[15px]">Reject Application</DialogTitle>
            <DialogDescription className="text-[12px]">
              Provide a reason for rejecting {candidate?.first_name}&apos;s application for {job?.title}.
            </DialogDescription>
          </DialogHeader>
          <div className="pt-2 pb-1">
            <Label className="text-[12px]">Reason for Rejection <span className="text-rose-500">*</span></Label>
            <Textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter the reason for rejection..."
              className="mt-1.5 text-[13px] rounded-lg"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setRejectOpen(false)} className="text-[12px] h-8 rounded-lg">Cancel</Button>
            <Button variant="outline" className="text-rose-600 border-rose-300 hover:bg-rose-50 text-[12px] h-8 rounded-lg" onClick={() => handleReject(false)} disabled={rejecting || !rejectReason.trim()}>
              {rejecting ? 'Processing...' : 'Reject'}
            </Button>
            <Button className="bg-rose-600 hover:bg-rose-700 text-white text-[12px] h-8 rounded-lg" onClick={() => handleReject(true)} disabled={rejecting || !rejectReason.trim()}>
              {rejecting ? 'Processing...' : 'Reject & Send Email'}
            </Button>
          </div>
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
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowedTypes.includes(file.type)) { setError('Only PDF, DOC, and DOCX files are allowed'); return }
    if (file.size > MAX_FILE_SIZE) { setError('File size must be under 10MB'); return }
    setUploading(true)
    setError(null)
    const supabase = createClient()
    const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
    const filePath = `${orgId}/${candidateId}/resume.${ext}`
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
      {error && <p className="text-[11px] text-rose-600 mb-2">{error}</p>}
      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleUpload} className="hidden" />
      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="text-[12px] rounded-lg">
        {uploading ? 'Uploading...' : 'Upload Resume'}
      </Button>
    </div>
  )
}

/* ====== Helper Components ====== */

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="text-[11px] text-gray-400 uppercase tracking-wide block mb-0.5">{label}</span>
      <p className="text-[13px] font-medium text-gray-900">{value || <span className="text-gray-300">-</span>}</p>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500 text-[12px]">{label}</span>
      <span className="font-medium text-[12px] text-gray-900">{value}</span>
    </div>
  )
}

function LinkField({ label, url, text }: { label: string; url: string | null | undefined; text: string }) {
  return (
    <div>
      <span className="text-[11px] text-gray-400 uppercase tracking-wide block mb-0.5">{label}</span>
      <p className="text-[13px] font-medium">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{text}</a>
        ) : <span className="text-gray-300">-</span>}
      </p>
    </div>
  )
}

/* ====== Assessment Tab Component ====== */

const ASSESSMENT_STATUS_COLORS: Record<string, string> = {
  invited: 'border-amber-200 bg-amber-50 text-amber-700',
  started: 'border-blue-200 bg-blue-50 text-blue-700',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  expired: 'border-gray-200 bg-gray-50 text-gray-500',
}

const ASSESSMENT_STATUS_DOT: Record<string, string> = {
  invited: 'bg-amber-500',
  started: 'bg-blue-500',
  completed: 'bg-emerald-500',
  expired: 'bg-gray-400',
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
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  async function handleScoreSave(invId: string) {
    const n = parseFloat(scoreInputs[invId] || '')
    if (isNaN(n) || n < 0 || n > 100) return
    setSavingScore((prev) => ({ ...prev, [invId]: true }))
    await onSaveScore(invId, n)
    setSavingScore((prev) => ({ ...prev, [invId]: false }))
  }

  function isValidUrl(str: string) {
    try {
      const url = new URL(str)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch { return false }
  }

  function handleSend() {
    const errors: Record<string, string> = {}
    if (!name.trim()) errors.name = 'Please enter an assessment name'
    if (!expiryDate) errors.expiryDate = 'Please select an expiry date'
    if (!link.trim()) errors.link = 'Please enter an assessment link'
    else if (!isValidUrl(link.trim())) errors.link = 'Please enter a valid URL (e.g. https://...)'
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }
    setFormErrors({})
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

      {/* -- LEFT: Send Form -- */}
      <div className="lg:col-span-3 space-y-6">
        {isActive && canManage && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <h3 className="text-[13px] font-semibold text-gray-900">
                {!hasHistory ? 'Send Assessment' : 'Send Another Assessment'}
              </h3>
              <p className="text-[12px] text-gray-500 mt-0.5">Send an online assessment link to this candidate via email.</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[12px]">Assessment Name <span className="text-rose-500">*</span></Label>
                  <input
                    type="text"
                    className={`flex h-9 w-full rounded-lg border bg-transparent px-3 py-1 text-[13px] shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${formErrors.name ? 'border-rose-500' : 'border-input'}`}
                    placeholder="e.g. Technical Round 1"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setFormErrors((p) => ({ ...p, name: '' })) }}
                  />
                  {formErrors.name && <p className="text-[11px] text-rose-500">{formErrors.name}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[12px]">Expiry Date <span className="text-rose-500">*</span></Label>
                  <input
                    type="date"
                    className={`flex h-9 w-full rounded-lg border bg-transparent px-3 py-1 text-[13px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${formErrors.expiryDate ? 'border-rose-500' : 'border-input'}`}
                    min={new Date().toISOString().split('T')[0]}
                    value={expiryDate}
                    onChange={(e) => { setExpiryDate(e.target.value); setFormErrors((p) => ({ ...p, expiryDate: '' })) }}
                  />
                  {formErrors.expiryDate && <p className="text-[11px] text-rose-500">{formErrors.expiryDate}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[12px]">Assessment Link <span className="text-rose-500">*</span></Label>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="url"
                    className={`flex h-9 w-full rounded-lg border bg-transparent pl-9 pr-3 py-1 text-[13px] shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${formErrors.link ? 'border-rose-500' : 'border-input'}`}
                    placeholder="https://your-platform.com/test/..."
                    value={link}
                    onChange={(e) => { setLink(e.target.value); setFormErrors((p) => ({ ...p, link: '' })) }}
                  />
                </div>
                {formErrors.link && <p className="text-[11px] text-rose-500">{formErrors.link}</p>}
              </div>

              <div className="space-y-1.5">
                <Label className="text-[12px]">Instructions for Candidate</Label>
                <Textarea
                  rows={2}
                  className="resize-none text-[13px] rounded-lg"
                  placeholder="Optional preparation notes or guidelines..."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </div>

              <Button onClick={handleSend} disabled={sending} className="gap-1.5 bg-gray-900 hover:bg-gray-800 text-white text-[12px] h-8">
                {sending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="w-3.5 h-3.5" />
                    Send Assessment Email
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Empty state (no history, read-only) */}
        {!hasHistory && (!isActive || !canManage) && (
          <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl bg-white">
            <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-[13px] text-gray-500 font-medium">No assessments sent yet</p>
            <p className="text-[11px] text-gray-400 mt-1">Send an assessment to evaluate this candidate</p>
          </div>
        )}
      </div>

      {/* -- RIGHT: History Sidebar -- */}
      <div className="lg:col-span-2">
        <div className="lg:sticky lg:top-6 space-y-3">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-semibold text-gray-900 uppercase tracking-wide">Assessment History</h3>
                {hasHistory && (
                  <span className="text-[10px] font-medium text-white bg-gray-900 px-1.5 py-0.5 rounded-full">
                    {assessmentInvitations.length}
                  </span>
                )}
              </div>
            </div>
            <div className="p-0">
              {hasHistory ? (
                <div className="divide-y divide-gray-100">
                  {assessmentInvitations.map((inv) => {
                    const statusColor = ASSESSMENT_STATUS_COLORS[inv.status] || 'border-gray-200 bg-gray-50 text-gray-700'
                    const statusLabel = ASSESSMENT_STATUS_LABELS[inv.status] || inv.status
                    const statusDot = ASSESSMENT_STATUS_DOT[inv.status] || 'bg-gray-400'
                    const borderColor = STATUS_BORDER[inv.status] || 'border-l-gray-300'

                    return (
                      <div key={inv.id} className={`px-5 py-4 border-l-4 ${borderColor} first:rounded-none last:rounded-b-lg`}>
                        {/* Header row */}
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-[13px] font-semibold text-gray-900 truncate">
                                {inv.assessment_name || 'Assessment'}
                              </p>
                              <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${statusColor}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
                                {statusLabel}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              {new Date(inv.sent_at || inv.invited_at).toLocaleDateString()}
                              {inv.expiry_date && (
                                <span className="ml-1.5 text-amber-500">· exp {new Date(inv.expiry_date).toLocaleDateString()}</span>
                              )}
                            </p>
                          </div>
                          {inv.score != null && (
                            <div className="shrink-0 w-10 h-10 rounded-xl border-2 border-emerald-200 bg-emerald-50 flex items-center justify-center">
                              <span className="text-[11px] font-bold text-emerald-700 leading-none">{Math.round(inv.score)}</span>
                            </div>
                          )}
                        </div>

                        {/* Link */}
                        {inv.assessment_link && (
                          <a
                            href={inv.assessment_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline mb-2"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Open link
                          </a>
                        )}

                        {/* Instructions */}
                        {inv.instructions && (
                          <p className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5 mb-2 whitespace-pre-wrap">
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
                              className="h-7 w-16 rounded-lg border border-input bg-transparent px-2 text-[11px] text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              placeholder="0-100"
                              value={scoreInputs[inv.id] || ''}
                              onChange={(e) => setScoreInputs((prev) => ({ ...prev, [inv.id]: e.target.value }))}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] px-2 rounded-lg"
                              onClick={() => handleScoreSave(inv.id)}
                              disabled={savingScore[inv.id] || !scoreInputs[inv.id]}
                            >
                              {savingScore[inv.id] ? '...' : 'Save'}
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="px-5 pb-5 text-center">
                  <Clock className="w-8 h-8 mx-auto text-gray-200 mb-2" />
                  <p className="text-[11px] text-gray-400">No assessments sent yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
