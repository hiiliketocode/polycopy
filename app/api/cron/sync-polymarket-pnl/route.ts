import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const normalize = (value?: string | null) => value?.trim().toLowerCase() || ''

/**
 * API endpoint to sync Polymarket's official P&L for all users
 * 
 * Usage: POST /api/cron/sync-polymarket-pnl
 * 
 * This should be called regularly (e.g., hourly or daily) to keep
 * user P&L data in sync with Polymarket's official numbers
 */
export async function POST(request: Request) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // Get all users with connected wallets
    const { data: credentials, error } = await supabase
      .from('clob_credentials')
      .select('user_id, polymarket_account_address')
      .not('polymarket_account_address', 'is', null)

    if (error) {
      console.error('[Sync P&L] Error fetching credentials:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[Sync P&L] Processing ${credentials?.length || 0} users`)

    let totalUpdated = 0
    let totalErrors = 0

    // Process users in batches to avoid timeouts
    const batchSize = 10
    for (let i = 0; i < (credentials?.length || 0); i += batchSize) {
      const batch = credentials!.slice(i, i + batchSize)
      
      const results = await Promise.allSettled(
        batch.map(cred => syncUserPositions(supabase, cred.user_id, cred.polymarket_account_address))
      )

      for (const result of results) {
        if (result.status === 'fulfilled') {
          totalUpdated += result.value.updated
        } else {
          totalErrors++
          console.error('[Sync P&L] Error:', result.reason)
        }
      }
    }

    return NextResponse.json({
      success: true,
      usersProcessed: credentials?.length || 0,
      ordersUpdated: totalUpdated,
      errors: totalErrors
    })
  } catch (err: any) {
    console.error('[Sync P&L] Fatal error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function syncUserPositions(
  supabase: any,
  userId: string,
  walletAddress: string
) {
  // Fetch closed positions from Polymarket
  let allPositions: any[] = []
  let offset = 0
  const limit = 50

  try {
    // Limit to 500 positions max to avoid timeout
    while (offset < 500) {
      const response = await fetch(
        `https://data-api.polymarket.com/closed-positions?user=${walletAddress}&limit=${limit}&offset=${offset}`,
        { 
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(5000) // 5 second timeout per request
        }
      )

      if (!response.ok) break

      const batch = await response.json()
      allPositions = allPositions.concat(batch)
      
      if (batch.length < limit) break
      offset += limit
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  } catch (err) {
    console.warn(`[Sync P&L] Failed to fetch positions for ${userId}:`, err)
    return { updated: 0 }
  }

  if (allPositions.length === 0) {
    return { updated: 0 }
  }

  const { data: orders } = await supabase
    .from('orders')
    .select('order_id, market_id, outcome, side, amount_invested')
    .eq('copy_user_id', userId)
    .limit(1000)

  if (!orders || orders.length === 0) {
    return { updated: 0 }
  }

  // Collect all updates, then execute in parallel batches instead of one-by-one
  const pendingUpdates: { order_id: string; payload: Record<string, any> }[] = []
  const now = new Date().toISOString()

  for (const position of allPositions) {
    const matchingOrders = orders.filter((o: any) => 
      o.market_id === position.conditionId && 
      normalize(o.outcome) === normalize(position.outcome) &&
      o.side?.toLowerCase() === 'buy'
    )

    if (matchingOrders.length === 0) continue

    const totalInvested = matchingOrders.reduce((sum: number, o: any) => 
      sum + Number(o.amount_invested || 0), 0)

    for (const order of matchingOrders) {
      const proportion = totalInvested > 0 
        ? Number(order.amount_invested || 0) / totalInvested 
        : 1 / matchingOrders.length

      pendingUpdates.push({
        order_id: order.order_id,
        payload: {
          polymarket_realized_pnl: Number(position.realizedPnl || 0) * proportion,
          polymarket_avg_price: Number(position.avgPrice || 0),
          polymarket_total_bought: Number(position.totalBought || 0),
          polymarket_synced_at: now,
        },
      })
    }
  }

  let updatedCount = 0
  const BATCH_SIZE = 25
  for (let i = 0; i < pendingUpdates.length; i += BATCH_SIZE) {
    const batch = pendingUpdates.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(({ order_id, payload }) =>
        supabase.from('orders').update(payload).eq('order_id', order_id)
      )
    )
    updatedCount += results.filter(
      (r) => r.status === 'fulfilled' && !(r.value as any).error
    ).length
  }

  return { updated: updatedCount }
}

// Allow GET for manual testing
export async function GET() {
  return NextResponse.json({
    message: 'Use POST to trigger sync',
    endpoint: '/api/cron/sync-polymarket-pnl'
  })
}
