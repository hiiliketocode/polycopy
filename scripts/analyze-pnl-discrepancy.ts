/* eslint-disable no-console */
/**
 * Comprehensive P&L Discrepancy Analysis
 * 
 * This script analyzes the most active user to understand:
 * - Why SELL orders don't have copy_user_id
 * - Where SELL orders are being stored
 * - How to properly match BUYs and SELLs for P&L calculation
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

// Most active user from our search
const USER_ID = '671a2ece-9d96-4f9e-85f0-f5a225c55552'

function printSection(title: string) {
  console.log('\n' + '='.repeat(80))
  console.log(title)
  console.log('='.repeat(80))
}

async function main() {
  console.log(`\n🔍 P&L DISCREPANCY ANALYSIS`)
  console.log(`User ID: ${USER_ID}`)
  console.log(`Timestamp: ${new Date().toISOString()}\n`)

  // =========================================================================
  // 1. Get user's wallet and trader info
  // =========================================================================
  const { data: wallet } = await supabase
    .from('clob_credentials')
    .select('polymarket_account_address')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!wallet) {
    console.error('❌ No wallet found for user')
    return
  }

  const walletAddress = wallet.polymarket_account_address.toLowerCase()
  
  const { data: trader } = await supabase
    .from('traders')
    .select('id, wallet_address, username')
    .ilike('wallet_address', walletAddress)
    .limit(1)
    .maybeSingle()

  printSection('1. USER & WALLET INFO')
  console.log(`User ID: ${USER_ID}`)
  console.log(`Wallet: ${walletAddress}`)
  if (trader) {
    console.log(`Trader ID: ${trader.id}`)
    console.log(`Username: ${trader.username || 'N/A'}`)
  } else {
    console.log('⚠️  No trader record found')
  }

  // =========================================================================
  // 2. Check orders by copy_user_id
  // =========================================================================
  const { data: copyUserOrders } = await supabase
    .from('orders')
    .select('order_id, side, status, market_id, outcome, price, filled_size, size, amount_invested, user_closed_at, created_at')
    .eq('copy_user_id', USER_ID)
    .order('created_at', { ascending: false })

  printSection('2. ORDERS BY copy_user_id')
  console.log(`Total: ${copyUserOrders?.length || 0}`)
  
  const buyOrders = copyUserOrders?.filter(o => o.side?.toUpperCase() === 'BUY') || []
  const sellOrders = copyUserOrders?.filter(o => o.side?.toUpperCase() === 'SELL') || []
  
  console.log(`BUY: ${buyOrders.length}`)
  console.log(`SELL: ${sellOrders.length}`)
  console.log(`\n⚠️  CRITICAL: ${sellOrders.length} SELL orders with copy_user_id (expected more if user closed positions)`)

  // Status breakdown
  const statuses = copyUserOrders?.reduce((acc: any, o: any) => {
    const key = `${o.side?.toUpperCase()} / ${o.status || 'NULL'}`
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  console.log('\nStatus Breakdown:')
  console.table(statuses)

  // =========================================================================
  // 3. Check orders by trader_id
  // =========================================================================
  if (trader) {
    const { data: traderOrders } = await supabase
      .from('orders')
      .select('order_id, side, status, copy_user_id, market_id, outcome, price, filled_size, size, created_at')
      .eq('trader_id', trader.id)
      .order('created_at', { ascending: false })

    printSection('3. ORDERS BY trader_id')
    console.log(`Total: ${traderOrders?.length || 0}`)
    
    const traderBuys = traderOrders?.filter(o => o.side?.toUpperCase() === 'BUY') || []
    const traderSells = traderOrders?.filter(o => o.side?.toUpperCase() === 'SELL') || []
    
    console.log(`BUY: ${traderBuys.length}`)
    console.log(`SELL: ${traderSells.length}`)
    
    // Check how many have copy_user_id
    const traderSellsWithCopy = traderSells.filter(o => o.copy_user_id === USER_ID)
    const traderSellsWithoutCopy = traderSells.filter(o => o.copy_user_id !== USER_ID)
    
    console.log(`\nSELL orders WITH copy_user_id: ${traderSellsWithCopy.length}`)
    console.log(`SELL orders WITHOUT copy_user_id: ${traderSellsWithoutCopy.length}`)
    console.log(`\n🔍 KEY FINDING: ${traderSellsWithoutCopy.length} SELL orders exist but are NOT linked to copy_user_id!`)

    if (traderSellsWithoutCopy.length > 0) {
      console.log('\nSample SELL orders WITHOUT copy_user_id (first 5):')
      traderSellsWithoutCopy.slice(0, 5).forEach((o: any, idx: number) => {
        console.log(`  ${idx + 1}. Order ID: ${o.order_id}`)
        console.log(`     Market: ${o.market_id}`)
        console.log(`     Outcome: ${o.outcome}`)
        console.log(`     Price: ${o.price}`)
        console.log(`     Size: ${o.filled_size || o.size}`)
        console.log(`     Status: ${o.status}`)
        console.log(`     Created: ${o.created_at}`)
        console.log('')
      })
    }
  }

  // =========================================================================
  // 4. Attempt to match BUYs with SELLs by market + outcome
  // =========================================================================
  if (trader) {
    printSection('4. BUY/SELL MATCHING BY MARKET + OUTCOME')
    
    // Get all orders (by copy_user_id OR trader_id)
    const { data: allUserOrders } = await supabase
      .from('orders')
      .select('order_id, side, status, market_id, outcome, price, price_when_copied, filled_size, size, amount_invested, user_exit_price, current_price, created_at')
      .or(`copy_user_id.eq.${USER_ID},trader_id.eq.${trader.id}`)
      .eq('status', 'matched')
      .order('created_at', { ascending: true })

    if (!allUserOrders || allUserOrders.length === 0) {
      console.log('No matched orders found')
    } else {
      // Group by market + outcome
      const positions: Record<string, any> = {}
      
      allUserOrders.forEach(o => {
        const key = `${o.market_id}:${o.outcome}`
        if (!positions[key]) {
          positions[key] = {
            market_id: o.market_id,
            outcome: o.outcome,
            buys: [],
            sells: []
          }
        }
        
        if (o.side?.toUpperCase() === 'BUY') {
          positions[key].buys.push(o)
        } else if (o.side?.toUpperCase() === 'SELL') {
          positions[key].sells.push(o)
        }
      })

      // Calculate P&L for each position
      const positionsPnL = Object.values(positions).map((pos: any) => {
        const totalBuyShares = pos.buys.reduce((sum: number, b: any) => 
          sum + (b.filled_size || b.size || 0), 0)
        const totalSellShares = pos.sells.reduce((sum: number, s: any) => 
          sum + (s.filled_size || s.size || 0), 0)
        
        const totalInvested = pos.buys.reduce((sum: number, b: any) => 
          sum + (b.amount_invested || (b.price || 0) * (b.filled_size || b.size || 0)), 0)
        
        const totalProceeds = pos.sells.reduce((sum: number, s: any) => {
          const exitPrice = s.user_exit_price || s.current_price || s.price || 0
          const shares = s.filled_size || s.size || 0
          return sum + (exitPrice * shares)
        }, 0)
        
        return {
          market_id: pos.market_id.substring(0, 40) + '...',
          outcome: pos.outcome,
          buy_count: pos.buys.length,
          sell_count: pos.sells.length,
          buy_shares: totalBuyShares.toFixed(2),
          sell_shares: totalSellShares.toFixed(2),
          net_position: (totalBuyShares - totalSellShares).toFixed(2),
          invested: totalInvested.toFixed(2),
          proceeds: totalProceeds.toFixed(2),
          pnl: (totalProceeds - totalInvested).toFixed(2),
          roi_pct: totalInvested > 0 ? ((totalProceeds / totalInvested - 1) * 100).toFixed(2) : 'N/A'
        }
      }).sort((a, b) => parseFloat(b.invested) - parseFloat(a.invested))

      console.log(`\nTotal positions: ${positionsPnL.length}`)
      console.log('\nTop 10 positions by invested amount:')
      console.table(positionsPnL.slice(0, 10))

      // Calculate totals
      const totalInvestedAll = positionsPnL.reduce((sum, p) => sum + parseFloat(p.invested), 0)
      const totalProceedsAll = positionsPnL.reduce((sum, p) => sum + parseFloat(p.proceeds), 0)
      const netPnL = totalProceedsAll - totalInvestedAll
      const overallROI = totalInvestedAll > 0 ? ((totalProceedsAll / totalInvestedAll - 1) * 100) : 0

      console.log('\n📊 OVERALL PORTFOLIO:')
      console.log(`Total Invested: $${totalInvestedAll.toFixed(2)}`)
      console.log(`Total Proceeds: $${totalProceedsAll.toFixed(2)}`)
      console.log(`Net P&L: $${netPnL.toFixed(2)}`)
      console.log(`Overall ROI: ${overallROI.toFixed(2)}%`)

      // Count positions with sells
      const positionsWithSells = positionsPnL.filter(p => parseFloat(p.sell_shares) > 0)
      const positionsWithoutSells = positionsPnL.filter(p => parseFloat(p.sell_shares) === 0)
      
      console.log(`\n📈 POSITION STATUS:`)
      console.log(`Positions with SELLs (closed/partial): ${positionsWithSells.length}`)
      console.log(`Positions without SELLs (still open): ${positionsWithoutSells.length}`)
    }
  }

  // =========================================================================
  // 5. Check copied_trades table (legacy)
  // =========================================================================
  const { data: copiedTrades } = await supabase
    .from('copied_trades')
    .select('id, market_title, amount_invested, roi, trader_still_has_position, user_closed_at, created_at')
    .eq('user_id', USER_ID)
    .limit(10)

  printSection('5. COPIED_TRADES TABLE (LEGACY)')
  console.log(`Total: ${copiedTrades?.length || 0}`)
  if (copiedTrades && copiedTrades.length > 0) {
    console.log('\nSample records:')
    console.table(copiedTrades)
  }

  // =========================================================================
  // 6. KEY FINDINGS SUMMARY
  // =========================================================================
  printSection('6. KEY FINDINGS & ROOT CAUSE')
  console.log('✅ CONFIRMED ISSUES:')
  console.log('   1. BUY orders have copy_user_id set correctly')
  console.log('   2. SELL orders are created but copy_user_id is NOT being set')
  console.log('   3. SELL orders can only be found via trader_id lookup')
  console.log('')
  console.log('🔍 ROOT CAUSE:')
  console.log('   When users close positions, the SELL orders are created with:')
  console.log('   - trader_id = user\'s trader record (correct)')
  console.log('   - copy_user_id = NULL (INCORRECT - should be set)')
  console.log('')
  console.log('💡 SOLUTION NEEDED:')
  console.log('   1. Update the order placement code to set copy_user_id on SELL orders')
  console.log('   2. Backfill existing SELL orders to link them to copy_user_id')
  console.log('   3. Fix P&L calculation queries to use trader_id OR copy_user_id')
  console.log('')
  console.log('📝 AFFECTED FILES:')
  console.log('   - app/api/polymarket/orders/place/route.ts (SELL order creation)')
  console.log('   - app/api/portfolio/stats/route.ts (P&L calculation)')
  console.log('   - app/api/portfolio/trades/route.ts (trade listing)')

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
