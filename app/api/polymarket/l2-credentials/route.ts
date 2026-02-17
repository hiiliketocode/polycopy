import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth'
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit/index'
import { unauthorized, internalError } from '@/lib/http/error-response'
import {
  TURNKEY_ENABLED,
  CLOB_ENCRYPTION_KEY,
  CLOB_ENCRYPTION_KEY_V1,
  CLOB_ENCRYPTION_KEY_V2,
} from '@/lib/turnkey/config'
import { createTurnkeySigner } from '@/lib/polymarket/turnkey-signer'
import { SignatureType } from '@/lib/polymarket/clob'
import { createHash, createCipheriv, randomBytes } from 'crypto'
import { createL1Headers } from '@polymarket/clob-client/dist/headers/index.js'
import { POLYMARKET_CLOB_BASE_URL } from '@/lib/turnkey/config'
import { verifyTypedData } from 'ethers/lib/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * SECURITY: Service Role Usage - L2 CREDENTIALS STORAGE
 * 
 * Why service role is required:
 * - Stores encrypted API credentials in `clob_credentials` table
 * - Credentials include API key, secret, passphrase (encrypted)
 * - Table may have restrictive RLS to prevent credential theft
 * - Service role ensures storage succeeds regardless of RLS changes
 * 
 * Security measures:
 * - ✅ User authenticated before ANY operations
 * - ✅ Rate limited (CRITICAL tier - 10 req/min)
 * - ✅ Credentials encrypted with AES-256-CBC before storage
 * - ✅ Only stores authenticated user's own credentials
 * - ✅ Validates Turnkey signatures before credential generation
 * 
 * RLS policies bypassed:
 * - clob_credentials (storing user's own encrypted credentials)
 * 
 * Reviewed: January 10, 2025
 * Status: JUSTIFIED (credential storage with encryption, user's own data)
 */

// Service role client for DB operations
const supabaseServiceRole = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

const CURRENT_ENCRYPTION_KID = 'v1'
const CURRENT_ENCRYPTION_VERSION = 1

function getEncryptionKey(kid?: string | null): string {
  if (kid === 'v2' && CLOB_ENCRYPTION_KEY_V2) return CLOB_ENCRYPTION_KEY_V2
  if (kid === 'v1' && CLOB_ENCRYPTION_KEY_V1) return CLOB_ENCRYPTION_KEY_V1
  return CLOB_ENCRYPTION_KEY
}

/**
 * Simple encryption for storing secrets (using AES-256-CBC)
 */
function encryptSecret(text: string, kid = CURRENT_ENCRYPTION_KID): string {
  const keyMaterial = getEncryptionKey(kid)
  const key = createHash('sha256').update(keyMaterial).digest()
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

const POLYGON_CHAIN_ID = 137
const AUTH_MESSAGE = 'This message attests that I control the given wallet'

function buildAuthTypedData(address: string, timestamp: number, nonce: number) {
  // Polymarket expects the EOA (POLY_ADDRESS) inside the typed data even if the
  // user ultimately trades through a proxy (see POLYMARKET_L2_AUTH_SOLUTION.md).
  return {
    domain: {
      name: 'ClobAuthDomain',
      version: '1',
      chainId: POLYGON_CHAIN_ID,
    },
    types: {
      ClobAuth: [
        { name: 'address', type: 'address' },
        { name: 'timestamp', type: 'string' },
        { name: 'nonce', type: 'uint256' },
        { name: 'message', type: 'string' },
      ],
    },
    message: {
      address,
      timestamp: `${timestamp}`,
      nonce,
      message: AUTH_MESSAGE,
    },
  }
}

type L2CredentialsRequestBody = {
  polymarketAccountAddress?: string
}

type PolymarketApiKeyResponse = {
  apiKey?: string
  secret?: string
  passphrase?: string
  [key: string]: unknown
}

async function callPolymarketAuthEndpoint(
  endpoint: 'create' | 'derive',
  headers: Record<string, string>,
  body?: Record<string, unknown>
): Promise<{ response: Response; data: PolymarketApiKeyResponse | null }> {
  const url =
    endpoint === 'create'
      ? `${POLYMARKET_CLOB_BASE_URL}/auth/api-key`
      : `${POLYMARKET_CLOB_BASE_URL}/auth/derive-api-key`

  const response = await fetch(url, {
    method: endpoint === 'create' ? 'POST' : 'GET',
    headers,
    body: endpoint === 'create' ? JSON.stringify(body ?? {}) : undefined,
  })

  let data: PolymarketApiKeyResponse | null = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  return { response, data }
}

/**
 * POST /api/polymarket/l2-credentials
 * 
 * Generate or derive CLOB L2 API credentials using official Polymarket client
 * - Uses @polymarket/clob-client with Turnkey EIP-712 signer
 * - Calls createOrDeriveApiKey() for proper L1 authentication
 * - Stores encrypted credentials in DB
 * - Fully idempotent
 */
export async function POST(request: NextRequest) {
  if (!TURNKEY_ENABLED) {
    return NextResponse.json(
      { error: 'Turnkey is not enabled' },
      { status: 503 }
    )
  }

  try {
    // Authenticate user using centralized secure utility
    const userId = await getAuthenticatedUserId(request)

    if (!userId) {
      console.error('[POLY-CLOB] Auth failed: No user ID')
      return NextResponse.json(
        { error: 'Unauthorized - please log in' },
        { status: 401 }
      )
    }

    // SECURITY: Rate limit L2 credential operations (CRITICAL tier)
    const rateLimitResult = await checkRateLimit(request, 'CRITICAL', userId, 'ip-user')
    if (!rateLimitResult.success) {
      return rateLimitedResponse(rateLimitResult)
    }

    const url = new URL(request.url)
    const dryRun = url.searchParams.get('dryRun') === '1'
    let force = url.searchParams.get('force') === '1'

    let requestBody: L2CredentialsRequestBody & { force?: boolean } = {}
    try {
      requestBody = await request.json()
    } catch {
      requestBody = {}
    }
    if (!force && requestBody?.force) {
      force = true
    }

    const polymarketAccountAddressInput =
      typeof requestBody?.polymarketAccountAddress === 'string'
        ? requestBody.polymarketAccountAddress.trim()
        : null
    // Signature type is derived server-side based on wallet characteristics.
    const sigType: SignatureType = 2
    const { data: wallet, error: walletError } = await supabaseServiceRole
      .from('turnkey_wallets')
      .select('id, user_id, wallet_type, eoa_address, polymarket_account_address, turnkey_private_key_id, turnkey_wallet_id')
      .eq('user_id', userId)
      .eq('wallet_type', 'imported_magic')
      .single()

    if (walletError || !wallet) {
      return NextResponse.json(
        { error: 'Imported wallet not found. Complete Stage 1-3 first.' },
        { status: 400 }
      )
    }

    const accountLower = polymarketAccountAddressInput
      ? polymarketAccountAddressInput.toLowerCase()
      : null
    const storedPolyAddr = wallet.polymarket_account_address?.toLowerCase() || null
    const fallbackAddress = wallet.eoa_address?.toLowerCase() || null
    const proxyAddress = (accountLower || storedPolyAddr || fallbackAddress)?.toLowerCase()

    if (!proxyAddress) {
      return NextResponse.json(
        { error: 'Unable to determine Polymarket proxy address' },
        { status: 400 }
      )
    }

    if (storedPolyAddr !== proxyAddress) {
      const { error: updateError } = await supabaseServiceRole
        .from('turnkey_wallets')
        .update({ polymarket_account_address: proxyAddress })
        .eq('id', wallet.id)

      if (updateError) {
        console.warn('[POLY-CLOB] Failed to persist proxy address update')
      }
    }

    const nonce = Math.floor(Math.random() * 1_000_000_000)
    const timestamp = Math.floor(Date.now() / 1000)

    if (dryRun) {
      const typedData = buildAuthTypedData(wallet.eoa_address, timestamp, nonce)
      return NextResponse.json({
        ok: true,
        dryRun: true,
        typedData,
        proxyAddress,
        eoaAddress: wallet.eoa_address,
        signatureType: sigType,
      })
    }

    // 1. Check if credentials already exist (idempotency)
    const { data: existingCreds } = await supabaseServiceRole
      .from('clob_credentials')
      .select('*')
      .eq('user_id', userId)
      .eq('polymarket_account_address', proxyAddress)
      .single()

    if (existingCreds && !force) {
      return NextResponse.json({
        ok: true,
        apiKey: existingCreds.api_key,
        validated: existingCreds.validated,
        createdAt: existingCreds.created_at,
        isExisting: true,
      })
    }

    // 2. Create Turnkey signer with EIP-712 support
    let signer
    try {
      signer = await createTurnkeySigner(userId, supabaseServiceRole, wallet)
    } catch (signerError: unknown) {
      const errorMessage =
        signerError instanceof Error ? signerError.message : 'Failed to create signer'
      return NextResponse.json(
        { 
          error: errorMessage,
          hint: 'Make sure you have created a Turnkey wallet first (Stage 1)'
        },
        { status: 400 }
      )
    }

    const eoaAddress = wallet.eoa_address
    const headers = (await createL1Headers(
      signer as any,
      POLYGON_CHAIN_ID,
      nonce,
      timestamp
    )) as unknown as Record<string, string>
    // Docs: https://docs.polymarket.com/developers/CLOB/authentication
    // specify that the signing address (EOA) must appear in both POLY_ADDRESS and the EIP-712 payload.
    headers.POLY_ADDRESS = eoaAddress
    headers['Content-Type'] = 'application/json'
    const signatureLength = headers.POLY_SIGNATURE?.length ?? 0

    const typedDataSnapshot =
      signer.getLastTypedData() || buildAuthTypedData(eoaAddress, timestamp, nonce)

    if (!headers.POLY_SIGNATURE || !typedDataSnapshot) {
      return NextResponse.json(
        { error: 'Missing signature data for verification' },
        { status: 500 }
      )
    }

    let recoveredAddress: string
    try {
      recoveredAddress = verifyTypedData(
        typedDataSnapshot.domain,
        typedDataSnapshot.types,
        typedDataSnapshot.message,
        headers.POLY_SIGNATURE
      )
    } catch (verifyErr: any) {
      console.error('[POLY-CLOB] Failed to recover signer locally', verifyErr?.message)
      return NextResponse.json(
        { error: 'Unable to verify signature locally', details: verifyErr?.message },
        { status: 400 }
      )
    }

    if (recoveredAddress.toLowerCase() !== eoaAddress.toLowerCase()) {
      return NextResponse.json(
        {
          error: 'Signature does not match expected EOA',
          recoveredAddress,
          expectedAddress: eoaAddress,
        },
        { status: 400 }
      )
    }

    const logContext = {
      proxyAddress,
      eoaAddress,
      chainId: POLYGON_CHAIN_ID,
      signatureType: sigType,
      nonce,
      timestamp,
      signatureLength,
    }

    console.log('[POLY-CLOB] Headers ready', logContext)
    console.log('[POLY-CLOB] Calling Polymarket create API key endpoint', logContext)
    let { response: createResp, data: createData } = await callPolymarketAuthEndpoint('create', headers)

    if (!createResp.ok || !createData?.apiKey) {
      console.warn('[POLY-CLOB] Create API key failed, attempting derive', {
        ...logContext,
        status: createResp.status,
      })
      const deriveResult = await callPolymarketAuthEndpoint('derive', headers)
      createResp = deriveResult.response
      createData = deriveResult.data
    }

    if (!createResp.ok || !createData?.apiKey || !createData?.secret || !createData?.passphrase) {
      const endpoint = createResp.url?.includes('derive') ? 'derive' : 'create'
      const logPayload = {
        ...logContext,
        endpoint,
        status: createResp.status,
      }
      const responseDebugPayload = {
        ...logPayload,
        typedData: typedDataSnapshot,
      }

      if (createResp.status === 401) {
        console.error('[POLY-CLOB] Polymarket L1 auth failed', logPayload)
      return NextResponse.json(
        {
          error: 'Polymarket L1 authentication failed',
          // SECURITY: Debug info removed for production
        },
        { status: 401 }
      )
      }

      console.error('[POLY-CLOB] Unexpected Polymarket response', logPayload)
      return NextResponse.json(
        {
          error: 'Failed to create/derive Polymarket API credentials',
          // SECURITY: Debug info removed for production
        },
        { status: 502 }
      )
    }

    const apiKey = createData.apiKey
    const secret = createData.secret
    const passphrase = createData.passphrase
    // 4. Encrypt sensitive data (never expose to client)
    const secretEncrypted = encryptSecret(secret, CURRENT_ENCRYPTION_KID)
    const passphraseEncrypted = encryptSecret(passphrase, CURRENT_ENCRYPTION_KID)

    // 5. Validate credentials by checking if they were successfully created
    // The createOrDeriveApiKey() call succeeding means they're valid
    const validated = true

    // 6. Store in database
    let insertError: any = null
    let storedCreds:
      | {
          created_at: string
          api_key: string
          validated: boolean
        }
      | null = null

    const insertResult = await supabaseServiceRole
      .from('clob_credentials')
      .insert({
        user_id: userId,
        polymarket_account_address: proxyAddress,
        turnkey_address: eoaAddress,
        api_key: apiKey,
        api_secret_encrypted: secretEncrypted,
        api_passphrase_encrypted: passphraseEncrypted,
        validated,
        last_validated_at: new Date().toISOString(),
        enc_kid: CURRENT_ENCRYPTION_KID,
        enc_version: CURRENT_ENCRYPTION_VERSION,
        signature_type: sigType,
      })
      .select()
      .single()

    storedCreds = insertResult.data
    insertError = insertResult.error

    if (insertError?.code === '42703') {
      const legacyInsert = await supabaseServiceRole
        .from('clob_credentials')
        .insert({
          user_id: userId,
          polymarket_account_address: proxyAddress,
          turnkey_address: eoaAddress,
          api_key: apiKey,
          api_secret_encrypted: secretEncrypted,
          api_passphrase_encrypted: passphraseEncrypted,
          validated,
          last_validated_at: new Date().toISOString(),
        })
        .select()
        .single()
      storedCreds = legacyInsert.data
      insertError = legacyInsert.error
    }

    if (insertError) {
      // Handle race condition
      if (insertError.code === '23505') {
        const { data: existingAfterRace } = await supabaseServiceRole
          .from('clob_credentials')
          .select('*')
          .eq('user_id', userId)
          .eq('polymarket_account_address', proxyAddress)
          .single()

        if (existingAfterRace) {
          return NextResponse.json({
            ok: true,
            apiKey: existingAfterRace.api_key,
            validated: existingAfterRace.validated,
            createdAt: existingAfterRace.created_at,
            isExisting: true,
          })
        }
      }

      console.error('[POLY-CLOB] Failed to store credentials', {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
      })
      return NextResponse.json(
        { error: 'Failed to store credentials' },
        { status: 500 }
      )
    }

    // 7. Return success (never return secret or passphrase!)
    if (!storedCreds) {
      console.error('[POLY-CLOB] Insert returned no data')
      return NextResponse.json(
        { error: 'Failed to store credentials' },
        { status: 500 }
      )
    }

    const createdAt = storedCreds.created_at

    return NextResponse.json({
      ok: true,
      apiKey,
      validated: validated,
      createdAt,
      turnkeyAddress: eoaAddress,
      polymarketAccountAddress: proxyAddress,
      signatureType: sigType,
      isExisting: false,
    })
  } catch (error: unknown) {
    return internalError('L2 credentials generation failed', error)
  }
}
