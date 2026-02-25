import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findOrgByWhatsAppNumber, findCandidateByPhone, logWhatsAppMessage } from '@/lib/services/whatsapp'

/**
 * Twilio WhatsApp Webhook — receives inbound messages from candidates.
 * Twilio POSTs application/x-www-form-urlencoded with fields:
 *   From, To, Body, MessageSid, NumMedia, etc.
 *
 * Must return TwiML (XML) — even an empty <Response/> to acknowledge.
 */

const TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const from = formData.get('From') as string | null       // e.g. "whatsapp:+917228091579"
    const to = formData.get('To') as string | null           // e.g. "whatsapp:+14155238886"
    const body = formData.get('Body') as string | null
    const messageSid = formData.get('MessageSid') as string | null

    console.log('[WhatsApp Webhook] Inbound:', { from, to, body: body?.substring(0, 50), messageSid })

    if (!from || !to || !body) {
      console.warn('[WhatsApp Webhook] Missing fields, ignoring')
      return new NextResponse(TWIML_EMPTY, {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    const adminSupabase = createAdminClient()

    // 1. Find which org owns this Twilio WhatsApp number
    const toClean = to.replace(/^whatsapp:/, '').replace(/[\s\-()]/g, '')
    const { data: orgConfig } = await findOrgByWhatsAppNumber(adminSupabase, to)

    if (!orgConfig) {
      console.warn('[WhatsApp Webhook] No org found for number:', toClean)
      return new NextResponse(TWIML_EMPTY, {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    // 2. Find which candidate sent this message (match by phone)
    const fromClean = from.replace(/^whatsapp:/, '').replace(/[\s\-()]/g, '')
    const { data: candidate } = await findCandidateByPhone(adminSupabase, orgConfig.organization_id, from)

    if (!candidate) {
      console.warn('[WhatsApp Webhook] No candidate found for phone:', fromClean, 'in org:', orgConfig.organization_id)
      // Still acknowledge — just don't log since we can't link to a candidate
      return new NextResponse(TWIML_EMPTY, {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    // 3. Log the inbound message
    await logWhatsAppMessage(adminSupabase, orgConfig.organization_id, {
      candidate_id: candidate.id,
      from_number: fromClean,
      to_number: toClean,
      message_body: body,
      direction: 'inbound',
      twilio_message_sid: messageSid || undefined,
      status: 'delivered',
    })

    console.log('[WhatsApp Webhook] Logged inbound message from', candidate.first_name, candidate.last_name)

    return new NextResponse(TWIML_EMPTY, {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (err) {
    console.error('[WhatsApp Webhook Error]', err)
    // Always return valid TwiML to avoid Twilio retries
    return new NextResponse(TWIML_EMPTY, {
      headers: { 'Content-Type': 'text/xml' },
    })
  }
}
