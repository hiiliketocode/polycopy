import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { address: string } }
) {
  const { address } = params
  
  // Validate address format
  const addressRegex = /^0x[a-fA-F0-9]{40}$/
  if (!addressRegex.test(address)) {
    return NextResponse.json(
      { 
        error: 'Invalid address format',
        portfolioValue: 0,
        cashBalance: 0,
        positionsValue: 0
      },
      { status: 400 }
    )
  }
  
  try {
    // 1. Get Cash Balance (Polygon USDC balance)
    const balanceResponse = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/turnkey/polymarket/usdc-balance`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountAddress: address }),
        cache: 'no-store'
      }
    )
    
    let cashBalance = 0
    
    if (balanceResponse.ok) {
      const balanceData = await balanceResponse.json()
      cashBalance = parseFloat(balanceData.usdcBalanceFormatted || '0')
    } else {
      console.warn(`Failed to fetch USDC balance for ${address}:`, balanceResponse.status)
    }
    
    // 2. Get Open Positions from Polymarket
    const positionsResponse = await fetch(
      `https://data-api.polymarket.com/positions?user=${address}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Polycopy/1.0)',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000)
      }
    )
    
    let positionsValue = 0
    
    if (positionsResponse.ok) {
      const positions = await positionsResponse.json()
      
      // Calculate total value of open positions
      if (Array.isArray(positions)) {
        for (const position of positions) {
          if (position.size && position.market_price) {
            // size * current_price gives position value in dollars
            const size = parseFloat(position.size)
            const price = parseFloat(position.market_price)
            positionsValue += size * price
          }
        }
      }
    } else {
      console.warn(`Failed to fetch positions for ${address}:`, positionsResponse.status)
    }
    
    // 3. Calculate Portfolio = Cash + Positions
    const portfolioValue = cashBalance + positionsValue
    
    return NextResponse.json({
      portfolioValue: parseFloat(portfolioValue.toFixed(2)),
      cashBalance: parseFloat(cashBalance.toFixed(2)),
      positionsValue: parseFloat(positionsValue.toFixed(2))
    }, {
      headers: {
        // Cache for 30 seconds to avoid hammering the API
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
      }
    })
    
  } catch (error) {
    console.error('Error fetching wallet data for', address, ':', error)
    return NextResponse.json(
      { 
        portfolioValue: 0,
        cashBalance: 0,
        positionsValue: 0,
        error: 'Failed to fetch wallet data' 
      },
      { status: 500 }
    )
  }
}

