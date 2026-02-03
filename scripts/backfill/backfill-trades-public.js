'use strict'

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
const { ClobClient } = require('@polymarket/clob-client')

const DEFAULT_PROGRESS_FILE = '.backfill-trades-public.json'
const BAD_WALLETS_FILE = 'bad_wallets.json'
const PROGRESS_VERSION = 2
const DATA_PAGE_SIZE = 100
const DATA_MAX_OFFSET = 1000
const CLOB_PAGE_SIZE = 200
const RATE_TOKENS_PER_SEC = 20
const RATE_BURST = 40
const FETCH_MAX_RETRIES = 5
const FETCH_BASE_DELAY = 400
const FETCH_MAX_DELAY = 8000
const DEFAULT_WALLET_MAX_SECONDS = 300
const QUARANTINE_CONSECUTIVE = 6
const QUARANTINE_WINDOW_MINUTES = 5
const QUARANTINE_ERROR_THRESHOLD = 20

function parseArg(name) {
  const prefix = `--${name}=`
  const match = process.argv.find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : null
}

function parseFlag(name) {
  return process.argv.includes(`--${name}`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function coerceInt(value, fallback) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

class TokenBucket {
  constructor({ tokensPerInterval, intervalMs, maxTokens }) {
    this.tokens = maxTokens
    this.maxTokens = maxTokens
    this.refillRate = tokensPerInterval / intervalMs
    this.lastRefill = Date.now()
  }

  refill() {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    if (elapsed <= 0) return
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate)
    this.lastRefill = now
  }

  async removeTokens(requested = 1) {
    while (true) {
      this.refill()
      if (this.tokens >= requested) {
        this.tokens -= requested
        return
      }
      const deficit = requested - this.tokens
      const waitMs = Math.max(50, Math.ceil(deficit / this.refillRate))
      await sleep(waitMs)
    }
  }
}

function hasClobCredentials() {
  return !!(
    process.env.POLYMARKET_CLOB_API_KEY &&
    process.env.POLYMARKET_CLOB_API_SECRET &&
    process.env.POLYMARKET_CLOB_API_PASSPHRASE &&
    process.env.POLYMARKET_CLOB_API_ADDRESS
  )
}

function createClobClient() {
  const key = process.env.POLYMARKET_CLOB_API_KEY
  const secret = process.env.POLYMARKET_CLOB_API_SECRET
  const passphrase = process.env.POLYMARKET_CLOB_API_PASSPHRASE
  const address = process.env.POLYMARKET_CLOB_API_ADDRESS
  const baseUrl =
    process.env.NEXT_PUBLIC_POLYMARKET_CLOB_BASE_URL ||
    process.env.POLYMARKET_CLOB_BASE_URL ||
    'https://clob.polymarket.com'

  if (!key || !secret || !passphrase || !address) {
    throw new Error(
      'CLOB mode requires POLYMARKET_CLOB_API_KEY/SECRET/PASSPHRASE/ADDRESS to be configured'
    )
  }

  const signer = {
    getAddress: async () => address,
  }

  return new ClobClient(baseUrl, 137, signer, {
    key,
    secret,
    passphrase,
  })
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath)
  if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (err) {
    console.error(`Failed to parse ${filePath}:`, err.message)
    return fallback
  }
}

function saveJson(filePath, payload) {
  ensureDir(filePath)
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2))
}

function loadBadWallets(filePath) {
  const data = loadJson(filePath, null)
  if (data && data.wallets) return data
  return { version: 1, wallets: {} }
}

function loadProgress(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      version: PROGRESS_VERSION,
      walletList: [],
      currentIndex: 0,
      walletStates: {},
      stats: { totalInserted: 0 },
      lastUpdate: null,
    }
  }
  const raw = loadJson(filePath, null)
  if (!raw) return loadProgress(filePath)
  if (raw.version === PROGRESS_VERSION) return raw
  if (raw.index !== undefined) {
    return {
      version: PROGRESS_VERSION,
      walletList: raw.walletList || [],
      currentIndex: raw.index || 0,
      walletStates: {},
      stats: { totalInserted: 0 },
      lastUpdate: null,
    }
  }
  return {
    version: PROGRESS_VERSION,
    walletList: raw.walletList || [],
    currentIndex: raw.currentIndex || raw.cursor || 0,
    walletStates: raw.walletStates || {},
    stats: raw.stats || { totalInserted: 0 },
    lastUpdate: raw.lastUpdate || null,
  }
}

function buildWalletList(progress, derived, offset, limit) {
  const combined = Array.from(new Set([...(progress.walletList || []), ...derived]))
  const start = offset >= 0 ? offset : 0
  const end = limit > 0 ? Math.min(start + limit, combined.length) : combined.length
  const slice = combined.slice(start, end)
  progress.walletList = slice
  if (progress.currentIndex < 0) progress.currentIndex = 0
  if (progress.currentIndex > slice.length) progress.currentIndex = slice.length
  return slice
}

function walletState(progress, wallet) {
  if (!progress.walletStates[wallet]) {
    progress.walletStates[wallet] = {}
  }
  return progress.walletStates[wallet]
}

function parseTimestamp(value) {
  if (!value) return null
  const num = Number(value)
  if (!Number.isFinite(num)) return new Date(value)
  if (num > 1e12) return new Date(num)
  if (num > 1e9) return new Date(num * 1000)
  return new Date(num)
}

function mapClobTrade(trade, wallet, traderId) {
  const tradeTs = parseTimestamp(trade.match_time || trade.last_update)
  return {
    trade_id: trade.transaction_hash || trade.id,
    trader_wallet: wallet,
    trader_id: traderId,
    transaction_hash: trade.transaction_hash || null,
    status: trade.status || trade.state || null,
    asset: trade.asset_id || trade.market || null,
    condition_id: trade.asset_id || trade.market || null,
    market_slug: trade.market || null,
    event_slug: null,
    market_title: null,
    side: trade.side || null,
    outcome: trade.outcome || null,
    outcome_index: null,
    size: trade.size !== undefined ? Number(trade.size) : null,
    price: trade.price !== undefined ? Number(trade.price) : null,
    trade_timestamp: tradeTs ? tradeTs.toISOString() : null,
    trade_time: tradeTs ? tradeTs.toISOString() : null,
    source_updated_at: trade.last_update
      ? new Date(trade.last_update).toISOString()
      : trade.match_time
      ? new Date(trade.match_time).toISOString()
      : tradeTs
      ? tradeTs.toISOString()
      : null,
    raw: trade,
  }
}

function mapDataTrade(trade, wallet, traderId) {
  const tradeTs = parseTimestamp(trade.timestamp)
  return {
    trade_id:
      trade.transactionHash ||
      trade.id ||
      `${wallet}-${trade.conditionId || trade.asset || 'market'}-${trade.timestamp}`,
    trader_wallet: wallet,
    trader_id: traderId,
    transaction_hash: trade.transactionHash || null,
    status: trade.status || null,
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
    trade_timestamp: tradeTs ? tradeTs.toISOString() : null,
    trade_time: tradeTs ? tradeTs.toISOString() : null,
    source_updated_at: trade.updatedAt
      ? new Date(trade.updatedAt).toISOString()
      : tradeTs
      ? tradeTs.toISOString()
      : null,
    raw: trade,
  }
}

async function fetchRetries(rateLimiter, fetchFn) {
  let attempt = 0
  while (true) {
    try {
      await rateLimiter.removeTokens(1)
      return await fetchFn()
    } catch (err) {
      attempt += 1
      const status = err?.status || err?.response?.status
      if (attempt >= FETCH_MAX_RETRIES || ![429, 500, 502, 503, 504].includes(status)) {
        throw err
      }
      const backoff = Math.min(FETCH_MAX_DELAY, FETCH_BASE_DELAY * Math.pow(2, attempt - 1))
      const jitter = Math.random() * 200
      await sleep(backoff + jitter)
    }
  }
}

async function fetchTradesFromDataApi(wallet, offset, rateLimiter) {
  const url = new URL('https://data-api.polymarket.com/trades')
  url.searchParams.set('user', wallet)
  url.searchParams.set('limit', String(DATA_PAGE_SIZE))
  url.searchParams.set('offset', String(offset))
  return fetchRetries(rateLimiter, async () => {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Polycopy Trades Public Backfill' },
    })
    if (!res.ok) {
      const text = await res.text()
      const error = new Error(`Trades API returned ${res.status}: ${text}`)
      error.status = res.status
      throw error
    }
    const payload = await res.json()
    if (!Array.isArray(payload)) throw new Error('Unexpected trades payload (not an array)')
    return payload
  })
}

async function fetchTradesFromClob(wallet, beforeTs, rateLimiter, clobClient) {
  return fetchRetries(rateLimiter, async () => {
    const params = {
      maker_address: wallet,
      limit: CLOB_PAGE_SIZE,
    }
    if (beforeTs) {
      params.before = Math.floor(beforeTs / 1000).toString()
    }
    const resp = await clobClient.getTradesPaginated(params)
    return resp.trades || []
  })
}

async function upsertTrades(supabase, rows) {
  if (rows.length === 0) return 0
  const payload = rows.map((row) => ({
    ...row,
    trader_wallet: row.trader_wallet?.toLowerCase?.() || null,
  }))
  const { error } = await supabase.rpc('upsert_trades_public', { trades: payload })
  if (error) {
    throw new Error(`RPC upsert failed: ${error.message}`)
  }
  return rows.length
}

async function updateWalletBackfillRecord(supabase, wallet, mode, state) {
  try {
    await supabase.from('wallet_backfills').upsert(
      {
        wallet,
        mode,
        status: state.status || 'pending',
        cursor_before_ts: state.beforeTs ? new Date(state.beforeTs).toISOString() : null,
        cursor_offset: state.offset || null,
        last_trade_time: state.lastTradeTime ? new Date(state.lastTradeTime).toISOString() : null,
        max_offset_reached: state.maxOffsetReached || null,
        partial_reason: state.partialReason || null,
        last_run_at: new Date().toISOString(),
        error_count: state.errorCount || 0,
        inserted_trades: state.inserted || 0,
      },
      { onConflict: 'wallet' }
    )
  } catch (err) {
    console.error(`Failed to update wallet_backfills for ${wallet}:`, err.message || err)
  }
}

async function processWallet({
  wallet,
  traderId,
  supabase,
  rateLimiter,
  mode,
  progress,
  progressFile,
  badWallets,
  skipBad,
  clobClient,
  walletMaxSeconds,
  maxSeconds,
}) {
  const state = walletState(progress, wallet)
  if (skipBad && badWallets.wallets[wallet]) {
    state.status = 'quarantined'
    await updateWalletBackfillRecord(supabase, wallet, mode, state)
    console.log(`Skipping ${wallet} (quarantined)`)
    return true
  }

  const startTime = Date.now()
  const walletStart = Date.now()
  let page = 0
  let consecutiveErrors = state.consecutiveErrors || 0

  while (true) {
    if (maxSeconds > 0 && Date.now() - startTime >= maxSeconds * 1000) {
      console.log(`Wallet ${wallet} reached global max seconds (${maxSeconds}s), saving progress`)
      await updateWalletBackfillRecord(supabase, wallet, mode, state)
      return false
    }
    if (walletMaxSeconds > 0 && Date.now() - walletStart >= walletMaxSeconds * 1000) {
      console.log(`Wallet ${wallet} hit wallet max seconds (${walletMaxSeconds}s)` )
      await updateWalletBackfillRecord(supabase, wallet, mode, state)
      return false
    }

    try {
      const trades =
        mode === 'clob'
          ? await fetchTradesFromClob(wallet, state.beforeTs, rateLimiter, clobClient)
          : await fetchTradesFromDataApi(wallet, state.offset || 0, rateLimiter)

      if (trades.length === 0) {
        state.status = mode === 'clob' ? 'completed_full_history' : 'completed_recent'
        await updateWalletBackfillRecord(supabase, wallet, mode, state)
        console.log(`✅ ${wallet}: ${state.status}`)
        state.consecutiveErrors = 0
        return true
      }

      const mapped = trades.map((trade) =>
        mode === 'clob' ? mapClobTrade(trade, wallet, traderId) : mapDataTrade(trade, wallet, traderId)
      )

      const inserted = await upsertTrades(supabase, mapped)
      state.inserted = (state.inserted || 0) + inserted
      progress.stats.totalInserted = (progress.stats.totalInserted || 0) + inserted

      const timestamps = trades
        .map((trade) => {
          const t = mode === 'clob' ? (trade.match_time || trade.last_update) : trade.timestamp
          return parseTimestamp(t)?.getTime()
        })
        .filter(Boolean)

      if (timestamps.length) {
        const maxTs = Math.max(...timestamps)
        const minTs = Math.min(...timestamps)
        state.lastTradeTime = Math.max(state.lastTradeTime || 0, maxTs)
        if (mode === 'clob') {
          state.beforeTs = Math.max(0, minTs - 1000)
        }
      }

      if (mode === 'data') {
        state.offset = (state.offset || 0) + DATA_PAGE_SIZE
        if (state.offset >= DATA_MAX_OFFSET) {
          state.status = 'partial_offset_cap'
          state.partialReason = 'data_offset_cap'
          state.maxOffsetReached = DATA_MAX_OFFSET
          await updateWalletBackfillRecord(supabase, wallet, mode, state)
          console.log(`⚠️ ${wallet} hit max offset cap (${DATA_MAX_OFFSET}), marking partial`)
          return true
        }
      }

      if (mode === 'clob') {
        state.status = 'running_clob'
      } else {
        state.status = 'running_data'
      }

      page += 1
      console.log(
        `📦 ${wallet} page ${page} inserted ${inserted} trades (mode=${mode}, cursor=${mode === 'clob' ? state.beforeTs : state.offset})`
      )

      await updateWalletBackfillRecord(supabase, wallet, mode, state)
      progress.lastUpdate = new Date().toISOString()
      saveJson(progressFile, progress)

      state.consecutiveErrors = 0
      consecutiveErrors = 0
    } catch (err) {
      const message = err.message || err
      console.error(`❌ ${wallet}:`, message)
      consecutiveErrors += 1
      state.consecutiveErrors = consecutiveErrors
      state.errorHistory = (state.errorHistory || []).filter(
        (ts) => Date.now() - ts < QUARANTINE_WINDOW_MINUTES * 60 * 1000
      )
      state.errorHistory.push(Date.now())
      state.errorCount = (state.errorCount || 0) + 1

      if (consecutiveErrors >= QUARANTINE_CONSECUTIVE || state.errorHistory.length >= QUARANTINE_ERROR_THRESHOLD) {
        badWallets.wallets[wallet] = {
          quarantinedAt: new Date().toISOString(),
          reason: 'repeated failures',
          detail: message,
        }
        saveJson(BAD_WALLETS_FILE, badWallets)
        state.status = 'quarantined'
        await updateWalletBackfillRecord(supabase, wallet, mode, state)
        return true
      }

      state.status = 'error'
      state.partialReason = message
      await updateWalletBackfillRecord(supabase, wallet, mode, state)
      saveJson(progressFile, progress)
      await sleep(1000 + Math.random() * 1000)
    }
  }
}

async function printStatus({ supabaseUrl, serviceRoleKey, progressFile }) {
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const progress = loadProgress(progressFile)
  const badWallets = loadBadWallets(BAD_WALLETS_FILE)
  const { data: statuses, error } = await supabase.from('wallet_backfills').select('*')
  if (error) {
    console.error('Failed to load wallet_backfills:', error.message)
    return
  }
  console.log('Wallet backfill status')
  console.log('-----------------------')
  console.log(`Total wallets tracked: ${progress.walletList.length}`)
  console.log(`Wallets completed (progress): ${progress.currentIndex}/${progress.walletList.length}`)
  console.log(`Quarantined wallets: ${Object.keys(badWallets.wallets).length}`)
  console.log('Recent statuses:')
  statuses
    .slice(0, 10)
    .forEach((row) =>
      console.log(
        `${row.wallet}: mode=${row.mode} status=${row.status} cursor=${row.cursor_before_ts || row.cursor_offset} partial=${row.partial_reason || 'none'}`
      )
    )
}

async function main() {
  const progressFile = parseArg('progress-file') || DEFAULT_PROGRESS_FILE
  const maxSeconds = coerceInt(parseArg('max-seconds'), 0)
  const walletArg = parseArg('wallet')
  const limit = coerceInt(parseArg('limit'), 0)
  const offset = coerceInt(parseArg('offset'), 0)
  const resume = parseFlag('resume')
  const noResume = parseFlag('no-resume')
  const auto = parseFlag('auto')
  const statusOnly = parseFlag('status')
  const modeArg = (parseArg('mode') || '').toLowerCase()
  const walletMaxSeconds = coerceInt(parseArg('wallet-max-seconds'), DEFAULT_WALLET_MAX_SECONDS)
  const noSkipBad = parseFlag('no-skip-bad')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  if (statusOnly) {
    await printStatus({ supabaseUrl, serviceRoleKey: supabaseKey, progressFile })
    return
  }

  const badWallets = loadBadWallets(BAD_WALLETS_FILE)
  const progress = loadProgress(progressFile)

  let mode = 'data'
  if (modeArg === 'clob') {
    if (!hasClobCredentials()) {
      throw new Error('CLOB mode requires credentials (set POLYMARKET_CLOB_API_KEY/SECRET/PASSPHRASE/ADDRESS)')
    }
    mode = 'clob'
  } else if (modeArg === 'data') {
    mode = 'data'
  } else if (hasClobCredentials()) {
    mode = 'clob'
  }

  if (!resume && !noResume && fs.existsSync(progressFile)) {
    // respect existing progress file
  } else if (walletArg) {
    progress.walletList = []
    progress.currentIndex = 0
    progress.walletStates = {}
  } else {
    progress.currentIndex = 0
    progress.walletStates = {}
    progress.walletList = []
    progress.stats = { totalInserted: 0 }
  }

  let wallets = []
  if (walletArg) {
    wallets = [walletArg.toLowerCase()].filter(Boolean)
  } else {
    const [followsResult, profilesResult] = await Promise.all([
      supabase.from('follows').select('trader_wallet'),
      supabase.from('profiles').select('wallet_address'),
    ])
    if (followsResult.error) throw new Error(`Failed to load follows: ${followsResult.error.message}`)
    if (profilesResult.error) throw new Error(`Failed to load profiles: ${profilesResult.error.message}`)
    const followWallets = (followsResult.data || [])
      .map((row) => row.trader_wallet?.toLowerCase())
      .filter(Boolean)
    const profileWallets = (profilesResult.data || [])
      .map((row) => row.wallet_address?.toLowerCase())
      .filter(Boolean)
    wallets = Array.from(new Set([...followWallets, ...profileWallets]))
  }

  const effectiveLimit = limit > 0 ? limit : wallets.length
  const list = buildWalletList(progress, wallets, offset, effectiveLimit)

  const rateLimiter = new TokenBucket({
    tokensPerInterval: RATE_TOKENS_PER_SEC,
    intervalMs: 1000,
    maxTokens: RATE_BURST,
  })

  const clobClient = mode === 'clob' ? createClobClient() : null
  const skipBad = walletArg ? false : !noSkipBad

  async function runBatch() {
    const startTime = Date.now()
    for (let i = progress.currentIndex; i < list.length; i += 1) {
      const wallet = list[i]
      const { data: trader, error: traderError } = await supabase
        .from('traders')
        .select('id')
        .eq('wallet_address', wallet)
        .maybeSingle()
      if (traderError) {
        throw new Error(`Failed to load trader ${wallet}: ${traderError.message}`)
      }
      const done = await processWallet({
        wallet,
        traderId: trader?.id || null,
        supabase,
        rateLimiter,
        mode,
        progress,
        progressFile,
        badWallets,
        skipBad,
        clobClient,
        walletMaxSeconds,
        maxSeconds,
      })
      if (!done) return false
      progress.currentIndex = i + 1
      progress.lastUpdate = new Date().toISOString()
      saveJson(progressFile, progress)
      if (maxSeconds > 0 && Date.now() - startTime >= maxSeconds * 1000) {
        console.log(`Max run duration (${maxSeconds}s) reached.`)
        return false
      }
    }
    if (fs.existsSync(progressFile)) fs.unlinkSync(progressFile)
    return true
  }

  if (!auto) {
    await runBatch()
    return
  }

  while (true) {
    const done = await runBatch()
    if (done || !fs.existsSync(progressFile)) break
    await sleep(2000)
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err.message || err)
  process.exit(1)
})
