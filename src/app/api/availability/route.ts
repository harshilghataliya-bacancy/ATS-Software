import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function getCurrentWeekRange() {
  const now = new Date()
  // Get Monday of current week (locale-aware using day offset)
  const dayOfWeek = now.getDay() // 0=Sun, 1=Mon, ...
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday)
  const friday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4)
  return { monday, friday }
}

function toDateString(d: Date) {
  // Returns YYYY-MM-DD in local timezone (not UTC)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// GET — list availability for current week (optionally filter by user_id query param)
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: member } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!member) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { monday, friday } = getCurrentWeekRange()
  const filterUserId = req.nextUrl.searchParams.get('user_id')

  let query = admin
    .from('interviewer_availability')
    .select('*')
    .eq('organization_id', member.organization_id)
    .gte('date', toDateString(monday))
    .lte('date', toDateString(friday))
    .order('date')
    .order('start_time')

  if (filterUserId) {
    query = query.eq('user_id', filterUserId)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST — add availability slot
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: member } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!member) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { date, start_time, end_time } = await req.json()

  if (!date || !start_time || !end_time) {
    return NextResponse.json({ error: 'Date, start_time, and end_time are required' }, { status: 400 })
  }

  // Validate current week only (Mon-Fri)
  const { monday, friday } = getCurrentWeekRange()
  const mondayStr = toDateString(monday)
  const fridayStr = toDateString(friday)
  if (date < mondayStr || date > fridayStr) {
    return NextResponse.json({ error: 'Can only add availability for the current week (Mon-Fri)' }, { status: 400 })
  }

  // Validate not past date
  const todayStr = toDateString(new Date())
  if (date < todayStr) {
    return NextResponse.json({ error: 'Cannot add availability for past dates' }, { status: 400 })
  }

  // Validate start < end
  if (start_time >= end_time) {
    return NextResponse.json({ error: 'Start time must be before end time' }, { status: 400 })
  }

  // Check overlaps
  const { data: existing } = await admin
    .from('interviewer_availability')
    .select('id, start_time, end_time')
    .eq('user_id', user.id)
    .eq('date', date)

  const hasOverlap = (existing ?? []).some(
    (slot: { start_time: string; end_time: string }) =>
      start_time < slot.end_time && end_time > slot.start_time
  )
  if (hasOverlap) {
    return NextResponse.json({ error: 'This time slot overlaps with an existing slot' }, { status: 409 })
  }

  const { data, error } = await admin
    .from('interviewer_availability')
    .insert({
      organization_id: member.organization_id,
      user_id: user.id,
      date,
      start_time,
      end_time,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// PUT — update availability slot
export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: member } = await admin
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!member) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { id, start_time, end_time } = await req.json()
  if (!id || !start_time || !end_time) {
    return NextResponse.json({ error: 'ID, start_time, and end_time are required' }, { status: 400 })
  }

  if (start_time >= end_time) {
    return NextResponse.json({ error: 'Start time must be before end time' }, { status: 400 })
  }

  // Fetch existing slot
  const { data: slot } = await admin
    .from('interviewer_availability')
    .select('*')
    .eq('id', id)
    .eq('organization_id', member.organization_id)
    .single()

  if (!slot) return NextResponse.json({ error: 'Slot not found' }, { status: 404 })
  if (slot.user_id !== user.id && member.role !== 'admin') {
    return NextResponse.json({ error: 'You can only edit your own availability' }, { status: 403 })
  }

  // Check overlaps (excluding self)
  const { data: existing } = await admin
    .from('interviewer_availability')
    .select('id, start_time, end_time')
    .eq('user_id', slot.user_id)
    .eq('date', slot.date)
    .neq('id', id)

  const hasOverlap = (existing ?? []).some(
    (s: { start_time: string; end_time: string }) =>
      start_time < s.end_time && end_time > s.start_time
  )
  if (hasOverlap) {
    return NextResponse.json({ error: 'This time slot overlaps with an existing slot' }, { status: 409 })
  }

  const { data, error } = await admin
    .from('interviewer_availability')
    .update({ start_time, end_time })
    .eq('id', id)
    .eq('organization_id', member.organization_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// DELETE — remove availability slot
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: member } = await admin
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!member) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

  // Check ownership
  const { data: slot } = await admin
    .from('interviewer_availability')
    .select('user_id')
    .eq('id', id)
    .eq('organization_id', member.organization_id)
    .single()

  if (!slot) return NextResponse.json({ error: 'Slot not found' }, { status: 404 })
  if (slot.user_id !== user.id && member.role !== 'admin') {
    return NextResponse.json({ error: 'You can only delete your own availability' }, { status: 403 })
  }

  const { error } = await admin
    .from('interviewer_availability')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
