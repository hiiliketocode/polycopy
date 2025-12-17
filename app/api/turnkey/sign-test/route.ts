import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TURNKEY_ENABLED } from '@/lib/turnkey/config'
import { signMessageForUser } from '@/lib/turnkey/wallet-simple'

const DEV_BYPASS_AUTH =
  process.env.TURNKEY_DEV_ALLOW_UNAUTH === 'true' &&
  Boolean(process.env.TURNKEY_DEV_BYPASS_USER_ID)

/**
 * POST /api/turnkey/sign-test
 * 
 * Signs a test message using the authenticated user's Turnkey wallet.
 * 
 * Input: { message: string }
 * Output: { address, signature }
 */
export async function POST(request: Request) {
  console.log('[Turnkey Sign Test] Request received')
  
  if (!TURNKEY_ENABLED) {
    console.log('[Turnkey Sign Test] Turnkey disabled')
    return NextResponse.json(
      { error: 'Turnkey is not enabled' },
      { status: 503 }
    )
  }

  // Authenticate user
  console.log('[Turnkey Sign Test] Checking authentication...')
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  console.log('[Turnkey Sign Test] User:', user?.id, 'Error:', authError?.message)

  // Allow dev bypass
  let userId: string | null = null
  
  if (user?.id) {
    userId = user.id
    console.log('[Turnkey Sign Test] Using authenticated user:', userId)
  } else if (DEV_BYPASS_AUTH && process.env.TURNKEY_DEV_BYPASS_USER_ID) {
    userId = process.env.TURNKEY_DEV_BYPASS_USER_ID
    console.log('[Turnkey Sign Test] DEV BYPASS: Using env user:', userId)
  }

  if (!userId) {
    console.error('[Turnkey Sign Test] Auth failed:', authError?.message)
    return NextResponse.json(
      { error: 'Unauthorized - please log in', details: authError?.message },
      { status: 401 }
    )
  }

  // Parse request body
  let message: string
  try {
    const body = await request.json()
    message = body.message
    
    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required and must be a string' },
        { status: 400 }
      )
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  try {
    console.log(`[API] Signing message for user: ${userId}`)
    
    const result = await signMessageForUser(userId, message)
    
    return NextResponse.json({
      address: result.address,
      signature: result.signature,
      message: result.message,
      devBypass: DEV_BYPASS_AUTH && !user?.id,
    })
  } catch (error: any) {
    console.error('[API] Message signing error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to sign message' },
      { status: 500 }
    )
  }
}

