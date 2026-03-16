'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export interface RecruiterInfo {
  user_id: string
  email: string
  full_name: string
  role: string
}

export async function getRecruitersWithDetails(
  orgId: string
): Promise<{ data: RecruiterInfo[] | null; error: string | null }> {
  const adminSupabase = createAdminClient()
  const supabase = await createClient()

  // Verify caller is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated', data: null }
  }

  // Fetch members with admin or recruiter role
  const { data: members, error: membersError } = await adminSupabase
    .from('organization_members')
    .select('user_id, role')
    .eq('organization_id', orgId)
    .in('role', ['admin', 'recruiter'])
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (membersError) {
    return { error: membersError.message, data: null }
  }

  // Fetch all auth users to get email/name
  const {
    data: { users },
    error: usersError,
  } = await adminSupabase.auth.admin.listUsers()

  if (usersError) {
    return { error: usersError.message, data: null }
  }

  const enriched: RecruiterInfo[] = members.map((member) => {
    const authUser = users.find((u) => u.id === member.user_id)
    return {
      user_id: member.user_id,
      email: authUser?.email ?? 'Unknown',
      full_name:
        authUser?.user_metadata?.full_name ??
        authUser?.email?.split('@')[0] ??
        'Unknown',
      role: member.role,
    }
  })

  return { data: enriched, error: null }
}
