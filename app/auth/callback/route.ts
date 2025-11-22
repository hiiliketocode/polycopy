import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  
  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
      
    } catch (error) {
      console.error('Callback error:', error)
    }
  }
  
  // Redirect to home page
  return NextResponse.redirect(requestUrl.origin)
}

