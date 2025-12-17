import { createClient } from '@supabase/supabase-js'
import { createActivityPoller } from '@turnkey/http'
import { TURNKEY_ENABLED } from './config'
import { getTurnkeyClient } from './client'
import { hashMessage } from 'ethers'

const supabaseServiceRole = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface WalletCreationResult {
  walletId: string
  address: string
  isNew: boolean
}

interface SignMessageResult {
  address: string
  signature: string
  message: string
}

/**
 * Get or create a Turnkey wallet for a user (idempotent operation)
 * SIMPLIFIED: No sub-organizations, just create wallet directly in parent org
 */
export async function getOrCreateWalletForUser(
  userId: string
): Promise<WalletCreationResult> {
  if (!TURNKEY_ENABLED) {
    throw new Error('Turnkey is not enabled')
  }

  const client = getTurnkeyClient()
  if (!client) {
    throw new Error('Turnkey client not available')
  }

  // Check if wallet already exists in database
  const { data: existing } = await supabaseServiceRole
    .from('turnkey_wallets')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (existing) {
    console.log(`[Turnkey] Wallet already exists for user ${userId}`)
    return {
      walletId: existing.turnkey_wallet_id,
      address: existing.eoa_address,
      isNew: false,
    }
  }

  // Create new wallet DIRECTLY in parent organization
  console.log(`[Turnkey] Creating new wallet for user ${userId}`)

  const walletName = `wallet-${userId}-${Date.now()}`
  
  console.log(`[Turnkey] Creating wallet: ${walletName}`)
  const createWalletResponse = await client.turnkeyClient.createWallet({
    organizationId: client.config.organizationId, // ✅ Use PARENT org
    timestampMs: String(Date.now()),
    type: 'ACTIVITY_TYPE_CREATE_WALLET',
    parameters: {
      walletName,
      accounts: [
        {
          curve: 'CURVE_SECP256K1',
          pathFormat: 'PATH_FORMAT_BIP32',
          path: "m/44'/60'/0'/0/0", // Standard Ethereum derivation path
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
  console.log(`[Turnkey] Wallet created: ${walletId}, address: ${address}`)

  // Store wallet in database
  console.log(`[Turnkey] Storing wallet with user_id: ${userId}`)
  console.log(`[Turnkey] Wallet details: walletId=${walletId}, address=${address}`)
  
  const { error: insertError } = await supabaseServiceRole
    .from('turnkey_wallets')
    .insert({
      user_id: userId,
      turnkey_sub_org_id: client.config.organizationId, // Store parent org ID
      turnkey_wallet_id: walletId,
      turnkey_private_key_id: '', // Not needed
      eoa_address: address,
      polymarket_account_address: '', // Not relevant for this MVP
      wallet_type: 'turnkey_managed',
    })
  
  console.log(`[Turnkey] Insert result - Error:`, insertError)

  if (insertError) {
    console.error('[Turnkey] Failed to store wallet in database:', insertError)
    throw new Error(`Failed to store wallet: ${insertError.message}`)
  }

  console.log(`[Turnkey] Wallet stored in database for user ${userId}`)

  return {
    walletId,
    address,
    isNew: true,
  }
}

/**
 * Sign a message using a user's Turnkey wallet
 */
export async function signMessageForUser(
  userId: string,
  message: string
): Promise<SignMessageResult> {
  if (!TURNKEY_ENABLED) {
    throw new Error('Turnkey is not enabled')
  }

  const client = getTurnkeyClient()
  if (!client) {
    throw new Error('Turnkey client not available')
  }

  // Get wallet from database
  const { data: wallet, error: fetchError } = await supabaseServiceRole
    .from('turnkey_wallets')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (fetchError || !wallet) {
    throw new Error('Wallet not found for user. Create a wallet first.')
  }

  console.log(
    `[Turnkey] Signing message for user ${userId}, wallet ${wallet.turnkey_wallet_id}`
  )

  // For Ethereum message signing, we need to follow EIP-191
  // Compute the message hash using ethers.js (adds Ethereum prefix and hashes)
  const messageHash = hashMessage(message)
  console.log(`[Turnkey] Message hash: ${messageHash}`)

  // Sign the hash with Turnkey
  const signResponse = await client.turnkeyClient.signRawPayload({
    organizationId: client.config.organizationId, // ✅ Use parent org
    timestampMs: String(Date.now()),
    type: 'ACTIVITY_TYPE_SIGN_RAW_PAYLOAD_V2',
    parameters: {
      signWith: wallet.eoa_address,
      payload: messageHash,
      encoding: 'PAYLOAD_ENCODING_HEXADECIMAL',
      hashFunction: 'HASH_FUNCTION_NO_OP', // Hash already computed above
    },
  })

  let signActivity = signResponse.activity
  
  // Poll for activity completion if pending
  if (signActivity.status === 'ACTIVITY_STATUS_PENDING') {
    const poller = createActivityPoller({
      client: client.turnkeyClient,
      requestFn: (input: { organizationId: string; activityId: string }) =>
        client.turnkeyClient.getActivity(input),
    })
    
    signActivity = await poller({
      organizationId: client.config.organizationId,
      activityId: signActivity.id,
    })
  }

  if (signActivity.status !== 'ACTIVITY_STATUS_COMPLETED') {
    throw new Error(
      `Message signing failed with status: ${signActivity.status}`
    )
  }

  const result = signActivity.result?.signRawPayloadResult
  if (!result || !result.r || !result.s || !result.v) {
    throw new Error('Signature components not found in activity result')
  }

  // Turnkey returns r, s, v separately. Concatenate them into a single signature
  // Remove '0x' prefix if present and ensure proper formatting
  const r = result.r.startsWith('0x') ? result.r.slice(2) : result.r
  const s = result.s.startsWith('0x') ? result.s.slice(2) : result.s
  const v = result.v.startsWith('0x') ? result.v.slice(2) : result.v

  const signature = `0x${r}${s}${v}`

  console.log(`[Turnkey] Message signed successfully`)
  console.log(`[Turnkey] Signature: ${signature}`)

  return {
    address: wallet.eoa_address,
    signature,
    message,
  }
}

