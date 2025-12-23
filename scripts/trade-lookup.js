'use strict'

// CLI helper to look up a trade by trade_id from Supabase.
// Usage: node scripts/trade-lookup.js [trade_id]

const fs = require('fs')
const path = require('path')
const readline = require('readline')
const dotenv = require('dotenv')
const { createClient } = require('@supabase/supabase-js')

// Load environment variables from .env.local if present (fallback to default .env)
const envPath = path.resolve(process.cwd(), '.env.local')
dotenv.config(fs.existsSync(envPath) ? { path: envPath } : {})

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function promptTradeId() {
  const argId = process.argv[2]
  if (argId) return argId.trim()

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const question = (query) =>
    new Promise((resolve) => {
      rl.question(query, (answer) => resolve(answer.trim()))
    })

  const tradeId = await question('Enter trade_id: ')
  rl.close()
  return tradeId
}

async function fetchTrade(tradeId) {
  const tables = ['trader_trades', 'TraderTrades']
  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('trade_id', tradeId)
      .limit(1)
      .maybeSingle()

    if (error && error.code !== '42P01') {
      throw new Error(`Query failed on table ${table}: ${error.message}`)
    }
    if (data) {
      return { table, record: data }
    }
  }
  return null
}

async function main() {
  try {
    const tradeId = await promptTradeId()
    if (!tradeId) {
      console.error('No trade_id provided. Exiting.')
      process.exit(1)
    }

    console.log(`Looking up trade_id=${tradeId} ...`)
    const result = await fetchTrade(tradeId)

    if (!result) {
      console.log('Trade not found in trader_trades / TraderTrades.')
      process.exit(0)
    }

    const { table, record } = result
    console.log(`Found in table: ${table}`)
    console.log('--- Trade Details ---')
    console.log(JSON.stringify(record, null, 2))
  } catch (err) {
    console.error('Error:', err.message || err)
    process.exit(1)
  }
}

main()
