import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWhatsAppCredentials, sendWhatsAppMessage, logWhatsAppMessage } from '@/lib/services/whatsapp'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  if (membership.role === 'interviewer') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const orgId = membership.organization_id

  const body = await request.json()
  const { candidateId, candidatePhone, message, applicationId } = body as {
    candidateId: string
    candidatePhone: string
    message: string
    applicationId?: string
  }

  if (!candidateId || !candidatePhone || !message) {
    return NextResponse.json({ error: 'Missing required fields (candidateId, candidatePhone, message)' }, { status: 400 })
  }

  // Normalize phone to E.164 (strip spaces, dashes, parentheses)
  const cleanPhone = candidatePhone.replace(/[\s\-()]/g, '')

  // Get Twilio credentials via admin client
  const { config, error: configError } = await getWhatsAppCredentials(orgId)
  if (!config) {
    return NextResponse.json(
      { error: configError || 'WhatsApp not configured. Ask an admin to set it up in Settings.' },
      { status: 400 }
    )
  }

  const fromNumber = `whatsapp:${config.whatsapp_number}`
  const toNumber = `whatsapp:${cleanPhone}`

  const adminSupabase = createAdminClient()

  try {
    const result = await sendWhatsAppMessage({
      accountSid: config.account_sid,
      authToken: config.auth_token,
      from: fromNumber,
      to: toNumber,
      body: message,
    })

    // Log success (fire-and-forget)
    logWhatsAppMessage(adminSupabase, orgId, {
      candidate_id: candidateId,
      application_id: applicationId,
      from_number: config.whatsapp_number,
      to_number: cleanPhone,
      message_body: message,
      direction: 'outbound',
      twilio_message_sid: result.sid,
      status: 'sent',
      sent_by: user.id,
    }).catch((err) => console.error('[WhatsApp Log Error]', err))

    return NextResponse.json({ success: true, messageSid: result.sid })
  } catch (err) {
    console.error('[WhatsApp Send Error]', err)

    // Log failure (fire-and-forget)
    logWhatsAppMessage(adminSupabase, orgId, {
      candidate_id: candidateId,
      application_id: applicationId,
      from_number: config.whatsapp_number,
      to_number: cleanPhone,
      message_body: message,
      direction: 'outbound',
      status: 'failed',
      sent_by: user.id,
      error_message: err instanceof Error ? err.message : 'Unknown error',
    }).catch((logErr) => console.error('[WhatsApp Log Error]', logErr))

    const errorMsg = err instanceof Error ? err.message : 'Failed to send WhatsApp message'
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}
