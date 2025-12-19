import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedClobClientForUser } from '@/lib/polymarket/authed-client'

const DEV_BYPASS_AUTH =
  process.env.TURNKEY_DEV_ALLOW_UNAUTH === 'true' &&
  Boolean(process.env.TURNKEY_DEV_BYPASS_USER_ID)

type Body = {
  orderHash?: string
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
  const { orderHash } = body

  if (!orderHash) {
    return NextResponse.json({ error: 'orderHash is required' }, { status: 400 })
  }

  try {
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
