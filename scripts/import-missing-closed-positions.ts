import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '5478cb0a-c638-4b40-8afc-bf44eb9092db'
const WALLET = '0x53dbe8e629957930ea7235e2281066371553480e'

async function main() {
  console.log('🔍 Fetching missing closed positions from Polymarket...\n')

  // Fetch closed positions from Polymarket
  const response = await fetch(`https://data-api.polymarket.com/closed-positions?user=${WALLET}`)
  const closedPositions = await response.json()

  if (!Array.isArray(closedPositions)) {
    console.error('Failed to fetch closed positions')
    return
  }

  console.log(`Found ${closedPositions.length} closed positions\n`)

  // Get user's trader_id
  const { data: trader, error: traderError } = await supabase
    .from('traders')
    .select('id')
    .eq('wallet_address', WALLET.toLowerCase())
    .maybeSingle()

  if (traderError) {
    console.error('Error fetching trader:', traderError)
    return
  }

  let traderId = trader?.id

  if (!traderId) {
    console.log('Creating trader record...')
    const { data: newTrader, error: createError } = await supabase
      .from('traders')
      .insert({ wallet_address: WALLET.toLowerCase() })
      .select('id')
      .single()

    if (createError) {
      console.error('Error creating trader:', createError)
      return
    }

    traderId = newTrader.id
    console.log('✅ Trader created\n')
  }

  // Fetch existing orders to check which are missing
  const { data: existingOrders } = await supabase
    .from('orders')
    .select('market_id, outcome')
    .eq('copy_user_id', USER_ID)
    .eq('market_resolved', true)

  const existingKeys = new Set(
    existingOrders?.map(o => `${o.market_id}:${o.outcome?.toLowerCase()}`) || []
  )

  // Filter to only missing positions
  const missingPositions = closedPositions.filter(p => {
    const conditionId = p.conditionId || p.asset
    const key = `${conditionId}:${p.outcome?.toLowerCase()}`
    return !existingKeys.has(key)
  })

  console.log(`Found ${missingPositions.length} positions to import\n`)

  if (missingPositions.length === 0) {
    console.log('✅ All closed positions already imported!')
    return
  }

  // Import each missing position
  let imported = 0
  let failed = 0

  for (const position of missingPositions) {
    const conditionId = position.conditionId || position.asset
    const outcome = position.outcome
    const marketTitle = position.market?.question || position.title || 'Unknown Market'
    const avgPrice = position.avgPrice || 0
    const totalBought = position.totalBought || 0
    const realizedPnl = position.realizedPnl || 0

    console.log(`📥 Importing: ${marketTitle} (${outcome})`)
    console.log(`   P&L: $${realizedPnl.toFixed(2)}, Avg Price: ${avgPrice}, Total: ${totalBought}`)

    // Create order record
    const orderData = {
      order_id: randomUUID(),
      trader_id: traderId,
      copy_user_id: USER_ID,
      market_id: conditionId,
      outcome: outcome,
      side: 'buy',
      size: totalBought,
      filled_size: totalBought,
      remaining_size: 0, // Fully closed
      price: avgPrice,
      status: 'FILLED',
      market_resolved: true,
      copied_market_title: marketTitle,
      trade_method: 'imported',
      polymarket_realized_pnl: realizedPnl,
      polymarket_avg_price: avgPrice,
      polymarket_total_bought: totalBought,
      polymarket_synced_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { error: insertError } = await supabase
      .from('orders')
      .insert(orderData)

    if (insertError) {
      console.error(`   ❌ Error:`, insertError.message)
      failed++
    } else {
      console.log(`   ✅ Imported successfully\n`)
      imported++
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`✅ Imported: ${imported}`)
  console.log(`❌ Failed: ${failed}`)
  console.log('\n💡 Run clear-prod-cache.ts to update P&L on live site')
}

main()
