#!/usr/bin/env node
'use strict'

/**
 * Execute SQL to create top5_traders_trades table
 * Uses the migration SQL file directly
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'public' }
})

async function executeSQL(sql) {
  // Read the migration file
  const migrationPath = path.join(__dirname, '../supabase/migrations/20260126_create_top5_traders_trades.sql')
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8')
  
  // Split into individual statements (handle DO blocks specially)
  const statements = []
  let currentStatement = ''
  let inDoBlock = false
  let doBlockDepth = 0
  
  for (const line of migrationSQL.split('\n')) {
    const trimmed = line.trim()
    
    // Skip comments and empty lines
    if (trimmed.startsWith('--') || trimmed.length === 0) continue
    
    currentStatement += line + '\n'
    
    // Track DO $$ blocks
    if (trimmed.includes('DO $$')) {
      inDoBlock = true
      doBlockDepth = 1
    }
    if (inDoBlock) {
      if (trimmed.includes('$$')) {
        doBlockDepth += (trimmed.match(/\$\$/g) || []).length
        if (doBlockDepth % 2 === 0 && trimmed.endsWith(';')) {
          statements.push(currentStatement.trim())
          currentStatement = ''
          inDoBlock = false
          doBlockDepth = 0
        }
      }
    } else if (trimmed.endsWith(';')) {
      statements.push(currentStatement.trim())
      currentStatement = ''
    }
  }
  
  if (currentStatement.trim()) {
    statements.push(currentStatement.trim())
  }
  
  // Execute each statement
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    if (!stmt || stmt.length === 0) continue
    
    console.log(`\n📝 Executing statement ${i + 1}/${statements.length}...`)
    
    try {
      // For CREATE TABLE AS, we need to use a different approach
      if (stmt.includes('CREATE TABLE') && stmt.includes('AS')) {
        // Extract the SELECT part
        const selectMatch = stmt.match(/CREATE TABLE\s+(\S+)\s+AS\s+(SELECT.*)/is)
        if (selectMatch) {
          const tableName = selectMatch[1]
          const selectSQL = selectMatch[2]
          
          // First create empty table
          const createTableSQL = stmt.replace(/AS\s+SELECT.*/is, 'AS (SELECT * FROM public.trades LIMIT 0)')
          
          // Use rpc if available, otherwise we'll need manual execution
          try {
            const { error: createError } = await supabase.rpc('exec_sql', { sql: createTableSQL })
            if (createError && !createError.message.includes('exec_sql')) {
              throw createError
            }
          } catch (e) {
            console.log('⚠️  Cannot execute CREATE TABLE via RPC')
          }
          
          // Now insert data using the SELECT
          const insertSQL = `INSERT INTO ${tableName} ${selectSQL}`
          try {
            const { error: insertError } = await supabase.rpc('exec_sql', { sql: insertSQL })
            if (insertError && !insertError.message.includes('exec_sql')) {
              throw insertError
            }
            console.log(`✅ Created table and inserted data`)
          } catch (e) {
            console.log('⚠️  Cannot execute INSERT via RPC')
          }
        }
      } else {
        // Try to execute via RPC
        try {
          const { error } = await supabase.rpc('exec_sql', { sql: stmt })
          if (error && !error.message.includes('exec_sql')) {
            throw error
          }
          if (error && error.message.includes('exec_sql')) {
            console.log('⚠️  exec_sql RPC not available')
          } else {
            console.log('✅ Statement executed')
          }
        } catch (e) {
          console.log('⚠️  Cannot execute via RPC')
        }
      }
    } catch (error) {
      console.error(`❌ Error: ${error.message}`)
      // Continue with next statement
    }
  }
  
  return { needsManualExecution: true, sql: migrationSQL }
}

async function main() {
  console.log('='.repeat(60))
  console.log('🔨 Creating top5_traders_trades table')
  console.log('='.repeat(60))
  
  try {
    const result = await executeSQL()
    
    if (result.needsManualExecution) {
      console.log('\n⚠️  Cannot execute all SQL statements automatically.')
      console.log('📋 Please run this SQL in Supabase SQL Editor:\n')
      console.log('='.repeat(60))
      console.log(result.sql)
      console.log('='.repeat(60))
      
      // Also try a simpler approach - get trades and insert them
      console.log('\n🔄 Trying alternative approach: fetching and inserting trades...\n')
      
      // Get top 5 traders
      const { data: rankings } = await supabase
        .from('wallet_realized_pnl_rankings')
        .select('wallet_address')
        .eq('window_key', 'ALL')
        .order('rank', { ascending: true })
        .limit(5)
      
      if (!rankings || rankings.length === 0) {
        console.log('❌ No traders found')
        return
      }
      
      const wallets = rankings.map(r => r.wallet_address?.toLowerCase()).filter(Boolean)
      console.log(`📊 Found ${wallets.length} traders`)
      
      // Fetch all trades in batches and insert
      const BATCH_SIZE = 10000
      let offset = 0
      let totalInserted = 0
      let allTrades = []
      
      console.log('📥 Fetching all trades...')
      while (true) {
        const { data, error } = await supabase
          .from('trades')
          .select('*')
          .in('wallet_address', wallets)
          .order('id', { ascending: true })
          .range(offset, offset + BATCH_SIZE - 1)
        
        if (error) throw error
        if (!data || data.length === 0) break
        
        allTrades.push(...data)
        console.log(`  ✅ Fetched ${allTrades.length.toLocaleString()} trades...`)
        
        offset += BATCH_SIZE
        if (data.length < BATCH_SIZE) break
      }
      
      console.log(`\n✅ Total trades: ${allTrades.length.toLocaleString()}\n`)
      
      if (allTrades.length === 0) {
        console.log('❌ No trades found')
        return
      }
      
      // Since we can't create the table via API, provide SQL
      console.log('📋 Please run this SQL in Supabase SQL Editor to create the table:\n')
      console.log('='.repeat(60))
      console.log(`
-- Create top5_traders_trades table
DROP TABLE IF EXISTS public.top5_traders_trades;

CREATE TABLE public.top5_traders_trades AS
SELECT t.*
FROM public.trades t
WHERE LOWER(t.wallet_address) IN (${wallets.map(w => `'${w}'`).join(', ')});

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_top5_traders_trades_wallet_timestamp 
ON public.top5_traders_trades (wallet_address, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_top5_traders_trades_condition_id 
ON public.top5_traders_trades (condition_id)
WHERE condition_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_top5_traders_trades_market_slug 
ON public.top5_traders_trades (market_slug)
WHERE market_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_top5_traders_trades_timestamp 
ON public.top5_traders_trades (timestamp DESC);

-- Add comment
COMMENT ON TABLE public.top5_traders_trades IS
  'Copy of trades table containing only top 5 traders by realized PnL rank (ALL window).';
      `)
      console.log('='.repeat(60))
    } else {
      console.log('\n✅ Table created successfully!')
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message)
    process.exit(1)
  }
}

main()
