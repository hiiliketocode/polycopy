import { NextResponse } from 'next/server'
import { POLYMARKET_CLOB_BASE_URL } from '@/lib/turnkey/config'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tokenId = searchParams.get('token_id') || searchParams.get('tokenId')

  if (!tokenId) {
    return NextResponse.json({ error: 'token_id is required' }, { status: 400 })
  }

  const url = `${POLYMARKET_CLOB_BASE_URL}/book?token_id=${encodeURIComponent(tokenId)}`

  try {
    const response = await fetch(url, { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error || 'Failed to fetch order book' },
        { status: response.status }
      )
    }
    return NextResponse.json(data, { status: 200 })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch order book' },
      { status: 500 }
    )
  }
}
