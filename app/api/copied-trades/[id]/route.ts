// Copied trades individual operations - DELETE endpoint with server-side session verification

import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
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

/**
 * DELETE /api/copied-trades/[id]?userId=xxx
 * Delete a copied trade
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Get userId from query params
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Verify authentication using server client
    const supabaseAuth = await createAuthClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    
    // Log auth status for debugging
    console.log('🔐 DELETE Auth check - User exists:', !!user)
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

    const supabase = createServiceClient()
    const ordersTable = await resolveOrdersTableName(supabase)
    if (ordersTable !== 'orders') {
      console.error('❌ Orders table unavailable for copy trade deletes (resolved to', ordersTable, ')')
      return NextResponse.json({ error: 'Orders table unavailable' }, { status: 503 })
    }
    
    // Verify the trade belongs to this user before deleting
    const { data: order, error: fetchError } = await supabase
      .from(ordersTable)
      .select('order_id')
      .eq('copied_trade_id', id)
      .eq('copy_user_id', userId)
      .single()
    
    if (fetchError || !order) {
      console.log('❌ Trade not found or unauthorized:', fetchError?.message)
      return NextResponse.json({ error: 'Trade not found or unauthorized' }, { status: 404 })
    }
    
    const { error: updateError } = await supabase
      .from(ordersTable)
      .update({
        copy_user_id: null,
        copied_trade_id: null,
        copied_trader_id: null,
        copied_trader_wallet: null,
        copied_trader_username: null,
        copied_market_title: null,
        price_when_copied: null,
        amount_invested: null,
        trader_still_has_position: null,
        current_price: null,
        market_resolved: false,
        notification_closed_sent: false,
        notification_resolved_sent: false,
        last_checked_at: new Date().toISOString(),
      })
      .eq('order_id', order.order_id)
    
    if (updateError) {
      console.error('❌ Error clearing copied trade metadata:', updateError)
      return NextResponse.json({ error: 'Failed to clear copied trade', details: updateError.message }, { status: 500 })
    }
    
    console.log('✅ Copied trade metadata cleared:', id, 'for user', userId)
    
    return NextResponse.json({ success: true, message: 'Copied trade removed from feed' })
    
  } catch (error) {
    console.error('❌ Delete trade error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
