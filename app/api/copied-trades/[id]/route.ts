// Copied trades individual operations - DELETE endpoint with server-side session verification

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

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
 * DELETE /api/copied-trades/[id]?userId=xxx
 * Delete a copied trade
 * Security: Verifies session server-side before deleting
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Get userId from query params (for reference, but we verify server-side)
    const { searchParams } = new URL(request.url)
    const requestedUserId = searchParams.get('userId')
    
    if (!requestedUserId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
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
      console.error('❌ User ID mismatch - attempted to delete other user trade')
      return NextResponse.json({ error: 'Unauthorized - user ID mismatch' }, { status: 403 })
    }

    const supabase = createServiceClient()
    
    // Verify the trade belongs to this user before deleting (using verified session user)
    const { data: trade, error: fetchError } = await supabase
      .from('copied_trades')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', sessionUser.id)
      .single()
    
    if (fetchError || !trade) {
      console.log('❌ Trade not found or unauthorized:', fetchError?.message)
      return NextResponse.json({ error: 'Trade not found or unauthorized' }, { status: 404 })
    }
    
    // Delete the trade using verified session user ID
    const { error: deleteError } = await supabase
      .from('copied_trades')
      .delete()
      .eq('id', id)
      .eq('user_id', sessionUser.id)
    
    if (deleteError) {
      console.error('❌ Error deleting trade:', deleteError)
      return NextResponse.json({ error: 'Failed to delete trade' }, { status: 500 })
    }
    
    console.log('✅ Trade deleted successfully:', id, 'for user', sessionUser.id)
    
    return NextResponse.json({ success: true, message: 'Trade deleted' })
    
  } catch (error) {
    console.error('❌ Delete trade error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

