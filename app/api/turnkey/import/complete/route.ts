import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TURNKEY_ENABLED } from '@/lib/turnkey/config'
import { completeTurnkeyImport } from '@/lib/turnkey/import'

// Dev bypass
const DEV_BYPASS_AUTH = process.env.NODE_ENV === 'development' && process.env.TURNKEY_DEV_BYPASS_USER_ID

/**
 * POST /api/turnkey/import/complete
 * 
 * Complete Turnkey import after user has imported via iframe
 * Frontend provides the walletId returned by Turnkey iframe
 * We verify it exists and store the reference in our DB
 * 
 * Private key never touches our servers - it goes directly to Turnkey
 */
export async function POST(request: NextRequest) {
  console.log('[POLY-AUTH] Import complete request received')

  if (!TURNKEY_ENABLED) {
    return NextResponse.json(
      { error: 'Turnkey is not enabled' },
      { status: 503 }
    )
  }

  try {
    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    let userId: string | null = null

    if (user?.id) {
      userId = user.id
    } else if (DEV_BYPASS_AUTH && process.env.TURNKEY_DEV_BYPASS_USER_ID) {
      userId = process.env.TURNKEY_DEV_BYPASS_USER_ID
      console.log('[POLY-AUTH] DEV BYPASS: Using env user:', userId)
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized - please log in' },
        { status: 401 }
      )
    }

    const { walletName } = await request.json()

    if (!walletName) {
      return NextResponse.json(
        { error: 'walletName is required' },
        { status: 400 }
      )
    }

    console.log('[POLY-AUTH] Completing import - User:', userId, 'Wallet:', walletName)

    // Complete import - searches for wallet and stores reference
    const result = await completeTurnkeyImport(userId, walletName)

    console.log('[POLY-AUTH] Import completed successfully')

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error: any) {
    console.error('[POLY-AUTH] Import complete error:', error.message)
    return NextResponse.json(
      { error: error.message || 'Failed to complete import' },
      { status: 500 }
    )
  }
}
