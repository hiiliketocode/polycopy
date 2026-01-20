/**
 * Secure authentication utilities for API routes
 * 
 * SECURITY: This module handles dev bypass auth in a secure, centralized way
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * SECURITY: Only allow auth bypass in true local development (never in production/preview)
 * Multiple checks ensure this cannot be accidentally enabled in deployed environments
 */
const DEV_BYPASS_ENABLED =
  process.env.NODE_ENV === 'development' && // Must be development mode
  !process.env.VERCEL_ENV && // Must NOT be on Vercel
  !process.env.FLY_APP_NAME && // Must NOT be on Fly.io
  process.env.TURNKEY_DEV_ALLOW_UNAUTH === 'true' &&
  Boolean(process.env.TURNKEY_DEV_BYPASS_USER_ID)

// Runtime safety check: Throw error if bypass is somehow enabled in production
if (
  DEV_BYPASS_ENABLED &&
  (process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.FLY_APP_NAME)
) {
  throw new Error(
    'CRITICAL SECURITY ERROR: DEV_BYPASS_AUTH cannot be enabled in production environments'
  )
}

/**
 * Get authenticated user ID from request
 * 
 * SECURITY NOTES:
 * - Always attempts real authentication first
 * - Only falls back to bypass in strict local dev environment
 * - Logs all bypass attempts for security auditing
 * - Throws error if bypass is enabled in production
 * 
 * @param request - Next.js request object
 * @returns User ID if authenticated, null otherwise
 */
export async function getAuthenticatedUserId(
  request?: NextRequest
): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  let userId: string | null = user?.id ?? null

  // Handle dev bypass (only in strict local development)
  if (!userId && DEV_BYPASS_ENABLED && process.env.TURNKEY_DEV_BYPASS_USER_ID) {
    userId = process.env.TURNKEY_DEV_BYPASS_USER_ID

    // Log bypass usage for security auditing
    console.warn(
      '[SECURITY] DEV_BYPASS_AUTH used - this should ONLY happen in local development'
    )
    console.warn('[SECURITY] Bypassed user ID:', userId)
    console.warn('[SECURITY] Environment:', {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      FLY_APP_NAME: process.env.FLY_APP_NAME,
    })

    if (request) {
      const ip =
        request.headers.get('x-forwarded-for') ||
        request.headers.get('x-real-ip') ||
        'unknown'
      console.warn('[SECURITY] Request IP:', ip)
    }
  }

  return userId
}

/**
 * Get authenticated user ID or throw error
 * 
 * Use this when authentication is required for the endpoint
 * 
 * @param request - Next.js request object
 * @param errorMessage - Custom error message (optional)
 * @returns User ID
 * @throws Error if not authenticated
 */
export async function requireAuth(
  request?: NextRequest,
  errorMessage: string = 'Unauthorized - please log in'
): Promise<string> {
  const userId = await getAuthenticatedUserId(request)

  if (!userId) {
    throw new Error(errorMessage)
  }

  return userId
}

/**
 * Check if dev bypass is currently enabled
 * 
 * Use this for conditional logic or logging
 * DO NOT use this to bypass security checks
 * 
 * @returns True if dev bypass is enabled (local dev only)
 */
export function isDevBypassEnabled(): boolean {
  return DEV_BYPASS_ENABLED
}

/**
 * Get auth error details for logging
 * 
 * @param error - Supabase auth error
 * @returns Sanitized error details
 */
export function getAuthErrorDetails(error: any): string | undefined {
  if (!error) return undefined
  return typeof error.message === 'string' ? error.message : 'Unknown auth error'
}
