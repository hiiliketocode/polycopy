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
}

export interface TurnkeyImportCompleteResult {
  walletId: string
  address: string
  alreadyImported: boolean
}

/**
 * Initialize Turnkey import ceremony for private key import
 * 
 * Returns configuration for the frontend @turnkey/iframe-stamper
 * The iframe stamper will handle activity creation and private key collection
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

  console.log('[POLY-AUTH] Import initialized')
  console.log('[POLY-AUTH] Wallet name:', walletName)
  console.log('[POLY-AUTH] Organization ID:', client.config.organizationId)

  // Return configuration for iframe stamper
  // The frontend will use @turnkey/iframe-stamper to:
  // 1. Create the iframe
  // 2. User enters private key
  // 3. Iframe creates the import activity
  // 4. Returns wallet ID when complete
  return {
    organizationId: client.config.organizationId,
    walletName,
    iframeUrl: 'https://auth.turnkey.com', // Base URL, iframe stamper will handle the rest
  }
}

/**
 * Complete Turnkey import by searching for wallet by name
 * 
 * After the frontend iframe stamper completes the import,
 * we search for the wallet by name and store it in our database
 */
export async function completeTurnkeyImport(
  userId: string,
  walletName: string
): Promise<TurnkeyImportCompleteResult> {
  const client = getTurnkeyClient()
  if (!client) {
    throw new Error('Turnkey client not available')
  }

  console.log('[POLY-AUTH] Completing import for user:', userId)
  console.log('[POLY-AUTH] Searching for wallet:', walletName)

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
    // Search for the wallet by name in Turnkey
    console.log('[POLY-AUTH] Fetching wallets from Turnkey...')
    const walletsResponse = await client.turnkeyClient.getWallets({
      organizationId: client.config.organizationId,
    })

    console.log(`[POLY-AUTH] Found ${walletsResponse.wallets.length} wallets in org`)

    // Find the wallet with matching name
    const matchingWallet = walletsResponse.wallets.find(
      (w: any) => w.walletName === walletName
    )

    if (!matchingWallet) {
      // Log available wallets for debugging
      if (walletsResponse.wallets.length > 0) {
        console.log('[POLY-AUTH] Available wallets:')
        walletsResponse.wallets.forEach((w: any) => {
          console.log(`  - ${w.walletName} (ID: ${w.walletId})`)
        })
      }

      throw new Error(
        `Wallet not found: "${walletName}"\n\n` +
        `Please ensure the wallet was successfully imported in the Turnkey iframe.\n` +
        `If you just imported, wait 10-30 seconds and try again.`
      )
    }

    const walletId = matchingWallet.walletId
    const address = matchingWallet.accounts?.[0]?.address

    if (!address) {
      throw new Error('Wallet found but has no accounts')
    }

    console.log('[POLY-AUTH] Wallet found successfully')
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
