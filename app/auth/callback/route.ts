import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const response = NextResponse.redirect(requestUrl.origin)
  
  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            response.cookies.set({
              name,
              value,
              ...options,
            })
          },
          remove(name: string, options: CookieOptions) {
            response.cookies.set({
              name,
              value: '',
              ...options,
            })
          },
        },
      }
    )
    
    try {
      // Exchange code for session
      const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code)
      
      if (sessionError) {
        console.error('Session error:', sessionError)
        return NextResponse.redirect(`${requestUrl.origin}?error=auth_failed`)
      }
      
      // Get the user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError || !user) {
        console.error('User error:', userError)
        return NextResponse.redirect(`${requestUrl.origin}?error=no_user`)
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
      
      // Check if user has any follows to determine redirect destination
      const { data: follows, error: followsError } = await supabase
        .from('follows')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
      
      if (followsError) {
        console.error('Error checking follows:', followsError)
        // Default to feed on error
        return NextResponse.redirect(`${requestUrl.origin}/feed`)
      }
      
      // If user has follows, send to feed. If not, send to discover page
      if (follows && follows.length > 0) {
        console.log('User has follows, redirecting to feed')
        return NextResponse.redirect(`${requestUrl.origin}/feed`)
      } else {
        console.log('User has no follows, redirecting to discover')
        return NextResponse.redirect(`${requestUrl.origin}/discover`)
      }
      
    } catch (error) {
      console.error('Callback error:', error)
    }
  }
  
  // Default redirect to feed
  return NextResponse.redirect(`${requestUrl.origin}/feed`)
}
