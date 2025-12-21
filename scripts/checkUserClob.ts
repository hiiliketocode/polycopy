/* eslint-disable no-console */
import { createClient } from '@supabase/supabase-js'
import { getAuthedClobClientForUserAnyWallet } from '../lib/polymarket/authed-client'
import type { TradeParams } from '@polymarket/clob-client/dist/types'

type CliOptions = {
  email?: string
  wallet?: string
  userId?: string
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

type TradeQuery = TradeParams & { limit?: number }
type OpenOrdersQuery = { owner?: string; maker_address?: string; limit?: number }

function parseArgs(): CliOptions {
  const args = process.argv.slice(2)
  const opts: CliOptions = {}

  for (const arg of args) {
    if (arg.startsWith('--email=')) opts.email = arg.split('=')[1]
    if (arg.startsWith('--wallet=')) opts.wallet = arg.split('=')[1]
    if (arg.startsWith('--user-id=')) opts.userId = arg.split('=')[1]
  }

  return opts
}

async function resolveAuthUserByEmail(email: string): Promise<{ id: string; email: string | null }> {
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
  if (!opts.email && !opts.userId) {
    console.error('Provide --email=... or --user-id=...')
    process.exit(1)
  }

  const user = opts.userId
    ? { id: opts.userId, email: null }
    : await resolveAuthUserByEmail(opts.email as string)
  console.log('User:', { id: user.id, email: user.email })

  const { data: profile } = await supabase
    .from('profiles')
    .select('wallet_address, trading_wallet_address')
    .eq('id', user.id)
    .maybeSingle()

  const { data: userWallets } = await supabase
    .from('user_wallets')
    .select('id, proxy_wallet, eoa_wallet, clob_enabled')
    .eq('user_id', user.id)

  const { data: clobCreds } = await supabase
    .from('clob_credentials')
    .select('polymarket_account_address, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const { data: turnkeyWallets } = await supabase
    .from('turnkey_wallets')
    .select('id, wallet_type, eoa_address, polymarket_account_address')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  let clobByProxy = null
  let turnkeyByProxy = null
  if (opts.wallet) {
    const { data: clobMatch } = await supabase
      .from('clob_credentials')
      .select('user_id, polymarket_account_address, created_at')
      .ilike('polymarket_account_address', opts.wallet.toLowerCase())
      .limit(1)
      .maybeSingle()
    clobByProxy = clobMatch

    const { data: turnkeyMatch } = await supabase
      .from('turnkey_wallets')
      .select('user_id, wallet_type, eoa_address, polymarket_account_address')
      .ilike('polymarket_account_address', opts.wallet.toLowerCase())
      .limit(1)
      .maybeSingle()
    turnkeyByProxy = turnkeyMatch
  }

  console.log('Profile:', profile || null)
  console.log('user_wallets:', userWallets || [])
  console.log('clob_credentials:', clobCreds || [])
  console.log('turnkey_wallets:', turnkeyWallets || [])
  if (opts.wallet) {
    console.log('clob_credentials (by proxy):', clobByProxy || null)
    console.log('turnkey_wallets (by proxy):', turnkeyByProxy || null)
  }

  const proxyOverride = opts.wallet || clobCreds?.[0]?.polymarket_account_address || profile?.trading_wallet_address || null
  if (!proxyOverride) {
    throw new Error('No proxy wallet found to test CLOB calls')
  }

  const { client, proxyAddress } = await getAuthedClobClientForUserAnyWallet(user.id, proxyOverride)
  console.log('CLOB proxy address:', proxyAddress)

  const tradesAll = await client.getTradesPaginated({ limit: 50 } as TradeQuery)
  const tradesMaker = await client.getTradesPaginated(
    { maker_address: proxyAddress, limit: 50 } as TradeQuery
  )
  const openOrders = await client.getOpenOrders(
    { owner: proxyAddress, maker_address: proxyAddress, limit: 50 } as OpenOrdersQuery,
    true
  )

  console.log('Trades (authed, any):', tradesAll.trades?.length ?? 0)
  console.log('Trades (maker_address):', tradesMaker.trades?.length ?? 0)
  console.log('Open orders:', Array.isArray(openOrders) ? openOrders.length : 0)
}

run().catch((err) => {
  console.error('Check failed:', err?.message || err)
  process.exit(1)
})
