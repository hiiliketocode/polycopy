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
    const {
      data: { session },
      error,
    } = await client.auth.getSession()

    if (session) {
      return { session, refreshed: false }
    }

    if (error) {
      console.warn('[auth] getSession failed, attempting refresh', error.message)
    }

    const {
      data: refreshData,
      error: refreshError,
    } = await client.auth.refreshSession()

    if (refreshError) {
      console.warn('[auth] refreshSession failed', refreshError.message)
      return { session: null, refreshed: false }
    }

    return { session: refreshData.session ?? null, refreshed: true }
  } catch (err) {
    console.error('[auth] session lookup failed', err)
    return { session: null, refreshed: false }
  }
}
