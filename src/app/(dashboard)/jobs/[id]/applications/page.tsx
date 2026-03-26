'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  DndContext, DragOverlay, closestCorners,
  KeyboardSensor, PointerSensor,
  useSensor, useSensors,
  useDroppable, useDraggable,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getApplicationsForJob, moveApplication, assignRecruiter } from '@/lib/services/applications'
import { getJobById, getJobRecruiters, syncJobRecruiters } from '@/lib/services/jobs'
import { resolveUserNames, getAssignableRecruiters } from '../../actions'
import { logActivity } from '@/lib/services/activity'
import { APPLICATION_STATUS_CONFIG } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScoreBreakdownDialog } from './score-breakdown-dialog'
import { BulkResumeUploadDialog } from '@/components/bulk-upload/bulk-resume-upload-dialog'
import { AddCandidateDialog } from '@/components/add-candidate-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ArrowLeft, UserPlus, Upload, List, Columns3, Briefcase, Sparkles, User, Users, FileText,
  Filter, MoreHorizontal, ChevronDown, ExternalLink, Mail, Search,
  CalendarDays, Gift, ClipboardCheck, UserCircle, RotateCcw,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Candidate {
  id: string
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  resume_url?: string | null
  resume_parsed_data?: Record<string, unknown> | null
  tags?: string[] | null
  source?: string | null
}

interface PipelineStage {
  id: string
  name: string
  stage_type: string
  display_order: number
}

interface MatchScore {
  id: string
  application_id: string
  overall_score: number
  skill_score: number
  experience_score: number
  semantic_score: number
  ai_summary: string | null
  recommendation: string | null
  strengths: string[]
  concerns: string[]
  breakdown: Record<string, unknown>
  model_used: string
  scored_at: string
}

interface ApplicationRow {
  id: string
  candidate: Candidate
  current_stage_id: string
  current_stage: PipelineStage | null
  status: string
  applied_at: string
  assigned_recruiter_id?: string | null
}

interface StageGroup {
  id: string
  name: string
  stage_type: string
  display_order: number
  applications: ApplicationRow[]
}

interface AssessmentInv {
  id: string
  application_id: string
  status: string
  score: number | null
  invited_at: string
  completed_at: string | null
}

type ViewMode = 'table' | 'pipeline'

// ---------------------------------------------------------------------------
// Pipeline: Stage column colors
// ---------------------------------------------------------------------------

const STAGE_COLORS: Record<string, string> = {
  applied:    'border-t-blue-400',
  screening:  'border-t-yellow-400',
  assessment: 'border-t-orange-400',
  interview:  'border-t-purple-400',
  offer:      'border-t-green-400',
  hired:      'border-t-emerald-500',
  rejected:   'border-t-red-400',
}

const STAGE_BG: Record<string, string> = {
  applied:    'bg-blue-50 text-blue-700 border-blue-200',
  screening:  'bg-yellow-50 text-yellow-700 border-yellow-200',
  assessment: 'bg-orange-50 text-orange-700 border-orange-200',
  interview:  'bg-purple-50 text-purple-700 border-purple-200',
  offer:      'bg-green-50 text-green-700 border-green-200',
  hired:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected:   'bg-red-50 text-red-700 border-red-200',
}

// Status dot + pill design
const STATUS_DOT: Record<string, string> = {
  active:    'bg-emerald-500',
  rejected:  'bg-rose-400',
  hired:     'bg-emerald-500',
  withdrawn: 'bg-gray-400',
}

const STATUS_PILL: Record<string, string> = {
  active:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected:  'bg-rose-50 text-rose-600 border-rose-200',
  hired:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  withdrawn: 'bg-gray-50 text-gray-600 border-gray-200',
}

// Gradient avatars
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

// ---------------------------------------------------------------------------
// Pipeline: Droppable stage column
// ---------------------------------------------------------------------------

function StageColumn({ stage, children }: { stage: StageGroup; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: stage.id })

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-72 min-w-[18rem] rounded-xl border border-t-4 bg-gray-50/30 transition-all ${
        STAGE_COLORS[stage.stage_type] ?? 'border-t-gray-400'
      } ${isOver ? 'ring-2 ring-blue-400/60 bg-blue-50/30 border-blue-200' : 'border-gray-200'}`}
    >
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-gray-100 bg-white rounded-t-xl">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-semibold text-gray-800">{stage.name}</h3>
        </div>
        <span className="text-[11px] font-bold text-gray-500 bg-gray-100 min-w-[24px] text-center px-2 py-0.5 rounded-full">
          {stage.applications.length}
        </span>
      </div>
      <ScrollArea className="flex-1 p-2" style={{ maxHeight: 'calc(100vh - 260px)' }}>
        <div className="space-y-2 min-h-[60px]">
          {children}
        </div>
      </ScrollArea>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pipeline: Application card UI
// ---------------------------------------------------------------------------

function AppCardUI({
  app,
  isDragging = false,
  draggable = true,
}: {
  app: ApplicationRow
  isDragging?: boolean
  draggable?: boolean
}) {
  const fullName = `${app.candidate.first_name} ${app.candidate.last_name}`
  const initials = `${app.candidate.first_name?.[0] ?? ''}${app.candidate.last_name?.[0] ?? ''}`.toUpperCase()
  const gradient = getGradient(fullName)
  const statusConfig = APPLICATION_STATUS_CONFIG[app.status as keyof typeof APPLICATION_STATUS_CONFIG]

  return (
    <div
      className={`bg-white rounded-xl border transition-all ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${
        isDragging ? 'shadow-xl ring-2 ring-blue-300/70 opacity-95 scale-[1.02] border-blue-200' : 'hover:shadow-md border-gray-200'
      }`}
    >
      <div className="p-3">
        <div className="flex items-start gap-2.5">
          <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${gradient} text-white flex items-center justify-center text-[11px] font-semibold shrink-0 shadow-sm`}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <Link
              href={`/applications/${app.id}?from=applications`}
              onClick={(e) => e.stopPropagation()}
              className="text-[13px] font-medium text-gray-900 truncate block hover:text-blue-600 transition-colors"
            >
              {fullName}
            </Link>
            <p className="text-[11px] text-gray-400 truncate">{app.candidate.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
          {statusConfig && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${STATUS_PILL[app.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[app.status] ?? 'bg-gray-400'}`} />
              {statusConfig.label}
            </span>
          )}
          {app.candidate.tags?.slice(0, 2).map((tag) => (
            <span key={tag} className="text-[10px] bg-gray-50 text-gray-500 px-1.5 py-0.5 rounded-md border border-gray-100">
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-gray-100">
          <p className="text-[10px] text-gray-400">
            {new Date(app.applied_at).toLocaleDateString()}
          </p>
          {app.current_stage?.stage_type === 'screening' && (
            <Link
              href={`/applications/${app.id}?tab=personal&from=applications`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-[10px] font-medium text-violet-600 hover:text-violet-700 hover:bg-violet-50 px-1.5 py-0.5 rounded-md transition-colors"
            >
              <UserCircle className="w-3 h-3" />
              Profile
            </Link>
          )}
          {app.current_stage?.stage_type === 'interview' && (
            <Link
              href={`/applications/${app.id}?tab=interview&from=applications`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-1.5 py-0.5 rounded-md transition-colors"
            >
              <CalendarDays className="w-3 h-3" />
              Interview
            </Link>
          )}
          {app.current_stage?.stage_type === 'offer' && (
            <Link
              href={`/applications/${app.id}?tab=offer&from=applications`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-1.5 py-0.5 rounded-md transition-colors"
            >
              <Gift className="w-3 h-3" />
              Offer
            </Link>
          )}
          {app.current_stage?.stage_type === 'assessment' && (
            <Link
              href={`/applications/${app.id}?tab=assessment&from=applications`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-[10px] font-medium text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-1.5 py-0.5 rounded-md transition-colors"
            >
              <ClipboardCheck className="w-3 h-3" />
              Assessment
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pipeline: Draggable wrapper
// ---------------------------------------------------------------------------

function DraggableAppCard({ app }: { app: ApplicationRow }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: app.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 }}
      {...listeners}
      {...attributes}
    >
      <AppCardUI app={app} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ApplicationsPage() {
  const params = useParams()
  const router = useRouter()
  const { user, organization, isLoading: userLoading } = useUser()
  const { canManageJobs, isAdmin } = useRole()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [job, setJob] = useState<any>(null)
  const [stages, setStages] = useState<StageGroup[]>([])
  const [allApps, setAllApps] = useState<ApplicationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('table')

  // Status tab filter: 'all', 'active', 'hired', 'rejected'
  const [statusTab, setStatusTab] = useState<string>('active')
  // Filters — single stage filter (includes hired/rejected as pseudo-stages)
  // Values: 'all', stage IDs, 'hired', 'rejected'
  const [stageFilter, setStageFilter] = useState<string>('all')
  const filterStatus = 'all' // always fetch all apps
  const [filterScore, setFilterScore] = useState<string>('all')
  const [filterMyCandidates, setFilterMyCandidates] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Reject dialog state
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [rejectApp, setRejectApp] = useState<ApplicationRow | null>(null)
  const [rejectStageId, setRejectStageId] = useState<string | null>(null)

  // AI Match Scores
  const [matchScores, setMatchScores] = useState<Record<string, MatchScore>>({})
  const [batchScoring, setBatchScoring] = useState(false)
  const [scoreDetailApp, setScoreDetailApp] = useState<ApplicationRow | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const batchFiredRef = useRef(false)

  // Assessment invitations
  const [assessmentInvitations, setAssessmentInvitations] = useState<Record<string, AssessmentInv>>({})

  // Bulk upload dialog
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false)

  // Add candidate dialog
  const [addCandidateOpen, setAddCandidateOpen] = useState(false)

  // Recruiter assignment
  const [jobRecruiterIds, setJobRecruiterIds] = useState<string[]>([])
  const [recruiterNames, setRecruiterNames] = useState<Record<string, string>>({})

  // Manage recruiters dialog
  const [manageRecruitersOpen, setManageRecruitersOpen] = useState(false)
  const [allRecruiters, setAllRecruiters] = useState<{ id: string; full_name: string; role: string }[]>([])
  const [dialogRecruiterIds, setDialogRecruiterIds] = useState<string[]>([])
  const [dialogOwnerId, setDialogOwnerId] = useState<string | null>(null)
  const [savingRecruiters, setSavingRecruiters] = useState(false)

  // Pipeline drag-and-drop state
  const [activeApp, setActiveApp] = useState<ApplicationRow | null>(null)
  const [moving, setMoving] = useState(false)

  // Rollback state
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [rollbackApp, setRollbackApp] = useState<ApplicationRow | null>(null)
  const [rollingBack, setRollingBack] = useState(false)

  // DnD sensors — must always be called (hooks rule)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const fetchScores = useCallback(async (): Promise<Record<string, MatchScore>> => {
    if (!organization) return {}
    try {
      const res = await fetch(`/api/ai-matching?job_id=${params.id}`)
      if (res.ok) {
        const { data } = await res.json()
        if (data) {
          const scoreMap: Record<string, MatchScore> = {}
          for (const s of data) scoreMap[s.application_id] = s
          setMatchScores(scoreMap)
          return scoreMap
        }
      }
    } catch { /* Silently fail */ }
    return {}
  }, [organization, params.id])

  const fetchAssessmentInvitations = useCallback(async () => {
    if (!organization) return
    try {
      const res = await fetch(`/api/assessments?job_id=${params.id}`)
      if (res.ok) {
        const { invitations } = await res.json()
        if (invitations) {
          const map: Record<string, AssessmentInv> = {}
          for (const inv of invitations) map[inv.application_id] = inv
          setAssessmentInvitations(map)
        }
      }
    } catch { /* Silently fail */ }
  }, [organization, params.id])

  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [])

  const startScorePolling = useCallback((appIds: string[]) => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    const appIdSet = new Set(appIds)
    pollingRef.current = setInterval(async () => {
      const scores = await fetchScores()
      const allScored = Array.from(appIdSet).every((id) => scores[id])
      if (allScored) {
        if (pollingRef.current) clearInterval(pollingRef.current)
        pollingRef.current = null
        setBatchScoring(false)
      }
    }, 3000)
  }, [fetchScores])

  const loadData = useCallback(async () => {
    if (!organization) return
    setError(null)
    const supabase = createClient()

    const [jobResult, pipelineResult] = await Promise.all([
      getJobById(supabase, params.id as string, organization.id),
      getApplicationsForJob(supabase, params.id as string, organization.id, filterStatus),
    ])

    if (jobResult.error) { setError(jobResult.error.message) } else { setJob(jobResult.data) }

    let flatApps: ApplicationRow[] = []
    if (pipelineResult.error) {
      setError(pipelineResult.error.message)
    } else if (pipelineResult.data) {
      const stageData = pipelineResult.data.stages as StageGroup[]
      setStages(stageData)
      flatApps = stageData.flatMap((s) =>
        s.applications.map((a) => ({
          ...a,
          current_stage: { id: s.id, name: s.name, stage_type: s.stage_type, display_order: s.display_order },
        }))
      )
      setAllApps(flatApps)
    }

    // Load job recruiters and resolve names
    if (organization) {
      const supabase2 = createClient()
      const recruiterIds = await getJobRecruiters(supabase2, params.id as string)
      setJobRecruiterIds(recruiterIds)

      // Collect all recruiter IDs (from job + from applications)
      const allRecruiterIds = new Set(recruiterIds)
      flatApps.forEach((a) => { if (a.assigned_recruiter_id) allRecruiterIds.add(a.assigned_recruiter_id) })
      if (allRecruiterIds.size > 0) {
        const { data: names } = await resolveUserNames(Array.from(allRecruiterIds))
        if (names) setRecruiterNames(names)
      }
    }

    setLoading(false)

    const existingScores = await fetchScores()
    fetchAssessmentInvitations()

    // Auto-parse unparsed resumes in background
    if (pipelineResult.data) {
      const allApplications = (pipelineResult.data.stages as StageGroup[]).flatMap((s) => s.applications)
      const unparsedCandidateIds = allApplications
        .filter((a) => a.candidate.resume_url && (!a.candidate.resume_parsed_data || Object.keys(a.candidate.resume_parsed_data).length === 0))
        .map((a) => a.candidate.id)
      if (unparsedCandidateIds.length > 0) {
        fetch('/api/resumes/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidate_ids: unparsedCandidateIds }),
        }).catch(() => {})
      }
    }

    const unscoredAppIds = flatApps.map((a) => a.id).filter((id) => !existingScores[id])
    if (unscoredAppIds.length > 0 && !batchFiredRef.current) {
      batchFiredRef.current = true
      setBatchScoring(true)
      startScorePolling(unscoredAppIds)
      fetch('/api/ai-matching/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: params.id }),
      }).then(async (res) => {
        if (!res.ok) {
          if (pollingRef.current) clearInterval(pollingRef.current)
          pollingRef.current = null
          setBatchScoring(false)
          return
        }
        await fetchScores()
        if (pollingRef.current) clearInterval(pollingRef.current)
        pollingRef.current = null
        setBatchScoring(false)
      }).catch(() => {
        if (pollingRef.current) clearInterval(pollingRef.current)
        pollingRef.current = null
        setBatchScoring(false)
      })
    }
  }, [organization, params.id, filterStatus, fetchScores, startScorePolling, fetchAssessmentInvitations])

  useEffect(() => {
    if (!organization) return
    batchFiredRef.current = false
    loadData()
  }, [organization, loadData])

  // ---------------------------------------------------------------------------
  // Stage change handler (shared by table + pipeline)
  // ---------------------------------------------------------------------------

  // Hire block dialog
  const [hireBlockOpen, setHireBlockOpen] = useState(false)
  const [hireBlockApp, setHireBlockApp] = useState<ApplicationRow | null>(null)

  async function handleStageChange(app: ApplicationRow, newStageId: string) {
    if (!user || !organization || newStageId === app.current_stage_id) return

    const targetStage = stages.find((s) => s.id === newStageId)

    // Block move to hired if no accepted offer exists
    if (targetStage?.stage_type === 'hired') {
      const supabase = createClient()
      const { data: offers } = await supabase
        .from('offer_letters')
        .select('id, status')
        .eq('application_id', app.id)
        .eq('organization_id', organization.id)
        .eq('status', 'accepted')
      if (!offers || offers.length === 0) {
        setHireBlockApp(app)
        setHireBlockOpen(true)
        return
      }
    }

    // Optimistic update on allApps (pipeline view derives from this)
    setAllApps((prev) =>
      prev.map((a) =>
        a.id === app.id
          ? {
              ...a,
              current_stage_id: newStageId,
              current_stage: targetStage
                ? { id: targetStage.id, name: targetStage.name, stage_type: targetStage.stage_type, display_order: targetStage.display_order }
                : a.current_stage,
              status: targetStage?.stage_type === 'rejected' ? 'rejected' : a.status,
            }
          : a
      )
    )

    if (targetStage?.stage_type === 'rejected') {
      // Show reject dialog instead of auto-rejecting
      setRejectApp(app)
      setRejectStageId(newStageId)
      setRejectReason('')
      setRejectOpen(true)
      return
    } else {
      const supabase = createClient()
      const { error: moveError } = await moveApplication(supabase, app.id, organization.id, newStageId, user.id)
      if (moveError) {
        setError(moveError.message)
        await loadData()
        return
      }
    }

    const supabase = createClient()
    await logActivity(supabase, organization.id, user.id, 'application', app.id, 'stage_changed', {
      to_stage: targetStage?.name,
      to_stage_id: newStageId,
      candidate_name: `${app.candidate.first_name} ${app.candidate.last_name}`,
    })
  }

  // ---------------------------------------------------------------------------
  // Reject handler (called from reject dialog)
  // ---------------------------------------------------------------------------

  async function handleReject(sendEmail: boolean) {
    if (!rejectApp || !organization || !user) return
    setRejecting(true)
    try {
      const res = await fetch('/api/applications/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: rejectApp.id,
          reason: rejectReason,
          stageId: rejectStageId,
          sendEmail,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to reject application')
        await loadData()
      } else {
        setRejectOpen(false)
        setRejectReason('')
        setRejectApp(null)
        setRejectStageId(null)
        await loadData()
      }
    } catch {
      setError('Failed to reject application')
      await loadData()
    }
    setRejecting(false)
  }

  // ---------------------------------------------------------------------------
  // Rollback rejected application
  // ---------------------------------------------------------------------------

  async function handleRollback() {
    if (!rollbackApp || !organization || !user) return
    setRollingBack(true)
    try {
      const res = await fetch('/api/applications/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: rollbackApp.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to rollback application')
      } else {
        await loadData()
      }
    } catch {
      setError('Failed to rollback application')
    }
    setRollingBack(false)
    setRollbackOpen(false)
    setRollbackApp(null)
  }

  // ---------------------------------------------------------------------------
  // Pipeline drag handlers
  // ---------------------------------------------------------------------------

  function handleDragStart(event: DragStartEvent) {
    const found = allApps.find((a) => a.id === (event.active.id as string))
    if (found) setActiveApp(found)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveApp(null)
    if (!over || !canManageJobs) return

    const appId = active.id as string
    const targetStageId = over.id as string
    const app = allApps.find((a) => a.id === appId)
    if (!app || app.current_stage_id === targetStageId) return
    if (app.status !== 'active') return

    setMoving(true)
    await handleStageChange(app, targetStageId)
    setMoving(false)
  }

  // ---------------------------------------------------------------------------
  // AI batch scoring
  // ---------------------------------------------------------------------------

  async function handleBatchScore() {
    if (!organization) return
    setBatchScoring(true)
    setError(null)
    const allAppIds = allApps.map((a) => a.id)
    if (allAppIds.length > 0) startScorePolling(allAppIds)
    try {
      const res = await fetch('/api/ai-matching/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: params.id, rescore: true }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error || 'Failed to batch score')
      }
      await fetchScores()
    } catch {
      setError('Failed to batch score')
    } finally {
      if (pollingRef.current) clearInterval(pollingRef.current)
      pollingRef.current = null
      setBatchScoring(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function getScoreBadgeColor(score: number): string {
    if (score >= 80) return 'bg-green-100 text-green-800'
    if (score >= 60) return 'bg-yellow-100 text-yellow-800'
    if (score >= 40) return 'bg-orange-100 text-orange-700'
    return 'bg-red-100 text-red-700'
  }

  function getProgressColor(score: number): string {
    if (score >= 80) return '[&>div]:bg-green-500'
    if (score >= 60) return '[&>div]:bg-yellow-500'
    if (score >= 40) return '[&>div]:bg-orange-500'
    return '[&>div]:bg-red-500'
  }

  // ---------------------------------------------------------------------------
  // Manage Recruiters dialog handlers
  // ---------------------------------------------------------------------------

  async function openManageRecruiters() {
    if (!organization) return
    setManageRecruitersOpen(true)
    setDialogRecruiterIds([...jobRecruiterIds])
    setDialogOwnerId((job?.assigned_to as string) ?? (jobRecruiterIds.length > 0 ? jobRecruiterIds[0] : null))
    // Fetch all assignable recruiters
    const result = await getAssignableRecruiters(organization.id)
    if (result.data) {
      setAllRecruiters(result.data)
    }
  }

  async function saveRecruiters() {
    if (!organization || !job) return
    setSavingRecruiters(true)
    try {
      const supabase = createClient()
      // Sync job_recruiters junction table
      await syncJobRecruiters(supabase, job.id, dialogRecruiterIds)
      // Update job owner (assigned_to)
      await supabase.from('jobs').update({
        assigned_to: dialogOwnerId,
        updated_at: new Date().toISOString(),
      }).eq('id', job.id).eq('organization_id', organization.id)
      // Refresh local state
      setJobRecruiterIds(dialogRecruiterIds)
      setJob((prev: Record<string, unknown>) => prev ? { ...prev, assigned_to: dialogOwnerId } : prev)
      // Resolve any new names
      const allIds = new Set(dialogRecruiterIds)
      if (dialogOwnerId) allIds.add(dialogOwnerId)
      if (allIds.size > 0) {
        const { data: names } = await resolveUserNames(Array.from(allIds))
        if (names) setRecruiterNames((prev) => ({ ...prev, ...names }))
      }
      setManageRecruitersOpen(false)
    } catch {
      setError('Failed to save recruiter assignments')
    } finally {
      setSavingRecruiters(false)
    }
  }

  // Compute pipeline stages from allApps (always fresh — reflects optimistic stage changes)
  // Filters panel state
  const [filtersOpen, setFiltersOpen] = useState(true)
  const activeFilterCount = [
    stageFilter !== 'all' ? 1 : 0,
    filterScore !== 'all' ? 1 : 0,
    filterMyCandidates ? 1 : 0,
  ].reduce((a, b) => a + b, 0)

  const viewToggle = (
    <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-1">
      <button
        onClick={() => setViewMode('table')}
        title="Table view"
        className={`flex items-center justify-center w-8 h-7 rounded-md transition-all duration-150 ${
          viewMode === 'table'
            ? 'bg-gray-900 text-white shadow-sm'
            : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        <List className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => setViewMode('pipeline')}
        title="Pipeline view"
        className={`flex items-center justify-center w-8 h-7 rounded-md transition-all duration-150 ${
          viewMode === 'pipeline'
            ? 'bg-gray-900 text-white shadow-sm'
            : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        <Columns3 className="w-3.5 h-3.5" />
      </button>
    </div>
  )

  const pipelineStages = stages.map((stage) => ({
    ...stage,
    applications: allApps.filter((a) => {
      if (a.current_stage_id !== stage.id) return false
      if (statusTab !== 'all' && a.status !== statusTab) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const name = `${a.candidate?.first_name || ''} ${a.candidate?.last_name || ''}`.toLowerCase()
        const email = (a.candidate?.email || '').toLowerCase()
        if (!name.includes(q) && !email.includes(q)) return false
      }
      return true
    }),
  }))

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (userLoading || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (!job) {
    return <div className="text-center py-12 text-gray-500">Job not found</div>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.back()}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Briefcase className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-semibold text-gray-900">{job.title}</h1>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600">{allApps.length} applicant{allApps.length !== 1 ? 's' : ''}</span>
                <Link href={`/jobs/${job.id}`} className="text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  View JD
                </Link>
                {batchScoring && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-blue-600 animate-pulse">AI Scoring...</span>}
                {moving && <span className="text-[11px] text-gray-400 animate-pulse">Saving...</span>}
              </div>
              <p className="text-[12px] text-gray-400 mt-0.5 flex items-center gap-2">
                Applications
                {job.assigned_to && recruiterNames[job.assigned_to] && (
                  <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {recruiterNames[job.assigned_to]}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canManageJobs && (
            <>
              <Button variant="outline" size="sm" onClick={() => setAddCandidateOpen(true)} className="gap-1.5 h-8 text-[12px] rounded-lg border-gray-200">
                <UserPlus className="w-3.5 h-3.5" />
                Add Candidate
              </Button>
              <Button variant="outline" size="sm" onClick={() => setBulkUploadOpen(true)} className="gap-1.5 h-8 text-[12px] rounded-lg border-gray-200">
                <Upload className="w-3.5 h-3.5" />
                Bulk Upload
              </Button>
            </>
          )}
          {allApps.length > 0 && canManageJobs && (
            <Button size="sm" disabled={batchScoring} onClick={handleBatchScore} className="bg-gray-900 hover:bg-gray-800 text-white gap-1.5 h-8 text-[12px] rounded-lg shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />
              {batchScoring ? 'Scoring...' : 'AI Re-Score All'}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>
      )}

      {/* Status Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {[
          { value: 'all', label: 'All', count: allApps.length },
          { value: 'active', label: 'Active', count: allApps.filter(a => a.status === 'active').length },
          { value: 'hired', label: 'Hired', count: allApps.filter(a => a.status === 'hired').length },
          { value: 'rejected', label: 'Rejected', count: allApps.filter(a => a.status === 'rejected').length },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusTab(tab.value)}
            className={`px-3 py-2 text-[12px] font-medium border-b-2 transition-colors ${
              statusTab === tab.value
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            <span className={`ml-1.5 text-[11px] ${statusTab === tab.value ? 'text-gray-600' : 'text-gray-400'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── TABLE VIEW ──────────────────────────────────────────────────────── */}
      {viewMode === 'table' && (
        <>
          {/* Toolbar */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search candidates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-52 pl-8 pr-3 text-[12px] rounded-lg border border-gray-200 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFiltersOpen((v) => !v)}
              className={`h-8 text-[12px] gap-1.5 rounded-lg border-gray-200 ${filtersOpen ? 'bg-gray-50' : ''}`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-gray-900 text-white text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
            </Button>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost" size="sm"
                className="h-8 text-[12px] text-gray-500"
                onClick={() => { setStatusTab('all'); setStageFilter('all'); setFilterScore('all'); setFilterMyCandidates(false) }}
              >
                Clear all
              </Button>
            )}
            <div className="flex-1" />
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={openManageRecruiters} className="h-8 text-[12px] gap-1.5 rounded-lg border-gray-200">
                <Users className="w-3.5 h-3.5" />
                Manage Recruiters
              </Button>
            )}
            {viewToggle}
          </div>

          {/* Collapsible Filters Panel */}
          {filtersOpen && (
            <div className="bg-gray-50/80 rounded-xl border border-gray-200 px-4 py-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Stage</span>
                  <Select value={stageFilter} onValueChange={setStageFilter}>
                    <SelectTrigger className="w-[180px] h-8 text-[12px] bg-white rounded-lg border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Stages</SelectItem>
                      {stages.filter((s) => s.stage_type !== 'hired' && s.stage_type !== 'rejected').map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                      <SelectItem value="hired">Hired</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {allApps.length > 0 && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">AI Score</span>
                      <Select value={filterScore} onValueChange={setFilterScore}>
                        <SelectTrigger className="w-[130px] h-8 text-[12px] bg-white rounded-lg border-gray-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Scores</SelectItem>
                          <SelectItem value="80+">80+ (Strong)</SelectItem>
                          <SelectItem value="60-79">60-79 (Good)</SelectItem>
                          <SelectItem value="40-59">40-59 (Fair)</SelectItem>
                          <SelectItem value="<40">&lt;40 (Weak)</SelectItem>
                          <SelectItem value="unscored">Unscored</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                {jobRecruiterIds.length > 0 && (
                  <Button
                    variant={filterMyCandidates ? 'default' : 'outline'}
                    size="sm"
                    className={`h-8 text-[12px] gap-1.5 rounded-lg ${filterMyCandidates ? 'bg-gray-900 hover:bg-gray-800 text-white' : 'border-gray-200 bg-white'}`}
                    onClick={() => setFilterMyCandidates((v) => !v)}
                  >
                    <User className="w-3.5 h-3.5" />
                    My Candidates
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Table */}
          {allApps.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No applications yet for this job.</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {(() => {
                const filteredApps = allApps.filter((app) => {
                  // Status tab filter
                  if (statusTab !== 'all' && app.status !== statusTab) return false
                  if (searchQuery.trim()) {
                    const q = searchQuery.toLowerCase()
                    const name = `${app.candidate?.first_name || ''} ${app.candidate?.last_name || ''}`.toLowerCase()
                    const email = (app.candidate?.email || '').toLowerCase()
                    if (!name.includes(q) && !email.includes(q)) return false
                  }
                  if (filterMyCandidates && user && app.assigned_recruiter_id !== user.id) return false
                  // Stage filter: 'hired'/'rejected' filter by status, stage IDs filter by current_stage_id
                  if (stageFilter === 'hired' && app.status !== 'hired') return false
                  if (stageFilter === 'rejected' && app.status !== 'rejected') return false
                  if (stageFilter !== 'all' && stageFilter !== 'hired' && stageFilter !== 'rejected' && app.current_stage_id !== stageFilter) return false
                  if (filterScore !== 'all') {
                    const score = matchScores[app.id]
                    if (filterScore === 'unscored') return !score
                    if (!score) return false
                    const s = score.overall_score
                    if (filterScore === '80+' && s < 80) return false
                    if (filterScore === '60-79' && (s < 60 || s >= 80)) return false
                    if (filterScore === '40-59' && (s < 40 || s >= 60)) return false
                    if (filterScore === '<40' && s >= 40) return false
                  }
                  return true
                })

                if (filteredApps.length === 0) {
                  return (
                    <div className="text-center py-8 text-gray-500 text-[13px]">
                      No applications match the current filters.
                    </div>
                  )
                }

                return (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/60 hover:bg-gray-50/60 border-b border-gray-100">
                        <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Candidate</TableHead>
                        <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</TableHead>
                        <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">AI Score</TableHead>
                        <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Assessment</TableHead>
                        <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Assigned To</TableHead>
                        <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Current Stage</TableHead>
                        <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Source</TableHead>
                        <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Applied</TableHead>
                        <TableHead className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredApps.map((app) => {
                        const fullName = `${app.candidate.first_name} ${app.candidate.last_name}`
                        const initials = `${app.candidate.first_name?.[0] ?? ''}${app.candidate.last_name?.[0] ?? ''}`.toUpperCase()
                        const gradient = getGradient(fullName)

                        return (
                        <TableRow
                          key={app.id}
                          className="group cursor-pointer hover:bg-gray-50/80 transition-colors"
                          onClick={() => router.push(`/applications/${app.id}?from=applications&status=${statusTab}`)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${gradient} text-white flex items-center justify-center text-[11px] font-semibold shrink-0 shadow-sm`}>
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <span className="text-[13px] font-medium text-gray-900 truncate block">
                                  {fullName}
                                </span>
                                <span className="text-[11px] text-gray-400 truncate block">{app.candidate.email}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${STATUS_PILL[app.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[app.status] ?? 'bg-gray-400'}`} />
                              {app.status}
                            </span>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {(() => {
                              const score = matchScores[app.id]
                              if (!score) return batchScoring
                                ? <span className="text-[11px] text-gray-400 animate-pulse">Scoring...</span>
                                : <span className="text-[11px] text-gray-400">-</span>
                              return (
                                <button
                                  onClick={() => setScoreDetailApp(app)}
                                  className="flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80"
                                >
                                  <span className={`${getScoreBadgeColor(score.overall_score)} text-[11px] font-semibold px-2 py-0.5 rounded-full`}>
                                    {score.overall_score}%
                                  </span>
                                  <Progress
                                    value={score.overall_score}
                                    className={`h-1 w-14 ${getProgressColor(score.overall_score)}`}
                                  />
                                </button>
                              )
                            })()}
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const inv = assessmentInvitations[app.id]
                              if (!inv) return <span className="text-[11px] text-gray-400">-</span>
                              const statusColors: Record<string, string> = {
                                invited: 'bg-amber-50 text-amber-700 border-amber-200',
                                started: 'bg-blue-50 text-blue-700 border-blue-200',
                                completed: 'bg-green-50 text-green-700 border-green-200',
                                expired: 'bg-gray-50 text-gray-500 border-gray-200',
                              }
                              const statusLabels: Record<string, string> = {
                                invited: 'Sent', started: 'In Progress', completed: 'Completed', expired: 'Expired',
                              }
                              return (
                                <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusColors[inv.status] || 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                                  {inv.status === 'completed' && inv.score != null
                                    ? `${Math.round(inv.score)}%`
                                    : statusLabels[inv.status] || inv.status}
                                </span>
                              )
                            })()}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {isAdmin && jobRecruiterIds.length > 0 ? (
                              <Select
                                value={app.assigned_recruiter_id ?? '__unassigned'}
                                onValueChange={async (val) => {
                                  const newId = val === '__unassigned' ? null : val
                                  if (!organization) return
                                  // Optimistic update
                                  setAllApps((prev) => prev.map((a) => a.id === app.id ? { ...a, assigned_recruiter_id: newId } : a))
                                  const supabase3 = createClient()
                                  await assignRecruiter(supabase3, app.id, organization.id, newId)
                                }}
                              >
                                <SelectTrigger className="w-[130px] h-7 text-[11px] rounded-lg border-gray-200">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__unassigned">Unassigned</SelectItem>
                                  {jobRecruiterIds.map((rid) => (
                                    <SelectItem key={rid} value={rid}>
                                      {recruiterNames[rid] ?? rid.slice(0, 8)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-[12px] text-gray-600">
                                {app.assigned_recruiter_id ? (recruiterNames[app.assigned_recruiter_id] ?? '-') : '-'}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                              <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                                STAGE_BG[app.current_stage?.stage_type ?? ''] ?? 'bg-gray-50 text-gray-700 border-gray-200'
                              }`}>
                                {app.current_stage?.name ?? '-'}
                              </span>
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const src = app.candidate?.source
                              const sourceConfig: Record<string, { label: string; color: string; icon: string }> = {
                                direct: { label: 'Direct', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: '🔗' },
                                referral: { label: 'Referral', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: '👥' },
                                linkedin: { label: 'LinkedIn', color: 'bg-sky-50 text-sky-700 border-sky-200', icon: '💼' },
                                job_board: { label: 'Job Board', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: '📋' },
                                careers_page: { label: 'Careers Page', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: '🌐' },
                                other: { label: 'Other', color: 'bg-gray-50 text-gray-600 border-gray-200', icon: '📌' },
                              }
                              const cfg = src ? sourceConfig[src] : null
                              if (!cfg) return <span className="text-[11px] text-gray-400">-</span>
                              return (
                                <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${cfg.color}`}>
                                  <span className="text-[9px]">{cfg.icon}</span>
                                  {cfg.label}
                                </span>
                              )
                            })()}
                          </TableCell>
                          <TableCell className="text-[12px] text-gray-500">
                            {new Date(app.applied_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-gray-100 transition-all">
                                  <MoreHorizontal className="w-4 h-4 text-gray-400" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => router.push(`/applications/${app.id}?from=applications&status=${statusTab}`)}>
                                  <ExternalLink className="w-3.5 h-3.5 mr-2" />
                                  View Application
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => router.push(`/candidates/${app.candidate.id}`)}>
                                  <User className="w-3.5 h-3.5 mr-2" />
                                  View Profile
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => window.open(`mailto:${app.candidate.email}`, '_blank')}>
                                  <Mail className="w-3.5 h-3.5 mr-2" />
                                  Send Email
                                </DropdownMenuItem>
                                {app.status === 'rejected' && canManageJobs && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => { setRollbackApp(app); setRollbackOpen(true) }}>
                                      <RotateCcw className="w-3.5 h-3.5 mr-2" />
                                      Rollback to Previous Stage
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )
              })()}
            </div>
          )}
        </>
      )}

      {/* ── PIPELINE VIEW ───────────────────────────────────────────────────── */}
      {viewMode === 'pipeline' && (
        <>
          {/* Status filter (simplified for pipeline) */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search candidates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-52 pl-8 pr-3 text-[12px] rounded-lg border border-gray-200 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Stage</span>
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="w-[180px] h-8 text-[12px] rounded-lg border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stages</SelectItem>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                  <SelectItem value="hired">Hired</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1" />
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={openManageRecruiters} className="h-8 text-[12px] gap-1.5 rounded-lg border-gray-200">
                <Users className="w-3.5 h-3.5" />
                Manage Recruiters
              </Button>
            )}
            {viewToggle}
          </div>

          {allApps.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No applications yet for this job.</div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 280px)' }}>
                {pipelineStages.map((stage) => (
                  <StageColumn key={stage.id} stage={stage}>
                    {stage.applications.map((app) =>
                      canManageJobs && app.status === 'active'
                        ? <DraggableAppCard key={app.id} app={app} />
                        : <AppCardUI key={app.id} app={app} draggable={false} />
                    )}
                    {stage.applications.length === 0 && (
                      <div className="flex items-center justify-center h-16 text-[11px] text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                        Drop here
                      </div>
                    )}
                  </StageColumn>
                ))}
              </div>

              <DragOverlay>
                {activeApp ? <AppCardUI app={activeApp} isDragging /> : null}
              </DragOverlay>
            </DndContext>
          )}
        </>
      )}

      {/* Score Breakdown Dialog */}
      {scoreDetailApp && (
        <ScoreBreakdownDialog
          open={!!scoreDetailApp}
          onOpenChange={(open) => { if (!open) setScoreDetailApp(null) }}
          candidateName={`${scoreDetailApp.candidate.first_name} ${scoreDetailApp.candidate.last_name}`}
          score={matchScores[scoreDetailApp.id] ?? null}
        />
      )}

      {/* Add Candidate Dialog */}
      <AddCandidateDialog
        open={addCandidateOpen}
        onOpenChange={setAddCandidateOpen}
        jobId={params.id as string}
        jobTitle={job?.title ?? ''}
        onSuccess={() => loadData()}
      />

      {/* Bulk Upload Dialog */}
      <BulkResumeUploadDialog
        open={bulkUploadOpen}
        onOpenChange={setBulkUploadOpen}
        jobId={params.id as string}
        jobTitle={job?.title ?? ''}
      />

      {/* Manage Recruiters Dialog */}
      <Dialog open={manageRecruitersOpen} onOpenChange={setManageRecruitersOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl shadow-xl bg-white">
          <div className="px-6 py-5 border-b border-gray-100">
            <DialogHeader>
              <DialogTitle className="text-gray-900 text-base font-semibold tracking-tight flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-500" />
                Manage Recruiters
              </DialogTitle>
              <p className="text-gray-400 text-xs mt-1">Assign recruiters and set the job owner</p>
            </DialogHeader>
          </div>

          <div className="px-6 py-4">
            {/* Current owner indicator */}
            {dialogOwnerId && recruiterNames[dialogOwnerId] && (
              <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
                <svg className="w-3.5 h-3.5 text-emerald-600" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" /></svg>
                <span className="text-xs font-medium text-emerald-700">Job Owner: {recruiterNames[dialogOwnerId] ?? allRecruiters.find(r => r.id === dialogOwnerId)?.full_name}</span>
              </div>
            )}

            {/* Recruiter list */}
            <ScrollArea className="max-h-[280px]">
              <div className="space-y-1">
                {allRecruiters.map((r) => {
                  const checked = dialogRecruiterIds.includes(r.id)
                  const isOwner = r.id === dialogOwnerId

                  return (
                    <div
                      key={r.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 ${
                        checked
                          ? isOwner
                            ? 'bg-emerald-50/80 ring-1 ring-emerald-200'
                            : 'bg-slate-50 ring-1 ring-slate-200'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      {/* Checkbox */}
                      <label className="relative flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            let updated: string[]
                            if (checked) {
                              updated = dialogRecruiterIds.filter((id) => id !== r.id)
                              if (r.id === dialogOwnerId) {
                                setDialogOwnerId(updated.length > 0 ? updated[0] : null)
                              }
                            } else {
                              updated = [...dialogRecruiterIds, r.id]
                              if (!dialogOwnerId) setDialogOwnerId(r.id)
                            }
                            setDialogRecruiterIds(updated)
                          }}
                          className="peer sr-only"
                        />
                        <div className={`w-[18px] h-[18px] rounded-md border-2 flex items-center justify-center transition-all ${
                          checked
                            ? 'bg-slate-800 border-slate-800'
                            : 'border-gray-300 hover:border-gray-400'
                        }`}>
                          {checked && (
                            <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                      </label>

                      {/* Name & role */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isOwner ? 'text-emerald-800' : 'text-gray-800'}`}>{r.full_name}</p>
                      </div>
                      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide shrink-0">{r.role}</span>

                      {/* Star owner toggle — only visible when checked */}
                      {checked && (
                        <button
                          type="button"
                          title={isOwner ? 'Job Owner' : 'Set as Owner'}
                          className={`w-7 h-7 flex items-center justify-center rounded-full transition-all shrink-0 ${
                            isOwner
                              ? 'bg-emerald-100 text-emerald-600 ring-1 ring-emerald-300 shadow-sm'
                              : 'text-gray-300 hover:text-amber-500 hover:bg-amber-50'
                          }`}
                          onClick={() => setDialogOwnerId(r.id)}
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={isOwner ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={isOwner ? 0 : 2}>
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </ScrollArea>

            {/* Selected badges */}
            {dialogRecruiterIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-gray-100">
                {dialogRecruiterIds.map((id) => {
                  const r = allRecruiters.find((rec) => rec.id === id)
                  const isOwner = id === dialogOwnerId
                  return (
                    <span
                      key={id}
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full transition-all ${
                        isOwner
                          ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {isOwner && <svg className="w-2.5 h-2.5 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" /></svg>}
                      {r?.full_name ?? id.slice(0, 8)}
                      <button
                        className="ml-0.5 text-gray-400 hover:text-red-500 transition-colors"
                        onClick={() => {
                          const updated = dialogRecruiterIds.filter((rid) => rid !== id)
                          setDialogRecruiterIds(updated)
                          if (id === dialogOwnerId) setDialogOwnerId(updated.length > 0 ? updated[0] : null)
                        }}
                      >
                        &times;
                      </button>
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
            <Button variant="ghost" size="sm" onClick={() => setManageRecruitersOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={savingRecruiters}
              onClick={saveRecruiters}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5"
            >
              {savingRecruiters ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={(open) => { if (!open) { setRejectOpen(false); setRejectApp(null); setRejectStageId(null); loadData() } }}>
        <DialogContent className="rounded-xl sm:max-w-[420px] p-5">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-[15px]">Reject Application</DialogTitle>
            <DialogDescription className="text-[12px]">
              Provide a reason for rejecting {rejectApp?.candidate?.first_name}&apos;s application.
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
            <Button variant="outline" onClick={() => { setRejectOpen(false); setRejectApp(null); setRejectStageId(null); loadData() }} className="text-[12px] h-8 rounded-lg">Cancel</Button>
            <Button variant="outline" className="text-rose-600 border-rose-300 hover:bg-rose-50 text-[12px] h-8 rounded-lg" onClick={() => handleReject(false)} disabled={rejecting || !rejectReason.trim()}>
              {rejecting ? 'Processing...' : 'Reject'}
            </Button>
            <Button className="bg-rose-600 hover:bg-rose-700 text-white text-[12px] h-8 rounded-lg" onClick={() => handleReject(true)} disabled={rejecting || !rejectReason.trim()}>
              {rejecting ? 'Processing...' : 'Reject & Send Email'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hire Block Dialog */}
      <Dialog open={hireBlockOpen} onOpenChange={setHireBlockOpen}>
        <DialogContent className="rounded-xl sm:max-w-[400px] p-5">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-[15px]">Cannot Move to Hired</DialogTitle>
            <DialogDescription className="text-[12px]">
              {hireBlockApp?.candidate?.first_name} {hireBlockApp?.candidate?.last_name} does not have an accepted offer yet. Please create and get the offer accepted before moving to Hired.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setHireBlockOpen(false)} className="text-[12px] h-8 rounded-lg">
              Close
            </Button>
            <Link href={`/applications/${hireBlockApp?.id}?tab=offer&from=applications&status=${statusTab}`}>
              <Button className="text-[12px] h-8 rounded-lg" onClick={() => setHireBlockOpen(false)}>
                Go to Offer
              </Button>
            </Link>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rollback Confirmation Dialog */}
      <Dialog open={rollbackOpen} onOpenChange={setRollbackOpen}>
        <DialogContent className="rounded-xl sm:max-w-[400px] p-5">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <RotateCcw className="w-4 h-4" />
              Rollback Candidate
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              Are you sure you want to rollback <strong>{rollbackApp?.candidate?.first_name} {rollbackApp?.candidate?.last_name}</strong> to their previous pipeline stage? This will change their status from rejected back to active.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => { setRollbackOpen(false); setRollbackApp(null) }} className="text-[12px] h-8 rounded-lg">
              Cancel
            </Button>
            <Button onClick={handleRollback} disabled={rollingBack} className="text-[12px] h-8 rounded-lg">
              {rollingBack ? 'Rolling back…' : 'Rollback'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
