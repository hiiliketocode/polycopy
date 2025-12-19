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
}

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
      { tokenID: tokenId, price, amount, side },
      { signatureType }
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
