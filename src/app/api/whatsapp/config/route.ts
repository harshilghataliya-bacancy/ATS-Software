import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWhatsAppConfig, saveWhatsAppConfig, disconnectWhatsApp } from '@/lib/services/whatsapp'

// GET — check if WhatsApp is configured for the org
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
  const { data } = await getWhatsAppConfig(adminSupabase, membership.organization_id)

  return NextResponse.json({
    configured: !!data,
    whatsappNumber: data?.whatsapp_number || null,
    isSandbox: data?.is_sandbox ?? null,
  })
}

// POST — save Twilio config (admin only, RLS enforced)
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
  const { account_sid, auth_token, whatsapp_number, is_sandbox } = body

  if (!account_sid || !auth_token || !whatsapp_number) {
    return NextResponse.json({ error: 'All fields are required (Account SID, Auth Token, WhatsApp Number)' }, { status: 400 })
  }

  if (!whatsapp_number.startsWith('+')) {
    return NextResponse.json({ error: 'Phone number must be in E.164 format (e.g., +14155238886)' }, { status: 400 })
  }

  // Debug logging
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY
  const keyPrefix = process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20)
  console.log('[WhatsApp Config POST] Service role key exists:', hasServiceKey, '| Key prefix:', keyPrefix)
  console.log('[WhatsApp Config POST] Org ID:', membership.organization_id)

  const adminSupabase = createAdminClient()

  // Test admin client access with a simple query first
  const { data: testData, error: testError } = await adminSupabase
    .from('whatsapp_config')
    .select('id')
    .limit(1)
  console.log('[WhatsApp Config POST] Admin client test query - data:', testData, '| error:', testError)

  const { error } = await saveWhatsAppConfig(adminSupabase, membership.organization_id, {
    account_sid,
    auth_token,
    whatsapp_number,
    is_sandbox: is_sandbox ?? false,
  })

  console.log('[WhatsApp Config POST] Save result error:', error)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

// DELETE — disconnect WhatsApp (admin only)
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
  const { error } = await disconnectWhatsApp(adminSupabase, membership.organization_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
