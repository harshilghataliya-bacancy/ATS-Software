import { google } from 'googleapis'
import { SupabaseClient } from '@supabase/supabase-js'
import MailComposer from 'nodemailer/lib/mail-composer'
import { createAdminClient } from '@/lib/supabase/admin'

// ---------------------------------------------------------------------------
// OAuth2 Client
// ---------------------------------------------------------------------------

export function createOAuth2Client() {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${baseUrl}/api/gmail/callback`
  )
}

// ---------------------------------------------------------------------------
// Auth URL
// ---------------------------------------------------------------------------

export function getGmailAuthUrl(state: string) {
  const client = createOAuth2Client()
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.settings.basic',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state,
  })
}

// ---------------------------------------------------------------------------
// Exchange code for tokens
// ---------------------------------------------------------------------------

export async function exchangeCodeForTokens(code: string) {
  const client = createOAuth2Client()
  const { tokens } = await client.getToken(code)
  return tokens
}

// ---------------------------------------------------------------------------
// Store tokens in DB
// ---------------------------------------------------------------------------

export async function storeGmailTokens(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  tokens: { access_token: string; refresh_token: string; expiry_date: number; scope?: string; display_name?: string }
) {
  const { error } = await supabase
    .from('google_oauth_tokens')
    .upsert(
      {
        user_id: userId,
        organization_id: orgId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expiry: new Date(tokens.expiry_date).toISOString(),
        scopes: tokens.scope ? tokens.scope.split(' ') : ['https://www.googleapis.com/auth/gmail.send'],
        provider: 'gmail',
        display_name: tokens.display_name || null,
      },
      { onConflict: 'user_id,organization_id,provider' }
    )

  return { error }
}

// ---------------------------------------------------------------------------
// Get valid access token (auto-refresh if expired)
// ---------------------------------------------------------------------------

export async function getValidAccessToken(
  supabase: SupabaseClient,
  userId: string,
  orgId: string
): Promise<{ accessToken: string; refreshToken: string; fromEmail: string; displayName: string | null; error: null } | { accessToken: null; refreshToken: null; fromEmail: null; displayName: null; error: string }> {
  // Use admin client to bypass RLS on google_oauth_tokens (user-scoped policy)
  const adminSupabase = createAdminClient()

  // Always use org name as display name (not the Gmail account's profile name)
  const { data: org } = await adminSupabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single()
  const orgDisplayName = org?.name || null

  // First try the current user's token
  const { data: tokenRow } = await adminSupabase
    .from('google_oauth_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .eq('provider', 'gmail')
    .maybeSingle()

  if (tokenRow) {
    const result = await resolveToken(adminSupabase, tokenRow)
    if (result) {
      // Resolve the actual Gmail email from the OAuth token
      const gmailEmail = await resolveGmailEmail(result, tokenRow)
      return { accessToken: result, refreshToken: tokenRow.refresh_token, fromEmail: gmailEmail, displayName: orgDisplayName, error: null }
    }
  }

  // Fallback: find an admin in this org who has connected Gmail
  const { data: adminMembers } = await adminSupabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', orgId)
    .eq('role', 'admin')
    .is('deleted_at', null)

  if (adminMembers) {
    for (const admin of adminMembers) {
      if (admin.user_id === userId) continue // already tried this user
      const { data: adminToken } = await adminSupabase
        .from('google_oauth_tokens')
        .select('*')
        .eq('user_id', admin.user_id)
        .eq('organization_id', orgId)
        .eq('provider', 'gmail')
        .maybeSingle()

      if (adminToken) {
        const result = await resolveToken(adminSupabase, adminToken)
        if (result) {
          const gmailEmail = await resolveGmailEmail(result, adminToken)
          return { accessToken: result, refreshToken: adminToken.refresh_token, fromEmail: gmailEmail, displayName: orgDisplayName, error: null }
        }
      }
    }
  }

  return { accessToken: null, refreshToken: null, fromEmail: null, displayName: null, error: 'Gmail not connected. Ask an admin to connect Gmail in Settings.' }
}

// Resolve the actual Gmail email address from OAuth token
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveGmailEmail(accessToken: string, tokenRow: any): Promise<string> {
  // If we have a cached gmail_email, use it
  if (tokenRow.gmail_email) return tokenRow.gmail_email
  // Otherwise fetch from Google userinfo
  try {
    const client = createOAuth2Client()
    client.setCredentials({ access_token: accessToken })
    const oauth2 = google.oauth2({ version: 'v2', auth: client })
    const { data: profile } = await oauth2.userinfo.get()
    return profile.email || ''
  } catch {
    return ''
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveToken(adminSupabase: SupabaseClient, tokenRow: any): Promise<string | null> {
  const expiry = new Date(tokenRow.token_expiry).getTime()
  const now = Date.now()

  // If token is still valid (with 60s buffer), return it
  if (expiry - now > 60_000) {
    return tokenRow.access_token
  }

  // Refresh the token
  const client = createOAuth2Client()
  client.setCredentials({ refresh_token: tokenRow.refresh_token })

  try {
    const { credentials } = await client.refreshAccessToken()
    if (!credentials.access_token) return null

    // Update the DB (admin client bypasses RLS)
    await adminSupabase
      .from('google_oauth_tokens')
      .update({
        access_token: credentials.access_token,
        token_expiry: new Date(credentials.expiry_date!).toISOString(),
      })
      .eq('id', tokenRow.id)

    return credentials.access_token
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Send email via Gmail API
// ---------------------------------------------------------------------------

export async function sendGmailEmail(
  accessToken: string,
  params: {
    from: string
    fromName?: string
    to: string
    cc?: string
    subject: string
    html: string
    refreshToken?: string
    attachments?: Array<{
      filename: string
      content: Buffer | Uint8Array
      contentType: string
    }>
  }
) {
  // The From field display name is respected by Gmail API only when the
  // email address matches the authenticated Gmail account
  const fromField = params.fromName
    ? `"${params.fromName.replace(/"/g, '')}" <${params.from}>`
    : params.from

  const mail = new MailComposer({
    from: fromField,
    to: params.to,
    cc: params.cc || undefined,
    subject: params.subject,
    html: params.html,
    attachments: params.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content),
      contentType: a.contentType,
    })),
  })

  const message = await mail.compile().build()
  const raw = message
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const client = createOAuth2Client()
  client.setCredentials({ access_token: accessToken })

  const gmail = google.gmail({ version: 'v1', auth: client })

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  })

  return result.data
}

// ---------------------------------------------------------------------------
// Update Gmail Send As display name (sets the name shown on sent emails)
// ---------------------------------------------------------------------------

export async function updateSendAsDisplayName(
  accessToken: string,
  email: string,
  displayName: string
) {
  const client = createOAuth2Client()
  client.setCredentials({ access_token: accessToken })

  const gmail = google.gmail({ version: 'v1', auth: client })

  await gmail.users.settings.sendAs.update({
    userId: 'me',
    sendAsEmail: email,
    requestBody: {
      displayName,
      sendAsEmail: email,
    },
  })
}

// ---------------------------------------------------------------------------
// Disconnect Gmail
// ---------------------------------------------------------------------------

export async function disconnectGmail(
  supabase: SupabaseClient,
  userId: string,
  orgId: string
) {
  const { error } = await supabase
    .from('google_oauth_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .eq('provider', 'gmail')

  return { error }
}
