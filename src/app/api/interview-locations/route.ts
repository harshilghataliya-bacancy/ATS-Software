import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET — list all locations for the org
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!member) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { data, error } = await supabase
    .from('interview_locations')
    .select('*')
    .eq('organization_id', member.organization_id)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST — create a new location (admin only)
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!member) return NextResponse.json({ error: 'No organization' }, { status: 403 })
  if (member.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const { name } = await req.json()
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Location name is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('interview_locations')
    .insert({ organization_id: member.organization_id, name: name.trim() })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Location already exists' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// PUT — update a location (admin only)
export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!member) return NextResponse.json({ error: 'No organization' }, { status: 403 })
  if (member.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const { id, name } = await req.json()
  if (!id || !name || !name.trim()) {
    return NextResponse.json({ error: 'ID and name are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('interview_locations')
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', member.organization_id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Location already exists' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// DELETE — remove a location (admin only)
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!member) return NextResponse.json({ error: 'No organization' }, { status: 403 })
  if (member.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

  const { error } = await supabase
    .from('interview_locations')
    .delete()
    .eq('id', id)
    .eq('organization_id', member.organization_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
