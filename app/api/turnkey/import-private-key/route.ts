import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TURNKEY_ENABLED, TURNKEY_IMPORT_USER_ID } from '@/lib/turnkey/config'
import { importEncryptedPrivateKey } from '@/lib/turnkey/import'

// Dev bypass
const DEV_BYPASS_AUTH = process.env.NODE_ENV === 'development' && process.env.TURNKEY_DEV_BYPASS_USER_ID

// Security: Reject any request containing raw private key patterns
const RAW_KEY_PATTERNS = [
  /privateKey/i,
  /private_key/i,
  /\b[0-9a-fA-F]{64}\b/, // 64 hex chars (without 0x)
  /\b0x[0-9a-fA-F]{64}\b/, // 64 hex chars (with 0x)
]

function containsRawPrivateKey(body: any): boolean {
  const bodyStr = JSON.stringify(body)
  return RAW_KEY_PATTERNS.some(pattern => pattern.test(bodyStr))
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
  console.log('[TURNKEY-IMPORT-API] Import request received')

  if (!TURNKEY_ENABLED) {
    return NextResponse.json(
      { error: 'Turnkey is not enabled' },
      { status: 503 }
    )
  }

  // Step 1: Validate TURNKEY_IMPORT_USER_ID is set (deterministic env check)
  const importUserIdPresent = !!TURNKEY_IMPORT_USER_ID
  console.log('[TURNKEY-ENV] importUserIdPresent=' + importUserIdPresent)
  
  if (!importUserIdPresent) {
    console.error('[TURNKEY-IMPORT-API] TURNKEY_IMPORT_USER_ID is not defined')
    return NextResponse.json(
      { ok: false, error: 'TURNKEY_IMPORT_USER_ID missing' },
      { status: 500 }
    )
  }

  try {
    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    let userId: string | null = null

    if (user?.id) {
      userId = user.id
    } else if (DEV_BYPASS_AUTH && process.env.TURNKEY_DEV_BYPASS_USER_ID) {
      userId = process.env.TURNKEY_DEV_BYPASS_USER_ID
      console.log('[TURNKEY-IMPORT-API] DEV BYPASS: Using env user:', userId)
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized - please log in' },
        { status: 401 }
      )
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
      console.error('[TURNKEY-IMPORT-API] SECURITY ALERT: Request contains raw private key pattern')
      return NextResponse.json(
        { error: 'Invalid request: raw private keys are not allowed' },
        { status: 400 }
      )
    }

    // Validate required fields
    if (!polymarket_account_address) {
      return NextResponse.json(
        { error: 'polymarket_account_address is required' },
        { status: 400 }
      )
    }

    if (!encryptedBundle) {
      return NextResponse.json(
        { error: 'encryptedBundle is required' },
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
          { ok: false, error: 'Invalid encryptedBundle format: too short' },
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
        { ok: false, error: 'Invalid encryptedBundle format: must be string or object' },
        { status: 400 }
      )
    }

    console.log('[TURNKEY-IMPORT-API] Importing encrypted bundle for user:', userId)
    // DO NOT log the encrypted bundle or any request body data

    // Idempotency: Check if already imported in DB before calling Turnkey
    // Reuse the supabase client created above for auth
    const { data: existingWallet } = await supabase
      .from('turnkey_wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('polymarket_account_address', polymarket_account_address)
      .eq('wallet_type', 'imported_magic')
      .single()

    if (existingWallet) {
      console.log('[TURNKEY-IMPORT-API] Wallet already imported (DB), returning existing')
      return NextResponse.json({
        ok: true,
        status: 'already_imported',
        walletId: existingWallet.turnkey_private_key_id,
        address: existingWallet.eoa_address,
        alreadyImported: true,
      })
    }

    // Import the encrypted private key
    const result = await importEncryptedPrivateKey(
      userId,
      polymarket_account_address,
      normalizedBundle
    )

    console.log('[TURNKEY-IMPORT-API] Import successful, status:', result.status || 'new')

    return NextResponse.json({
      ok: true,
      status: result.status || 'imported',
      walletId: result.walletId,
      address: result.address,
      alreadyImported: result.alreadyImported,
    })
  } catch (error: any) {
    console.error('[TURNKEY-IMPORT-API] Import error:', error.message)
    // DO NOT log error.stack as it might contain sensitive data
    return NextResponse.json(
      { error: error.message || 'Failed to import private key' },
      { status: 500 }
    )
  }
}

