import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTestGorillaConfig, saveTestGorillaConfig, disconnectTestGorilla } from '@/lib/services/testgorilla'

// GET — check if TestGorilla is configured for the org
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ configured: false })

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!membership) return NextResponse.json({ configured: false })

  const adminSupabase = createAdminClient()
  const { data } = await getTestGorillaConfig(adminSupabase, membership.organization_id)

  return NextResponse.json({
    configured: !!data,
    isEnabled: data?.is_enabled ?? false,
  })
}

// POST — save API key (admin only)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const { api_key } = body

  if (!api_key) {
    return NextResponse.json({ error: 'API key is required' }, { status: 400 })
  }

  const adminSupabase = createAdminClient()
  const { error } = await saveTestGorillaConfig(adminSupabase, membership.organization_id, { api_key })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

// DELETE — disconnect TestGorilla (admin only)
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const adminSupabase = createAdminClient()
  const { error } = await disconnectTestGorilla(adminSupabase, membership.organization_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
