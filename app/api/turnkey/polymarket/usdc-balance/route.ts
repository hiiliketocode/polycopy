import { NextResponse } from 'next/server'
import { POLYGON_RPC_URL, USDC_CONTRACT_ADDRESS, USDC_E_CONTRACT_ADDRESS, USDC_DECIMALS } from '@/lib/turnkey/config'

/**
 * POST /api/turnkey/polymarket/usdc-balance
 *
 * Fetches USDC balance for a Polymarket wallet address on Polygon
 * Checks both native USDC and USDC.e (bridged) and returns the combined total
 *
 * Input: { accountAddress: string }
 * Output: { accountAddress: string, usdcBalanceRaw: string, usdcBalanceFormatted: string, breakdown: {...} }
 */
export async function POST(request: Request) {
  console.log('[POLYMARKET-LAB] USDC balance request started')

  try {
    const { accountAddress } = await request.json()

    if (!accountAddress || typeof accountAddress !== 'string') {
      return NextResponse.json(
        { error: 'accountAddress is required' },
        { status: 400 }
      )
    }

    // Validate address format
    const addressRegex = /^0x[a-fA-F0-9]{40}$/
    if (!addressRegex.test(accountAddress)) {
      return NextResponse.json(
        { error: 'Invalid address format' },
        { status: 400 }
      )
    }

    console.log('[POLYMARKET-LAB] Fetching USDC balance for:', accountAddress)

    // Encode balanceOf(address) call
    const paddedAddress = accountAddress.slice(2).padStart(64, '0')
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
      }),
    ])

    const [nativeData, bridgedData] = await Promise.all([
      nativeResponse.json(),
      bridgedResponse.json(),
    ])

    if (nativeData.error || bridgedData.error) {
      throw new Error('RPC error fetching balances')
    }

    // Parse balances
    const nativeBalanceRaw = BigInt(nativeData.result).toString()
    const bridgedBalanceRaw = BigInt(bridgedData.result).toString()
    
    // Calculate totals
    const totalBalanceRaw = (BigInt(nativeBalanceRaw) + BigInt(bridgedBalanceRaw)).toString()
    const totalBalanceNum = Number(totalBalanceRaw) / Math.pow(10, USDC_DECIMALS)
    const nativeBalanceNum = Number(nativeBalanceRaw) / Math.pow(10, USDC_DECIMALS)
    const bridgedBalanceNum = Number(bridgedBalanceRaw) / Math.pow(10, USDC_DECIMALS)

    console.log('[POLYMARKET-LAB] Balance fetched - Native:', nativeBalanceNum, 'Bridged:', bridgedBalanceNum, 'Total:', totalBalanceNum)
    console.log('[POLYMARKET-LAB] USDC balance request finished')

    return NextResponse.json({
      accountAddress,
      usdcBalanceRaw: totalBalanceRaw,
      usdcBalanceFormatted: `${totalBalanceNum.toFixed(2)} USDC`,
      breakdown: {
        native: {
          balance: nativeBalanceNum.toFixed(2),
          contract: USDC_CONTRACT_ADDRESS,
        },
        bridged: {
          balance: bridgedBalanceNum.toFixed(2),
          contract: USDC_E_CONTRACT_ADDRESS,
        },
      },
    })
  } catch (error: any) {
    console.error('[POLYMARKET-LAB] Balance fetch error:', error.message)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch USDC balance' },
      { status: 500 }
    )
  }
}

