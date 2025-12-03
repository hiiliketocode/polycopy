// Copied trades API - uses userId passed from client

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
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

/**
 * GET /api/copied-trades?userId=xxx
 * Fetch all copied trades for the specified user
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
    
    console.log('👤 User ID:', userId)
    
    // Use service role client to bypass RLS
    const supabase = createServiceClient()
    console.log('✅ Supabase service client created')
    
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
 * Create a new copied trade for the specified user
 */
export async function POST(request: NextRequest) {
  console.log('🔍 POST /api/copied-trades called')
  
  try {
    // Use service role client to bypass RLS
    const supabase = createServiceClient()
    console.log('✅ Supabase service client created')
    
    // Parse request body
    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }
    
    console.log('📦 Request body:', body)
    
    // Get userId from body
    const { userId, ...tradeData } = body
    
    if (!userId) {
      console.error('❌ Missing userId in request body')
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }
    
    // Rate limit: 50 trade copies per hour per user
    if (!checkRateLimit(`copy-trade:${userId}`, 50, 3600000)) {
      console.log('⚠️ Rate limit exceeded for user:', userId)
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' }, 
        { status: 429 }
      )
    }
    
    console.log('👤 User ID:', userId)
    
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
      console.error('Error inserting copied trade:', dbError)
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
