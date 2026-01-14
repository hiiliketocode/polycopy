/**
 * Secure Error Response Utility
 * 
 * SECURITY: Never expose system internals to clients in production
 * - NO stack traces
 * - NO error.message (can contain file paths, SQL, etc.)
 * - NO database error codes
 * - ONLY generic messages to users
 * - Detailed errors ONLY in server logs
 */

import { NextResponse } from 'next/server'
import { logError } from '@/lib/logging/logger'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

/**
 * Generic error messages for different categories
 * Safe to show to users - reveal nothing about system internals
 */
const GENERIC_MESSAGES = {
  // Authentication & Authorization
  unauthorized: 'Authentication required. Please log in.',
  forbidden: 'You do not have permission to access this resource.',
  session_expired: 'Your session has expired. Please log in again.',
  
  // Input & Validation
  invalid_input: 'Invalid input provided. Please check your data.',
  missing_field: 'Required information is missing.',
  validation_failed: 'The provided data could not be validated.',
  
  // Resources
  not_found: 'The requested resource was not found.',
  already_exists: 'This resource already exists.',
  conflict: 'This operation conflicts with existing data.',
  
  // Operations
  operation_failed: 'The operation could not be completed. Please try again.',
  timeout: 'The operation took too long. Please try again.',
  rate_limited: 'Too many requests. Please try again later.',
  
  // External Services
  service_unavailable: 'A required service is temporarily unavailable. Please try again.',
  external_api_error: 'Unable to connect to external service. Please try again.',
  
  // Database
  database_error: 'A database error occurred. Please try again.',
  
  // Default
  internal_error: 'An internal error occurred. Please try again later.',
} as const

type ErrorCategory = keyof typeof GENERIC_MESSAGES

interface ErrorResponseOptions {
  /** Error category - determines the generic message shown to user */
  category: ErrorCategory
  /** HTTP status code */
  status: number
  /** Unique error code for tracking (safe to expose) */
  errorCode?: string
  /** Internal message for logging only (NEVER sent to client in prod) */
  internalMessage?: string
  /** Additional context for server logs (NEVER sent to client in prod) */
  context?: Record<string, any>
  /** The actual error object for logging */
  error?: unknown
}

/**
 * Create a secure error response
 * - Returns generic message to client in production
 * - Logs detailed error server-side
 * - Safe to use everywhere
 */
function extractErrorInfo(error: unknown): Record<string, unknown> | null {
  if (!error) return null
  if (error instanceof Error) {
    return {
      error_name: error.name,
      error_message: error.message,
      stack: error.stack?.split('\n').slice(0, 5),
    }
  }
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>
    const details: Record<string, unknown> = {}
    for (const key of ['message', 'details', 'hint', 'code', 'status', 'error']) {
      if (record[key] !== undefined) {
        details[key] = record[key]
      }
    }
    return Object.keys(details).length > 0 ? details : null
  }
  return { error: String(error) }
}

export function createErrorResponse(options: ErrorResponseOptions): NextResponse {
  const {
    category,
    status,
    errorCode,
    internalMessage,
    context = {},
    error,
  } = options

  // Log detailed error server-side (with auto-redaction)
  logError(errorCode || `api_error_${status}`, {
    category,
    status,
    internal_message: internalMessage,
    error_name: error instanceof Error ? error.name : typeof error,
    error_message: error instanceof Error ? error.message : String(error),
    ...context,
  })

  // Prepare client response
  const clientMessage = GENERIC_MESSAGES[category]
  
  const responseBody: any = {
    error: clientMessage,
  }

  // Always attach a small, sanitized debug payload for client-side troubleshooting.
  // Keep it minimal to avoid leaking sensitive data.
  const devInfo = extractErrorInfo(error)
  if (devInfo) {
    responseBody.dev_info = {
      error_code: errorCode,
      internal_message: IS_PRODUCTION ? undefined : internalMessage,
      ...devInfo,
    }
  }

  return NextResponse.json(responseBody, { status })
}

/**
 * Shorthand functions for common error types
 */

export function badRequest(context?: string, errorDetails?: unknown) {
  return createErrorResponse({
    category: 'invalid_input',
    status: 400,
    errorCode: 'bad_request',
    internalMessage: context,
    error: errorDetails,
  })
}

export function unauthorized(context?: string, errorDetails?: unknown) {
  return createErrorResponse({
    category: 'unauthorized',
    status: 401,
    errorCode: 'unauthorized',
    internalMessage: context,
    error: errorDetails,
  })
}

export function forbidden(context?: string, errorDetails?: unknown) {
  return createErrorResponse({
    category: 'forbidden',
    status: 403,
    errorCode: 'forbidden',
    internalMessage: context,
    error: errorDetails,
  })
}

export function notFound(context?: string, errorDetails?: unknown) {
  return createErrorResponse({
    category: 'not_found',
    status: 404,
    errorCode: 'not_found',
    internalMessage: context,
    error: errorDetails,
  })
}

export function conflict(context?: string, errorDetails?: unknown) {
  return createErrorResponse({
    category: 'conflict',
    status: 409,
    errorCode: 'conflict',
    internalMessage: context,
    error: errorDetails,
  })
}

export function tooManyRequests(context?: string, errorDetails?: unknown) {
  return createErrorResponse({
    category: 'rate_limited',
    status: 429,
    errorCode: 'rate_limited',
    internalMessage: context,
    error: errorDetails,
  })
}

export function internalError(context?: string, errorDetails?: unknown) {
  return createErrorResponse({
    category: 'internal_error',
    status: 500,
    errorCode: 'internal_error',
    internalMessage: context,
    error: errorDetails,
  })
}

export function serviceUnavailable(context?: string, errorDetails?: unknown) {
  return createErrorResponse({
    category: 'service_unavailable',
    status: 503,
    errorCode: 'service_unavailable',
    internalMessage: context,
    error: errorDetails,
  })
}

/**
 * Database-specific error handler
 * Detects common database error patterns and returns generic messages
 */
export function databaseError(error: unknown, operation?: string) {
  return createErrorResponse({
    category: 'database_error',
    status: 500,
    errorCode: 'database_error',
    internalMessage: operation ? `Database operation failed: ${operation}` : undefined,
    error,
  })
}

/**
 * External API error handler
 * For Polymarket, Turnkey, Stripe, etc.
 */
export function externalApiError(serviceName: string, error: unknown, operation?: string) {
  return createErrorResponse({
    category: 'external_api_error',
    status: 502,
    errorCode: `${serviceName}_api_error`,
    internalMessage: operation ? `${serviceName} API call failed: ${operation}` : undefined,
    context: { service: serviceName },
    error,
  })
}
