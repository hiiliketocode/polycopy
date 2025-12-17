import type { TurnkeyConfig } from './types'

export const TURNKEY_ENABLED = process.env.TURNKEY_ENABLED === 'true'

// Polygon configuration
export const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'
export const POLYGON_CHAIN_ID = 137

// USDC contracts on Polygon
export const USDC_CONTRACT_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' // Native USDC
export const USDC_E_CONTRACT_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' // USDC.e (bridged)
export const USDC_DECIMALS = 6

// Polymarket CLOB API Configuration
export const POLYMARKET_CLOB_BASE_URL =
  process.env.NEXT_PUBLIC_POLYMARKET_CLOB_BASE_URL || 
  process.env.POLYMARKET_CLOB_BASE_URL || 
  'https://clob.polymarket.com'

// Encryption key for storing CLOB credentials (must be set in production)
export const CLOB_ENCRYPTION_KEY = process.env.CLOB_ENCRYPTION_KEY || 'dev-key-change-in-production'

export function loadTurnkeyConfig(): TurnkeyConfig | null {
  if (!TURNKEY_ENABLED) return null

  const publicKey = process.env.TURNKEY_API_PUBLIC_KEY
  const privateKey = process.env.TURNKEY_API_PRIVATE_KEY
  const organizationId = process.env.TURNKEY_ORGANIZATION_ID

  const missing = [
    ['TURNKEY_API_PUBLIC_KEY', publicKey],
    ['TURNKEY_API_PRIVATE_KEY', privateKey],
    ['TURNKEY_ORGANIZATION_ID', organizationId],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missing.length > 0) {
    throw new Error(
      `Turnkey is enabled but missing environment variables: ${missing.join(', ')}`
    )
  }

  return {
    publicKey: publicKey!,
    privateKey: privateKey!,
    organizationId: organizationId!,
  }
}

