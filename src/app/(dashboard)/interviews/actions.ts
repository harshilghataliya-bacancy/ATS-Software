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

  const settled = await Promise.allSettled(
    userIds.map((uid) => adminSupabase.auth.admin.getUserById(uid))
  )
  settled.forEach((res, i) => {
    if (res.status === 'fulfilled' && res.value.data?.user) {
      const u = res.value.data.user
      result[userIds[i]] = u.user_metadata?.full_name || u.email?.split('@')[0] || 'Unknown'
    }
  })

  return result
}

export async function resolveUserDetails(userIds: string[]): Promise<Record<string, { name: string; email: string }>> {
  if (userIds.length === 0) return {}

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const adminSupabase = createAdminClient()
  const result: Record<string, { name: string; email: string }> = {}

  const settled = await Promise.allSettled(
    userIds.map((uid) => adminSupabase.auth.admin.getUserById(uid))
  )
  settled.forEach((res, i) => {
    if (res.status === 'fulfilled' && res.value.data?.user) {
      const u = res.value.data.user
      result[userIds[i]] = {
        name: u.user_metadata?.full_name || u.email?.split('@')[0] || 'Unknown',
        email: u.email || '',
      }
    }
  })

  return result
}
