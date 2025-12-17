import { getTurnkeyClient } from './client'
import { createClient } from '@supabase/supabase-js'
import { createActivityPoller } from '@turnkey/http'

const supabaseServiceRole = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

export interface TurnkeyImportInitResult {
  organizationId: string
  walletName: string
  iframeUrl: string
  activityId: string
}

export interface TurnkeyImportCompleteResult {
  walletId: string
  address: string
  alreadyImported: boolean
}

/**
 * Initialize Turnkey import ceremony for private key import
 * 
 * Creates an ACTIVITY_TYPE_IMPORT_WALLET activity and returns iframe URL
 * The user will paste their private key into the Turnkey iframe (not our app)
 * 
 * The private key is collected by Turnkey's iframe and NEVER sent to our backend
 */
export async function initTurnkeyImport(
  userId: string
): Promise<TurnkeyImportInitResult> {
  const client = getTurnkeyClient()
  if (!client) {
    throw new Error('Turnkey client not available')
  }

  console.log('[POLY-AUTH] Initializing Turnkey import for user:', userId)

  // Check if user already has an imported wallet (idempotency)
  const { data: existing } = await supabaseServiceRole
    .from('turnkey_wallets')
    .select('*')
    .eq('user_id', userId)
    .eq('wallet_type', 'imported_magic')
    .single()

  if (existing) {
    console.log('[POLY-AUTH] User already has imported wallet:', existing.eoa_address)
    throw new Error('You have already imported a wallet. Cannot import another one.')
  }

  // Create unique wallet name for this import
  const walletName = `imported-${userId}-${Date.now()}`

  console.log('[POLY-AUTH] Creating import wallet activity...')
  console.log('[POLY-AUTH] Wallet name:', walletName)
  console.log('[POLY-AUTH] Organization ID:', client.config.organizationId)

  try {
    // Create the import wallet activity
    const importActivityResponse = await client.turnkeyClient.importWallet({
      organizationId: client.config.organizationId,
      timestampMs: String(Date.now()),
      type: 'ACTIVITY_TYPE_IMPORT_WALLET',
      parameters: {
        walletName,
        accounts: [
          {
            curve: 'CURVE_SECP256K1',
            addressFormat: 'ADDRESS_FORMAT_ETHEREUM',
            pathFormat: 'PATH_FORMAT_BIP32',
            path: "m/44'/60'/0'/0/0",
          },
        ],
      },
    })

    const activityId = importActivityResponse.activity.id
    console.log('[POLY-AUTH] Import activity created:', activityId)

    // Generate iframe URL for this import activity
    // The Turnkey iframe URL follows the pattern:
    // https://auth.turnkey.com/turnkey/{orgId}/{activityType}/{activityId}
    const iframeUrl = `https://auth.turnkey.com/turnkey/${client.config.organizationId}/import/${activityId}`

    return {
      organizationId: client.config.organizationId,
      walletName,
      iframeUrl,
      activityId,
    }
  } catch (error: any) {
    console.error('[POLY-AUTH] Failed to create import activity:', error)
    throw new Error(`Failed to initialize import: ${error.message}`)
  }
}

/**
 * Complete Turnkey import by polling for activity completion
 * 
 * Polls the import activity until it completes (or fails/times out)
 * Then stores the wallet reference in our database
 */
export async function completeTurnkeyImport(
  userId: string,
  activityId: string,
  walletName: string
): Promise<TurnkeyImportCompleteResult> {
  const client = getTurnkeyClient()
  if (!client) {
    throw new Error('Turnkey client not available')
  }

  console.log('[POLY-AUTH] Completing import for user:', userId)
  console.log('[POLY-AUTH] Activity ID:', activityId)

  // Check if already stored (idempotency)
  const { data: existing } = await supabaseServiceRole
    .from('turnkey_wallets')
    .select('*')
    .eq('user_id', userId)
    .eq('wallet_type', 'imported_magic')
    .single()

  if (existing) {
    console.log('[POLY-AUTH] Wallet already stored in DB')
    return {
      walletId: existing.turnkey_wallet_id,
      address: existing.eoa_address,
      alreadyImported: true,
    }
  }

  try {
    // Poll for activity completion
    console.log('[POLY-AUTH] Polling for activity completion...')
    const poller = createActivityPoller({
      client: client.turnkeyClient,
      requestFn: (input: { organizationId: string; activityId: string }) =>
        client.turnkeyClient.getActivity(input),
    })

    const completedActivity = await poller({
      organizationId: client.config.organizationId,
      activityId,
    })

    if (completedActivity.status !== 'ACTIVITY_STATUS_COMPLETED') {
      throw new Error(
        `Import activity failed with status: ${completedActivity.status}`
      )
    }

    const walletId = completedActivity.result?.importWalletResult?.walletId
    const addresses = completedActivity.result?.importWalletResult?.walletAddresses

    if (!walletId || !addresses || addresses.length === 0) {
      throw new Error('Import completed but wallet ID or address not found in result')
    }

    const address = addresses[0].address

    console.log('[POLY-AUTH] Import completed successfully')
    console.log('[POLY-AUTH] Wallet ID:', walletId)
    console.log('[POLY-AUTH] Address:', address)

    // Store wallet reference in database
    const { error: insertError } = await supabaseServiceRole
      .from('turnkey_wallets')
      .insert({
        user_id: userId,
        turnkey_wallet_id: walletId,
        turnkey_sub_org_id: 'N/A',
        turnkey_private_key_id: 'N/A',
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
          return {
            walletId: reFetched.turnkey_wallet_id,
            address: reFetched.eoa_address,
            alreadyImported: true,
          }
        }
      }

      console.error('[POLY-AUTH] Failed to store imported wallet:', insertError)
      throw new Error(`Failed to store wallet: ${insertError.message}`)
    }

    console.log('[POLY-AUTH] Imported wallet stored successfully')

    return {
      walletId,
      address,
      alreadyImported: false,
    }
  } catch (error: any) {
    console.error('[POLY-AUTH] Error completing import:', error.message)
    throw new Error(`Failed to complete import: ${error.message}`)
  }
}
