import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
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
    
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single()
    
    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine (user hasn't set preferences yet)
      console.error('Error fetching notification preferences:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
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
    const { userId, email_notifications_enabled } = body
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
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
    
    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: userId,
        email_notifications_enabled: email_notifications_enabled ?? true,
        updated_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error updating notification preferences:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
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
