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
  iframeUrl: string
  importId: string
  organizationId: string
}

export interface TurnkeyImportCompletePayload {
  importId: string
  walletId: string
  address: string
}

/**
 * Initialize Turnkey import ceremony for Magic Link private key
 * Returns iframe URL and import session ID
 * 
 * The iframe handles the private key securely - PolyCopy never sees it
 */
export async function initTurnkeyImport(
  userId: string
): Promise<TurnkeyImportInitResult> {
  const client = getTurnkeyClient()
  if (!client) {
    throw new Error('Turnkey client not available')
  }

  console.log('[POLY-AUTH] Initializing Turnkey import for user:', userId)

  // Create import wallet activity
  // The user will paste their Magic Link private key into the Turnkey iframe
  const walletName = `imported-magic-${userId}-${Date.now()}`
  
  const initResponse = await client.turnkeyClient.createWallet({
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

  const importId = initResponse.activity.id

  // Construct Turnkey iframe URL for import
  // The iframe is hosted by Turnkey and handles the private key securely
  const iframeUrl = `https://auth.turnkey.com/import?organizationId=${client.config.organizationId}&importId=${importId}`

  console.log('[POLY-AUTH] Import initialized, ID:', importId)
  console.log('[POLY-AUTH] Iframe URL constructed (Turnkey-hosted)')

  return {
    iframeUrl,
    importId,
    organizationId: client.config.organizationId,
  }
}

/**
 * Complete Turnkey import after user has pasted private key in iframe
 * Polls for activity completion and stores wallet reference in DB
 */
export async function completeTurnkeyImport(
  userId: string,
  importId: string
): Promise<TurnkeyImportCompletePayload> {
  const client = getTurnkeyClient()
  if (!client) {
    throw new Error('Turnkey client not available')
  }

  console.log('[POLY-AUTH] Completing import for user:', userId, 'importId:', importId)

  // Poll for import activity completion
  const poller = createActivityPoller({
    client: client.turnkeyClient,
    requestFn: (input: { organizationId: string; activityId: string }) =>
      client.turnkeyClient.getActivity(input),
  })

  let activity
  try {
    activity = await poller({
      organizationId: client.config.organizationId,
      activityId: importId,
    })
  } catch (error: any) {
    console.error('[POLY-AUTH] Import polling failed:', error.message)
    throw new Error(`Import failed: ${error.message}`)
  }

  if (activity.status !== 'ACTIVITY_STATUS_COMPLETED') {
    throw new Error(`Import failed with status: ${activity.status}`)
  }

  const result = activity.result?.createWalletResult
  if (!result || !result.walletId || !result.walletAddresses?.[0]?.address) {
    throw new Error('Wallet ID or address not found in import result')
  }

  const walletId = result.walletId
  const address = result.walletAddresses[0].address

  console.log('[POLY-AUTH] Import completed - Wallet ID:', walletId, 'Address:', address)

  // Store wallet reference in database
  const { error: insertError } = await supabaseServiceRole
    .from('turnkey_wallets')
    .upsert({
      user_id: userId,
      turnkey_wallet_id: walletId,
      turnkey_sub_org_id: 'N/A',
      turnkey_private_key_id: 'N/A',
      eoa_address: address,
      polymarket_account_address: '',
      wallet_type: 'imported_magic',
    }, {
      onConflict: 'user_id'
    })

  if (insertError) {
    console.error('[POLY-AUTH] Failed to store imported wallet:', insertError)
    throw new Error(`Failed to store wallet: ${insertError.message}`)
  }

  console.log('[POLY-AUTH] Imported wallet stored in database')

  return {
    importId,
    walletId,
    address,
  }
}
