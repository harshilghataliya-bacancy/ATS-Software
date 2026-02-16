'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getApplicationsForJob, moveApplication } from '@/lib/services/applications'
import { getJobById } from '@/lib/services/jobs'
import { APPLICATION_STATUS_CONFIG } from '@/lib/constants'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Candidate {
  id: string
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  avatar_url?: string | null
  tags?: string[] | null
}

interface ApplicationCard {
  id: string
  candidate: Candidate
  status: string
  current_stage_id: string
  applied_at: string
  source?: string
}

interface PipelineStage {
  id: string
  name: string
  stage_type: string
  display_order: number
  applications: ApplicationCard[]
}

// ---------------------------------------------------------------------------
// Stage Colors
// ---------------------------------------------------------------------------

const STAGE_COLORS: Record<string, string> = {
  applied: 'border-t-blue-400',
  screening: 'border-t-yellow-400',
  interview: 'border-t-purple-400',
  assessment: 'border-t-orange-400',
  offer: 'border-t-green-400',
  hired: 'border-t-emerald-500',
  rejected: 'border-t-red-400',
}

// ---------------------------------------------------------------------------
// Droppable Column
// ---------------------------------------------------------------------------

function StageColumn({ stage, children }: { stage: PipelineStage; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: stage.id })

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-72 min-w-[18rem] rounded-lg border border-t-4 bg-gray-50/50 ${
        STAGE_COLORS[stage.stage_type] ?? 'border-t-gray-400'
      } ${isOver ? 'ring-2 ring-blue-400 bg-blue-50/30' : ''}`}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b bg-white rounded-t-lg">
        <h3 className="text-sm font-semibold text-gray-700">{stage.name}</h3>
        <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
          {stage.applications.length}
        </span>
      </div>
      <ScrollArea className="flex-1 p-2" style={{ maxHeight: 'calc(100vh - 220px)' }}>
        <div className="space-y-2 min-h-[60px]">
          {children}
        </div>
      </ScrollArea>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Application Card (display only, used in DragOverlay too)
// ---------------------------------------------------------------------------

function ApplicationCardUI({
  app,
  isDragging,
}: {
  app: ApplicationCard
  isDragging?: boolean
}) {
  const initials = `${app.candidate.first_name?.[0] ?? ''}${app.candidate.last_name?.[0] ?? ''}`.toUpperCase()
  const statusConfig = APPLICATION_STATUS_CONFIG[app.status as keyof typeof APPLICATION_STATUS_CONFIG]

  return (
    <Card
      className={`cursor-grab active:cursor-grabbing transition-shadow ${
        isDragging ? 'shadow-lg ring-2 ring-blue-300 opacity-90' : 'hover:shadow-md'
      }`}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {app.candidate.first_name} {app.candidate.last_name}
            </p>
            <p className="text-xs text-gray-500 truncate">{app.candidate.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          {statusConfig && (
            <Badge variant={statusConfig.variant} className="text-[10px] px-1.5 py-0">
              {statusConfig.label}
            </Badge>
          )}
          {app.candidate.tags?.slice(0, 2).map((tag) => (
            <span key={tag} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Draggable Application Card
// ---------------------------------------------------------------------------

function DraggableApplicationCard({ app }: { app: ApplicationCard }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: app.id,
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <ApplicationCardUI app={app} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Pipeline Page
// ---------------------------------------------------------------------------

export default function PipelinePage() {
  const params = useParams()
  const { user, organization, isLoading: userLoading } = useUser()
  const { canManageJobs } = useRole()
  const [job, setJob] = useState<Record<string, unknown> | null>(null)
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeApp, setActiveApp] = useState<ApplicationCard | null>(null)
  const [moving, setMoving] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  const loadPipeline = useCallback(async () => {
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
      setStages(pipelineResult.data.stages as PipelineStage[])
    }

    setLoading(false)
  }, [organization, params.id])

  useEffect(() => {
    if (!organization) return
    loadPipeline()
  }, [organization, loadPipeline])

  function handleDragStart(event: DragStartEvent) {
    const appId = event.active.id as string
    for (const stage of stages) {
      const found = stage.applications.find((a) => a.id === appId)
      if (found) {
        setActiveApp(found)
        break
      }
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveApp(null)

    if (!over || !user || !organization || !canManageJobs) return

    const appId = active.id as string
    const targetStageId = over.id as string

    // Find source stage
    let sourceStageId: string | null = null
    for (const stage of stages) {
      if (stage.applications.find((a) => a.id === appId)) {
        sourceStageId = stage.id
        break
      }
    }

    if (!sourceStageId || sourceStageId === targetStageId) return

    // Optimistic UI update
    setStages((prev) => {
      const app = prev
        .flatMap((s) => s.applications)
        .find((a) => a.id === appId)

      if (!app) return prev

      return prev.map((stage) => {
        if (stage.id === sourceStageId) {
          return { ...stage, applications: stage.applications.filter((a) => a.id !== appId) }
        }
        if (stage.id === targetStageId) {
          return { ...stage, applications: [...stage.applications, { ...app, current_stage_id: targetStageId }] }
        }
        return stage
      })
    })

    // Server update
    setMoving(true)
    const supabase = createClient()
    const { error: moveError } = await moveApplication(
      supabase,
      appId,
      organization.id,
      targetStageId,
      user.id
    )

    if (moveError) {
      setError(moveError.message)
      await loadPipeline()
    }
    setMoving(false)
  }

  if (userLoading || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-96 w-72" />
          ))}
        </div>
      </div>
    )
  }

  if (!job) {
    return <div className="text-center py-12 text-gray-500">Job not found</div>
  }

  const totalApps = stages.reduce((sum, s) => sum + s.applications.length, 0)

  return (
    <div className="h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{job.title as string}</h1>
            <Badge variant="secondary">{totalApps} candidate{totalApps !== 1 ? 's' : ''}</Badge>
            {moving && (
              <span className="text-xs text-gray-400 animate-pulse">Saving...</span>
            )}
          </div>
          <p className="text-gray-500 mt-0.5 text-sm">Hiring Pipeline</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/jobs/${params.id}/applications`}>
            <Button variant="outline" size="sm">Table View</Button>
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
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md mb-4">{error}</div>
      )}

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 220px)' }}>
          {stages.map((stage) => (
            <StageColumn key={stage.id} stage={stage}>
              {stage.applications.map((app) => (
                canManageJobs
                  ? <DraggableApplicationCard key={app.id} app={app} />
                  : <ApplicationCardUI key={app.id} app={app} />
              ))}
              {stage.applications.length === 0 && (
                <div className="flex items-center justify-center h-16 text-xs text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                  Drop here
                </div>
              )}
            </StageColumn>
          ))}
        </div>

        <DragOverlay>
          {activeApp ? <ApplicationCardUI app={activeApp} isDragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
