import crypto from 'crypto'
import { NextResponse } from 'next/server'

function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

export async function requireIntegrationKey(request: Request) {
  // Backward-compatible: allow previous env/header names during rollout.
  const expected = process.env.ATS_INTEGRATION_API_KEY || process.env.SYNC_SERVICE_API_KEY
  if (!expected || expected.trim().length === 0) {
    return NextResponse.json({ error: 'Integration auth is not configured' }, { status: 500 })
  }

  const provided = request.headers.get('x-integration-key') ?? request.headers.get('x-sync-service-key') ?? ''
  if (!provided || !timingSafeEqualString(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return { ok: true as const }
}
