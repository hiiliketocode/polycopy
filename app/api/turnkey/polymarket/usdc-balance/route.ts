import { NextResponse } from 'next/server'
import { USDC_CONTRACT_ADDRESS, USDC_E_CONTRACT_ADDRESS, USDC_DECIMALS } from '@/lib/turnkey/config'
import { badRequest, externalApiError } from '@/lib/http/error-response'
import { fetchUsdcBalance } from '@/lib/polygon/rpc'

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

    // Fetch balance with retry logic
    const balanceData = await fetchUsdcBalance(
      accountAddress,
      USDC_CONTRACT_ADDRESS,
      USDC_E_CONTRACT_ADDRESS,
      USDC_DECIMALS
    )

    console.log(
      '[POLYMARKET-LAB] Balance fetched - Native:',
      balanceData.nativeBalanceFormatted,
      'Bridged:',
      balanceData.bridgedBalanceFormatted,
      'Total:',
      balanceData.totalBalanceFormatted
    )
    console.log('[POLYMARKET-LAB] USDC balance request finished')

    return NextResponse.json({
      accountAddress,
      usdcBalanceRaw: balanceData.totalBalance.toString(),
      usdcBalanceFormatted: `${balanceData.totalBalanceFormatted.toFixed(2)} USDC`,
      breakdown: {
        native: {
          balance: balanceData.nativeBalanceFormatted.toFixed(2),
          contract: USDC_CONTRACT_ADDRESS,
        },
        bridged: {
          balance: balanceData.bridgedBalanceFormatted.toFixed(2),
          contract: USDC_E_CONTRACT_ADDRESS,
        },
      },
    })
  } catch (error: any) {
    return externalApiError('Polygon', error, 'USDC balance fetch')
  }
}

