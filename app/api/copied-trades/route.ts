// Copied trades API - with server-side session verification

import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkRateLimit } from '@/lib/rate-limit'
import { resolveOrdersTableName } from '@/lib/orders/table'

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

async function ensureTraderId(client: ReturnType<typeof createServiceClient>, walletAddress: string) {
  const normalized = walletAddress.toLowerCase()
  const { data: existing, error } = await client
    .from('traders')
    .select('id')
    .eq('wallet_address', normalized)
    .maybeSingle()

  if (error) throw error
  if (existing?.id) return existing.id

  const { data: inserted, error: insertError } = await client
    .from('traders')
    .insert({ wallet_address: normalized })
    .select('id')
    .single()

  if (insertError) throw insertError
  return inserted.id
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
    const ordersTable = await resolveOrdersTableName(supabase)
    
    // Fetch all copied trades for this user, ordered by copied_at DESC
    const { data: orders, error: dbError } = await supabase
      .from(ordersTable)
      .select(`
        order_id,
        copied_trade_id,
        copy_user_id,
        copied_trader_wallet,
        copied_trader_username,
        trader_profile_image_url,
        market_id,
        copied_market_title,
        market_slug,
        market_avatar_url,
        outcome,
        price_when_copied,
        price,
        size,
        amount_invested,
        created_at,
        trader_still_has_position,
        trader_closed_at,
        current_price,
        market_resolved,
        market_resolved_at,
        roi,
        trade_method,
        notification_closed_sent,
        notification_resolved_sent,
        last_checked_at,
        resolved_outcome,
        user_closed_at,
        user_exit_price
      `)
      .eq('copy_user_id', userId)
      .or('copied_trade_id.not.is.null,trade_method.eq.manual')
      .order('created_at', { ascending: false })
    
    if (dbError) {
      console.error('Error fetching copied trades:', dbError)
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }
    
    console.log('✅ Fetched', orders?.length || 0, 'cached copies for user', userId)
    
    const normalizedTrades = (orders || []).map((order) => ({
      id: order.copied_trade_id || order.order_id,
      trader_wallet: order.copied_trader_wallet || '',
      trader_username: order.copied_trader_username,
      trader_profile_image_url: order.trader_profile_image_url || null,
      market_id: order.market_id,
      market_title: order.copied_market_title || '',
      market_slug: order.market_slug,
      market_avatar_url: order.market_avatar_url || null,
      outcome: order.outcome || '',
      price_when_copied: order.price_when_copied ?? order.price ?? 0,
      amount_invested: order.amount_invested ?? null,
      copied_at: order.created_at,
      trader_still_has_position: order.trader_still_has_position,
      trader_closed_at: order.trader_closed_at,
      current_price: order.current_price,
      market_resolved: order.market_resolved,
      market_resolved_at: order.market_resolved_at,
      roi: order.roi,
      notification_closed_sent: order.notification_closed_sent,
      notification_resolved_sent: order.notification_resolved_sent,
      last_checked_at: order.last_checked_at,
      resolved_outcome: order.resolved_outcome,
      user_closed_at: order.user_closed_at,
      user_exit_price: order.user_exit_price,
    }))

    return NextResponse.json({
      trades: normalizedTrades,
      count: normalizedTrades.length,
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
    
    // Fetch trader profile image from Polymarket leaderboard (if not provided)
    let traderProfileImage = tradeData.traderProfileImage || null
    if (!traderProfileImage && tradeData.traderWallet) {
      try {
        console.log('🖼️ Fetching trader profile image for wallet:', tradeData.traderWallet)
        const leaderboardResponse = await fetch(
          `https://data-api.polymarket.com/v1/leaderboard?timePeriod=all&orderBy=VOL&limit=1&offset=0&category=overall&user=${tradeData.traderWallet}`,
          { next: { revalidate: 3600 } } // Cache for 1 hour
        )
        
        if (leaderboardResponse.ok) {
          const leaderboardData = await leaderboardResponse.json()
          if (Array.isArray(leaderboardData) && leaderboardData.length > 0) {
            traderProfileImage = leaderboardData[0].profileImage || null
            console.log('✅ Found trader profile image:', traderProfileImage ? 'yes' : 'no')
          }
        }
      } catch (err) {
        console.warn('⚠️ Failed to fetch trader profile image:', err)
        // Continue without image - not critical
      }
    }
    
    // Extract market avatar URL (if provided in tradeData)
    const marketAvatarUrl = tradeData.marketAvatarUrl || null
    
    const service = createServiceClient()
    const ordersTable = await resolveOrdersTableName(service)
    const copiedTradeId = randomUUID()
    const traderId = await ensureTraderId(service, tradeData.traderWallet)
    const normalizedPrice = tradeData.priceWhenCopied
    const normalizedAmountInvested =
      typeof tradeData.amountInvested === 'number' ? tradeData.amountInvested : null
    const size =
      normalizedAmountInvested && normalizedPrice && normalizedPrice > 0
        ? normalizedAmountInvested / normalizedPrice
        : normalizedAmountInvested ?? 0
    const now = new Date().toISOString()

    const { error: upsertError } = await service
      .from(ordersTable)
      .insert({
        order_id: copiedTradeId,
        trader_id: traderId,
        market_id: tradeData.marketId,
        outcome: tradeData.outcome,
        side: 'buy',
        order_type: 'manual',
        price: normalizedPrice,
        size,
        filled_size: size,
        remaining_size: 0,
        status: 'manual',
        created_at: now,
        updated_at: now,
        time_in_force: 'GTC',
        expiration: null,
        raw: {
          source: 'manual_copy',
          marketId: tradeData.marketId,
          outcome: tradeData.outcome,
        },
        copied_trader_id: traderId,
        copied_trader_wallet: tradeData.traderWallet,
        copied_trader_username: tradeData.traderUsername,
        copied_market_title: tradeData.marketTitle,
        price_when_copied: normalizedPrice,
        amount_invested: normalizedAmountInvested,
        trader_still_has_position: true,
        current_price: normalizedPrice,
        market_resolved: false,
        notification_closed_sent: false,
        notification_resolved_sent: false,
        last_checked_at: now,
        user_closed_at: null,
        user_exit_price: null,
        market_slug: tradeData.marketSlug || null,
        trader_profile_image_url: traderProfileImage,
        market_avatar_url: marketAvatarUrl,
        trade_method: 'manual',
        copy_user_id: userId,
        copied_trade_id: copiedTradeId,
        roi: null,
        resolved_outcome: null,
      })

    if (upsertError) {
      console.error('❌ Error inserting manual copied trade into orders:', upsertError)
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    console.log('✅ Trade created in orders:', copiedTradeId, 'for user', userId)

    return NextResponse.json(
      {
        trade: {
          id: copiedTradeId,
          trader_wallet: tradeData.traderWallet,
          trader_username: tradeData.traderUsername,
          market_id: tradeData.marketId,
          market_title: tradeData.marketTitle,
          market_slug: tradeData.marketSlug || null,
          outcome: tradeData.outcome,
          price_when_copied: normalizedPrice,
          amount_invested: normalizedAmountInvested,
          copied_at: now,
          trader_still_has_position: true,
          trader_closed_at: null,
          current_price: normalizedPrice,
          market_resolved: false,
          market_resolved_at: null,
          roi: null,
          user_closed_at: null,
          user_exit_price: null,
          resolved_outcome: null,
        },
      },
      { status: 201 }
    )

  } catch (error: any) {
    console.error('Error in POST /api/copied-trades:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
