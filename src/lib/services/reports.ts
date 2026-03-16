import { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DateRange {
  from: string // ISO date string
  to: string   // ISO date string
}

// ---------------------------------------------------------------------------
// Time to Hire
// ---------------------------------------------------------------------------

export async function getTimeToHire(
  supabase: SupabaseClient,
  orgId: string,
  dateRange?: DateRange,
  jobId?: string
) {
  let query = supabase
    .from('applications')
    .select('applied_at, hired_at, job:jobs(id, title, department)')
    .eq('organization_id', orgId)
    .eq('status', 'hired')
    .is('deleted_at', null)
    .not('hired_at', 'is', null)
    .not('applied_at', 'is', null)

  if (jobId) query = query.eq('job_id', jobId)
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
  jobId?: string,
  dateRange?: DateRange
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
  let movQuery = supabase
    .from('stage_movements')
    .select('from_stage_id, to_stage_id')
    .eq('organization_id', orgId)

  if (dateRange) {
    movQuery = movQuery.gte('moved_at', dateRange.from).lte('moved_at', dateRange.to)
  }

  const { data: movements, error: movementsError } = await movQuery

  if (movementsError) {
    return { data: null, error: movementsError }
  }

  // Count applications currently in each stage (include active, hired, and rejected)
  let appsQuery = supabase
    .from('applications')
    .select('current_stage_id, status')
    .eq('organization_id', orgId)
    .in('status', ['active', 'hired', 'rejected'])
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

  // Build lookup: stage_type -> stage IDs (for mapping hired/rejected to correct stage)
  const stageTypeMap = new Map<string, string[]>()
  for (const s of stages ?? []) {
    const ids = stageTypeMap.get(s.stage_type) ?? []
    ids.push(s.id)
    stageTypeMap.set(s.stage_type, ids)
  }

  // Count current applications per stage
  // For hired/rejected apps, place them in the hired/rejected stage type
  applications?.forEach((app) => {
    let stageId = app.current_stage_id
    if (app.status === 'rejected') {
      const rejectedStages = stageTypeMap.get('rejected') ?? []
      if (rejectedStages.length > 0) stageId = rejectedStages[0]
    } else if (app.status === 'hired') {
      const hiredStages = stageTypeMap.get('hired') ?? []
      if (hiredStages.length > 0) stageId = hiredStages[0]
    }
    if (stageId) {
      stageAppCounts.set(stageId, (stageAppCounts.get(stageId) ?? 0) + 1)
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

  // Group stages by display_order so we aggregate counts across all jobs
  type StageRow = NonNullable<typeof stages>[number]
  const grouped = new Map<number, { name: string; stage_type: string; display_order: number; ids: string[] }>()
  for (const stage of (stages ?? []) as StageRow[]) {
    const existing = grouped.get(stage.display_order)
    if (existing) {
      existing.ids.push(stage.id)
    } else {
      grouped.set(stage.display_order, {
        name: stage.name,
        stage_type: stage.stage_type,
        display_order: stage.display_order,
        ids: [stage.id],
      })
    }
  }

  // When a specific job is selected, each stage is unique (1 id per group)
  // When viewing all jobs, ids array contains stage IDs from every job at that display_order
  const conversion = Array.from(grouped.values()).map((group, index) => {
    const currentCount = group.ids.reduce((sum, id) => sum + (stageAppCounts.get(id) ?? 0), 0)
    const entryCount = group.ids.reduce((sum, id) => sum + (stageEntryCounts.get(id) ?? 0), 0)
    const totalReached = currentCount + entryCount

    return {
      stage_name: group.name,
      stage_type: group.stage_type,
      display_order: group.display_order,
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
  dateRange?: DateRange,
  jobId?: string
) {
  let query = supabase
    .from('applications')
    .select('status, candidate:candidates(source)')
    .eq('organization_id', orgId)
    .is('deleted_at', null)

  if (jobId) query = query.eq('job_id', jobId)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const source = (app.candidate as any)?.source ?? 'unknown'
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
  orgId: string,
  jobId?: string
) {
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 7)

  // Run all queries in parallel
  let openJobsQuery = supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('status', 'published')
    .is('deleted_at', null)
  if (jobId) openJobsQuery = openJobsQuery.eq('id', jobId)

  let activeCandidatesQuery = supabase
    .from('applications')
    .select('candidate_id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .is('deleted_at', null)
  if (jobId) activeCandidatesQuery = activeCandidatesQuery.eq('job_id', jobId)

  let weekInterviewsQuery = supabase
    .from('interviews')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('status', 'scheduled')
    .is('deleted_at', null)
    .gte('scheduled_at', startOfWeek.toISOString())
    .lt('scheduled_at', endOfWeek.toISOString())
  if (jobId) weekInterviewsQuery = weekInterviewsQuery.eq('job_id', jobId)

  let pendingOffersQuery = supabase
    .from('offer_letters')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('status', 'sent')
    .is('deleted_at', null)
  if (jobId) pendingOffersQuery = pendingOffersQuery.eq('job_id', jobId)

  const [openJobsResult, activeCandidatesResult, weekInterviewsResult, pendingOffersResult] =
    await Promise.all([openJobsQuery, activeCandidatesQuery, weekInterviewsQuery, pendingOffersQuery])

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

// ---------------------------------------------------------------------------
// Offer Acceptance Rate
// ---------------------------------------------------------------------------

export async function getOfferAcceptanceRate(
  supabase: SupabaseClient,
  orgId: string,
  dateRange?: DateRange,
  jobId?: string
) {
  let query = supabase
    .from('offer_letters')
    .select('status')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .in('status', ['sent', 'accepted', 'declined', 'expired'])

  if (jobId) query = query.eq('job_id', jobId)
  if (dateRange) {
    query = query.gte('created_at', dateRange.from).lte('created_at', dateRange.to)
  }

  const { data, error } = await query

  if (error) {
    return { data: null, error }
  }

  const total_sent = data?.length ?? 0
  const accepted = data?.filter((o) => o.status === 'accepted').length ?? 0
  const declined = data?.filter((o) => o.status === 'declined').length ?? 0

  return {
    data: {
      total_sent,
      accepted,
      declined,
      acceptance_rate_pct: total_sent > 0 ? Math.round((accepted / total_sent) * 100) : 0,
    },
    error: null,
  }
}

// ---------------------------------------------------------------------------
// Recruiter Performance
// ---------------------------------------------------------------------------

export interface RecruiterMetrics {
  user_id: string
  candidates_added: number
  applications_managed: number
  interviews_scheduled: number
  offers_created: number
  hires_closed: number
  rejections: number
  offer_acceptance_rate: number
  avg_time_to_hire: number
}

export async function getRecruiterPerformance(
  supabase: SupabaseClient,
  orgId: string,
  recruiterId?: string,
  dateRange?: DateRange,
  jobId?: string
): Promise<{ data: RecruiterMetrics[] | null; error: unknown }> {
  // Parallel queries for all metrics
  let candidatesQuery = supabase
    .from('candidates')
    .select('created_by')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .not('created_by', 'is', null)
  if (dateRange) candidatesQuery = candidatesQuery.gte('created_at', dateRange.from).lte('created_at', dateRange.to)

  let jobsQuery = supabase
    .from('jobs')
    .select('id, created_by, assigned_to')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
  if (jobId) jobsQuery = jobsQuery.eq('id', jobId)

  let interviewsQuery = supabase
    .from('interviews')
    .select('created_by, job_id')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
  if (dateRange) interviewsQuery = interviewsQuery.gte('created_at', dateRange.from).lte('created_at', dateRange.to)

  let offersQuery = supabase
    .from('offer_letters')
    .select('created_by, status, job_id')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
  if (dateRange) offersQuery = offersQuery.gte('created_at', dateRange.from).lte('created_at', dateRange.to)

  let appsQuery = supabase
    .from('applications')
    .select('job_id, status, applied_at, hired_at, candidate_id')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
  if (jobId) appsQuery = appsQuery.eq('job_id', jobId)
  if (dateRange) appsQuery = appsQuery.gte('created_at', dateRange.from).lte('created_at', dateRange.to)

  const [candidatesRes, jobsRes, interviewsRes, offersRes, appsRes] = await Promise.all([
    candidatesQuery,
    jobsQuery,
    interviewsQuery,
    offersQuery,
    appsQuery,
  ])

  const err = candidatesRes.error || jobsRes.error || interviewsRes.error || offersRes.error || appsRes.error
  if (err) return { data: null, error: err }

  // Build job-to-recruiter mapping (a job can count for both created_by and assigned_to)
  const recruiterJobs = new Map<string, Set<string>>()
  const addJob = (userId: string | null, jobId: string) => {
    if (!userId) return
    if (!recruiterJobs.has(userId)) recruiterJobs.set(userId, new Set())
    recruiterJobs.get(userId)!.add(jobId)
  }
  for (const job of jobsRes.data ?? []) {
    addJob(job.created_by, job.id)
    addJob(job.assigned_to, job.id)
  }

  // Collect all recruiter user IDs (only job owners)
  const allUserIds = new Set<string>()
  recruiterJobs.forEach((_, uid) => allUserIds.add(uid))

  if (recruiterId) {
    allUserIds.clear()
    allUserIds.add(recruiterId)
  }

  // Count unique candidates per recruiter (by job ownership via applications)
  const candidateCounts = new Map<string, number>()
  const recruiterCandidates = new Map<string, Set<string>>()
  for (const app of appsRes.data ?? []) {
    recruiterJobs.forEach((jobIds, uid) => {
      if (!jobIds.has(app.job_id)) return
      if (!recruiterCandidates.has(uid)) recruiterCandidates.set(uid, new Set())
      recruiterCandidates.get(uid)!.add(app.candidate_id)
    })
  }
  recruiterCandidates.forEach((candidates, uid) => {
    candidateCounts.set(uid, candidates.size)
  })

  // Count interviews per user (by job ownership)
  const interviewCounts = new Map<string, number>()
  for (const i of interviewsRes.data ?? []) {
    recruiterJobs.forEach((jobIds, uid) => {
      if (i.job_id && jobIds.has(i.job_id)) {
        interviewCounts.set(uid, (interviewCounts.get(uid) ?? 0) + 1)
      }
    })
  }

  // Count offers per user + status breakdown
  // Attribute offers to recruiters who own the job (created_by or assigned_to)
  const offerCounts = new Map<string, number>()
  const offerAccepted = new Map<string, number>()
  const offerResponded = new Map<string, number>()
  for (const o of offersRes.data ?? []) {
    // Attribute offers to recruiters who own the job (created_by or assigned_to on jobs)
    const owners = new Set<string>()
    recruiterJobs.forEach((jobIds, uid) => {
      if (o.job_id && jobIds.has(o.job_id)) owners.add(uid)
    })
    for (const uid of Array.from(owners)) {
      offerCounts.set(uid, (offerCounts.get(uid) ?? 0) + 1)
      if (['accepted', 'declined', 'expired'].includes(o.status)) {
        offerResponded.set(uid, (offerResponded.get(uid) ?? 0) + 1)
        if (o.status === 'accepted') {
          offerAccepted.set(uid, (offerAccepted.get(uid) ?? 0) + 1)
        }
      }
    }
  }

  // Count applications managed (on recruiter's jobs) + hires + rejections + avg TTH
  const appCounts = new Map<string, number>()
  const hireCounts = new Map<string, number>()
  const rejectionCounts = new Map<string, number>()
  const tthSums = new Map<string, { total: number; count: number }>()

  for (const app of appsRes.data ?? []) {
    // Find which recruiters own this job
    recruiterJobs.forEach((jobIds, uid) => {
      if (!jobIds.has(app.job_id)) return
      appCounts.set(uid, (appCounts.get(uid) ?? 0) + 1)
      if (app.status === 'hired') {
        hireCounts.set(uid, (hireCounts.get(uid) ?? 0) + 1)
        if (app.applied_at && app.hired_at) {
          const days = Math.ceil(
            (new Date(app.hired_at).getTime() - new Date(app.applied_at).getTime()) / (1000 * 60 * 60 * 24)
          )
          const existing = tthSums.get(uid) ?? { total: 0, count: 0 }
          existing.total += days
          existing.count += 1
          tthSums.set(uid, existing)
        }
      }
      if (app.status === 'rejected') {
        rejectionCounts.set(uid, (rejectionCounts.get(uid) ?? 0) + 1)
      }
    })
  }

  // Build results
  const metrics: RecruiterMetrics[] = Array.from(allUserIds).map((uid) => {
    const responded = offerResponded.get(uid) ?? 0
    const accepted = offerAccepted.get(uid) ?? 0
    const tth = tthSums.get(uid)
    return {
      user_id: uid,
      candidates_added: candidateCounts.get(uid) ?? 0,
      applications_managed: appCounts.get(uid) ?? 0,
      interviews_scheduled: interviewCounts.get(uid) ?? 0,
      offers_created: offerCounts.get(uid) ?? 0,
      hires_closed: hireCounts.get(uid) ?? 0,
      rejections: rejectionCounts.get(uid) ?? 0,
      offer_acceptance_rate: responded > 0 ? Math.round((accepted / responded) * 100) : 0,
      avg_time_to_hire: tth && tth.count > 0 ? Math.round(tth.total / tth.count) : 0,
    }
  })

  return { data: metrics, error: null }
}

// ---------------------------------------------------------------------------
// Candidate Stage Timeline (days spent per stage)
// ---------------------------------------------------------------------------

export interface CandidateStageTime {
  candidate_id: string
  candidate_name: string
  application_id: string
  job_title: string
  status: string
  stages: Array<{ stage_name: string; days: number }>
  total_days: number
}

export async function getCandidateStageTimeline(
  supabase: SupabaseClient,
  orgId: string,
  recruiterId?: string,
  dateRange?: DateRange,
  jobId?: string
): Promise<{ data: CandidateStageTime[] | null; error: unknown }> {
  // Get jobs for this recruiter
  let jobIds: string[] | null = null
  if (jobId) {
    // Specific job filter takes precedence
    jobIds = [jobId]
  } else if (recruiterId) {
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .or(`created_by.eq.${recruiterId},assigned_to.eq.${recruiterId}`)
    jobIds = jobs?.map((j) => j.id) ?? []
    if (jobIds.length === 0) return { data: [], error: null }
  }

  // Get applications with candidate + job info
  let appsQuery = supabase
    .from('applications')
    .select('id, candidate_id, job_id, status, applied_at, hired_at, candidate:candidates(first_name, last_name), job:jobs(title)')
    .eq('organization_id', orgId)
    .is('deleted_at', null)

  if (jobIds) {
    appsQuery = appsQuery.in('job_id', jobIds)
  }
  if (dateRange) {
    appsQuery = appsQuery.gte('applied_at', dateRange.from).lte('applied_at', dateRange.to)
  }

  const { data: apps, error: appsError } = await appsQuery

  if (appsError) return { data: null, error: appsError }
  if (!apps || apps.length === 0) return { data: [], error: null }

  const appIds = apps.map((a) => a.id)

  // Get all stage movements for these applications
  const { data: movements, error: movError } = await supabase
    .from('stage_movements')
    .select('application_id, to_stage_id, moved_at')
    .eq('organization_id', orgId)
    .in('application_id', appIds)
    .order('moved_at', { ascending: true })

  if (movError) return { data: null, error: movError }

  // Get pipeline stages for name mapping
  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, name')
    .eq('organization_id', orgId)

  const stageNameMap = new Map<string, string>()
  for (const s of stages ?? []) stageNameMap.set(s.id, s.name)

  // Group movements by application
  const movsByApp = new Map<string, Array<{ stage_name: string; moved_at: string }>>()
  for (const m of movements ?? []) {
    const arr = movsByApp.get(m.application_id) ?? []
    arr.push({ stage_name: stageNameMap.get(m.to_stage_id) ?? 'Unknown', moved_at: m.moved_at })
    movsByApp.set(m.application_id, arr)
  }

  const now = new Date()
  const result: CandidateStageTime[] = apps.map((app) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cand = app.candidate as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = app.job as any
    const candidateName = `${cand?.first_name ?? ''} ${cand?.last_name ?? ''}`.trim() || 'Unknown'
    const jobTitle = job?.title ?? 'Unknown'

    const movs = movsByApp.get(app.id) ?? []
    const stageList: Array<{ stage_name: string; days: number }> = []

    // First stage: from applied_at to first movement (or now)
    const appliedAt = new Date(app.applied_at)
    const DAY_MS = 1000 * 60 * 60 * 24
    if (movs.length === 0) {
      const endDate = app.hired_at ? new Date(app.hired_at) : now
      stageList.push({ stage_name: 'Applied', days: Math.round((endDate.getTime() - appliedAt.getTime()) / DAY_MS) })
    } else {
      const firstMovAt = new Date(movs[0].moved_at)
      stageList.push({ stage_name: 'Applied', days: Math.round((firstMovAt.getTime() - appliedAt.getTime()) / DAY_MS) })

      // Each subsequent stage
      for (let i = 0; i < movs.length; i++) {
        const startAt = new Date(movs[i].moved_at)
        const endAt = i < movs.length - 1 ? new Date(movs[i + 1].moved_at) : (app.hired_at ? new Date(app.hired_at) : now)
        stageList.push({ stage_name: movs[i].stage_name, days: Math.round((endAt.getTime() - startAt.getTime()) / DAY_MS) })
      }
    }

    // Total = actual elapsed days from applied to end (not sum of rounded stages)
    const endDate = app.hired_at ? new Date(app.hired_at) : (movs.length > 0 ? new Date(movs[movs.length - 1].moved_at) : now)
    const totalDays = Math.max(0, Math.round((endDate.getTime() - appliedAt.getTime()) / DAY_MS))

    return {
      candidate_id: app.candidate_id,
      candidate_name: candidateName,
      application_id: app.id,
      job_title: jobTitle,
      status: app.status,
      stages: stageList,
      total_days: totalDays,
    }
  })

  // Sort by total days descending
  result.sort((a, b) => b.total_days - a.total_days)

  return { data: result, error: null }
}

// ---------------------------------------------------------------------------
// Hiring Velocity (monthly hires)
// ---------------------------------------------------------------------------

export async function getHiringVelocity(
  supabase: SupabaseClient,
  orgId: string,
  months = 6,
  dateRange?: DateRange,
  jobId?: string
) {
  const since = dateRange ? new Date(dateRange.from) : new Date()
  if (!dateRange) since.setMonth(since.getMonth() - months)

  let query = supabase
    .from('applications')
    .select('hired_at')
    .eq('organization_id', orgId)
    .eq('status', 'hired')
    .is('deleted_at', null)
    .not('hired_at', 'is', null)
    .gte('hired_at', since.toISOString())

  if (jobId) query = query.eq('job_id', jobId)
  if (dateRange) {
    query = query.lte('hired_at', dateRange.to)
  }

  const { data, error } = await query

  if (error) {
    return { data: null, error }
  }

  // Group by year-month
  const monthMap = new Map<string, number>()
  data?.forEach((app) => {
    const d = new Date(app.hired_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthMap.set(key, (monthMap.get(key) ?? 0) + 1)
  })

  // Fill in missing months with 0
  const result: Array<{ month: string; hires: number }> = []
  if (dateRange) {
    const start = new Date(dateRange.from)
    const end = new Date(dateRange.to)
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
    while (cursor <= end) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
      result.push({ month: key, hires: monthMap.get(key) ?? 0 })
      cursor.setMonth(cursor.getMonth() + 1)
    }
  } else {
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      result.push({ month: key, hires: monthMap.get(key) ?? 0 })
    }
  }

  return { data: result, error: null }
}
