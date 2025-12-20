import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient, createClient as createSupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase environment variables for link status endpoint')
}

const supabaseAdmin = createSupabaseAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const DEV_BYPASS_AUTH =
  process.env.TURNKEY_DEV_ALLOW_UNAUTH === 'true' &&
  Boolean(process.env.TURNKEY_DEV_BYPASS_USER_ID)

type TurnkeyWalletRow = {
  id: string
  polymarket_account_address: string | null
  eoa_address: string | null
  wallet_type: string | null
}

type LinkStatusResponse = {
  polymarket_account_address: string | null
  has_imported_key: boolean
  eoa_address: string | null
  has_l2_credentials: boolean
  last_error?: string | null
}

const normalizeAddress = (value: string | null | undefined) => {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  let authError: Error | null = null
  let userId: string | null = null

  if (bearerToken) {
    const supabaseAuth = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { autoRefreshToken: false, persistSession: false },
      }
    )
    const { data: { user }, error } = await supabaseAuth.auth.getUser(bearerToken)
    authError = error ?? null
    userId = user?.id ?? null
  } else {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    authError = error ?? null
    userId = user?.id ?? null
  }

  if (!userId && DEV_BYPASS_AUTH && process.env.TURNKEY_DEV_BYPASS_USER_ID) {
    userId = process.env.TURNKEY_DEV_BYPASS_USER_ID
    console.log('[POLY-LINK-STATUS] DEV bypass using user id:', userId)
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized - please log in', details: authError?.message },
      { status: 401 }
    )
  }

  try {
    const { data: wallets, error: walletsError } = await supabaseAdmin
      .from('turnkey_wallets')
      .select('id, polymarket_account_address, eoa_address, wallet_type')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (walletsError) {
      console.error('[POLY-LINK-STATUS] Failed to load turnkey_wallets:', walletsError)
      throw walletsError
    }

    const importedWallet = (wallets || []).find(
      (wallet) => wallet.wallet_type === 'imported_magic'
    )

    const fallbackWallet: TurnkeyWalletRow | undefined = wallets?.[0]

    const polymarketAccountAddress = normalizeAddress(
      importedWallet?.polymarket_account_address ||
        fallbackWallet?.polymarket_account_address
    )
    const eoaAddress = importedWallet?.eoa_address || fallbackWallet?.eoa_address || null

    let hasL2Credentials = false
    if (polymarketAccountAddress) {
      const { data: credentialRow, error: credentialError } = await supabaseAdmin
        .from('clob_credentials')
        .select('id')
        .eq('user_id', userId)
        .eq('polymarket_account_address', polymarketAccountAddress)
        .limit(1)
        .maybeSingle()

      if (credentialError) {
        console.error('[POLY-LINK-STATUS] Failed to load clob_credentials:', credentialError)
        throw credentialError
      }

      hasL2Credentials = Boolean(credentialRow)
    }

    const response: LinkStatusResponse = {
      polymarket_account_address: polymarketAccountAddress,
      has_imported_key: Boolean(importedWallet),
      eoa_address: eoaAddress,
      has_l2_credentials: hasL2Credentials,
    }

    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load link status'
    console.error('[POLY-LINK-STATUS] Unexpected error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
