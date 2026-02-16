'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function resolveUserNames(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {}

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const adminSupabase = createAdminClient()
  const result: Record<string, string> = {}

  for (const uid of userIds) {
    const { data } = await adminSupabase.auth.admin.getUserById(uid)
    if (data?.user) {
      result[uid] = data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'Unknown'
    }
  }

  return result
}

export async function resolveUserDetails(userIds: string[]): Promise<Record<string, { name: string; email: string }>> {
  if (userIds.length === 0) return {}

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const adminSupabase = createAdminClient()
  const result: Record<string, { name: string; email: string }> = {}

  for (const uid of userIds) {
    const { data } = await adminSupabase.auth.admin.getUserById(uid)
    if (data?.user) {
      result[uid] = {
        name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'Unknown',
        email: data.user.email || '',
      }
    }
  }

  return result
}
