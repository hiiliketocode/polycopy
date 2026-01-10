import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth'

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

export const dynamic = 'force-dynamic'

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

export async function GET() {
  // Use centralized secure auth utility
  const userId = await getAuthenticatedUserId()

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized - please log in' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
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

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load link status'
    console.error('[POLY-LINK-STATUS] Unexpected error:', message)
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
