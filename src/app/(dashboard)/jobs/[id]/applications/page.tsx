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
import { ScheduleInterviewDialog } from './schedule-interview-dialog'
import { InterviewFeedbackDialog } from './interview-feedback-dialog'
import { ScoreBreakdownDialog } from './score-breakdown-dialog'
import { CreateOfferDialog } from '@/components/offers/create-offer-dialog'
import { ScorecardDialog } from './scorecard-dialog'

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

interface InterviewInfo {
  id: string
  status: string
  scheduled_at: string
  interview_type: string
  duration_minutes: number
}

interface OfferInfo {
  id: string
  status: string
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
  interviews?: InterviewInfo[]
  offer_letters?: OfferInfo[]
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
  const { canManageJobs, canManageOffers } = useRole()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [job, setJob] = useState<any>(null)
  const [stages, setStages] = useState<StageGroup[]>([])
  const [allApps, setAllApps] = useState<ApplicationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Schedule interview state
  const [scheduleApp, setScheduleApp] = useState<ApplicationRow | null>(null)

  // Create offer state
  const [offerApp, setOfferApp] = useState<ApplicationRow | null>(null)

  // Feedback dialog state
  const [feedbackApp, setFeedbackApp] = useState<ApplicationRow | null>(null)

  // Scorecard dialog state
  const [scorecardApp, setScorecardApp] = useState<ApplicationRow | null>(null)

  // Filters
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
        `/api/ai-matching?job_id=${params.id}&organization_id=${organization.id}`
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
    const supabase = createClient()

    const [jobResult, pipelineResult] = await Promise.all([
      getJobById(supabase, params.id as string, organization.id),
      getApplicationsForJob(supabase, params.id as string, organization.id),
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
            organization_id: organization.id,
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
          organization_id: organization.id,
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
  }, [organization, params.id, fetchScores, startScorePolling])

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
            }
          : a
      )
    )

    const supabase = createClient()
    const { error: moveError } = await moveApplication(
      supabase, app.id, organization.id, newStageId, user.id
    )

    if (moveError) {
      setError(moveError.message)
      await loadData()
      return
    }

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

  async function handleOfferCreated() {
    if (!offerApp || !user || !organization) return

    // Find the "offer" stage and move the application there
    const offerStage = stages.find((s) => s.stage_type === 'offer')
    if (offerStage && offerApp.current_stage_id !== offerStage.id) {
      const supabase = createClient()
      await moveApplication(
        supabase, offerApp.id, organization.id, offerStage.id, user.id
      )
    }

    setOfferApp(null)
    await loadData()
  }

  async function handleSendOffer(offerId: string) {
    try {
      const res = await fetch(`/api/offers/${offerId}/send`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error || 'Failed to send offer')
        return
      }
      await loadData()
    } catch {
      setError('Failed to send offer')
    }
  }

  async function handleRespondOffer(offerId: string, status: 'accepted' | 'declined') {
    try {
      const res = await fetch(`/api/offers/${offerId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error || 'Failed to update offer')
        return
      }
      await loadData()
    } catch {
      setError('Failed to update offer')
    }
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
          organization_id: organization.id,
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

  function renderOfferActions(app: ApplicationRow) {
    const latestOffer = app.offer_letters?.[0]

    if (!latestOffer) {
      return (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setOfferApp(app)}
        >
          Create Offer
        </Button>
      )
    }

    switch (latestOffer.status) {
      case 'draft':
        return (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => handleSendOffer(latestOffer.id)}
          >
            Send Offer
          </Button>
        )
      case 'sent':
        return (
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="text-[10px]">Sent</Badge>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs text-green-700"
              onClick={() => handleRespondOffer(latestOffer.id, 'accepted')}
            >
              Accept
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs text-red-600"
              onClick={() => handleRespondOffer(latestOffer.id, 'declined')}
            >
              Decline
            </Button>
          </div>
        )
      case 'accepted':
        return <Badge className="bg-green-100 text-green-800 text-[10px]">Accepted</Badge>
      case 'declined':
        return <Badge variant="destructive" className="text-[10px]">Declined</Badge>
      case 'expired':
        return <Badge variant="outline" className="text-[10px] text-gray-500">Expired</Badge>
      default:
        return (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setOfferApp(app)}
          >
            Create Offer
          </Button>
        )
    }
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
          <Link href={`/jobs/${params.id}`}>
            <Button variant="outline" size="sm">Job Details</Button>
          </Link>
          <Link href="/jobs">
            <Button variant="outline" size="sm">All Jobs</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>
      )}

      {/* Filters */}
      {allApps.length > 0 && (
        <div className="flex items-center gap-3">
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
          {(filterStage !== 'all' || filterScore !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-gray-500"
              onClick={() => { setFilterStage('all'); setFilterScore('all') }}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

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
                <TableHead>AI Score</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Current Stage</TableHead>
                <TableHead>Interview</TableHead>
                {/* <TableHead>Scorecard</TableHead> */}
                <TableHead>Offer</TableHead>
                <TableHead>Resume</TableHead>
                <TableHead>Applied</TableHead>
                {canManageJobs && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredApps.map((app) => (
                <TableRow key={app.id}>
                  <TableCell>
                    <Link
                      href={`/candidates/${app.candidate.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {app.candidate.first_name} {app.candidate.last_name}
                    </Link>
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
                    {canManageJobs ? (
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
                  <TableCell>
                    {(() => {
                      const scheduled = app.interviews?.filter((i) => i.status === 'scheduled') ?? []
                      const completed = app.interviews?.filter((i) => i.status === 'completed') ?? []
                      return (
                        <div className="space-y-1">
                          {scheduled.length > 0 && scheduled.map((iv) => (
                            <Link key={iv.id} href={`/interviews/${iv.id}`}>
                              <Badge variant="default" className="text-[10px] cursor-pointer">
                                Scheduled {new Date(iv.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </Badge>
                            </Link>
                          ))}
                          {completed.length > 0 && (
                            <div className="flex items-center gap-1">
                              <Link href={`/interviews/${completed[0].id}`}>
                                <Badge variant="secondary" className="text-[10px] cursor-pointer">
                                  Completed ({completed.length})
                                </Badge>
                              </Link>
                              <button
                                onClick={() => setFeedbackApp(app)}
                                className="text-[11px] text-blue-600 hover:underline"
                              >
                                Feedback
                              </button>
                            </div>
                          )}
                          {scheduled.length === 0 && completed.length === 0 && (
                            <span className="text-gray-400 text-sm">-</span>
                          )}
                        </div>
                      )
                    })()}
                  </TableCell>
                  {/* Scorecard column hidden
                  <TableCell>
                    {(() => {
                      const completed = app.interviews?.filter((i) => i.status === 'completed') ?? []
                      if (completed.length === 0) return <span className="text-gray-400 text-sm">-</span>
                      return (
                        <button
                          onClick={() => setScorecardApp(app)}
                          className="text-blue-600 hover:underline text-xs cursor-pointer"
                        >
                          View Scorecard
                        </button>
                      )
                    })()}
                  </TableCell>
                  */}
                  <TableCell>
                    {canManageOffers ? renderOfferActions(app) : (
                      (() => {
                        const latestOffer = app.offer_letters?.[0]
                        if (!latestOffer) return <span className="text-gray-400 text-sm">-</span>
                        const statusLabels: Record<string, string> = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', expired: 'Expired' }
                        return <Badge variant="outline" className="text-xs">{statusLabels[latestOffer.status] ?? latestOffer.status}</Badge>
                      })()
                    )}
                  </TableCell>
                  <TableCell>
                    {app.candidate.resume_url ? (
                      <a
                        href={app.candidate.resume_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-sm"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-gray-400 text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {new Date(app.applied_at).toLocaleDateString()}
                  </TableCell>
                  {canManageJobs && (
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setScheduleApp(app)}
                      >
                        Schedule Interview
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
            )
          })()}
        </div>
      )}

      {/* Schedule Interview Dialog */}
      {scheduleApp && (
        <ScheduleInterviewDialog
          open={!!scheduleApp}
          onOpenChange={(open) => { if (!open) setScheduleApp(null) }}
          applicationId={scheduleApp.id}
          candidateName={`${scheduleApp.candidate.first_name} ${scheduleApp.candidate.last_name}`}
          candidateEmail={scheduleApp.candidate.email}
          jobTitle={job.title}
          onSuccess={loadData}
        />
      )}

      {/* Create Offer Dialog */}
      {offerApp && (
        <CreateOfferDialog
          open={!!offerApp}
          onOpenChange={(open) => { if (!open) setOfferApp(null) }}
          applicationId={offerApp.id}
          candidateName={`${offerApp.candidate.first_name} ${offerApp.candidate.last_name}`}
          jobTitle={job.title}
          department={job.department}
          autoSend
          onSuccess={handleOfferCreated}
        />
      )}

      {/* Interview Feedback Dialog */}
      {feedbackApp && organization && (
        <InterviewFeedbackDialog
          open={!!feedbackApp}
          onOpenChange={(open) => { if (!open) setFeedbackApp(null) }}
          applicationId={feedbackApp.id}
          candidateName={`${feedbackApp.candidate.first_name} ${feedbackApp.candidate.last_name}`}
          orgId={organization.id}
        />
      )}

      {/* Scorecard Dialog */}
      {scorecardApp && organization && (
        <ScorecardDialog
          open={!!scorecardApp}
          onOpenChange={(open) => { if (!open) setScorecardApp(null) }}
          applicationId={scorecardApp.id}
          candidateName={`${scorecardApp.candidate.first_name} ${scorecardApp.candidate.last_name}`}
          orgId={organization.id}
        />
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
