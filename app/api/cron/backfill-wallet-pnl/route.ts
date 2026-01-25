import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max duration for Vercel

/**
 * GET /api/cron/backfill-wallet-pnl
 * Vercel Cron job that runs daily to backfill wallet PnL data from Dome API
 * 
 * Schedule: Daily at 2 AM UTC (configured in vercel.json)
 * 
 * Optional query parameter:
 *   ?wallet=0x... - Backfill only this specific wallet (single-wallet mode)
 */
export async function GET(request: NextRequest) {
  // Security: Verify this is called by Vercel Cron or authorized caller
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('❌ Unauthorized cron request for backfill-wallet-pnl')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const walletParam = searchParams.get('wallet')?.trim().toLowerCase()

  if (walletParam) {
    console.log(`📊 Starting single-wallet PnL backfill for ${walletParam}...`)
  } else {
    console.log('📊 Starting wallet PnL backfill for all wallets...')
  }

  try {
    const mod = await import('../../../../scripts/backfill-wallet-pnl.js')
    const runBackfillWalletPnl =
      mod.runBackfillWalletPnl ?? mod.default?.runBackfillWalletPnl

    if (typeof runBackfillWalletPnl !== 'function') {
      throw new Error('Backfill entrypoint not found')
    }

    // Set WALLET env var for single-wallet mode if provided
    const originalWallet = process.env.WALLET
    if (walletParam) {
      process.env.WALLET = walletParam
    }

    try {
      const result = await runBackfillWalletPnl()
      console.log('✅ Wallet PnL backfill completed successfully')
      return NextResponse.json({
        success: true,
        message: walletParam ? `Backfill completed for ${walletParam}` : 'Backfill completed',
        result
      })
    } finally {
      // Restore original WALLET env var
      if (originalWallet !== undefined) {
        process.env.WALLET = originalWallet
      } else if (walletParam) {
        delete process.env.WALLET
      }
    }
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
