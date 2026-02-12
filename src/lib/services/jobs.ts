import { SupabaseClient } from '@supabase/supabase-js'
import { ITEMS_PER_PAGE } from '@/lib/constants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JobFilters {
  status?: string
  search?: string
  department?: string
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
// Queries
// ---------------------------------------------------------------------------

export async function getJobs(
  supabase: SupabaseClient,
  orgId: string,
  filters: JobFilters = {}
) {
  const { status, search, department, page = 1, limit = ITEMS_PER_PAGE } = filters
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from('jobs')
    .select(
      `
      *,
      applications:applications(count)
    `,
      { count: 'exact' }
    )
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

  const { data, error, count } = await query

  if (error) {
    return { data: null, error }
  }

  // Flatten the application count from the nested aggregation
  const jobs = data?.map((job) => ({
    ...job,
    application_count: job.applications?.[0]?.count ?? 0,
    applications: undefined,
  }))

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
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .insert({
      ...data,
      organization_id: orgId,
      created_by: userId,
    })
    .select()
    .single()

  // Pipeline stages are auto-created by DB trigger (create_default_pipeline_stages)
  return { data: job, error: jobError }
}

export async function updateJob(
  supabase: SupabaseClient,
  jobId: string,
  orgId: string,
  data: Record<string, unknown>
) {
  const { data: job, error } = await supabase
    .from('jobs')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .select()
    .single()

  return { data: job, error }
}

export async function deleteJob(
  supabase: SupabaseClient,
  jobId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('jobs')
    .update({ deleted_at: new Date().toISOString() })
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
    .select('id, title, department, location, employment_type, created_at')
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
