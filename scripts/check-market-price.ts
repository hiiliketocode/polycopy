/* eslint-disable no-console */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) dotenv.config({ path: envPath })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const MARKET_ID = '0xd84a501cf5cc0b0271' // Partial from the order
const OUTCOME = 'OVER'

async function main() {
  console.log(`Checking market: ${MARKET_ID}...\n`)

  // Find full market ID
  const { data: markets } = await supabase
    .from('markets')
    .select('condition_id, title, closed, resolved_outcome, winning_side, outcome_prices')
    .like('condition_id', `${MARKET_ID}%`)
    .limit(5)

  if (!markets || markets.length === 0) {
    console.log('Market not found in markets table')
    return
  }

  markets.forEach((m, i) => {
    console.log(`Market ${i + 1}:`)
    console.log(`  ID: ${m.condition_id}`)
    console.log(`  Title: ${m.title || 'N/A'}`)
    console.log(`  Closed: ${m.closed}`)
    console.log(`  Resolved Outcome: ${m.resolved_outcome || 'N/A'}`)
    console.log(`  Winning Side: ${m.winning_side || 'N/A'}`)
    console.log(`  Outcome Prices: ${JSON.stringify(m.outcome_prices)}`)
    console.log('')
  })

  // Check the order details
  const { data: orders } = await supabase
    .from('orders')
    .select('order_id, market_id, outcome, price, price_when_copied, current_price, market_resolved, resolved_outcome, filled_size')
    .eq('copy_user_id', '490723a6-e0be-4a7a-9796-45d4d09aa1bd')

  console.log('Order Details:')
  if (orders && orders.length > 0) {
    orders.forEach((o, i) => {
      console.log(`  ${i + 1}. Market: ${o.market_id}`)
      console.log(`     Outcome: ${o.outcome}`)
      console.log(`     Entry Price: ${o.price_when_copied || o.price}`)
      console.log(`     Current Price: ${o.current_price || 'N/A'}`)
      console.log(`     Market Resolved: ${o.market_resolved}`)
      console.log(`     Resolved Outcome: ${o.resolved_outcome || 'N/A'}`)
      console.log(`     Filled Size: ${o.filled_size}`)
      
      if (o.filled_size && o.price_when_copied) {
        const invested = o.filled_size * o.price_when_copied
        console.log(`     Invested: $${invested.toFixed(2)}`)
        
        // Check if market is resolved
        const market = markets.find(m => m.condition_id === o.market_id)
        if (market && market.closed) {
          console.log(`     ⚠️  Market is CLOSED`)
          if (market.outcome_prices) {
            const outcomes = market.outcome_prices.outcomes || market.outcome_prices.labels || []
            const prices = market.outcome_prices.outcomePrices || market.outcome_prices.prices || []
            const outcomeIdx = outcomes.findIndex((out: string) => out.toLowerCase() === o.outcome?.toLowerCase())
            if (outcomeIdx >= 0 && outcomeIdx < prices.length) {
              const resolutionPrice = Number(prices[outcomeIdx])
              const resolutionValue = o.filled_size * resolutionPrice
              const realizedPnl = resolutionValue - invested
              console.log(`     Resolution Price: $${resolutionPrice.toFixed(2)}`)
              console.log(`     Resolution Value: $${resolutionValue.toFixed(2)}`)
              console.log(`     Realized P&L: $${realizedPnl.toFixed(2)}`)
            }
          }
          if (market.winning_side) {
            const winning = typeof market.winning_side === 'string' 
              ? market.winning_side 
              : market.winning_side.label || market.winning_side.id
            console.log(`     Winning Side: ${winning}`)
            const isWinner = winning?.toLowerCase() === o.outcome?.toLowerCase()
            console.log(`     Is Winner: ${isWinner ? 'YES' : 'NO'}`)
          }
        } else if (o.current_price) {
          const currentValue = o.filled_size * o.current_price
          const unrealizedPnl = currentValue - invested
          console.log(`     Current Value: $${currentValue.toFixed(2)}`)
          console.log(`     Unrealized P&L: $${unrealizedPnl.toFixed(2)}`)
        }
      }
      console.log('')
    })
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
