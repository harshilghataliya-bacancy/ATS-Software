import { SupabaseClient } from '@supabase/supabase-js'
import { ITEMS_PER_PAGE } from '@/lib/constants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JobFilters {
  status?: string
  search?: string
  department?: string
  location?: string
  employment_type?: string
  priority?: string
  assigned_to?: string
  page?: number
  limit?: number
}

interface PipelineStageInput {
  id?: string
  name: string
  display_order: number
  stage_type: string
}

// ---------------------------------------------------------------------------
// Job Recruiters (multi-recruiter assignment)
// ---------------------------------------------------------------------------

export async function syncJobRecruiters(
  supabase: SupabaseClient,
  jobId: string,
  userIds: string[]
) {
  // Delete existing assignments
  await supabase.from('job_recruiters').delete().eq('job_id', jobId)

  if (userIds.length === 0) return { error: null }

  const { error } = await supabase.from('job_recruiters').insert(
    userIds.map((uid) => ({ job_id: jobId, user_id: uid }))
  )
  return { error }
}

export async function getJobRecruiters(
  supabase: SupabaseClient,
  jobId: string
): Promise<string[]> {
  const { data } = await supabase
    .from('job_recruiters')
    .select('user_id')
    .eq('job_id', jobId)
  return data?.map((r: { user_id: string }) => r.user_id) ?? []
}

export async function getJobRecruitersForJobs(
  supabase: SupabaseClient,
  jobIds: string[]
): Promise<Record<string, string[]>> {
  if (jobIds.length === 0) return {}
  const { data } = await supabase
    .from('job_recruiters')
    .select('job_id, user_id')
    .in('job_id', jobIds)
  const map: Record<string, string[]> = {}
  for (const id of jobIds) map[id] = []
  data?.forEach((r: { job_id: string; user_id: string }) => {
    if (!map[r.job_id]) map[r.job_id] = []
    map[r.job_id].push(r.user_id)
  })
  return map
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getJobs(
  supabase: SupabaseClient,
  orgId: string,
  filters: JobFilters = {}
) {
  const { status, search, department, location, employment_type, priority, assigned_to, page = 1, limit = ITEMS_PER_PAGE } = filters
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from('jobs')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (status) {
    query = query.eq('status', status)
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,department.ilike.%${search}%`)
  }

  if (department) {
    query = query.eq('department', department)
  }

  if (location) {
    query = query.eq('location', location)
  }

  if (employment_type) {
    query = query.eq('employment_type', employment_type)
  }

  if (priority) {
    query = query.eq('priority', priority)
  }

  if (assigned_to) {
    // Check both jobs.assigned_to and job_recruiters junction table
    const { data: recruiterJobs } = await supabase
      .from('job_recruiters')
      .select('job_id')
      .eq('user_id', assigned_to)
    const junctionJobIds = (recruiterJobs || []).map((r: { job_id: string }) => r.job_id)
    // Combine: jobs where assigned_to matches OR job is in junction table
    if (junctionJobIds.length > 0) {
      query = query.or(`assigned_to.eq.${assigned_to},id.in.(${junctionJobIds.join(',')})`)
    } else {
      query = query.eq('assigned_to', assigned_to)
    }
  }

  const { data, error, count } = await query

  if (error) {
    return { data: null, error }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobs = data as any[]

  // Fetch application counts and active counts per job (excluding soft-deleted)
  if (jobs && jobs.length > 0) {
    const jobIds = jobs.map((j: { id: string }) => j.id)

    // All non-deleted applications per job
    const { data: allApps } = await supabase
      .from('applications')
      .select('job_id')
      .in('job_id', jobIds)
      .eq('organization_id', orgId)
      .is('deleted_at', null)

    const appCounts: Record<string, number> = {}
    allApps?.forEach((a: { job_id: string }) => {
      appCounts[a.job_id] = (appCounts[a.job_id] || 0) + 1
    })

    // Active applications per job
    const { data: activeApps } = await supabase
      .from('applications')
      .select('job_id')
      .in('job_id', jobIds)
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .is('deleted_at', null)

    const activeCounts: Record<string, number> = {}
    activeApps?.forEach((a: { job_id: string }) => {
      activeCounts[a.job_id] = (activeCounts[a.job_id] || 0) + 1
    })

    jobs.forEach((job: { id: string; application_count?: number; active_candidate_count?: number }) => {
      job.application_count = appCounts[job.id] || 0
      job.active_candidate_count = activeCounts[job.id] || 0
    })
  }

  return { data: jobs, error: null, count }
}

export async function getJobById(
  supabase: SupabaseClient,
  jobId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('jobs')
    .select(
      `
      *,
      pipeline_stages(*)
    `
    )
    .eq('id', jobId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('display_order', { referencedTable: 'pipeline_stages', ascending: true })
    .single()

  return { data, error }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createJob(
  supabase: SupabaseClient,
  orgId: string,
  data: Record<string, unknown>,
  userId: string
) {
  // Extract recruiter_ids before inserting (not a column on jobs table)
  const recruiterIds = (data.recruiter_ids as string[] | undefined) ?? []
  const jobData = { ...data }
  delete jobData.recruiter_ids

  // Set assigned_to to first recruiter if provided (backward compat)
  if (recruiterIds.length > 0 && !jobData.assigned_to) {
    jobData.assigned_to = recruiterIds[0]
  }

  // Auto-assign creator as Job Owner if not explicitly set
  if (!jobData.assigned_to) {
    jobData.assigned_to = userId
  }

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .insert({
      ...jobData,
      organization_id: orgId,
      created_by: userId,
    })
    .select()
    .single()

  // Sync job_recruiters junction table — always include the creator
  if (job) {
    const allRecruiterIds = new Set(recruiterIds)
    allRecruiterIds.add(userId) // Creator is always a job recruiter
    await syncJobRecruiters(supabase, job.id, Array.from(allRecruiterIds))
  }

  // Pipeline stages are auto-created by DB trigger (create_default_pipeline_stages)
  return { data: job, error: jobError }
}

export async function updateJob(
  supabase: SupabaseClient,
  jobId: string,
  orgId: string,
  data: Record<string, unknown>
) {
  // Extract recruiter_ids before updating (not a column on jobs table)
  const recruiterIds = data.recruiter_ids as string[] | undefined
  const jobData = { ...data }
  delete jobData.recruiter_ids

  // Set assigned_to to first recruiter only if not explicitly provided
  if (recruiterIds && recruiterIds.length > 0 && !jobData.assigned_to) {
    jobData.assigned_to = recruiterIds[0]
  }

  const { data: job, error } = await supabase
    .from('jobs')
    .update({ ...jobData, updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .select()
    .single()

  // Sync job_recruiters if recruiter_ids was provided
  if (job && recruiterIds !== undefined) {
    await syncJobRecruiters(supabase, jobId, recruiterIds)
  }

  return { data: job, error }
}

export async function deleteJob(
  supabase: SupabaseClient,
  jobId: string,
  orgId: string
) {
  const now = new Date().toISOString()

  // Get application IDs for this job (needed for feedback cascade)
  const { data: apps } = await supabase
    .from('applications')
    .select('id')
    .eq('job_id', jobId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)

  const appIds = (apps || []).map((a) => a.id)

  // Soft-delete feedback for these applications
  if (appIds.length > 0) {
    await supabase
      .from('interview_feedback')
      .update({ deleted_at: now })
      .in('application_id', appIds)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
  }

  // Soft-delete related records that have deleted_at
  await Promise.all([
    supabase
      .from('applications')
      .update({ deleted_at: now })
      .eq('job_id', jobId)
      .eq('organization_id', orgId)
      .is('deleted_at', null),
    supabase
      .from('interviews')
      .update({ deleted_at: now })
      .eq('job_id', jobId)
      .eq('organization_id', orgId)
      .is('deleted_at', null),
    supabase
      .from('offer_letters')
      .update({ deleted_at: now })
      .eq('job_id', jobId)
      .eq('organization_id', orgId)
      .is('deleted_at', null),
  ])

  // Hard-delete related records without deleted_at
  await Promise.all([
    supabase
      .from('candidate_match_scores')
      .delete()
      .eq('job_id', jobId)
      .eq('organization_id', orgId),
    supabase
      .from('scorecard_criteria')
      .delete()
      .eq('job_id', jobId)
      .eq('organization_id', orgId),
    supabase
      .from('pipeline_stages')
      .delete()
      .eq('job_id', jobId)
      .eq('organization_id', orgId),
  ])

  // Soft-delete the job itself
  const { data, error } = await supabase
    .from('jobs')
    .update({ deleted_at: now })
    .eq('id', jobId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .select()
    .single()

  return { data, error }
}

// ---------------------------------------------------------------------------
// Public / Careers Page
// ---------------------------------------------------------------------------

export async function getPublicJobs(
  supabase: SupabaseClient,
  orgSlug: string
) {
  // First resolve the organization by slug
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, slug, logo_url')
    .eq('slug', orgSlug)
    .single()

  if (orgError || !org) {
    return { data: null, error: orgError }
  }

  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('id, title, department, location, employment_type, remote_policy, experience_level, salary_min, salary_max, salary_currency, skills, num_openings, application_deadline, education_level, experience_min, experience_max, priority, description, requirements, nice_to_have, benefits, created_at')
    .eq('organization_id', org.id)
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (jobsError) {
    return { data: null, error: jobsError }
  }

  return { data: { organization: org, jobs }, error: null }
}

// ---------------------------------------------------------------------------
// Pipeline Stages
// ---------------------------------------------------------------------------

export async function updatePipelineStages(
  supabase: SupabaseClient,
  jobId: string,
  orgId: string,
  stages: PipelineStageInput[]
) {
  // Verify the job belongs to the organization
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id')
    .eq('id', jobId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .single()

  if (jobError || !job) {
    return { data: null, error: jobError ?? new Error('Job not found') }
  }

  // Separate existing stages (with id) from new ones
  const existingStages = stages.filter((s) => s.id)
  const newStages = stages.filter((s) => !s.id)

  // Update existing stages
  for (const stage of existingStages) {
    const { error } = await supabase
      .from('pipeline_stages')
      .update({
        name: stage.name,
        display_order: stage.display_order,
        stage_type: stage.stage_type,
      })
      .eq('id', stage.id!)
      .eq('job_id', jobId)

    if (error) {
      return { data: null, error }
    }
  }

  // Insert new stages
  if (newStages.length > 0) {
    const { error } = await supabase.from('pipeline_stages').insert(
      newStages.map((s) => ({
        name: s.name,
        display_order: s.display_order,
        stage_type: s.stage_type,
        job_id: jobId,
        organization_id: orgId,
      }))
    )

    if (error) {
      return { data: null, error }
    }
  }

  // Remove stages that are no longer in the list
  const keepIds = existingStages.map((s) => s.id).filter(Boolean) as string[]
  if (keepIds.length > 0) {
    const { error } = await supabase
      .from('pipeline_stages')
      .delete()
      .eq('job_id', jobId)
      .not('id', 'in', `(${keepIds.join(',')})`)

    if (error) {
      return { data: null, error }
    }
  }

  // Return the updated stages
  const { data: updatedStages, error: fetchError } = await supabase
    .from('pipeline_stages')
    .select('*')
    .eq('job_id', jobId)
    .order('display_order', { ascending: true })

  return { data: updatedStages, error: fetchError }
}

// ---------------------------------------------------------------------------
// Scorecard Criteria
// ---------------------------------------------------------------------------

export async function getScorecardCriteria(
  supabase: SupabaseClient,
  jobId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('scorecard_criteria')
    .select('*')
    .eq('job_id', jobId)
    .eq('organization_id', orgId)
    .order('weight', { ascending: false })

  return { data, error }
}

export async function upsertScorecardCriteria(
  supabase: SupabaseClient,
  jobId: string,
  orgId: string,
  criteria: Array<{ name: string; description?: string; weight: number }>
) {
  // Delete existing criteria for this job
  await supabase
    .from('scorecard_criteria')
    .delete()
    .eq('job_id', jobId)
    .eq('organization_id', orgId)

  if (criteria.length === 0) {
    return { data: [], error: null }
  }

  // Insert new criteria
  const { data, error } = await supabase
    .from('scorecard_criteria')
    .insert(
      criteria.map((c) => ({
        job_id: jobId,
        organization_id: orgId,
        name: c.name,
        description: c.description || null,
        weight: c.weight,
      }))
    )
    .select()

  return { data, error }
}
