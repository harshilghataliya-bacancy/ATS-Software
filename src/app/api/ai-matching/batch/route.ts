import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scoreCandidate } from '@/lib/services/ai-matching'

// POST /api/ai-matching/batch - Score all unscored applications for a job
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { job_id, organization_id, rescore } = body

    if (!job_id || !organization_id) {
      return NextResponse.json(
        { error: 'job_id and organization_id are required' },
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

    // Get ALL applications for the job (not filtered by status)
    const { data: applications, error: appsError } = await supabase
      .from('applications')
      .select('id')
      .eq('job_id', job_id)
      .eq('organization_id', organization_id)

    if (appsError) {
      return NextResponse.json({ error: appsError.message }, { status: 500 })
    }

    if (!applications || applications.length === 0) {
      return NextResponse.json({ data: { scored: 0, total: 0 } })
    }

    // If rescore=true, re-score ALL applications; otherwise only unscored ones
    let appsToScore = applications
    if (!rescore) {
      const { data: existingScores } = await supabase
        .from('candidate_match_scores')
        .select('application_id')
        .eq('job_id', job_id)
        .eq('organization_id', organization_id)

      const scoredAppIds = new Set(existingScores?.map((s) => s.application_id) ?? [])
      appsToScore = applications.filter((a) => !scoredAppIds.has(a.id))
    }

    if (appsToScore.length === 0) {
      return NextResponse.json({ data: { scored: 0, total: 0, message: 'All applications already scored' } })
    }

    // Score each application sequentially to avoid rate limits
    let scored = 0
    const errors: string[] = []

    for (const app of appsToScore) {
      try {
        const { error } = await scoreCandidate(supabase, app.id, organization_id)
        if (error) {
          errors.push(`${app.id}: ${error.message}`)
        } else {
          scored++
        }
      } catch (err) {
        errors.push(`${app.id}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    return NextResponse.json({
      data: {
        scored,
        total: appsToScore.length,
        errors: errors.length > 0 ? errors : undefined,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to batch score' }, { status: 500 })
  }
}
