import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ connected: false })
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!membership) {
    return NextResponse.json({ connected: false })
  }

  const orgId = membership.organization_id

  // Check current user's token first
  const { data: ownToken } = await supabase
    .from('google_oauth_tokens')
    .select('id')
    .eq('user_id', user.id)
    .eq('organization_id', orgId)
    .eq('provider', 'gmail')
    .maybeSingle()

  if (ownToken) {
    return NextResponse.json({ connected: true })
  }

  // Fallback: check if any admin in the org has connected Gmail
  const adminSupabase = createAdminClient()
  const { data: adminMembers } = await adminSupabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', orgId)
    .eq('role', 'admin')
    .is('deleted_at', null)

  if (adminMembers) {
    for (const admin of adminMembers) {
      const { data: adminToken } = await adminSupabase
        .from('google_oauth_tokens')
        .select('id')
        .eq('user_id', admin.user_id)
        .eq('organization_id', orgId)
        .eq('provider', 'gmail')
        .maybeSingle()

      if (adminToken) {
        return NextResponse.json({ connected: true })
      }
    }
  }

  return NextResponse.json({ connected: false })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  // Admin can disconnect all org Gmail tokens; non-admin only their own
  const adminSupabase = createAdminClient()
  if (membership.role === 'admin') {
    const { error } = await adminSupabase
      .from('google_oauth_tokens')
      .delete()
      .eq('organization_id', membership.organization_id)
      .eq('provider', 'gmail')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else {
    const { error } = await supabase
      .from('google_oauth_tokens')
      .delete()
      .eq('user_id', user.id)
      .eq('organization_id', membership.organization_id)
      .eq('provider', 'gmail')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
