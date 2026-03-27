import { SupabaseClient } from '@supabase/supabase-js'
import type { CommentEntityType } from '@/types/database'

export async function getComments(
  supabase: SupabaseClient,
  orgId: string,
  entityType: CommentEntityType,
  entityId: string
) {
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('organization_id', orgId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (!data || data.length === 0) return { data, error }

  // Resolve user emails from organization_members
  const userIds = Array.from(new Set(data.map((c: any) => c.user_id)))
  const { data: members } = await supabase
    .from('organization_members')
    .select('user_id, invited_email, role')
    .eq('organization_id', orgId)
    .in('user_id', userIds)

  const memberMap = new Map(members?.map((m: any) => [m.user_id, m]) || [])

  const enriched = data.map((c: any) => {
    const member = memberMap.get(c.user_id) as any
    return {
      ...c,
      user_email: member?.invited_email || null,
      user_role: member?.role || null,
    }
  })

  return { data: enriched, error }
}

export async function addComment(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  entityType: CommentEntityType,
  entityId: string,
  content: string,
  isPrivate = false
) {
  const { data, error } = await supabase
    .from('comments')
    .insert({
      organization_id: orgId,
      user_id: userId,
      entity_type: entityType,
      entity_id: entityId,
      content,
      is_private: isPrivate,
    })
    .select()
    .single()

  return { data, error }
}

export async function updateComment(
  supabase: SupabaseClient,
  commentId: string,
  orgId: string,
  userId: string,
  content: string
) {
  const { data, error } = await supabase
    .from('comments')
    .update({ content })
    .eq('id', commentId)
    .eq('organization_id', orgId)
    .eq('user_id', userId) // only owner can edit
    .select()
    .single()

  return { data, error }
}

export async function deleteComment(
  supabase: SupabaseClient,
  commentId: string,
  orgId: string,
  userId: string
) {
  const { error } = await supabase
    .from('comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', commentId)
    .eq('organization_id', orgId)
    .eq('user_id', userId) // only owner can delete

  return { error }
}
