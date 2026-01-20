import { NextRequest, NextResponse } from 'next/server'
import { POLYGON_RPC_URL, USDC_CONTRACT_ADDRESS, USDC_E_CONTRACT_ADDRESS, USDC_DECIMALS } from '@/lib/turnkey/config'

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
    // 1. Get Cash Balance directly from Polygon RPC
    let cashBalance = 0
    
    try {
      // Encode balanceOf(address) call
      const paddedAddress = address.slice(2).padStart(64, '0')
      const data = `0x70a08231${paddedAddress}`
      
      // Fetch both USDC and USDC.e balances in parallel
      const [nativeResponse, bridgedResponse] = await Promise.all([
        // Native USDC
        fetch(POLYGON_RPC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_call',
            params: [{ to: USDC_CONTRACT_ADDRESS, data }, 'latest'],
            id: 1,
          }),
          signal: AbortSignal.timeout(5000)
        }),
        // USDC.e (bridged)
        fetch(POLYGON_RPC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_call',
            params: [{ to: USDC_E_CONTRACT_ADDRESS, data }, 'latest'],
            id: 2,
          }),
          signal: AbortSignal.timeout(5000)
        }),
      ])
      
      const [nativeData, bridgedData] = await Promise.all([
        nativeResponse.json(),
        bridgedResponse.json(),
      ])
      
      if (!nativeData.error && !bridgedData.error) {
        // Parse balances
        const nativeBalanceRaw = BigInt(nativeData.result).toString()
        const bridgedBalanceRaw = BigInt(bridgedData.result).toString()
        
        // Calculate total
        const totalBalanceRaw = (BigInt(nativeBalanceRaw) + BigInt(bridgedBalanceRaw)).toString()
        cashBalance = Number(totalBalanceRaw) / Math.pow(10, USDC_DECIMALS)
        
        console.log(`Cash balance for ${address}: $${cashBalance.toFixed(2)}`)
      } else {
        console.warn('RPC error fetching USDC balance:', nativeData.error || bridgedData.error)
      }
    } catch (balanceError) {
      console.warn('Failed to fetch cash balance from Polygon RPC:', balanceError)
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

