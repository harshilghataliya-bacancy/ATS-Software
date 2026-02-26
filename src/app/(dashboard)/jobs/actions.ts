'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Fetch org members with admin or recruiter role (assignable to jobs)
// ---------------------------------------------------------------------------

export async function getAssignableRecruiters(orgId: string) {
  const adminSupabase = createAdminClient()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated', data: null }
  }

  const { data: members, error: membersError } = await adminSupabase
    .from('organization_members')
    .select('*')
    .eq('organization_id', orgId)
    .in('role', ['admin', 'recruiter'])
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (membersError) {
    return { error: membersError.message, data: null }
  }

  const { data: { users }, error: usersError } = await adminSupabase.auth.admin.listUsers()

  if (usersError) {
    return { error: usersError.message, data: null }
  }

  const enriched = members.map((member) => {
    const authUser = users.find((u) => u.id === member.user_id)
    return {
      id: member.user_id,
      email: authUser?.email ?? 'Unknown',
      full_name: authUser?.user_metadata?.full_name ?? authUser?.email?.split('@')[0] ?? 'Unknown',
      role: member.role,
    }
  })

  return { data: enriched, error: null }
}

// ---------------------------------------------------------------------------
// Batch resolve user IDs to display names
// ---------------------------------------------------------------------------

export async function resolveUserNames(userIds: string[]) {
  if (userIds.length === 0) return { data: {}, error: null }

  const adminSupabase = createAdminClient()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated', data: null }
  }

  const { data: { users }, error: usersError } = await adminSupabase.auth.admin.listUsers()

  if (usersError) {
    return { error: usersError.message, data: null }
  }

  const nameMap: Record<string, string> = {}
  for (const uid of userIds) {
    const authUser = users.find((u) => u.id === uid)
    nameMap[uid] = authUser?.user_metadata?.full_name ?? authUser?.email?.split('@')[0] ?? 'Unknown'
  }

  return { data: nameMap, error: null }
}
