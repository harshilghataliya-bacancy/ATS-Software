import { NextRequest, NextResponse } from 'next/server'
import { processInboxSync } from '@/lib/services/email-inbox-connector'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min max for background processing

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fire-and-forget: start processing in background, return immediately
  // waitUntil keeps the serverless function alive after response is sent
  const promise = processInboxSync()
    .then((result) => {
      console.log('[InboxSync] Completed:', JSON.stringify(result))
    })
    .catch((error) => {
      console.error('[InboxSync] Failed:', error)
    })

  // Use waitUntil if available (Vercel Edge/Serverless), otherwise just fire-and-forget
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any
  if (typeof g.__nextWaitUntil === 'function') {
    g.__nextWaitUntil(promise)
  }

  return NextResponse.json({
    success: true,
    message: 'Inbox sync started in background',
    timestamp: new Date().toISOString(),
  })
}
