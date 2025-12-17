import { getTurnkeyClient } from '@/lib/turnkey/client'
import { createActivityPoller } from '@turnkey/http'
import { TypedDataDomain, TypedDataField } from 'ethers'

/**
 * Turnkey Signer Adapter for Polymarket CLOB Client
 * 
 * Implements the ethers v5/v6 Signer interface for EIP-712 typed data signing
 * Required by @polymarket/clob-client for L1 authentication
 */
export class TurnkeySigner {
  public address: string
  private walletId: string
  private organizationId: string

  constructor(address: string, walletId: string, organizationId: string) {
    this.address = address
    this.walletId = walletId
    this.organizationId = organizationId
  }

  /**
   * Get the signer's address (implements Signer interface)
   */
  async getAddress(): Promise<string> {
    return this.address
  }

  /**
   * Sign EIP-712 typed data using Turnkey
   * Required by @polymarket/clob-client for L1 authentication
   * 
   * @param domain - EIP-712 domain separator
   * @param types - EIP-712 type definitions
   * @param value - The data to sign
   * @returns The signature in hex format
   */
  async _signTypedData(
    domain: TypedDataDomain,
    types: Record<string, Array<TypedDataField>>,
    value: Record<string, any>
  ): Promise<string> {
    const client = getTurnkeyClient()
    if (!client) {
      throw new Error('Turnkey client not available')
    }

    console.log('[Turnkey Signer] Signing EIP-712 typed data')
    console.log('[Turnkey Signer] Domain:', JSON.stringify(domain))
    console.log('[Turnkey Signer] Types:', JSON.stringify(types))
    console.log('[Turnkey Signer] Value:', JSON.stringify(value))

    // Build the EIP-712 hash that Turnkey will sign
    // We need to encode the typed data according to EIP-712 spec
    const typedData = {
      domain,
      types,
      primaryType: Object.keys(types).find(key => key !== 'EIP712Domain') || 'ClobAuth',
      message: value,
    }

    console.log('[Turnkey Signer] Typed data:', JSON.stringify(typedData, null, 2))

    // Use Turnkey's signTypedData activity
    const signResponse = await client.turnkeyClient.signTypedData({
      organizationId: this.organizationId,
      timestampMs: String(Date.now()),
      type: 'ACTIVITY_TYPE_SIGN_TYPED_DATA',
      parameters: {
        signWith: this.address,
        typedData: JSON.stringify(typedData),
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
        organizationId: this.organizationId,
        activityId: signActivity.id,
      })
    }

    if (signActivity.status !== 'ACTIVITY_STATUS_COMPLETED') {
      throw new Error(
        `EIP-712 signing failed with status: ${signActivity.status}`
      )
    }

    const result = signActivity.result?.signTypedDataResult
    if (!result || !result.r || !result.s || !result.v) {
      throw new Error('Signature components not found in activity result')
    }

    // Turnkey returns r, s, v separately. Concatenate them into a single signature
    const r = result.r.startsWith('0x') ? result.r.slice(2) : result.r
    const s = result.s.startsWith('0x') ? result.s.slice(2) : result.s
    const v = result.v.startsWith('0x') ? result.v.slice(2) : result.v

    const signature = `0x${r}${s}${v}`

    console.log('[Turnkey Signer] EIP-712 signature generated:', signature.substring(0, 20) + '...')

    return signature
  }

  /**
   * Connect method (for compatibility with some libraries)
   */
  connect(): TurnkeySigner {
    return this
  }
}

/**
 * Create a Turnkey signer for a given user
 */
export async function createTurnkeySigner(
  userId: string,
  supabaseServiceRole: any
): Promise<TurnkeySigner> {
  const client = getTurnkeyClient()
  if (!client) {
    throw new Error('Turnkey client not available')
  }

  // Get user's wallet from database
  const { data: wallet, error: fetchError } = await supabaseServiceRole
    .from('turnkey_wallets')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (fetchError || !wallet) {
    throw new Error('Wallet not found for user. Create a wallet first (Stage 1).')
  }

  console.log('[Turnkey Signer] Creating signer for address:', wallet.eoa_address)

  return new TurnkeySigner(
    wallet.eoa_address,
    wallet.turnkey_wallet_id,
    client.config.organizationId
  )
}

