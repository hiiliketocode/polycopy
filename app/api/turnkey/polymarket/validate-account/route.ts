import { NextResponse } from 'next/server'
import { POLYGON_RPC_URL, POLYGON_CHAIN_ID } from '@/lib/turnkey/config'

/**
 * POST /api/turnkey/polymarket/validate-account
 * 
 * Validates a Polymarket profile wallet address by checking if it's a contract on Polygon
 * 
 * Input: { accountAddress: string }
 * Output: { isValidAddress: boolean, isContract: boolean, chainId: number }
 */
export async function POST(request: Request) {
  console.log('[POLYMARKET-LAB] Validate account request started')

  try {
    const { accountAddress } = await request.json()

    if (!accountAddress || typeof accountAddress !== 'string') {
      return NextResponse.json(
        { error: 'accountAddress is required' },
        { status: 400 }
      )
    }

    // Validate Ethereum address format (0x + 40 hex characters)
    const addressRegex = /^0x[a-fA-F0-9]{40}$/
    const isValidAddress = addressRegex.test(accountAddress)

    if (!isValidAddress) {
      console.log('[POLYMARKET-LAB] Invalid address format:', accountAddress)
      return NextResponse.json({
        isValidAddress: false,
        isContract: false,
        chainId: POLYGON_CHAIN_ID,
      })
    }

    console.log('[POLYMARKET-LAB] Checking contract code on Polygon for:', accountAddress)

    // Check if address is a contract by calling eth_getCode
    const rpcResponse = await fetch(POLYGON_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getCode',
        params: [accountAddress, 'latest'],
        id: 1,
      }),
    })

    const rpcData = await rpcResponse.json()

    if (rpcData.error) {
      throw new Error(`RPC error: ${rpcData.error.message}`)
    }

    // If code is "0x" or "0x0", it's an EOA (not a contract)
    // If code has actual bytecode, it's a contract
    const code = rpcData.result
    const isContract = code && code !== '0x' && code !== '0x0'

    console.log('[POLYMARKET-LAB] Validation complete - isContract:', isContract)
    console.log('[POLYMARKET-LAB] Validate account request finished')

    return NextResponse.json({
      isValidAddress: true,
      isContract,
      chainId: POLYGON_CHAIN_ID,
    })
  } catch (error: any) {
    console.error('[POLYMARKET-LAB] Validation error:', error.message)
    return NextResponse.json(
      { error: error.message || 'Failed to validate account' },
      { status: 500 }
    )
  }
}


