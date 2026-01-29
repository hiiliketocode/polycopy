import { NextResponse } from 'next/server'

function toNumber(value: unknown) {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function pickFirstString(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const conditionId = searchParams.get('conditionId')?.trim()

  if (!conditionId || !conditionId.startsWith('0x')) {
    return NextResponse.json({ error: 'conditionId is required' }, { status: 400 })
  }

  try {
    const response = await fetch(`https://clob.polymarket.com/markets/${conditionId}`, {
      cache: 'no-store',
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `CLOB returned ${response.status}` },
        { status: response.status }
      )
    }

    const market = await response.json()
    const minimumOrderSize = toNumber(market?.minimum_order_size)
    const minOrderSize = toNumber(market?.min_order_size)
    const tickSize = toNumber(market?.tick_size)
    const tokens =
      Array.isArray(market?.tokens) ?
        market.tokens.map((token: any) => ({
          token_id: token?.token_id ?? token?.tokenId ?? null,
          outcome: token?.outcome ?? null,
          price: token?.price ?? null,
        })) :
        []

    let icon = pickFirstString(market?.icon, market?.image)
    let image = pickFirstString(market?.image, market?.icon)

    if (!icon || !image) {
      try {
        const gammaResponse = await fetch(
          `https://gamma-api.polymarket.com/markets?condition_id=${encodeURIComponent(conditionId)}`,
          { cache: 'no-store' }
        )
        if (gammaResponse.ok) {
          const gammaData = await gammaResponse.json()
          const gammaMarket = Array.isArray(gammaData) && gammaData.length > 0 ? gammaData[0] : null
          const gammaEvent =
            gammaMarket && Array.isArray(gammaMarket.events) && gammaMarket.events.length > 0
              ? gammaMarket.events[0]
              : null
          if (!icon) {
            icon = pickFirstString(
              gammaMarket?.icon,
              gammaMarket?.image,
              gammaMarket?.twitterCardImage,
              gammaMarket?.twitter_card_image,
              gammaEvent?.icon,
              gammaEvent?.image
            )
          }
          if (!image) {
            image = pickFirstString(
              gammaMarket?.image,
              gammaMarket?.icon,
              gammaMarket?.twitterCardImage,
              gammaMarket?.twitter_card_image,
              gammaEvent?.image,
              gammaEvent?.icon
            )
          }
        }
      } catch {
        // Ignore gamma fallback errors.
      }
    }

    return NextResponse.json({
      ok: true,
      conditionId: market?.condition_id ?? conditionId,
      question: market?.question ?? null,
      tokens,
      icon: icon,
      image: image,
      minimumOrderSize: minimumOrderSize ?? minOrderSize,
      minOrderSize,
      tickSize,
      acceptingOrders: typeof market?.accepting_orders === 'boolean' ? market.accepting_orders : null,
      closed: typeof market?.closed === 'boolean' ? market.closed : null,
      resolved: typeof market?.resolved === 'boolean' ? market.resolved : null,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch market' },
      { status: 500 }
    )
  }
}
