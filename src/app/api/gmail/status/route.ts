import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ connected: false })
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ connected: false })
  }

  const { data: token } = await supabase
    .from('google_oauth_tokens')
    .select('id')
    .eq('user_id', user.id)
    .eq('organization_id', membership.organization_id)
    .eq('provider', 'gmail')
    .single()

  return NextResponse.json({ connected: !!token })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  const { error } = await supabase
    .from('google_oauth_tokens')
    .delete()
    .eq('user_id', user.id)
    .eq('organization_id', membership.organization_id)
    .eq('provider', 'gmail')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
