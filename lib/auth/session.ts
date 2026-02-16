'use client'

import { supabase } from '@/lib/supabase'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

type SessionResult = {
  session: Session | null
  refreshed: boolean
}

const SESSION_TIMEOUT_MS = 10_000
const REFRESH_TIMEOUT_MS = 10_000

/**
 * Try to get an active Supabase session, falling back to a one-time refresh.
 * This reduces false logouts when the access token is stale but a refresh token
 * is still available in cookies.
 *
 * With middleware properly refreshing tokens on every server request, this
 * function mainly serves as a client-side safety net for long-lived tabs
 * or when the middleware cookie write is unavailable (e.g. prefetch).
 */
export async function getOrRefreshSession(
  client: SupabaseClient = supabase
): Promise<SessionResult> {
  try {
    const getSessionPromise = client.auth.getSession()
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Session check timeout')), SESSION_TIMEOUT_MS)
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
        // Fall through to refresh below
      } else {
        return { session, refreshed: false }
      }
    }

    if (error) {
      console.warn('[auth] getSession failed, attempting refresh:', error.message)
    }

    // Attempt refresh with generous timeout
    const refreshPromise = client.auth.refreshSession()
    const refreshTimeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Session refresh timeout')), REFRESH_TIMEOUT_MS)
    )

    const {
      data: refreshData,
      error: refreshError,
    } = await Promise.race([refreshPromise, refreshTimeoutPromise])

    if (refreshError) {
      console.warn('[auth] refreshSession failed:', refreshError.message)
      return { session: null, refreshed: false }
    }

    if (refreshData.session) {
      console.log('[auth] Session refreshed successfully')
    }

    return { session: refreshData.session ?? null, refreshed: true }
  } catch (err: any) {
    if (err?.message?.includes('timeout')) {
      console.warn('[auth] Session operation timed out:', err.message)
    } else {
      console.error('[auth] Session lookup failed:', err)
    }
    return { session: null, refreshed: false }
  }
}
