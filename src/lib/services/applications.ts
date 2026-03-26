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
  orgId: string,
  statusFilter: string = 'active'
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

  // Fetch applications for this job (filtered by status)
  let query = supabase
    .from('applications')
    .select(
      `
      *,
      candidate:candidates(id, first_name, last_name, email, phone, resume_url, tags, resume_parsed_data, source),
      current_stage:pipeline_stages!current_stage_id(id, name, stage_type, display_order),
      interviews(id, status, scheduled_at, interview_type, duration_minutes),
      offer_letters(id, status)
    `
    )
    .eq('job_id', jobId)
    .eq('organization_id', orgId)

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  const { data: applications, error: appsError } = await query
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
      job:jobs(id, title, department, status, employment_type, pipeline_stages(id, name, stage_type, display_order)),
      current_stage:pipeline_stages!current_stage_id(id, name, stage_type, display_order),
      interviews(
        *,
        interview_panelists(*),
        interview_feedback(id, user_id, overall_rating, recommendation, strengths, weaknesses, notes, submitted_at, created_at, scorecard_ratings(id, criteria_id, rating, notes, text_value, rating_type))
      ),
      feedback:interview_feedback(*),
      offer_letters(id, status, salary, salary_currency, sent_at, responded_at),
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

  // Reapply restriction check
  const reapplyCheck = await checkReapplyRestriction(supabase, data.candidate_id, orgId)
  if (!reapplyCheck.allowed) {
    return { data: null, error: new Error(reapplyCheck.message) }
  }

  // Auto-assign recruiter if job has exactly 1 recruiter
  let autoRecruiterId: string | null = null
  const { data: jobRecruiters } = await supabase
    .from('job_recruiters')
    .select('user_id')
    .eq('job_id', data.job_id)
  if (jobRecruiters && jobRecruiters.length === 1) {
    autoRecruiterId = jobRecruiters[0].user_id
  }

  const { data: application, error } = await supabase
    .from('applications')
    .insert({
      ...data,
      organization_id: orgId,
      current_stage_id: firstStage.id,
      status: 'active',
      applied_at: new Date().toISOString(),
      ...(autoRecruiterId ? { assigned_recruiter_id: autoRecruiterId } : {}),
    })
    .select(
      `
      *,
      candidate:candidates(id, first_name, last_name, email),
      current_stage:pipeline_stages!current_stage_id(id, name, stage_type)
    `
    )
    .single()

  return { data: application, error }
}

export async function assignRecruiter(
  supabase: SupabaseClient,
  applicationId: string,
  orgId: string,
  recruiterId: string | null
) {
  const { data, error } = await supabase
    .from('applications')
    .update({
      assigned_recruiter_id: recruiterId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicationId)
    .eq('organization_id', orgId)
    .select()
    .single()

  return { data, error }
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
      current_stage:pipeline_stages!current_stage_id(id, name, stage_type)
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

// ---------------------------------------------------------------------------
// Reapply Restriction Check
// ---------------------------------------------------------------------------

/**
 * Check if a candidate is blocked from applying based on the org's reapply restriction.
 * Checks both rejected applications and declined offers within the restriction window.
 * Returns { allowed: true } or { allowed: false, message: string, eligibleDate: string }
 */
export async function checkReapplyRestriction(
  supabase: SupabaseClient,
  candidateId: string,
  orgId: string
): Promise<{ allowed: true } | { allowed: false; message: string; eligibleDate: string }> {
  // Get org restriction setting
  const { data: orgSettings } = await supabase
    .from('organizations')
    .select('offer_reapply_restriction_months')
    .eq('id', orgId)
    .single()

  const restrictionMonths = orgSettings?.offer_reapply_restriction_months ?? 6
  if (restrictionMonths === 0) return { allowed: true }

  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - restrictionMonths)

  // Check for rejected applications within restriction window
  const { data: rejectedApp } = await supabase
    .from('applications')
    .select('id, updated_at')
    .eq('candidate_id', candidateId)
    .eq('organization_id', orgId)
    .eq('status', 'rejected')
    .gte('updated_at', cutoffDate.toISOString())
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (rejectedApp?.updated_at) {
    const eligibleDate = new Date(rejectedApp.updated_at)
    eligibleDate.setMonth(eligibleDate.getMonth() + restrictionMonths)
    const formatted = eligibleDate.toLocaleDateString('en-US', { dateStyle: 'long' })
    return {
      allowed: false,
      message: `This candidate was previously rejected. They can reapply after ${formatted}.`,
      eligibleDate: formatted,
    }
  }

  // Check for declined offers within restriction window
  const { data: declinedOffer } = await supabase
    .from('offer_letters')
    .select('id, responded_at')
    .eq('candidate_id', candidateId)
    .eq('organization_id', orgId)
    .eq('status', 'declined')
    .gte('responded_at', cutoffDate.toISOString())
    .order('responded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (declinedOffer?.responded_at) {
    const eligibleDate = new Date(declinedOffer.responded_at)
    eligibleDate.setMonth(eligibleDate.getMonth() + restrictionMonths)
    const formatted = eligibleDate.toLocaleDateString('en-US', { dateStyle: 'long' })
    return {
      allowed: false,
      message: `This candidate previously declined an offer. They can reapply after ${formatted}.`,
      eligibleDate: formatted,
    }
  }

  return { allowed: true }
}

export async function rejectApplication(
  supabase: SupabaseClient,
  applicationId: string,
  orgId: string,
  reason: string,
  userId: string,
  stageId?: string
) {
  // Always get current stage to save as previous_stage_id for rollback
  const { data: currentApp } = await supabase
    .from('applications')
    .select('current_stage_id')
    .eq('id', applicationId)
    .eq('organization_id', orgId)
    .single()
  const fromStageId = currentApp?.current_stage_id ?? null

  const updatePayload: Record<string, unknown> = {
    status: 'rejected',
    rejection_reason: reason,
    rejected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    previous_stage_id: fromStageId,
  }

  if (stageId) {
    updatePayload.current_stage_id = stageId
  }

  const { data, error } = await supabase
    .from('applications')
    .update(updatePayload)
    .eq('id', applicationId)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .select()
    .single()

  // Log stage movement if stage changed
  if (!error && stageId && fromStageId && fromStageId !== stageId) {
    await supabase.from('stage_movements').insert({
      application_id: applicationId,
      organization_id: orgId,
      from_stage_id: fromStageId,
      to_stage_id: stageId,
      moved_by: userId,
      moved_at: new Date().toISOString(),
    })
  }

  return { data, error }
}

export async function rollbackApplication(
  supabase: SupabaseClient,
  applicationId: string,
  orgId: string,
  userId: string
) {
  // Get the rejected application with its previous stage
  const { data: app } = await supabase
    .from('applications')
    .select('id, current_stage_id, previous_stage_id, job_id')
    .eq('id', applicationId)
    .eq('organization_id', orgId)
    .eq('status', 'rejected')
    .single()

  if (!app) return { data: null, error: { message: 'Application not found or not rejected' } }

  // Determine rollback stage: previous_stage_id first, then stage_movements, then first stage
  let rollbackStageId = app.previous_stage_id

  if (!rollbackStageId) {
    // Fallback 1: check stage_movements for the last movement INTO the rejected stage
    const { data: lastMovement } = await supabase
      .from('stage_movements')
      .select('from_stage_id')
      .eq('application_id', applicationId)
      .eq('organization_id', orgId)
      .order('moved_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    rollbackStageId = lastMovement?.from_stage_id ?? null
  }

  if (!rollbackStageId) {
    // Fallback 2: get the first pipeline stage for this job
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('job_id', app.job_id)
      .eq('organization_id', orgId)
      .order('display_order', { ascending: true })
      .limit(1)
      .maybeSingle()

    rollbackStageId = firstStage?.id ?? app.current_stage_id
  }

  // Update application: restore to active with previous stage
  const { data, error } = await supabase
    .from('applications')
    .update({
      status: 'active',
      current_stage_id: rollbackStageId,
      rejection_reason: null,
      rejected_at: null,
      previous_stage_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicationId)
    .eq('organization_id', orgId)
    .select()
    .single()

  // Log stage movement
  if (!error && rollbackStageId && app.current_stage_id) {
    await supabase.from('stage_movements').insert({
      application_id: applicationId,
      organization_id: orgId,
      from_stage_id: app.current_stage_id,
      to_stage_id: rollbackStageId,
      moved_by: userId,
      moved_at: new Date().toISOString(),
    })
  }

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

export async function moveApplicationToJob(
  supabase: SupabaseClient,
  applicationId: string,
  orgId: string,
  targetJobId: string
) {
  // Get current application
  const { data: app, error: fetchError } = await supabase
    .from('applications')
    .select('id, job_id, candidate_id, status')
    .eq('id', applicationId)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .single()

  if (fetchError || !app) {
    return { data: null, error: fetchError ?? new Error('Application not found or not active') }
  }

  if (app.job_id === targetJobId) {
    return { data: null, error: new Error('Application is already for this job') }
  }

  // Check no duplicate active application exists for candidate + target job
  const { data: existing } = await supabase
    .from('applications')
    .select('id')
    .eq('candidate_id', app.candidate_id)
    .eq('job_id', targetJobId)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .maybeSingle()

  if (existing) {
    return { data: null, error: new Error('Candidate already has an active application for the target job') }
  }

  // Find first pipeline stage of target job
  const { data: firstStage, error: stageError } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('job_id', targetJobId)
    .eq('organization_id', orgId)
    .order('display_order', { ascending: true })
    .limit(1)
    .single()

  if (stageError || !firstStage) {
    return { data: null, error: stageError ?? new Error('No pipeline stages found for target job') }
  }

  // Update the application
  const { data: updated, error: updateError } = await supabase
    .from('applications')
    .update({
      job_id: targetJobId,
      current_stage_id: firstStage.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicationId)
    .eq('organization_id', orgId)
    .select()
    .single()

  if (updateError) {
    return { data: null, error: updateError }
  }

  // Update interviews to point to new job
  await supabase
    .from('interviews')
    .update({ job_id: targetJobId, updated_at: new Date().toISOString() })
    .eq('application_id', applicationId)
    .eq('organization_id', orgId)

  // Delete draft offer letters for this application
  await supabase
    .from('offer_letters')
    .delete()
    .eq('application_id', applicationId)
    .eq('organization_id', orgId)
    .eq('status', 'draft')

  // Delete stale candidate_match_scores
  await supabase
    .from('candidate_match_scores')
    .delete()
    .eq('application_id', applicationId)

  // Delete stale stage_movements (old stage refs are no longer valid)
  await supabase
    .from('stage_movements')
    .delete()
    .eq('application_id', applicationId)
    .eq('organization_id', orgId)

  return { data: updated, error: null }
}

export async function hireApplication(
  supabase: SupabaseClient,
  applicationId: string,
  orgId: string,
  userId: string | null
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
      current_stage:pipeline_stages!current_stage_id(id, name, stage_type)
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
