/* eslint-disable no-console */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

// Load environment variables
const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function resolveAuthUserByEmail(email: string): Promise<{ id: string; email: string | null }> {
  const url = `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to resolve user: ${res.status} ${text}`)
  }

  const data = await res.json()
  if (!data.users || data.users.length === 0) {
    throw new Error(`No user found with email: ${email}`)
  }

  return { id: data.users[0].id, email: data.users[0].email }
}

async function checkUserOrders(email: string) {
  const user = await resolveAuthUserByEmail(email)
  console.log(`\nUser ID: ${user.id}`)
  console.log(`Email: ${user.email}\n`)

  // Check orders table
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('order_id, side, copy_user_id, trader_id, created_at')
    .or(`copy_user_id.eq.${user.id},trader_id.not.is.null`)
    .limit(10)

  console.log('Orders with copy_user_id or trader_id:')
  if (ordersError) {
    console.log(`  Error: ${ordersError.message}`)
  } else {
    console.log(`  Found: ${orders?.length || 0} orders`)
    orders?.forEach((o, i) => {
      console.log(`  ${i + 1}. order_id: ${o.order_id?.substring(0, 20)}..., side: ${o.side}, copy_user_id: ${o.copy_user_id?.substring(0, 8)}..., trader_id: ${o.trader_id?.substring(0, 8) || 'null'}...`)
    })
  }

  // Check copied_trades
  const { data: copiedTrades, error: copiedError } = await supabase
    .from('copied_trades')
    .select('id, user_id, created_at')
    .eq('user_id', user.id)
    .limit(10)

  console.log(`\nCopied trades for user:`)
  if (copiedError) {
    console.log(`  Error: ${copiedError.message}`)
  } else {
    console.log(`  Found: ${copiedTrades?.length || 0} copied trades`)
    copiedTrades?.forEach((ct, i) => {
      console.log(`  ${i + 1}. id: ${ct.id.substring(0, 8)}..., created_at: ${ct.created_at}`)
    })
  }

  // Check clob_credentials to see if user has wallet linked
  const { data: creds, error: credsError } = await supabase
    .from('clob_credentials')
    .select('polymarket_account_address, created_at')
    .eq('user_id', user.id)

  console.log(`\nCLOB credentials:`)
  if (credsError) {
    console.log(`  Error: ${credsError.message}`)
  } else {
    console.log(`  Found: ${creds?.length || 0} credentials`)
    creds?.forEach((c, i) => {
      console.log(`  ${i + 1}. wallet: ${c.polymarket_account_address}, created: ${c.created_at}`)
    })
  }

  // Check orders by copy_user_id specifically
  const { data: copyOrders, error: copyOrdersError } = await supabase
    .from('orders')
    .select('order_id, side, copy_user_id, created_at')
    .eq('copy_user_id', user.id)
    .limit(10)

  console.log(`\nOrders with copy_user_id = user.id:`)
  if (copyOrdersError) {
    console.log(`  Error: ${copyOrdersError.message}`)
  } else {
    console.log(`  Found: ${copyOrders?.length || 0} orders`)
    copyOrders?.forEach((o, i) => {
      console.log(`  ${i + 1}. order_id: ${o.order_id?.substring(0, 20)}..., side: ${o.side}, created: ${o.created_at}`)
    })
  }
}

const email = process.argv[2] || 'donraw@gmail.com'
checkUserOrders(email)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
