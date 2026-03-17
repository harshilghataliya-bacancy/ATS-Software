import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateAssessmentScore } from '@/lib/services/assessments'
import { logActivity } from '@/lib/services/activity'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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

  const body = await request.json()
  const { score } = body

  if (score == null || typeof score !== 'number' || score < 0 || score > 100) {
    return NextResponse.json({ error: 'score must be a number between 0 and 100' }, { status: 400 })
  }

  const { data, error } = await updateAssessmentScore(supabase, id, membership.organization_id, score)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log activity for assessment score
  const { data: invitation } = await supabase
    .from('assessment_invitations')
    .select('application_id, assessment_name, candidates(first_name, last_name), jobs(title)')
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .single()

  if (invitation) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidate = (invitation as any).candidates
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = (invitation as any).jobs
    const candidateName = candidate ? `${candidate.first_name} ${candidate.last_name}` : 'Candidate'
    logActivity(supabase, membership.organization_id, user.id, 'application', invitation.application_id, 'assessment_completed', {
      assessment_name: invitation.assessment_name || 'Assessment',
      score,
      candidate_name: candidateName,
      job_title: job?.title || 'Position',
    }).catch(() => {})
  }

  return NextResponse.json({ success: true, data })
}
