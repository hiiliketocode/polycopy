import { createClient } from '@supabase/supabase-js'
import { ClobClient } from '@polymarket/clob-client'
import {
  fetchTradesForWallet,
  fetchOrder,
  fetchTradesForAuthedClient,
  fetchTradesForWalletWithClient,
  fetchOrderWithClient,
  mapOrderFromTradeFallback,
  normalizeTradesToFills,
  NormalizedOrder,
  NormalizedFill
} from '@/lib/polymarket/clobClient'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Supabase env vars missing for ingestion (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

let ordersTableName: 'trades' | 'orders' | null = null

function normalizeOrderType(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function isGtcOrder(order: NormalizedOrder): boolean {
  const normalized = normalizeOrderType(order.timeInForce ?? order.orderType ?? '')
  return (
    normalized === 'gtc' ||
    normalized === 'good_til_cancelled' ||
    normalized === 'good_til_canceled' ||
    normalized === 'good til cancelled' ||
    normalized === 'good til canceled'
  )
}

async function resolveOrdersTableName(): Promise<'trades' | 'orders'> {
  if (ordersTableName) return ordersTableName
  const { error } = await supabase.from('orders').select('order_id').limit(1)
  if (!error) {
    ordersTableName = 'orders'
    return ordersTableName
  }
  if ((error as any).code === 'PGRST205') {
    ordersTableName = 'trades'
    return ordersTableName
  }
  throw error
}

export type SyncResult = {
  traderId: string
  wallet: string
  ordersUpserted: number
  fillsUpserted: number
  refreshedOrders: number
}

type TraderRecord = {
  id: string
  wallet_address: string
  is_active: boolean
}

type TraderSyncState = {
  trader_id: string
  last_synced_at: string | null
  last_seen_order_ts: string | null
}

async function ensureTrader(wallet: string): Promise<TraderRecord> {
  const normalized = wallet.toLowerCase()
  const { data, error } = await supabase
    .from('traders')
    .select('*')
    .eq('wallet_address', normalized)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (data) return data as TraderRecord

  const { data: inserted, error: insertError } = await supabase
    .from('traders')
    .insert({ wallet_address: normalized })
    .select()
    .single()

  if (insertError) throw insertError
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

async function upsertSyncState(traderId: string, lastSyncedAt: Date, lastSeenOrderTs: Date | null, status: string, errorMsg?: string) {
  const payload = {
    trader_id: traderId,
    last_synced_at: lastSyncedAt.toISOString(),
    last_seen_order_ts: lastSeenOrderTs ? lastSeenOrderTs.toISOString() : null,
    last_run_status: status,
    last_run_error: errorMsg || null,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase.from('trader_sync_state').upsert(payload, { onConflict: 'trader_id' })
  if (error) throw error
}

async function upsertOrders(orders: NormalizedOrder[], traderId: string) {
  const filteredOrders = orders.filter((order) => {
    const status = String(order.status || '').toLowerCase()
    const openLikeStatuses = new Set(['open', 'pending', 'submitted', 'accepted', 'unknown'])
    if (!openLikeStatuses.has(status)) return true
    if (order.filledSize > 0) return true
    return isGtcOrder(order)
  })
  if (filteredOrders.length === 0) return 0

  const table = await resolveOrdersTableName()
  const orderIds = filteredOrders.map((o) => o.orderId)
  let supportsCopiedColumns = true
  let existingRows: Array<{
    order_id: string
    order_type?: string | null
    time_in_force?: string | null
    copied_trader_id?: string | null
    copied_trader_wallet?: string | null
  }> = []

  function columnMissing(error: any) {
    if (!error) return false
    const code = error?.code
    const message = typeof error?.message === 'string' ? error.message.toLowerCase() : ''
    return code === '42703' || message.includes('column') || message.includes('does not exist')
  }

  try {
    const { data, error } = await supabase
      .from(table)
      .select('order_id, order_type, time_in_force, copied_trader_id, copied_trader_wallet')
      .eq('trader_id', traderId)
      .in('order_id', orderIds)

    if (error) {
      if (columnMissing(error)) {
        supportsCopiedColumns = false
      } else {
        throw error
      }
    }

    if (data) {
      existingRows = data as typeof existingRows
    }
  } catch (error) {
    console.warn('[syncTrader] existing order lookup failed', error)
  }

  if (!supportsCopiedColumns) {
    const { data, error } = await supabase
      .from(table)
      .select('order_id, order_type, time_in_force')
      .eq('trader_id', traderId)
      .in('order_id', orderIds)

    if (!error && data) {
      existingRows = data as typeof existingRows
    }
  }

  const existingMap = new Map(existingRows.map((row) => [row.order_id, row]))

  const payload = filteredOrders.map((o) => {
    const existing = existingMap.get(o.orderId)
    const resolvedOrderType = existing?.order_type ?? o.orderType
    const resolvedTimeInForce = existing?.time_in_force ?? o.timeInForce
    const row = {
      order_id: o.orderId,
      trader_id: traderId,
      market_id: o.marketId,
      outcome: o.outcome,
      side: o.side,
      order_type: resolvedOrderType,
      time_in_force: resolvedTimeInForce,
      price: o.price,
      size: o.size,
      filled_size: o.filledSize,
      remaining_size: o.remainingSize,
      status: o.status,
      expiration: o.expiration ? o.expiration.toISOString() : null,
      raw: o.raw,
      created_at: o.createdAt.toISOString(),
      updated_at: o.updatedAt.toISOString()
    } as Record<string, unknown>

    if (supportsCopiedColumns) {
      row.copied_trader_id = existing?.copied_trader_id ?? null
      row.copied_trader_wallet = existing?.copied_trader_wallet ?? null
    }

    return row
  })

  const { error, count } = await supabase
    .from(table)
    .upsert(payload, { onConflict: 'order_id', ignoreDuplicates: false, count: 'exact' })

  if (error) throw error
  return count ?? filteredOrders.length
}

async function upsertFills(fills: NormalizedFill[], traderId: string) {
  if (fills.length === 0) return 0

  const payload = fills.map((f) => ({
    fill_id: f.fillId,
    order_id: f.orderId,
    trader_id: traderId,
    market_id: f.marketId,
    price: f.price,
    size: f.size,
    outcome: f.outcome,
    side: f.side,
    filled_at: f.filledAt.toISOString()
  }))

  const { error, count } = await supabase
    .from('fills')
    .upsert(payload, { onConflict: 'fill_id', ignoreDuplicates: false, count: 'exact' })

  if (error) throw error
  return count ?? fills.length
}

async function fetchOrdersByIds(
  orderIds: Set<string>,
  wallet: string,
  client?: ClobClient
): Promise<NormalizedOrder[]> {
  const orders: NormalizedOrder[] = []
  for (const orderId of orderIds) {
    try {
      const order = client ? await fetchOrderWithClient(client, orderId) : await fetchOrder(orderId)
      if (order) {
        orders.push(order)
      }
    } catch (err) {
      // swallow fetch errors to continue other orders
      console.error(`[syncTrader] Failed to fetch order ${orderId}:`, err)
    }
  }
  // Ensure trader wallet propagated
  return orders.map((o) => ({ ...o, traderWallet: wallet.toLowerCase() }))
}

async function reconcileOpenOrders(traderId: string, wallet: string, client?: ClobClient, maxAgeMinutes: number = 90) {
  const table = await resolveOrdersTableName()
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from(table)
    .select('order_id')
    .eq('trader_id', traderId)
    .in('status', ['open', 'partial'])
    .lt('created_at', cutoff)
    .limit(50)

  if (error) throw error
  if (!data || data.length === 0) return 0

  const orderIds = new Set<string>(data.map((d) => d.order_id))
  const refreshed = await fetchOrdersByIds(orderIds, wallet, client)
  await upsertOrders(refreshed, traderId)
  return refreshed.length
}

export async function syncTrader(input: { traderId?: string; wallet?: string; client?: ClobClient }): Promise<SyncResult> {
  if (!input.traderId && !input.wallet) {
    throw new Error('syncTrader requires traderId or wallet')
  }

  const trader = input.traderId
    ? (await supabase.from('traders').select('*').eq('id', input.traderId).single()).data
    : await ensureTrader(input.wallet!)

  if (!trader) {
    throw new Error('Trader not found or could not be created')
  }

  const wallet = trader.wallet_address
  const syncState = await getSyncState(trader.id)
  const watermark = syncState?.last_seen_order_ts ? new Date(syncState.last_seen_order_ts) : null

  try {
    const tradesPage = input.client
      ? await fetchTradesForAuthedClient(input.client, watermark || undefined)
      : await fetchTradesForWallet(wallet, watermark || undefined)
    const trades = tradesPage.trades || []
    const { fills, orderIds, lastMatchAt } = normalizeTradesToFills(trades, wallet)

    // Try to enrich orders from trades while we fetch order details
    const fallbackOrders: NormalizedOrder[] = []
    for (const trade of trades) {
      const fallback = mapOrderFromTradeFallback(trade, wallet)
      if (fallback) {
        fallbackOrders.push(fallback)
        orderIds.add(fallback.orderId)
      }
    }

    const fetchedOrders = await fetchOrdersByIds(orderIds, wallet, input.client)
    const orders = mergeOrders(fallbackOrders, fetchedOrders)

    const ordersUpserted = await upsertOrders(orders, trader.id)
    const fillsUpserted = await upsertFills(fills, trader.id)
    const refreshedOrders = await reconcileOpenOrders(trader.id, wallet, input.client)

    await upsertSyncState(trader.id, new Date(), lastMatchAt || watermark || new Date(), 'success')

    return {
      traderId: trader.id,
      wallet,
      ordersUpserted,
      fillsUpserted,
      refreshedOrders
    }
  } catch (err: any) {
    await upsertSyncState(trader.id, new Date(), watermark, 'error', err?.message || String(err))
    throw err
  }
}

function mergeOrders(primary: NormalizedOrder[], overrides: NormalizedOrder[]): NormalizedOrder[] {
  const byId = new Map<string, NormalizedOrder>()
  for (const order of primary) {
    byId.set(order.orderId, order)
  }
  for (const order of overrides) {
    byId.set(order.orderId, { ...byId.get(order.orderId), ...order })
  }
  return Array.from(byId.values())
}
