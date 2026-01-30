// Debug endpoint to find trades that exist in orders table but not in orders_copy_enriched view
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

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

export async function GET(request: NextRequest) {
  try {
    const supabaseAuth = await createAuthClient()
    const { data: userData } = await supabaseAuth.auth.getUser()
    const user = userData?.user

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceClient()

    // Get ALL orders for this user from the base orders table
    const { data: allOrders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .eq('copy_user_id', user.id)
      .order('created_at', { ascending: false })

    if (ordersError) {
      console.error('Error fetching orders:', ordersError)
      return NextResponse.json({ error: ordersError.message }, { status: 500 })
    }

    // Get orders from the enriched view
    const { data: enrichedOrders, error: enrichedError } = await supabase
      .from('orders_copy_enriched')
      .select('order_id, copied_trade_id, copied_market_title, status, filled_size, entry_size')
      .eq('copy_user_id', user.id)

    if (enrichedError) {
      console.error('Error fetching enriched orders:', enrichedError)
      return NextResponse.json({ error: enrichedError.message }, { status: 500 })
    }

    // Create a set of order IDs that appear in the enriched view
    const enrichedOrderIds = new Set(
      enrichedOrders?.map(o => o.order_id || o.copied_trade_id) || []
    )

    // Find orders that exist in base table but NOT in enriched view
    const missingOrders = allOrders?.filter(order => {
      const orderId = order.order_id || order.copied_trade_id
      return !enrichedOrderIds.has(orderId)
    }) || []

    // Analyze why they're missing
    const analysis = missingOrders.map(order => {
      const isOpenWithZeroFilled = 
        order.status?.toLowerCase() === 'open' && 
        (order.filled_size === 0 || order.filled_size === null)

      return {
        order_id: order.order_id,
        copied_trade_id: order.copied_trade_id,
        market_title: order.copied_market_title,
        status: order.status,
        filled_size: order.filled_size,
        size: order.size,
        amount_invested: order.amount_invested,
        created_at: order.created_at,
        reason: isOpenWithZeroFilled 
          ? 'Filtered out: status=open AND filled_size=0' 
          : 'Unknown reason',
        trade_method: order.trade_method
      }
    })

    // Also check for Seahawks specifically
    const seahawksOrders = allOrders?.filter(order => 
      order.copied_market_title?.toLowerCase().includes('seahawks') ||
      order.copied_market_title?.toLowerCase().includes('super bowl')
    ) || []

    return NextResponse.json({
      summary: {
        totalOrders: allOrders?.length || 0,
        ordersInEnrichedView: enrichedOrders?.length || 0,
        missingFromEnrichedView: missingOrders.length
      },
      missingOrders: analysis,
      seahawksOrders: seahawksOrders.map(o => ({
        order_id: o.order_id,
        copied_trade_id: o.copied_trade_id,
        market_title: o.copied_market_title,
        status: o.status,
        filled_size: o.filled_size,
        size: o.size,
        amount_invested: o.amount_invested,
        created_at: o.created_at,
        trade_method: o.trade_method,
        inEnrichedView: enrichedOrderIds.has(o.order_id || o.copied_trade_id)
      }))
    })

  } catch (error: any) {
    console.error('Error in check-missing-trades:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}
