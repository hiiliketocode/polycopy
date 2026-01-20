import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth'
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit/index'
import { getAuthedClobClientForUser } from '@/lib/polymarket/authed-client'
import { requireEvomiProxyAgent } from '@/lib/evomi/proxy'

type Body = {
  orderHash?: string
}

export async function POST(request: NextRequest) {
  // Use centralized secure auth utility
  const userId = await getAuthenticatedUserId(request)

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized - please log in' },
      { status: 401 }
    )
  }

  // SECURITY: Rate limit order cancellation (TRADING tier)
  const rateLimitResult = await checkRateLimit(request, 'TRADING', userId, 'user')
  if (!rateLimitResult.success) {
    return rateLimitedResponse(rateLimitResult)
  }

  const body: Body = await request.json()
  const { orderHash } = body

  if (!orderHash) {
    return NextResponse.json({ error: 'orderHash is required' }, { status: 400 })
  }

  try {
    await requireEvomiProxyAgent('order cancellation')
    const { client, proxyAddress, signerAddress } = await getAuthedClobClientForUser(userId)
    const result = await client.cancelOrders([orderHash])
    return NextResponse.json({
      ok: true,
      proxy: proxyAddress,
      signer: signerAddress,
      result,
    })
  } catch (error: any) {
    console.error('[POLY-CANCEL-ORDER] Error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Failed to cancel order' },
      { status: 500 }
    )
  }
}
