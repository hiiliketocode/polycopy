import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth'
import { getAuthedClobClientForUser } from '@/lib/polymarket/authed-client'

type Body = {
  tokenId?: string
  price?: number
  amount?: number
  side?: 'BUY' | 'SELL'
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

  const body: Body = await request.json()
  const { tokenId, price, amount, side } = body

  if (!tokenId || !price || !amount || !side) {
    return NextResponse.json(
      { error: 'tokenId, price, amount, and side are required' },
      { status: 400 }
    )
  }

  try {
    const { client, proxyAddress, signerAddress, signatureType } = await getAuthedClobClientForUser(
      userId
    )
    const order = await client.createOrder(
      { tokenID: tokenId, price, size: amount, side: side as any },
      { signatureType } as any
    )

    return NextResponse.json({
      ok: true,
      proxy: proxyAddress,
      signer: signerAddress,
      signatureType,
      order,
    })
  } catch (error: any) {
    console.error('[POLY-ORDER-DRY] Error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Failed to build order' },
      { status: 500 }
    )
  }
}
