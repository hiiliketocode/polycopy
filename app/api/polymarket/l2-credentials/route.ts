import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { TURNKEY_ENABLED, CLOB_ENCRYPTION_KEY } from '@/lib/turnkey/config'
import { createTurnkeySigner } from '@/lib/polymarket/turnkey-signer'
import { createOrDeriveApiCredentials, SignatureType } from '@/lib/polymarket/clob'
import { createHash, createCipheriv, randomBytes } from 'crypto'

// Dev bypass for local testing
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
 * POST /api/polymarket/l2-credentials
 * 
 * Generate or derive CLOB L2 API credentials using official Polymarket client
 * - Uses @polymarket/clob-client with Turnkey EIP-712 signer
 * - Calls createOrDeriveApiKey() for proper L1 authentication
 * - Stores encrypted credentials in DB
 * - Fully idempotent
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

    const { polymarketAccountAddress, signatureType } = await request.json()

    if (!polymarketAccountAddress) {
      return NextResponse.json(
        { error: 'polymarketAccountAddress is required' },
        { status: 400 }
      )
    }

    // Parse signature type (default to 0 = EOA)
    const sigType: SignatureType = signatureType !== undefined ? signatureType : 0
    console.log('[POLY-CLOB] Signature type:', sigType, '(0=EOA, 1=POLY_PROXY, 2=GNOSIS_SAFE)')
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

    // 2. Create Turnkey signer with EIP-712 support
    console.log('[POLY-CLOB] Creating Turnkey signer for user:', userId)
    let signer
    try {
      signer = await createTurnkeySigner(userId, supabaseServiceRole)
    } catch (signerError: any) {
      console.error('[POLY-CLOB] Failed to create signer:', signerError.message)
      return NextResponse.json(
        { 
          error: signerError.message,
          hint: 'Make sure you have created a Turnkey wallet first (Stage 1)'
        },
        { status: 400 }
      )
    }

    const turnkeyAddress = signer.address
    console.log('[POLY-CLOB] Using Turnkey EOA address:', turnkeyAddress)

    // 3. Call official Polymarket CLOB client to create/derive API key
    console.log('[POLY-CLOB] Calling Polymarket createOrDeriveApiKey()...')
    let apiCreds
    try {
      apiCreds = await createOrDeriveApiCredentials(signer, sigType)
    } catch (clobError: any) {
      console.error('[POLY-CLOB] CLOB API call failed:', clobError.message)
      return NextResponse.json(
        { 
          error: 'Failed to create CLOB API key',
          details: clobError.message,
          debugInfo: {
            turnkeyAddress,
            signatureType: sigType,
            polymarketAccountAddress,
          }
        },
        { status: 500 }
      )
    }

    const { apiKey, secret, passphrase } = apiCreds
    console.log('[POLY-CLOB] API key created successfully:', apiKey.substring(0, 10) + '...')

    // 4. Encrypt sensitive data (never expose to client)
    const secretEncrypted = encryptSecret(secret)
    const passphraseEncrypted = encryptSecret(passphrase)

    // 5. Validate credentials by checking if they were successfully created
    // The createOrDeriveApiKey() call succeeding means they're valid
    const validated = true

    // 6. Store in database
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
        last_validated_at: new Date().toISOString(),
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

    // 7. Return success (never return secret or passphrase!)
    return NextResponse.json({
      ok: true,
      apiKey: apiKey,
      validated: validated,
      createdAt: storedCreds.created_at,
      turnkeyAddress: turnkeyAddress,
      polymarketAccountAddress: polymarketAccountAddress,
      signatureType: sigType,
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
