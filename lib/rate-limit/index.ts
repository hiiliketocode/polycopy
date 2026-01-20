/**
 * Rate Limiting Middleware
 * 
 * Provides multi-tier rate limiting using Upstash Redis
 * with graceful degradation if Redis unavailable
 */

import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'
import { NextRequest, NextResponse } from 'next/server'
import {
  UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN,
  isRateLimitEnabled,
  getRateLimitConfig,
  RateLimitTier,
  RateLimitIdentifier,
} from './config'

/**
 * Shared Redis client
 */
let redis: Redis | null = null

const getRedisClient = () => {
  if (!redis && UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: UPSTASH_REDIS_REST_URL,
      token: UPSTASH_REDIS_REST_TOKEN,
    })
  }
  return redis
}

/**
 * Rate limiter cache by tier
 */
const rateLimiters = new Map<RateLimitTier, Ratelimit>()

/**
 * Get or create rate limiter for a tier
 */
const getRateLimiter = (tier: RateLimitTier): Ratelimit | null => {
  if (!isRateLimitEnabled()) {
    return null
  }

  if (rateLimiters.has(tier)) {
    return rateLimiters.get(tier)!
  }

  const redisClient = getRedisClient()
  if (!redisClient) {
    return null
  }

  const config = getRateLimitConfig(tier)
  const ratelimiter = new Ratelimit({
    redis: redisClient,
    limiter: Ratelimit.slidingWindow(config.requests, config.window),
    analytics: true,
    prefix: `@polycopy/ratelimit/${tier}`,
  })

  rateLimiters.set(tier, ratelimiter)
  return ratelimiter
}

/**
 * Extract identifier from request
 */
const getIdentifier = (
  request: NextRequest,
  userId: string | null,
  identifierType: RateLimitIdentifier
): string => {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'

  switch (identifierType) {
    case 'ip':
      return ip
    case 'user':
      return userId || ip // Fallback to IP if no user
    case 'ip-user':
      return userId ? `${ip}:${userId}` : ip
    case 'anonymous':
      return ip
    default:
      return ip
  }
}

/**
 * Rate limit result
 */
export type RateLimitResult = {
  success: boolean
  limit?: number
  remaining?: number
  reset?: number
  reason?: string
}

/**
 * Check rate limit for a request
 * 
 * @param request - Next.js request object
 * @param tier - Rate limit tier to apply
 * @param userId - User ID if authenticated (optional)
 * @param identifierType - How to identify the requester
 * @returns Rate limit result
 */
export async function checkRateLimit(
  request: NextRequest,
  tier: RateLimitTier,
  userId: string | null = null,
  identifierType: RateLimitIdentifier = 'ip-user'
): Promise<RateLimitResult> {
  // If rate limiting not enabled, allow all requests
  if (!isRateLimitEnabled()) {
    console.warn('[RATE-LIMIT] Redis not configured - rate limiting disabled')
    return { success: true, reason: 'Rate limiting not configured' }
  }

  const ratelimiter = getRateLimiter(tier)
  if (!ratelimiter) {
    console.warn(`[RATE-LIMIT] Failed to get rate limiter for tier: ${tier}`)
    return { success: true, reason: 'Rate limiter unavailable' }
  }

  const identifier = getIdentifier(request, userId, identifierType)

  try {
    const { success, limit, remaining, reset } = await ratelimiter.limit(identifier)

    if (!success) {
      console.warn('[RATE-LIMIT] Rate limit exceeded', {
        tier,
        identifier: identifier.includes(':') ? identifier.split(':')[0] + ':***' : identifier,
        limit,
        remaining,
        reset,
      })
    }

    return {
      success,
      limit,
      remaining,
      reset,
    }
  } catch (error) {
    console.error('[RATE-LIMIT] Error checking rate limit:', error)
    // On error, allow request (fail open for availability)
    return { success: true, reason: 'Rate limit check failed' }
  }
}

/**
 * Create a rate-limited response
 */
export function rateLimitedResponse(result: RateLimitResult): NextResponse {
  const headers = new Headers()
  
  if (result.limit) {
    headers.set('X-RateLimit-Limit', result.limit.toString())
  }
  if (result.remaining !== undefined) {
    headers.set('X-RateLimit-Remaining', result.remaining.toString())
  }
  if (result.reset) {
    headers.set('X-RateLimit-Reset', result.reset.toString())
  }

  const retryAfter = result.reset ? Math.ceil((result.reset - Date.now()) / 1000) : 60

  return NextResponse.json(
    {
      error: 'Too many requests',
      message: 'You have exceeded the rate limit. Please try again later.',
      retryAfter,
    },
    {
      status: 429,
      headers: {
        ...Object.fromEntries(headers),
        'Retry-After': retryAfter.toString(),
      },
    }
  )
}

/**
 * Higher-order function to wrap API routes with rate limiting
 * 
 * @example
 * ```typescript
 * export const POST = withRateLimit(
 *   async (request) => {
 *     // Your handler code
 *   },
 *   'CRITICAL',
 *   'ip-user'
 * )
 * ```
 */
export function withRateLimit<T extends NextRequest>(
  handler: (request: T) => Promise<NextResponse>,
  tier: RateLimitTier,
  identifierType: RateLimitIdentifier = 'ip-user',
  getUserId?: (request: T) => Promise<string | null>
) {
  return async (request: T): Promise<NextResponse> => {
    // Get user ID if function provided
    const userId = getUserId ? await getUserId(request) : null

    // Check rate limit
    const result = await checkRateLimit(request, tier, userId, identifierType)

    // If rate limited, return 429
    if (!result.success) {
      return rateLimitedResponse(result)
    }

    // Add rate limit headers to successful responses
    const response = await handler(request)
    
    if (result.limit) {
      response.headers.set('X-RateLimit-Limit', result.limit.toString())
    }
    if (result.remaining !== undefined) {
      response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
    }
    if (result.reset) {
      response.headers.set('X-RateLimit-Reset', result.reset.toString())
    }

    return response
  }
}
