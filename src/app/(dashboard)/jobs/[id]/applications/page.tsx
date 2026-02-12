'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useUser } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getApplicationsForJob, moveApplication } from '@/lib/services/applications'
import { getJobById } from '@/lib/services/jobs'
import { logActivity } from '@/lib/services/activity'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ScheduleInterviewDialog } from './schedule-interview-dialog'
import { InterviewFeedbackDialog } from './interview-feedback-dialog'
import { CreateOfferDialog } from '@/components/offers/create-offer-dialog'

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

    if (pipelineResult.error) {
      setError(pipelineResult.error.message)
    } else if (pipelineResult.data) {
      const stageData = pipelineResult.data.stages as StageGroup[]
      setStages(stageData)
      // Flatten all applications
      const flat = stageData.flatMap((s) =>
        s.applications.map((a) => ({
          ...a,
          current_stage: { id: s.id, name: s.name, stage_type: s.stage_type, display_order: s.display_order },
        }))
      )
      setAllApps(flat)
    }

    setLoading(false)
  }, [organization, params.id])

  useEffect(() => {
    if (!organization) return
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
          </div>
          <p className="text-gray-500 mt-0.5 text-sm">Applications Table View</p>
        </div>
        <div className="flex gap-2">
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

      {/* Table */}
      {allApps.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No applications yet for this job.</div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Current Stage</TableHead>
                <TableHead>Interview</TableHead>
                <TableHead>Offer</TableHead>
                <TableHead>Resume</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allApps.map((app) => (
                <TableRow key={app.id}>
                  <TableCell>
                    <Link
                      href={`/candidates/${app.candidate.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {app.candidate.first_name} {app.candidate.last_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {app.candidate.email}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {app.candidate.phone || '-'}
                  </TableCell>
                  <TableCell>
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
                  <TableCell>
                    {renderOfferActions(app)}
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
    </div>
  )
}
