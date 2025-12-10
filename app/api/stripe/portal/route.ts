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
    
    // SECURITY: Require valid user
    if (!user) {
      console.error('❌ No authenticated user for Stripe portal - tried both header and cookies')
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
