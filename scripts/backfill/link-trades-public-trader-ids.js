'use strict'

/**
 * Link trades_public.trader_id from traders.wallet_address.
 * Updates rows where trader_id is null.
 *
 * Usage:
 *   node scripts/link-trades-public-trader-ids.js [--limit=1000]
 */

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const { createClient } = require('@supabase/supabase-js')

const envPath = path.resolve(process.cwd(), '.env.local')
dotenv.config(fs.existsSync(envPath) ? { path: envPath } : {})

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

function parseArg(name, fallback) {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  if (!found) return fallback
  return found.slice(prefix.length)
}

async function main() {
  const limit = parseInt(parseArg('limit', '1000'), 10)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: traders, error: traderError } = await supabase
    .from('traders')
    .select('id, wallet_address')
    .limit(limit)

  if (traderError) {
    throw new Error(`Failed to load traders: ${traderError.message}`)
  }

  let updatedTotal = 0
  for (const trader of traders || []) {
    const wallet = trader.wallet_address?.toLowerCase()
    if (!wallet) continue

    const { error, count } = await supabase
      .from('trades_public')
      .update({ trader_id: trader.id })
      .eq('trader_wallet', wallet)
      .is('trader_id', null)

    if (error) {
      console.error(`Failed to update ${wallet}: ${error.message}`)
      continue
    }
    updatedTotal += count ?? 0
  }

  console.log(`Updated ${updatedTotal} trades_public rows with trader_id.`)
}

main().catch((err) => {
  console.error('Linking failed:', err.message || err)
  process.exit(1)
})
