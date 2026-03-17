import { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EntityType =
  | 'job'
  | 'candidate'
  | 'application'
  | 'interview'
  | 'offer'
  | 'organization'

interface ActivityFilters {
  entityType?: EntityType
  entityId?: string
  userId?: string
  limit?: number
  offset?: number
}

// ---------------------------------------------------------------------------
// Log Activity
// ---------------------------------------------------------------------------

export async function logActivity(
  supabase: SupabaseClient,
  orgId: string,
  userId: string | null,
  entityType: EntityType,
  entityId: string,
  action: string,
  metadata?: Record<string, unknown>
) {
  const { data, error } = await supabase
    .from('activity_logs')
    .insert({
      organization_id: orgId,
      user_id: userId,
      entity_type: entityType,
      entity_id: entityId,
      action,
      metadata: metadata ?? {},
    })
    .select()
    .single()

  return { data, error }
}

// ---------------------------------------------------------------------------
// Query Activity
// ---------------------------------------------------------------------------

export async function getActivityLog(
  supabase: SupabaseClient,
  orgId: string,
  filters: ActivityFilters = {}
) {
  const { entityType, entityId, userId, limit = 50, offset = 0 } = filters

  let query = supabase
    .from('activity_logs')
    .select(
      `
      *,
      user:organization_members(user_id, role)
    `,
      { count: 'exact' }
    )
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (entityType) {
    query = query.eq('entity_type', entityType)
  }

  if (entityId) {
    query = query.eq('entity_id', entityId)
  }

  if (userId) {
    query = query.eq('user_id', userId)
  }

  const { data, error, count } = await query

  return { data, error, count }
}

// ---------------------------------------------------------------------------
// Query Activity for a Candidate (across all their applications)
// ---------------------------------------------------------------------------

export async function getCandidateActivityLog(
  supabase: SupabaseClient,
  orgId: string,
  candidateId: string,
  limit = 50
) {
  // First get all application IDs for this candidate
  const { data: apps } = await supabase
    .from('applications')
    .select('id')
    .eq('organization_id', orgId)
    .eq('candidate_id', candidateId)

  const entityIds = [candidateId, ...(apps?.map((a) => a.id) || [])]

  const { data, error, count } = await supabase
    .from('activity_logs')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .in('entity_id', entityIds)
    .order('created_at', { ascending: false })
    .limit(limit)

  return { data, error, count }
}
