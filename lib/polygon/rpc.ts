import { POLYGON_RPC_URL } from '@/lib/turnkey/config'

const POLYGON_RPC_FALLBACKS = [
  'https://polygon-bor-rpc.publicnode.com',
  'https://rpc.ankr.com/polygon',
]

/**
 * RPC error codes that indicate rate limiting
 */
const RATE_LIMIT_ERROR_CODES = [-32090, -32000]

/**
 * Checks if an error is a rate limit error
 */
function isRateLimitError(error: any): boolean {
  if (!error || typeof error !== 'object') return false
  
  // Check error code
  if (error.code && RATE_LIMIT_ERROR_CODES.includes(error.code)) {
    return true
  }
  
  // Check error message
  if (error.message && typeof error.message === 'string') {
    const message = error.message.toLowerCase()
    return message.includes('rate limit') || 
           message.includes('too many requests') ||
           message.includes('retry in')
  }
  
  return false
}

/**
 * Extracts retry delay from error message (e.g., "retry in 10s" -> 10)
 */
function extractRetryDelay(error: any): number {
  if (!error?.message) return 10000 // Default 10 seconds
  
  const match = error.message.match(/retry in (\d+)(s|seconds?)/i)
  if (match) {
    return parseInt(match[1], 10) * 1000
  }
  
  return 10000 // Default 10 seconds
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export interface RpcCallOptions {
  method: string
  params: any[]
  id?: number | string
  maxRetries?: number
  baseDelay?: number
  timeout?: number
}

export interface RpcResponse {
  jsonrpc: string
  id: number | string
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
}

/**
 * Makes an RPC call to Polygon with retry logic and exponential backoff
 * Handles rate limit errors gracefully
 */
async function callSingleRpc(
  rpcUrl: string,
  options: RpcCallOptions
): Promise<RpcResponse> {
  const {
    method,
    params,
    id = 1,
    maxRetries = 2,
    baseDelay = 1000,
    timeout = 10000,
  } = options

  let lastError: any = null
  let attempt = 0

  while (attempt <= maxRetries) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method,
          params,
          id,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data: RpcResponse = await response.json()

      if (data.error) {
        if (isRateLimitError(data.error)) {
          if (attempt >= maxRetries) {
            throw new Error(`Rate limited: ${data.error.message}`)
          }

          const retryDelay = extractRetryDelay(data.error)
          lastError = data.error
          await sleep(retryDelay)
          attempt++
          continue
        }

        return data
      }

      return data
    } catch (error: any) {
      if (attempt >= maxRetries) {
        throw error
      }

      if (error.name === 'AbortError') {
        throw new Error('RPC request timeout')
      }

      const delay = baseDelay * Math.pow(2, attempt)
      lastError = error
      await sleep(delay)
      attempt++
    }
  }

  throw lastError || new Error('RPC call failed after retries')
}

export async function callPolygonRpc(
  options: RpcCallOptions
): Promise<RpcResponse> {
  const rpcUrls = [POLYGON_RPC_URL, ...POLYGON_RPC_FALLBACKS]

  for (let i = 0; i < rpcUrls.length; i++) {
    try {
      return await callSingleRpc(rpcUrls[i], options)
    } catch (error: any) {
      console.warn(
        `[POLYGON-RPC] RPC ${i + 1}/${rpcUrls.length} failed (${rpcUrls[i]}):`,
        error.message || error
      )
      if (i === rpcUrls.length - 1) {
        throw error
      }
    }
  }

  throw new Error('All Polygon RPC endpoints failed')
}

/**
 * Fetches USDC balance for an address (checks both native USDC and USDC.e)
 * Returns the combined balance
 */
export async function fetchUsdcBalance(
  address: string,
  nativeContract: string,
  bridgedContract: string,
  decimals: number
): Promise<{
  nativeBalance: bigint
  bridgedBalance: bigint
  totalBalance: bigint
  nativeBalanceFormatted: number
  bridgedBalanceFormatted: number
  totalBalanceFormatted: number
}> {
  // Encode balanceOf(address) call
  const paddedAddress = address.slice(2).padStart(64, '0')
  const data = `0x70a08231${paddedAddress}`

  // Fetch both balances in parallel with retry logic
  const [nativeResponse, bridgedResponse] = await Promise.all([
    callPolygonRpc({
      method: 'eth_call',
      params: [{ to: nativeContract, data }, 'latest'],
      id: 1,
    }),
    callPolygonRpc({
      method: 'eth_call',
      params: [{ to: bridgedContract, data }, 'latest'],
      id: 2,
    }),
  ])

  // Check for errors
  if (nativeResponse.error) {
    throw new Error(`RPC error fetching native USDC balance: ${nativeResponse.error.message}`)
  }
  if (bridgedResponse.error) {
    throw new Error(`RPC error fetching bridged USDC balance: ${bridgedResponse.error.message}`)
  }

  // Parse balances
  const nativeBalanceRaw = BigInt(nativeResponse.result || '0')
  const bridgedBalanceRaw = BigInt(bridgedResponse.result || '0')
  const totalBalanceRaw = nativeBalanceRaw + bridgedBalanceRaw

  // Format balances
  const divisor = BigInt(10 ** decimals)
  const nativeBalanceFormatted = Number(nativeBalanceRaw) / Number(divisor)
  const bridgedBalanceFormatted = Number(bridgedBalanceRaw) / Number(divisor)
  const totalBalanceFormatted = Number(totalBalanceRaw) / Number(divisor)

  return {
    nativeBalance: nativeBalanceRaw,
    bridgedBalance: bridgedBalanceRaw,
    totalBalance: totalBalanceRaw,
    nativeBalanceFormatted,
    bridgedBalanceFormatted,
    totalBalanceFormatted,
  }
}
