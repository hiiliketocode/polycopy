import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth'
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit/index'
import { TURNKEY_ENABLED } from '@/lib/turnkey/config'
import { ApiKeyStamper } from '@turnkey/api-key-stamper'
import { TurnkeyClient } from '@turnkey/http'
import { createClient as createSupabaseAdminClient, createClient as createSupabaseClient } from '@supabase/supabase-js'
import { logInfo, logError } from '@/lib/logging/logger'

// Security: Reject any request containing raw private key patterns
const RAW_KEY_PATTERNS = [
  /privateKey/i,
  /private_key/i,
  /\b[0-9a-fA-F]{64}\b/, // 64 hex chars (without 0x)
  /\b0x[0-9a-fA-F]{64}\b/, // 64 hex chars (with 0x)
]

const TURNKEY_IMPORT_USER_ID = process.env.TURNKEY_IMPORT_USER_ID
const TURNKEY_IMPORT_API_PUBLIC_KEY = process.env.TURNKEY_IMPORT_API_PUBLIC_KEY
const TURNKEY_IMPORT_API_PRIVATE_KEY = process.env.TURNKEY_IMPORT_API_PRIVATE_KEY
const TURNKEY_ORGANIZATION_ID = process.env.TURNKEY_ORGANIZATION_ID
const TURNKEY_BASE_URL = process.env.TURNKEY_BASE_URL || 'https://api.turnkey.com'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

class StageError extends Error {
  stage: string
  status: number
  constructor(stage: string, message: string, status = 500) {
    super(message)
    this.stage = stage
    this.status = status
  }
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE env vars missing for admin client')
}

const supabaseAdmin = createSupabaseAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

function containsRawPrivateKey(body: any): boolean {
  const bodyStr = JSON.stringify(body)
  return RAW_KEY_PATTERNS.some(pattern => pattern.test(bodyStr))
}

function getImportClient() {
  const missing: string[] = []
  if (!TURNKEY_IMPORT_USER_ID) missing.push('TURNKEY_IMPORT_USER_ID')
  if (!TURNKEY_IMPORT_API_PUBLIC_KEY) missing.push('TURNKEY_IMPORT_API_PUBLIC_KEY')
  if (!TURNKEY_IMPORT_API_PRIVATE_KEY) missing.push('TURNKEY_IMPORT_API_PRIVATE_KEY')
  if (!TURNKEY_ORGANIZATION_ID) missing.push('TURNKEY_ORGANIZATION_ID')

  if (missing.length > 0) {
    throw new Error('Missing environment variables: ' + missing.join(', '))
  }

  const stamper = new ApiKeyStamper({
    apiPublicKey: TURNKEY_IMPORT_API_PUBLIC_KEY!,
    apiPrivateKey: TURNKEY_IMPORT_API_PRIVATE_KEY!,
  })

  return new TurnkeyClient(
    {
      baseUrl: TURNKEY_BASE_URL,
    },
    stamper
  )
}

function isAlreadyImportedTurnkeyError(error: any): boolean {
  const message = error?.message || ''
  return message.includes('Turnkey error 6')
}

function extractPrivateKeyIdFromError(error: any): string | null {
  const message = error?.message || ''
  const match = message.match(/private key with ID ([0-9a-f-]{36})/i)
  return match ? match[1] : null
}

async function fetchExistingPrivateKey(
  importClient: TurnkeyClient,
  userId: string,
  privateKeyIdHint: string | null
) {
  if (privateKeyIdHint) {
    const response = await importClient.getPrivateKey({
      organizationId: TURNKEY_ORGANIZATION_ID!,
      privateKeyId: privateKeyIdHint,
    })
    return response.privateKey
  }

  const response = await importClient.getPrivateKeys({
    organizationId: TURNKEY_ORGANIZATION_ID!,
  })

  const prefix = `imported-magic-${userId}-`
  return response.privateKeys.find(
    (pk: any) => typeof pk.privateKeyName === 'string' && pk.privateKeyName.startsWith(prefix)
  )
}

/**
 * GET /api/turnkey/import-private-key
 *
 * Returns the import bundle for client-side encryption (no plaintext keys).
 */
export async function GET() {
  if (!TURNKEY_ENABLED) {
    return NextResponse.json(
      { error: 'Turnkey is not enabled', stage: 'env' },
      { status: 503 }
    )
  }

  try {
    const client = getImportClient()
    const initResult = await client.initImportPrivateKey({
      type: 'ACTIVITY_TYPE_INIT_IMPORT_PRIVATE_KEY',
      timestampMs: String(Date.now()),
      organizationId: TURNKEY_ORGANIZATION_ID!,
      parameters: {
        userId: TURNKEY_IMPORT_USER_ID!,
      },
    })

    const importBundle =
      (initResult as any)?.activity?.result?.initImportPrivateKeyResult?.importBundle

    if (!importBundle) {
      return NextResponse.json(
        { error: 'Failed to obtain import bundle from Turnkey' },
        { status: 500 }
      )
    }

    console.log(
      `[TURNKEY-IMPORT-API] Import bundle ready (len=${importBundle.length})`
    )

    return NextResponse.json({
      ok: true,
      importBundle,
      organizationId: TURNKEY_ORGANIZATION_ID,
      userId: TURNKEY_IMPORT_USER_ID,
      bundleLength: importBundle.length,
    })
  } catch (error: any) {
    console.error('[TURNKEY-IMPORT-API] Init bundle error:', error.message)
    return NextResponse.json(
      { error: error.message || 'Failed to load import bundle' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/turnkey/import-private-key
 * 
 * Import encrypted private key bundle to Turnkey
 * 
 * Security:
 * - Accepts ONLY encrypted bundles (no plaintext keys)
 * - Validates request doesn't contain raw key patterns
 * - Does not log request bodies
 * - Uses org API key auth to import to Turnkey
 */
export async function POST(request: NextRequest) {
  // SECURITY: Using secure logger - no sensitive data logged
  logInfo('turnkey_import_request', { endpoint: 'import-private-key' })

  if (!TURNKEY_ENABLED) {
    return NextResponse.json(
      { error: 'Turnkey is not enabled' },
      { status: 503 }
    )
  }

  // Step 1: Validate TURNKEY_IMPORT_USER_ID is set (deterministic env check)
  const importUserIdPresent = !!TURNKEY_IMPORT_USER_ID
  logInfo('turnkey_env_check', { import_user_id_present: importUserIdPresent })
  
  if (!importUserIdPresent) {
    logError('turnkey_import_config_missing', { missing_var: 'TURNKEY_IMPORT_USER_ID' })
    return NextResponse.json(
      { ok: false, error: 'TURNKEY_IMPORT_USER_ID missing' },
      { status: 500 }
    )
  }

  const missingEnv: string[] = []
  if (!TURNKEY_IMPORT_API_PUBLIC_KEY) missingEnv.push('TURNKEY_IMPORT_API_PUBLIC_KEY')
  if (!TURNKEY_IMPORT_API_PRIVATE_KEY) missingEnv.push('TURNKEY_IMPORT_API_PRIVATE_KEY')
  if (!TURNKEY_ORGANIZATION_ID) missingEnv.push('TURNKEY_ORGANIZATION_ID')

  if (missingEnv.length > 0) {
    logError('turnkey_import_missing_env', { missing_vars: missingEnv })
    return NextResponse.json(
      { ok: false, error: 'Missing env: ' + missingEnv.join(', ') },
      { status: 500 }
    )
  }

  try {
    const importClient = getImportClient()

    // Use centralized secure auth utility
    // This endpoint supports both Bearer token and cookie-based auth
    let userId: string | null = null
    const authHeader = request.headers.get('authorization')
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (bearerToken) {
      // Bearer token auth
      const supabaseAuth = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
      const { data: { user } } = await supabaseAuth.auth.getUser(bearerToken)
      userId = user?.id ?? null
    } else {
      // Cookie-based auth (uses centralized utility)
      userId = await getAuthenticatedUserId(request)
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized - please log in', stage: 'auth' },
        { status: 401 }
      )
    }

    // SECURITY: Rate limit private key import (CRITICAL tier)
    const rateLimitResult = await checkRateLimit(request, 'CRITICAL', userId, 'ip-user')
    if (!rateLimitResult.success) {
      return rateLimitedResponse(rateLimitResult)
    }

    // Parse request body
    const body = await request.json()

    // Step 2: Log payload SHAPE only (server-side)
    console.log('[TURNKEY-IMPORT] body keys=' + Object.keys(body).join(','))
    
    const { polymarket_account_address, encryptedBundle } = body
    
    if (encryptedBundle !== undefined) {
      const bundleType = typeof encryptedBundle
      const isArray = Array.isArray(encryptedBundle)
      const isObject = bundleType === 'object' && !isArray
      const bundleLen = bundleType === 'string' ? encryptedBundle.length : 
                       (isArray ? encryptedBundle.length : 'N/A')
      console.log('[TURNKEY-IMPORT] encryptedBundle type=' + bundleType + 
                  ' isArray=' + isArray + ' isObject=' + isObject + ' len=' + bundleLen)
    }

    // Security check: reject requests containing raw private keys
    if (containsRawPrivateKey(body)) {
      // SECURITY ALERT: Attempted to send raw private key
      logError('security_alert_raw_private_key', { 
        user_id: userId,
        pattern_detected: 'raw_key_pattern'
      })
      return NextResponse.json(
        { error: 'Invalid request: raw private keys are not allowed' },
        { status: 400 }
      )
    }

    // Validate required fields
    if (!polymarket_account_address) {
      return NextResponse.json(
        { error: 'polymarket_account_address is required', stage: 'parse' },
        { status: 400 }
      )
    }

    if (!encryptedBundle) {
      return NextResponse.json(
        { error: 'encryptedBundle is required', stage: 'parse' },
        { status: 400 }
      )
    }

    // Step 4: Validate and normalize encrypted bundle format
    // Accept either:
    // 1. JSON string (from formatHpkeBuf) - preferred format
    // 2. Hex string (legacy) - will be handled by backward compatibility
    // 3. Object with ciphertext/encappedPublic (JSON already parsed)
    let normalizedBundle: string
    
    if (typeof encryptedBundle === 'string') {
      // Could be JSON string or hex string
      if (encryptedBundle.length < 50) {
        return NextResponse.json(
          { ok: false, error: 'Invalid encryptedBundle format: too short', stage: 'parse' },
          { status: 400 }
        )
      }
      normalizedBundle = encryptedBundle
    } else if (typeof encryptedBundle === 'object' && encryptedBundle !== null) {
      // Client sent parsed JSON object - re-stringify it
      normalizedBundle = JSON.stringify(encryptedBundle)
      console.log('[TURNKEY-IMPORT] Received object, stringified to JSON')
    } else {
      return NextResponse.json(
        { ok: false, error: 'Invalid encryptedBundle format: must be string or object', stage: 'parse' },
        { status: 400 }
      )
    }

    // SECURITY: Only log user ID, not bundle contents
    logInfo('turnkey_import_start', { user_id: userId })
    // DO NOT log the encrypted bundle or any request body data

    // Idempotency: Check if already imported in DB before calling Turnkey
    // Reuse the supabase client created above for auth
    const { data: existingWallet } = await supabaseAdmin
      .from('turnkey_wallets')
      .select('user_id, turnkey_private_key_id, eoa_address, wallet_type')
      .eq('user_id', userId)
      .maybeSingle()

    if (existingWallet?.wallet_type === 'imported_magic') {
      logInfo('turnkey_wallet_already_exists', { user_id: userId })
      return NextResponse.json({
        ok: true,
        status: 'already_imported',
        walletId: existingWallet.turnkey_private_key_id,
        address: existingWallet.eoa_address,
        alreadyImported: true,
      })
    }

    const privateKeyName = `imported-magic-${userId}-${Date.now()}`
    console.log(
      `[TURNKEY-IMPORT-API] Importing encrypted bundle (len=${normalizedBundle.length})`
    )

    let privateKeyId: string | undefined
    let addresses: Array<{ address?: string }> = []
    let importStatus: 'imported' | 'already_imported' = 'imported'

    try {
      const importResponse = await importClient.importPrivateKey({
        type: 'ACTIVITY_TYPE_IMPORT_PRIVATE_KEY',
        timestampMs: String(Date.now()),
        organizationId: TURNKEY_ORGANIZATION_ID!,
        parameters: {
          userId: TURNKEY_IMPORT_USER_ID!,
          privateKeyName,
          encryptedBundle: normalizedBundle,
          curve: 'CURVE_SECP256K1',
          addressFormats: ['ADDRESS_FORMAT_ETHEREUM'],
        },
      })

      const activity = (importResponse as any)?.activity
      const importResult =
        activity?.result?.importPrivateKeyResult ||
        activity?.result?.importPrivateKeyResultV2

      if (!activity || activity.status !== 'ACTIVITY_STATUS_COMPLETED') {
        throw new Error(
          `Turnkey import activity not completed (status=${activity?.status || 'unknown'})`
        )
      }

      privateKeyId = importResult?.privateKeyId
      addresses = importResult?.addresses || []
    } catch (turnkeyErr: any) {
      if (!isAlreadyImportedTurnkeyError(turnkeyErr)) {
        throw turnkeyErr
      }

      importStatus = 'already_imported'
      const privateKeyIdFromError = extractPrivateKeyIdFromError(turnkeyErr)
      console.warn(
        '[TURNKEY-IMPORT-API] Turnkey reports key already imported, reconciling with existing record'
      )
      const existingKey = await fetchExistingPrivateKey(
        importClient,
        userId,
        privateKeyIdFromError
      )
      if (!existingKey) {
        throw new StageError(
          'turnkey_import',
          'Turnkey indicates key exists but metadata could not be retrieved'
        )
      }
      privateKeyId = existingKey.privateKeyId
      addresses = existingKey.addresses || []
    }

    const address = addresses[0]?.address

    if (!privateKeyId || !address) {
      throw new Error('Import result missing privateKeyId or address')
    }

    const { data: upsertedWallet, error: upsertError } = await supabaseAdmin
      .from('turnkey_wallets')
      .upsert(
        {
          user_id: userId,
          turnkey_wallet_id: privateKeyId,
          turnkey_sub_org_id: TURNKEY_ORGANIZATION_ID!,
          turnkey_private_key_id: privateKeyId,
          eoa_address: address,
          polymarket_account_address,
          wallet_type: 'imported_magic',
        },
        { onConflict: 'user_id' }
      )
      .select('turnkey_private_key_id, eoa_address')
      .single()

    if (upsertError) {
      logError('turnkey_wallet_store_failed', { 
        user_id: userId,
        error_code: upsertError.code,
        error_message: upsertError.message 
      })
      throw new StageError('db_upsert', upsertError.message || 'Failed to store wallet reference')
    }

    logInfo('turnkey_import_success', { user_id: userId, wallet_id: upsertedWallet.turnkey_private_key_id })

    const alreadyImported = importStatus === 'already_imported'

    return NextResponse.json({
      ok: true,
      status: importStatus,
      walletId: upsertedWallet.turnkey_private_key_id,
      address: upsertedWallet.eoa_address,
      alreadyImported,
    })
  } catch (error: any) {
    const stage = error?.stage || 'turnkey_import'
    const status = error?.status || 500
    // SECURITY: Log error without exposing sensitive details
    logError('turnkey_import_failed', { 
      stage,
      error_type: error.name,
      error_message: error.message
    })
    // DO NOT log error.stack as it might contain sensitive data
    return NextResponse.json(
      { error: error.message || 'Failed to import private key', stage },
      { status }
    )
  }
}
