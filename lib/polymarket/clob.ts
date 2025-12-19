import { ClobClient } from '@polymarket/clob-client'
import { TurnkeySigner } from './turnkey-signer'
import { POLYMARKET_CLOB_BASE_URL } from '@/lib/turnkey/config'

const POLYGON_CHAIN_ID = 137

export type SignatureType = 0 | 1 | 2
// 0 = EOA (standard wallet)
// 1 = POLY_PROXY (Magic Link users)
// 2 = GNOSIS_SAFE (most common for proxy wallets)

export interface ApiCredentials {
  key: string
  secret: string
  passphrase: string
}

/**
 * Create a CLOB client with Turnkey signer for L1 authentication
 * 
 * @param signer - Turnkey signer adapter
 * @param signatureType - Wallet signature type (default: 0 for EOA)
 * @param apiCreds - Optional API credentials for L2 authentication
 * @param funder - Optional funder address for L2
 * @returns Configured ClobClient instance
 */
export function createClobClient(
  signer: TurnkeySigner,
  signatureType: SignatureType = 0,
  apiCreds?: ApiCredentials,
  funder?: string
): ClobClient {
  console.log('[CLOB] Creating CLOB client')
  console.log('[CLOB] Host:', POLYMARKET_CLOB_BASE_URL)
  console.log('[CLOB] Chain ID:', POLYGON_CHAIN_ID)
  console.log('[CLOB] Signer address:', signer.address)
  console.log('[CLOB] Signature type:', signatureType)
  console.log('[CLOB] Has API creds:', !!apiCreds)
  console.log('[CLOB] Funder:', funder || 'none')

  return new ClobClient(
    POLYMARKET_CLOB_BASE_URL,
    POLYGON_CHAIN_ID,
    signer as any, // Cast to any to satisfy type requirements
    apiCreds,
    signatureType,
    funder
  )
}

/**
 * Create or derive API credentials using L1 authentication
 * 
 * This calls Polymarket's createOrDeriveApiKey() which:
 * - Creates new API key if none exists
 * - Derives existing API key if one was previously created
 * - Is fully idempotent
 * 
 * @param signer - Turnkey signer for EIP-712 signing
 * @param signatureType - Wallet signature type
 * @returns API credentials (apiKey, secret, passphrase)
 */
export async function createOrDeriveApiCredentials(
  signer: TurnkeySigner,
  signatureType: SignatureType = 0
): Promise<ApiCredentials> {
  console.log('[CLOB] Creating/deriving API credentials')
  
  const client = createClobClient(signer, signatureType)
  
  try {
    const creds = await client.createOrDeriveApiKey()
    
    console.log('[CLOB] API credentials obtained')
    console.log('[CLOB] API Key:', (creds as any).apiKey ?? creds.key)
    console.log('[CLOB] Has secret:', !!creds.secret)
    console.log('[CLOB] Has passphrase:', !!creds.passphrase)
    
    return {
      key: (creds as any).apiKey ?? creds.key,
      secret: creds.secret,
      passphrase: creds.passphrase,
    }
  } catch (error: any) {
    console.error('[CLOB] Failed to create/derive API key:', error)
    throw new Error(`Polymarket CLOB error: ${error.message}`)
  }
}
