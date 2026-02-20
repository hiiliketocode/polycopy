import { supabase } from '@/lib/supabase'

/**
 * Fetches the user's wallet address. Checks turnkey_wallets first (preferring
 * wallet_type 'imported_magic'), then falls back to clob_credentials.
 * This mirrors the logic in /api/portfolio and /api/polymarket/link-status.
 */
export async function fetchUserWalletAddress(userId: string): Promise<string | null> {
  const { data: wallets, error: walletsError } = await supabase
    .from('turnkey_wallets')
    .select('polymarket_account_address, eoa_address, wallet_type')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (!walletsError && wallets && wallets.length > 0) {
    const imported = wallets.find((w: any) => w.wallet_type === 'imported_magic')
    const best = imported || wallets[0]
    const addr = best.polymarket_account_address || best.eoa_address || null
    if (addr) return addr
  }

  const { data: cred } = await supabase
    .from('clob_credentials')
    .select('polymarket_account_address')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return cred?.polymarket_account_address || null
}
