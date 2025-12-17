import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TURNKEY_ENABLED } from '@/lib/turnkey/config'
import { completeTurnkeyImport } from '@/lib/turnkey/import'

// Dev bypass
const DEV_BYPASS_AUTH = process.env.NODE_ENV === 'development' && process.env.TURNKEY_DEV_BYPASS_USER_ID

/**
 * POST /api/turnkey/import/complete
 * 
 * Complete Turnkey import after user has pasted private key in iframe
 * Polls for completion and stores wallet reference in DB
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

    const { importId } = await request.json()

    if (!importId) {
      return NextResponse.json(
        { error: 'importId is required' },
        { status: 400 }
      )
    }

    // Complete import
    const result = await completeTurnkeyImport(userId, importId)

    console.log('[POLY-AUTH] Import completed successfully')

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[POLY-AUTH] Import complete error:', error.message)
    return NextResponse.json(
      { error: error.message || 'Failed to complete import' },
      { status: 500 }
    )
  }
}

