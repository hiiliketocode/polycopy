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

const WALLET = '0x53dbE8E629957930eA7235e2281066371553480E'.toLowerCase()

async function main() {
  console.log('Wallet:', WALLET)

  // 1. Resolve user_id from clob_credentials
  const { data: cred } = await supabase
    .from('clob_credentials')
    .select('user_id')
    .ilike('polymarket_account_address', WALLET)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const userId = cred?.user_id
  if (!userId) {
    console.log('No user_id found for this wallet in clob_credentials')
  } else {
    console.log('User ID:', userId)
  }

  // 2. Orders by copy_user_id – count by side
  if (userId) {
    const { data: orders, error: oe } = await supabase
      .from('orders')
      .select('order_id, side, copy_user_id, created_at')
      .eq('copy_user_id', userId)
      .order('created_at', { ascending: true })

    if (oe) {
      console.log('\nOrders (copy_user_id) error:', oe.message)
    } else {
      const buys = (orders || []).filter((o: any) => String(o.side || '').toLowerCase() === 'buy')
      const sells = (orders || []).filter((o: any) => String(o.side || '').toLowerCase() === 'sell')
      const other = (orders || []).filter((o: any) => {
        const s = String(o.side || '').toLowerCase()
        return s !== 'buy' && s !== 'sell'
      })
      console.log('\nOrders (copy_user_id):')
      console.log('  Total:', orders?.length ?? 0)
      console.log('  BUY:', buys.length)
      console.log('  SELL:', sells.length)
      if (other.length) console.log('  Other side:', other.length, other.map((o: any) => o.side))

      if (sells.length > 0) {
        console.log('\n  Sample SELL orders:')
        sells.slice(0, 5).forEach((o: any, i: number) => {
          console.log(`    ${i + 1}. order_id: ${o.order_id?.slice(0, 24)}..., side: ${o.side}, created: ${o.created_at}`)
        })
      }
    }
  }

  // 3. trades table by wallet_address
  const { data: trades, error: te } = await supabase
    .from('trades')
    .select('id, wallet_address, side, shares_normalized, price, timestamp, created_at')
    .ilike('wallet_address', WALLET)
    .order('timestamp', { ascending: true })
    .limit(500)

  if (te) {
    console.log('\nTrades (wallet_address) error:', te.message)
  } else {
    const tBuys = (trades || []).filter((t: any) => String(t.side || '').toLowerCase() === 'buy')
    const tSells = (trades || []).filter((t: any) => String(t.side || '').toLowerCase() === 'sell')
    console.log('\nTrades (wallet_address):')
    console.log('  Total (limit 500):', trades?.length ?? 0)
    console.log('  BUY:', tBuys.length)
    console.log('  SELL:', tSells.length)

    if (tSells.length > 0) {
      console.log('\n  Sample SELL trades:')
      tSells.slice(0, 5).forEach((t: any, i: number) => {
        console.log(`    ${i + 1}. side: ${t.side}, size: ${t.shares_normalized}, price: ${t.price}, created: ${t.created_at}`)
      })
    }
  }

  // 4. Any orders that have this wallet as taker/maker? (orders might not have wallet)
  console.log('\nDone.')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
