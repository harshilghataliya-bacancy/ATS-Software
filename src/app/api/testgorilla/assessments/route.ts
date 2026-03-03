import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTestGorillaCredentials, listAssessments } from '@/lib/services/testgorilla'

// GET — list assessments from TestGorilla API (for job edit dropdown)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { config, error: configError } = await getTestGorillaCredentials(membership.organization_id)
  if (configError || !config) {
    return NextResponse.json({ error: 'TestGorilla not configured' }, { status: 400 })
  }

  try {
    const assessments = await listAssessments(config.api_key)
    return NextResponse.json({ assessments })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch assessments'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
