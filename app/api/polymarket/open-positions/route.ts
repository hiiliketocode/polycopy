import { NextResponse } from 'next/server'
import { badRequest, externalApiError } from '@/lib/http/error-response'

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const wallet = searchParams.get('wallet')

    if (!wallet) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
    }

    if (!ADDRESS_REGEX.test(wallet)) {
      return NextResponse.json({ error: 'Invalid Ethereum address format' }, { status: 400 })
    }

    const response = await fetch(`https://data-api.polymarket.com/positions?user=${wallet}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Polycopy/1.0)' },
      cache: 'no-store',
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `Polymarket API returned ${response.status}` },
        { status: response.status }
      )
    }

    const positions = await response.json()
    const openPositions = Array.isArray(positions) ? positions.length : 0

    return NextResponse.json({
      wallet: wallet.toLowerCase(),
      open_positions: openPositions,
    })
  } catch (error) {
    return externalApiError('Polymarket', error, 'fetch open positions')
  }
}
