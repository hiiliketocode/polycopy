// Simple in-memory rate limiter
// Note: Resets on deployment. For production scale, use Upstash Redis or similar.

const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

export function checkRateLimit(
  identifier: string, 
  maxRequests: number = 100, 
  windowMs: number = 60000
): boolean {
  const now = Date.now()
  const userLimit = rateLimitMap.get(identifier)
  
  // Clean up old entries periodically to prevent memory leaks
  if (rateLimitMap.size > 10000) {
    const cutoff = now - windowMs
    for (const [key, value] of rateLimitMap.entries()) {
      if (value.resetTime < cutoff) {
        rateLimitMap.delete(key)
      }
    }
  }
  
  // First request or window expired - reset counter
  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs })
    return true
  }
  
  // Rate limit exceeded
  if (userLimit.count >= maxRequests) {
    return false
  }
  
  // Increment counter
  userLimit.count++
  return true
}

// Convenience function to get remaining requests
export function getRemainingRequests(
  identifier: string,
  maxRequests: number = 100
): number {
  const userLimit = rateLimitMap.get(identifier)
  if (!userLimit) return maxRequests
  return Math.max(0, maxRequests - userLimit.count)
}

