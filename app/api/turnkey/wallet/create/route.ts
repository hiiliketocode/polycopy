import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { TURNKEY_ENABLED } from '@/lib/turnkey/config'
import { getTurnkeyClient } from '@/lib/turnkey/client'
import { createActivityPoller } from '@turnkey/http'

const DEV_BYPASS_AUTH =
  process.env.TURNKEY_DEV_ALLOW_UNAUTH === 'true' &&
  Boolean(process.env.TURNKEY_DEV_BYPASS_USER_ID)

const supabaseServiceRole = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/turnkey/wallet/create
 * 
 * Creates or retrieves a Turnkey wallet for the authenticated user.
 * This endpoint is TRULY IDEMPOTENT - calling it multiple times for the same user
 * will ALWAYS return the same wallet without creating duplicates.
 * 
 * Input: None (uses authenticated user's ID)
 * Output: { walletId, address }
 */
export async function POST() {
  console.log('[TURNKEY] Request received')
  
  if (!TURNKEY_ENABLED) {
    console.log('[TURNKEY] Turnkey disabled')
    return NextResponse.json(
      { error: 'Turnkey is not enabled' },
      { status: 503 }
    )
  }

  // Authenticate user
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  // Allow dev bypass
  let userId: string | null = null
  
  if (user?.id) {
    userId = user.id
  } else if (DEV_BYPASS_AUTH && process.env.TURNKEY_DEV_BYPASS_USER_ID) {
    userId = process.env.TURNKEY_DEV_BYPASS_USER_ID
    console.log('[TURNKEY] DEV BYPASS: Using env user:', userId)
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized - please log in', details: authError?.message },
      { status: 401 }
    )
  }

  try {
    // STEP 1: Check if wallet already exists in database
    const { data: existing, error: selectError } = await supabaseServiceRole
      .from('turnkey_wallets')
      .select('turnkey_wallet_id, eoa_address')
      .eq('user_id', userId)
      .single()

    if (existing && !selectError) {
      console.log(`[TURNKEY] found existing wallet for user ${userId}`)
      return NextResponse.json({
        walletId: existing.turnkey_wallet_id,
        address: existing.eoa_address,
        isNew: false,
      })
    }

    // STEP 2: No existing wallet found - create a new one
    console.log(`[TURNKEY] created new wallet for user ${userId}`)

    const client = getTurnkeyClient()
    if (!client) {
      throw new Error('Turnkey client not available')
    }

    const walletName = `wallet-${userId}-${Date.now()}`
    
    // Create wallet in Turnkey
    const createWalletResponse = await client.turnkeyClient.createWallet({
      organizationId: client.config.organizationId,
      timestampMs: String(Date.now()),
      type: 'ACTIVITY_TYPE_CREATE_WALLET',
      parameters: {
        walletName,
        accounts: [
          {
            curve: 'CURVE_SECP256K1',
            pathFormat: 'PATH_FORMAT_BIP32',
            path: "m/44'/60'/0'/0/0",
            addressFormat: 'ADDRESS_FORMAT_ETHEREUM',
          },
        ],
      },
    })

    let walletActivity = createWalletResponse.activity
    
    // Poll for activity completion if pending
    if (walletActivity.status === 'ACTIVITY_STATUS_PENDING') {
      const poller = createActivityPoller({
        client: client.turnkeyClient,
        requestFn: (input: { organizationId: string; activityId: string }) =>
          client.turnkeyClient.getActivity(input),
      })
      
      walletActivity = await poller({
        organizationId: client.config.organizationId,
        activityId: walletActivity.id,
      })
    }

    if (walletActivity.status !== 'ACTIVITY_STATUS_COMPLETED') {
      throw new Error(
        `Wallet creation failed with status: ${walletActivity.status}`
      )
    }

    const walletId = walletActivity.result?.createWalletResult?.walletId
    const addresses = walletActivity.result?.createWalletResult?.addresses
    
    if (!walletId || !addresses || addresses.length === 0) {
      throw new Error('Wallet ID or address not found in activity result')
    }

    const address = addresses[0]

    // STEP 3: Store wallet in database with race condition handling
    const { error: insertError } = await supabaseServiceRole
      .from('turnkey_wallets')
      .insert({
        user_id: userId,
        turnkey_sub_org_id: client.config.organizationId,
        turnkey_wallet_id: walletId,
        turnkey_private_key_id: '',
        eoa_address: address,
        polymarket_account_address: '',
        wallet_type: 'turnkey_managed',
      })

    // STEP 4: Handle race condition - if unique constraint violation, return existing
    if (insertError) {
      // Check if it's a unique constraint violation (race condition)
      if (insertError.code === '23505' || insertError.message?.includes('duplicate key') || 
          insertError.message?.includes('unique constraint')) {
        console.log(`[TURNKEY] unique conflict, returning existing wallet for user ${userId}`)
        
        // Re-query to get the wallet that was inserted by the other request
        const { data: existingAfterRace, error: reSelectError } = await supabaseServiceRole
          .from('turnkey_wallets')
          .select('turnkey_wallet_id, eoa_address')
          .eq('user_id', userId)
          .single()

        if (existingAfterRace && !reSelectError) {
          return NextResponse.json({
            walletId: existingAfterRace.turnkey_wallet_id,
            address: existingAfterRace.eoa_address,
            isNew: false,
          })
        }
      }
      
      // If it's not a race condition, throw the error
      throw new Error(`Failed to store wallet: ${insertError.message}`)
    }

    // Success - new wallet created and stored
    return NextResponse.json({
      walletId,
      address,
      isNew: true,
    })

  } catch (error: any) {
    console.error('[TURNKEY] Wallet creation error:', error.message)
    return NextResponse.json(
      { error: error.message || 'Failed to create wallet' },
      { status: 500 }
    )
  }
}
