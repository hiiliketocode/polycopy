import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TURNKEY_ENABLED } from '@/lib/turnkey/config'
import { completeTurnkeyImport } from '@/lib/turnkey/import'
import type { TurnkeyCompletePayload } from '@/lib/turnkey/types'

const DEV_BYPASS_AUTH =
  process.env.TURNKEY_DEV_ALLOW_UNAUTH === 'true' &&
  Boolean(process.env.TURNKEY_DEV_BYPASS_USER_ID)

export async function POST(request: Request) {
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
  let userId: string | null = null
  
  if (user?.id) {
    userId = user.id
    console.log(`[Turnkey Complete] Using logged-in user ID from Supabase: ${userId}`)
  } else if (DEV_BYPASS_AUTH && process.env.TURNKEY_DEV_BYPASS_USER_ID) {
    userId = process.env.TURNKEY_DEV_BYPASS_USER_ID
    console.log(`[Turnkey Complete] Dev bypass: Using env user ID: ${userId}`)
  }

  if (!userId) {
    console.error(`[Turnkey Complete] No user ID found. User: ${user?.id}, Error: ${error?.message}`)
    return NextResponse.json(
      { error: 'Unauthorized - please log in' },
      { status: 401 }
    )
  }

  if (error && !DEV_BYPASS_AUTH) {
    console.error(`[Turnkey Complete] Auth error: ${error.message}`)
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 401 }
    )
  }

  const body = (await request.json()) as Partial<TurnkeyCompletePayload> | null
  const payload: TurnkeyCompletePayload | null = body
    ? {
        sessionId: body.sessionId || '',
        subOrganizationId: body.subOrganizationId || '',
        walletId: body.walletId || '',
        privateKeyId: body.privateKeyId || '',
        eoaAddress: body.eoaAddress,
        polymarketProxyAddress: body.polymarketProxyAddress,
      }
    : null

  if (!payload) {
    return NextResponse.json(
      { error: 'Request body required' },
      { status: 400 }
    )
  }

  const missing = [
    ['sessionId', payload.sessionId],
    ['subOrganizationId', payload.subOrganizationId],
    ['walletId', payload.walletId],
    ['privateKeyId', payload.privateKeyId],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing fields: ${missing.join(', ')}` },
      { status: 400 }
    )
  }

  try {
    // The completeTurnkeyImport function searches by privateKeyName, but we have privateKeyId
    // We need to construct the name or find the key by ID. For now, use a pattern that matches
    // the naming convention from initTurnkeyImport: imported-magic-${userId}-${timestamp}
    // Since we don't have the exact timestamp, we'll search for keys matching the pattern
    const privateKeyName = `imported-magic-${userId}`
    const result = await completeTurnkeyImport(userId, privateKeyName)
    return NextResponse.json({
      enabled: true,
      userId,
      devBypass: DEV_BYPASS_AUTH && !user?.id,
      ...result,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to complete Turnkey import' },
      { status: 500 }
    )
  }
}

