import { NextRequest, NextResponse } from 'next/server'
import { USDC_CONTRACT_ADDRESS, USDC_E_CONTRACT_ADDRESS, USDC_DECIMALS } from '@/lib/turnkey/config'
import { fetchUsdcBalance } from '@/lib/polygon/rpc'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params
  
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
    // 1. Get Cash Balance directly from Polygon RPC with retry logic
    let cashBalance = 0
    
    try {
      const balanceData = await fetchUsdcBalance(
        address,
        USDC_CONTRACT_ADDRESS,
        USDC_E_CONTRACT_ADDRESS,
        USDC_DECIMALS
      )
      
      cashBalance = balanceData.totalBalanceFormatted
      console.log(`Cash balance for ${address}: $${cashBalance.toFixed(2)}`)
    } catch (balanceError: any) {
      // Log but don't fail the entire request - return 0 balance
      console.warn('Failed to fetch cash balance from Polygon RPC:', balanceError?.message || balanceError)
      // If it's a rate limit error, we'll return 0 but log it for monitoring
      if (balanceError?.message?.includes('rate limit') || balanceError?.message?.includes('Too many requests')) {
        console.warn('Rate limit hit while fetching USDC balance - returning 0')
      }
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
      console.log(`Found ${Array.isArray(positions) ? positions.length : 0} positions for ${address}`)
      
      // Calculate total value of open positions
      if (Array.isArray(positions)) {
        for (const position of positions) {
          // Try curPrice first, fall back to currentPrice
          const currentPrice = position.curPrice || position.currentPrice
          if (position.size && currentPrice) {
            // size * current_price gives position value in dollars
            const size = parseFloat(position.size)
            const price = parseFloat(currentPrice)
            const value = size * price
            positionsValue += value
            console.log(`Position value: ${value.toFixed(2)} (size: ${size}, price: ${price})`)
          }
        }
        console.log(`Total positions value: ${positionsValue.toFixed(2)}`)
      }
    } else {
      console.warn(`Failed to fetch positions for ${address}:`, positionsResponse.status)
      const errorText = await positionsResponse.text()
      console.warn('Error response:', errorText)
    }
    
    // 3. Calculate Portfolio = Cash + Positions
    const portfolioValue = cashBalance + positionsValue
    
    return NextResponse.json({
      portfolioValue: parseFloat(portfolioValue.toFixed(2)),
      cashBalance: parseFloat(cashBalance.toFixed(2)),
      positionsValue: parseFloat(positionsValue.toFixed(2))
    }, {
      headers: {
        // Cache for 60 seconds to reduce RPC load (increased from 30s)
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
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

