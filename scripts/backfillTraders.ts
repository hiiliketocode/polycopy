/* eslint-disable no-console */
import { createClient } from '@supabase/supabase-js'
import { syncTrader } from '../lib/ingestion/syncTrader'
import { getAuthedClobClientForUserAnyWallet } from '../lib/polymarket/authed-client'

type CliOptions = {
  limit?: number
  offset?: number
  wallet?: string
  email?: string
  userId?: string
  reset?: boolean
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

function parseArgs(): CliOptions {
  const args = process.argv.slice(2)
  const opts: CliOptions = {}

  for (const arg of args) {
    if (arg.startsWith('--limit=')) opts.limit = parseInt(arg.split('=')[1], 10)
    if (arg.startsWith('--offset=')) opts.offset = parseInt(arg.split('=')[1], 10)
    if (arg.startsWith('--wallet=')) opts.wallet = arg.split('=')[1]
    if (arg.startsWith('--email=')) opts.email = arg.split('=')[1]
    if (arg.startsWith('--user-id=')) opts.userId = arg.split('=')[1]
    if (arg === '--reset-watermark' || arg === '--reset') opts.reset = true
  }

  return opts
}

async function resetWatermark(traderId: string) {
  await supabase.from('trader_sync_state').delete().eq('trader_id', traderId)
}

async function resolveWalletForEmail(email: string): Promise<{ wallet: string; source: string }> {
  const user = await resolveAuthUserByEmail(email)

  const { data: wallets, error: walletsError } = await supabase
    .from('user_wallets')
    .select('proxy_wallet, eoa_wallet')
    .eq('user_id', user.id)

  if (walletsError) {
    throw walletsError
  }

  if (wallets && wallets.length > 0) {
    const preferred = wallets.find((w) => w.proxy_wallet) || wallets.find((w) => w.eoa_wallet)
    if (preferred?.proxy_wallet) {
      return { wallet: preferred.proxy_wallet, source: 'user_wallets.proxy_wallet' }
    }
    if (preferred?.eoa_wallet) {
      return { wallet: preferred.eoa_wallet, source: 'user_wallets.eoa_wallet' }
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('wallet_address, trading_wallet_address')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    throw profileError
  }

  if (profile?.trading_wallet_address) {
    return { wallet: profile.trading_wallet_address, source: 'profiles.trading_wallet_address' }
  }

  if (profile?.wallet_address) {
    return { wallet: profile.wallet_address, source: 'profiles.wallet_address' }
  }

  const { data: credential, error: credentialError } = await supabase
    .from('clob_credentials')
    .select('polymarket_account_address, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (credentialError) {
    throw credentialError
  }

  if (credential?.polymarket_account_address) {
    return { wallet: credential.polymarket_account_address, source: 'clob_credentials.polymarket_account_address' }
  }

  const { data: turnkeyWallet, error: turnkeyError } = await supabase
    .from('turnkey_wallets')
    .select('polymarket_account_address')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (turnkeyError) {
    throw turnkeyError
  }

  if (turnkeyWallet?.polymarket_account_address) {
    return { wallet: turnkeyWallet.polymarket_account_address, source: 'turnkey_wallets.polymarket_account_address' }
  }

  throw new Error(`No wallet found for user ${email}. Add user_wallets or profiles.wallet_address.`)
}

async function resolveAuthUserByEmail(email: string): Promise<{ id: string }> {
  const url = `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Auth admin lookup failed: ${res.status} ${text}`)
  }

  const payload = await res.json()
  const users = Array.isArray(payload) ? payload : payload?.users
  const user = users?.[0]
  if (!user) {
    throw new Error(`No auth user found for email: ${email}`)
  }

  return user
}

async function run() {
  const opts = parseArgs()

  if (opts.userId) {
    const { client, proxyAddress } = await getAuthedClobClientForUserAnyWallet(opts.userId, opts.wallet)
    console.log(`🔄 Backfilling wallet for user ${opts.userId} using turnkey credentials: ${proxyAddress}`)
    const result = await syncTrader({ wallet: proxyAddress, client })
    console.log('✅ Done', result)
    return
  }

  if (opts.email) {
    const user = await resolveAuthUserByEmail(opts.email)
    const resolved = opts.wallet
      ? { wallet: opts.wallet, source: 'cli' }
      : await resolveWalletForEmail(opts.email)
    const { client, proxyAddress } = await getAuthedClobClientForUserAnyWallet(user.id, resolved.wallet)
    console.log(`🔄 Backfilling wallet for ${opts.email} using turnkey credentials: ${proxyAddress}`)
    const result = await syncTrader({ wallet: proxyAddress, client })
    console.log('✅ Done', result)
    return
  }

  if (opts.wallet) {
    console.log(`🔄 Backfilling single wallet ${opts.wallet}`)
    const result = await syncTrader({ wallet: opts.wallet })
    console.log('✅ Done', result)
    return
  }

  const limit = opts.limit && opts.limit > 0 ? opts.limit : 200
  const offset = opts.offset && opts.offset > 0 ? opts.offset : 0

  const { data: traders, error } = await supabase
    .from('traders')
    .select('id, wallet_address')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('Failed to load traders:', error)
    process.exit(1)
  }

  if (!traders || traders.length === 0) {
    console.log('No traders to backfill.')
    return
  }

  console.log(`🔄 Backfilling ${traders.length} traders (offset ${offset})`)

  for (const trader of traders) {
    try {
      if (opts.reset) {
        await resetWatermark(trader.id)
      }
      const res = await syncTrader({ traderId: trader.id, wallet: trader.wallet_address })
      console.log(`✅ ${trader.wallet_address}: orders=${res.ordersUpserted}, fills=${res.fillsUpserted}, refreshed=${res.refreshedOrders}`)
    } catch (err: any) {
      console.error(`❌ ${trader.wallet_address}:`, err?.message || err)
    }
  }
}

run().catch((err) => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
