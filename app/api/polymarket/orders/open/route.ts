import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedClobClientForUser } from '@/lib/polymarket/authed-client'

const DEV_BYPASS_AUTH =
  process.env.TURNKEY_DEV_ALLOW_UNAUTH === 'true' &&
  Boolean(process.env.TURNKEY_DEV_BYPASS_USER_ID)

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  let userId: string | null = user?.id ?? null
  if (!userId && DEV_BYPASS_AUTH && process.env.TURNKEY_DEV_BYPASS_USER_ID) {
    userId = process.env.TURNKEY_DEV_BYPASS_USER_ID
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized - please log in', details: authError?.message },
      { status: 401 }
    )
  }

  try {
    const { client, proxyAddress, signerAddress } = await getAuthedClobClientForUser(userId)
    const orders = await client.getOpenOrders({}, true)
    return NextResponse.json({
      ok: true,
      proxy: proxyAddress,
      signer: signerAddress,
      count: orders.length,
      orders,
    })
  } catch (error: any) {
    console.error('[POLY-OPEN-ORDERS] Error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch open orders' },
      { status: 500 }
    )
  }
}
