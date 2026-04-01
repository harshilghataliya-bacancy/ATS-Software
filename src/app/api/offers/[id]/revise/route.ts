import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { reviseOffer } from '@/lib/services/offers'
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
    .select('organization_id, role')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  if (!['admin', 'recruiter'].includes(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await request.json()
  const orgId = membership.organization_id

  const { data, error } = await reviseOffer(supabase, id, orgId, body, user.id)

  if (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string }).message || 'Failed to revise offer'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // Log activity
  const candidate = data?.application?.candidate
  const job = data?.application?.job
  logActivity(supabase, orgId, user.id, 'application', data.application_id, 'offer_revised', {
    offer_id: data.id,
    previous_offer_id: id,
    version: data.version,
    candidate_name: candidate ? `${candidate.first_name} ${candidate.last_name}` : undefined,
    job_title: job?.title,
  }).catch(() => {})

  return NextResponse.json({ success: true, data })
}
