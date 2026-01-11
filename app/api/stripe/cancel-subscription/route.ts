import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-11-17.clover',
})

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

export async function POST(request: NextRequest) {
  console.log('=== Cancel Subscription Debug ===')
  console.log('🔍 POST /api/stripe/cancel-subscription called')
  
  try {
    // Auth check (same pattern as other endpoints)
    const cookieStore = await cookies()
    const authHeader = request.headers.get('authorization')
    
    let user = null
    
    // Try Authorization header first
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '')
      const supabaseWithToken = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      
      const { data, error } = await supabaseWithToken.auth.getUser(token)
      user = data.user
      
      if (error) console.error('🔐 Auth header error:', error.message)
    }
    
    // Fallback to cookie-based auth
    if (!user) {
      const supabaseAuth = await createAuthClient()
      const { data, error } = await supabaseAuth.auth.getUser()
      user = data.user
      
      if (error) console.error('🔐 Cookie auth error:', error.message)
    }
    
    // SECURITY: Require valid user
    if (!user) {
      console.error('❌ No authenticated user for subscription cancellation')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    console.log('✅ User authenticated:', user.id)
    
    // Use service role client for database operations
    const supabase = createServiceClient()

    // Get user's Stripe customer ID
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id, email')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('❌ Error fetching profile:', profileError)
      return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
    }

    if (!profile?.stripe_customer_id) {
      console.log('❌ No Stripe customer ID found')
      return NextResponse.json({ error: 'No subscription found' }, { status: 400 })
    }

    // Get the user's active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: 'active',
      limit: 10,
    })

    if (subscriptions.data.length === 0) {
      console.log('❌ No active subscriptions found')
      return NextResponse.json({ error: 'No active subscription found' }, { status: 400 })
    }

    // Cancel the first active subscription (user should only have one)
    const subscription = subscriptions.data[0]
    console.log('📦 Canceling subscription:', subscription.id)

    // Cancel at period end (so they keep access until the end of their billing cycle)
    const canceledSubscription = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
    })

    // Type assertion for period_end which exists but isn't in the Response type
    const periodEnd = (canceledSubscription as any).current_period_end as number | undefined
    const currentPeriodEnd = periodEnd || 0
    console.log('✅ Subscription canceled:', canceledSubscription.id)
    console.log('📅 Access until:', new Date(currentPeriodEnd * 1000).toISOString())

    return NextResponse.json({
      success: true,
      message: 'Subscription canceled successfully',
      cancel_at: (canceledSubscription as any).cancel_at || null,
      current_period_end: currentPeriodEnd,
    })
  } catch (error: any) {
    console.error('❌ Subscription cancellation error:', error)
    return NextResponse.json({ 
      error: 'Failed to cancel subscription',
      details: error.message 
    }, { status: 500 })
  }
}
