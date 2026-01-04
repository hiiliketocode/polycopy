import { NextResponse } from 'next/server'

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
    const tokens =
      Array.isArray(market?.tokens) ?
        market.tokens.map((token: any) => ({
          token_id: token?.token_id ?? token?.tokenId ?? null,
          outcome: token?.outcome ?? null,
          price: token?.price ?? null,
          winner: token?.winner ?? null,
        })) :
        []

    const closedValue = market?.closed
    const closed =
      typeof closedValue === 'boolean'
        ? closedValue
        : closedValue === null
          ? null
          : closedValue !== undefined
            ? Boolean(closedValue)
            : null
    const acceptingValue = market?.accepting_orders
    const acceptingOrders =
      typeof acceptingValue === 'boolean'
        ? acceptingValue
        : acceptingValue === null
          ? null
          : acceptingValue !== undefined
            ? Boolean(acceptingValue)
            : null
    const resolvedValue = market?.resolved
    const resolved =
      typeof resolvedValue === 'boolean'
        ? resolvedValue
        : resolvedValue === null
          ? null
          : resolvedValue !== undefined
            ? Boolean(resolvedValue)
            : null
    const minimumTickSize =
      typeof market?.minimum_tick_size === 'number'
        ? market.minimum_tick_size
        : market?.minimum_tick_size
          ? Number(market.minimum_tick_size)
          : null

    return NextResponse.json({
      ok: true,
      conditionId: market?.condition_id ?? conditionId,
      question: market?.question ?? null,
      tokens,
      icon: market?.icon ?? null,
      image: market?.image ?? null,
      closed,
      acceptingOrders,
      resolved,
      minimumTickSize,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch market' },
      { status: 500 }
    )
  }
}
