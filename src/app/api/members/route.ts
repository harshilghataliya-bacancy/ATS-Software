import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  const adminSupabase = createAdminClient()

  const { data: members, error } = await adminSupabase
    .from('organization_members')
    .select('user_id, role')
    .eq('organization_id', membership.organization_id)
    .is('deleted_at', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: { users } } = await adminSupabase.auth.admin.listUsers()

  const enriched = (members ?? []).map((m) => {
    const u = users.find((u) => u.id === m.user_id)
    return {
      user_id: m.user_id,
      role: m.role,
      email: u?.email ?? '',
      full_name: u?.user_metadata?.full_name ?? u?.email?.split('@')[0] ?? '',
    }
  }).filter((m) => m.email)

  return NextResponse.json({ data: enriched })
}
