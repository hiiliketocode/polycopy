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

const USER_ID = '490723a6-e0be-4a7a-9796-45d4d09aa1bd'

async function main() {
  console.log(`Checking user: ${USER_ID}\n`)

  // Check portfolio summary
  const { data: summary } = await supabase
    .from('user_portfolio_summary')
    .select('*')
    .eq('user_id', USER_ID)
    .maybeSingle()

  console.log('Portfolio Summary:')
  console.log(JSON.stringify(summary, null, 2))
  console.log('')

  // Check orders
  const { data: orders } = await supabase
    .from('orders')
    .select('order_id, side, market_id, outcome, price, price_when_copied, amount_invested, filled_size, created_at')
    .eq('copy_user_id', USER_ID)
    .order('created_at', { ascending: true })

  console.log(`Orders (copy_user_id): ${orders?.length || 0}`)
  if (orders && orders.length > 0) {
    orders.forEach((o, i) => {
      console.log(`  ${i + 1}. ${o.side} - Market: ${o.market_id?.substring(0, 20)}..., Outcome: ${o.outcome}, Price: ${o.price_when_copied || o.price}, Size: ${o.filled_size || o.amount_invested}`)
    })
  }
  console.log('')

  // Check wallet
  const { data: cred } = await supabase
    .from('clob_credentials')
    .select('polymarket_account_address')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cred?.polymarket_account_address) {
    const wallet = cred.polymarket_account_address.toLowerCase()
    console.log(`Wallet: ${wallet}\n`)

    // Check orders by trader_id
    const { data: trader } = await supabase
      .from('traders')
      .select('id')
      .ilike('wallet_address', wallet)
      .limit(1)
      .maybeSingle()

    if (trader?.id) {
      console.log(`Trader ID: ${trader.id}\n`)

      const { data: traderOrders } = await supabase
        .from('orders')
        .select('order_id, side, market_id, outcome, price, price_when_copied, amount_invested, filled_size, created_at, copy_user_id')
        .eq('trader_id', trader.id)
        .order('created_at', { ascending: true })

      console.log(`Orders (trader_id): ${traderOrders?.length || 0}`)
      if (traderOrders && traderOrders.length > 0) {
        traderOrders.forEach((o, i) => {
          const hasCopy = o.copy_user_id ? ' [COPY]' : ''
          console.log(`  ${i + 1}. ${o.side}${hasCopy} - Market: ${o.market_id?.substring(0, 20)}..., Outcome: ${o.outcome}, Price: ${o.price_when_copied || o.price}, Size: ${o.filled_size || o.amount_invested}`)
        })
      }
    }
  }

  // Check copied_trades
  const { data: copiedTrades } = await supabase
    .from('copied_trades')
    .select('*')
    .eq('user_id', USER_ID)
    .limit(5)

  console.log(`\nCopied Trades: ${copiedTrades?.length || 0}`)
  if (copiedTrades && copiedTrades.length > 0) {
    copiedTrades.forEach((ct, i) => {
      console.log(`  ${i + 1}. Market: ${ct.market_title}, Amount: ${ct.amount_invested}, Price: ${ct.price_when_copied}`)
    })
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
