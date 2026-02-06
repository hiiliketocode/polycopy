'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { triggerLoggedOut } from '@/lib/auth/logout-events'
import { getOrRefreshSession } from '@/lib/auth/session'

type UseAuthStateOptions = {
  /** If true, redirects to /login when user is not authenticated */
  requireAuth?: boolean
  /** Callback when authentication check completes */
  onAuthComplete?: (user: User | null) => void
}

type UseAuthStateReturn = {
  user: User | null
  loading: boolean
  /** Manually refresh the session */
  refreshSession: () => Promise<void>
}

/**
 * Hook to manage authentication state with proper handling of:
 * - Token refresh (doesn't log out during refresh)
 * - Only reacts to actual SIGNED_OUT events
 * - Attempts session refresh before assuming logout
 * 
 * This prevents the annoying frequent logouts caused by treating
 * any null session as a logout event.
 */
export function useAuthState(options: UseAuthStateOptions = {}): UseAuthStateReturn {
  const { requireAuth = false, onAuthComplete } = options
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const isMountedRef = useRef(true)
  const hasInitializedRef = useRef(false)
  // Track if we've had a valid session to distinguish "never logged in" from "logged out"
  const hadValidSessionRef = useRef(false)

  const refreshSession = useCallback(async () => {
    try {
      const { session } = await getOrRefreshSession()
      if (isMountedRef.current && session?.user) {
        setUser(session.user)
        hadValidSessionRef.current = true
      }
    } catch (err) {
      console.warn('[useAuthState] Failed to refresh session:', err)
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    
    const initAuth = async () => {
      if (hasInitializedRef.current) return
      hasInitializedRef.current = true

      try {
        // Use getOrRefreshSession which properly handles stale tokens
        const { session, refreshed } = await getOrRefreshSession()
        
        if (!isMountedRef.current) return

        if (session?.user) {
          setUser(session.user)
          hadValidSessionRef.current = true
          if (refreshed) {
            console.log('[useAuthState] Session was refreshed successfully')
          }
          onAuthComplete?.(session.user)
        } else {
          // No valid session found
          setUser(null)
          onAuthComplete?.(null)
          
          if (requireAuth) {
            const currentPath = typeof window !== 'undefined' ? window.location.pathname : ''
            if (currentPath !== '/login' && !currentPath.startsWith('/auth/')) {
              router.push('/login')
            }
          }
        }
      } catch (err) {
        console.error('[useAuthState] Auth initialization error:', err)
        if (isMountedRef.current) {
          setUser(null)
          onAuthComplete?.(null)
          
          if (requireAuth) {
            triggerLoggedOut('auth_error')
            router.push('/login')
          }
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false)
        }
      }
    }

    initAuth()

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!isMountedRef.current) return

        console.log('[useAuthState] Auth state change:', event, session?.user?.id ? 'has user' : 'no user')

        switch (event) {
          case 'SIGNED_IN':
          case 'TOKEN_REFRESHED':
          case 'USER_UPDATED':
            // User is definitely authenticated
            if (session?.user) {
              setUser(session.user)
              hadValidSessionRef.current = true
            }
            break

          case 'SIGNED_OUT':
            // User explicitly signed out - this is a real logout
            setUser(null)
            if (requireAuth) {
              const currentPath = typeof window !== 'undefined' ? window.location.pathname : ''
              if (currentPath !== '/login' && !currentPath.startsWith('/auth/')) {
                triggerLoggedOut('signed_out')
                router.push('/login')
              }
            }
            break

          case 'INITIAL_SESSION':
            // Initial load - session might be null if user never logged in
            // Don't treat this as a logout, just update state
            if (session?.user) {
              setUser(session.user)
              hadValidSessionRef.current = true
            }
            break

          default:
            // For other events (PASSWORD_RECOVERY, etc.), 
            // don't immediately assume logout if session is null.
            // The session might be temporarily unavailable.
            if (session?.user) {
              setUser(session.user)
              hadValidSessionRef.current = true
            } else if (hadValidSessionRef.current) {
              // We had a session before but now it's null and it's not a SIGNED_OUT event
              // This could be a temporary state - try to refresh
              console.log('[useAuthState] Session temporarily null, attempting refresh...')
              try {
                const { session: refreshedSession } = await getOrRefreshSession()
                if (refreshedSession?.user) {
                  setUser(refreshedSession.user)
                  console.log('[useAuthState] Session recovered via refresh')
                } else if (isMountedRef.current && requireAuth) {
                  // Refresh failed and we require auth - this is likely a real logout
                  console.log('[useAuthState] Session refresh failed, treating as logout')
                  setUser(null)
                  const currentPath = typeof window !== 'undefined' ? window.location.pathname : ''
                  if (currentPath !== '/login' && !currentPath.startsWith('/auth/')) {
                    triggerLoggedOut('session_missing')
                    router.push('/login')
                  }
                }
              } catch (err) {
                console.warn('[useAuthState] Failed to recover session:', err)
                if (isMountedRef.current && requireAuth) {
                  setUser(null)
                  triggerLoggedOut('session_missing')
                  router.push('/login')
                }
              }
            }
            break
        }
      }
    )

    return () => {
      isMountedRef.current = false
      subscription.unsubscribe()
    }
  }, [requireAuth, router, onAuthComplete])

  return { user, loading, refreshSession }
}
