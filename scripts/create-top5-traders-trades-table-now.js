#!/usr/bin/env node
'use strict'

/**
 * Create top5_traders_trades table with all trades from top 5 traders
 * Runs the migration SQL directly
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function runSQL(sql) {
  // Split by semicolons and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))
  
  for (const statement of statements) {
    if (statement.trim().length === 0) continue
    
    try {
      const { data, error } = await supabase.rpc('exec_sql', { sql: statement + ';' })
      
      if (error) {
        // If exec_sql doesn't exist, try direct query
        if (error.message && error.message.includes('exec_sql')) {
          // Try using the query method for SELECT statements
          if (statement.toUpperCase().trim().startsWith('SELECT')) {
            const { data: queryData, error: queryError } = await supabase
              .from('_dummy')
              .select('*')
              .limit(0)
            
            // For non-SELECT, we'll need to use a different approach
            console.log('⚠️  Cannot execute SQL directly via RPC. Please run in Supabase SQL editor.')
            return { needsManualExecution: true, sql }
          }
        }
        throw error
      }
    } catch (error) {
      console.error('Error executing SQL:', error.message)
      throw error
    }
  }
  
  return { needsManualExecution: false }
}

async function createTableViaDirectQuery() {
  console.log('🔨 Creating top5_traders_trades table...\n')
  
  // Step 1: Get top 5 traders
  console.log('📊 Getting top 5 traders...')
  const { data: rankings, error: rankingsError } = await supabase
    .from('wallet_realized_pnl_rankings')
    .select('wallet_address')
    .eq('window_key', 'ALL')
    .order('rank', { ascending: true })
    .limit(5)
  
  if (rankingsError) throw rankingsError
  
  if (!rankings || rankings.length === 0) {
    console.log('❌ No traders found')
    return
  }
  
  const wallets = rankings.map(r => r.wallet_address?.toLowerCase()).filter(Boolean)
  console.log(`✅ Found ${wallets.length} traders: ${wallets.join(', ')}\n`)
  
  // Step 2: Drop existing table if it exists
  console.log('🗑️  Dropping existing table if it exists...')
  try {
    await supabase.rpc('exec_sql', { 
      sql: 'DROP TABLE IF EXISTS public.top5_traders_trades;' 
    })
  } catch (error) {
    // If exec_sql doesn't work, we'll create via insert
    console.log('⚠️  Cannot drop via RPC, will create via insert method')
  }
  
  // Step 3: Get all trades for these wallets
  console.log('📥 Fetching trades for top 5 traders...')
  const BATCH_SIZE = 10000
  let offset = 0
  let allTrades = []
  let hasMore = true
  
  while (hasMore) {
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .in('wallet_address', wallets)
      .order('id', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1)
    
    if (error) throw error
    
    if (!data || data.length === 0) {
      hasMore = false
      break
    }
    
    allTrades.push(...data)
    console.log(`  ✅ Fetched ${allTrades.length.toLocaleString()} trades so far...`)
    
    offset += BATCH_SIZE
    if (data.length < BATCH_SIZE) {
      hasMore = false
    }
  }
  
  console.log(`\n✅ Total trades fetched: ${allTrades.length.toLocaleString()}\n`)
  
  if (allTrades.length === 0) {
    console.log('❌ No trades found for these traders')
    return
  }
  
  // Step 4: Create table structure first (get schema from first trade)
  console.log('🏗️  Creating table structure...')
  
  // Get the table structure by querying the trades table schema
  // We'll create it by inserting the first batch and letting Supabase infer the schema
  // Or we can use a CREATE TABLE LIKE statement if we have access
  
  // For now, let's insert in batches
  const INSERT_BATCH_SIZE = 3000
  let totalInserted = 0
  
  // First, try to create the table using a sample query
  try {
    // Create table with same structure as trades
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS public.top5_traders_trades (LIKE public.trades INCLUDING ALL);
      TRUNCATE TABLE public.top5_traders_trades;
    `
    
    await supabase.rpc('exec_sql', { sql: createTableSQL })
    console.log('✅ Table structure created')
  } catch (error) {
    // If that doesn't work, we'll need to insert and let it auto-create
    console.log('⚠️  Cannot create table via SQL, will use insert method')
  }
  
  // Step 5: Insert trades in batches
  console.log('💾 Inserting trades...')
  for (let i = 0; i < allTrades.length; i += INSERT_BATCH_SIZE) {
    const batch = allTrades.slice(i, i + INSERT_BATCH_SIZE)
    
    const { error: insertError } = await supabase
      .from('top5_traders_trades')
      .insert(batch)
    
    if (insertError) {
      // If table doesn't exist, we need to create it first
      if (insertError.message && insertError.message.includes('does not exist')) {
        console.log('⚠️  Table does not exist. Creating via manual SQL execution needed.')
        console.log('\nPlease run this SQL in Supabase SQL editor:')
        console.log('\n' + '='.repeat(60))
        console.log(`
-- Create top5_traders_trades table
CREATE TABLE public.top5_traders_trades (LIKE public.trades INCLUDING ALL);

-- Insert trades
INSERT INTO public.top5_traders_trades
SELECT * FROM public.trades
WHERE LOWER(wallet_address) IN (${wallets.map(w => `'${w}'`).join(', ')});

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_top5_traders_trades_wallet_timestamp 
ON public.top5_traders_trades (wallet_address, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_top5_traders_trades_condition_id 
ON public.top5_traders_trades (condition_id)
WHERE condition_id IS NOT NULL;
        `)
        console.log('='.repeat(60))
        return
      }
      throw insertError
    }
    
    totalInserted += batch.length
    console.log(`  ✅ Inserted ${totalInserted.toLocaleString()} / ${allTrades.length.toLocaleString()} trades`)
  }
  
  // Step 6: Get final statistics
  console.log('\n📊 Getting final statistics...')
  const { count, error: countError } = await supabase
    .from('top5_traders_trades')
    .select('*', { count: 'exact', head: true })
  
  const { data: traderCount, error: traderCountError } = await supabase
    .from('top5_traders_trades')
    .select('wallet_address')
    .limit(1000)
  
  const uniqueTraders = new Set((traderCount || []).map(t => t.wallet_address?.toLowerCase())).size
  
  const { data: timeRange, error: timeRangeError } = await supabase
    .from('top5_traders_trades')
    .select('timestamp')
    .order('timestamp', { ascending: true })
    .limit(1)
    .single()
  
  const { data: latestTrade, error: latestTradeError } = await supabase
    .from('top5_traders_trades')
    .select('timestamp')
    .order('timestamp', { ascending: false })
    .limit(1)
    .single()
  
  console.log('\n' + '='.repeat(60))
  console.log('🎉 Table created successfully!')
  console.log('='.repeat(60))
  console.log(`✅ Table name: top5_traders_trades`)
  console.log(`✅ Total trades: ${(count || totalInserted).toLocaleString()}`)
  console.log(`✅ Unique traders: ${uniqueTraders}`)
  if (timeRange) console.log(`✅ Earliest trade: ${new Date(timeRange.timestamp).toISOString()}`)
  if (latestTrade) console.log(`✅ Latest trade: ${new Date(latestTrade.timestamp).toISOString()}`)
  console.log('='.repeat(60))
}

async function main() {
  try {
    await createTableViaDirectQuery()
  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.error(error)
    process.exit(1)
  }
}

main()
