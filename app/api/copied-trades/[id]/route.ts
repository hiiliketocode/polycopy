// Copied trades individual operations - DELETE endpoint

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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
    
    console.log('✅ Trade deleted successfully:', id)
    
    return NextResponse.json({ success: true, message: 'Trade deleted' })
    
  } catch (error) {
    console.error('❌ Delete trade error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

