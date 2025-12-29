import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

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

  if (hasSupabaseCookies) {
    try {
      // Add timeout to prevent middleware from hanging (2 second max)
      // This prevents 504 errors when database is slow
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Auth timeout')), 2000)
      )
      
      await Promise.race([
        supabase.auth.getUser(),
        timeoutPromise
      ])
    } catch (error) {
      // Silently fail - don't block requests if auth check times out
      // This allows the site to still load even if database is slow
      // Auth will be checked again in the actual page/API route if needed
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
