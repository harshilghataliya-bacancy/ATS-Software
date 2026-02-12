import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGmailAuthUrl } from '@/lib/services/gmail'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'))
  }

  // Get user's organization
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'))
  }

  const state = JSON.stringify({
    userId: user.id,
    orgId: membership.organization_id,
  })

  const stateEncoded = Buffer.from(state).toString('base64')
  const url = getGmailAuthUrl(stateEncoded)

  return NextResponse.redirect(url)
}
