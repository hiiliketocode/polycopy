import { getTurnkeyClient, turnkeySignTypedData, TurnkeyTypedDataPayload } from '@/lib/turnkey/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TypedDataDomain, TypedDataField } from 'ethers'

type TurnkeyWalletRow = {
  eoa_address: string
  turnkey_wallet_id: string
  turnkey_private_key_id: string
}

/**
 * Turnkey Signer Adapter for Polymarket CLOB Client
 * 
 * Implements the ethers v5/v6 Signer interface for EIP-712 typed data signing
 * Required by @polymarket/clob-client for L1 authentication
 */
export class TurnkeySigner {
  public address: string
  private privateKeyId: string
  private lastTypedData: TurnkeyTypedDataPayload | null = null

  constructor(signingAddress: string, privateKeyId: string) {
    this.address = signingAddress.toLowerCase()
    this.privateKeyId = privateKeyId
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
    value: Record<string, unknown>
  ): Promise<string> {
    const typedData: TurnkeyTypedDataPayload = {
      domain,
      types,
      primaryType: Object.keys(types).find(key => key !== 'EIP712Domain') || 'ClobAuth',
      message: value,
    }

    this.lastTypedData = typedData

    console.log('[Turnkey Signer] Signing EIP-712 typed data for address:', this.address)

    return turnkeySignTypedData({
      privateKeyId: this.privateKeyId,
      typedData,
    })
  }

  /**
   * Connect method (for compatibility with some libraries)
   */
  connect(): TurnkeySigner {
    return this
  }

  getLastTypedData(): TurnkeyTypedDataPayload | null {
    return this.lastTypedData
  }
}

/**
 * Create a Turnkey signer for a given user
 */
export async function createTurnkeySigner(
  userId: string,
  supabaseServiceRole: SupabaseClient,
  existingWallet?: TurnkeyWalletRow
): Promise<TurnkeySigner> {
  const client = getTurnkeyClient()
  if (!client) {
    throw new Error('Turnkey client not available')
  }

  let wallet: TurnkeyWalletRow | undefined = existingWallet
  if (!wallet) {
    const { data, error: fetchError } = await supabaseServiceRole
      .from('turnkey_wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('wallet_type', 'imported_magic')
      .single()
    wallet = (data as TurnkeyWalletRow) ?? undefined

    if (fetchError || !wallet) {
      throw new Error('Wallet not found for user. Create a wallet first (Stage 1).')
    }
  }

  console.log('[Turnkey Signer] Creating signer for address:', wallet.eoa_address)

  return new TurnkeySigner(wallet.eoa_address, wallet.turnkey_private_key_id)
}
