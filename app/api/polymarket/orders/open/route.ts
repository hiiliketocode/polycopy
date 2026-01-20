import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth'
import { getAuthedClobClientForUser } from '@/lib/polymarket/authed-client'

export async function GET() {
  // Use centralized secure auth utility
  const userId = await getAuthenticatedUserId()

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized - please log in' },
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
