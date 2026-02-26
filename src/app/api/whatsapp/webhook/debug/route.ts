import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findOrgByWhatsAppNumber, findCandidateByPhone } from '@/lib/services/whatsapp'

/**
 * Debug endpoint to test webhook matching logic.
 * POST with same body as the webhook to see what matches.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const from = formData.get('From') as string | null
    const to = formData.get('To') as string | null
    const body = formData.get('Body') as string | null

    const debug: Record<string, unknown> = {
      received: { from, to, body },
    }

    if (!from || !to || !body) {
      return NextResponse.json({ ...debug, error: 'Missing From, To, or Body' }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    // Step 1: Check what's in whatsapp_config
    const toClean = to.replace(/^whatsapp:/, '').replace(/[\s\-()]/g, '')
    debug.toClean = toClean

    const { data: allConfigs } = await adminSupabase
      .from('whatsapp_config')
      .select('organization_id, whatsapp_number, is_sandbox')

    debug.allConfigs = allConfigs

    const { data: orgConfig, error: orgError } = await findOrgByWhatsAppNumber(adminSupabase, to)
    debug.orgMatch = orgConfig
    debug.orgError = orgError?.message || null

    if (!orgConfig) {
      return NextResponse.json({ ...debug, result: 'FAILED at step 1: No org found for this WhatsApp number' })
    }

    // Step 2: Check candidate phone matching
    const fromClean = from.replace(/^whatsapp:/, '').replace(/[\s\-()]/g, '')
    debug.fromClean = fromClean

    const { data: allCandidates } = await adminSupabase
      .from('candidates')
      .select('id, first_name, last_name, phone')
      .eq('organization_id', orgConfig.organization_id)
      .not('phone', 'is', null)
      .limit(20)

    debug.candidatesWithPhones = allCandidates?.map(c => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`,
      phone: c.phone,
    }))

    const { data: candidate, error: candError } = await findCandidateByPhone(adminSupabase, orgConfig.organization_id, from)
    debug.candidateMatch = candidate
    debug.candidateError = candError?.message || null

    if (!candidate) {
      return NextResponse.json({ ...debug, result: 'FAILED at step 2: No candidate found for this phone number' })
    }

    return NextResponse.json({ ...debug, result: 'SUCCESS: Would log message for ' + candidate.first_name + ' ' + candidate.last_name })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
