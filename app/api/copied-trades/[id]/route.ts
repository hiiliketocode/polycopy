// Copied trades individual operations - DELETE endpoint

import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

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

    // Verify authentication using route handler client
    const cookieStore = await cookies()
    const supabaseAuth = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { session }, error: authError } = await supabaseAuth.auth.getSession()
    
    // Log auth status for debugging
    console.log('🔐 DELETE Auth check - Session exists:', !!session)
    if (authError) {
      console.error('🔐 Auth error:', authError.message)
    }
    
    // If we have a session, verify the userId matches
    if (session && session.user.id !== userId) {
      console.error('❌ User ID mismatch')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const supabase = createServiceClient()
    
    // Verify the trade belongs to this user before deleting
    const { data: trade, error: fetchError } = await supabase
      .from('copied_trades')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', userId)
      .single()
    
    if (fetchError || !trade) {
      console.log('❌ Trade not found or unauthorized:', fetchError?.message)
      return NextResponse.json({ error: 'Trade not found or unauthorized' }, { status: 404 })
    }
    
    // Delete the trade
    const { error: deleteError } = await supabase
      .from('copied_trades')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    
    if (deleteError) {
      console.error('❌ Error deleting trade:', deleteError)
      return NextResponse.json({ error: 'Failed to delete trade' }, { status: 500 })
    }
    
    console.log('✅ Trade deleted successfully:', id, 'for user', userId)
    
    return NextResponse.json({ success: true, message: 'Trade deleted' })
    
  } catch (error) {
    console.error('❌ Delete trade error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

