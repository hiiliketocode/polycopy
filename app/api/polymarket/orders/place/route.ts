import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedClobClientForUser } from '@/lib/polymarket/authed-client'

const DEV_BYPASS_AUTH =
  process.env.TURNKEY_DEV_ALLOW_UNAUTH === 'true' &&
  Boolean(process.env.TURNKEY_DEV_BYPASS_USER_ID)

type Body = {
  tokenId?: string
  price?: number
  amount?: number
  side?: 'BUY' | 'SELL'
  orderType?: 'GTC' | 'FOK' | 'IOC'
  confirm?: boolean
}

const MAX_TEST_AMOUNT = 10 // basic guardrail for test page

export async function POST(request: NextRequest) {
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

  const body: Body = await request.json()
  const { tokenId, price, amount, side, orderType = 'GTC', confirm } = body

  if (!confirm) {
    return NextResponse.json({ error: 'confirm=true required to place order' }, { status: 400 })
  }

  if (!tokenId || !price || !amount || !side) {
    return NextResponse.json(
      { error: 'tokenId, price, amount, and side are required' },
      { status: 400 }
    )
  }

  if (amount > MAX_TEST_AMOUNT) {
    return NextResponse.json(
      { error: `amount too large for test endpoint (>${MAX_TEST_AMOUNT})` },
      { status: 400 }
    )
  }

  try {
    const { client, proxyAddress, signerAddress, signatureType } = await getAuthedClobClientForUser(
      userId
    )

    console.log('[POLY-ORDER-PLACE] Order params:', {
      tokenID: tokenId,
      price,
      amount,
      side,
      signatureType,
      types: {
        tokenID: typeof tokenId,
        price: typeof price,
        amount: typeof amount,
        side: typeof side,
      }
    })

    const order = await client.createOrder(
      { tokenID: tokenId, price, size: amount, side: side as any },
      { signatureType } as any
    )

    const result = await client.postOrder(order, orderType as any, false)

    return NextResponse.json({
      ok: true,
      proxy: proxyAddress,
      signer: signerAddress,
      signatureType,
      orderId: result?.order_hash || result?.orderHash || null,
      raw: result,
    })
  } catch (error: any) {
    console.error('[POLY-ORDER-PLACE] Error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Failed to place order' },
      { status: 500 }
    )
  }
}
