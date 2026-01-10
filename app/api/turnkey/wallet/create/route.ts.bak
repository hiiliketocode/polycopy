import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth'
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit'
import { TURNKEY_ENABLED } from '@/lib/turnkey/config'
import { getOrCreateWalletForUser } from '@/lib/turnkey/wallet-simple'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

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
export async function POST(request: NextRequest) {
  console.log('[TURNKEY] Request received')
  
  if (!TURNKEY_ENABLED) {
    console.log('[TURNKEY] Turnkey disabled')
    return NextResponse.json(
      { error: 'Turnkey is not enabled' },
      { status: 503 }
    )
  }

  // Use centralized secure auth utility
  // This endpoint supports both Bearer token and cookie-based auth
  let userId: string | null = null
  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (bearerToken) {
    // Bearer token auth
    const supabaseAuth = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: { user } } = await supabaseAuth.auth.getUser(bearerToken)
    userId = user?.id ?? null
  } else {
    // Cookie-based auth (uses centralized utility)
    userId = await getAuthenticatedUserId(request)
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized - please log in' },
      { status: 401 }
    )
  }

  // SECURITY: Rate limit wallet creation (CRITICAL tier)
  const rateLimitResult = await checkRateLimit(request, 'CRITICAL', userId, 'ip-user')
  if (!rateLimitResult.success) {
    return rateLimitedResponse(rateLimitResult)
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
