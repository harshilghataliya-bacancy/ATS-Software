import { SupabaseClient } from '@supabase/supabase-js'
import { ITEMS_PER_PAGE } from '@/lib/constants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CandidateFilters {
  search?: string
  source?: string
  location?: string
  current_title?: string
  tags?: string[]
  page?: number
  limit?: number
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getCandidates(
  supabase: SupabaseClient,
  orgId: string,
  filters: CandidateFilters = {}
) {
  const { search, source, location, current_title, tags, page = 1, limit = ITEMS_PER_PAGE } = filters
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from('candidates')
    .select(
      `
      *,
      applications:applications(
        id,
        status,
        job:jobs(id, title, department),
        current_stage:pipeline_stages!current_stage_id(name, stage_type)
      )
    `,
      { count: 'exact' }
    )
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`
    )
  }

  if (source) {
    query = query.eq('source', source)
  }

  if (location) {
    query = query.eq('location', location)
  }

  if (current_title) {
    query = query.eq('current_title', current_title)
  }

  if (tags && tags.length > 0) {
    query = query.overlaps('tags', tags)
  }

  const { data, error, count } = await query

  if (error) {
    return { data: null, error, count: 0 }
  }

  const candidates = data?.map((candidate) => ({
    ...candidate,
    application_count: candidate.applications?.length ?? 0,
  }))

  return { data: candidates, error: null, count }
}

export async function getCandidateById(
  supabase: SupabaseClient,
  candidateId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('candidates')
    .select(
      `
      *,
      applications(
        *,
        job:jobs(id, title, department, status),
        current_stage:pipeline_stages(id, name, stage_type),
        interviews(id, status, scheduled_at, interview_type, duration_minutes, interview_feedback(id, overall_rating, recommendation)),
        offer_letters(id, status, salary, salary_currency, sent_at)
      )
    `
    )
    .eq('id', candidateId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { referencedTable: 'applications', ascending: false })
    .single()

  return { data, error }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createCandidate(
  supabase: SupabaseClient,
  orgId: string,
  data: Record<string, unknown>,
  userId: string
) {
  const { data: candidate, error } = await supabase
    .from('candidates')
    .insert({
      ...data,
      organization_id: orgId,
      created_by: userId,
    })
    .select()
    .single()

  return { data: candidate, error }
}

export async function updateCandidate(
  supabase: SupabaseClient,
  candidateId: string,
  orgId: string,
  data: Record<string, unknown>
) {
  const { data: candidate, error } = await supabase
    .from('candidates')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', candidateId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .select()
    .single()

  return { data: candidate, error }
}

export async function deleteCandidate(
  supabase: SupabaseClient,
  candidateId: string,
  orgId: string
) {
  const now = new Date().toISOString()

  // Get application IDs for this candidate (needed for feedback cascade)
  const { data: apps } = await supabase
    .from('applications')
    .select('id')
    .eq('candidate_id', candidateId)
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
      .eq('candidate_id', candidateId)
      .eq('organization_id', orgId)
      .is('deleted_at', null),
    supabase
      .from('interviews')
      .update({ deleted_at: now })
      .eq('candidate_id', candidateId)
      .eq('organization_id', orgId)
      .is('deleted_at', null),
    supabase
      .from('offer_letters')
      .update({ deleted_at: now })
      .eq('candidate_id', candidateId)
      .eq('organization_id', orgId)
      .is('deleted_at', null),
  ])

  // Hard-delete related records without deleted_at
  await Promise.all([
    supabase
      .from('candidate_match_scores')
      .delete()
      .eq('candidate_id', candidateId)
      .eq('organization_id', orgId),
    supabase
      .from('email_logs')
      .delete()
      .eq('candidate_id', candidateId)
      .eq('organization_id', orgId),
  ])

  // Soft-delete the candidate itself
  const { data, error } = await supabase
    .from('candidates')
    .update({ deleted_at: now })
    .eq('id', candidateId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .select()
    .single()

  return { data, error }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function searchCandidates(
  supabase: SupabaseClient,
  orgId: string,
  query: string
) {
  if (!query || query.trim().length === 0) {
    return { data: [], error: null }
  }

  const searchTerm = query.trim()

  const { data, error } = await supabase
    .from('candidates')
    .select('id, first_name, last_name, email, phone, tags')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .or(
      `first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,tags.cs.{${searchTerm}}`
    )
    .order('last_name', { ascending: true })
    .limit(20)

  return { data, error }
}
