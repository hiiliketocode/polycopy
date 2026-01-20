import { createActivityPoller } from '@turnkey/http'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { getTurnkeyClient } from './client'

type WalletRow = {
  turnkey_private_key_id: string | null
  turnkey_wallet_id: string | null
  eoa_address: string | null
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE env vars missing for admin client')
}

const supabaseAdmin = createSupabaseAdminClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

export async function getOrCreateWalletForUser(userId: string): Promise<{
  walletId: string
  address: string
  isExisting: boolean
}> {
  const { data: existing } = await supabaseAdmin
    .from('turnkey_wallets')
    .select('turnkey_private_key_id, turnkey_wallet_id, eoa_address')
    .eq('user_id', userId)
    .single()

  if (existing?.eoa_address) {
    return {
      walletId: existing.turnkey_private_key_id || existing.turnkey_wallet_id || existing.eoa_address,
      address: existing.eoa_address,
      isExisting: true,
    }
  }

  const client = getTurnkeyClient()
  if (!client) {
    throw new Error('Turnkey client not available')
  }

  const createResponse = await client.turnkeyClient.createPrivateKeys({
    type: 'ACTIVITY_TYPE_CREATE_PRIVATE_KEYS_V2',
    timestampMs: String(Date.now()),
    organizationId: client.config.organizationId,
    parameters: {
      privateKeys: [
        {
          privateKeyName: `polycopy-${userId}`,
          curve: 'CURVE_SECP256K1',
          privateKeyTags: [],
          addressFormats: ['ADDRESS_FORMAT_ETHEREUM'],
        },
      ],
    },
  })

  let activity = (createResponse as any).activity ?? createResponse

  if (activity.status === 'ACTIVITY_STATUS_PENDING') {
    const poller = createActivityPoller({
      client: client.turnkeyClient,
      requestFn: (input: { organizationId: string; activityId: string }) =>
        client.turnkeyClient.getActivity(input),
    })
    activity = await poller({
      organizationId: client.config.organizationId,
      activityId: activity.id,
    })
  }

  if (activity.status !== 'ACTIVITY_STATUS_COMPLETED') {
    throw new Error(`Turnkey wallet creation failed with status: ${activity.status}`)
  }

  const createdKeys =
    activity.result?.createPrivateKeysResultV2?.privateKeys ||
    activity.result?.createPrivateKeysResult?.privateKeys ||
    []
  const created = createdKeys[0]
  const privateKeyId = created?.privateKeyId
  const address = created?.addresses?.[0]?.address || created?.addresses?.[0]

  if (!privateKeyId || !address) {
    throw new Error('Turnkey createPrivateKeys result missing key id or address')
  }

  const { data: upserted, error: upsertError } = await supabaseAdmin
    .from('turnkey_wallets')
    .upsert(
      {
        user_id: userId,
        turnkey_wallet_id: privateKeyId,
        turnkey_sub_org_id: client.config.organizationId,
        turnkey_private_key_id: privateKeyId,
        eoa_address: address,
        polymarket_account_address: address,
        wallet_type: 'managed',
      },
      { onConflict: 'user_id' }
    )
    .select('turnkey_private_key_id, eoa_address')
    .single()

  if (upsertError || !upserted) {
    throw new Error(upsertError?.message || 'Failed to store wallet reference')
  }

  return {
    walletId: upserted.turnkey_private_key_id,
    address: upserted.eoa_address,
    isExisting: false,
  }
}

/**
 * Sign a message using the user's Turnkey wallet
 */
export async function signMessageForUser(
  userId: string,
  message: string
): Promise<{ address: string; signature: string; message: string }> {
  const { getTurnkeyClient } = await import('./client')
  const { utils } = await import('ethers')
  
  // Get user's wallet
  const wallet = await getOrCreateWalletForUser(userId)
  
  if (!wallet.walletId) {
    throw new Error('Wallet not found for user')
  }

  const client = getTurnkeyClient()
  if (!client) {
    throw new Error('Turnkey client not available')
  }

  // Create Ethereum message hash (EIP-191)
  const messageHash = utils.hashMessage(message)
  
  // Sign the hash with Turnkey
  const signResponse = await client.turnkeyClient.signRawPayload({
    organizationId: client.config.organizationId,
    timestampMs: String(Date.now()),
    type: 'ACTIVITY_TYPE_SIGN_RAW_PAYLOAD_V2',
    parameters: {
      signWith: wallet.walletId,
      payload: messageHash,
      encoding: 'PAYLOAD_ENCODING_HEXADECIMAL',
      hashFunction: 'HASH_FUNCTION_NO_OP',
    },
  })

  const { createActivityPoller } = await import('@turnkey/http')
  let signActivity = signResponse.activity

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
    throw new Error(`Message signing failed with status: ${signActivity.status}`)
  }

  const result = signActivity.result?.signRawPayloadResult
  if (!result || !result.r || !result.s || !result.v) {
    throw new Error('Signature components not found in activity result')
  }

  const normalize = (component: string) => (component.startsWith('0x') ? component.slice(2) : component)
  const signature = `0x${normalize(result.r)}${normalize(result.s)}${normalize(result.v)}`

  return {
    address: wallet.address,
    signature,
    message,
  }
}
