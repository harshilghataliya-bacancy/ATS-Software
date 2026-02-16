import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getScoringConfig, updateScoringConfig } from '@/lib/services/ai-matching'

// GET /api/ai-matching/config?organization_id=...
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = new URL(request.url).searchParams.get('organization_id')
    if (!orgId) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 })
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

    const config = await getScoringConfig(supabase, orgId)
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
    const { organization_id, ...config } = body

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 })
    }

    // Verify admin role
    const { data: member } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organization_id)
      .eq('user_id', user.id)
      .single()

    if (!member || member.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { data, error } = await updateScoringConfig(supabase, organization_id, config)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 })
  }
}
