import { createClient } from '@supabase/supabase-js'

// Public executed trades only (no orders or lifecycle state).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Supabase env vars missing for public trade ingestion (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

export type PublicTradeSyncResult = {
  traderId: string
  wallet: string
  tradesUpserted: number
  pagesFetched: number
  newestTradeTs: string | null
}

type TraderRecord = {
  id: string
  wallet_address: string
  is_active: boolean
}

type TraderSyncState = {
  trader_id: string
  last_synced_at: string | null
  last_seen_trade_ts: string | null
}

type PublicTradeRow = {
  trade_id: string
  trader_wallet: string
  trader_id: string | null
  transaction_hash: string | null
  asset: string | null
  condition_id: string
  market_slug: string | null
  event_slug: string | null
  market_title: string | null
  side: string | null
  outcome: string | null
  outcome_index: number | null
  size: number | null
  price: number | null
  trade_timestamp: string
  raw: unknown
  ingested_at?: string
}

type PolymarketPublicTrade = {
  transactionHash?: string
  asset?: string
  conditionId?: string
  slug?: string
  eventSlug?: string
  title?: string
  side?: string
  outcome?: string
  outcomeIndex?: number
  size?: string | number
  price?: string | number
  timestamp?: number | string
  [key: string]: unknown
}

const DEFAULT_LIMIT = 200

async function ensureTrader(wallet: string): Promise<TraderRecord> {
  const normalized = wallet.toLowerCase()
  const { data, error } = await supabase
    .from('traders')
    .select('*')
    .eq('wallet_address', normalized)
    .maybeSingle()

  if (error) throw error
  if (data) return data as TraderRecord

  const { data: inserted, error: insertError } = await supabase
    .from('traders')
    .insert({ wallet_address: normalized })
    .select()
    .single()

  if (insertError) throw insertError

  // Trigger PnL backfill for the new trader asynchronously
  // This ensures new traders get their realized PnL data backfilled immediately
  import('../../lib/backfill/trigger-wallet-pnl-backfill')
    .then((mod) => mod.triggerWalletPnlBackfill(normalized))
    .catch((err) => {
      console.error(`[syncPublicTrades] Failed to trigger PnL backfill for new trader ${normalized}:`, err)
    })

  return inserted as TraderRecord
}

async function getSyncState(traderId: string): Promise<TraderSyncState | null> {
  const { data, error } = await supabase
    .from('trader_sync_state')
    .select('*')
    .eq('trader_id', traderId)
    .maybeSingle()
  if (error) throw error
  return data as TraderSyncState | null
}

async function upsertSyncState(
  traderId: string,
  lastSyncedAt: Date,
  lastSeenTradeTs: Date | null,
  status: string,
  errorMsg?: string
) {
  const payload = {
    trader_id: traderId,
    last_synced_at: lastSyncedAt.toISOString(),
    last_seen_trade_ts: lastSeenTradeTs ? lastSeenTradeTs.toISOString() : null,
    last_run_status: status,
    last_run_error: errorMsg || null,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase.from('trader_sync_state').upsert(payload, { onConflict: 'trader_id' })
  if (error) throw error
}

function normalizeSide(side?: string | null): string | null {
  if (!side) return null
  const normalized = side.toUpperCase()
  if (normalized === 'BUY' || normalized === 'SELL') return normalized
  return null
}

function normalizeOutcome(outcome?: string | null): string | null {
  if (!outcome) return null
  const normalized = outcome.toUpperCase()
  if (normalized === 'YES' || normalized === 'NO') return normalized
  return null
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function parseTradeTimestamp(value: PolymarketPublicTrade['timestamp']): Date | null {
  if (value === null || value === undefined) return null
  let ts = Number(value)
  if (!Number.isFinite(ts)) return null
  if (ts < 10000000000) ts *= 1000
  const date = new Date(ts)
  return Number.isNaN(date.getTime()) ? null : date
}

function deriveTradeId(trade: PolymarketPublicTrade, wallet: string): string {
  if (trade.transactionHash) return trade.transactionHash
  const parts = [
    wallet.toLowerCase(),
    trade.asset || 'asset',
    trade.conditionId || 'condition',
    trade.timestamp || Date.now()
  ]
  return parts.join('-')
}

function buildRow(
  trade: PolymarketPublicTrade,
  wallet: string,
  traderId: string | null,
  tradeTimestamp: Date
): PublicTradeRow {
  return {
    trade_id: deriveTradeId(trade, wallet),
    // trader_wallet is the proxy wallet (Polymarket account), not the EOA
    trader_wallet: wallet.toLowerCase(),
    trader_id: traderId,
    transaction_hash: trade.transactionHash || null,
    asset: trade.asset || null,
    condition_id: trade.conditionId as string,
    market_slug: (trade.slug as string) || null,
    event_slug: (trade.eventSlug as string) || null,
    market_title: (trade.title as string) || null,
    side: normalizeSide(trade.side as string),
    outcome: normalizeOutcome(trade.outcome as string),
    outcome_index: toNumber(trade.outcomeIndex),
    size: toNumber(trade.size),
    price: toNumber(trade.price),
    trade_timestamp: tradeTimestamp.toISOString(),
    raw: trade,
    ingested_at: new Date().toISOString()
  }
}

async function fetchTradesPage(wallet: string, limit: number, offset: number): Promise<PolymarketPublicTrade[]> {
  const url = `https://data-api.polymarket.com/trades?user=${wallet.toLowerCase()}&limit=${limit}&offset=${offset}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Polycopy Public Trade Ingestion' }
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Polymarket public trades API returned ${res.status}: ${text}`)
  }
  const data = await res.json()
  if (!Array.isArray(data)) return []
  return data as PolymarketPublicTrade[]
}

async function upsertTrades(rows: PublicTradeRow[]): Promise<number> {
  if (rows.length === 0) return 0
  const { error, count } = await supabase
    .from('trades_public')
    .upsert(rows, { onConflict: 'trade_id', ignoreDuplicates: false, count: 'exact' })
  if (error) throw error
  return count ?? rows.length
}

export async function syncPublicTrades(input: { traderId?: string; wallet?: string }): Promise<PublicTradeSyncResult> {
  if (!input.traderId && !input.wallet) {
    throw new Error('syncPublicTrades requires traderId or wallet')
  }

  const trader = input.traderId
    ? (await supabase.from('traders').select('*').eq('id', input.traderId).single()).data
    : await ensureTrader(input.wallet!)

  if (!trader) {
    throw new Error('Trader not found or could not be created')
  }

  const wallet = trader.wallet_address
  const syncState = await getSyncState(trader.id)
  const watermark = syncState?.last_seen_trade_ts ? new Date(syncState.last_seen_trade_ts) : null

  let offset = 0
  let pagesFetched = 0
  let tradesUpserted = 0
  let newestTradeTs: Date | null = watermark

  try {
    while (true) {
      const trades = await fetchTradesPage(wallet, DEFAULT_LIMIT, offset)
      pagesFetched += 1
      if (trades.length === 0) break

      let oldestTsInPage: Date | null = null
      const rows: PublicTradeRow[] = []

      for (const trade of trades) {
        const tradeTimestamp = parseTradeTimestamp(trade.timestamp)
        if (!tradeTimestamp) continue

        if (!oldestTsInPage || tradeTimestamp < oldestTsInPage) {
          oldestTsInPage = tradeTimestamp
        }

        if (watermark && tradeTimestamp <= watermark) {
          continue
        }

        if (!trade.conditionId) {
          continue
        }

        const row = buildRow(trade, wallet, trader.id, tradeTimestamp)
        rows.push(row)

        if (!newestTradeTs || tradeTimestamp > newestTradeTs) {
          newestTradeTs = tradeTimestamp
        }
      }

      tradesUpserted += await upsertTrades(rows)

      if (trades.length < DEFAULT_LIMIT) break
      if (watermark && oldestTsInPage && oldestTsInPage <= watermark) break

      offset += DEFAULT_LIMIT
    }

    await upsertSyncState(trader.id, new Date(), newestTradeTs, 'success')

    return {
      traderId: trader.id,
      wallet,
      tradesUpserted,
      pagesFetched,
      newestTradeTs: newestTradeTs ? newestTradeTs.toISOString() : null
    }
  } catch (err: any) {
    await upsertSyncState(trader.id, new Date(), watermark, 'error', err?.message || String(err))
    throw err
  }
}
