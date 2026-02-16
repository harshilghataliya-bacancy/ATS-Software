import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { removeCustomDomain } from '@/lib/services/domains'

// DELETE /api/domains/[domain]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ domain: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { domain: domainId } = await params

    // Get the domain to check org membership
    const { data: domainRecord } = await supabase
      .from('organization_domains')
      .select('organization_id')
      .eq('id', domainId)
      .single()

    if (!domainRecord) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    }

    // Verify admin role
    const { data: member } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', domainRecord.organization_id)
      .eq('user_id', user.id)
      .single()

    if (!member || member.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { error } = await removeCustomDomain(supabase, domainId)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to remove domain' }, { status: 500 })
  }
}
