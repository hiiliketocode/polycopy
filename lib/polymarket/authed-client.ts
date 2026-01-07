import type { PostgrestSingleResponse } from '@supabase/supabase-js'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createTurnkeySigner } from '@/lib/polymarket/turnkey-signer'
import { createClobClient, SignatureType, ApiCredentials } from '@/lib/polymarket/clob'
import {
  CLOB_ENCRYPTION_KEY,
  CLOB_ENCRYPTION_KEY_V1,
  CLOB_ENCRYPTION_KEY_V2,
} from '@/lib/turnkey/config'
import { createHash, createDecipheriv } from 'crypto'

let supabaseAdmin:
  | ReturnType<typeof createServiceClient>
  | null = null

function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase env vars are required for Polymarket auth client')
  }
  supabaseAdmin = createServiceClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return supabaseAdmin
}

function getEncryptionKeyForKid(kid?: string | null): string {
  if (kid === 'v2' && CLOB_ENCRYPTION_KEY_V2) {
    return CLOB_ENCRYPTION_KEY_V2
  }
  if (kid === 'v1' && CLOB_ENCRYPTION_KEY_V1) {
    return CLOB_ENCRYPTION_KEY_V1
  }
  return CLOB_ENCRYPTION_KEY
}

function decryptSecret(ciphertext: string, kid?: string | null): string {
  const [ivHex, encrypted] = ciphertext.split(':')
  if (!ivHex || !encrypted) {
    throw new Error('Invalid encrypted secret format')
  }

  const keyMaterial = getEncryptionKeyForKid(kid)
  const key = createHash('sha256').update(keyMaterial).digest()
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  
  try {
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error: any) {
    console.error('[CLOB-DECRYPT] Failed to decrypt CLOB credential:', {
      kid,
      hasV1Key: Boolean(CLOB_ENCRYPTION_KEY_V1),
      hasV2Key: Boolean(CLOB_ENCRYPTION_KEY_V2),
      hasDefaultKey: Boolean(CLOB_ENCRYPTION_KEY),
      errorMessage: error.message,
    })
    throw new Error(
      `Failed to decrypt Polymarket API credentials. The encryption key (CLOB_ENCRYPTION_KEY) may be incorrect or missing. ` +
      `Encryption version: ${kid || 'legacy'}. You may need to re-run the CLOB credential setup.`
    )
  }
}

type TurnkeyWalletRow = {
  id: string
  user_id?: string | null
  wallet_type?: string | null
  eoa_address: string
  polymarket_account_address: string | null
  turnkey_private_key_id: string
  turnkey_wallet_id: string
}

type ClobCredentialRecord = {
  polymarket_account_address?: string | null
}

async function buildAuthedClient(
  userId: string,
  wallet: TurnkeyWalletRow,
  proxyOverride?: string,
  allowCredentialFallback: boolean = false
) {
  const proxyAddress = proxyOverride?.toLowerCase() || wallet.polymarket_account_address?.toLowerCase()
  if (!proxyAddress) {
    throw new Error('Polymarket proxy address missing for wallet')
  }

  let credentialError: any = null
  let credential:
    | {
        api_key: string
        api_secret_encrypted: string
        api_passphrase_encrypted: string
        enc_kid?: string | null
      }
    | null = null

  const supabaseAdmin = getSupabaseAdmin()
  const fetchCredential = (columns: string, byProxy: boolean) => {
    const base = supabaseAdmin.from('clob_credentials').select(columns).eq('user_id', userId)
    return byProxy
      ? base.ilike('polymarket_account_address', proxyAddress).single()
      : base.order('created_at', { ascending: false }).limit(1).maybeSingle()
  }

  const credentialResult = await fetchCredential(
    'api_key, api_secret_encrypted, api_passphrase_encrypted, enc_kid',
    true
  )

  const credentialData = credentialResult.data as
    | {
        api_key: string
        api_secret_encrypted: string
        api_passphrase_encrypted: string
        enc_kid?: string | null
      }
    | null

  if (!credentialResult.error && credentialData) {
    credential = credentialData
  }
  credentialError = credentialResult.error

  if (!credential && allowCredentialFallback) {
    const fallbackResult = await fetchCredential(
      'api_key, api_secret_encrypted, api_passphrase_encrypted, enc_kid',
      false
    )
    const fallbackData = fallbackResult.data as
      | {
          api_key: string
          api_secret_encrypted: string
          api_passphrase_encrypted: string
          enc_kid?: string | null
        }
      | null
    if (!fallbackResult.error && fallbackData) {
      credential = fallbackData
      credentialError = null
    } else {
      credentialError = fallbackResult.error
    }
  }

  if (credentialError?.code === '42703') {
    const legacyResult = await fetchCredential('api_key, api_secret_encrypted, api_passphrase_encrypted', true)
    const legacyData = legacyResult.data as
      | {
          api_key: string
          api_secret_encrypted: string
          api_passphrase_encrypted: string
          enc_kid?: string | null
        }
      | null
    const legacyErr = legacyResult.error
    if (!legacyErr && legacyData) {
      credential = { ...legacyData, enc_kid: 'legacy' }
    }
    credentialError = legacyErr
  }

  if (!credential && allowCredentialFallback && credentialError?.code === '42703') {
    const legacyFallback = await fetchCredential('api_key, api_secret_encrypted, api_passphrase_encrypted', false)
    const legacyData = legacyFallback.data as
      | {
          api_key: string
          api_secret_encrypted: string
          api_passphrase_encrypted: string
          enc_kid?: string | null
        }
      | null
    const legacyErr = legacyFallback.error
    if (!legacyErr && legacyData) {
      credential = { ...legacyData, enc_kid: 'legacy' }
      credentialError = null
    } else {
      credentialError = legacyErr
    }
  }

  if (credentialError || !credential) {
    throw new Error('No Polymarket API credentials found. Run L2 credential setup.')
  }

  const encryptionKid = credential.enc_kid || 'legacy'
  const apiCreds: ApiCredentials = {
    key: credential.api_key,
    secret: decryptSecret(credential.api_secret_encrypted, encryptionKid),
    passphrase: decryptSecret(credential.api_passphrase_encrypted, encryptionKid),
  }

  const signer = await createTurnkeySigner(userId, supabaseAdmin, wallet)
  const signatureType: SignatureType = 1
  const client = await createClobClient(signer, signatureType, apiCreds, proxyAddress)

  return {
    client,
    proxyAddress,
    signerAddress: wallet.eoa_address,
    signatureType,
  }
}

export async function getAuthedClobClientForUser(userId: string) {
  const supabaseAdmin = getSupabaseAdmin()
  const { data: wallet, error: walletError } = await supabaseAdmin
    .from('turnkey_wallets')
    .select('id, wallet_type, eoa_address, polymarket_account_address, turnkey_private_key_id, turnkey_wallet_id')
    .eq('user_id', userId)
    .eq('wallet_type', 'imported_magic')
    .single()

  if (walletError || !wallet) {
    throw new Error('Imported Magic wallet not found for user')
  }

  return buildAuthedClient(userId, wallet as TurnkeyWalletRow)
}

export async function getAuthedClobClientForUserAnyWallet(userId: string, proxyOverride?: string) {
  const supabaseAdmin = getSupabaseAdmin()
  const credentialResponse = (await supabaseAdmin
    .from('clob_credentials')
    .select('polymarket_account_address')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()) as PostgrestSingleResponse<ClobCredentialRecord>

  let walletResponse = (await supabaseAdmin
    .from('turnkey_wallets')
    .select('id, user_id, wallet_type, eoa_address, polymarket_account_address, turnkey_private_key_id, turnkey_wallet_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()) as PostgrestSingleResponse<TurnkeyWalletRow>
  let wallet = walletResponse.data
  let walletError = walletResponse.error

  if ((!wallet || walletError) && proxyOverride) {
    const walletByProxyResponse = (await supabaseAdmin
      .from('turnkey_wallets')
      .select('id, user_id, wallet_type, eoa_address, polymarket_account_address, turnkey_private_key_id, turnkey_wallet_id')
      .ilike('polymarket_account_address', proxyOverride.toLowerCase())
      .limit(1)
      .maybeSingle()) as PostgrestSingleResponse<TurnkeyWalletRow>
    const walletByProxy = walletByProxyResponse.data
    const walletByProxyError = walletByProxyResponse.error

    if (!walletByProxyError && walletByProxy) {
      wallet = walletByProxy
      walletError = null
    }
  }

  if (walletError || !wallet) {
    throw new Error('No turnkey wallet found for user')
  }

  const credentialProxy = (credentialResponse as any)?.data?.polymarket_account_address
  const resolvedProxy = proxyOverride || credentialProxy || wallet.polymarket_account_address
  const effectiveUserId = wallet.user_id || userId
  return buildAuthedClient(effectiveUserId, wallet as TurnkeyWalletRow, resolvedProxy || undefined, true)
}
