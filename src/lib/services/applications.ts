import { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApplicationData {
  candidate_id: string
  job_id: string
  source?: string
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getApplicationsForJob(
  supabase: SupabaseClient,
  jobId: string,
  orgId: string
) {
  // Fetch the pipeline stages for the job
  const { data: stages, error: stagesError } = await supabase
    .from('pipeline_stages')
    .select('*')
    .eq('job_id', jobId)
    .eq('organization_id', orgId)
    .order('display_order', { ascending: true })

  if (stagesError) {
    return { data: null, error: stagesError }
  }

  // Fetch all active applications for this job
  const { data: applications, error: appsError } = await supabase
    .from('applications')
    .select(
      `
      *,
      candidate:candidates(id, first_name, last_name, email, phone, resume_url, tags, resume_parsed_data),
      current_stage:pipeline_stages(id, name, stage_type, display_order),
      interviews(id, status, scheduled_at, interview_type, duration_minutes),
      offer_letters(id, status)
    `
    )
    .eq('job_id', jobId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (appsError) {
    return { data: null, error: appsError }
  }

  // Group applications by stage
  const grouped = stages.map((stage) => ({
    ...stage,
    applications: applications?.filter(
      (app) => app.current_stage_id === stage.id
    ) ?? [],
  }))

  return { data: { stages: grouped, total: applications?.length ?? 0 }, error: null }
}

export async function getApplicationById(
  supabase: SupabaseClient,
  applicationId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('applications')
    .select(
      `
      *,
      candidate:candidates(*),
      job:jobs(id, title, department, status, employment_type),
      current_stage:pipeline_stages(id, name, stage_type, display_order),
      interviews(
        *,
        interview_panelists(*)
      ),
      feedback:interview_feedback(*),
      offer_letters(id, status, salary, salary_currency, sent_at),
      stage_movements(*)
    `
    )
    .eq('id', applicationId)
    .eq('organization_id', orgId)
    .single()

  return { data, error }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createApplication(
  supabase: SupabaseClient,
  orgId: string,
  data: ApplicationData
) {
  // Find the first pipeline stage for this job (lowest display_order)
  const { data: firstStage, error: stageError } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('job_id', data.job_id)
    .eq('organization_id', orgId)
    .order('display_order', { ascending: true })
    .limit(1)
    .single()

  if (stageError || !firstStage) {
    return {
      data: null,
      error: stageError ?? new Error('No pipeline stages found for this job'),
    }
  }

  // Check for duplicate application (same candidate + same job)
  const { data: existing } = await supabase
    .from('applications')
    .select('id')
    .eq('candidate_id', data.candidate_id)
    .eq('job_id', data.job_id)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .maybeSingle()

  if (existing) {
    return {
      data: null,
      error: new Error('Candidate already has an active application for this job'),
    }
  }

  const { data: application, error } = await supabase
    .from('applications')
    .insert({
      ...data,
      organization_id: orgId,
      current_stage_id: firstStage.id,
      status: 'active',
      applied_at: new Date().toISOString(),
    })
    .select(
      `
      *,
      candidate:candidates(id, first_name, last_name, email),
      current_stage:pipeline_stages(id, name, stage_type)
    `
    )
    .single()

  return { data: application, error }
}

export async function moveApplication(
  supabase: SupabaseClient,
  applicationId: string,
  orgId: string,
  toStageId: string,
  userId: string
) {
  // Get current application state
  const { data: app, error: fetchError } = await supabase
    .from('applications')
    .select('id, current_stage_id, job_id')
    .eq('id', applicationId)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .single()

  if (fetchError || !app) {
    return { data: null, error: fetchError ?? new Error('Application not found') }
  }

  const fromStageId = app.current_stage_id

  // Update application stage
  const { data: updated, error: updateError } = await supabase
    .from('applications')
    .update({
      current_stage_id: toStageId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicationId)
    .eq('organization_id', orgId)
    .select(
      `
      *,
      candidate:candidates(id, first_name, last_name, email),
      current_stage:pipeline_stages(id, name, stage_type)
    `
    )
    .single()

  if (updateError) {
    return { data: null, error: updateError }
  }

  // Log the stage movement
  await supabase.from('stage_movements').insert({
    application_id: applicationId,
    organization_id: orgId,
    from_stage_id: fromStageId,
    to_stage_id: toStageId,
    moved_by: userId,
    moved_at: new Date().toISOString(),
  })

  return { data: updated, error: null }
}

export async function rejectApplication(
  supabase: SupabaseClient,
  applicationId: string,
  orgId: string,
  reason: string,
  userId: string
) {
  const { data, error } = await supabase
    .from('applications')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      rejected_by: userId,
      rejected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicationId)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .select()
    .single()

  return { data, error }
}

export async function withdrawApplication(
  supabase: SupabaseClient,
  applicationId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('applications')
    .update({
      status: 'withdrawn',
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicationId)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .select()
    .single()

  return { data, error }
}

export async function hireApplication(
  supabase: SupabaseClient,
  applicationId: string,
  orgId: string,
  userId: string
) {
  // Get the application to find the job's "hired" stage
  const { data: app, error: fetchError } = await supabase
    .from('applications')
    .select('id, job_id, current_stage_id')
    .eq('id', applicationId)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .single()

  if (fetchError || !app) {
    return { data: null, error: fetchError ?? new Error('Application not found') }
  }

  // Find the "hired" stage for this job
  const { data: hiredStage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('job_id', app.job_id)
    .eq('stage_type', 'hired')
    .single()

  const updatePayload: Record<string, unknown> = {
    status: 'hired',
    hired_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  // Move to hired stage if it exists
  if (hiredStage) {
    updatePayload.current_stage_id = hiredStage.id
  }

  const { data: updated, error: updateError } = await supabase
    .from('applications')
    .update(updatePayload)
    .eq('id', applicationId)
    .eq('organization_id', orgId)
    .select(
      `
      *,
      candidate:candidates(id, first_name, last_name, email),
      current_stage:pipeline_stages(id, name, stage_type)
    `
    )
    .single()

  if (updateError) {
    return { data: null, error: updateError }
  }

  // Log stage movement if we moved stages
  if (hiredStage && app.current_stage_id !== hiredStage.id) {
    await supabase.from('stage_movements').insert({
      application_id: applicationId,
      organization_id: orgId,
      from_stage_id: app.current_stage_id,
      to_stage_id: hiredStage.id,
      moved_by: userId,
      moved_at: new Date().toISOString(),
    })
  }

  return { data: updated, error: null }
}
