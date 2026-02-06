/* eslint-disable no-console */
/**
 * Analyze Orders for P&L Discrepancy
 * 
 * This script executes comprehensive SQL queries to understand P&L calculation issues
 * in the orders table for a specific user.
 */

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

function printSection(title: string, data: any[]) {
  console.log('\n' + '='.repeat(80))
  console.log(title)
  console.log('='.repeat(80))
  if (data && data.length > 0) {
    console.table(data)
  } else {
    console.log('No data found')
  }
}

async function main() {
  console.log(`\n🔍 ANALYZING ORDERS FOR USER: ${USER_ID}`)
  console.log(`Timestamp: ${new Date().toISOString()}\n`)

  // =========================================================================
  // 1. BASIC ORDER COUNTS: BUY vs SELL breakdown
  // =========================================================================
  const { data: orderCounts } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        side,
        COUNT(*) AS order_count,
        COUNT(DISTINCT market_id) AS unique_markets,
        SUM(COALESCE(filled_size, size, 0)) AS total_shares,
        ROUND(SUM(COALESCE(amount_invested, price * filled_size, price * size, 0))::numeric, 2) AS total_usd
      FROM public.orders
      WHERE copy_user_id = '${USER_ID}'
      GROUP BY side
      ORDER BY side
    `
  })
  
  printSection('1. ORDER COUNTS BY SIDE', orderCounts || [])

  // =========================================================================
  // 2. Get user's wallet and trader_id
  // =========================================================================
  const { data: userInfo } = await supabase
    .from('clob_credentials')
    .select('polymarket_account_address')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let traderInfo: any = null
  if (userInfo?.polymarket_account_address) {
    const { data: trader } = await supabase
      .from('traders')
      .select('id, wallet_address, username')
      .ilike('wallet_address', userInfo.polymarket_account_address)
      .limit(1)
      .maybeSingle()
    
    traderInfo = trader
    
    console.log('\n' + '='.repeat(80))
    console.log('USER WALLET AND TRADER INFO')
    console.log('='.repeat(80))
    console.log(`Wallet: ${userInfo.polymarket_account_address}`)
    if (trader) {
      console.log(`Trader ID: ${trader.id}`)
      console.log(`Username: ${trader.username || 'N/A'}`)
    }
  }

  // =========================================================================
  // 3. SELL ORDERS ANALYSIS
  // =========================================================================
  if (traderInfo) {
    const { data: sellAnalysis } = await supabase
      .from('orders')
      .select('order_id, side, copy_user_id, trader_id, status, filled_size, size, price, user_exit_price, current_price, amount_invested')
      .or(`copy_user_id.eq.${USER_ID},trader_id.eq.${traderInfo.id}`)
      .eq('side', 'SELL')

    const withCopyUser = sellAnalysis?.filter(o => o.copy_user_id === USER_ID) || []
    const withoutCopyUser = sellAnalysis?.filter(o => o.copy_user_id !== USER_ID) || []

    console.log('\n' + '='.repeat(80))
    console.log('2. SELL ORDERS WITH/WITHOUT copy_user_id')
    console.log('='.repeat(80))
    console.log(`SELL orders WITH copy_user_id: ${withCopyUser.length}`)
    console.log(`SELL orders WITHOUT copy_user_id (via trader_id): ${withoutCopyUser.length}`)
    console.log(`Total SELL orders: ${sellAnalysis?.length || 0}`)
  }

  // =========================================================================
  // 4. SAMPLE SELL ORDERS
  // =========================================================================
  const { data: sampleSells } = await supabase
    .from('orders')
    .select(`
      order_id,
      side,
      copy_user_id,
      trader_id,
      market_id,
      outcome,
      price,
      price_when_copied,
      user_exit_price,
      current_price,
      filled_size,
      size,
      amount_invested,
      roi,
      status,
      created_at
    `)
    .eq('copy_user_id', USER_ID)
    .eq('side', 'SELL')
    .order('created_at', { ascending: false })
    .limit(10)

  printSection('3. SAMPLE SELL ORDERS (Last 10 by copy_user_id)', sampleSells || [])

  // =========================================================================
  // 5. SAMPLE BUY ORDERS
  // =========================================================================
  const { data: sampleBuys } = await supabase
    .from('orders')
    .select(`
      order_id,
      side,
      market_id,
      outcome,
      price,
      price_when_copied,
      filled_size,
      size,
      amount_invested,
      status,
      created_at
    `)
    .eq('copy_user_id', USER_ID)
    .eq('side', 'BUY')
    .order('created_at', { ascending: false })
    .limit(10)

  printSection('4. SAMPLE BUY ORDERS (Last 10)', sampleBuys || [])

  // =========================================================================
  // 6. INVESTMENT VS PROCEEDS CALCULATION
  // =========================================================================
  const { data: buyOrders } = await supabase
    .from('orders')
    .select('filled_size, size, price, price_when_copied, amount_invested, status')
    .eq('copy_user_id', USER_ID)
    .eq('side', 'BUY')

  const { data: sellOrders } = await supabase
    .from('orders')
    .select('filled_size, size, price, user_exit_price, current_price, amount_invested, status')
    .eq('copy_user_id', USER_ID)
    .eq('side', 'SELL')

  // Calculate totals
  const matchedBuys = buyOrders?.filter(o => o.status === 'MATCHED') || []
  const matchedSells = sellOrders?.filter(o => o.status === 'MATCHED') || []

  const totalInvested = matchedBuys.reduce((sum, o) => {
    const invested = o.amount_invested || (o.price || o.price_when_copied || 0) * (o.filled_size || o.size || 0)
    return sum + invested
  }, 0)

  const totalProceeds = matchedSells.reduce((sum, o) => {
    const exitPrice = o.user_exit_price || o.current_price || o.price || 0
    const shares = o.filled_size || o.size || 0
    return sum + (exitPrice * shares)
  }, 0)

  console.log('\n' + '='.repeat(80))
  console.log('5. INVESTMENT VS PROCEEDS')
  console.log('='.repeat(80))
  console.log(`BUY Orders (MATCHED): ${matchedBuys.length}`)
  console.log(`SELL Orders (MATCHED): ${matchedSells.length}`)
  console.log(`Total Invested: $${totalInvested.toFixed(2)}`)
  console.log(`Total Proceeds: $${totalProceeds.toFixed(2)}`)
  console.log(`Net P&L: $${(totalProceeds - totalInvested).toFixed(2)}`)
  if (totalInvested > 0) {
    const roi = ((totalProceeds / totalInvested - 1) * 100).toFixed(2)
    console.log(`Overall ROI: ${roi}%`)
  }

  // =========================================================================
  // 7. STATUS BREAKDOWN
  // =========================================================================
  const { data: allOrders } = await supabase
    .from('orders')
    .select('side, status, filled_size, size, price, amount_invested')
    .eq('copy_user_id', USER_ID)

  const statusBreakdown: Record<string, any> = {}
  allOrders?.forEach(o => {
    const key = `${o.side}-${o.status}`
    if (!statusBreakdown[key]) {
      statusBreakdown[key] = {
        side: o.side,
        status: o.status,
        count: 0,
        total_shares: 0,
        total_usd: 0
      }
    }
    statusBreakdown[key].count++
    statusBreakdown[key].total_shares += (o.filled_size || o.size || 0)
    statusBreakdown[key].total_usd += (o.amount_invested || (o.price * (o.filled_size || o.size || 0)) || 0)
  })

  printSection('6. ORDER STATUS BREAKDOWN', Object.values(statusBreakdown))

  // =========================================================================
  // 8. MARKET-LEVEL MATCHING
  // =========================================================================
  const marketPositions: Record<string, any> = {}
  
  allOrders?.forEach(o => {
    if (o.status !== 'MATCHED') return
    
    const key = `${o.market_id}-${o.outcome}`
    if (!marketPositions[key]) {
      marketPositions[key] = {
        market_id: o.market_id,
        outcome: o.outcome,
        buy_count: 0,
        sell_count: 0,
        shares_bought: 0,
        shares_sold: 0,
        invested: 0,
        proceeds: 0
      }
    }
    
    const shares = o.filled_size || o.size || 0
    
    if (o.side === 'BUY') {
      marketPositions[key].buy_count++
      marketPositions[key].shares_bought += shares
      marketPositions[key].invested += (o.amount_invested || o.price * shares || 0)
    } else if (o.side === 'SELL') {
      marketPositions[key].sell_count++
      marketPositions[key].shares_sold += shares
      const exitPrice = (o as any).user_exit_price || (o as any).current_price || o.price || 0
      marketPositions[key].proceeds += (exitPrice * shares)
    }
  })

  const marketPositionArray = Object.values(marketPositions).map((mp: any) => ({
    ...mp,
    market_id: mp.market_id?.substring(0, 30) + '...',
    net_position: mp.shares_bought - mp.shares_sold,
    pnl: mp.proceeds - mp.invested,
    shares_bought: mp.shares_bought.toFixed(2),
    shares_sold: mp.shares_sold.toFixed(2),
    invested: mp.invested.toFixed(2),
    proceeds: mp.proceeds.toFixed(2)
  })).sort((a, b) => parseFloat(b.invested) - parseFloat(a.invested))

  printSection('7. MARKET-LEVEL MATCHING (Top 20)', marketPositionArray.slice(0, 20))

  console.log('\n' + '='.repeat(80))
  console.log('ANALYSIS COMPLETE')
  console.log('='.repeat(80) + '\n')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
