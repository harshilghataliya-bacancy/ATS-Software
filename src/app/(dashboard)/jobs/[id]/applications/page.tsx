'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getApplicationsForJob, moveApplication } from '@/lib/services/applications'
import { getJobById } from '@/lib/services/jobs'
import { logActivity } from '@/lib/services/activity'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ApplicationsPage() {
  const params = useParams()
  const { user, organization, isLoading: userLoading } = useUser()
  const { canManageJobs } = useRole()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [job, setJob] = useState<any>(null)
  const [stages, setStages] = useState<StageGroup[]>([])
  const [allApps, setAllApps] = useState<ApplicationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const fetchScores = useCallback(async (): Promise<Record<string, MatchScore>> => {
    if (!organization) return {}
    try {
      const res = await fetch(
        `/api/ai-matching?job_id=${params.id}`
      )
      if (res.ok) {
        const { data } = await res.json()
        if (data) {
          const scoreMap: Record<string, MatchScore> = {}
          for (const s of data) {
            scoreMap[s.application_id] = s
          }
          setMatchScores(scoreMap)
          return scoreMap
        }
      }
    } catch {
      // Silently fail - scores are supplementary
    }
    return {}
  }, [organization, params.id])

  // Stop polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  const startScorePolling = useCallback((appIds: string[]) => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    const appIdSet = new Set(appIds)

    pollingRef.current = setInterval(async () => {
      const scores = await fetchScores()
      // Check if all apps are now scored
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

    if (jobResult.error) {
      setError(jobResult.error.message)
    } else {
      setJob(jobResult.data)
    }

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

    // Load existing scores first
    const existingScores = await fetchScores()

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
          body: JSON.stringify({
            candidate_ids: unparsedCandidateIds,
          }),
        }).catch(() => {})
      }
    }

    // Auto-score: only fire batch if there are unscored apps
    const unscoredAppIds = flatApps
      .map((a) => a.id)
      .filter((id) => !existingScores[id])

    if (unscoredAppIds.length > 0 && !batchFiredRef.current) {
      batchFiredRef.current = true
      setBatchScoring(true)

      // Start polling for incremental score updates
      startScorePolling(unscoredAppIds)

      fetch('/api/ai-matching/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: params.id,
        }),
      }).then(async (res) => {
        if (!res.ok) {
          // Scoring failed (disabled, error, etc.) — stop polling
          if (pollingRef.current) clearInterval(pollingRef.current)
          pollingRef.current = null
          setBatchScoring(false)
          return
        }
        // Final fetch after batch completes to catch any remaining
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
  }, [organization, params.id, filterStatus, fetchScores, startScorePolling])

  useEffect(() => {
    if (!organization) return
    batchFiredRef.current = false
    loadData()
  }, [organization, loadData])

  async function handleStageChange(app: ApplicationRow, newStageId: string) {
    if (!user || !organization || newStageId === app.current_stage_id) return

    const targetStage = stages.find((s) => s.id === newStageId)

    // Optimistic update
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
      // Auto-reject: update status + send rejection email + move stage
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
      // Normal stage move
      const supabase = createClient()
      const { error: moveError } = await moveApplication(
        supabase, app.id, organization.id, newStageId, user.id
      )

      if (moveError) {
        setError(moveError.message)
        await loadData()
        return
      }
    }

    const supabase = createClient()
    await logActivity(
      supabase,
      organization.id,
      user.id,
      'application',
      app.id,
      'stage_changed',
      {
        to_stage: targetStage?.name,
        to_stage_id: newStageId,
        candidate_name: `${app.candidate.first_name} ${app.candidate.last_name}`,
      }
    )
  }

  async function handleBatchScore() {
    if (!organization) return
    setBatchScoring(true)
    setError(null)

    // Re-score ALL apps when manually triggered (uses updated algorithm)
    const allAppIds = allApps.map((a) => a.id)
    if (allAppIds.length > 0) {
      startScorePolling(allAppIds)
    }

    try {
      const res = await fetch('/api/ai-matching/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: params.id,
          rescore: true,
        }),
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
      {/* Back link */}
      <button onClick={() => window.history.back()} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        Back
      </button>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
            <Badge variant="secondary">{allApps.length} applicant{allApps.length !== 1 ? 's' : ''}</Badge>
            {batchScoring && <Badge variant="outline" className="text-[10px] animate-pulse">AI Scoring...</Badge>}
          </div>
          <p className="text-gray-500 mt-0.5 text-sm">Applications Table View</p>
        </div>
        <div className="flex gap-2">
          {allApps.length > 0 && canManageJobs && (
            <Button
              variant="default"
              size="sm"
              disabled={batchScoring}
              onClick={handleBatchScore}
            >
              {batchScoring ? 'Scoring...' : 'AI Re-Score All'}
            </Button>
          )}
          <Link href={`/jobs/${params.id}/pipeline`}>
            <Button variant="outline" size="sm">Pipeline View</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>
      )}

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
            variant="ghost"
            size="sm"
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
              // Stage filter
              if (filterStage !== 'all' && app.current_stage_id !== filterStage) return false
              // Score filter
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
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Current Stage</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredApps.map((app) => (
                <TableRow key={app.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/applications/${app.id}?from=applications`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {app.candidate.first_name} {app.candidate.last_name}
                      </Link>
                      <Link
                        href={`/candidates/${app.candidate.id}`}
                        className="text-[10px] text-gray-400 hover:text-gray-700 hover:underline"
                      >
                        Profile
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] ${
                      app.status === 'active' ? 'bg-green-100 text-green-800' :
                      app.status === 'rejected' ? 'bg-red-100 text-red-800' :
                      app.status === 'hired' ? 'bg-emerald-100 text-emerald-800' :
                      app.status === 'withdrawn' ? 'bg-gray-100 text-gray-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {app.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const score = matchScores[app.id]
                      if (!score) {
                        return batchScoring
                          ? <span className="text-xs text-gray-400 animate-pulse">Scoring...</span>
                          : <span className="text-xs text-gray-400">-</span>
                      }
                      return (
                        <button
                          onClick={() => setScoreDetailApp(app)}
                          className="flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80"
                        >
                          <Badge className={`${getScoreBadgeColor(score.overall_score)} text-xs font-semibold`}>
                            {score.overall_score}%
                          </Badge>
                          <Progress
                            value={score.overall_score}
                            className={`h-1 w-14 ${getProgressColor(score.overall_score)}`}
                          />
                        </button>
                      )
                    })()}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {app.candidate.email}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {app.candidate.phone || '-'}
                  </TableCell>
                  <TableCell>
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
                            <SelectItem key={stage.id} value={stage.id}>
                              {stage.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        {app.current_stage?.name ?? '-'}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {new Date(app.applied_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/applications/${app.id}?from=applications`}
                      className="text-xs text-blue-600 hover:underline font-medium"
                    >
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
            )
          })()}
        </div>
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
