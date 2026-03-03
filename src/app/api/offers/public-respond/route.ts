import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { respondToOfferByToken } from '@/lib/services/offers'
import { hireApplication } from '@/lib/services/applications'

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

  // If accepted, auto-hire the application
  if (status === 'accepted' && data?.application_id && data?.organization_id) {
    await hireApplication(supabase, data.application_id, data.organization_id, null)
  }

  return NextResponse.json({ success: true, status })
}
