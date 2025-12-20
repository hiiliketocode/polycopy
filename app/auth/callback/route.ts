import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, NextRequest } from 'next/server'

const allowedRedirectHosts = new Set([
  'localhost',
  '127.0.0.1',
  'polycopy.app',
  'www.polycopy.app',
])

const envRedirectBase = process.env.NEXT_PUBLIC_MAGIC_LINK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL

if (envRedirectBase) {
  try {
    const baseHost = new URL(envRedirectBase).hostname
    allowedRedirectHosts.add(baseHost)
  } catch (error) {
    console.error('Invalid NEXT_PUBLIC_MAGIC_LINK_BASE_URL/NEXT_PUBLIC_APP_URL:', error)
  }
}

function getValidatedOrigin(value: string | null) {
  if (!value) return null

  try {
    const url = new URL(value)
    const hostname = url.hostname

    if (allowedRedirectHosts.has(hostname) || hostname.endsWith('.vercel.app')) {
      return url.origin
    }
  } catch (error) {
    console.error('Invalid preview redirect origin:', error)
  }

  return null
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const nextOrigin = getValidatedOrigin(requestUrl.searchParams.get('next'))

  if (code && nextOrigin && nextOrigin !== requestUrl.origin) {
    const redirectUrl = new URL('/auth/callback', nextOrigin)
    redirectUrl.searchParams.set('code', code)
    return NextResponse.redirect(redirectUrl)
  }
  
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
      // Exchange code for session and set cookies on this host
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
  return response
}
