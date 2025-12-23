'use strict'

/**
 * Backfill public Polymarket trades into trades_public using followed traders.
 *
 * Usage:
 *   node scripts/backfill-trades-public.js [--limit=100] [--offset=0] [--wallet=0x...] [--trade-limit=0] [--sleep=200]
 *
 * Notes:
 * - Uses follows.trader_wallet as source of trader list.
 * - If --wallet is provided, only that wallet is processed.
 * - trade-limit=0 (default) means no limit param is passed (API returns all trades).
 */

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const { createClient } = require('@supabase/supabase-js')

const envPath = path.resolve(process.cwd(), '.env.local')
dotenv.config(fs.existsSync(envPath) ? { path: envPath } : {})

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

const DEFAULT_SLEEP_MS = 200
const DEFAULT_PAGE_SIZE = 100
const DEFAULT_PAGE_SLEEP_MS = 150
const DEFAULT_PROGRESS_FILE = '.backfill-trades-public.json'
const CHUNK_SIZE = 500

function parseArg(name) {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  if (!found) return null
  return found.slice(prefix.length)
}

function parseFlag(name) {
  return process.argv.includes(`--${name}`)
}

function toTimestamp(dateLike) {
  if (dateLike === null || dateLike === undefined) return null
  let ts = Number(dateLike)
  if (!Number.isFinite(ts)) return null
  if (ts < 10000000000) {
    ts = ts * 1000
  }
  return new Date(ts).toISOString()
}

function deriveTradeId(trade, fallback) {
  if (trade.transactionHash) return trade.transactionHash
  const parts = [
    fallback,
    trade.asset || 'asset',
    trade.conditionId || 'condition',
    trade.timestamp || Date.now(),
  ]
  return parts.join('-')
}

async function sleep(ms) {
  if (!ms) return
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function chunkArray(items, size) {
  const chunks = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function fetchTradesPage(wallet, limit, offset) {
  const url = new URL('https://data-api.polymarket.com/trades')
  url.searchParams.set('user', wallet)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('offset', String(offset))

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'Polycopy Trades Public Backfill' },
  })

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

async function streamTrades(wallet, tradeLimit, pageSize, pageSleepMs, startOffset, onPage, shouldStop) {
  let offset = startOffset || 0
  const maxTrades = tradeLimit && tradeLimit > 0 ? tradeLimit : null
  let total = 0

  while (true) {
    if (shouldStop()) {
      return { offset, done: false, total }
    }

    const page = await fetchTradesPage(wallet, pageSize, offset)
    if (page.length === 0) {
      return { offset, done: true, total }
    }

    await onPage(page, offset)
    total += page.length
    offset += pageSize

    if (page.length < pageSize) {
      return { offset, done: true, total }
    }
    if (maxTrades && total >= maxTrades) {
      return { offset, done: true, total }
    }

    await sleep(pageSleepMs)
  }
}

async function main() {
  const limitArg = parseInt(parseArg('limit') || '0', 10)
  const offsetArg = parseInt(parseArg('offset') || '0', 10)
  const tradeLimit = parseInt(parseArg('trade-limit') || '0', 10)
  const pageSize = parseInt(parseArg('page-size') || String(DEFAULT_PAGE_SIZE), 10)
  const pageSleepMs = parseInt(parseArg('page-sleep') || String(DEFAULT_PAGE_SLEEP_MS), 10)
  const sleepMs = parseInt(parseArg('sleep') || String(DEFAULT_SLEEP_MS), 10)
  const maxSeconds = parseInt(parseArg('max-seconds') || '0', 10)
  const resume = parseFlag('resume')
  const auto = parseFlag('auto')
  const autoSleepMs = parseInt(parseArg('auto-sleep') || '2000', 10)
  const progressFile = parseArg('progress-file') || DEFAULT_PROGRESS_FILE
  const walletArg = parseArg('wallet')

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let wallets = []
  if (walletArg) {
    wallets = [walletArg.toLowerCase()]
  } else {
    const [followsResult, profilesResult] = await Promise.all([
      supabase.from('follows').select('trader_wallet'),
      supabase.from('profiles').select('wallet_address'),
    ])

    if (followsResult.error) {
      throw new Error(`Failed to load follows: ${followsResult.error.message}`)
    }
    if (profilesResult.error) {
      throw new Error(`Failed to load profiles: ${profilesResult.error.message}`)
    }

    const followWallets = (followsResult.data || [])
      .map((row) => row.trader_wallet?.toLowerCase())
      .filter(Boolean)
    const userWallets = (profilesResult.data || [])
      .map((row) => row.wallet_address?.toLowerCase())
      .filter(Boolean)

    const unique = new Set([...followWallets, ...userWallets])
    wallets = Array.from(unique)
  }

  if (wallets.length === 0) {
    console.log('No trader wallets found to backfill.')
    return
  }

  const { data: traderRows, error: traderError } = await supabase
    .from('traders')
    .select('id, wallet_address')
    .in('wallet_address', wallets)

  if (traderError) {
    throw new Error(`Failed to load traders: ${traderError.message}`)
  }

  const traderIdByWallet = new Map(
    (traderRows || []).map((row) => [row.wallet_address?.toLowerCase(), row.id])
  )

  const offset = Number.isFinite(offsetArg) && offsetArg > 0 ? offsetArg : 0
  const limit = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : wallets.length
  const slice = wallets.slice(offset, offset + limit)

  async function runOnce() {
    let startIndex = 0
    let startTradeOffset = 0
    if (resume && fs.existsSync(progressFile)) {
      try {
        const saved = JSON.parse(fs.readFileSync(progressFile, 'utf8'))
        if (Number.isFinite(saved.index)) {
          startIndex = Math.max(0, saved.index)
        }
        if (Number.isFinite(saved.tradeOffset)) {
          startTradeOffset = Math.max(0, saved.tradeOffset)
        }
      } catch {
        // ignore malformed progress file
      }
    }

    const startedAt = Date.now()
    const shouldStop = () =>
      maxSeconds > 0 && (Date.now() - startedAt) / 1000 >= maxSeconds

    console.log(`Backfilling ${slice.length} trader wallets (offset ${offset}, startIndex ${startIndex})`)

    let totalRows = 0
    let totalWallets = 0
    for (let i = startIndex; i < slice.length; i++) {
      const wallet = slice[i]
      if (shouldStop()) {
        fs.writeFileSync(progressFile, JSON.stringify({ index: i, tradeOffset: 0 }, null, 2))
        console.log(`Time limit reached, saved progress at index ${i} to ${progressFile}`)
        return false
      }

      try {
        let traderId = traderIdByWallet.get(wallet) || null

        if (!traderId) {
          const { data: created, error: createError } = await supabase
            .from('traders')
            .upsert({ wallet_address: wallet, is_active: true }, { onConflict: 'wallet_address' })
            .select('id')
            .single()
          if (createError) {
            throw new Error(`Failed to ensure trader row for ${wallet}: ${createError.message}`)
          }
          traderId = created?.id || null
          traderIdByWallet.set(wallet, traderId)
        }
        const initialOffset = i === startIndex ? startTradeOffset : 0
        let inserted = 0

        const result = await streamTrades(
          wallet,
          tradeLimit,
          pageSize,
          pageSleepMs,
          initialOffset,
          async (page, pageOffset) => {
            const rows = page.map((trade) => ({
              trade_id: deriveTradeId(trade, wallet),
              trader_wallet: wallet,
              trader_id: traderId,
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
              raw: trade,
            }))

            const chunks = chunkArray(rows, CHUNK_SIZE)
            for (const chunk of chunks) {
              const { error, count } = await supabase
                .from('trades_public')
                .upsert(chunk, { onConflict: 'trade_id', ignoreDuplicates: false, count: 'exact' })
              if (error) {
                throw new Error(`Upsert failed for ${wallet}: ${error.message}`)
              }
              inserted += count ?? chunk.length
            }

            fs.writeFileSync(progressFile, JSON.stringify({ index: i, tradeOffset: pageOffset + pageSize }, null, 2))
          },
          shouldStop
        )

        totalRows += inserted
        if (result.done) {
          totalWallets += 1
          console.log(`✅ ${wallet}: ${inserted} trades upserted`)
          fs.writeFileSync(progressFile, JSON.stringify({ index: i + 1, tradeOffset: 0 }, null, 2))
        } else {
          console.log(`⏸️ ${wallet}: saved progress at trade offset ${result.offset}`)
          return false
        }
        await sleep(sleepMs)
      } catch (err) {
        console.error(`❌ ${wallet}:`, err.message || err)
      }
    }

    console.log(`Done. Wallets processed: ${totalWallets}. Rows upserted: ${totalRows}.`)
    if (fs.existsSync(progressFile)) {
      fs.unlinkSync(progressFile)
    }
    return true
  }

  if (!auto) {
    await runOnce()
    return
  }

  while (true) {
    const done = await runOnce()
    if (done || !fs.existsSync(progressFile)) {
      break
    }
    await sleep(autoSleepMs)
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err.message || err)
  process.exit(1)
})
