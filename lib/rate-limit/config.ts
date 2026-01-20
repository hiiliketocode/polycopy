/**
 * Rate Limiting Configuration
 * 
 * Multi-tier rate limiting to protect against:
 * - DDoS attacks
 * - Brute force attempts
 * - API abuse
 * - Fund drainage attacks
 * - Enumeration attacks
 */

export const RATE_LIMIT_CONFIG = {
  /**
   * CRITICAL: Order placement and financial operations
   * Most restrictive - prevents fund drainage attacks
   */
  CRITICAL: {
    requests: 10,
    window: '1m',
    description: 'Order placement, wallet operations',
  },

  /**
   * HIGH: Authentication and sensitive operations
   * Prevents brute force and credential stuffing
   */
  AUTH: {
    requests: 5,
    window: '5m',
    description: 'Login, signup, password reset',
  },

  /**
   * MEDIUM: Trading data and position fetches
   * Prevents excessive API calls to external services
   */
  TRADING: {
    requests: 60,
    window: '1m',
    description: 'Position fetches, order history, balance checks',
  },

  /**
   * LOW: Public data and read-only operations
   * General API protection
   */
  PUBLIC: {
    requests: 100,
    window: '1m',
    description: 'Public market data, trader stats, leaderboard',
  },

  /**
   * WEBHOOK: External webhook endpoints
   * Prevents webhook spam/replay attacks
   */
  WEBHOOK: {
    requests: 100,
    window: '1m',
    description: 'Stripe webhooks, external callbacks',
  },
} as const

/**
 * Rate limit identifier types
 * Determines how we track rate limits (IP, user ID, combination)
 */
export type RateLimitIdentifier =
  | 'ip' // IP address only
  | 'user' // User ID only
  | 'ip-user' // Combination of IP + user ID
  | 'anonymous' // Anonymous requests (IP only)

/**
 * Rate limit tier types
 */
export type RateLimitTier = keyof typeof RATE_LIMIT_CONFIG

/**
 * Environment configuration
 */
export const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL
export const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

/**
 * Check if rate limiting is enabled
 * Gracefully degrades if Redis not configured
 */
export const isRateLimitEnabled = () => {
  return Boolean(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN)
}

/**
 * Get rate limit configuration for a tier
 */
export const getRateLimitConfig = (tier: RateLimitTier) => {
  return RATE_LIMIT_CONFIG[tier]
}
