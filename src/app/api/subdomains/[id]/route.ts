import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { removeSubdomain } from '@/lib/services/domains'

// DELETE /api/subdomains/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: subdomainId } = await params

    // Get the subdomain to check org membership
    const { data: subdomainRecord } = await supabase
      .from('organization_subdomains')
      .select('organization_id')
      .eq('id', subdomainId)
      .single()

    if (!subdomainRecord) {
      return NextResponse.json({ error: 'Subdomain not found' }, { status: 404 })
    }

    // Verify admin role
    const { data: member } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', subdomainRecord.organization_id)
      .eq('user_id', user.id)
      .single()

    if (!member || member.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { error } = await removeSubdomain(supabase, subdomainId)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to remove subdomain' }, { status: 500 })
  }
}
