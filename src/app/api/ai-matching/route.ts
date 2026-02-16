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
    const { application_id, organization_id } = body

    if (!application_id || !organization_id) {
      return NextResponse.json(
        { error: 'application_id and organization_id are required' },
        { status: 400 }
      )
    }

    // Verify user belongs to this organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organization_id)
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 })
    }

    // Check if AI scoring is enabled
    const config = await getScoringConfig(supabase, organization_id)
    if (!config.enabled) {
      return NextResponse.json(
        { error: 'AI scoring is disabled for this organization' },
        { status: 400 }
      )
    }

    const { data, error } = await scoreCandidate(supabase, application_id, organization_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Failed to score candidate' }, { status: 500 })
  }
}

// GET /api/ai-matching?job_id=...&organization_id=... - Get all scores for a job
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('job_id')
    const orgId = searchParams.get('organization_id')

    if (!jobId || !orgId) {
      return NextResponse.json(
        { error: 'job_id and organization_id are required' },
        { status: 400 }
      )
    }

    // Verify user belongs to this organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 })
    }

    const { data, error } = await getMatchScoresForJob(supabase, jobId, orgId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch scores' }, { status: 500 })
  }
}
