import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { TURNKEY_ENABLED } from './config'
import { getTurnkeyClient } from './client'
import type {
  TurnkeyCompletePayload,
  TurnkeyCompleteResult,
  TurnkeyImportInitParams,
  TurnkeyImportInitResult,
} from './types'

const supabaseServiceRole = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Initialize Turnkey import flow using iframe-first approach.
 * The iframe handles user authentication (passkey) and private key import.
 */
export async function initTurnkeyImport(
  params: TurnkeyImportInitParams
): Promise<TurnkeyImportInitResult> {
  if (!TURNKEY_ENABLED) {
    throw new Error('Turnkey disabled')
  }

  const client = getTurnkeyClient()
  if (!client) {
    throw new Error('Turnkey client not available')
  }

  const sessionId = crypto.randomUUID()

  try {
    console.log(
      `[Turnkey Import] Initializing iframe-based import for user: ${params.userId}`
    )
    
    // Turnkey's embedded wallet import flow:
    // 1. User visits iframe at import.turnkey.com
    // 2. Iframe prompts for passkey authentication (registers if needed)
    // 3. User pastes private key in iframe
    // 4. Iframe encrypts key client-side and imports to Turnkey
    // 5. Iframe posts success message back to parent window
    //
    // We just provide the iframe URL with our organization ID
    
    const iframeUrl = `https://import.turnkey.com?organizationId=${client.config.organizationId}&sessionId=${sessionId}`

    console.log(
      `[Turnkey Import] Iframe URL generated. User will authenticate and import via passkey.`
    )

    return {
      sessionId,
      iframeUrl,
      note: 'Open the iframe to authenticate with your passkey and import your private key securely.',
    }
  } catch (error: any) {
    console.error('Turnkey import init error:', error)
    throw new Error(`Failed to initialize Turnkey import: ${error.message}`)
  }
}

/**
 * Complete Turnkey import and store wallet data in database.
 */
export async function completeTurnkeyImport(
  payload: TurnkeyCompletePayload,
  userId: string
): Promise<TurnkeyCompleteResult> {
  if (!TURNKEY_ENABLED) {
    throw new Error('Turnkey disabled')
  }

  try {
    // Store Turnkey wallet data in Supabase
    const { data: walletData, error: insertError} = await supabaseServiceRole
      .from('turnkey_wallets')
      .insert({
        user_id: userId,
        turnkey_sub_org_id: payload.subOrganizationId,
        turnkey_wallet_id: payload.walletId,
        turnkey_private_key_id: payload.privateKeyId,
        eoa_address: payload.eoaAddress || '',
        polymarket_account_address: payload.polymarketProxyAddress || '',
        wallet_type: 'magic_proxy',
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error storing Turnkey wallet:', insertError)
      throw new Error(`Failed to store wallet: ${insertError.message}`)
    }

    return {
      sessionId: payload.sessionId,
      stored: true,
      note: 'Turnkey wallet imported and stored successfully.',
      echo: payload,
    }
  } catch (error: any) {
    console.error('Turnkey import completion error:', error)
    return {
      sessionId: payload.sessionId,
      stored: false,
      note: `Import completed but storage failed: ${error.message}`,
      echo: payload,
    }
  }
}


