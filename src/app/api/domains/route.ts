import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrganizationDomains, addCustomDomain, getDnsInstructions } from '@/lib/services/domains'
import { addDomainSchema } from '@/lib/validators/domains'

// GET /api/domains
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

    const orgId = member.organization_id
    const { data, error } = await getOrganizationDomains(supabase, orgId)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Attach DNS instructions to each domain
    const domainsWithInstructions = (data || []).map((d: { domain: string; verification_token: string }) => ({
      ...d,
      dns_instructions: getDnsInstructions(d.domain, d.verification_token),
    }))

    return NextResponse.json({ data: domainsWithInstructions })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch domains' }, { status: 500 })
  }
}

// POST /api/domains
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { organization_id, ...domainInput } = body

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
    const parsed = addDomainSchema.safeParse(domainInput)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const orgId = member.organization_id
    const { data, error } = await addCustomDomain(supabase, orgId, parsed.data.domain)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      data: {
        ...data,
        dns_instructions: getDnsInstructions(data.domain, data.verification_token),
      },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to add domain' }, { status: 500 })
  }
}
