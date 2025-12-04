// Copied trades API - with server-side session verification

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkRateLimit } from '@/lib/rate-limit'

// Create service role client that bypasses RLS
function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

// Create server client to verify session
async function createAuthClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )
}

/**
 * GET /api/copied-trades?userId=xxx
 * Fetch all copied trades for the authenticated user
 * Security: Verifies session server-side before returning data
 */
export async function GET(request: NextRequest) {
  console.log('🔍 GET /api/copied-trades called')
  
  try {
    // Get userId from query params (for reference, but we verify server-side)
    const { searchParams } = new URL(request.url)
    const requestedUserId = searchParams.get('userId')
    
    if (!requestedUserId) {
      console.error('❌ Missing userId in request')
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }
    
    // SECURITY: Verify the session server-side
    const authClient = await createAuthClient()
    const { data: { user: sessionUser }, error: authError } = await authClient.auth.getUser()
    
    if (authError || !sessionUser) {
      console.error('❌ Unauthorized - no valid session')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // SECURITY: Ensure the requested userId matches the authenticated user
    if (requestedUserId !== sessionUser.id) {
      console.error('❌ User ID mismatch - attempted to access other user data')
      console.error('   Requested:', requestedUserId)
      console.error('   Authenticated:', sessionUser.id)
      return NextResponse.json({ error: 'Unauthorized - user ID mismatch' }, { status: 403 })
    }
    
    console.log('👤 Verified User ID:', sessionUser.id)
    
    // Use service role client to bypass RLS
    const supabase = createServiceClient()
    
    // Fetch all copied trades for this user, ordered by copied_at DESC
    const { data: trades, error: dbError } = await supabase
      .from('copied_trades')
      .select('*')
      .eq('user_id', sessionUser.id)  // Use verified session user ID
      .order('copied_at', { ascending: false })
    
    if (dbError) {
      console.error('Error fetching copied trades:', dbError)
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }
    
    console.log('✅ Fetched', trades?.length || 0, 'trades for user', sessionUser.id)
    
    return NextResponse.json({
      trades: trades || [],
      count: trades?.length || 0,
    })

  } catch (error: any) {
    console.error('Error in GET /api/copied-trades:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/copied-trades
 * Create a new copied trade for the authenticated user
 * Security: Verifies session server-side before creating data
 */
export async function POST(request: NextRequest) {
  console.log('🔍 POST /api/copied-trades called')
  
  try {
    // Parse request body first
    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }
    
    // Get userId from body (for reference, but we verify server-side)
    const { userId: requestedUserId, ...tradeData } = body
    
    if (!requestedUserId) {
      console.error('❌ Missing userId in request body')
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }
    
    // SECURITY: Verify the session server-side
    const authClient = await createAuthClient()
    const { data: { user: sessionUser }, error: authError } = await authClient.auth.getUser()
    
    if (authError || !sessionUser) {
      console.error('❌ Unauthorized - no valid session')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // SECURITY: Ensure the requested userId matches the authenticated user
    if (requestedUserId !== sessionUser.id) {
      console.error('❌ User ID mismatch - attempted to create trade for other user')
      return NextResponse.json({ error: 'Unauthorized - user ID mismatch' }, { status: 403 })
    }
    
    // Rate limit: 50 trade copies per hour per user
    if (!checkRateLimit(`copy-trade:${sessionUser.id}`, 50, 3600000)) {
      console.log('⚠️ Rate limit exceeded for user:', sessionUser.id)
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' }, 
        { status: 429 }
      )
    }
    
    console.log('👤 Verified User ID:', sessionUser.id)
    
    // Validate required fields
    const required = ['traderWallet', 'traderUsername', 'marketId', 'marketTitle', 'outcome', 'priceWhenCopied']
    for (const field of required) {
      if (!tradeData[field] && tradeData[field] !== 0) {
        return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 })
      }
    }
    
    // Validate outcome - accept any string (YES/NO, Up/Down, candidate names, etc.)
    if (!tradeData.outcome || typeof tradeData.outcome !== 'string') {
      return NextResponse.json({ error: 'Outcome is required' }, { status: 400 })
    }
    
    // Validate priceWhenCopied
    if (typeof tradeData.priceWhenCopied !== 'number' || tradeData.priceWhenCopied < 0 || tradeData.priceWhenCopied > 1) {
      return NextResponse.json({ error: 'priceWhenCopied must be a number between 0 and 1' }, { status: 400 })
    }
    
    // Use service role client to bypass RLS
    const supabase = createServiceClient()
    
    // Insert the copied trade using verified session user ID
    const { data: trade, error: dbError } = await supabase
      .from('copied_trades')
      .insert({
        user_id: sessionUser.id,  // Use verified session user ID
        trader_wallet: tradeData.traderWallet,
        trader_username: tradeData.traderUsername,
        market_id: tradeData.marketId,
        market_title: tradeData.marketTitle,
        outcome: tradeData.outcome,
        price_when_copied: tradeData.priceWhenCopied,
        amount_invested: tradeData.amountInvested || null,
      })
      .select()
      .single()
    
    if (dbError) {
      console.error('Error inserting copied trade:', dbError)
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }
    
    console.log('✅ Trade created:', trade?.id, 'for user', sessionUser.id)
    
    return NextResponse.json({ trade }, { status: 201 })

  } catch (error: any) {
    console.error('Error in POST /api/copied-trades:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
