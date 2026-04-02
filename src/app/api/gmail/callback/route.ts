import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exchangeCodeForTokens, storeGmailTokens, createOAuth2Client, updateSendAsDisplayName } from '@/lib/services/gmail'

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

    // Fetch the organization name to use as the email display name
    const adminSupabase = createAdminClient()
    const { data: org } = await adminSupabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single()
    const orgName = org?.name || undefined

    // Fetch Gmail account email using the access token
    let userEmail: string | undefined
    try {
      const oauthClient = createOAuth2Client()
      oauthClient.setCredentials({ access_token: tokens.access_token })
      const oauth2 = google.oauth2({ version: 'v2', auth: oauthClient })
      const { data: profile } = await oauth2.userinfo.get()
      userEmail = profile.email || undefined
    } catch {
      // Non-fatal — email will be resolved from Supabase user
    }

    // Use org name as display name (not the Gmail account's profile name)
    const displayName = orgName

    // Store tokens
    const { error } = await storeGmailTokens(supabase, userId, orgId, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      scope: tokens.scope ?? undefined,
      display_name: displayName,
    })

    if (error) {
      settingsUrl.searchParams.set('gmail_error', 'Failed to store tokens')
      return NextResponse.redirect(settingsUrl)
    }

    // Set the Gmail Send As display name to the org name
    // This configures the account-level setting that Gmail uses for outgoing mail
    if (displayName && userEmail) {
      try {
        await updateSendAsDisplayName(tokens.access_token, userEmail, displayName)
      } catch (err) {
        console.error('[Gmail OAuth] Failed to set Send As display name:', err)
        // Non-fatal — emails will still send, just with default name
      }
    }

    settingsUrl.searchParams.set('gmail_connected', 'true')
    return NextResponse.redirect(settingsUrl)
  } catch {
    settingsUrl.searchParams.set('gmail_error', 'OAuth exchange failed')
    return NextResponse.redirect(settingsUrl)
  }
}
