import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * SECURITY: Apply security headers to all responses
 * Protects against XSS, clickjacking, MITM, and other attacks
 */
function applySecurityHeaders(response: NextResponse) {
  // Content Security Policy - Prevents XSS attacks
  // Allows resources only from trusted sources
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://va.vercel-scripts.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://*.polymarket.com https://api.turnkey.com https://api.stripe.com wss://*.supabase.co",
    "frame-src 'self' https://js.stripe.com https://checkout.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join('; ')
  
  response.headers.set('Content-Security-Policy', cspDirectives)
  
  // HTTP Strict Transport Security - Forces HTTPS
  // Prevents MITM attacks by requiring secure connections
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  )
  
  // X-Frame-Options - Prevents clickjacking
  // Disallows embedding site in iframes
  response.headers.set('X-Frame-Options', 'DENY')
  
  // X-Content-Type-Options - Prevents MIME sniffing
  // Stops browsers from guessing file types
  response.headers.set('X-Content-Type-Options', 'nosniff')
  
  // X-XSS-Protection - Legacy XSS protection
  // Enables browser's built-in XSS filter
  response.headers.set('X-XSS-Protection', '1; mode=block')
  
  // Referrer-Policy - Controls referrer information
  // Prevents leaking sensitive URLs
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  
  // Permissions-Policy - Controls browser features
  // Disables unnecessary features (camera, microphone, geolocation)
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  )
  
  return response
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })
  const adminRefreshCookieName = 'pc_admin_refresh'

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const hasSupabaseCookies = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith('sb-'))
  const adminRefreshToken = request.cookies.get(adminRefreshCookieName)?.value
  let authCheckFailed = false

  if (hasSupabaseCookies) {
    try {
      // Add timeout to prevent middleware from hanging (2 second max)
      // This prevents 504 errors when database is slow
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Auth timeout')), 2000)
      )
      
      const authResult = await Promise.race([
        supabase.auth.getUser(),
        timeoutPromise
      ])
      if ('error' in authResult && (authResult.error || !authResult.data?.user)) {
        authCheckFailed = true
      }
    } catch (error) {
      // Silently fail - don't block requests if auth check times out
      // This allows the site to still load even if database is slow
      // Auth will be checked again in the actual page/API route if needed
      authCheckFailed = true
    }
  }

  if (adminRefreshToken && (!hasSupabaseCookies || authCheckFailed)) {
    try {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
        refresh_token: adminRefreshToken,
      })

      if (refreshError || !refreshData.session?.user) {
        response.cookies.set({
          name: adminRefreshCookieName,
          value: '',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 0,
        })
        return response
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', refreshData.session.user.id)
        .maybeSingle()

      if (profileError || !profile?.is_admin) {
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
    } catch (error) {
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
  }

  // SECURITY: Apply security headers to all responses
  return applySecurityHeaders(response)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
