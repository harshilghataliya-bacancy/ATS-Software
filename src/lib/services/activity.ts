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
  userId: string,
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
