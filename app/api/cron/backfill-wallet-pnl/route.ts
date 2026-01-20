import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max duration for Vercel

/**
 * GET /api/cron/backfill-wallet-pnl
 * Vercel Cron job that runs daily to backfill wallet PnL data from Dome API
 * 
 * Schedule: Daily at 2 AM UTC (configured in vercel.json)
 */
export async function GET(request: NextRequest) {
  // Security: Verify this is called by Vercel Cron
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('❌ Unauthorized cron request for backfill-wallet-pnl')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('📊 Starting wallet PnL backfill...')

  try {
    const mod = await import('../../../../scripts/backfill-wallet-pnl.js')
    const runBackfillWalletPnl =
      mod.runBackfillWalletPnl ?? mod.default?.runBackfillWalletPnl

    if (typeof runBackfillWalletPnl !== 'function') {
      throw new Error('Backfill entrypoint not found')
    }

    const result = await runBackfillWalletPnl()
    console.log('✅ Wallet PnL backfill completed successfully')
    return NextResponse.json({
      success: true,
      message: 'Backfill completed',
      result
    })
  } catch (error) {
    console.error('❌ Wallet PnL backfill failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Backfill failed'
      },
      { status: 500 }
    )
  }
}
