'use client'

import { supabase } from '@/lib/supabase'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

type SessionResult = {
  session: Session | null
  refreshed: boolean
}

/**
 * Try to get an active Supabase session, falling back to a one-time refresh.
 * This reduces false logouts when the access token is stale but a refresh token
 * is still available in cookies.
 */
export async function getOrRefreshSession(
  client: SupabaseClient = supabase
): Promise<SessionResult> {
  try {
    // Add timeout to prevent hanging
    const getSessionPromise = client.auth.getSession()
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Session check timeout')), 5000)
    )

    const {
      data: { session },
      error,
    } = await Promise.race([getSessionPromise, timeoutPromise])

    // Validate session is not expired
    if (session) {
      const expiresAt = session.expires_at
      if (expiresAt && expiresAt * 1000 < Date.now()) {
        console.warn('[auth] Session expired, attempting refresh')
        // Session expired, try to refresh
      } else {
        return { session, refreshed: false }
      }
    }

    if (error) {
      console.warn('[auth] getSession failed, attempting refresh', error.message)
    }

    // Add timeout to refresh as well
    const refreshPromise = client.auth.refreshSession()
    const refreshTimeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Session refresh timeout')), 5000)
    )

    const {
      data: refreshData,
      error: refreshError,
    } = await Promise.race([refreshPromise, refreshTimeoutPromise])

    if (refreshError) {
      console.warn('[auth] refreshSession failed', refreshError.message)
      return { session: null, refreshed: false }
    }

    return { session: refreshData.session ?? null, refreshed: true }
  } catch (err: any) {
    // Handle timeout errors specifically
    if (err?.message?.includes('timeout')) {
      console.warn('[auth] session operation timed out', err.message)
      return { session: null, refreshed: false }
    }
    console.error('[auth] session lookup failed', err)
    return { session: null, refreshed: false }
  }
}
