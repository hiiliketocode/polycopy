import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'

type DebugAuthResponse = {
  hasCookie: boolean
  userFromCookie: string | null
  host: string | null
  origin: string | null
  referer: string | null
}

export async function GET(request: NextRequest) {
  const allCookies = request.cookies.getAll()
  const sbCookies = allCookies.filter(cookie => cookie.name.startsWith('sb-'))
  const hasCookie = sbCookies.length > 0

  let userFromCookie: string | null = null
  let cookieAuthError: string | null = null

  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    userFromCookie = user?.id ?? null
    cookieAuthError = error?.message ?? null
  } catch (error) {
    cookieAuthError = error instanceof Error ? error.message : 'Unknown cookie auth error'
  }

  const responsePayload: DebugAuthResponse = {
    hasCookie,
    userFromCookie,
    host: request.headers.get('host'),
    origin: request.headers.get('origin'),
    referer: request.headers.get('referer'),
  }

  console.log('[DEBUG AUTH]', responsePayload)
  if (cookieAuthError) {
    console.error('[DEBUG AUTH] Cookie auth error:', cookieAuthError)
  }

  return NextResponse.json(responsePayload, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
