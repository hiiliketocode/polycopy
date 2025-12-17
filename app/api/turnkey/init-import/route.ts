import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TURNKEY_ENABLED } from '@/lib/turnkey/config'
import { initTurnkeyImport } from '@/lib/turnkey/import'

const DEV_BYPASS_AUTH =
  process.env.TURNKEY_DEV_ALLOW_UNAUTH === 'true' &&
  Boolean(process.env.TURNKEY_DEV_BYPASS_USER_ID)

export async function POST() {
  if (!TURNKEY_ENABLED) {
    return NextResponse.json(
      { enabled: false, error: 'Turnkey disabled via TURNKEY_ENABLED' },
      { status: 503 }
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  // Always use the logged-in user's ID from Supabase
  // Only use env variable if explicitly in dev mode AND no user exists
  let userId: string | null = null
  
  if (user?.id) {
    // User is logged in - use their Supabase user ID
    userId = user.id
    console.log(`[Turnkey Import] Using logged-in user ID from Supabase: ${userId}`)
  } else if (DEV_BYPASS_AUTH && process.env.TURNKEY_DEV_BYPASS_USER_ID) {
    // Dev bypass mode - only use env if no user is logged in
    userId = process.env.TURNKEY_DEV_BYPASS_USER_ID
    console.log(`[Turnkey Import] Dev bypass: Using env user ID: ${userId}`)
  }

  // Require a user ID
  if (!userId) {
    console.error(`[Turnkey Import] No user ID found. User: ${user?.id}, Error: ${error?.message}`)
    return NextResponse.json(
      { error: 'Unauthorized - please log in' },
      { status: 401 }
    )
  }

  // If there's an auth error and we're not in dev bypass, fail
  if (error && !DEV_BYPASS_AUTH) {
    console.error(`[Turnkey Import] Auth error: ${error.message}`)
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 401 }
    )
  }

  try {
    // Use the logged-in user's Supabase ID directly
    const result = await initTurnkeyImport({ 
      userId
    })
    return NextResponse.json({
      enabled: true,
      userId,
      devBypass: DEV_BYPASS_AUTH && !user?.id,
      ...result,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to init Turnkey import' },
      { status: 500 }
    )
  }
}

