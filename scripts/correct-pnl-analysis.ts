/* eslint-disable no-console */
/**
 * CORRECT P&L Analysis Script
 * 
 * This script calculates P&L correctly by understanding that:
 * 1. No SELL orders are created (metadata-based position tracking)
 * 2. Closed positions have user_closed_at and user_exit_price set
 * 3. Open positions use current_price
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

// Most active user
const USER_ID = '671a2ece-9d96-4f9e-85f0-f5a225c55552'

function printSection(title: string) {
  console.log('\n' + '='.repeat(80))
  console.log(title)
  console.log('='.repeat(80))
}

async function main() {
  console.log(`\n🎯 CORRECT P&L ANALYSIS`)
  console.log(`User ID: ${USER_ID}`)
  console.log(`Timestamp: ${new Date().toISOString()}\n`)

  // =========================================================================
  // 1. Fetch ALL orders for the user
  // =========================================================================
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .eq('copy_user_id', USER_ID)
    .eq('status', 'matched')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching orders:', error)
    return
  }

  if (!orders || orders.length === 0) {
    console.log('No matched orders found for user')
    return
  }

  printSection('1. ORDER SUMMARY')
  console.log(`Total matched orders: ${orders.length}`)

  // =========================================================================
  // 2. Classify orders by status
  // =========================================================================
  const closedByUser = orders.filter(o => o.user_closed_at !== null)
  const closedByTrader = orders.filter(o => o.user_closed_at === null && o.trader_still_has_position === false)
  const stillOpen = orders.filter(o => o.user_closed_at === null && o.trader_still_has_position !== false)

  console.log(`\nPosition Status:`)
  console.log(`  Closed by User: ${closedByUser.length}`)
  console.log(`  Closed by Trader (not user): ${closedByTrader.length}`)
  console.log(`  Still Open: ${stillOpen.length}`)

  // =========================================================================
  // 3. Calculate P&L correctly
  // =========================================================================
  printSection('2. P&L CALCULATION (CORRECT METHOD)')

  let totalInvested = 0
  let realizedPnL = 0
  let unrealizedPnL = 0
  let closedPositionsProceeds = 0
  let openPositionsValue = 0

  const dataQualityIssues = {
    missingInvested: 0,
    missingExitPrice: 0,
    missingCurrentPrice: 0
  }

  // Process each order
  orders.forEach(order => {
    const invested = order.amount_invested || (order.price * (order.filled_size || order.size || 0))
    
    if (!invested || invested === 0) {
      dataQualityIssues.missingInvested++
      return
    }

    totalInvested += invested
    const shares = order.filled_size || order.size || 0

    if (order.user_closed_at) {
      // CLOSED POSITION: Use exit price
      if (!order.user_exit_price) {
        dataQualityIssues.missingExitPrice++
        return
      }
      
      const proceeds = order.user_exit_price * shares
      closedPositionsProceeds += proceeds
      realizedPnL += (proceeds - invested)
    } else {
      // OPEN POSITION: Use current price
      if (!order.current_price) {
        dataQualityIssues.missingCurrentPrice++
        // Skip this order in P&L calc
        return
      }
      
      const currentValue = order.current_price * shares
      openPositionsValue += currentValue
      unrealizedPnL += (currentValue - invested)
    }
  })

  const totalPnL = realizedPnL + unrealizedPnL
  const overallROI = totalInvested > 0 ? ((totalPnL / totalInvested) * 100) : 0

  console.log('\n💰 P&L BREAKDOWN:')
  console.log(`\nInvestment:`)
  console.log(`  Total Invested:           $${totalInvested.toFixed(2)}`)
  console.log(`\nRealized (Closed Positions):`)
  console.log(`  Closed Positions:         ${closedByUser.length}`)
  console.log(`  Proceeds from Sales:      $${closedPositionsProceeds.toFixed(2)}`)
  console.log(`  Realized P&L:             $${realizedPnL.toFixed(2)}`)
  console.log(`\nUnrealized (Open Positions):`)
  console.log(`  Open Positions:           ${stillOpen.length}`)
  console.log(`  Current Value:            $${openPositionsValue.toFixed(2)}`)
  console.log(`  Unrealized P&L:           $${unrealizedPnL.toFixed(2)}`)
  console.log(`\nTotal:`)
  console.log(`  Total P&L:                $${totalPnL.toFixed(2)}`)
  console.log(`  Overall ROI:              ${overallROI.toFixed(2)}%`)

  // =========================================================================
  // 4. Data Quality Check
  // =========================================================================
  if (dataQualityIssues.missingInvested > 0 || 
      dataQualityIssues.missingExitPrice > 0 || 
      dataQualityIssues.missingCurrentPrice > 0) {
    console.log(`\n⚠️  DATA QUALITY ISSUES:`)
    if (dataQualityIssues.missingInvested > 0) {
      console.log(`  Orders missing amount_invested: ${dataQualityIssues.missingInvested}`)
    }
    if (dataQualityIssues.missingExitPrice > 0) {
      console.log(`  Closed orders missing user_exit_price: ${dataQualityIssues.missingExitPrice}`)
    }
    if (dataQualityIssues.missingCurrentPrice > 0) {
      console.log(`  Open orders missing current_price: ${dataQualityIssues.missingCurrentPrice}`)
    }
    console.log(`\n  These orders were excluded from P&L calculation.`)
  }

  // =========================================================================
  // 5. Sample Closed Positions
  // =========================================================================
  if (closedByUser.length > 0) {
    printSection('3. SAMPLE CLOSED POSITIONS (Top 5 by P&L)')

    const closedWithPnL = closedByUser
      .filter(o => o.amount_invested && o.user_exit_price)
      .map(o => {
        const invested = o.amount_invested
        const shares = o.filled_size || o.size || 0
        const proceeds = o.user_exit_price * shares
        const pnl = proceeds - invested
        const roi = invested > 0 ? ((proceeds / invested - 1) * 100) : 0
        return {
          market_id: o.market_id?.substring(0, 40) + '...',
          outcome: o.outcome,
          invested: invested.toFixed(2),
          proceeds: proceeds.toFixed(2),
          pnl: pnl.toFixed(2),
          roi: roi.toFixed(2) + '%',
          closed_at: new Date(o.user_closed_at).toLocaleDateString()
        }
      })
      .sort((a, b) => parseFloat(b.pnl) - parseFloat(a.pnl))
      .slice(0, 5)

    console.table(closedWithPnL)
  }

  // =========================================================================
  // 6. Sample Open Positions
  // =========================================================================
  if (stillOpen.length > 0) {
    printSection('4. SAMPLE OPEN POSITIONS (Top 5 by Unrealized P&L)')

    const openWithPnL = stillOpen
      .filter(o => o.amount_invested && o.current_price)
      .map(o => {
        const invested = o.amount_invested
        const shares = o.filled_size || o.size || 0
        const currentValue = o.current_price * shares
        const pnl = currentValue - invested
        const roi = invested > 0 ? ((currentValue / invested - 1) * 100) : 0
        return {
          market_id: o.market_id?.substring(0, 40) + '...',
          outcome: o.outcome,
          invested: invested.toFixed(2),
          current_value: currentValue.toFixed(2),
          unrealized_pnl: pnl.toFixed(2),
          unrealized_roi: roi.toFixed(2) + '%',
          trader_in: o.trader_still_has_position ? 'Yes' : 'No'
        }
      })
      .sort((a, b) => parseFloat(b.unrealized_pnl) - parseFloat(a.unrealized_pnl))
      .slice(0, 5)

    console.table(openWithPnL)
  }

  // =========================================================================
  // 7. Compare with orders_copy_enriched view
  // =========================================================================
  printSection('5. VERIFICATION: Compare with orders_copy_enriched View')

  const { data: enrichedOrders } = await supabase
    .from('orders_copy_enriched')
    .select('order_id, invested_usd, pnl_usd, pnl_pct, exit_price')
    .eq('copy_user_id', USER_ID)
    .eq('status', 'matched')
    .limit(5)

  if (enrichedOrders && enrichedOrders.length > 0) {
    console.log('\nSample from orders_copy_enriched view:')
    const viewSample = enrichedOrders.map(o => ({
      order_id: o.order_id?.substring(0, 20) + '...',
      invested: o.invested_usd?.toFixed(2) || 'N/A',
      exit_price: o.exit_price?.toFixed(3) || 'N/A',
      pnl_usd: o.pnl_usd?.toFixed(2) || 'N/A',
      pnl_pct: o.pnl_pct?.toFixed(2) + '%' || 'N/A'
    }))
    console.table(viewSample)

    // Calculate total from view
    const { data: viewTotal } = await supabase
      .from('orders_copy_enriched')
      .select('invested_usd, pnl_usd')
      .eq('copy_user_id', USER_ID)
      .eq('status', 'matched')

    if (viewTotal) {
      const viewTotalInvested = viewTotal.reduce((sum, o) => sum + (o.invested_usd || 0), 0)
      const viewTotalPnL = viewTotal.reduce((sum, o) => sum + (o.pnl_usd || 0), 0)
      
      console.log('\n📊 COMPARISON:')
      console.log(`Raw Calculation:`)
      console.log(`  Total Invested: $${totalInvested.toFixed(2)}`)
      console.log(`  Total P&L:      $${totalPnL.toFixed(2)}`)
      console.log(`\nView Calculation:`)
      console.log(`  Total Invested: $${viewTotalInvested.toFixed(2)}`)
      console.log(`  Total P&L:      $${viewTotalPnL.toFixed(2)}`)
      console.log(`\nDifference:`)
      console.log(`  Invested Diff:  $${(totalInvested - viewTotalInvested).toFixed(2)}`)
      console.log(`  P&L Diff:       $${(totalPnL - viewTotalPnL).toFixed(2)}`)

      const diffThreshold = 1.0 // $1 threshold for rounding
      if (Math.abs(totalPnL - viewTotalPnL) > diffThreshold) {
        console.log(`\n⚠️  DISCREPANCY DETECTED: P&L difference exceeds $${diffThreshold}`)
        console.log(`    This suggests the view calculation may have different logic.`)
      } else {
        console.log(`\n✅ CALCULATIONS MATCH (within $${diffThreshold} threshold)`)
      }
    }
  }

  printSection('ANALYSIS COMPLETE')
  console.log(`✅ Analyzed ${orders.length} orders`)
  console.log(`📊 Total P&L: $${totalPnL.toFixed(2)} (${overallROI.toFixed(2)}% ROI)`)
  console.log(`💰 Realized: $${realizedPnL.toFixed(2)} from ${closedByUser.length} closed positions`)
  console.log(`📈 Unrealized: $${unrealizedPnL.toFixed(2)} from ${stillOpen.length} open positions`)
  console.log('')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
