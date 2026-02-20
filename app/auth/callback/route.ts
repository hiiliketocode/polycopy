import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const adminRefreshCookieName = 'pc_admin_refresh'
  
  if (code) {
    let redirectUrl = `${requestUrl.origin}/feed`
    const response = NextResponse.redirect(redirectUrl)
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )
    
    try {
      // Exchange code for session
      const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code)
      
      if (sessionError) {
        console.error('Session error:', JSON.stringify({
          message: sessionError.message,
          status: sessionError.status,
          name: sessionError.name,
          code: (sessionError as any).code,
        }))
        
        const msg = sessionError.message?.toLowerCase() ?? ''
        const isExpired = msg.includes('expired') || msg.includes('otp has expired')
        const isUsed = msg.includes('already used') || msg.includes('already been used')
        
        if (isExpired) {
          return NextResponse.redirect(`${requestUrl.origin}/login?error=link_expired`)
        }
        if (isUsed) {
          return NextResponse.redirect(`${requestUrl.origin}/login?error=link_used`)
        }
        
        const debugMsg = encodeURIComponent(sessionError.message ?? 'unknown')
        return NextResponse.redirect(`${requestUrl.origin}/login?error=auth_failed&detail=${debugMsg}`)
      }
      
      // Get the user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError || !user) {
        console.error('User error:', userError)
        return NextResponse.redirect(`${requestUrl.origin}/login?error=auth_failed`)
      }
      
      console.log('Creating profile for user:', user.id, user.email)
      
      // Create or update profile using upsert
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(
          { id: user.id, email: user.email },
          { onConflict: 'id' }
        )
      
      if (profileError) {
        console.error('Profile creation error:', profileError)
        // Don't fail the login, just log it
      } else {
        console.log('Profile created successfully')
      }

      const { data: adminProfile, error: adminProfileError } = await supabase
        .from('profiles')
        .select('is_admin, has_completed_onboarding')
        .eq('id', user.id)
        .maybeSingle()

      if (adminProfileError) {
        console.error('Admin profile lookup error:', adminProfileError)
      }

      const isAdmin = Boolean(adminProfile?.is_admin)
      if (isAdmin) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.refresh_token) {
          response.cookies.set({
            name: adminRefreshCookieName,
            value: session.refresh_token,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 365,
          })
        }
      } else {
        response.cookies.set({
          name: adminRefreshCookieName,
          value: '',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 0,
        })
      }
      
      // Check if user needs to complete onboarding
      const hasCompletedOnboarding = adminProfile?.has_completed_onboarding ?? false
      if (!hasCompletedOnboarding) {
        console.log('User has not completed onboarding, redirecting to onboarding')
        redirectUrl = `${requestUrl.origin}/onboarding`
        const finalResponse = NextResponse.redirect(redirectUrl)
        response.cookies.getAll().forEach(cookie => {
          finalResponse.cookies.set(cookie)
        })
        return finalResponse
      }
      
      // Check if user has any follows to determine redirect destination
      const { data: follows, error: followsError } = await supabase
        .from('follows')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
      
      if (!followsError && follows && follows.length > 0) {
        console.log('User has follows, redirecting to feed')
        redirectUrl = `${requestUrl.origin}/feed`
      } else {
        console.log('User has no follows, redirecting to discover')
        redirectUrl = `${requestUrl.origin}/discover`
      }
      
      // Update the response with the correct redirect URL
      // Add a query param to indicate we're coming from auth callback
      const redirectUrlWithFlag = `${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}_auth_callback=1`
      const finalResponse = NextResponse.redirect(redirectUrlWithFlag)
      
      // Copy all cookies from the original response to the final response
      // This ensures auth cookies are properly set before redirect
      response.cookies.getAll().forEach(cookie => {
        finalResponse.cookies.set(cookie)
      })
      
      // Ensure we have a session cookie set
      const { data: { session: finalSession } } = await supabase.auth.getSession()
      if (finalSession) {
        // The session should already be in cookies from exchangeCodeForSession,
        // but we verify it's there
        console.log('Session verified after callback, redirecting to:', redirectUrlWithFlag)
      } else {
        console.error('WARNING: No session found after callback, but proceeding with redirect')
      }
      
      return finalResponse
      
    } catch (error) {
      console.error('Callback error:', error)
      return NextResponse.redirect(`${requestUrl.origin}/login?error=auth_error`)
    }
  }
  
  // No code provided, redirect to home
  return NextResponse.redirect(`${requestUrl.origin}/feed`)
}
