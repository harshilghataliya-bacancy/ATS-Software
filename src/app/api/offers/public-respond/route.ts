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

  // Fetch candidate & job details for richer activity metadata
  let candidateName = 'Candidate'
  let jobTitle = 'Position'
  if (data?.application_id) {
    const { data: app } = await supabase
      .from('applications')
      .select('candidates(first_name, last_name), jobs(title)')
      .eq('id', data.application_id)
      .single()
    if (app) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = (app as any).candidates
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const j = (app as any).jobs
      if (c) candidateName = `${c.first_name} ${c.last_name}`
      if (j) jobTitle = j.title
    }
  }

  // Log activity against the application (no userId for public endpoint)
  if (data?.organization_id && data?.application_id) {
    const activityAction = status === 'accepted' ? 'offer_accepted' : 'offer_declined'
    logActivity(supabase, data.organization_id, null, 'application', data.application_id, activityAction, {
      source: 'candidate',
      candidate_name: candidateName,
      job_title: jobTitle,
    }).catch(() => {})
  }

  // If accepted, auto-hire the application
  if (status === 'accepted' && data?.application_id && data?.organization_id) {
    await hireApplication(supabase, data.application_id, data.organization_id, null)
    logActivity(supabase, data.organization_id, null, 'application', data.application_id, 'application_hired', {
      source: 'candidate',
      candidate_name: candidateName,
      job_title: jobTitle,
    }).catch(() => {})
  }

  return NextResponse.json({ success: true, status })
}
