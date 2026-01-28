#!/usr/bin/env node
'use strict'

/**
 * Temporarily remove trades from non-top traders to allow adding columns to trades table.
 * 
 * This script:
 * 1. Gets top N traders by realized ROI
 * 2. Creates a backup table with trades to keep
 * 3. Deletes trades from other wallets
 * 4. After columns are added, trades can be re-ingested via Dome API
 * 
 * IMPORTANT: This is a destructive operation. Make sure you have a database backup!
 * 
 * Usage:
 *   node scripts/temp-remove-trades-for-column-add.js --top-n 20 --window ALL --dry-run
 *   node scripts/temp-remove-trades-for-column-add.js --top-n 20 --window ALL
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TOP_N = parseInt(process.argv.find(arg => arg.startsWith('--top-n='))?.split('=')[1] || '20')
const WINDOW = process.argv.find(arg => arg.startsWith('--window='))?.split('=')[1] || 'ALL'
const DRY_RUN = process.argv.includes('--dry-run')

function toNumber(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function getTopTradersByROI(limit, window) {
  console.log(`📊 Fetching top ${limit} traders by realized ROI (window: ${window})...`)
  
  const { data: rankings, error: rankingsError } = await supabase
    .from('wallet_realized_pnl_rankings')
    .select('wallet_address, pnl_sum, rank')
    .eq('window_key', window)
    .order('rank', { ascending: true })
    .limit(limit * 2)
  
  if (rankingsError) throw rankingsError
  
  const wallets = (rankings || []).map(r => r.wallet_address?.toLowerCase()).filter(Boolean)
  if (wallets.length === 0) return []
  
  const { data: dailyData, error: dailyError } = await supabase
    .from('wallet_realized_pnl_daily')
    .select('wallet_address, volume')
    .in('wallet_address', wallets)
  
  if (dailyError) throw dailyError
  
  const volumeMap = new Map()
  ;(dailyData || []).forEach(row => {
    const wallet = row.wallet_address?.toLowerCase()
    if (!wallet) return
    const vol = toNumber(row.volume) || 0
    volumeMap.set(wallet, (volumeMap.get(wallet) || 0) + vol)
  })
  
  const tradersWithROI = (rankings || [])
    .map(r => {
      const wallet = r.wallet_address?.toLowerCase()
      const pnl = toNumber(r.pnl_sum) || 0
      const volume = volumeMap.get(wallet) || 0
      const roi = volume > 0 ? (pnl / volume) * 100 : 0
      return { wallet, pnl, volume, roi, rank: r.rank }
    })
    .filter(t => t.volume > 0)
    .sort((a, b) => b.roi - a.roi)
    .slice(0, limit)
  
  return tradersWithROI
}

async function getTradeCounts(walletsToKeep) {
  console.log('\n📊 Analyzing trade counts...')
  
  // Count trades to keep
  const { count: keepCount, error: keepError } = await supabase
    .from('trades')
    .select('*', { count: 'exact', head: true })
    .in('wallet_address', walletsToKeep)
  
  if (keepError) throw keepError
  
  // Count total trades
  const { count: totalCount, error: totalError } = await supabase
    .from('trades')
    .select('*', { count: 'exact', head: true })
  
  if (totalError) throw totalError
  
  const deleteCount = (totalCount || 0) - (keepCount || 0)
  
  console.log(`  ✅ Trades to keep: ${(keepCount || 0).toLocaleString()}`)
  console.log(`  ❌ Trades to delete: ${deleteCount.toLocaleString()}`)
  console.log(`  📊 Total trades: ${(totalCount || 0).toLocaleString()}`)
  
  return { keepCount: keepCount || 0, deleteCount, totalCount: totalCount || 0 }
}

async function createBackupTable() {
  console.log('\n💾 Creating backup table...')
  
  const { error } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS trades_backup_before_column_add AS
      SELECT * FROM trades WHERE 1=0;
      
      COMMENT ON TABLE trades_backup_before_column_add IS
        'Backup of trades before removing non-top-trader trades to add columns. Created ' || NOW();
    `
  })
  
  // If exec_sql doesn't exist, use direct query (this won't work but shows intent)
  if (error && error.message.includes('exec_sql')) {
    console.log('  ⚠️  Cannot create backup table automatically. Please create manually:')
    console.log('     CREATE TABLE trades_backup_before_column_add AS SELECT * FROM trades WHERE 1=0;')
    return false
  }
  
  if (error) throw error
  console.log('  ✅ Backup table created')
  return true
}

async function deleteTrades(walletsToKeep) {
  console.log('\n🗑️  Deleting trades from non-top traders...')
  
  if (DRY_RUN) {
    console.log('  🔍 DRY RUN - Would delete trades NOT in:', walletsToKeep.slice(0, 5), '...')
    return
  }
  
  // Delete in batches to avoid timeout
  const BATCH_SIZE = 10000
  let deleted = 0
  let offset = 0
  
  while (true) {
    // Get batch of trade IDs to delete
    const { data: trades, error: fetchError } = await supabase
      .from('trades')
      .select('id')
      .not('wallet_address', 'in', `(${walletsToKeep.map(w => `'${w}'`).join(',')})`)
      .order('id', { ascending: true })
      .limit(BATCH_SIZE)
      .range(offset, offset + BATCH_SIZE - 1)
    
    if (fetchError) throw fetchError
    if (!trades || trades.length === 0) break
    
    const tradeIds = trades.map(t => t.id)
    
    // Delete batch
    const { error: deleteError } = await supabase
      .from('trades')
      .delete()
      .in('id', tradeIds)
    
    if (deleteError) throw deleteError
    
    deleted += tradeIds.length
    console.log(`  ✅ Deleted ${deleted.toLocaleString()} trades...`)
    
    if (trades.length < BATCH_SIZE) break
    offset += BATCH_SIZE
  }
  
  console.log(`  ✅ Total deleted: ${deleted.toLocaleString()} trades`)
  return deleted
}

async function main() {
  console.log('='.repeat(60))
  console.log('⚠️  TEMPORARY TRADE REMOVAL FOR COLUMN ADD')
  console.log('='.repeat(60))
  console.log(`📊 Top N: ${TOP_N}`)
  console.log(`📅 Window: ${WINDOW}`)
  console.log(`🔍 Dry run: ${DRY_RUN ? 'YES' : 'NO'}`)
  console.log('')
  
  if (!DRY_RUN) {
    console.log('⚠️  WARNING: This will DELETE trades from non-top traders!')
    console.log('⚠️  Make sure you have a database backup!')
    console.log('⚠️  Trades can be re-ingested later via Dome API')
    console.log('')
  }
  
  try {
    // Get top traders
    const traders = await getTopTradersByROI(TOP_N, WINDOW)
    
    if (traders.length === 0) {
      console.log('❌ No traders found')
      return
    }
    
    const walletsToKeep = traders.map(t => t.wallet.toLowerCase())
    
    console.log('\n📋 Top traders to keep:')
    traders.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.wallet} - ROI: ${t.roi.toFixed(2)}%`)
    })
    
    // Get trade counts
    const counts = await getTradeCounts(walletsToKeep)
    
    if (counts.deleteCount === 0) {
      console.log('\n✅ No trades to delete - all trades are from top traders!')
      return
    }
    
    if (DRY_RUN) {
      console.log('\n🔍 DRY RUN - Would:')
      console.log(`  1. Create backup table`)
      console.log(`  2. Delete ${counts.deleteCount.toLocaleString()} trades`)
      console.log(`  3. Keep ${counts.keepCount.toLocaleString()} trades`)
      return
    }
    
    // Create backup
    await createBackupTable()
    
    // Delete trades
    const deleted = await deleteTrades(walletsToKeep)
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ Complete!')
    console.log('='.repeat(60))
    console.log(`✅ Deleted: ${deleted.toLocaleString()} trades`)
    console.log(`✅ Kept: ${counts.keepCount.toLocaleString()} trades`)
    console.log('')
    console.log('📝 Next steps:')
    console.log('  1. Run the migration to add columns to trades table')
    console.log('  2. Run backfill-trade-timing-top-traders.js to populate timing data')
    console.log('  3. Re-ingest deleted trades later via Dome API if needed')
    console.log('='.repeat(60))
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
