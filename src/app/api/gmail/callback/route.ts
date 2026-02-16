import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCodeForTokens, storeGmailTokens } from '@/lib/services/gmail'

export async function GET(request: NextRequest) {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  const settingsUrl = new URL('/settings/organization', baseUrl)

  const code = request.nextUrl.searchParams.get('code')
  const stateParam = request.nextUrl.searchParams.get('state')
  const errorParam = request.nextUrl.searchParams.get('error')

  if (errorParam) {
    settingsUrl.searchParams.set('gmail_error', errorParam)
    return NextResponse.redirect(settingsUrl)
  }

  if (!code || !stateParam) {
    settingsUrl.searchParams.set('gmail_error', 'Missing authorization code')
    return NextResponse.redirect(settingsUrl)
  }

  try {
    // Decode state
    const state = JSON.parse(Buffer.from(stateParam, 'base64').toString())
    const { userId, orgId } = state as { userId: string; orgId: string }

    // Verify the user is still authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || user.id !== userId) {
      settingsUrl.searchParams.set('gmail_error', 'Authentication mismatch')
      return NextResponse.redirect(settingsUrl)
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code)

    if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
      settingsUrl.searchParams.set('gmail_error', 'Incomplete token response')
      return NextResponse.redirect(settingsUrl)
    }

    // Store tokens
    const { error } = await storeGmailTokens(supabase, userId, orgId, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      scope: tokens.scope ?? undefined,
    })

    if (error) {
      settingsUrl.searchParams.set('gmail_error', 'Failed to store tokens')
      return NextResponse.redirect(settingsUrl)
    }

    settingsUrl.searchParams.set('gmail_connected', 'true')
    return NextResponse.redirect(settingsUrl)
  } catch {
    settingsUrl.searchParams.set('gmail_error', 'OAuth exchange failed')
    return NextResponse.redirect(settingsUrl)
  }
}
