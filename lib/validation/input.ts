/**
 * Input Validation & Sanitization Library
 * 
 * Prevents injection attacks (SQL, XSS, command injection)
 * Validates and sanitizes all user inputs
 * 
 * Security: Defense in depth - validate early and often
 */

/**
 * Ethereum address validation
 * Format: 0x followed by 40 hex characters
 */
export function validateEthereumAddress(address: string | null | undefined): {
  valid: boolean
  sanitized: string | null
  error?: string
} {
  if (!address || typeof address !== 'string') {
    return { valid: false, sanitized: null, error: 'Address is required' }
  }

  const trimmed = address.trim()
  
  // Check format: 0x + 40 hex characters
  const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/
  
  if (!ethAddressRegex.test(trimmed)) {
    return { 
      valid: false, 
      sanitized: null, 
      error: 'Invalid Ethereum address format (must be 0x + 40 hex chars)' 
    }
  }
  
  // Normalize to lowercase
  return {
    valid: true,
    sanitized: trimmed.toLowerCase(),
  }
}

/**
 * Market/Token ID validation
 * Only alphanumeric, hyphens, underscores
 */
export function validateMarketId(id: string | null | undefined): {
  valid: boolean
  sanitized: string | null
  error?: string
} {
  if (!id || typeof id !== 'string') {
    return { valid: false, sanitized: null, error: 'Market ID is required' }
  }

  const trimmed = id.trim()
  
  // Only alphanumeric, hyphens, underscores (prevents injection)
  const safeIdRegex = /^[a-zA-Z0-9_-]+$/
  
  if (!safeIdRegex.test(trimmed)) {
    return {
      valid: false,
      sanitized: null,
      error: 'Invalid Market ID (alphanumeric, hyphens, underscores only)',
    }
  }
  
  // Length check (prevent buffer overflows)
  if (trimmed.length > 100) {
    return {
      valid: false,
      sanitized: null,
      error: 'Market ID too long (max 100 characters)',
    }
  }
  
  return {
    valid: true,
    sanitized: trimmed,
  }
}

/**
 * Positive number validation
 * For amounts, prices, etc.
 */
export function validatePositiveNumber(
  value: unknown,
  fieldName: string = 'Value',
  options: {
    min?: number
    max?: number
    allowZero?: boolean
  } = {}
): {
  valid: boolean
  sanitized: number | null
  error?: string
} {
  const { min = 0, max = Number.MAX_SAFE_INTEGER, allowZero = false } = options

  if (value === null || value === undefined) {
    return { valid: false, sanitized: null, error: `${fieldName} is required` }
  }

  const num = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(num)) {
    return { 
      valid: false, 
      sanitized: null, 
      error: `${fieldName} must be a valid number` 
    }
  }

  if (!allowZero && num === 0) {
    return {
      valid: false,
      sanitized: null,
      error: `${fieldName} must be greater than 0`,
    }
  }

  if (num < min) {
    return {
      valid: false,
      sanitized: null,
      error: `${fieldName} must be at least ${min}`,
    }
  }

  if (num > max) {
    return {
      valid: false,
      sanitized: null,
      error: `${fieldName} must be at most ${max}`,
    }
  }

  return {
    valid: true,
    sanitized: num,
  }
}

/**
 * Side validation (BUY/SELL)
 */
export function validateOrderSide(side: unknown): {
  valid: boolean
  sanitized: 'BUY' | 'SELL' | null
  error?: string
} {
  if (!side || typeof side !== 'string') {
    return { valid: false, sanitized: null, error: 'Side is required' }
  }

  const normalized = side.trim().toUpperCase()

  if (normalized !== 'BUY' && normalized !== 'SELL') {
    return {
      valid: false,
      sanitized: null,
      error: 'Side must be BUY or SELL',
    }
  }

  return {
    valid: true,
    sanitized: normalized as 'BUY' | 'SELL',
  }
}

/**
 * Order type validation
 */
export function validateOrderType(type: unknown): {
  valid: boolean
  sanitized: 'GTC' | 'FOK' | 'FAK' | 'IOC' | null
  error?: string
} {
  if (!type || typeof type !== 'string') {
    // Default to GTC if not provided
    return { valid: true, sanitized: 'GTC' }
  }

  const normalized = type.trim().toUpperCase()
  const validTypes = ['GTC', 'FOK', 'FAK', 'IOC']

  if (!validTypes.includes(normalized)) {
    return {
      valid: false,
      sanitized: null,
      error: `Order type must be one of: ${validTypes.join(', ')}`,
    }
  }

  return {
    valid: true,
    sanitized: normalized as 'GTC' | 'FOK' | 'FAK' | 'IOC',
  }
}

/**
 * String sanitization - removes HTML, SQL injection patterns
 * For text fields like market titles, usernames, etc.
 */
export function sanitizeString(
  value: string | null | undefined,
  maxLength: number = 500
): {
  valid: boolean
  sanitized: string | null
  error?: string
} {
  if (!value || typeof value !== 'string') {
    return { valid: true, sanitized: null }
  }

  let sanitized = value.trim()

  // Remove null bytes (can break SQL queries)
  sanitized = sanitized.replace(/\0/g, '')

  // Remove HTML tags (prevents XSS)
  sanitized = sanitized.replace(/<[^>]*>/g, '')

  // Remove SQL injection patterns
  const sqlPatterns = [
    /(\bOR\b.*=.*)/gi,
    /(\bAND\b.*=.*)/gi,
    /(';.*--)/gi,
    /(\bDROP\b.*\bTABLE\b)/gi,
    /(\bDELETE\b.*\bFROM\b)/gi,
    /(\bINSERT\b.*\bINTO\b)/gi,
    /(\bUPDATE\b.*\bSET\b)/gi,
  ]

  for (const pattern of sqlPatterns) {
    if (pattern.test(sanitized)) {
      return {
        valid: false,
        sanitized: null,
        error: 'Invalid characters detected',
      }
    }
  }

  // Length check
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength)
  }

  return {
    valid: true,
    sanitized: sanitized || null,
  }
}

/**
 * UUID validation
 */
export function validateUUID(uuid: string | null | undefined): {
  valid: boolean
  sanitized: string | null
  error?: string
} {
  if (!uuid || typeof uuid !== 'string') {
    return { valid: false, sanitized: null, error: 'UUID is required' }
  }

  const trimmed = uuid.trim()
  
  // UUID v4 format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  if (!uuidRegex.test(trimmed)) {
    return {
      valid: false,
      sanitized: null,
      error: 'Invalid UUID format',
    }
  }

  return {
    valid: true,
    sanitized: trimmed.toLowerCase(),
  }
}

/**
 * Batch validation - validates multiple fields at once
 * Returns first error found or all sanitized values
 */
export function validateBatch<T extends Record<string, unknown>>(
  validators: Array<{
    field: keyof T
    result: ReturnType<typeof validatePositiveNumber> | 
            ReturnType<typeof validateEthereumAddress> |
            ReturnType<typeof validateMarketId> |
            ReturnType<typeof validateOrderSide> |
            ReturnType<typeof validateOrderType> |
            ReturnType<typeof sanitizeString> |
            ReturnType<typeof validateUUID>
  }>
): {
  valid: boolean
  sanitized: Partial<T>
  errors: Array<{ field: string; error: string }>
} {
  const sanitized: Partial<T> = {}
  const errors: Array<{ field: string; error: string }> = []

  for (const { field, result } of validators) {
    if (!result.valid && result.error) {
      errors.push({ field: String(field), error: result.error })
    } else if (result.sanitized !== null) {
      sanitized[field] = result.sanitized as T[keyof T]
    }
  }

  return {
    valid: errors.length === 0,
    sanitized,
    errors,
  }
}

/**
 * Safe JSON parse - prevents prototype pollution
 */
export function safeJsonParse<T = unknown>(json: string): {
  success: boolean
  data: T | null
  error?: string
} {
  try {
    const parsed = JSON.parse(json)
    
    // Check for prototype pollution attempts
    if (parsed && typeof parsed === 'object') {
      if ('__proto__' in parsed || 'constructor' in parsed || 'prototype' in parsed) {
        return {
          success: false,
          data: null,
          error: 'Invalid JSON: prototype pollution attempt detected',
        }
      }
    }
    
    return {
      success: true,
      data: parsed as T,
    }
  } catch (error) {
    return {
      success: false,
      data: null,
      error: 'Invalid JSON format',
    }
  }
}
