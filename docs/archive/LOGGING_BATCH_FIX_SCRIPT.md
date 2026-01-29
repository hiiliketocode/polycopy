# Logging Fix - Batch Processing Plan

## Files Remaining to Fix:

### Auth Error Logging (High Priority):
1. app/api/stripe/portal/route.ts - 10 instances
2. app/api/stripe/cancel-subscription/route.ts - similar pattern
3. app/api/copied-trades/route.ts - auth checks
4. app/api/notification-preferences/route.ts - auth errors
5. app/api/portfolio/*.ts - multiple files with auth logging
6. app/api/wallet/*.ts - wallet operations

### Strategy:
For all auth error patterns like:
```typescript
if (error) console.error('Auth error:', error.message)
```

Replace with:
```typescript
if (error) {
  logError('auth_failed', { error_type: error.name, endpoint: '[endpoint_name]' })
}
```

### Debug Logging Patterns:
Remove excessive debug logs like:
- `console.log('Auth via header - User exists:', !!user)`
- `console.log('Final auth check - User ID:', user?.id)`
- `console.log('Auth-related cookies found:', ...)`

Keep only essential logging using secure logger.

## Progress:
- [x] Phase 1: Request/Response (4/10 fixed)
- [~] Phase 2: Auth Errors (15/63 fixed, 48 remaining)
- [ ] Phase 3: General Errors (0/50 fixed)

## Time Estimate:
- Remaining Phase 2: ~45 mins
- Phase 3: ~1 hour
- Total: ~1.75 hours remaining
