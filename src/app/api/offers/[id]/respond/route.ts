import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { respondToOffer, expireOffer, revokeOffer } from '@/lib/services/offers'
import { hireApplication } from '@/lib/services/applications'
import { logActivity } from '@/lib/services/activity'

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
    .is('deleted_at', null)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  const body = await request.json()
  const { status, notes } = body as { status: 'accepted' | 'declined' | 'expired' | 'revoked'; notes?: string }

  if (!status || !['accepted', 'declined', 'expired', 'revoked'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status. Must be accepted, declined, expired, or revoked.' }, { status: 400 })
  }

  const orgId = membership.organization_id

  if (status === 'expired') {
    const { data, error } = await expireOffer(supabase, id, orgId)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (data?.application_id) logActivity(supabase, orgId, user.id, 'application', data.application_id, 'offer_expired', { offer_id: id }).catch(() => {})
    return NextResponse.json({ success: true, data })
  }

  if (status === 'revoked') {
    const { data, error } = await revokeOffer(supabase, id, orgId, notes)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (data?.application_id) logActivity(supabase, orgId, user.id, 'application', data.application_id, 'offer_revoked', { offer_id: id }).catch(() => {})
    return NextResponse.json({ success: true, data })
  }

  const { data, error } = await respondToOffer(
    supabase,
    id,
    orgId,
    status,
    notes
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const action = status === 'accepted' ? 'offer_accepted' : 'offer_declined'
  if (data?.application_id) logActivity(supabase, orgId, user.id, 'application', data.application_id, action, { offer_id: id }).catch(() => {})

  // Auto-hire the application when offer is accepted
  if (status === 'accepted' && data?.application_id) {
    await hireApplication(supabase, data.application_id, orgId, user.id)
    logActivity(supabase, orgId, user.id, 'application', data.application_id, 'application_hired', {}).catch(() => {})
  }

  return NextResponse.json({ success: true, data })
}
