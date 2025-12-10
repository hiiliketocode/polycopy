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
  console.log('=== Stripe Checkout Debug ===')
  console.log('🔍 POST /api/stripe/checkout called')
  
  try {
    // Debug: Log available cookies
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()
    console.log('🍪 Available cookies:', allCookies.map(c => c.name))
    
    // Check for Supabase auth cookies
    const authCookies = allCookies.filter(c => c.name.includes('auth') || c.name.startsWith('sb-'))
    console.log('🔐 Auth-related cookies found:', authCookies.map(c => c.name))
    
    // Verify authentication using server client
    console.log('Creating auth client...')
    const supabaseAuth = await createAuthClient()
    console.log('Auth client created')
    
    // Use getUser() instead of getSession() - more reliable for server-side auth
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    
    // Log auth status for debugging
    console.log('🔐 Auth check - User exists:', !!user)
    console.log('🔐 Auth check - User ID:', user?.id)
    console.log('🔐 Auth check - Email:', user?.email)
    
    if (authError) {
      console.error('🔐 Stripe checkout auth error:', authError.message, authError)
    }
    
    // SECURITY: Require valid user
    if (!user) {
      console.error('❌ No authenticated user for Stripe checkout - cookies might not be set properly')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    console.log('✅ User authenticated:', user.id)
    
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
      console.error('❌ Error fetching profile:', profileError)
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
      success_url: `${request.headers.get('origin')}/profile?upgrade=success`,
      cancel_url: `${request.headers.get('origin')}/profile?upgrade=canceled`,
      metadata: {
        supabase_user_id: user.id,
      },
    })

    console.log('✅ Checkout session created:', session.id)
    console.log('Checkout URL:', session.url)

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('❌ Stripe checkout error:', error)
    console.error('Error details:', error.message, error.stack)
    return NextResponse.json({ 
      error: 'Failed to create checkout session',
      details: error.message 
    }, { status: 500 })
  }
}
