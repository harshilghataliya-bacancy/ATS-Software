import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getTestGorillaCredentials,
  getResults,
  getAssessmentInvitation,
  getAssessmentInvitationsForJob,
  updateAssessmentResults,
} from '@/lib/services/testgorilla'

// GET — fetch results from TG API and update local record
export async function GET(request: NextRequest) {
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

  const orgId = membership.organization_id
  const { searchParams } = new URL(request.url)
  const applicationId = searchParams.get('application_id')
  const jobId = searchParams.get('job_id')

  const adminSupabase = createAdminClient()

  // Get TG credentials
  const { config, error: configError } = await getTestGorillaCredentials(orgId)
  if (configError || !config) {
    return NextResponse.json({ error: 'TestGorilla not configured' }, { status: 400 })
  }

  // Single application
  if (applicationId) {
    const { data: invitation } = await getAssessmentInvitation(adminSupabase, applicationId, orgId)
    if (!invitation) {
      return NextResponse.json({ invitation: null })
    }

    // Try to refresh from TG if not completed
    if (invitation.status !== 'completed' && invitation.testgorilla_test_taker_id) {
      try {
        const results = await getResults(
          config.api_key,
          invitation.testgorilla_assessment_id,
          invitation.testgorilla_test_taker_id
        )

        const resultsList = results.results ?? results
        if (Array.isArray(resultsList) && resultsList.length > 0) {
          const latest = resultsList[0]
          const newStatus = latest.completed_at ? 'completed' : latest.started_at ? 'started' : 'invited'
          await updateAssessmentResults(adminSupabase, invitation.id, orgId, {
            status: newStatus as 'invited' | 'started' | 'completed',
            score: latest.score ?? null,
            results_data: latest,
            completed_at: latest.completed_at || null,
          })
          invitation.status = newStatus
          invitation.score = latest.score ?? null
          invitation.results_data = latest
          invitation.completed_at = latest.completed_at || null
        }
      } catch {
        // Silently fail — return existing data
      }
    }

    return NextResponse.json({ invitation })
  }

  // All invitations for a job
  if (jobId) {
    const { data: invitations } = await getAssessmentInvitationsForJob(adminSupabase, jobId, orgId)
    return NextResponse.json({ invitations: invitations ?? [] })
  }

  return NextResponse.json({ error: 'application_id or job_id is required' }, { status: 400 })
}
