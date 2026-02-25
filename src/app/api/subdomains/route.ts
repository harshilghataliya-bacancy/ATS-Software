import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrganizationSubdomains, addSubdomain } from '@/lib/services/domains'
import { addSubdomainSchema } from '@/lib/validators/domains'

// GET /api/subdomains
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

    const { data, error } = await getOrganizationSubdomains(supabase, member.organization_id)
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { organization_id, ...subdomainInput } = body

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

    // Validate input
    const parsed = addSubdomainSchema.safeParse(subdomainInput)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { data, error } = await addSubdomain(supabase, member.organization_id, parsed.data.subdomain)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Failed to add subdomain' }, { status: 500 })
  }
}
