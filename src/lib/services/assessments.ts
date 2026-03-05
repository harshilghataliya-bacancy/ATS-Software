import { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Get all assessment invitations for an application
// ---------------------------------------------------------------------------

export async function getAssessmentInvitationsForApplication(
  supabase: SupabaseClient,
  applicationId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('assessment_invitations')
    .select('*')
    .eq('application_id', applicationId)
    .eq('organization_id', orgId)
    .order('invited_at', { ascending: false })

  return { data, error }
}

// ---------------------------------------------------------------------------
// Get all assessment invitations for a job
// ---------------------------------------------------------------------------

export async function getAssessmentInvitationsForJob(
  supabase: SupabaseClient,
  jobId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('assessment_invitations')
    .select('id, application_id, assessment_name, status, score, invited_at, sent_at, completed_at, expiry_date')
    .eq('job_id', jobId)
    .eq('organization_id', orgId)
    .order('invited_at', { ascending: false })

  return { data, error }
}

// ---------------------------------------------------------------------------
// Create assessment invitation (allows multiple per application)
// ---------------------------------------------------------------------------

export async function createAssessmentInvitation(
  supabase: SupabaseClient,
  orgId: string,
  data: {
    application_id: string
    candidate_id: string
    job_id: string
    assessment_name?: string | null
    assessment_link: string
    instructions?: string | null
    expiry_date?: string | null
    invited_by?: string
  }
) {
  const { data: invitation, error } = await supabase
    .from('assessment_invitations')
    .insert({
      organization_id: orgId,
      application_id: data.application_id,
      candidate_id: data.candidate_id,
      job_id: data.job_id,
      assessment_name: data.assessment_name ?? null,
      assessment_link: data.assessment_link,
      instructions: data.instructions ?? null,
      expiry_date: data.expiry_date ?? null,
      invited_by: data.invited_by ?? null,
      status: 'invited',
      invited_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
    })
    .select()
    .single()

  return { data: invitation, error }
}

// ---------------------------------------------------------------------------
// Update assessment score (manual entry — marks as completed)
// ---------------------------------------------------------------------------

export async function updateAssessmentScore(
  supabase: SupabaseClient,
  invitationId: string,
  orgId: string,
  score: number
) {
  const { data, error } = await supabase
    .from('assessment_invitations')
    .update({
      score,
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', invitationId)
    .eq('organization_id', orgId)
    .select()
    .single()

  return { data, error }
}
