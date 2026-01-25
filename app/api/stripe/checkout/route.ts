import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import Stripe from 'stripe'
import { logInfo, logError } from '@/lib/logging/logger'

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
  // SECURITY: Using secure logger
  logInfo('stripe_checkout_start', { endpoint: '/api/stripe/checkout' })
  
  try {
    // Debug: Log available cookies
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()
    console.log('🍪 Available cookies:', allCookies.map(c => c.name))
    
    // Check for Supabase auth cookies
    const authCookies = allCookies.filter(c => c.name.includes('auth') || c.name.startsWith('sb-'))
    console.log('🔐 Auth-related cookies found:', authCookies.map(c => c.name))
    
    // Check for Authorization header (for client-side auth)
    const authHeader = request.headers.get('authorization')
    console.log('🔐 Authorization header present:', !!authHeader)
    
    let user = null
    let authError = null
    
    // Try Authorization header first (for client-side localStorage auth)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '')
      console.log('🔑 Using Bearer token from header')
      
      const supabaseWithToken = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      
      const { data, error } = await supabaseWithToken.auth.getUser(token)
      user = data.user
      authError = error
      
      console.log('🔐 Auth via header - User exists:', !!user)
      if (error) console.error('🔐 Auth header error:', error.message)
    }
    
    // Fallback to cookie-based auth
    if (!user) {
      console.log('🍪 Falling back to cookie-based auth')
      const supabaseAuth = await createAuthClient()
      const { data, error } = await supabaseAuth.auth.getUser()
      user = data.user
      authError = error
      
      console.log('🔐 Auth via cookies - User exists:', !!user)
      if (error) console.error('🔐 Cookie auth error:', error.message)
    }
    
    // Log auth status for debugging
    console.log('🔐 Final auth check - User ID:', user?.id)
    console.log('🔐 Final auth check - Email:', user?.email)
    
    // SECURITY: Require valid user
    if (!user) {
      console.error('❌ No authenticated user for Stripe checkout - tried both header and cookies')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    logInfo('stripe_checkout_authenticated', { user_id: user.id })
    
    // Use service role client for database operations
    const supabase = createServiceClient()

    // Check if user already has a Stripe customer ID
    console.log('Fetching profile for user:', user.id)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (profileError) {
      logError('profile_fetch_failed', { user_id: user.id, error_code: profileError.code })
    }

    console.log('Profile data:', { exists: !!profile, hasCustomerId: !!profile?.stripe_customer_id })

    let customerId = profile?.stripe_customer_id

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      console.log('Creating new Stripe customer for:', user.email)
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      })
      customerId = customer.id
      console.log('✅ Created Stripe customer:', customerId)

      // Save customer ID to database
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
      
      if (updateError) {
        console.error('❌ Error saving customer ID to profile:', updateError)
      } else {
        console.log('✅ Saved customer ID to profile')
      }
    } else {
      console.log('Using existing Stripe customer:', customerId)
    }

    // Create checkout session
    console.log('Creating checkout session...')
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: `${request.headers.get('origin')}/portfolio?upgrade=success`,
      cancel_url: `${request.headers.get('origin')}/portfolio?upgrade=canceled`,
      allow_promotion_codes: true,
      metadata: {
        supabase_user_id: user.id,
      },
    })

    console.log('✅ Checkout session created:', session.id)
    console.log('Checkout URL:', session.url)

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    logError('stripe_checkout_failed', { 
      error_type: error.name,
      error_message: error.message
    })
    return NextResponse.json({ 
      error: 'Failed to create checkout session',
      details: error.message 
    }, { status: 500 })
  }
}
