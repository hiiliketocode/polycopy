import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TURNKEY_ENABLED } from '@/lib/turnkey/config'
import { initTurnkeyImport } from '@/lib/turnkey/import'

// Dev bypass
const DEV_BYPASS_AUTH = process.env.NODE_ENV === 'development' && process.env.TURNKEY_DEV_BYPASS_USER_ID

/**
 * POST /api/turnkey/import/init
 * 
 * Initialize Turnkey import ceremony for Magic Link private key
 * Returns iframe URL that user will interact with to securely import their key
 * 
 * PolyCopy never sees the private key - it stays in Turnkey's iframe
 */
export async function POST() {
  console.log('[POLY-AUTH] Import init request received')

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

    // Initialize import
    const result = await initTurnkeyImport(userId)

    console.log('[TURNKEY-IMPORT] Init successful, iframe URL:', result.iframeUrl)
    console.log('[TURNKEY-IMPORT] Import bundle:', result.importBundle)

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[POLY-AUTH] Import init error:', error.message)
    return NextResponse.json(
      { error: error.message || 'Failed to initialize import' },
      { status: 500 }
    )
  }
}

