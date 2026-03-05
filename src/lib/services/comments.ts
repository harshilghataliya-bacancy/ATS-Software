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

  return { data, error }
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
