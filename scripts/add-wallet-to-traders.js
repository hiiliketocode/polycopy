#!/usr/bin/env node

/**
 * Add a wallet to the traders table if it doesn't exist.
 * Usage: node scripts/add-wallet-to-traders.js 0xd82079c0d6b837bad90abf202befc079da5819f6
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function addWalletToTraders(wallet) {
  const normalized = wallet.toLowerCase().trim()
  console.log(`\n🔍 Adding wallet to traders: ${normalized}\n`)

  // Check if already exists
  const { data: existing, error: checkError } = await supabase
    .from('traders')
    .select('id, wallet_address, display_name, is_active')
    .eq('wallet_address', normalized)
    .maybeSingle()

  if (checkError) {
    console.error('❌ Error checking traders:', checkError.message)
    process.exit(1)
  }

  if (existing) {
    console.log('✅ Wallet already exists in traders table:')
    console.log(`   - ID: ${existing.id}`)
    console.log(`   - Display Name: ${existing.display_name || '(none)'}`)
    console.log(`   - Is Active: ${existing.is_active || false}`)
    return
  }

  // Insert new trader
  const { data: inserted, error: insertError } = await supabase
    .from('traders')
    .insert({
      wallet_address: normalized,
      is_active: true,
      updated_at: new Date().toISOString()
    })
    .select()
    .single()

  if (insertError) {
    console.error('❌ Error inserting wallet:', insertError.message)
    process.exit(1)
  }

  console.log('✅ Successfully added wallet to traders table:')
  console.log(`   - ID: ${inserted.id}`)
  console.log(`   - Wallet: ${inserted.wallet_address}`)
  console.log(`   - Is Active: ${inserted.is_active}`)
  console.log('\n💡 The wallet will be included in future PnL backfills.')
}

const wallet = process.argv[2]
if (!wallet) {
  console.error('Usage: node scripts/add-wallet-to-traders.js <wallet_address>')
  process.exit(1)
}

addWalletToTraders(wallet).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
