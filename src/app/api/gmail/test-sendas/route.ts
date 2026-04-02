import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken, updateSendAsDisplayName } from '@/lib/services/gmail'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()
    if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

    const tokenResult = await getValidAccessToken(supabase, user.id, membership.organization_id)
    if (!tokenResult.accessToken) {
      return NextResponse.json({ error: tokenResult.error }, { status: 400 })
    }

    // Fetch org name to use as display name
    const adminSupabase = createAdminClient()
    const { data: org } = await adminSupabase
      .from('organizations')
      .select('name')
      .eq('id', membership.organization_id)
      .single()
    const orgName = org?.name || 'HireFlow'

    // Get the actual Gmail account email from the token's OAuth profile
    const { google } = await import('googleapis')
    const { createOAuth2Client } = await import('@/lib/services/gmail')
    const oauthClient = createOAuth2Client()
    oauthClient.setCredentials({ access_token: tokenResult.accessToken })
    const oauth2 = google.oauth2({ version: 'v2', auth: oauthClient })
    const { data: profile } = await oauth2.userinfo.get()

    const gmailEmail = profile.email!

    // Use org name instead of Gmail profile name
    await updateSendAsDisplayName(
      tokenResult.accessToken,
      gmailEmail,
      orgName
    )

    return NextResponse.json({
      success: true,
      supabaseEmail: tokenResult.fromEmail,
      gmailEmail,
      orgName,
      displayName: tokenResult.displayName,
      message: `sendAs display name updated to "${orgName}" for ${gmailEmail}`
    })
  } catch (err: unknown) {
    const error = err as Error & { response?: { data?: unknown } }
    return NextResponse.json({
      error: error.message,
      details: error.response?.data || null,
    }, { status: 500 })
  }
}
