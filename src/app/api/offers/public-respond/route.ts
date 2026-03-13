import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { respondToOfferByToken } from '@/lib/services/offers'
import { hireApplication } from '@/lib/services/applications'
import { logActivity } from '@/lib/services/activity'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { token, action } = body as { token: string; action: string }

  if (!token || !action || !['accept', 'decline'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const status = action === 'accept' ? 'accepted' : 'declined'

  const { data, error } = await respondToOfferByToken(supabase, token, status)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Log activity against the application (userId 'system' for public endpoint)
  if (data?.organization_id && data?.application_id) {
    const action = status === 'accepted' ? 'offer_accepted' : 'offer_declined'
    logActivity(supabase, data.organization_id, 'system', 'application', data.application_id, action, { source: 'public_respond' }).catch(() => {})
  }

  // If accepted, auto-hire the application
  if (status === 'accepted' && data?.application_id && data?.organization_id) {
    await hireApplication(supabase, data.application_id, data.organization_id, null)
    logActivity(supabase, data.organization_id, 'system', 'application', data.application_id, 'application_hired', { source: 'public_respond' }).catch(() => {})
  }

  return NextResponse.json({ success: true, status })
}
