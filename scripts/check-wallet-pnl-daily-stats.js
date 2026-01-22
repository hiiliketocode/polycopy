#!/usr/bin/env node
'use strict'
/**
 * Report wallet_realized_pnl_daily stats: unique wallets, total rows.
 * Uses same env as backfill-wallet-pnl (.env.local).
 */

const fs = require('fs')
const path = require('path')
let dotenv = null
try {
  dotenv = require('dotenv')
} catch (e) {
  if (e?.code !== 'MODULE_NOT_FOUND') throw e
}
const envPath = path.resolve(process.cwd(), '.env.local')
if (dotenv && fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

const { createClient } = require('@supabase/supabase-js')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const PAGE = 1000 // Supabase default max rows per request

async function main() {
  const { count: totalRows, error: countErr } = await supabase
    .from('wallet_realized_pnl_daily')
    .select('wallet_address', { count: 'exact', head: true })

  if (countErr) {
    console.error('Count error:', countErr.message)
    process.exit(1)
  }

  const uniques = new Set()
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('wallet_realized_pnl_daily')
      .select('wallet_address')
      .order('wallet_address', { ascending: true })
      .range(offset, offset + PAGE - 1)

    if (error) {
      console.error('Fetch error:', error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    for (const r of data) {
      if (r.wallet_address) uniques.add(r.wallet_address.toLowerCase())
    }
    if (data.length < PAGE) break
    offset += PAGE
  }

  console.log('wallet_realized_pnl_daily:')
  console.log('  unique wallets:', uniques.size)
  console.log('  total rows:', totalRows ?? '?')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
