/* eslint-disable no-console */
// Quick script to refresh portfolio stats for a single user
import { execSync } from 'child_process'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) dotenv.config({ path: envPath })

const USER_ID = process.argv[2] || '490723a6-e0be-4a7a-9796-45d4d09aa1bd'

// Import and run the backfill script's calculation function
// We'll modify the backfill script temporarily to only process this user
async function refreshUser() {
  console.log(`🔄 Refreshing portfolio stats for user: ${USER_ID}\n`)
  
  // Read the backfill script
  const backfillScript = fs.readFileSync(
    path.join(process.cwd(), 'scripts/backfill-portfolio-summaries.ts'),
    'utf-8'
  )
  
  // Create a temporary script that only processes this user
  const tempScript = backfillScript.replace(
    /async function backfillPortfolioSummaries\(\) \{[\s\S]*?\n\}/,
    `async function backfillPortfolioSummaries() {
  console.log('🚀 Refreshing portfolio summary for single user...\\n')
  const userId = '${USER_ID}'
  
  try {
    const stats = await calculatePortfolioStats(userId, true)
    
    if (!stats) {
      console.log('⏭️  No trades found, skipped')
      return
    }

    // Save to cache
    const { error: saveError } = await supabase.rpc('upsert_user_portfolio_summary', {
      p_user_id: userId,
      p_total_pnl: stats.totalPnl,
      p_realized_pnl: stats.realizedPnl,
      p_unrealized_pnl: stats.unrealizedPnl,
      p_total_volume: stats.totalVolume,
      p_roi: stats.roi,
      p_win_rate: stats.winRate,
      p_total_trades: stats.totalBuyTrades + stats.totalSellTrades,
      p_total_buy_trades: stats.totalBuyTrades,
      p_total_sell_trades: stats.totalSellTrades,
      p_open_positions: stats.openPositions,
      p_closed_positions: stats.closedPositions,
      p_winning_positions: stats.winningPositions,
      p_losing_positions: stats.losingPositions,
      p_calculation_version: 3,
    })

    if (saveError) {
      console.log('❌ Error:', saveError.message)
    } else {
      console.log('✅ Success! P&L: $' + stats.totalPnl.toFixed(2) + ', Trades: ' + (stats.totalBuyTrades + stats.totalSellTrades))
      console.log('   Realized: $' + stats.realizedPnl.toFixed(2) + ', Unrealized: $' + stats.unrealizedPnl.toFixed(2))
      console.log('   ROI: ' + stats.roi.toFixed(2) + '%, Win Rate: ' + stats.winRate.toFixed(2) + '%')
    }
  } catch (error: any) {
    console.log('❌ Exception:', error.message)
  }
}`
  )
  
  // Write temp script
  const tempPath = path.join(process.cwd(), 'scripts/.temp-refresh-user.ts')
  fs.writeFileSync(tempPath, tempScript)
  
  try {
    // Run it
    execSync(`npx tsx ${tempPath}`, { stdio: 'inherit' })
  } finally {
    // Clean up
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath)
    }
  }
}

refreshUser().catch(console.error)
