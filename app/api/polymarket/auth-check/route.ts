import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createHash, createDecipheriv } from 'crypto'
import {
  CLOB_ENCRYPTION_KEY,
  CLOB_ENCRYPTION_KEY_V1,
  CLOB_ENCRYPTION_KEY_V2,
} from '@/lib/turnkey/config'
import { createTurnkeySigner } from '@/lib/polymarket/turnkey-signer'
import { createClobClient, SignatureType } from '@/lib/polymarket/clob'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase environment variables for auth check endpoint')
}

const supabaseServiceRole = createServiceClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const DEV_BYPASS_AUTH =
  process.env.TURNKEY_DEV_ALLOW_UNAUTH === 'true' &&
  Boolean(process.env.TURNKEY_DEV_BYPASS_USER_ID)

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

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  let userId: string | null = user?.id ?? null
  if (!userId && DEV_BYPASS_AUTH && process.env.TURNKEY_DEV_BYPASS_USER_ID) {
    userId = process.env.TURNKEY_DEV_BYPASS_USER_ID
    console.log('[POLY-AUTH-CHECK] DEV bypass using user id:', userId)
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized - please log in', details: authError?.message },
      { status: 401 }
    )
  }

  try {
    const { data: wallet, error: walletError } = await supabaseServiceRole
      .from('turnkey_wallets')
      .select('id, wallet_type, eoa_address, polymarket_account_address, turnkey_private_key_id')
      .eq('user_id', userId)
      .eq('wallet_type', 'imported_magic')
      .single()

    if (walletError || !wallet) {
      return NextResponse.json(
        { error: 'Imported Magic wallet not found for user' },
        { status: 404 }
      )
    }

    const proxyAddress = wallet.polymarket_account_address?.toLowerCase() || null
    if (!proxyAddress) {
      return NextResponse.json(
        { error: 'Polymarket proxy address missing for wallet' },
        { status: 400 }
      )
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
      supabaseServiceRole
        .from('clob_credentials')
        .select(columns)
        .eq('user_id', userId)
        .eq('polymarket_account_address', proxyAddress)
        .single()

    const credentialResult = await fetchCredential(
      'api_key, api_secret_encrypted, api_passphrase_encrypted, enc_kid'
    )

    const credentialData = credentialResult.data as
      | {
          api_key: string
          api_secret_encrypted: string
          api_passphrase_encrypted: string
          enc_kid?: string | null
        }
      | null

    const credentialErr = credentialResult.error

    if (!credentialErr && credentialData) {
      credential = credentialData
    }
    credentialError = credentialErr

    if (credentialError?.code === '42703') {
      const legacyResult = await fetchCredential('api_key, api_secret_encrypted, api_passphrase_encrypted')
      credential = legacyResult.data
      credentialError = legacyResult.error
      if (credential) {
        credential.enc_kid = 'legacy'
      }
    }

    if (credentialError || !credential) {
      return NextResponse.json(
        { error: 'No Polymarket API credentials found. Run L2 credential setup.' },
        { status: 404 }
      )
    }

    const encryptionKid = credential.enc_kid || 'legacy'
    const apiCreds = {
      key: credential.api_key,
      secret: decryptSecret(credential.api_secret_encrypted, encryptionKid),
      passphrase: decryptSecret(credential.api_passphrase_encrypted, encryptionKid),
    }

    const signer = await createTurnkeySigner(userId, supabaseServiceRole, wallet)
    const signatureType: SignatureType = 2
    const client = createClobClient(signer, signatureType, apiCreds, proxyAddress)
    const closedOnlyMode = await client.getClosedOnlyMode()

    return NextResponse.json({
      ok: true,
      signer: wallet.eoa_address,
      proxy: proxyAddress,
      signatureType,
      result: {
        kind: 'closed_only_mode',
        value: closedOnlyMode,
      },
    })
  } catch (error: any) {
    console.error('[POLY-AUTH-CHECK] Error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Failed to check Polymarket authentication' },
      { status: 500 }
    )
  }
}
