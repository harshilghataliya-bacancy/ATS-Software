import { NextRequest, NextResponse } from 'next/server'
import { processInterviewReminders } from '@/lib/services/reminders'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Allow up to 60s for processing

export async function GET(req: NextRequest) {
  // Verify cron secret (set CRON_SECRET env var in Vercel + cron-job.org)
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await processInterviewReminders()

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Cron] Interview reminders failed:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
