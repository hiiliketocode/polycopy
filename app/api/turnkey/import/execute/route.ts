import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { TURNKEY_ENABLED } from '@/lib/turnkey/config'
import { getTurnkeyClient } from '@/lib/turnkey/client'
import { createActivityPoller } from '@turnkey/http'

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

// Dev bypass for testing
const DEV_BYPASS_AUTH = process.env.NODE_ENV === 'development' && process.env.TURNKEY_DEV_BYPASS_USER_ID

/**
 * POST /api/turnkey/import/execute
 * 
 * Imports a private key into Turnkey
 * The private key is sent from the frontend but immediately imported to Turnkey
 * It's never logged or stored in PolyCopy databases
 * 
 * SECURITY: This is the ONLY place we receive a plaintext private key
 * It must be handled with extreme care
 */
export async function POST(request: NextRequest) {
  console.log('[POLY-AUTH] Import execute request received')

  if (!TURNKEY_ENABLED) {
    return NextResponse.json(
      { error: 'Turnkey is not enabled' },
      { status: 503 }
    )
  }

  let userId: string | null = null

  try {
    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (user?.id) {
      userId = user.id
    } else if (DEV_BYPASS_AUTH && process.env.TURNKEY_DEV_BYPASS_USER_ID) {
      userId = process.env.TURNKEY_DEV_BYPASS_USER_ID
      console.log('[POLY-AUTH] DEV BYPASS: Using env user:', userId)
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized - please log in' },
        { status: 401 }
      )
    }

    const { walletName, privateKey } = await request.json()

    if (!walletName || !privateKey) {
      return NextResponse.json(
        { error: 'walletName and privateKey are required' },
        { status: 400 }
      )
    }

    // Validate private key format
    const cleanKey = privateKey.replace(/^0x/, '')
    if (!/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
      return NextResponse.json(
        { error: 'Invalid private key format' },
        { status: 400 }
      )
    }

    // Check if already imported (idempotency)
    const { data: existing } = await supabaseServiceRole
      .from('turnkey_wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('wallet_type', 'imported_magic')
      .single()

    if (existing) {
      console.log('[POLY-AUTH] Wallet already imported for user')
      return NextResponse.json({
        success: true,
        walletId: existing.turnkey_wallet_id,
        address: existing.eoa_address,
        alreadyImported: true,
      })
    }

    const client = getTurnkeyClient()
    if (!client) {
      throw new Error('Turnkey client not available')
    }

    console.log('[POLY-AUTH] Importing private key to Turnkey...')
    console.log('[POLY-AUTH] Wallet name:', walletName)

    // Import the private key into Turnkey
    const importResponse = await client.turnkeyClient.importPrivateKey({
      organizationId: client.config.organizationId,
      timestampMs: String(Date.now()),
      type: 'ACTIVITY_TYPE_IMPORT_PRIVATE_KEY',
      parameters: {
        privateKeyName: walletName,
        privateKey: cleanKey,
        curve: 'CURVE_SECP256K1',
        addressFormats: ['ADDRESS_FORMAT_ETHEREUM'],
      },
    })

    let importActivity = importResponse.activity

    // Poll for activity completion if pending
    if (importActivity.status === 'ACTIVITY_STATUS_PENDING') {
      const poller = createActivityPoller({
        client: client.turnkeyClient,
        requestFn: (input: { organizationId: string; activityId: string }) =>
          client.turnkeyClient.getActivity(input),
      })

      importActivity = await poller({
        organizationId: client.config.organizationId,
        activityId: importActivity.id,
      })
    }

    if (importActivity.status !== 'ACTIVITY_STATUS_COMPLETED') {
      throw new Error(
        `Import failed with status: ${importActivity.status}`
      )
    }

    const privateKeyId = importActivity.result?.importPrivateKeyResult?.privateKeyId
    const addresses = importActivity.result?.importPrivateKeyResult?.addresses

    if (!privateKeyId || !addresses || addresses.length === 0) {
      throw new Error('Import completed but private key ID or address not found')
    }

    const address = addresses[0].address

    console.log('[POLY-AUTH] Private key imported successfully')
    console.log('[POLY-AUTH] Private Key ID:', privateKeyId)
    console.log('[POLY-AUTH] Address:', address)

    // Store wallet reference in database
    const { error: insertError } = await supabaseServiceRole
      .from('turnkey_wallets')
      .insert({
        user_id: userId,
        turnkey_wallet_id: privateKeyId, // For imported keys, we store the private key ID
        turnkey_sub_org_id: 'N/A',
        turnkey_private_key_id: privateKeyId,
        eoa_address: address,
        polymarket_account_address: '',
        wallet_type: 'imported_magic',
      })

    if (insertError) {
      // Handle race condition
      if (insertError.code === '23505') {
        console.log('[POLY-AUTH] Unique conflict, wallet already stored')
        const { data: reFetched } = await supabaseServiceRole
          .from('turnkey_wallets')
          .select('*')
          .eq('user_id', userId)
          .single()

        if (reFetched) {
          return NextResponse.json({
            success: true,
            walletId: reFetched.turnkey_wallet_id,
            address: reFetched.eoa_address,
            alreadyImported: true,
          })
        }
      }

      console.error('[POLY-AUTH] Failed to store imported wallet:', insertError)
      throw new Error(`Failed to store wallet: ${insertError.message}`)
    }

    console.log('[POLY-AUTH] Imported wallet stored successfully')

    return NextResponse.json({
      success: true,
      walletId: privateKeyId,
      address,
      alreadyImported: false,
    })
  } catch (error: any) {
    console.error('[POLY-AUTH] Import execute error:', error.message)
    return NextResponse.json(
      { error: error.message || 'Failed to import wallet' },
      { status: 500 }
    )
  }
}

