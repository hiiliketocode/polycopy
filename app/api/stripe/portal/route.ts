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
  console.log('=== Stripe Portal Debug ===')
  console.log('🔍 POST /api/stripe/portal called')
  
  try {
    // Debug: Log available cookies
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()
    console.log('🍪 Available cookies:', allCookies.map(c => c.name))
    
    // Check for Supabase auth cookies
    const authCookies = allCookies.filter(c => c.name.includes('auth') || c.name.startsWith('sb-'))
    console.log('🔐 Auth-related cookies found:', authCookies.map(c => c.name))
    
    // Verify authentication using server client
    const supabaseAuth = await createAuthClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    
    // Log auth status for debugging
    console.log('🔐 Auth check - User exists:', !!user)
    console.log('🔐 Auth check - User ID:', user?.id)
    
    if (authError) {
      console.error('🔐 Stripe portal auth error:', authError.message, authError)
    }
    
    // SECURITY: Require valid user
    if (!user) {
      console.error('❌ No authenticated user for Stripe portal')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    console.log('✅ User authenticated:', user.id)
    
    // Use service role client for database operations
    const supabase = createServiceClient()

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

    if (!profile?.stripe_customer_id) {
      console.log('❌ No Stripe customer ID found for user')
      return NextResponse.json({ error: 'No subscription found' }, { status: 400 })
    }

    console.log('Creating billing portal session...')
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${request.headers.get('origin')}/profile`,
    })

    console.log('✅ Portal session created:', session.id)
    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('❌ Portal error:', error)
    console.error('Error details:', error.message, error.stack)
    return NextResponse.json({ 
      error: 'Failed to create portal session',
      details: error.message 
    }, { status: 500 })
  }
}
