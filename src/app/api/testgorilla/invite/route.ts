import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getTestGorillaCredentials,
  inviteCandidate,
  createAssessmentInvitation,
} from '@/lib/services/testgorilla'

// POST — invite candidate to TestGorilla assessment
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!membership || !['admin', 'recruiter', 'hiring_manager'].includes(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await request.json()
  const { application_id } = body

  if (!application_id) {
    return NextResponse.json({ error: 'application_id is required' }, { status: 400 })
  }

  const orgId = membership.organization_id

  // Get application with candidate and job
  const { data: app, error: appError } = await supabase
    .from('applications')
    .select('id, candidate_id, job_id, candidates(email, first_name, last_name), jobs(testgorilla_assessment_id)')
    .eq('id', application_id)
    .eq('organization_id', orgId)
    .single()

  if (appError || !app) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidate = app.candidates as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job = app.jobs as any
  const assessmentId = job?.testgorilla_assessment_id

  if (!assessmentId) {
    return NextResponse.json({ error: 'No TestGorilla assessment configured for this job' }, { status: 400 })
  }

  // Get TG credentials
  const { config, error: configError } = await getTestGorillaCredentials(orgId)
  if (configError || !config) {
    return NextResponse.json({ error: 'TestGorilla not configured' }, { status: 400 })
  }

  // Invite candidate via TG API
  try {
    const result = await inviteCandidate(config.api_key, assessmentId, {
      email: candidate.email,
      first_name: candidate.first_name,
      last_name: candidate.last_name,
    })

    // Save invitation record
    const adminSupabase = createAdminClient()
    const { data: invitation, error: saveError } = await createAssessmentInvitation(
      adminSupabase,
      orgId,
      {
        application_id,
        candidate_id: app.candidate_id,
        job_id: app.job_id,
        testgorilla_assessment_id: assessmentId,
        testgorilla_test_taker_id: result.test_taker_id || result.id || null,
        testgorilla_candidature_id: result.candidature_id || null,
        invited_by: user.id,
      }
    )

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, invitation })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to invite candidate'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
