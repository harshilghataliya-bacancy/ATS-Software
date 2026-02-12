import { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DateRange {
  from: string // ISO date string
  to: string   // ISO date string
}

// ---------------------------------------------------------------------------
// Time to Hire
// ---------------------------------------------------------------------------

export async function getTimeToHire(
  supabase: SupabaseClient,
  orgId: string,
  dateRange?: DateRange
) {
  let query = supabase
    .from('applications')
    .select('applied_at, hired_at, job:jobs(id, title, department)')
    .eq('organization_id', orgId)
    .eq('status', 'hired')
    .not('hired_at', 'is', null)
    .not('applied_at', 'is', null)
    .is('deleted_at', null)

  if (dateRange) {
    query = query
      .gte('hired_at', dateRange.from)
      .lte('hired_at', dateRange.to)
  }

  const { data, error } = await query

  if (error) {
    return { data: null, error }
  }

  if (!data || data.length === 0) {
    return {
      data: { average_days: 0, total_hires: 0, breakdown: [] },
      error: null,
    }
  }

  // Calculate days between applied_at and hired_at for each hire
  const hires = data.map((app) => {
    const appliedDate = new Date(app.applied_at)
    const hiredDate = new Date(app.hired_at)
    const diffMs = hiredDate.getTime() - appliedDate.getTime()
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    return { ...app, days_to_hire: days }
  })

  const totalDays = hires.reduce((sum, h) => sum + h.days_to_hire, 0)
  const averageDays = Math.round(totalDays / hires.length)

  // Group by department
  const byDepartment = hires.reduce<Record<string, { total_days: number; count: number }>>(
    (acc, hire) => {
      const dept = (hire.job as { department?: string })?.department ?? 'Unknown'
      if (!acc[dept]) {
        acc[dept] = { total_days: 0, count: 0 }
      }
      acc[dept].total_days += hire.days_to_hire
      acc[dept].count += 1
      return acc
    },
    {}
  )

  const breakdown = Object.entries(byDepartment).map(([department, stats]) => ({
    department,
    average_days: Math.round(stats.total_days / stats.count),
    total_hires: stats.count,
  }))

  return {
    data: {
      average_days: averageDays,
      total_hires: hires.length,
      breakdown,
    },
    error: null,
  }
}

// ---------------------------------------------------------------------------
// Pipeline Conversion
// ---------------------------------------------------------------------------

export async function getPipelineConversion(
  supabase: SupabaseClient,
  orgId: string,
  jobId?: string
) {
  // Get pipeline stages (either for a specific job or all jobs)
  let stagesQuery = supabase
    .from('pipeline_stages')
    .select('id, name, display_order, stage_type, job_id')
    .eq('organization_id', orgId)
    .order('display_order', { ascending: true })

  if (jobId) {
    stagesQuery = stagesQuery.eq('job_id', jobId)
  }

  const { data: stages, error: stagesError } = await stagesQuery

  if (stagesError) {
    return { data: null, error: stagesError }
  }

  // Get movement counts for each stage
  const { data: movements, error: movementsError } = await supabase
    .from('stage_movements')
    .select('from_stage_id, to_stage_id')
    .eq('organization_id', orgId)

  if (movementsError) {
    return { data: null, error: movementsError }
  }

  // Count applications currently in each stage
  let appsQuery = supabase
    .from('applications')
    .select('current_stage_id')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .is('deleted_at', null)

  if (jobId) {
    appsQuery = appsQuery.eq('job_id', jobId)
  }

  const { data: applications, error: appsError } = await appsQuery

  if (appsError) {
    return { data: null, error: appsError }
  }

  // Build conversion data
  const stageIds = new Set(stages?.map((s) => s.id) ?? [])
  const stageAppCounts = new Map<string, number>()

  // Count current applications per stage
  applications?.forEach((app) => {
    if (app.current_stage_id) {
      stageAppCounts.set(
        app.current_stage_id,
        (stageAppCounts.get(app.current_stage_id) ?? 0) + 1
      )
    }
  })

  // Count movements into each stage
  const stageEntryCounts = new Map<string, number>()
  movements?.forEach((m) => {
    if (stageIds.has(m.to_stage_id)) {
      stageEntryCounts.set(
        m.to_stage_id,
        (stageEntryCounts.get(m.to_stage_id) ?? 0) + 1
      )
    }
  })

  // Deduplicate stages by display_order for aggregated view
  type StageRow = NonNullable<typeof stages>[number]
  const uniqueStages: StageRow[] = jobId
    ? (stages ?? [])
    : Array.from(
        (stages ?? []).reduce<Map<number, StageRow>>((acc, stage) => {
          if (!acc.has(stage.display_order)) {
            acc.set(stage.display_order, stage)
          }
          return acc
        }, new Map()).values()
      )

  const conversion = uniqueStages.map((stage, index) => {
    const currentCount = stageAppCounts.get(stage.id) ?? 0
    const entryCount = stageEntryCounts.get(stage.id) ?? 0
    const totalReached = currentCount + entryCount

    return {
      stage_name: stage.name,
      stage_type: stage.stage_type,
      display_order: stage.display_order,
      current_count: currentCount,
      total_reached: totalReached,
      conversion_rate:
        index === 0
          ? 100
          : totalReached > 0
            ? Math.round((totalReached / (applications?.length || 1)) * 100)
            : 0,
    }
  })

  return { data: conversion, error: null }
}

// ---------------------------------------------------------------------------
// Source Breakdown
// ---------------------------------------------------------------------------

export async function getSourceBreakdown(
  supabase: SupabaseClient,
  orgId: string,
  dateRange?: DateRange
) {
  let query = supabase
    .from('applications')
    .select('source, status')
    .eq('organization_id', orgId)
    .is('deleted_at', null)

  if (dateRange) {
    query = query
      .gte('created_at', dateRange.from)
      .lte('created_at', dateRange.to)
  }

  const { data, error } = await query

  if (error) {
    return { data: null, error }
  }

  // Group by source
  const sourceMap = new Map<
    string,
    { total: number; hired: number; rejected: number; active: number }
  >()

  data?.forEach((app) => {
    const source = app.source ?? 'unknown'
    const existing = sourceMap.get(source) ?? {
      total: 0,
      hired: 0,
      rejected: 0,
      active: 0,
    }

    existing.total += 1
    if (app.status === 'hired') existing.hired += 1
    else if (app.status === 'rejected') existing.rejected += 1
    else if (app.status === 'active') existing.active += 1

    sourceMap.set(source, existing)
  })

  const breakdown = Array.from(sourceMap.entries())
    .map(([source, stats]) => ({
      source,
      ...stats,
      hire_rate:
        stats.total > 0 ? Math.round((stats.hired / stats.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)

  return { data: breakdown, error: null }
}

// ---------------------------------------------------------------------------
// Dashboard Stats
// ---------------------------------------------------------------------------

export async function getDashboardStats(
  supabase: SupabaseClient,
  orgId: string
) {
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 7)

  // Run all queries in parallel
  const [openJobsResult, activeCandidatesResult, weekInterviewsResult, pendingOffersResult] =
    await Promise.all([
      // Open jobs count
      supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('status', 'published')
        .is('deleted_at', null),

      // Active candidates (candidates with at least one active application)
      supabase
        .from('applications')
        .select('candidate_id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .is('deleted_at', null),

      // Interviews this week
      supabase
        .from('interviews')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('status', 'scheduled')
        .gte('scheduled_at', startOfWeek.toISOString())
        .lt('scheduled_at', endOfWeek.toISOString()),

      // Pending offers (sent but not responded)
      supabase
        .from('offers')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('status', 'sent'),
    ])

  const error =
    openJobsResult.error ||
    activeCandidatesResult.error ||
    weekInterviewsResult.error ||
    pendingOffersResult.error

  if (error) {
    return { data: null, error }
  }

  return {
    data: {
      open_jobs: openJobsResult.count ?? 0,
      active_candidates: activeCandidatesResult.count ?? 0,
      interviews_this_week: weekInterviewsResult.count ?? 0,
      pending_offers: pendingOffersResult.count ?? 0,
    },
    error: null,
  }
}
