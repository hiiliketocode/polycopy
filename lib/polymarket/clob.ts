import { ClobClient } from '@polymarket/clob-client'
import { BuilderConfig } from '@polymarket/builder-signing-sdk'
import { TurnkeySigner } from './turnkey-signer'
import { getValidatedPolymarketClobBaseUrl } from '@/lib/env'
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

export interface BuilderCredentials {
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
/**
 * Load builder credentials from environment variables for order attribution
 * These credentials are obtained from: https://polymarket.com/settings?tab=builder
 */
function loadBuilderCredentials(): BuilderCredentials | undefined {
  const key = process.env.POLYMARKET_BUILDER_API_KEY
  const secret = process.env.POLYMARKET_BUILDER_SECRET
  const passphrase = process.env.POLYMARKET_BUILDER_PASSPHRASE

  // Builder credentials are optional - orders will still work without them
  // but won't be attributed to the builder account
  if (!key || !secret || !passphrase) {
    console.log('[CLOB] Builder credentials not configured - orders will not be attributed')
    return undefined
  }

  return { key, secret, passphrase }
}

export async function createClobClient(
  signer: TurnkeySigner,
  signatureType: SignatureType = 0,
  apiCreds?: ApiCredentials,
  funder?: string
): Promise<ClobClient> {
  const clobBaseUrl = getValidatedPolymarketClobBaseUrl()
  console.log('[CLOB] Creating CLOB client')
  console.log('[CLOB] Host:', clobBaseUrl)
  console.log('[CLOB] Chain ID:', POLYGON_CHAIN_ID)
  console.log('[CLOB] Signer address:', signer.address)
  console.log('[CLOB] Signature type:', signatureType)
  console.log('[CLOB] Has API creds:', !!apiCreds)
  console.log('[CLOB] Funder:', funder || 'none')

  // Load builder credentials for order attribution
  const builderCreds = loadBuilderCredentials()
  let builderConfig: BuilderConfig | undefined = undefined

  if (builderCreds) {
    // Use local signing since all orders are placed server-side
    builderConfig = new BuilderConfig({
      localBuilderCreds: builderCreds
    })
    console.log('[CLOB] ✅ Builder attribution configured - orders will be attributed to Polycopy')
  }

  // Create CLOB client with builder config (parameter 9)
  const client = new ClobClient(
    clobBaseUrl,                  // host
    POLYGON_CHAIN_ID,            // chainId
    signer as any,               // signer
    apiCreds,                    // creds
    signatureType,               // signatureType
    funder,                      // funderAddress
    undefined,                   // geoBlockToken
    undefined,                   // useServerTime
    builderConfig                // builderConfig - THIS ENABLES ATTRIBUTION!
  )

  console.log('[CLOB] Client created successfully')
  return client
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

  const client = await createClobClient(signer, signatureType)

  try {
    const creds = await client.createOrDeriveApiKey()

    // SECURITY: Safe logging - no actual credentials logged
    console.log('[CLOB] API credentials obtained')
    console.log('[CLOB] Has API key:', !!((creds as any).apiKey || creds.key))
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
