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
 * Complete Turnkey import after user has imported via iframe
 * 
 * Frontend calls this with the walletId returned by the iframe
 * We verify it exists in Turnkey and store the reference in our DB
 */
export async function completeTurnkeyImport(
  userId: string,
  walletId: string
): Promise<TurnkeyImportCompleteResult> {
  const client = getTurnkeyClient()
  if (!client) {
    throw new Error('Turnkey client not available')
  }

  console.log('[POLY-AUTH] Completing import for user:', userId, 'walletId:', walletId)

  // Check if already stored (idempotency)
  const { data: existing } = await supabaseServiceRole
    .from('turnkey_wallets')
    .select('*')
    .eq('user_id', userId)
    .eq('turnkey_wallet_id', walletId)
    .single()

  if (existing) {
    console.log('[POLY-AUTH] Wallet already stored in DB')
    return {
      walletId: existing.turnkey_wallet_id,
      address: existing.eoa_address,
      alreadyImported: true,
    }
  }

  // Get wallet details from Turnkey to verify it exists and get address
  try {
    const walletResponse = await client.turnkeyClient.getWallet({
      organizationId: client.config.organizationId,
      walletId: walletId,
    })

    const wallet = walletResponse.wallet
    if (!wallet || !wallet.accounts || wallet.accounts.length === 0) {
      throw new Error('Wallet not found or has no accounts')
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
