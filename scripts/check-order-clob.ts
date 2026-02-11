/**
 * Ping the Polymarket CLOB to confirm an order exists.
 * Usage: npx tsx scripts/check-order-clob.ts <order_id>
 * Example: npx tsx scripts/check-order-clob.ts 0xceefb063a81180bb1ebfb68e525520b2b3b6e69bc8ba153c5188bd07bc5a93e2
 */
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const orderId = process.argv[2]?.trim()
if (!orderId) {
  console.error('Usage: npx tsx scripts/check-order-clob.ts <order_id>')
  process.exit(1)
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const { getAuthedClobClientForUserAnyWallet } = await import('../lib/polymarket/authed-client')
  const { requireEvomiProxyAgent } = await import('../lib/evomi/proxy')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  // Resolve user_id from orders -> lt_strategies (for LT orders) or from orders row
  const { data: orderRow, error: orderError } = await supabase
    .from('orders')
    .select('order_id')
    .eq('order_id', orderId)
    .maybeSingle()

  if (orderError) {
    console.error('Orders lookup error:', orderError.message)
    process.exit(1)
  }

  let userId: string | null = null

  // Check lt_orders for this order_id
  const { data: ltOrder } = await supabase
    .from('lt_orders')
    .select('user_id')
    .eq('order_id', orderId)
    .maybeSingle()
  if (ltOrder?.user_id) {
    userId = ltOrder.user_id
  }

  if (!userId) {
    // Fallback: any user with CLOB credentials (e.g. first admin)
    const { data: cred } = await supabase
      .from('clob_credentials')
      .select('user_id')
      .limit(1)
      .maybeSingle()
    userId = cred?.user_id ?? null
  }

  if (!userId) {
    console.error('Could not resolve user_id for this order. Check lt_orders or clob_credentials.')
    process.exit(1)
  }

  console.log('Resolved user_id:', userId)
  console.log('Pinging CLOB for order_id:', orderId)

  try {
    await requireEvomiProxyAgent('check-order-clob')
  } catch (e: any) {
    console.warn('Evomi proxy not available, continuing without:', e?.message)
  }

  const { client } = await getAuthedClobClientForUserAnyWallet(userId)
  const order = await client.getOrder(orderId)

  console.log('\n--- CLOB order (real) ---')
  console.log(JSON.stringify(order, null, 2))
  console.log('\n--- Confirmed: order exists on Polymarket CLOB ---')
}

main().catch((err) => {
  console.error('Error:', err?.message || err)
  process.exit(1)
})
