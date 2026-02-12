import { SupabaseClient } from '@supabase/supabase-js'
import { ITEMS_PER_PAGE } from '@/lib/constants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InterviewFilters {
  status?: string
  upcoming?: boolean
  page?: number
  limit?: number
}

interface InterviewData {
  application_id: string
  interview_type: string
  scheduled_at: string
  duration_minutes?: number
  location?: string
  meeting_link?: string
  notes?: string
  panelists?: Array<{
    user_id: string
    role?: string
  }>
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getInterviews(
  supabase: SupabaseClient,
  orgId: string,
  filters: InterviewFilters = {}
) {
  const { status, upcoming, page = 1, limit = ITEMS_PER_PAGE } = filters
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from('interviews')
    .select(
      `
      *,
      application:applications(
        id,
        candidate:candidates(id, first_name, last_name, email),
        job:jobs(id, title, department)
      ),
      interview_panelists(*)
    `,
      { count: 'exact' }
    )
    .eq('organization_id', orgId)
    .order('scheduled_at', { ascending: true })
    .range(from, to)

  if (status) {
    query = query.eq('status', status)
  }

  if (upcoming) {
    query = query
      .gte('scheduled_at', new Date().toISOString())
      .eq('status', 'scheduled')
  }

  const { data, error, count } = await query

  return { data, error, count }
}

export async function getInterviewById(
  supabase: SupabaseClient,
  interviewId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('interviews')
    .select(
      `
      *,
      application:applications!interviews_application_id_fkey(
        *,
        candidate:candidates(*),
        job:jobs(id, title, department, status),
        current_stage:pipeline_stages(id, name, stage_type)
      ),
      interview_panelists(*),
      feedback:interview_feedback(*)
    `
    )
    .eq('id', interviewId)
    .eq('organization_id', orgId)
    .maybeSingle()

  return { data, error }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createInterview(
  supabase: SupabaseClient,
  orgId: string,
  data: InterviewData,
  userId: string
) {
  const { panelists, ...interviewData } = data

  // Fetch application to get required job_id and candidate_id
  const { data: application, error: appError } = await supabase
    .from('applications')
    .select('job_id, candidate_id')
    .eq('id', interviewData.application_id)
    .eq('organization_id', orgId)
    .single()

  if (appError || !application) {
    return { data: null, error: appError ?? new Error('Application not found') }
  }

  const { data: interview, error: interviewError } = await supabase
    .from('interviews')
    .insert({
      ...interviewData,
      organization_id: orgId,
      job_id: application.job_id,
      candidate_id: application.candidate_id,
      created_by: userId,
      status: 'scheduled',
    })
    .select()
    .single()

  if (interviewError) {
    return { data: null, error: interviewError }
  }

  // Add panelists if provided
  if (panelists && panelists.length > 0) {
    const panelistRows = panelists.map((p) => ({
      interview_id: interview.id,
      organization_id: orgId,
      user_id: p.user_id,
      role: p.role ?? 'interviewer',
    }))

    const { error: panelistError } = await supabase
      .from('interview_panelists')
      .insert(panelistRows)

    if (panelistError) {
      // Interview was created but panelists failed - log but don't roll back
      console.error('Failed to add interview panelists:', panelistError)
    }
  }

  // Re-fetch with full relations
  const { data: fullInterview, error: fetchError } = await supabase
    .from('interviews')
    .select(
      `
      *,
      application:applications(
        id,
        candidate:candidates(id, first_name, last_name, email),
        job:jobs(id, title)
      ),
      interview_panelists(*)
    `
    )
    .eq('id', interview.id)
    .single()

  return { data: fullInterview, error: fetchError }
}

export async function updateInterview(
  supabase: SupabaseClient,
  interviewId: string,
  orgId: string,
  data: Record<string, unknown>
) {
  const { panelists, ...interviewData } = data as Record<string, unknown> & {
    panelists?: Array<{ user_id: string; role?: string }>
  }

  const { data: interview, error } = await supabase
    .from('interviews')
    .update({ ...interviewData, updated_at: new Date().toISOString() })
    .eq('id', interviewId)
    .eq('organization_id', orgId)
    .select()
    .single()

  if (error) {
    return { data: null, error }
  }

  // Replace panelists if provided
  if (panelists !== undefined) {
    // Remove existing panelists
    await supabase
      .from('interview_panelists')
      .delete()
      .eq('interview_id', interviewId)

    // Add new panelists
    if (panelists.length > 0) {
      await supabase.from('interview_panelists').insert(
        panelists.map((p) => ({
          interview_id: interviewId,
          organization_id: orgId,
          user_id: p.user_id,
          role: p.role ?? 'interviewer',
        }))
      )
    }
  }

  return { data: interview, error: null }
}

export async function cancelInterview(
  supabase: SupabaseClient,
  interviewId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('interviews')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', interviewId)
    .eq('organization_id', orgId)
    .in('status', ['scheduled'])
    .select()
    .single()

  return { data, error }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getUpcomingInterviews(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
) {
  const now = new Date().toISOString()

  // Get interviews where the user is a panelist
  const { data: panelistInterviews, error: panelistError } = await supabase
    .from('interview_panelists')
    .select('interview_id')
    .eq('user_id', userId)
    .eq('organization_id', orgId)

  if (panelistError) {
    return { data: null, error: panelistError }
  }

  const interviewIds = panelistInterviews?.map((p) => p.interview_id) ?? []

  if (interviewIds.length === 0) {
    return { data: [], error: null }
  }

  const { data, error } = await supabase
    .from('interviews')
    .select(
      `
      *,
      application:applications(
        id,
        candidate:candidates(id, first_name, last_name, email),
        job:jobs(id, title, department)
      )
    `
    )
    .eq('organization_id', orgId)
    .in('id', interviewIds)
    .gte('scheduled_at', now)
    .eq('status', 'scheduled')
    .order('scheduled_at', { ascending: true })
    .limit(10)

  return { data, error }
}
