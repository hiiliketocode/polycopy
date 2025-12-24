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
const FETCH_BASE_DELAY = 500
const FETCH_MAX_DELAY = 10000
const MAX_WALLET_SECONDS = 300
const QUARANTINE_CONSECUTIVE = 8
const QUARANTINE_WINDOW_MINUTES = 5
const QUARANTINE_ERRORS_THRESHOLD = 20

function parseArg(name) {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  if (!found) return null
  return found.slice(prefix.length)
}

function parseFlag(name) {
  return process.argv.includes(`--${name}`)
}

function coerceInt(value, fallback) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
      'To use CLOB mode you must set POLYMARKET_CLOB_API_KEY/SECRET/PASSPHRASE/ADDRESS'
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

function loadJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    console.error(`Failed to parse ${filePath}:`, err.message)
    return fallback
  }
}

function ensureFileDirectory(filePath) {
  const dir = path.dirname(filePath)
  if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function loadBadWallets(filePath) {
  const payload = loadJsonFile(filePath, null)
  if (payload && payload.wallets) return payload
  return { version: 1, wallets: {} }
}

function saveBadWallets(filePath, payload) {
  ensureFileDirectory(filePath)
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2))
}

function markWalletQuarantined(badWallets, wallet, reason, detail) {
  badWallets.wallets[wallet] = {
    quarantinedAt: new Date().toISOString(),
    reason,
    detail,
  }
}

function walletIsQuarantined(badWallets, wallet) {
  return Boolean(badWallets.wallets[wallet])
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
  const raw = loadJsonFile(filePath, null)
  if (!raw) {
    return loadProgress(filePath)
  }
  if (raw.version === PROGRESS_VERSION) {
    return raw
  }
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
    currentIndex: raw.currentIndex || 0,
    walletStates: raw.walletStates || {},
    stats: raw.stats || { totalInserted: 0 },
    lastUpdate: raw.lastUpdate || null,
  }
}

function saveProgress(filePath, progress) {
  ensureFileDirectory(filePath)
  fs.writeFileSync(filePath, JSON.stringify(progress, null, 2))
}

function buildWalletList(progress, derivedWallets, offset, limit) {
  const merged = Array.from(new Set([...(progress.walletList || []), ...derivedWallets]))
  const start = offset >= 0 ? offset : 0
  const end = limit > 0 ? Math.min(start + limit, merged.length) : merged.length
  const slice = merged.slice(start, end)
  progress.walletList = slice
  if (progress.currentIndex < 0) {
    progress.currentIndex = 0
  }
  if (progress.currentIndex > slice.length) {
    progress.currentIndex = slice.length
  }
  return slice
}

function clampDataOffset(offset) {
  if (offset > DATA_MAX_OFFSET) {
    return DATA_MAX_OFFSET
  }
  return offset
}

function normalizeWallet(wallet) {
  return wallet?.toLowerCase().trim()
}

function parseTimestamp(msOrSeconds) {
  if (!msOrSeconds) return null
  const num = Number(msOrSeconds)
  if (!Number.isFinite(num)) return null
  if (num > 1000000000000) {
    return new Date(num)
  }
  if (num > 1000000000) {
    return new Date(num * 1000)
  }
  return new Date(num)
}

function mapClobTrade(trade, wallet, traderId) {
  const tradeTimestamp = parseTimestamp(trade.match_time || trade.last_update)
  return {
    trade_id: trade.transaction_hash || trade.id,
    trader_wallet: wallet,
    trader_id: traderId,
    transaction_hash: trade.transaction_hash || null,
    asset: trade.asset_id || trade.market || null,
    condition_id: trade.asset_id || trade.market || null,
    market_slug: trade.market || null,
    event_slug: null,
    side: trade.side || null,
    outcome: trade.outcome || null,
    outcome_index: null,
    size: trade.size !== undefined ? Number(trade.size) : null,
    price: trade.price !== undefined ? Number(trade.price) : null,
    trade_timestamp: tradeTimestamp ? tradeTimestamp.toISOString() : null,
    raw: trade,
  }
}

function mapDataTrade(trade, wallet, traderId) {
  return {
    trade_id: trade.transactionHash || trade.id || trade.tradeId || `${wallet}-${trade.timestamp}`,
    trader_wallet: wallet,
    trader_id: traderId,
    transaction_hash: trade.transactionHash || null,
    asset: trade.asset || null,
    condition_id: trade.conditionId || null,
    market_slug: trade.slug || null,
    event_slug: trade.eventSlug || null,
    side: trade.side || null,
    outcome: trade.outcome || null,
    outcome_index: Number.isFinite(trade.outcomeIndex) ? trade.outcomeIndex : null,
    size: trade.size !== undefined ? Number(trade.size) : null,
    price: trade.price !== undefined ? Number(trade.price) : null,
    trade_timestamp: parseTimestamp(trade.timestamp)?.toISOString() || null,
    raw: trade,
  }
}

async function fetchPageWithRateLimit(rateLimiter, fn) {
  await rateLimiter.removeTokens(1)
  let attempt = 0
  while (true) {
    try {
      return await fn()
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

async function fetchTradesFromDataApi(wallet, options) {
  const { rateLimiter, limit, offset } = options
  const url = new URL('https://data-api.polymarket.com/trades')
  url.searchParams.set('user', wallet)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('offset', String(offset))
  return fetchPageWithRateLimit(rateLimiter, async () => {
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
    if (!Array.isArray(payload)) {
      throw new Error('Unexpected trades payload (not an array)')
    }
    return payload
  })
}

async function fetchTradesFromClob(wallet, state, options) {
  const { rateLimiter, clobClient } = options
  return fetchPageWithRateLimit(rateLimiter, async () => {
    const params = { maker_address: wallet, limit: CLOB_PAGE_SIZE }
    if (state.beforeTs) {
      params.before = Math.floor(state.beforeTs / 1000).toString()
    }
    const response = await clobClient.getTradesPaginated(params)
    return response.trades
  })
}

async function upsertRows(supabase, rows) {
  if (rows.length === 0) return 0
  const chunks = []
  for (let i = 0; i < rows.length; i += 500) {
    chunks.push(rows.slice(i, i + 500))
  }
  let total = 0
  for (const chunk of chunks) {
    const { error, count } = await supabase
      .from('trades_public')
      .upsert(chunk, { onConflict: 'trade_id', ignoreDuplicates: false, count: 'exact' })
    if (error) {
      throw new Error(`Upsert failed: ${error.message}`)
    }
    total += count ?? chunk.length
  }
  return total
}

function updateWalletState(progress, wallet, update) {
  progress.walletStates[wallet] = {
    ...(progress.walletStates[wallet] || {}),
    ...update,
  }
}

function walletState(progress, wallet) {
  return progress.walletStates[wallet] || {}
}

async function processWallet({
  wallet,
  traderId,
  supabase,
  rateLimiter,
  mode,
  progress,
  progressFile,
  options,
  badWallets,
  skipBad,
}) {
  const state = walletState(progress, wallet)
  if (skipBad && walletIsQuarantined(badWallets, wallet)) {
    console.log(`Skipping quarantined wallet ${wallet}`)
    return true
  }

  const start = Date.now()
  let page = 0
  let consecutiveErrors = state.consecutiveErrors || 0

  while (true) {
    if (options.walletMaxSeconds > 0 && Date.now() - start > options.walletMaxSeconds * 1000) {
      console.log(`Wallet ${wallet} hit max seconds (${options.walletMaxSeconds}s), saving progress`) 
      updateWalletState(progress, wallet, state)
      saveProgress(progressFile, progress)
      return false
    }

    try {
      let trades
      if (mode === 'clob') {
        trades = await fetchTradesFromClob(wallet, state, { rateLimiter, clobClient: options.clobClient })
      } else {
        trades = await fetchTradesFromDataApi(wallet, { rateLimiter, limit: DATA_PAGE_SIZE, offset: clampDataOffset(state.offset || 0) })
      }

      consecutiveErrors = 0
      state.consecutiveErrors = 0

      if (trades.length === 0) {
        console.log(`✅ ${wallet}: no more trades to fetch`)
        updateWalletState(progress, wallet, {
          ...state,
          completed: true,
        })
        return true
      }

      const mapped = trades.map((trade) => (mode === 'clob' ? mapClobTrade(trade, wallet, traderId) : mapDataTrade(trade, wallet, traderId)))
      const inserted = await upsertRows(supabase, mapped)
      state.inserted = (state.inserted || 0) + inserted
      progress.stats.totalInserted = (progress.stats.totalInserted || 0) + inserted
      state.lastInsertAt = new Date().toISOString()
      if (mode === 'clob') {
        const earliest = trades
          .map((trade) => parseTimestamp(trade.match_time || trade.last_update))
          .filter(Boolean)
          .map((date) => date.getTime())
          .sort((a, b) => a - b)[0]
        state.beforeTs = earliest ? Math.max(0, earliest - 1) : state.beforeTs
      } else {
        state.offset = (state.offset || 0) + DATA_PAGE_SIZE
        if (state.offset > DATA_MAX_OFFSET) {
          console.log(`Reached data API offset cap for ${wallet}, marking as completed`)
          updateWalletState(progress, wallet, { ...state, completed: true })
          return true
        }
      }

      page += 1
      console.log(`📦 ${wallet} page ${page} inserted ${inserted} trades (cursor ${state.beforeTs || state.offset || 'start'})`)
      updateWalletState(progress, wallet, state)
      progress.lastUpdate = new Date().toISOString()
      saveProgress(progressFile, progress)
    } catch (err) {
      consecutiveErrors += 1
      state.consecutiveErrors = consecutiveErrors
      state.lastError = err.message || err
      console.error(`❌ ${wallet}:`, err.message || err)
      const now = Date.now()
      const history = state.errorHistory || []
      history.push(now)
      state.errorHistory = history.filter((ts) => now - ts < QUARANTINE_WINDOW_MINUTES * 60 * 1000)
      if (consecutiveErrors >= QUARANTINE_CONSECUTIVE || state.errorHistory.length >= QUARANTINE_ERRORS_THRESHOLD) {
        console.log(`⚠️ Quarantining ${wallet} after repeated failures`)
        markWalletQuarantined(badWallets, wallet, '5xx', err.message || '')
        saveBadWallets(BAD_WALLETS_FILE, badWallets)
        updateWalletState(progress, wallet, { ...state, quarantined: true })
        return true
      }
      await sleep(1000 + Math.random() * 1000)
      updateWalletState(progress, wallet, state)
      saveProgress(progressFile, progress)
    }
  }
}

async function loadWallets(supabase) {
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
    .map((row) => normalizeWallet(row.trader_wallet))
    .filter(Boolean)
  const userWallets = (profilesResult.data || [])
    .map((row) => normalizeWallet(row.wallet_address))
    .filter(Boolean)
  return Array.from(new Set([...followWallets, ...userWallets]))
}

async function printStatus(options) {
  const supabase = createClient(options.supabaseUrl, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const wallets = await loadWallets(supabase)
  const progress = loadProgress(options.progressFile)
  const badWallets = loadBadWallets(BAD_WALLETS_FILE)

  console.log('Stats')
  console.log('-----')
  console.log(`Total wallets discovered: ${wallets.length}`)
  console.log(`Wallets completed in progress file: ${progress.currentIndex}/${wallets.length}`)
  console.log(`Quarantined wallets: ${Object.keys(badWallets.wallets).length}`)
  const entries = Object.entries(progress.walletStates || {}).map(([wallet, state]) => ({
    wallet,
    inserted: state.inserted || 0,
  }))
  entries.sort((a, b) => b.inserted - a.inserted)
  console.log('Top inserts')
  entries.slice(0, 10).forEach((entry) => console.log(`${entry.wallet}: ${entry.inserted}`))
}

async function main() {
  const progressFile = parseArg('progress-file') || DEFAULT_PROGRESS_FILE
  const maxSeconds = coerceInt(parseArg('max-seconds'), 0)
  const walletArg = parseArg('wallet')
  const limit = coerceInt(parseArg('limit'), 0)
  const offset = coerceInt(parseArg('offset'), 0)
  const tradeLimit = coerceInt(parseArg('trade-limit'), 0)
  const resume = parseFlag('resume')
  const noResume = parseFlag('no-resume')
  const auto = parseFlag('auto')
  const statusOnly = parseFlag('status')
  const modeArg = (parseArg('mode') || '').toLowerCase()
  const noSkipBad = parseFlag('no-skip-bad')
  const skipBadFlag = parseFlag('skip-bad')
  const walletMaxSeconds = coerceInt(parseArg('wallet-max-seconds'), MAX_WALLET_SECONDS)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const badWallets = loadBadWallets(BAD_WALLETS_FILE)
  const progress = loadProgress(progressFile)

  let mode = 'data'
  if (modeArg === 'clob' || (!modeArg && hasClobCredentials())) {
    mode = 'clob'
  } else if (modeArg === 'data') {
    mode = 'data'
  } else if (!modeArg && !hasClobCredentials()) {
    mode = 'data'
  }
  if (mode === 'clob' && !hasClobCredentials()) {
    console.warn('CLOB credentials missing, falling back to data mode')
    mode = 'data'
  }

  if (statusOnly) {
    await printStatus({ supabaseUrl, serviceRoleKey, progressFile })
    return
  }

  let wallets = []
  if (walletArg) {
    wallets = [normalizeWallet(walletArg)].filter(Boolean)
  } else {
    wallets = await loadWallets(supabase)
  }

  const effectiveLimit = limit > 0 ? limit : wallets.length
  const list = buildWalletList(progress, wallets, offset, effectiveLimit)

  const resumeFromFile = resume || (!noResume && fs.existsSync(progressFile))
  if (!resumeFromFile) {
    progress.currentIndex = 0
    progress.walletStates = {}
    progress.stats = { totalInserted: 0 }
    progress.lastUpdate = null
  }

  const rateLimiter = new TokenBucket({
    tokensPerInterval: RATE_TOKENS_PER_SEC,
    intervalMs: 1000,
    maxTokens: RATE_BURST,
  })

  const clobClient = mode === 'clob' ? createClobClient() : null
  const skipBad = walletArg ? false : auto ? !noSkipBad : skipBadFlag

  async function runBatch() {
    const startTime = Date.now()
    for (let i = progress.currentIndex; i < list.length; i += 1) {
      const wallet = list[i]
      const state = await supabase
        .from('traders')
        .select('id')
        .eq('wallet_address', wallet)
        .single()
      if (state.error) {
        throw new Error(`Failed to load trader ${wallet}: ${state.error.message}`)
      }
      const traderId = state.data?.id || null
      const done = await processWallet({
        wallet,
        traderId,
        supabase,
        rateLimiter,
        mode,
        progress,
        progressFile,
        options: { clobClient, walletMaxSeconds },
        badWallets,
        skipBad,
      })
      if (!done) {
        return false
      }
      progress.currentIndex = i + 1
      progress.lastUpdate = new Date().toISOString()
      saveProgress(progressFile, progress)
      if (maxSeconds > 0 && Date.now() - startTime > maxSeconds * 1000) {
        console.log(`Max run time reached (${maxSeconds}s)`)
        return false
      }
    }
    if (fs.existsSync(progressFile)) {
      fs.unlinkSync(progressFile)
    }
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
