import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrganizationSubdomains, addSubdomain } from '@/lib/services/domains'
import { addSubdomainSchema } from '@/lib/validators/domains'

// GET /api/subdomains?organization_id=...
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

    const { data, error } = await getOrganizationSubdomains(supabase, orgId)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch subdomains' }, { status: 500 })
  }
}

// POST /api/subdomains
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { organization_id, ...subdomainInput } = body

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

    // Validate input
    const parsed = addSubdomainSchema.safeParse(subdomainInput)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { data, error } = await addSubdomain(supabase, organization_id, parsed.data.subdomain)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Failed to add subdomain' }, { status: 500 })
  }
}
