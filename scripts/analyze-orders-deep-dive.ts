/* eslint-disable no-console */
/**
 * Deep Dive Orders Analysis for P&L Discrepancy
 * 
 * This script performs a comprehensive analysis of orders data to understand:
 * - Why some orders have different statuses
 * - How SELL orders are being tracked (or not tracked)
 * - Whether there's a mismatch in order attribution
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

function printSection(title: string, data?: any) {
  console.log('\n' + '='.repeat(80))
  console.log(title)
  console.log('='.repeat(80))
  if (data !== undefined) {
    console.log(data)
  }
}

async function main() {
  console.log(`\n🔍 DEEP DIVE ORDERS ANALYSIS FOR USER: ${USER_ID}`)
  console.log(`Timestamp: ${new Date().toISOString()}\n`)

  // =========================================================================
  // 1. Get user's wallet and trader_id first
  // =========================================================================
  const { data: userInfo } = await supabase
    .from('clob_credentials')
    .select('polymarket_account_address, user_id')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!userInfo?.polymarket_account_address) {
    console.error('No wallet found for user')
    return
  }

  const walletAddress = userInfo.polymarket_account_address.toLowerCase()
  
  const { data: traderInfo } = await supabase
    .from('traders')
    .select('id, wallet_address, username')
    .ilike('wallet_address', walletAddress)
    .limit(1)
    .maybeSingle()

  printSection('USER & WALLET INFO')
  console.log(`User ID: ${USER_ID}`)
  console.log(`Wallet Address: ${walletAddress}`)
  if (traderInfo) {
    console.log(`Trader ID: ${traderInfo.id}`)
    console.log(`Username: ${traderInfo.username || 'N/A'}`)
  } else {
    console.log('⚠️  No trader record found for this wallet')
  }

  // =========================================================================
  // 2. Check ALL orders by copy_user_id (regardless of status)
  // =========================================================================
  const { data: copyUserOrders, error: copyUserError } = await supabase
    .from('orders')
    .select('*')
    .eq('copy_user_id', USER_ID)
    .order('created_at', { ascending: false })

  printSection('ORDERS BY copy_user_id (ALL STATUSES)')
  console.log(`Total orders: ${copyUserOrders?.length || 0}`)
  
  if (copyUserError) {
    console.error('Error fetching copy_user orders:', copyUserError)
  }

  if (copyUserOrders && copyUserOrders.length > 0) {
    console.log('\nBreakdown by SIDE:')
    const bySide = copyUserOrders.reduce((acc: any, o: any) => {
      const side = o.side?.toUpperCase() || 'UNKNOWN'
      acc[side] = (acc[side] || 0) + 1
      return acc
    }, {})
    console.table(bySide)

    console.log('\nBreakdown by STATUS:')
    const byStatus = copyUserOrders.reduce((acc: any, o: any) => {
      const status = o.status || 'NULL'
      acc[status] = (acc[status] || 0) + 1
      return acc
    }, {})
    console.table(byStatus)

    console.log('\nBreakdown by SIDE + STATUS:')
    const bySideStatus = copyUserOrders.reduce((acc: any, o: any) => {
      const key = `${o.side?.toUpperCase() || 'UNKNOWN'} / ${o.status || 'NULL'}`
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    console.table(bySideStatus)

    console.log('\nDetailed Order List:')
    copyUserOrders.forEach((o: any, idx: number) => {
      console.log(`\n--- Order ${idx + 1} ---`)
      console.log(`Order ID: ${o.order_id}`)
      console.log(`Side: ${o.side}`)
      console.log(`Status: ${o.status}`)
      console.log(`Market ID: ${o.market_id}`)
      console.log(`Outcome: ${o.outcome}`)
      console.log(`Price: ${o.price}`)
      console.log(`Price When Copied: ${o.price_when_copied}`)
      console.log(`Size: ${o.size}`)
      console.log(`Filled Size: ${o.filled_size}`)
      console.log(`Amount Invested: ${o.amount_invested}`)
      console.log(`User Exit Price: ${o.user_exit_price}`)
      console.log(`Current Price: ${o.current_price}`)
      console.log(`ROI: ${o.roi}`)
      console.log(`User Closed At: ${o.user_closed_at}`)
      console.log(`Created At: ${o.created_at}`)
      console.log(`Trade Method: ${o.trade_method}`)
    })
  }

  // =========================================================================
  // 3. Check orders by trader_id (if trader exists)
  // =========================================================================
  if (traderInfo) {
    const { data: traderOrders, error: traderError } = await supabase
      .from('orders')
      .select('order_id, side, status, copy_user_id, market_id, outcome, price, filled_size, size, created_at')
      .eq('trader_id', traderInfo.id)
      .order('created_at', { ascending: false })

    printSection('ORDERS BY trader_id')
    console.log(`Total orders: ${traderOrders?.length || 0}`)
    
    if (traderError) {
      console.error('Error fetching trader orders:', traderError)
    }

    if (traderOrders && traderOrders.length > 0) {
      console.log('\nBreakdown by SIDE:')
      const bySide = traderOrders.reduce((acc: any, o: any) => {
        const side = o.side?.toUpperCase() || 'UNKNOWN'
        acc[side] = (acc[side] || 0) + 1
        return acc
      }, {})
      console.table(bySide)

      console.log('\nOrders with copy_user_id set:')
      const withCopyUser = traderOrders.filter((o: any) => o.copy_user_id)
      console.log(`Count: ${withCopyUser.length}`)

      console.log('\nOrders WITHOUT copy_user_id:')
      const withoutCopyUser = traderOrders.filter((o: any) => !o.copy_user_id)
      console.log(`Count: ${withoutCopyUser.length}`)
      
      if (withoutCopyUser.length > 0 && withoutCopyUser.length <= 10) {
        console.log('\nSample orders without copy_user_id:')
        withoutCopyUser.forEach((o: any, idx: number) => {
          console.log(`  ${idx + 1}. ${o.side} - Market: ${o.market_id?.substring(0, 30)}..., Status: ${o.status}, Created: ${o.created_at}`)
        })
      }
    }
  }

  // =========================================================================
  // 4. Check the orders_copy_enriched view
  // =========================================================================
  const { data: enrichedOrders, error: enrichedError } = await supabase
    .from('orders_copy_enriched')
    .select('*')
    .eq('copy_user_id', USER_ID)
    .order('created_at', { ascending: false })

  printSection('ORDERS_COPY_ENRICHED VIEW')
  console.log(`Total orders: ${enrichedOrders?.length || 0}`)
  
  if (enrichedError) {
    console.error('Error fetching enriched orders:', enrichedError)
  }

  if (enrichedOrders && enrichedOrders.length > 0) {
    console.log('\nEnriched Order Details:')
    enrichedOrders.forEach((o: any, idx: number) => {
      console.log(`\n--- Enriched Order ${idx + 1} ---`)
      console.log(`Side: ${o.side}`)
      console.log(`Status: ${o.status}`)
      console.log(`Entry Price: ${o.entry_price}`)
      console.log(`Entry Size: ${o.entry_size}`)
      console.log(`Invested USD: ${o.invested_usd}`)
      console.log(`Exit Price: ${o.exit_price}`)
      console.log(`P&L %: ${o.pnl_pct}`)
      console.log(`P&L USD: ${o.pnl_usd}`)
      console.log(`Market Resolved: ${o.market_resolved}`)
      console.log(`User Closed At: ${o.user_closed_at}`)
    })
  }

  // =========================================================================
  // 5. Check if there are any copied_trades records
  // =========================================================================
  const { data: copiedTrades, error: copiedTradesError } = await supabase
    .from('copied_trades')
    .select('*')
    .eq('user_id', USER_ID)

  printSection('COPIED_TRADES TABLE')
  console.log(`Total copied trades: ${copiedTrades?.length || 0}`)
  
  if (copiedTradesError) {
    console.error('Error fetching copied trades:', copiedTradesError)
  }

  if (copiedTrades && copiedTrades.length > 0) {
    console.log('\nSample copied trades:')
    copiedTrades.slice(0, 5).forEach((ct: any, idx: number) => {
      console.log(`\n--- Copied Trade ${idx + 1} ---`)
      console.log(`ID: ${ct.id}`)
      console.log(`Market Title: ${ct.market_title}`)
      console.log(`Amount Invested: ${ct.amount_invested}`)
      console.log(`Price When Copied: ${ct.price_when_copied}`)
      console.log(`ROI: ${ct.roi}`)
      console.log(`Created At: ${ct.created_at}`)
    })
  }

  // =========================================================================
  // 6. Check portfolio summary
  // =========================================================================
  const { data: portfolioSummary } = await supabase
    .from('user_portfolio_summary')
    .select('*')
    .eq('user_id', USER_ID)
    .maybeSingle()

  printSection('USER_PORTFOLIO_SUMMARY')
  if (portfolioSummary) {
    console.log(JSON.stringify(portfolioSummary, null, 2))
  } else {
    console.log('No portfolio summary found')
  }

  // =========================================================================
  // 7. Summary
  // =========================================================================
  printSection('SUMMARY')
  console.log(`✓ User has wallet: ${walletAddress}`)
  console.log(`✓ Orders by copy_user_id: ${copyUserOrders?.length || 0}`)
  if (traderInfo) {
    console.log(`✓ Orders by trader_id: ${(await supabase.from('orders').select('order_id', { count: 'exact' }).eq('trader_id', traderInfo.id)).count || 0}`)
  }
  console.log(`✓ Copied trades (legacy): ${copiedTrades?.length || 0}`)
  console.log(`✓ Portfolio summary exists: ${portfolioSummary ? 'Yes' : 'No'}`)

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
