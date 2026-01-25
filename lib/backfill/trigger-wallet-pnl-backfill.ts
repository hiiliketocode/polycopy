/**
 * Utility to trigger a PnL backfill for a single wallet.
 * This runs asynchronously and doesn't block the caller.
 * 
 * Used when:
 * - A new trader is added to the traders table
 * - A wallet is viewed on a trader page but has no PnL data
 * - Any other scenario where we want to ensure a wallet's PnL is backfilled
 */

/**
 * Trigger a backfill for a single wallet via the cron endpoint.
 * This is fire-and-forget and won't block the caller.
 */
export async function triggerWalletPnlBackfill(wallet: string): Promise<void> {
  const normalizedWallet = wallet.toLowerCase().trim()
  if (!normalizedWallet || !normalizedWallet.startsWith('0x')) {
    return // Invalid wallet address
  }

  try {
    // Use VERCEL_URL in production, fallback to localhost for dev
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
                   (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 
                    'http://localhost:3000')
    const backfillUrl = `${baseUrl}/api/cron/backfill-wallet-pnl?wallet=${encodeURIComponent(normalizedWallet)}`

    if (process.env.CRON_SECRET) {
      // Fire and forget - don't wait for response
      fetch(backfillUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.CRON_SECRET}`
        }
      }).catch((err) => {
        console.error(`[triggerWalletPnlBackfill] Failed to trigger backfill for ${normalizedWallet}:`, err)
      })
    } else {
      console.warn(`[triggerWalletPnlBackfill] CRON_SECRET not set, cannot trigger backfill for ${normalizedWallet}`)
    }
  } catch (err) {
    console.error(`[triggerWalletPnlBackfill] Error triggering backfill for ${normalizedWallet}:`, err)
  }
}
