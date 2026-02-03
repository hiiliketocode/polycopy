/**
 * Test script to compare top 1000 Polymarket leaderboard traders
 * with what's currently in the traders table
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function fetchLeaderboardPage(options) {
  const { timePeriod, orderBy, category, limit, offset } = options
  const url = `https://data-api.polymarket.com/v1/leaderboard?timePeriod=${timePeriod}&orderBy=${orderBy}&limit=${limit}&offset=${offset}&category=${category}`
  
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Polycopy/1.0)' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000)
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Polymarket leaderboard error ${response.status}: ${text}`)
  }

  const data = await response.json()
  return Array.isArray(data) ? data : []
}

async function fetchTop1000Traders() {
  console.log('📊 Fetching top 1000 traders from Polymarket leaderboard...\n')
  
  // Polymarket API has a max limit of 50 per request
  const limit = 50
  const targetCount = 1000
  const pages = Math.ceil(targetCount / limit) // 20 pages
  const allEntries = []
  const allWallets = new Set()

  for (let page = 0; page < pages; page += 1) {
    const offset = page * limit
    console.log(`  📄 Page ${page + 1}/${pages} (offset ${offset})...`)
    const entries = await fetchLeaderboardPage({
      timePeriod: 'all',
      orderBy: 'VOL',
      category: 'overall',
      limit,
      offset
    })
    
    console.log(`     Got ${entries.length} traders`)
    allEntries.push(...entries)
    for (const entry of entries) {
      const wallet = entry.proxyWallet?.toLowerCase()
      if (wallet) allWallets.add(wallet)
    }
    
    // If we got fewer than requested, we've reached the end
    if (entries.length < limit) {
      console.log(`     Reached end of leaderboard (got ${entries.length} < ${limit})`)
      break
    }
    
    // Stop if we've reached our target
    if (allEntries.length >= targetCount) {
      console.log(`     Reached target of ${targetCount} traders`)
      break
    }
    
    // Small delay to avoid rate limiting
    if (page < pages - 1) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  console.log(`\n✅ Fetched ${allEntries.length} traders from leaderboard\n`)
  return { entries: allEntries, wallets: Array.from(allWallets) }
}

async function fetchTradersFromTable() {
  console.log('📊 Fetching traders from PolyCopy traders table...\n')
  
  const { data, error } = await supabase
    .from('traders')
    .select('wallet_address, display_name, is_active, updated_at')
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch traders: ${error.message}`)
  }

  console.log(`✅ Found ${data.length} traders in table\n`)
  return data || []
}

function compare(leaderboardWallets, tradersTable) {
  const leaderboardSet = new Set(leaderboardWallets)
  const tableWallets = tradersTable.map(t => t.wallet_address?.toLowerCase()).filter(Boolean)
  const tableSet = new Set(tableWallets)
  
  // Traders in leaderboard but not in table
  const missingFromTable = leaderboardWallets.filter(w => !tableSet.has(w))
  
  // Traders in table but not in top 1000 leaderboard
  const notInTop1000 = tableWallets.filter(w => !leaderboardSet.has(w))
  
  // Traders in both
  const inBoth = leaderboardWallets.filter(w => tableSet.has(w))
  
  // Check is_active status
  const activeInTable = tradersTable.filter(t => t.is_active === true)
  const inactiveInTable = tradersTable.filter(t => t.is_active === false || t.is_active === null)
  
  // Check missing traders' is_active status
  const missingTraders = tradersTable.filter(t => 
    missingFromTable.includes(t.wallet_address?.toLowerCase())
  )
  
  return {
    leaderboardCount: leaderboardWallets.length,
    tableCount: tableWallets.length,
    inBothCount: inBoth.length,
    missingFromTable,
    notInTop1000,
    activeInTable: activeInTable.length,
    inactiveInTable: inactiveInTable.length,
    missingFromTableCount: missingFromTable.length,
    notInTop1000Count: notInTop1000.length
  }
}

async function main() {
  try {
    console.log('='.repeat(60))
    console.log('🔍 COMPARING POLYMARKET LEADERBOARD vs TRADERS TABLE')
    console.log('='.repeat(60))
    console.log()

    // Fetch data
    const { entries: leaderboardEntries, wallets: leaderboardWallets } = await fetchTop1000Traders()
    const tradersTable = await fetchTradersFromTable()

    // Compare
    const comparison = compare(leaderboardWallets, tradersTable)

    // Display results
    console.log('='.repeat(60))
    console.log('📊 COMPARISON RESULTS')
    console.log('='.repeat(60))
    console.log()
    
    console.log(`Top 1000 Leaderboard: ${comparison.leaderboardCount} traders`)
    console.log(`Traders Table:        ${comparison.tableCount} traders`)
    console.log(`In Both:              ${comparison.inBothCount} traders`)
    console.log()
    
    console.log('─'.repeat(60))
    console.log('⚠️  MISSING FROM TRADERS TABLE')
    console.log('─'.repeat(60))
    console.log(`Count: ${comparison.missingFromTableCount}`)
    if (comparison.missingFromTable.length > 0) {
      console.log('\nFirst 20 missing traders:')
      comparison.missingFromTable.slice(0, 20).forEach((wallet, idx) => {
        const entry = leaderboardEntries.find(e => e.proxyWallet?.toLowerCase() === wallet)
        const name = entry?.userName || 'Unknown'
        const rank = entry?.rank || 'N/A'
        console.log(`  ${idx + 1}. ${wallet} - ${name} (Rank: ${rank})`)
      })
      if (comparison.missingFromTable.length > 20) {
        console.log(`  ... and ${comparison.missingFromTable.length - 20} more`)
      }
    } else {
      console.log('✅ All top 1000 traders are in the table!')
    }
    console.log()
    
    console.log('─'.repeat(60))
    console.log('📋 NOT IN TOP 1000 (but in table)')
    console.log('─'.repeat(60))
    console.log(`Count: ${comparison.notInTop1000Count}`)
    if (comparison.notInTop1000.length > 0) {
      console.log('\nFirst 20 traders not in top 1000:')
      comparison.notInTop1000.slice(0, 20).forEach((wallet, idx) => {
        const trader = tradersTable.find(t => t.wallet_address?.toLowerCase() === wallet)
        const name = trader?.display_name || 'Unknown'
        const isActive = trader?.is_active ? '✅' : '❌'
        console.log(`  ${idx + 1}. ${wallet} - ${name} ${isActive}`)
      })
      if (comparison.notInTop1000.length > 20) {
        console.log(`  ... and ${comparison.notInTop1000.length - 20} more`)
      }
    } else {
      console.log('✅ All traders in table are in top 1000!')
    }
    console.log()
    
    console.log('─'.repeat(60))
    console.log('📈 TABLE STATISTICS')
    console.log('─'.repeat(60))
    console.log(`Active traders:   ${comparison.activeInTable}`)
    console.log(`Inactive traders:  ${comparison.inactiveInTable}`)
    console.log()
    
    // Calculate coverage percentage
    const coverage = ((comparison.inBothCount / comparison.leaderboardCount) * 100).toFixed(1)
    console.log('─'.repeat(60))
    console.log('📊 COVERAGE')
    console.log('─'.repeat(60))
    console.log(`Coverage: ${coverage}% (${comparison.inBothCount}/${comparison.leaderboardCount} top 1000 traders in table)`)
    console.log()
    
    if (comparison.missingFromTableCount > 0) {
      console.log('💡 RECOMMENDATION: Run the sync cron to add missing traders')
      console.log('   Endpoint: /api/cron/sync-trader-leaderboard')
    } else {
      console.log('✅ All top 1000 traders are synced!')
    }
    
    console.log()
    console.log('='.repeat(60))

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

main()
