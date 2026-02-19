import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Origins allowed to embed the app in an iframe (feedback/review tools).
// Override with ALLOW_FRAME_ANCESTORS env (comma-separated) if you need different or extra origins.
const DEFAULT_FRAME_ANCESTORS =
  'https://app.huddlekit.com https://huddlekit.com https://web.ruttl.com https://ruttl.com'

/**
 * SECURITY: Apply security headers to all responses
 * Protects against XSS, clickjacking, MITM, and other attacks
 */
function applySecurityHeaders(response: NextResponse) {
  // Allow embedding in iframes from feedback tools (Huddlekit, Ruttl) or from ALLOW_FRAME_ANCESTORS.
  const envList = process.env.ALLOW_FRAME_ANCESTORS?.trim()
  const allowedOrigins = envList
    ? envList.split(',').map((o) => o.trim()).filter(Boolean).join(' ')
    : DEFAULT_FRAME_ANCESTORS
  const frameAncestorsValue =
    allowedOrigins.length > 0 ? `'self' ${allowedOrigins}` : "'none'"

  // Content Security Policy - Prevents XSS attacks
  // Allows resources only from trusted sources
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://va.vercel-scripts.com https://www.googletagmanager.com https://vercel.live",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://*.polymarket.com https://polymarket-upload.s3.us-east-2.amazonaws.com https://api.turnkey.com https://api.stripe.com https://www.google-analytics.com https://analytics.google.com wss://*.supabase.co",
    "frame-src 'self' https://js.stripe.com https://checkout.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestorsValue}`,
    "upgrade-insecure-requests",
  ].join('; ')
  
  response.headers.set('Content-Security-Policy', cspDirectives)
  
  // HTTP Strict Transport Security - Forces HTTPS
  // Prevents MITM attacks by requiring secure connections
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  )
  
  // X-Frame-Options - omit when we allow frame ancestors so CSP frame-ancestors takes effect
  if (frameAncestorsValue === "'none'") {
    response.headers.set('X-Frame-Options', 'DENY')
  }
  
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

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  })

  const adminRefreshCookieName = 'pc_admin_refresh'

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Call getUser() immediately after createServerClient.
  // This is the critical call that refreshes expired auth tokens via setAll().
  // Without this, access tokens expire (~1 hour) and users get logged out.
  // Do NOT add logic between createServerClient and this call.
  const { data: { user } } = await supabase.auth.getUser()

  // Admin refresh token fallback: if the user has no valid session but
  // we have an admin refresh token cookie, try to recover the session.
  const adminRefreshToken = request.cookies.get(adminRefreshCookieName)?.value

  if (adminRefreshToken && !user) {
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
      } else {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', refreshData.session.user.id)
          .maybeSingle()

        if (!profile?.is_admin) {
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
    } catch {
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
