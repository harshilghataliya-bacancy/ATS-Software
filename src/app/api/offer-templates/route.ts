import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOfferTemplates, createOfferTemplate } from '@/lib/services/offer-templates'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (!user) {
    console.error('[Offer Templates GET] Auth failed:', authError?.message)
    return NextResponse.json({ error: authError?.message || 'Session expired. Please refresh the page and try again.' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  const { data, error } = await getOfferTemplates(supabase, membership.organization_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (!user) {
    console.error('[Offer Templates POST] Auth failed:', authError?.message)
    return NextResponse.json({ error: authError?.message || 'Session expired. Please refresh the page and try again.' }, { status: 401 })
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

  if (membership.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const { name, ...rest } = body

  if (!name) {
    return NextResponse.json({ error: 'Template name is required' }, { status: 400 })
  }

  const { data, error } = await createOfferTemplate(
    supabase,
    membership.organization_id,
    { name, ...rest },
    user.id
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
