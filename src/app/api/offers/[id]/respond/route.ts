import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { respondToOffer, expireOffer } from '@/lib/services/offers'
import { hireApplication } from '@/lib/services/applications'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  const body = await request.json()
  const { status, notes } = body as { status: 'accepted' | 'declined' | 'expired'; notes?: string }

  if (!status || !['accepted', 'declined', 'expired'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status. Must be accepted, declined, or expired.' }, { status: 400 })
  }

  if (status === 'expired') {
    const { data, error } = await expireOffer(supabase, id, membership.organization_id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, data })
  }

  const { data, error } = await respondToOffer(
    supabase,
    id,
    membership.organization_id,
    status,
    notes
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Auto-hire the application when offer is accepted
  if (status === 'accepted' && data?.application_id) {
    await hireApplication(supabase, data.application_id, membership.organization_id, user.id)
  }

  return NextResponse.json({ success: true, data })
}
