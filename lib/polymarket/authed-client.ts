import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createTurnkeySigner } from '@/lib/polymarket/turnkey-signer'
import { createClobClient, SignatureType, ApiCredentials } from '@/lib/polymarket/clob'
import {
  CLOB_ENCRYPTION_KEY,
  CLOB_ENCRYPTION_KEY_V1,
  CLOB_ENCRYPTION_KEY_V2,
} from '@/lib/turnkey/config'
import { createHash, createDecipheriv } from 'crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Supabase env vars are required for Polymarket auth client')
}

const supabaseAdmin = createServiceClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

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
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

export async function getAuthedClobClientForUser(userId: string) {
  const { data: wallet, error: walletError } = await supabaseAdmin
    .from('turnkey_wallets')
    .select('id, wallet_type, eoa_address, polymarket_account_address, turnkey_private_key_id')
    .eq('user_id', userId)
    .eq('wallet_type', 'imported_magic')
    .single()

  if (walletError || !wallet) {
    throw new Error('Imported Magic wallet not found for user')
  }

  const proxyAddress = wallet.polymarket_account_address?.toLowerCase()
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

  const fetchCredential = (columns: string) =>
    supabaseAdmin
      .from('clob_credentials')
      .select(columns)
      .eq('user_id', userId)
      .eq('polymarket_account_address', proxyAddress)
      .single()

  const credentialResult = await fetchCredential(
    'api_key, api_secret_encrypted, api_passphrase_encrypted, enc_kid'
  )

  if (!credentialResult.error && credentialResult.data) {
    credential = credentialResult.data
  }
  credentialError = credentialResult.error

  if (credentialError?.code === '42703') {
    const legacyResult = await fetchCredential('api_key, api_secret_encrypted, api_passphrase_encrypted')
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
  const client = createClobClient(signer, signatureType, apiCreds, proxyAddress)

  return {
    client,
    proxyAddress,
    signerAddress: wallet.eoa_address,
    signatureType,
  }
}
