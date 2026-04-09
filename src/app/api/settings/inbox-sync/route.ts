import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = (await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).is('deleted_at', null).single()).data?.organization_id
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 400 })

  const { data } = await supabase
    .from('inbox_sync_config')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle()

  return NextResponse.json({ config: data || { enabled: false, scan_label: 'INBOX', auto_parse_resume: true, source_tag: 'email-inbox' } })
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const member = (await supabase.from('organization_members').select('organization_id, role').eq('user_id', user.id).is('deleted_at', null).single()).data
  if (!member || member.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await req.json()
  const orgId = member.organization_id

  const { error } = await supabase
    .from('inbox_sync_config')
    .upsert({
      organization_id: orgId,
      enabled: body.enabled ?? false,
      scan_label: body.scan_label || 'INBOX',
      auto_parse_resume: body.auto_parse_resume ?? true,
      source_tag: body.source_tag || 'email-inbox',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
