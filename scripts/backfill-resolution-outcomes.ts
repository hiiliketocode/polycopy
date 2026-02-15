import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '5478cb0a-c638-4b40-8afc-bf44eb9092db'

interface TokenInfo {
  outcome: string
  price: number
  winner: boolean
}

interface CLOBMarketResponse {
  condition_id: string
  active: boolean
  closed: boolean
  archived: boolean
  tokens: TokenInfo[]
}

async function fetchMarketResolution(marketId: string): Promise<string | null> {
  try {
    const response = await fetch(`https://clob.polymarket.com/markets/${marketId}`)
    if (!response.ok) {
      console.log(`❌ Market ${marketId.substring(0, 10)}... - HTTP ${response.status}`)
      return null
    }

    const data: CLOBMarketResponse = await response.json()

    if (!data.tokens || data.tokens.length === 0) {
      console.log(`⚠️  Market ${marketId.substring(0, 10)}... - No tokens data`)
      return null
    }

    // Find the winning token
    const winner = data.tokens.find(t => t.winner === true)
    if (winner) {
      console.log(`✅ Market ${marketId.substring(0, 10)}... - Winner: ${winner.outcome}`)
      return winner.outcome
    }

    // If no explicit winner flag, check for price = 1
    const priceWinner = data.tokens.find(t => t.price === 1)
    if (priceWinner) {
      console.log(`✅ Market ${marketId.substring(0, 10)}... - Winner by price: ${priceWinner.outcome}`)
      return priceWinner.outcome
    }

    console.log(`⚠️  Market ${marketId.substring(0, 10)}... - No clear winner`)
    return null
  } catch (error: any) {
    console.log(`❌ Market ${marketId.substring(0, 10)}... - Error: ${error.message}`)
    return null
  }
}

async function main() {
  console.log('🔍 Finding orders without resolved_outcome...\n')

  // Get orders without resolved_outcome
  const { data: orders } = await supabase
    .from('orders')
    .select('order_id, market_id, outcome, copied_market_title')
    .eq('copy_user_id', USER_ID)
    .eq('side', 'buy')
    .eq('market_resolved', true)
    .is('resolved_outcome', null)

  if (!orders || orders.length === 0) {
    console.log('✅ No orders need resolution data!')
    return
  }

  console.log(`Found ${orders.length} orders across ${new Set(orders.map(o => o.market_id)).size} unique markets\n`)

  // Get unique market IDs
  const uniqueMarkets = [...new Set(orders.map(o => o.market_id).filter(Boolean))] as string[]

  console.log('📡 Fetching resolution data from Polymarket CLOB API...\n')

  const resolutionMap = new Map<string, string>()
  let successCount = 0
  let failCount = 0

  // Fetch resolution data for each market (with rate limiting)
  for (let i = 0; i < uniqueMarkets.length; i++) {
    const marketId = uniqueMarkets[i]
    const resolvedOutcome = await fetchMarketResolution(marketId)

    if (resolvedOutcome) {
      resolutionMap.set(marketId, resolvedOutcome)
      successCount++
    } else {
      failCount++
    }

    // Rate limit: 2 requests per second
    if (i < uniqueMarkets.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  console.log(`\n📊 Results: ${successCount} markets resolved, ${failCount} failed\n`)

  if (resolutionMap.size === 0) {
    console.log('❌ No resolution data found. Exiting.')
    return
  }

  // Update orders with resolved_outcome
  console.log('💾 Updating orders in database...\n')

  let updatedCount = 0
  let skippedCount = 0

  for (const order of orders) {
    const resolvedOutcome = resolutionMap.get(order.market_id)

    if (!resolvedOutcome) {
      skippedCount++
      continue
    }

    // Update the order
    const { error } = await supabase
      .from('orders')
      .update({ resolved_outcome: resolvedOutcome })
      .eq('order_id', order.order_id)

    if (error) {
      console.log(`❌ Failed to update order ${order.order_id}: ${error.message}`)
    } else {
      updatedCount++
      const isWinner = order.outcome.toLowerCase() === resolvedOutcome.toLowerCase()
      console.log(`${isWinner ? '🏆' : '💔'} ${order.copied_market_title} - ${order.outcome} - ${isWinner ? 'WIN' : 'LOSS'}`)
    }
  }

  console.log(`\n✅ Updated ${updatedCount} orders, skipped ${skippedCount}`)

  // Update markets table too
  console.log('\n💾 Updating markets table...\n')

  let marketsUpdated = 0
  for (const [marketId, resolvedOutcome] of resolutionMap.entries()) {
    const { error } = await supabase
      .from('markets')
      .update({
        resolved_outcome: resolvedOutcome,
        winning_side: resolvedOutcome,
      })
      .eq('condition_id', marketId)

    if (!error) {
      marketsUpdated++
    }
  }

  console.log(`✅ Updated ${marketsUpdated} markets`)

  console.log('\n🎯 Done! Clear cache and refresh to see updated P&L.')
}

main()
