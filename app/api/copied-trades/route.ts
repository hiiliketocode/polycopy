// Copied trades API - with server-side session verification

import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkRateLimit } from '@/lib/rate-limit'

// Create service role client that bypasses RLS for database operations
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

/**
 * GET /api/copied-trades?userId=xxx
 * Fetch all copied trades for the authenticated user
 */
export async function GET(request: NextRequest) {
  console.log('🔍 GET /api/copied-trades called')
  
  try {
    // Get userId from query params
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    
    if (!userId) {
      console.error('❌ Missing userId in request')
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }
    
    // Verify authentication using server client
    const supabaseAuth = await createAuthClient()
    
    // Use getUser() instead of getSession() - more reliable for server-side auth
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    
    // Log auth status for debugging
    console.log('🔐 Auth check - User exists:', !!user)
    if (authError) {
      console.error('🔐 Auth error:', authError.message)
    }
    
    // SECURITY: Require valid user
    if (!user) {
      console.error('❌ No authenticated user - unauthorized')
      return NextResponse.json({ error: 'Unauthorized - please log in' }, { status: 401 })
    }
    
    // SECURITY: Verify the userId matches the authenticated user
    if (user.id !== userId) {
      console.error('❌ User ID mismatch - auth user:', user.id, 'requested:', userId)
      return NextResponse.json({ error: 'Forbidden - user ID mismatch' }, { status: 403 })
    }
    
    // Use service role client for database operations
    const supabase = createServiceClient()
    
    // Fetch all copied trades for this user, ordered by copied_at DESC
    const { data: trades, error: dbError } = await supabase
      .from('copied_trades')
      .select('*')
      .eq('user_id', userId)
      .order('copied_at', { ascending: false })
    
    if (dbError) {
      console.error('Error fetching copied trades:', dbError)
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }
    
    console.log('✅ Fetched', trades?.length || 0, 'trades for user', userId)
    
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
 */
export async function POST(request: NextRequest) {
  console.log('🔍 POST /api/copied-trades called')
  
  try {
    // Debug: Log available cookies
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()
    console.log('🍪 Available cookies:', allCookies.map(c => c.name))
    
    // Check for Supabase auth cookies
    const authCookies = allCookies.filter(c => c.name.includes('auth') || c.name.startsWith('sb-'))
    console.log('🔐 Auth-related cookies found:', authCookies.map(c => c.name))
    
    // Parse request body first
    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }
    
    console.log('📦 Request body received')
    
    // Get userId from body
    const { userId, ...tradeData } = body
    
    if (!userId) {
      console.error('❌ Missing userId in request body')
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }
    
    // Verify authentication using server client
    const supabaseAuth = await createAuthClient()
    
    // Use getUser() instead of getSession() - more reliable for server-side auth
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    
    // Log auth status for debugging
    console.log('🔐 Auth check - User exists:', !!user)
    console.log('🔐 Auth check - User ID from auth:', user?.id)
    console.log('🔐 Auth check - Requested user ID:', userId)
    if (authError) {
      console.error('🔐 Auth error:', authError.message)
    }
    
    // SECURITY: Require valid user
    if (!user) {
      console.error('❌ No authenticated user - unauthorized')
      return NextResponse.json({ error: 'Unauthorized - please log in' }, { status: 401 })
    }
    
    // SECURITY: Verify the userId matches the authenticated user
    if (user.id !== userId) {
      console.error('❌ User ID mismatch - auth user:', user.id, 'requested:', userId)
      return NextResponse.json({ error: 'Forbidden - user ID mismatch' }, { status: 403 })
    }
    
    // Rate limit: 50 trade copies per hour per user
    if (!checkRateLimit(`copy-trade:${userId}`, 50, 3600000)) {
      console.log('⚠️ Rate limit exceeded for user:', userId)
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' }, 
        { status: 429 }
      )
    }
    
    console.log('👤 Processing for User ID:', userId)
    
    // Validate required fields
    const required = ['traderWallet', 'traderUsername', 'marketId', 'marketTitle', 'outcome', 'priceWhenCopied']
    for (const field of required) {
      if (!tradeData[field] && tradeData[field] !== 0) {
        console.error('❌ Missing required field:', field)
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
    
    // Use service role client for database operations (bypasses RLS)
    const supabase = createServiceClient()
    
    // Insert the copied trade
    const { data: trade, error: dbError } = await supabase
      .from('copied_trades')
      .insert({
        user_id: userId,
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
      console.error('❌ Error inserting copied trade:', dbError)
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }
    
    console.log('✅ Trade created:', trade?.id, 'for user', userId)
    
    return NextResponse.json({ trade }, { status: 201 })

  } catch (error: any) {
    console.error('Error in POST /api/copied-trades:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
