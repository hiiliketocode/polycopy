#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Run migration to remove non-user orders from orders table
 * These orders were synced from tracked traders but are not actual user copy trades
 */

require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function run() {
  console.log('📊 Checking current state...\n')

  // Count orders to delete
  const { count: toDelete } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .is('copy_user_id', null)

  // Count orders to keep
  const { count: toKeep } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .not('copy_user_id', 'is', null)

  console.log(`Orders to DELETE (copy_user_id IS NULL): ${toDelete}`)
  console.log(`Orders to KEEP (copy_user_id IS NOT NULL): ${toKeep}`)

  if (toDelete === 0) {
    console.log('\n✅ No non-user orders to delete. Done!')
    return
  }

  console.log(`\n⚠️  About to delete ${toDelete} non-user orders...`)
  console.log('Proceeding in 3 seconds...\n')
  
  await new Promise(r => setTimeout(r, 3000))

  // Delete all non-user orders in one go
  console.log('Deleting non-user orders...')
  
  const { error: deleteError, count } = await supabase
    .from('orders')
    .delete({ count: 'exact' })
    .is('copy_user_id', null)

  if (deleteError) {
    console.error('Error deleting rows:', deleteError)
    process.exit(1)
  }

  const totalDeleted = count || toDelete

  // Verify
  const { count: remaining } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .is('copy_user_id', null)

  const { count: finalTotal } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })

  console.log(`\n✅ Migration complete!`)
  console.log(`   Total deleted: ${totalDeleted}`)
  console.log(`   Remaining orders: ${finalTotal}`)
  console.log(`   Orders with NULL copy_user_id: ${remaining}`)

  if (remaining > 0) {
    console.error('⚠️  Warning: Some orders still have NULL copy_user_id!')
  }
}

run().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
