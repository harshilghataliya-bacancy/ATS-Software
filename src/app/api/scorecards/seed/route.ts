import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createScorecard, getScorecards } from '@/lib/services/scorecards'
import { DEFAULT_SCORECARDS } from '@/lib/default-scorecards'

/**
 * POST /api/scorecards/seed
 * Seeds default scorecards matching each interview name dropdown value.
 * Skips scorecards that already exist (matched by title).
 */
export async function POST() {
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

  if (!membership || !['admin', 'recruiter'].includes(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const orgId = membership.organization_id

  // Get existing scorecards
  const { data: existing } = await getScorecards(supabase, orgId)
  const existingTitles = new Set((existing || []).map((s: { title: string }) => s.title))

  let seeded = 0
  for (const def of DEFAULT_SCORECARDS) {
    if (existingTitles.has(def.title)) continue

    const { error } = await createScorecard(supabase, orgId, user.id, {
      title: def.title,
      description: def.description,
      criteria: def.criteria,
    })

    if (!error) seeded++
  }

  return NextResponse.json({ success: true, seeded })
}
