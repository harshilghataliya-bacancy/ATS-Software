import { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

// ---------------------------------------------------------------------------
// Get WhatsApp Config (without auth_token — safe for status checks)
// ---------------------------------------------------------------------------

export async function getWhatsAppConfig(
  supabase: SupabaseClient,
  orgId: string
) {
  const { data, error } = await supabase
    .from('whatsapp_config')
    .select('id, organization_id, account_sid, whatsapp_number, is_sandbox, created_at, updated_at')
    .eq('organization_id', orgId)
    .maybeSingle()

  return { data, error }
}

// ---------------------------------------------------------------------------
// Get Full Credentials (server-only, uses admin client)
// ---------------------------------------------------------------------------

export async function getWhatsAppCredentials(orgId: string) {
  const adminSupabase = createAdminClient()
  const { data, error } = await adminSupabase
    .from('whatsapp_config')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (error || !data) {
    return { config: null, error: error?.message || 'WhatsApp not configured' }
  }

  return { config: data, error: null }
}

// ---------------------------------------------------------------------------
// Save / Update Config (admin only — RLS enforced)
// ---------------------------------------------------------------------------

export async function saveWhatsAppConfig(
  supabase: SupabaseClient,
  orgId: string,
  config: {
    account_sid: string
    auth_token: string
    whatsapp_number: string
    is_sandbox?: boolean
  }
) {
  const { data, error } = await supabase
    .from('whatsapp_config')
    .upsert(
      {
        organization_id: orgId,
        account_sid: config.account_sid,
        auth_token: config.auth_token,
        whatsapp_number: config.whatsapp_number,
        is_sandbox: config.is_sandbox ?? false,
      },
      { onConflict: 'organization_id' }
    )
    .select()
    .single()

  return { data, error }
}

// ---------------------------------------------------------------------------
// Disconnect (delete config)
// ---------------------------------------------------------------------------

export async function disconnectWhatsApp(
  supabase: SupabaseClient,
  orgId: string
) {
  const { error } = await supabase
    .from('whatsapp_config')
    .delete()
    .eq('organization_id', orgId)

  return { error }
}

// ---------------------------------------------------------------------------
// Send WhatsApp Message via Twilio REST API
// ---------------------------------------------------------------------------

export async function sendWhatsAppMessage(params: {
  accountSid: string
  authToken: string
  from: string
  to: string
  body: string
}) {
  const { accountSid, authToken, from, to, body } = params

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.message || `Twilio API error: ${response.status}`)
  }

  return data as { sid: string; status: string }
}

// ---------------------------------------------------------------------------
// Log WhatsApp Message
// ---------------------------------------------------------------------------

export async function logWhatsAppMessage(
  supabase: SupabaseClient,
  orgId: string,
  message: {
    candidate_id: string
    application_id?: string
    from_number: string
    to_number: string
    message_body: string
    direction: 'outbound' | 'inbound'
    twilio_message_sid?: string
    status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed'
    sent_by?: string
    error_message?: string
  }
) {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .insert({
      ...message,
      organization_id: orgId,
    })
    .select()
    .single()

  return { data, error }
}

// ---------------------------------------------------------------------------
// Find Org by WhatsApp Number (for inbound webhook)
// ---------------------------------------------------------------------------

export async function findOrgByWhatsAppNumber(supabase: SupabaseClient, phoneNumber: string) {
  // Normalize: strip "whatsapp:" prefix and spaces
  const clean = phoneNumber.replace(/^whatsapp:/, '').replace(/[\s\-()]/g, '')

  const { data, error } = await supabase
    .from('whatsapp_config')
    .select('organization_id, whatsapp_number')
    .eq('whatsapp_number', clean)
    .maybeSingle()

  return { data, error }
}

// ---------------------------------------------------------------------------
// Find Candidate by Phone Number within an Org (for inbound webhook)
// ---------------------------------------------------------------------------

export async function findCandidateByPhone(supabase: SupabaseClient, orgId: string, phoneNumber: string) {
  // Normalize: strip "whatsapp:" prefix, spaces, dashes
  const clean = phoneNumber.replace(/^whatsapp:/, '').replace(/[\s\-()]/g, '')

  // Try exact match first, then try with/without country code variations
  const { data, error } = await supabase
    .from('candidates')
    .select('id, first_name, last_name, phone')
    .eq('organization_id', orgId)
    .not('phone', 'is', null)

  if (error || !data) return { data: null, error }

  // Normalize all candidate phones and compare
  const match = data.find((c) => {
    const candidatePhone = (c.phone || '').replace(/[\s\-()]/g, '')
    return candidatePhone === clean || candidatePhone.endsWith(clean.replace(/^\+\d{1,3}/, '')) || clean.endsWith(candidatePhone.replace(/^\+\d{1,3}/, ''))
  })

  return { data: match || null, error: null }
}

// ---------------------------------------------------------------------------
// Get Message History for a Candidate
// ---------------------------------------------------------------------------

export async function getWhatsAppMessages(
  supabase: SupabaseClient,
  orgId: string,
  candidateId: string,
  phone?: string | null,
  limit: number = 50
) {
  // If phone is provided, fetch all messages to/from that number (handles duplicate candidates)
  if (phone) {
    const clean = phone.replace(/[\s\-()]/g, '')
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('organization_id', orgId)
      .or(`from_number.eq.${clean},to_number.eq.${clean}`)
      .order('created_at', { ascending: true })
      .limit(limit)

    return { data, error }
  }

  // Fallback: fetch by candidate_id only
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('organization_id', orgId)
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: true })
    .limit(limit)

  return { data, error }
}
