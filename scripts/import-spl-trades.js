'use strict'

/**
 * Small helper to fetch Polymarket trades for a wallet and save them
 * into the `trades_public` table (one row per trade).
 *
 * Usage:
 *   node scripts/import-spl-trades.js <wallet> [limit] [--dry-run]
 *
 * Examples:
 *   node scripts/import-spl-trades.js 0x6af75d4e4aaf700450efbac3708cce1665810ff1 5
 *   node scripts/import-spl-trades.js 0x6af75d4e4aaf700450efbac3708cce1665810ff1 3 --dry-run
 *
 * Requirements:
 * - .env.local (or .env) with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * - Run the 020_create_spl_trade_log migration, then 025_finalize_public_spl
 *   and 026_rename_spl_to_trades_public to create and finalize the `trades_public` table
 */

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const { createClient } = require('@supabase/supabase-js')

// Load env (prioritize .env.local if present)
const envPath = path.resolve(process.cwd(), '.env.local')
dotenv.config(fs.existsSync(envPath) ? { path: envPath } : {})

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

const DEFAULT_WALLET = '0x6af75d4e4aaf700450efbac3708cce1665810ff1'

async function fetchTrades(wallet, limit) {
  const url = `https://data-api.polymarket.com/trades?user=${wallet}&limit=${limit}`
  const res = await fetch(url, { headers: { 'User-Agent': 'Polycopy SPL Importer' } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Trades API returned ${res.status}: ${text}`)
  }

  const trades = await res.json()
  if (!Array.isArray(trades)) {
    throw new Error('Unexpected trades payload (not an array)')
  }
  return trades
}

function deriveTradeId(trade, wallet) {
  // Prefer transaction hash; fall back to a deterministic composite id
  if (trade.transactionHash) return trade.transactionHash
  const parts = [
    wallet.toLowerCase(),
    trade.asset || 'asset',
    trade.conditionId || 'condition',
    trade.timestamp || Date.now()
  ]
  return parts.join('-')
}

function toTimestamp(dateLike) {
  if (!dateLike && dateLike !== 0) return null
  let ts = Number(dateLike)
  if (!Number.isFinite(ts)) return null
  if (ts < 10000000000) {
    ts = ts * 1000 // seconds -> ms
  }
  return new Date(ts).toISOString()
}

function formatTrade(trade, wallet) {
  return {
    trade_id: deriveTradeId(trade, wallet),
    trader_wallet: wallet.toLowerCase(),
    transaction_hash: trade.transactionHash || null,
    asset: trade.asset || null,
    condition_id: trade.conditionId || null,
    market_slug: trade.slug || null,
    event_slug: trade.eventSlug || null,
    market_title: trade.title || null,
    side: trade.side || null,
    outcome: trade.outcome || null,
    outcome_index: Number.isFinite(trade.outcomeIndex) ? trade.outcomeIndex : null,
    size: trade.size !== undefined ? Number(trade.size) : null,
    price: trade.price !== undefined ? Number(trade.price) : null,
    trade_timestamp: toTimestamp(trade.timestamp),
    raw: trade
  }
}

async function main() {
  const args = process.argv.slice(2)
  const walletArg = args[0]
  const limitArg = args[1]
  const dryRun = args.includes('--dry-run')

  const wallet = walletArg ? walletArg.trim() : DEFAULT_WALLET
  const limit = limitArg ? Math.max(1, parseInt(limitArg, 10)) : 5

  if (!wallet) {
    console.error('Wallet address is required.')
    process.exit(1)
  }

  console.log(`🔍 Fetching up to ${limit} trades for ${wallet} ...`)
  const trades = await fetchTrades(wallet, limit)
  console.log(`📦 Received ${trades.length} trades from API`)

  const rows = trades.slice(0, limit).map((t) => formatTrade(t, wallet))
  if (rows.length === 0) {
    console.log('No trades to insert.')
    return
  }

  console.log('🧾 Sample row:', {
    trade_id: rows[0].trade_id,
    market_title: rows[0].market_title?.slice(0, 70),
    side: rows[0].side,
    outcome: rows[0].outcome,
    price: rows[0].price,
    size: rows[0].size,
    trade_timestamp: rows[0].trade_timestamp
  })

  if (dryRun) {
    console.log('Dry run complete. No data written to Supabase.')
    return
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  console.log(`📝 Upserting ${rows.length} rows into trades_public ...`)
  const { error, count } = await supabase
    .from('trades_public')
    .upsert(rows, { onConflict: 'trade_id', ignoreDuplicates: false, count: 'exact' })

  if (error) {
    if (error.code === '42P01') {
      console.error('Table "trades_public" does not exist. Run the 020_create_spl_trade_log, 025_finalize_public_spl, and 026_rename_spl_to_trades_public migrations first.')
    }
    throw error
  }

  console.log(`✅ Upsert complete. Rows affected: ${count ?? 'unknown (count not returned)'}`)
}

main().catch((err) => {
  console.error('❌ Import failed:', err.message || err)
  process.exit(1)
})
