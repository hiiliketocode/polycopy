/**
 * Trades Ingestion
 * 
 * Ingests raw fill events from Dome API into the trades table.
 * This is the first step of the trade history pipeline - raw immutable storage only.
 * 
 * Data Source: Dome API /polymarket/orders endpoint
 * Table: public.trades
 * 
 * IMPORTANT: This function stores RAW data only. No derived fields:
 * - No PnL calculations
 * - No FIFO matching
 * - No position tracking
 * - Just raw fill events
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * Create Supabase service client (bypasses RLS)
 */
function createService() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

/**
 * Dome API order/fill event structure (from /polymarket/orders endpoint)
 */
export interface DomeFillEvent {
  token_id?: string
  token_label?: string  // "Yes" or "No"
  side: 'BUY' | 'SELL'
  market_slug?: string
  condition_id?: string
  shares: number  // Raw shares (integer)
  shares_normalized: number  // Normalized shares (decimal)
  price: number
  tx_hash: string
  title?: string  // Market title
  timestamp: number  // Unix timestamp in seconds
  order_hash?: string  // Can be null
  user: string  // Wallet address (maker)
  taker?: string  // Taker wallet address
  // ... any other fields from Dome API
}

/**
 * Maps a Dome API fill event to trades table row
 */
function mapDomeEventToFillRow(event: DomeFillEvent): {
  wallet_address: string
  timestamp: string  // ISO timestamp string
  side: 'BUY' | 'SELL'
  shares: number | null
  shares_normalized: number
  price: number
  token_id: string | null
  token_label: string | null
  condition_id: string | null
  market_slug: string | null
  title: string | null
  tx_hash: string
  order_hash: string | null
  taker: string | null
  source: string
  raw: Record<string, any>
} {
  // Convert Unix seconds to ISO timestamp string
  const timestamp = new Date(event.timestamp * 1000).toISOString()

  return {
    wallet_address: event.user.toLowerCase(),  // Normalize to lowercase
    timestamp,
    side: event.side,
    shares: event.shares ?? null,  // Raw shares (integer)
    shares_normalized: event.shares_normalized,
    price: event.price,
    token_id: event.token_id || null,
    token_label: event.token_label || null,
    condition_id: event.condition_id || null,
    market_slug: event.market_slug || null,
    title: event.title || null,
    tx_hash: event.tx_hash,
    order_hash: event.order_hash || null,
    taker: event.taker?.toLowerCase() || null,
    source: 'dome',
    raw: event as Record<string, any>,  // Store complete raw payload
  }
}

/**
 * Ingests a single Dome fill event into trades table.
 * 
 * Uses ON CONFLICT DO NOTHING for idempotency - safe to rerun.
 * 
 * @param event - Dome API fill event
 * @returns Inserted row ID if new, null if duplicate
 */
export async function ingestDomeFill(event: DomeFillEvent): Promise<string | null> {
  const supabase = createService()
  const row = mapDomeEventToFillRow(event)

  const { data, error } = await supabase
    .from('trades')
    .insert(row)
    .select('id')
    .single()

  if (error) {
    // Check if it's a unique constraint violation (duplicate)
    if (error.code === '23505') {
      // Duplicate - idempotent, safe to ignore
      console.log(`[ingestDomeFill] Duplicate fill ignored: ${event.tx_hash} / ${event.order_hash || 'null'}`)
      return null
    }
    
    // Other error - rethrow
    console.error('[ingestDomeFill] Error inserting fill:', error)
    throw new Error(`Failed to ingest fill: ${error.message}`)
  }

  return data?.id || null
}

/**
 * Ingests multiple Dome fill events in a batch.
 * 
 * Uses ON CONFLICT DO NOTHING for idempotency - safe to rerun.
 * 
 * @param events - Array of Dome API fill events
 * @returns Count of newly inserted rows
 */
export async function ingestDomeFillsBatch(events: DomeFillEvent[]): Promise<number> {
  if (events.length === 0) return 0

  const supabase = createService()
  const rows = events.map(mapDomeEventToFillRow)

  const { data, error } = await supabase
    .from('trades')
    .insert(rows)
    .select('id')

  if (error) {
    // Batch insert with ON CONFLICT - PostgreSQL will skip duplicates
    // If we get a unique constraint error, it means we need to handle individually
    if (error.code === '23505') {
      // Fallback: insert individually to handle duplicates gracefully
      console.log('[ingestDomeFillsBatch] Batch had duplicates, falling back to individual inserts')
      let inserted = 0
      for (const event of events) {
        try {
          const id = await ingestDomeFill(event)
          if (id) inserted++
        } catch (err) {
          console.error('[ingestDomeFillsBatch] Error in individual insert:', err)
        }
      }
      return inserted
    }
    
    console.error('[ingestDomeFillsBatch] Error in batch insert:', error)
    throw new Error(`Failed to ingest fills batch: ${error.message}`)
  }

  return data?.length || 0
}

/**
 * Example usage:
 * 
 * ```typescript
 * // Single fill
 * const domeEvent: DomeFillEvent = {
 *   user: '0x123...',
 *   side: 'BUY',
 *   shares_normalized: 10.5,
 *   price: 0.65,
 *   timestamp: 1757008834,
 *   tx_hash: '0xabc...',
 *   order_hash: '0xdef...',
 *   // ... other fields
 * }
 * 
 * const id = await ingestDomeFill(domeEvent)
 * if (id) {
 *   console.log('New fill ingested:', id)
 * } else {
 *   console.log('Duplicate fill (idempotent)')
 * }
 * 
 * // Batch
 * const events = [event1, event2, event3]
 * const inserted = await ingestDomeFillsBatch(events)
 * console.log(`Inserted ${inserted} new fills`)
 * ```
 */
