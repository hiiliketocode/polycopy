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
}

export interface TurnkeyImportCompleteResult {
  walletId: string
  address: string
  alreadyImported: boolean
}

/**
 * Initialize Turnkey import ceremony for private key import
 * 
 * Returns organization ID and wallet name that the frontend will use
 * with @turnkey/iframe-stamper to create the import iframe
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
    // Return existing wallet info so frontend can show it
    return {
      organizationId: client.config.organizationId,
      walletName: `imported-${userId}`, // Will not be used for new import
    }
  }

  // Create unique wallet name for this import
  const walletName = `imported-${userId}-${Date.now()}`

  console.log('[POLY-AUTH] Import initialized - wallet name:', walletName)
  console.log('[POLY-AUTH] Organization ID:', client.config.organizationId)

  return {
    organizationId: client.config.organizationId,
    walletName,
  }
}

/**
 * Complete Turnkey import by searching for wallet by name
 * 
 * Searches for the wallet with the expected name in Turnkey org
 * More user-friendly than asking for wallet ID
 */
export async function completeTurnkeyImport(
  userId: string,
  walletNameOrId: string
): Promise<TurnkeyImportCompleteResult> {
  const client = getTurnkeyClient()
  if (!client) {
    throw new Error('Turnkey client not available')
  }

  console.log('[POLY-AUTH] Completing import for user:', userId)

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

  // Try to find wallet - could be by ID or by name
  let wallet
  let walletId

  // First, try as wallet ID (UUID format)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (uuidRegex.test(walletNameOrId)) {
    try {
      console.log('[POLY-AUTH] Trying to get wallet by ID:', walletNameOrId)
      const walletResponse = await client.turnkeyClient.getWallet({
        organizationId: client.config.organizationId,
        walletId: walletNameOrId,
      })
      wallet = walletResponse.wallet
      walletId = walletNameOrId
    } catch (error) {
      console.log('[POLY-AUTH] Wallet not found by ID, will try searching by name')
    }
  }

  // If not found by ID, search by name
  if (!wallet) {
    try {
      console.log('[POLY-AUTH] Searching for wallet by name:', walletNameOrId)
      const walletsResponse = await client.turnkeyClient.getWallets({
        organizationId: client.config.organizationId,
      })

      // Find wallet matching the name
      const matchingWallet = walletsResponse.wallets.find(
        (w: any) => w.walletName === walletNameOrId
      )

      if (matchingWallet) {
        wallet = matchingWallet
        walletId = matchingWallet.walletId
        console.log('[POLY-AUTH] Found wallet by name:', walletId)
      }
    } catch (error: any) {
      console.error('[POLY-AUTH] Error searching for wallet:', error.message)
    }
  }

  if (!wallet || !walletId) {
    throw new Error(
      'Wallet not found in Turnkey.\n\n' +
      'Please verify:\n' +
      '1. You imported the wallet in Turnkey dashboard\n' +
      '2. The wallet name matches exactly: ' + walletNameOrId + '\n' +
      '3. You\'re looking in the correct Turnkey organization\n\n' +
      'If you just imported, wait a few seconds and try again.'
    )
  }

  if (!wallet.accounts || wallet.accounts.length === 0) {
    throw new Error('Wallet found but has no accounts')
  }

  const address = wallet.accounts[0].address

  console.log('[POLY-AUTH] Wallet verified - Address:', address)

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
    console.error('[POLY-AUTH] Failed to verify/store wallet:', error.message)
    throw new Error(`Failed to complete import: ${error.message}`)
  }
}
