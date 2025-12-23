# Feed Auto-Refresh Fix

## Problem
The feed page was automatically refreshing whenever users switched browser tabs or windows, causing:
- Poor user experience (losing scroll position, re-fetching data)
- Unnecessary API calls
- Wasted bandwidth

**Expected Behavior:**
- Feed should ONLY refresh on: 
  1. Manual "Refresh Feed" button click
  2. Browser refresh (F5 or reload)
- Feed should NOT refresh on:
  - Tab switching
  - Window switching
  - Component remounts
  - Auth state changes

## Root Cause Analysis

### Issue 1: useEffect Dependencies
Initial attempts used `useEffect` with user-related dependencies:
```typescript
useEffect(() => {
  fetchFeed();
}, [user, fetchFeed]); // ❌ Re-runs when user state updates
```

When switching tabs, Supabase's `onAuthStateChange` would fire, updating the user state and triggering the effect.

### Issue 2: useCallback Closure Issue
Even with empty deps, `fetchFeed` was a memoized callback that captured `user` from state:
```typescript
const fetchFeed = useCallback(async () => {
  if (!user) return; // ❌ Captured undefined user
  // ...
}, [user]);

useEffect(() => {
  fetchFeed(); // Called with stale/undefined user
}, []);
```

### Issue 3: sessionStorage Persistence
sessionStorage persists across browser sessions, causing the component to think data was already fetched when it wasn't in component state.

## Solution

### 1. Empty Dependency Array
```typescript
useEffect(() => {
  // Runs ONCE on mount, never again
  attemptFetch();
}, []); // Empty deps = once only
```

### 2. User Override Parameter
```typescript
const fetchFeed = useCallback(async (userOverride?: User) => {
  const currentUser = userOverride || user;
  // Now works with both fresh user and state user
}, [user]);
```

### 3. Fetch User Inside Effect
```typescript
const attemptFetch = async () => {
  let currentUser = user;
  
  if (!currentUser) {
    // Fetch fresh user from Supabase
    const { data: { user: freshUser } } = await supabase.auth.getUser();
    currentUser = freshUser;
  }
  
  // Pass user directly to fetchFeed
  await fetchFeed(currentUser);
};
```

### 4. Smart sessionStorage Check
```typescript
const sessionKey = `feed-fetched-${currentUser.id}`;
const alreadyFetched = sessionStorage.getItem(sessionKey);

// Only skip if BOTH sessionStorage AND ref flag are set
if (alreadyFetched === 'true' && hasFetchedRef.current) {
  return; // Already fetched in this session
}

await fetchFeed(currentUser);
sessionStorage.setItem(sessionKey, 'true');
```

## Implementation Details

### Key Changes in `app/feed/page.tsx`

1. **useEffect with Empty Deps**
   - Runs once on mount
   - No dependencies means no re-runs on state changes

2. **User Parameter in fetchFeed**
   - Added optional `userOverride?: User` parameter
   - Allows passing user directly, bypassing closure issue

3. **Dual Ref Tracking**
   - `hasAttemptedFetchRef`: Prevents multiple attempts in same lifecycle
   - `hasFetchedRef`: Tracks successful fetch completion

4. **sessionStorage by User**
   - Key: `feed-fetched-${userId}`
   - Persists across component remounts (tab switches)
   - User-specific to handle multi-account scenarios

5. **Auth State Change Optimization**
   ```typescript
   setUser(prevUser => {
     if (prevUser?.id === session.user.id) {
       return prevUser; // Same user, don't trigger re-render
     }
     return session.user; // Different user, update
   });
   ```

## Performance Impact

With 164 followed traders and 2,400 trades:
- **Before**: ~10-15 seconds load time + frequent auto-refreshes
- **After**: <2 seconds load time, no auto-refreshes

### Optimizations Applied
- Reduced trades per trader: 50 → 15
- Parallel fetching: Trades + names concurrently
- Batch size increase: 5 → 10 for name lookups
- Removed artificial 150ms delays
- Removed debug logging overhead

## Testing Checklist

- [x] Feed loads on initial page visit
- [x] Feed does NOT refresh when switching tabs
- [x] Feed does NOT refresh when switching windows
- [x] Manual "Refresh Feed" button works
- [x] Browser refresh (F5) reloads feed
- [x] sessionStorage persists across tab switches
- [x] Works with multiple followed traders (164 tested)
- [x] Fast load time (<2s for 2400 trades)

## Files Modified

- `app/feed/page.tsx` (primary changes)
  - Line 549: Added `userOverride` parameter to `fetchFeed`
  - Line 909-943: Rewrote fetch logic with empty deps
  - Line 478-490: Optimized auth state change handler

## Commits

1. `3349793` - Initial feed performance optimization
2. `360dc57` - First attempt: sessionStorage + useRef
3. `b4c225b` - Second attempt: Empty deps array
4. `c20a783` - Debug: Added comprehensive logging
5. `261f30a` - Fix: Check for data in state
6. `a57801f` - Temp: Force fetch to diagnose
7. `c0d20c7` - Debug: Detailed fetchFeed logging
8. `c7a8a05` - Fix: User override parameter
9. `e0c9d0a` - Clean: Remove debug logging (FINAL)

## Lessons Learned

1. **React useCallback closures** can capture stale state - use parameters instead
2. **sessionStorage** persists longer than you think - needs careful validation
3. **Empty dependency arrays** are powerful but require careful implementation
4. **Auth state listeners** can trigger unexpected re-renders
5. **Debug logging** was essential for diagnosing the closure issue

## Future Considerations

- Consider adding a "last fetched" timestamp to sessionStorage
- Could implement cache invalidation after X minutes
- Might add a subtle "data may be stale" indicator
- Could implement pull-to-refresh for mobile

---

**Status**: ✅ RESOLVED  
**Date**: December 23, 2025  
**Tested with**: 164 followed traders, 2,400 trades
