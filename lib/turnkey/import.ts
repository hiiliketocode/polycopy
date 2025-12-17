import { getTurnkeyClient } from './client'
import { createClient } from '@supabase/supabase-js'

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
  privateKeyName: string
  userId: string
  importBundle: string
}

export interface TurnkeyImportCompleteResult {
  privateKeyId: string
  address: string
  addresses: Array<{ address: string; format: string }>
  alreadyImported: boolean
}

/**
 * Initialize Turnkey import ceremony (Step 1 of 3)
 * 
 * Creates an init_import_private_key activity and returns the import bundle.
 * The bundle will be injected into the Turnkey iframe where the user
 * pastes their private key. The iframe encrypts the key and creates the
 * final import activity.
 * 
 * Security: PolyCopy backend never receives the plaintext private key.
 */
export async function initTurnkeyImport(
  userId: string
): Promise<TurnkeyImportInitResult> {
  const client = getTurnkeyClient()
  if (!client) {
    throw new Error('Turnkey client not available')
  }

  console.log('[TURNKEY-IMPORT] Initializing import for user:', userId)

  // Check if user already has an imported wallet (idempotency)
  const { data: existing } = await supabaseServiceRole
    .from('turnkey_wallets')
    .select('*')
    .eq('user_id', userId)
    .eq('wallet_type', 'imported_magic')
    .single()

  if (existing) {
    console.log('[TURNKEY-IMPORT] User already has imported wallet:', existing.eoa_address)
    throw new Error('You have already imported a wallet. Cannot import another one.')
  }

  // Create unique private key name for this import
  const privateKeyName = `imported-magic-${userId}-${Date.now()}`

  console.log('[TURNKEY-IMPORT] Creating init_import_private_key activity...')
  console.log('[TURNKEY-IMPORT] Private key name:', privateKeyName)

  try {
    // Call Turnkey API to initialize the import and get the import bundle
    // Note: We don't pass userId here because we're using organization-level import,
    // not user-specific import within Turnkey's user system
    const initResult = await client.turnkeyClient.initImportPrivateKey({
      type: 'ACTIVITY_TYPE_INIT_IMPORT_PRIVATE_KEY',
      timestampMs: String(Date.now()),
      organizationId: client.config.organizationId,
      parameters: {},
    })

    console.log('[TURNKEY-IMPORT] Init activity status:', initResult.activity.status)

    if (initResult.activity.status !== 'ACTIVITY_STATUS_COMPLETED') {
      throw new Error(`Init activity failed with status: ${initResult.activity.status}`)
    }

    const importBundle = initResult.activity.result?.initImportPrivateKeyResult?.importBundle

    if (!importBundle) {
      throw new Error('Import bundle not found in init activity result')
    }

    console.log('[TURNKEY-IMPORT] Import bundle obtained successfully')

    return {
      organizationId: client.config.organizationId,
      privateKeyName,
      userId, // Our Supabase user ID (for our own reference, not sent to Turnkey)
      importBundle,
    }
  } catch (error: any) {
    console.error('[TURNKEY-IMPORT] Init failed:', error.message)
    throw new Error(`Failed to initialize import: ${error.message}`)
  }
}

/**
 * Complete Turnkey import ceremony (Step 3 of 3)
 * 
 * After the iframe extracts the encrypted bundle and submits it to Turnkey,
 * we query Turnkey for the imported private key details and store the reference
 * in our database.
 * 
 * Security: We only store the private key ID and derived address, never the key itself.
 */
export async function completeTurnkeyImport(
  userId: string,
  privateKeyName: string
): Promise<TurnkeyImportCompleteResult> {
  const client = getTurnkeyClient()
  if (!client) {
    throw new Error('Turnkey client not available')
  }

  console.log('[TURNKEY-IMPORT] Completing import for user:', userId)
  console.log('[TURNKEY-IMPORT] Private key name:', privateKeyName)

  // Check if already stored (idempotency)
  const { data: existing } = await supabaseServiceRole
    .from('turnkey_wallets')
    .select('*')
    .eq('user_id', userId)
    .eq('wallet_type', 'imported_magic')
    .single()

  if (existing) {
    console.log('[TURNKEY-IMPORT] Private key already stored in DB')
    return {
      privateKeyId: existing.turnkey_private_key_id,
      address: existing.eoa_address,
      addresses: [{ address: existing.eoa_address, format: 'ADDRESS_FORMAT_ETHEREUM' }],
      alreadyImported: true,
    }
  }

  try {
    // Query Turnkey for private keys in the organization
    console.log('[TURNKEY-IMPORT] Searching for private key in Turnkey...')
    
    const privateKeysResponse = await client.turnkeyClient.getPrivateKeys({
      organizationId: client.config.organizationId,
    })

    console.log(`[TURNKEY-IMPORT] Found ${privateKeysResponse.privateKeys.length} private keys in org`)

    // Find the private key with matching name
    const matchingKey = privateKeysResponse.privateKeys.find(
      (pk: any) => pk.privateKeyName === privateKeyName
    )

    if (!matchingKey) {
      // Log available keys for debugging
      if (privateKeysResponse.privateKeys.length > 0) {
        console.log('[TURNKEY-IMPORT] Available private keys:')
        privateKeysResponse.privateKeys.forEach((pk: any) => {
          console.log(`  - ${pk.privateKeyName} (ID: ${pk.privateKeyId})`)
        })
      }

      throw new Error(
        `Private key not found: "${privateKeyName}"\n\n` +
        `The import may not have completed in the Turnkey iframe.\n` +
        `Please try again.`
      )
    }

    const privateKeyId = matchingKey.privateKeyId
    const addresses = matchingKey.addresses || []
    
    if (addresses.length === 0) {
      throw new Error('Private key found but has no addresses')
    }

    const primaryAddress = addresses[0].address

    console.log('[TURNKEY-IMPORT] Private key found successfully')
    console.log('[TURNKEY-IMPORT] Private Key ID:', privateKeyId)
    console.log('[TURNKEY-IMPORT] Primary Address:', primaryAddress)

    // Store private key reference in database
    const { error: insertError } = await supabaseServiceRole
      .from('turnkey_wallets')
      .insert({
        user_id: userId,
        turnkey_wallet_id: privateKeyId, // Store private key ID as wallet ID
        turnkey_sub_org_id: 'N/A',
        turnkey_private_key_id: privateKeyId,
        eoa_address: primaryAddress,
        polymarket_account_address: '',
        wallet_type: 'imported_magic',
      })

    if (insertError) {
      // Handle race condition
      if (insertError.code === '23505') {
        console.log('[TURNKEY-IMPORT] Unique conflict, private key already stored')
        const { data: reFetched } = await supabaseServiceRole
          .from('turnkey_wallets')
          .select('*')
          .eq('user_id', userId)
          .single()

        if (reFetched) {
          return {
            privateKeyId: reFetched.turnkey_private_key_id,
            address: reFetched.eoa_address,
            addresses: [{ address: reFetched.eoa_address, format: 'ADDRESS_FORMAT_ETHEREUM' }],
            alreadyImported: true,
          }
        }
      }

      console.error('[TURNKEY-IMPORT] Failed to store imported private key:', insertError)
      throw new Error(`Failed to store private key reference: ${insertError.message}`)
    }

    console.log('[TURNKEY-IMPORT] Imported private key reference stored successfully')

    return {
      privateKeyId,
      address: primaryAddress,
      addresses: addresses.map((addr: any) => ({
        address: addr.address,
        format: addr.format,
      })),
      alreadyImported: false,
    }
  } catch (error: any) {
    console.error('[TURNKEY-IMPORT] Error completing import:', error.message)
    throw new Error(`Failed to complete import: ${error.message}`)
  }
}
