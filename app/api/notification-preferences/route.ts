import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { badRequest, unauthorized, forbidden, databaseError } from '@/lib/http/error-response'

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
 * GET /api/notification-preferences?userId=xxx
 * Fetch notification preferences for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    // Verify authentication using server client
    const supabaseAuth = await createAuthClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    
    if (authError) {
      console.error('🔐 Notification prefs auth error:', authError.message, authError)
    }
    
    // SECURITY: Require valid user - NO graceful degradation
    if (!user) {
      console.error('❌ No authenticated user for notification prefs')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // SECURITY: Verify the userId matches the authenticated user
    if (user.id !== userId) {
      console.error('❌ User ID mismatch - auth user:', user.id, 'requested:', userId)
      return NextResponse.json({ error: 'Forbidden - user ID mismatch' }, { status: 403 })
    }

    const supabase = createServiceClient()
    
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single()
    
    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine (user hasn't set preferences yet)
      return databaseError(error, 'fetch notification preferences')
    }
    
    // Return preferences or defaults
    return NextResponse.json(data || { 
      email_notifications_enabled: true,
      user_id: userId
    })
    
  } catch (error: any) {
    console.error('Error in GET /api/notification-preferences:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/notification-preferences
 * Update notification preferences for the authenticated user
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      userId,
      email_notifications_enabled,
      default_buy_slippage,
      default_sell_slippage,
      trader_closes_position,
      market_resolves,
    } = body
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    const normalizeSlippage = (value: unknown) => {
      if (value === null || value === undefined) return undefined
      const numericValue = typeof value === 'string' ? parseFloat(value) : value
      if (!Number.isFinite(numericValue)) return undefined
      return Math.max(0, Math.min(100, Number(numericValue)))
    }

    const normalizedBuySlippage = normalizeSlippage(default_buy_slippage)
    const normalizedSellSlippage = normalizeSlippage(default_sell_slippage)

    if (
      default_buy_slippage !== undefined &&
      normalizedBuySlippage === undefined
    ) {
      return NextResponse.json({ error: 'Invalid buy slippage' }, { status: 400 })
    }

    if (
      default_sell_slippage !== undefined &&
      normalizedSellSlippage === undefined
    ) {
      return NextResponse.json({ error: 'Invalid sell slippage' }, { status: 400 })
    }

    // Verify authentication using server client
    const supabaseAuth = await createAuthClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    
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

    // Rate limit: 20 preference changes per hour
    if (!checkRateLimit(`notification-prefs:${userId}`, 20, 3600000)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    const supabase = createServiceClient()

    const updates: Record<string, any> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    }

    if (email_notifications_enabled !== undefined) {
      updates.email_notifications_enabled = !!email_notifications_enabled
    }
    if (trader_closes_position !== undefined) {
      updates.trader_closes_position = !!trader_closes_position
    }
    if (market_resolves !== undefined) {
      updates.market_resolves = !!market_resolves
    }
    if (normalizedBuySlippage !== undefined) {
      updates.default_buy_slippage = normalizedBuySlippage
    }
    if (normalizedSellSlippage !== undefined) {
      updates.default_sell_slippage = normalizedSellSlippage
    }

    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert(updates, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) {
      console.error('Notification preferences upsert error', {
        code: (error as any)?.code,
        message: (error as any)?.message,
        details: (error as any)?.details,
        hint: (error as any)?.hint,
        updates,
      })
      return databaseError(error, 'update notification preferences')
    }
    
    return NextResponse.json(data)
    
  } catch (error: any) {
    console.error('Error in PUT /api/notification-preferences:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
