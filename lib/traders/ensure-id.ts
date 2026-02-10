import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Get or create a trader row by wallet address. Returns the trader's id (UUID)
 * for use in orders.trader_id so orders show in the user's portfolio/orders list.
 */
export async function ensureTraderId(
  client: SupabaseClient,
  walletAddress: string
): Promise<string> {
  const normalized = walletAddress.trim().toLowerCase()
  if (!normalized) throw new Error('Wallet address required')

  const { data: existing, error } = await client
    .from('traders')
    .select('id')
    .eq('wallet_address', normalized)
    .maybeSingle()

  if (error) throw error
  if (existing?.id) return existing.id

  const { data: inserted, error: insertError } = await client
    .from('traders')
    .insert({ wallet_address: normalized })
    .select('id')
    .single()

  if (insertError) throw insertError
  if (!inserted?.id) throw new Error('Failed to create trader row')

  import('@/lib/backfill/trigger-wallet-pnl-backfill')
    .then((mod) => mod.triggerWalletPnlBackfill(normalized))
    .catch((err) => {
      console.error(`[ensureTraderId] Failed to trigger PnL backfill for ${normalized}:`, err)
    })

  return inserted.id
}
