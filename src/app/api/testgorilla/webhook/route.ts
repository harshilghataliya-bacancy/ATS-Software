import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — receive TestGorilla webhook (unauthenticated)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      event,
      assessment_id,
      test_taker_id,
      candidature_id,
      score,
      completed_at,
    } = body

    if (!assessment_id) {
      return NextResponse.json({ error: 'Missing assessment_id' }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    // Find matching invitation(s)
    let query = adminSupabase
      .from('assessment_invitations')
      .select('id, organization_id, status')
      .eq('testgorilla_assessment_id', assessment_id)

    if (test_taker_id) {
      query = query.eq('testgorilla_test_taker_id', test_taker_id)
    }

    const { data: invitations, error: findError } = await query

    if (findError || !invitations?.length) {
      // No matching invitation — might be for a different org or manually created
      return NextResponse.json({ ok: true, matched: false })
    }

    // Determine new status from event type
    let newStatus: 'started' | 'completed' | undefined
    if (event === 'assessment.started' || event === 'test_taker.started') {
      newStatus = 'started'
    } else if (event === 'assessment.completed' || event === 'test_taker.completed') {
      newStatus = 'completed'
    }

    // Update each matching invitation
    for (const inv of invitations) {
      const updates: Record<string, unknown> = {}

      if (newStatus) updates.status = newStatus
      if (score !== undefined) updates.score = score
      if (completed_at) updates.completed_at = completed_at
      if (candidature_id) updates.testgorilla_candidature_id = candidature_id
      if (test_taker_id && !inv.status) updates.testgorilla_test_taker_id = test_taker_id

      if (body) updates.results_data = body

      if (Object.keys(updates).length > 0) {
        await adminSupabase
          .from('assessment_invitations')
          .update(updates)
          .eq('id', inv.id)
      }
    }

    return NextResponse.json({ ok: true, matched: true, count: invitations.length })
  } catch (err) {
    console.error('[TestGorilla Webhook] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
