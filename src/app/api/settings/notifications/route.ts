import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateOrganization } from '@/lib/services/organization'

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = req.headers.get('x-org-id')
  if (!orgId) return NextResponse.json({ error: 'Missing org' }, { status: 400 })

  // Verify admin role
  const { data: member } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .single()

  if (member?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await req.json()
  const { reminder_intervals } = body

  // Validate: must be an array of valid interval values
  const validIntervals = [720, 240, 60, 30, 15]
  if (!Array.isArray(reminder_intervals) || !reminder_intervals.every((v: number) => validIntervals.includes(v))) {
    return NextResponse.json({ error: 'Invalid intervals' }, { status: 400 })
  }

  const { data, error } = await updateOrganization(supabase, orgId, {
    reminder_intervals,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
