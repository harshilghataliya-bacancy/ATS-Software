import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rollbackApplication } from '@/lib/services/applications'
import { logActivity } from '@/lib/services/activity'

export async function POST(request: NextRequest) {
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

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  if (!['admin', 'recruiter', 'hiring_manager'].includes(membership.role)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const body = await request.json()
  const { applicationId } = body as { applicationId: string }

  if (!applicationId) {
    return NextResponse.json({ error: 'Missing applicationId' }, { status: 400 })
  }

  const { data, error } = await rollbackApplication(
    supabase, applicationId, membership.organization_id, user.id
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Log activity
  logActivity(supabase, membership.organization_id, user.id, 'application', applicationId, 'application_rollback', {}).catch(() => {})

  return NextResponse.json({ success: true, data })
}
