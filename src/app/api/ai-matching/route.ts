import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scoreCandidate, getMatchScoresForJob, getScoringConfig } from '@/lib/services/ai-matching'

// POST /api/ai-matching - Score a candidate for a job
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { application_id } = body

    if (!application_id) {
      return NextResponse.json(
        { error: 'application_id is required' },
        { status: 400 }
      )
    }

    // Derive org from user's membership
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'No organization' }, { status: 403 })
    }

    const orgId = member.organization_id

    // Check if AI scoring is enabled
    const config = await getScoringConfig(supabase, orgId)
    if (!config.enabled) {
      return NextResponse.json(
        { error: 'AI scoring is disabled for this organization' },
        { status: 400 }
      )
    }

    const { data, error } = await scoreCandidate(supabase, application_id, orgId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Failed to score candidate' }, { status: 500 })
  }
}

// GET /api/ai-matching?job_id=... - Get all scores for a job
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('job_id')

    if (!jobId) {
      return NextResponse.json(
        { error: 'job_id is required' },
        { status: 400 }
      )
    }

    // Derive org from user's membership
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'No organization' }, { status: 403 })
    }

    const { data, error } = await getMatchScoresForJob(supabase, jobId, member.organization_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch scores' }, { status: 500 })
  }
}
