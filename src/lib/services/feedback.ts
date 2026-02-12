import { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeedbackData {
  interview_id: string
  application_id: string
  overall_rating: number
  recommendation: string
  strengths?: string
  weaknesses?: string
  notes?: string
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getFeedbackForInterview(
  supabase: SupabaseClient,
  interviewId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('interview_feedback')
    .select('*')
    .eq('interview_id', interviewId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  return { data, error }
}

export async function getFeedbackForApplication(
  supabase: SupabaseClient,
  applicationId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('interview_feedback')
    .select(
      `
      *,
      interview:interviews(
        id,
        interview_type,
        scheduled_at
      )
    `
    )
    .eq('application_id', applicationId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  return { data, error }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function submitFeedback(
  supabase: SupabaseClient,
  orgId: string,
  data: FeedbackData,
  userId: string
) {
  // Check if this user already submitted feedback for this interview
  const { data: existing } = await supabase
    .from('interview_feedback')
    .select('id')
    .eq('interview_id', data.interview_id)
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (existing) {
    return {
      data: null,
      error: new Error('Feedback already submitted for this interview'),
    }
  }

  const { data: feedback, error } = await supabase
    .from('interview_feedback')
    .insert({
      ...data,
      organization_id: orgId,
      user_id: userId,
      submitted_at: new Date().toISOString(),
    })
    .select()
    .single()

  return { data: feedback, error }
}

export async function updateFeedback(
  supabase: SupabaseClient,
  feedbackId: string,
  orgId: string,
  data: Record<string, unknown>
) {
  const { data: feedback, error } = await supabase
    .from('interview_feedback')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', feedbackId)
    .eq('organization_id', orgId)
    .select()
    .single()

  return { data: feedback, error }
}
