import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getScoringConfig, updateScoringConfig } from '@/lib/services/ai-matching'

// GET /api/ai-matching/config
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    const config = await getScoringConfig(supabase, member.organization_id)
    return NextResponse.json({ data: config })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 })
  }
}

// PUT /api/ai-matching/config
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { organization_id, ...config } = body

    // Derive org from user's membership + verify admin
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'No organization' }, { status: 403 })
    }

    if (member.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { data, error } = await updateScoringConfig(supabase, member.organization_id, config)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 })
  }
}
