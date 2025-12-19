import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TURNKEY_ENABLED } from '@/lib/turnkey/config'
import { getOrCreateWalletForUser } from '@/lib/turnkey/wallet-simple'

const DEV_BYPASS_AUTH =
  process.env.TURNKEY_DEV_ALLOW_UNAUTH === 'true' &&
  Boolean(process.env.TURNKEY_DEV_BYPASS_USER_ID)

/**
 * POST /api/turnkey/wallet/create
 * 
 * Creates or retrieves a Turnkey wallet for the authenticated user.
 * This endpoint is TRULY IDEMPOTENT - calling it multiple times for the same user
 * will ALWAYS return the same wallet without creating duplicates.
 * 
 * Input: None (uses authenticated user's ID)
 * Output: { walletId, address }
 */
export async function POST() {
  console.log('[TURNKEY] Request received')
  
  if (!TURNKEY_ENABLED) {
    console.log('[TURNKEY] Turnkey disabled')
    return NextResponse.json(
      { error: 'Turnkey is not enabled' },
      { status: 503 }
    )
  }

  // Authenticate user
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  // Allow dev bypass
  let userId: string | null = null
  
  if (user?.id) {
    userId = user.id
  } else if (DEV_BYPASS_AUTH && process.env.TURNKEY_DEV_BYPASS_USER_ID) {
    userId = process.env.TURNKEY_DEV_BYPASS_USER_ID
    console.log('[TURNKEY] DEV BYPASS: Using env user:', userId)
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized - please log in', details: authError?.message },
      { status: 401 }
    )
  }

  try {
    const result = await getOrCreateWalletForUser(userId)
    return NextResponse.json(result)

  } catch (error: any) {
    console.error('[TURNKEY] Wallet creation error:', error.message)
    return NextResponse.json(
      { error: error.message || 'Failed to create wallet' },
      { status: 500 }
    )
  }
}
