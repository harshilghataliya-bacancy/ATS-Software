import { NextRequest, NextResponse } from 'next/server'
import { processInboxSync } from '@/lib/services/email-inbox-connector'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min max

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await processInboxSync()
    console.log('[InboxSync] Completed:', JSON.stringify(result))

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[InboxSync] Failed:', error)
    return NextResponse.json(
      { error: 'Sync failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
