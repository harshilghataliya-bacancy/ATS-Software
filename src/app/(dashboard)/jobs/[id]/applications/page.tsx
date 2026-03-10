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
import { getApplicationsForJob, moveApplication } from '@/lib/services/applications'
import { getJobById } from '@/lib/services/jobs'
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
import { ScoreBreakdownDialog } from './score-breakdown-dialog'

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

// ---------------------------------------------------------------------------
// Pipeline: Droppable stage column
// ---------------------------------------------------------------------------

function StageColumn({ stage, children }: { stage: StageGroup; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: stage.id })

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-72 min-w-[18rem] rounded-lg border border-t-4 bg-gray-50/50 ${
        STAGE_COLORS[stage.stage_type] ?? 'border-t-gray-400'
      } ${isOver ? 'ring-2 ring-blue-400 bg-blue-50/20' : ''}`}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b bg-white rounded-t-lg">
        <h3 className="text-sm font-semibold text-gray-700">{stage.name}</h3>
        <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
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
  const initials = `${app.candidate.first_name?.[0] ?? ''}${app.candidate.last_name?.[0] ?? ''}`.toUpperCase()
  const statusConfig = APPLICATION_STATUS_CONFIG[app.status as keyof typeof APPLICATION_STATUS_CONFIG]

  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 transition-shadow ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${
        isDragging ? 'shadow-lg ring-2 ring-blue-300 opacity-90' : 'hover:shadow-md'
      }`}
    >
      <div className="p-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <Link
              href={`/applications/${app.id}?from=applications`}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-medium text-gray-900 truncate block hover:text-blue-600 transition-colors"
            >
              {app.candidate.first_name} {app.candidate.last_name}
            </Link>
            <p className="text-xs text-gray-500 truncate">{app.candidate.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {statusConfig && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700`}>
              {statusConfig.label}
            </span>
          )}
          {app.candidate.tags?.slice(0, 2).map((tag) => (
            <span key={tag} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5">
          {new Date(app.applied_at).toLocaleDateString()}
        </p>
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
// View toggle icons
// ---------------------------------------------------------------------------

function IconTable({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="1" y="1" width="13" height="13" rx="1.5" />
      <line x1="1" y1="5" x2="14" y2="5" />
      <line x1="1" y1="9" x2="14" y2="9" />
      <line x1="5.5" y1="5" x2="5.5" y2="14" />
      {active && <rect x="1" y="1" width="13" height="4" rx="1.5" fill="currentColor" opacity="0.15" />}
    </svg>
  )
}

function IconKanban({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="3.5" height="9" rx="1" fill={active ? 'currentColor' : 'none'} opacity={active ? 0.2 : 1} />
      <rect x="5.75" y="1" width="3.5" height="12" rx="1" fill={active ? 'currentColor' : 'none'} opacity={active ? 0.2 : 1} />
      <rect x="10.5" y="1" width="3.5" height="6" rx="1" fill={active ? 'currentColor' : 'none'} opacity={active ? 0.2 : 1} />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ApplicationsPage() {
  const params = useParams()
  const router = useRouter()
  const { user, organization, isLoading: userLoading } = useUser()
  const { canManageJobs } = useRole()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [job, setJob] = useState<any>(null)
  const [stages, setStages] = useState<StageGroup[]>([])
  const [allApps, setAllApps] = useState<ApplicationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('table')

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('active')
  const [filterStage, setFilterStage] = useState<string>('all')
  const [filterScore, setFilterScore] = useState<string>('all')

  // AI Match Scores
  const [matchScores, setMatchScores] = useState<Record<string, MatchScore>>({})
  const [batchScoring, setBatchScoring] = useState(false)
  const [scoreDetailApp, setScoreDetailApp] = useState<ApplicationRow | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const batchFiredRef = useRef(false)

  // Assessment invitations
  const [assessmentInvitations, setAssessmentInvitations] = useState<Record<string, AssessmentInv>>({})

  // Pipeline drag-and-drop state
  const [activeApp, setActiveApp] = useState<ApplicationRow | null>(null)
  const [moving, setMoving] = useState(false)

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

  async function handleStageChange(app: ApplicationRow, newStageId: string) {
    if (!user || !organization || newStageId === app.current_stage_id) return

    const targetStage = stages.find((s) => s.id === newStageId)

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
      try {
        const res = await fetch('/api/applications/reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId: app.id, reason: '', stageId: newStageId }),
        })
        if (!res.ok) {
          const data = await res.json()
          setError(data.error || 'Failed to reject application')
          await loadData()
          return
        }
      } catch {
        setError('Failed to reject application')
        await loadData()
        return
      }
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

  // Compute pipeline stages from allApps (always fresh — reflects optimistic stage changes)
  const pipelineStages = stages.map((stage) => ({
    ...stage,
    applications: allApps.filter((a) => a.current_stage_id === stage.id),
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
      {/* Back */}
      <button
        onClick={() => window.history.back()}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back
      </button>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{allApps.length} applicant{allApps.length !== 1 ? 's' : ''}</span>
            {batchScoring && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-gray-200 text-gray-500 animate-pulse">AI Scoring...</span>}
            {moving && <span className="text-xs text-gray-400 animate-pulse">Saving…</span>}
          </div>
          <p className="text-gray-500 mt-0.5 text-sm">
            {viewMode === 'table' ? 'Applications · Table View' : 'Applications · Pipeline View'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
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
              <IconTable active={viewMode === 'table'} />
            </button>
            <button
              onClick={() => setViewMode('pipeline')}
              title="Pipeline view"
              className={`flex items-center justify-center w-8 h-7 rounded-md transition-all duration-150 ${
                viewMode === 'pipeline'
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <IconKanban active={viewMode === 'pipeline'} />
            </button>
          </div>

          {allApps.length > 0 && canManageJobs && (
            <Button variant="default" size="sm" disabled={batchScoring} onClick={handleBatchScore}>
              {batchScoring ? 'Scoring...' : 'AI Re-Score All'}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>
      )}

      {/* ── TABLE VIEW ──────────────────────────────────────────────────────── */}
      {viewMode === 'table' && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Status:</span>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="hired">Hired</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {allApps.length > 0 && (
              <>
                {filterStatus !== 'rejected' && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Stage:</span>
                    <Select value={filterStage} onValueChange={setFilterStage}>
                      <SelectTrigger className="w-[160px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Stages</SelectItem>
                        {stages.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">AI Score:</span>
                  <Select value={filterScore} onValueChange={setFilterScore}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
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
            {(filterStatus !== 'active' || filterStage !== 'all' || filterScore !== 'all') && (
              <Button
                variant="ghost" size="sm"
                className="h-8 text-xs text-gray-500"
                onClick={() => { setFilterStatus('active'); setFilterStage('all'); setFilterScore('all') }}
              >
                Clear filters
              </Button>
            )}
          </div>

          {/* Table */}
          {allApps.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No applications yet for this job.</div>
          ) : (
            <div className="border rounded-lg">
              {(() => {
                const filteredApps = allApps.filter((app) => {
                  if (filterStage !== 'all' && app.current_stage_id !== filterStage) return false
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
                    <div className="text-center py-8 text-gray-500 text-sm">
                      No applications match the current filters.
                    </div>
                  )
                }

                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Candidate</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>AI Score</TableHead>
                        <TableHead>Assessment</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Current Stage</TableHead>
                        <TableHead>Applied</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredApps.map((app) => (
                        <TableRow
                          key={app.id}
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => router.push(`/applications/${app.id}?from=applications`)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">
                                {app.candidate.first_name} {app.candidate.last_name}
                              </span>
                              <Link
                                href={`/candidates/${app.candidate.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-[10px] text-gray-400 hover:text-gray-700 hover:underline"
                              >
                                Profile
                              </Link>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              app.status === 'active'    ? 'bg-green-100 text-green-800' :
                              app.status === 'rejected'  ? 'bg-red-100 text-red-800' :
                              app.status === 'hired'     ? 'bg-emerald-100 text-emerald-800' :
                              app.status === 'withdrawn' ? 'bg-gray-100 text-gray-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {app.status}
                            </span>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {(() => {
                              const score = matchScores[app.id]
                              if (!score) return batchScoring
                                ? <span className="text-xs text-gray-400 animate-pulse">Scoring...</span>
                                : <span className="text-xs text-gray-400">-</span>
                              return (
                                <button
                                  onClick={() => setScoreDetailApp(app)}
                                  className="flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80"
                                >
                                  <span className={`${getScoreBadgeColor(score.overall_score)} text-xs font-semibold px-2 py-0.5 rounded-full`}>
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
                              if (!inv) return <span className="text-xs text-gray-400">-</span>
                              const statusColors: Record<string, string> = {
                                invited: 'bg-amber-100 text-amber-700',
                                started: 'bg-blue-100 text-blue-700',
                                completed: 'bg-green-100 text-green-700',
                                expired: 'text-gray-500',
                              }
                              const statusLabels: Record<string, string> = {
                                invited: 'Sent', started: 'In Progress', completed: 'Completed', expired: 'Expired',
                              }
                              return (
                                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusColors[inv.status] || 'bg-gray-100 text-gray-700'}`}>
                                  {inv.status === 'completed' && inv.score != null
                                    ? `${Math.round(inv.score)}%`
                                    : statusLabels[inv.status] || inv.status}
                                </span>
                              )
                            })()}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">{app.candidate.email}</TableCell>
                          <TableCell className="text-sm text-gray-600">{app.candidate.phone || '-'}</TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {app.status === 'active' && canManageJobs ? (
                              <Select
                                value={app.current_stage_id}
                                onValueChange={(val) => handleStageChange(app, val)}
                              >
                                <SelectTrigger className="w-[160px] h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {stages.map((stage) => (
                                    <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-gray-200 text-gray-700">
                                {app.current_stage?.name ?? '-'}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {new Date(app.applied_at).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
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
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Status:</span>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="hired">Hired</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
              <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 280px)' }}>
                {pipelineStages.map((stage) => (
                  <StageColumn key={stage.id} stage={stage}>
                    {stage.applications.map((app) =>
                      canManageJobs && app.status === 'active'
                        ? <DraggableAppCard key={app.id} app={app} />
                        : <AppCardUI key={app.id} app={app} draggable={false} />
                    )}
                    {stage.applications.length === 0 && (
                      <div className="flex items-center justify-center h-16 text-xs text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
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
    </div>
  )
}
