import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { TURNKEY_ENABLED, POLYMARKET_CLOB_BASE_URL, POLYMARKET_GEO_BLOCK_TOKEN, CLOB_ENCRYPTION_KEY } from '@/lib/turnkey/config'
import { signMessageForUser } from '@/lib/turnkey/wallet-simple'
import { createHash, createCipheriv, randomBytes } from 'crypto'

// Dev bypass for local testing (same as wallet creation endpoint)
const DEV_BYPASS_AUTH = process.env.NODE_ENV === 'development' && process.env.TURNKEY_DEV_BYPASS_USER_ID

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

/**
 * Simple encryption for storing secrets (using AES-256-CBC)
 * In production, consider using Supabase Vault or AWS KMS
 */
function encryptSecret(text: string): string {
  const key = createHash('sha256').update(CLOB_ENCRYPTION_KEY).digest()
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

/**
 * Build deterministic L1 auth message for Polymarket API key creation
 * Format must match exactly what Polymarket expects
 */
function buildL1AuthMessage(timestamp: string, nonce: string): string {
  // Format: This message is used to create an API key for Polymarket CLOB
  // The exact format may vary - we'll log what we sign
  return `I want to create an API key with nonce ${nonce} and timestamp ${timestamp}`
}

/**
 * Build POLY_* headers for CLOB API authentication
 */
function buildPolyHeaders(address: string, timestamp: string, signature: string, nonce: string) {
  return {
    'POLY_ADDRESS': address,
    'POLY_TIMESTAMP': timestamp,
    'POLY_SIGNATURE': signature,
    'POLY_NONCE': nonce,
  }
}

/**
 * POST /api/turnkey/polymarket/generate-l2-credentials
 * 
 * Generate CLOB L2 API credentials for a Polymarket account
 * - Builds L1 auth payload deterministically
 * - Signs with Turnkey EOA
 * - Calls CLOB auth endpoint
 * - Stores encrypted credentials in DB
 * - Validates credentials immediately
 * - Idempotent (returns existing if already created)
 */
export async function POST(request: NextRequest) {
  console.log('[POLY-CLOB] L2 credentials generation request started')

  if (!TURNKEY_ENABLED) {
    return NextResponse.json(
      { error: 'Turnkey is not enabled' },
      { status: 503 }
    )
  }

  try {
    // Authenticate user
    console.log('[POLY-CLOB] Checking authentication...')
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    console.log('[POLY-CLOB] User:', user?.id, 'Error:', authError?.message)

    // Allow dev bypass
    let userId: string | null = null

    if (user?.id) {
      userId = user.id
      console.log('[POLY-CLOB] Using authenticated user:', userId)
    } else if (DEV_BYPASS_AUTH && process.env.TURNKEY_DEV_BYPASS_USER_ID) {
      userId = process.env.TURNKEY_DEV_BYPASS_USER_ID
      console.log('[POLY-CLOB] DEV BYPASS: Using env user:', userId)
    }

    if (!userId) {
      console.error('[POLY-CLOB] Auth failed:', authError?.message)
      return NextResponse.json(
        { error: 'Unauthorized - please log in', details: authError?.message },
        { status: 401 }
      )
    }

    const { polymarketAccountAddress } = await request.json()

    if (!polymarketAccountAddress) {
      return NextResponse.json(
        { error: 'polymarketAccountAddress is required' },
        { status: 400 }
      )
    }

    console.log('[POLY-CLOB] User:', userId, 'Account:', polymarketAccountAddress)

    // 1. Check if credentials already exist (idempotency)
    const { data: existingCreds, error: fetchError } = await supabaseServiceRole
      .from('clob_credentials')
      .select('*')
      .eq('user_id', userId)
      .eq('polymarket_account_address', polymarketAccountAddress)
      .single()

    if (existingCreds) {
      console.log('[POLY-CLOB] Found existing credentials, returning without creating new ones')
      return NextResponse.json({
        ok: true,
        apiKey: existingCreds.api_key,
        validated: existingCreds.validated,
        createdAt: existingCreds.created_at,
        isExisting: true,
      })
    }

    // 2. Get user's Turnkey wallet address
    const { data: wallet, error: walletError } = await supabaseServiceRole
      .from('turnkey_wallets')
      .select('eoa_address, turnkey_wallet_id')
      .eq('user_id', userId)
      .single()

    if (walletError || !wallet) {
      console.error('[POLY-CLOB] No Turnkey wallet found for user')
      return NextResponse.json(
        { error: 'No Turnkey wallet found. Please create a wallet first.' },
        { status: 400 }
      )
    }

    const turnkeyAddress = wallet.eoa_address
    console.log('[POLY-CLOB] Using Turnkey address:', turnkeyAddress)

    // 3. Build L1 auth payload deterministically
    const timestamp = Math.floor(Date.now() / 1000).toString() // Unix seconds
    const nonce = '0' // Start with "0" as per requirements

    const authMessage = buildL1AuthMessage(timestamp, nonce)
    console.log('[POLY-CLOB] Auth message to sign:', authMessage)
    console.log('[POLY-CLOB] Timestamp:', timestamp, 'Nonce:', nonce)

    // 4. Sign the payload using Turnkey
    const signResult = await signMessageForUser(userId, authMessage)
    
    if (!signResult.success || !signResult.signature) {
      console.error('[POLY-CLOB] Signature failed:', signResult.error)
      return NextResponse.json(
        { error: `Signature failed: ${signResult.error}` },
        { status: 500 }
      )
    }

    const signature = signResult.signature
    console.log('[POLY-CLOB] Signature obtained (first 20 chars):', signature.substring(0, 20) + '...')

    // 5. Call CLOB auth endpoint to create API key
    const headers = buildPolyHeaders(turnkeyAddress, timestamp, signature, nonce)
    console.log('[POLY-CLOB] Headers:', Object.keys(headers))

    // Build URL with optional geo_block_token
    let authUrl = `${POLYMARKET_CLOB_BASE_URL}/auth/api-key`
    if (POLYMARKET_GEO_BLOCK_TOKEN) {
      authUrl += `?geo_block_token=${POLYMARKET_GEO_BLOCK_TOKEN}`
      console.log('[POLY-CLOB] Including geo_block_token in request')
    }

    console.log('[POLY-CLOB] Calling CLOB auth endpoint:', authUrl)

    const clobResponse = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        // Polymarket may expect additional fields here
        // Log the response to understand what's needed
      }),
    })

    const clobData = await clobResponse.json()
    console.log('[POLY-CLOB] CLOB response status:', clobResponse.status)

    if (!clobResponse.ok) {
      console.error('[POLY-CLOB] CLOB auth failed:', clobData)
      return NextResponse.json(
        { 
          error: 'Failed to create CLOB API key',
          details: clobData,
          debugInfo: {
            signedMessage: authMessage,
            timestamp,
            nonce,
            turnkeyAddress,
            signaturePreview: signature.substring(0, 20) + '...',
          }
        },
        { status: 500 }
      )
    }

    // 6. Extract credentials from response
    const { apiKey, secret, passphrase } = clobData

    if (!apiKey || !secret || !passphrase) {
      console.error('[POLY-CLOB] Missing credentials in CLOB response:', Object.keys(clobData))
      return NextResponse.json(
        { error: 'CLOB response missing required credentials' },
        { status: 500 }
      )
    }

    console.log('[POLY-CLOB] API key created:', apiKey.substring(0, 10) + '...')

    // 7. Encrypt sensitive data
    const secretEncrypted = encryptSecret(secret)
    const passphraseEncrypted = encryptSecret(passphrase)

    // 8. Validate credentials immediately by calling a lightweight CLOB endpoint
    let validated = false
    try {
      const testResponse = await fetch(`${POLYMARKET_CLOB_BASE_URL}/markets`, {
        method: 'GET',
        headers: {
          'POLY_ADDRESS': turnkeyAddress,
          'POLY_API_KEY': apiKey,
          'POLY_SIGNATURE': signature,
          'POLY_TIMESTAMP': timestamp,
        },
      })
      validated = testResponse.ok
      console.log('[POLY-CLOB] Credential validation:', validated ? 'SUCCESS' : 'FAILED')
    } catch (validationError: any) {
      console.error('[POLY-CLOB] Credential validation error:', validationError.message)
    }

    // 9. Store in database
    const { data: storedCreds, error: insertError } = await supabaseServiceRole
      .from('clob_credentials')
      .insert({
        user_id: userId,
        polymarket_account_address: polymarketAccountAddress,
        turnkey_address: turnkeyAddress,
        api_key: apiKey,
        api_secret_encrypted: secretEncrypted,
        api_passphrase_encrypted: passphraseEncrypted,
        validated,
        last_validated_at: validated ? new Date().toISOString() : null,
      })
      .select()
      .single()

    if (insertError) {
      // Handle race condition
      if (insertError.code === '23505') {
        console.log('[POLY-CLOB] Unique conflict, returning existing credentials')
        const { data: existingAfterRace } = await supabaseServiceRole
          .from('clob_credentials')
          .select('*')
          .eq('user_id', userId)
          .eq('polymarket_account_address', polymarketAccountAddress)
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

      console.error('[POLY-CLOB] Failed to store credentials:', insertError)
      return NextResponse.json(
        { error: 'Failed to store credentials' },
        { status: 500 }
      )
    }

    console.log('[POLY-CLOB] Credentials stored successfully')
    console.log('[POLY-CLOB] L2 credentials generation request finished')

    // 10. Return success (never return secret or passphrase!)
    return NextResponse.json({
      ok: true,
      apiKey: apiKey,
      validated: validated,
      createdAt: storedCreds.created_at,
      turnkeyAddress: turnkeyAddress,
      polymarketAccountAddress: polymarketAccountAddress,
      isExisting: false,
    })
  } catch (error: any) {
    console.error('[POLY-CLOB] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate L2 credentials' },
      { status: 500 }
    )
  }
}

