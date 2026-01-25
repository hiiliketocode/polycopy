#!/usr/bin/env node
'use strict'
/**
 * Check for wallets that should have PnL data but don't.
 * Uses same logic as backfill-wallet-pnl.js to determine which wallets should be tracked.
 */

const fs = require('fs')
const path = require('path')
let dotenv = null
try {
  dotenv = require('dotenv')
} catch (err) {
  if (err?.code !== 'MODULE_NOT_FOUND') {
    throw err
  }
}
const { createClient } = require('@supabase/supabase-js')

const envPath = path.resolve(process.cwd(), '.env.local')
if (dotenv && fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const TRADER_PAGE_SIZE = 1000
const PAGE = 1000

/** Load all trader wallet_addresses (no is_active filter). */
async function loadTraderWallets() {
  const wallets = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('traders')
      .select('wallet_address')
      .order('wallet_address', { ascending: true })
      .range(offset, offset + TRADER_PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break

    wallets.push(...data)
    if (data.length < TRADER_PAGE_SIZE) break
    offset += TRADER_PAGE_SIZE
  }

  return wallets.map((r) => r.wallet_address).filter(Boolean)
}

/** Load distinct trader_wallet from follows where active = true. */
async function loadFollowedWallets() {
  const { data, error } = await supabase
    .from('follows')
    .select('trader_wallet')
    .eq('active', true)

  if (error) throw error
  const raw = (data || []).map((r) => r.trader_wallet).filter(Boolean)
  return [...new Set(raw.map((w) => w.toLowerCase()))]
}

/** Distinct trader_wallet from trades_public (RPC). */
async function loadWalletsFromTradesPublic() {
  const { data, error } = await supabase.rpc('get_distinct_trader_wallets_from_trades_public')
  if (error) {
    console.warn('get_distinct_trader_wallets_from_trades_public failed:', error.message)
    return []
  }
  const raw = (data || []).map((r) => (r && r.wallet) || r).filter(Boolean)
  return [...new Set(raw.map((w) => String(w).toLowerCase()))]
}

/** Distinct copied_trader_wallet from orders (RPC). */
async function loadWalletsFromOrdersCopiedTraders() {
  const { data, error } = await supabase.rpc('get_distinct_copied_trader_wallets_from_orders')
  if (error) {
    console.warn('get_distinct_copied_trader_wallets_from_orders failed:', error.message)
    return []
  }
  const raw = (data || []).map((r) => (r && r.wallet) || r).filter(Boolean)
  return [...new Set(raw.map((w) => String(w).toLowerCase()))]
}

/**
 * Wallets to backfill: traders + follows (active) + trades_public.trader_wallet
 * + orders.copied_trader_wallet. Deduped and lowercased.
 */
async function loadWalletsForBackfill() {
  const [traderWallets, followedWallets, tradesWallets, ordersWallets] = await Promise.all([
    loadTraderWallets(),
    loadFollowedWallets(),
    loadWalletsFromTradesPublic(),
    loadWalletsFromOrdersCopiedTraders()
  ])

  const seen = new Set()
  const result = []

  for (const w of traderWallets) {
    const lower = w.toLowerCase()
    if (!lower || seen.has(lower)) continue
    seen.add(lower)
    result.push(lower)
  }

  for (const w of followedWallets) {
    if (!w || seen.has(w)) continue
    seen.add(w)
    result.push(w)
  }

  for (const w of tradesWallets) {
    if (!w || seen.has(w)) continue
    seen.add(w)
    result.push(w)
  }

  for (const w of ordersWallets) {
    if (!w || seen.has(w)) continue
    seen.add(w)
    result.push(w)
  }

  result.sort()
  return result
}

/** Load all wallets that have PnL data */
async function loadWalletsWithPnl() {
  const wallets = new Set()
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('wallet_realized_pnl_daily')
      .select('wallet_address')
      .order('wallet_address', { ascending: true })
      .range(offset, offset + PAGE - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    for (const r of data) {
      if (r.wallet_address) {
        wallets.add(r.wallet_address.toLowerCase())
      }
    }

    if (data.length < PAGE) break
    offset += PAGE
  }

  return wallets
}

async function main() {
  console.log('🔍 Checking for missing wallets...\n')

  console.log('Loading wallets that should have PnL data...')
  const shouldHavePnl = await loadWalletsForBackfill()
  console.log(`  Found ${shouldHavePnl.length} wallets that should have PnL data\n`)

  console.log('Loading wallets that currently have PnL data...')
  const hasPnl = await loadWalletsWithPnl()
  console.log(`  Found ${hasPnl.size} wallets with existing PnL data\n`)

  const missing = shouldHavePnl.filter((w) => !hasPnl.has(w))

  console.log('📊 Summary:')
  console.log(`  Wallets that should have PnL: ${shouldHavePnl.length}`)
  console.log(`  Wallets with PnL data: ${hasPnl.size}`)
  console.log(`  Missing wallets: ${missing.length}\n`)

  if (missing.length > 0) {
    console.log('Missing wallets:')
    missing.forEach((wallet, idx) => {
      console.log(`  ${idx + 1}. ${wallet}`)
    })
    console.log(`\n✅ Found ${missing.length} wallets that need backfill`)
  } else {
    console.log('✅ All wallets that should have PnL data already have it!')
  }

  return { shouldHavePnl: shouldHavePnl.length, hasPnl: hasPnl.size, missing: missing.length, missingWallets: missing }
}

if (require.main === module) {
  main()
    .then((result) => {
      process.exit(0)
    })
    .catch((e) => {
      console.error('Error:', e)
      process.exit(1)
    })
}

module.exports = { main, loadWalletsForBackfill, loadWalletsWithPnl }
