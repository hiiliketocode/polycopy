# Profile Page Trade Cards Update

## Summary
Updated the Copied Trades section on the profile page to match the visual style of the feed page trade cards, including trader profile icons and market avatars.

## Changes Made

### 1. Database Migration
**File:** `supabase/migrations/20250107_add_avatar_columns_to_copied_trades.sql`

Added two new columns to the `copied_trades` table:
- `trader_profile_image_url` - Stores the trader's profile image from Polymarket
- `market_avatar_url` - Stores the market's icon/avatar image

### 2. API Route Updates
**File:** `app/api/copied-trades/route.ts`

Updated the POST endpoint to:
- Fetch trader profile images from Polymarket leaderboard API when creating a copied trade
- Accept and store `marketAvatarUrl` passed from the client
- Store both values in the new database columns

### 3. Feed Page Updates
**File:** `app/feed/page.tsx`

Updated the `handleConfirmCopy` function to:
- Fetch trader profile image from Polymarket leaderboard before inserting
- Pass the market avatar URL (already available from the trade data)
- Store both values when marking a trade as copied

### 4. Profile Page UI Updates
**File:** `app/profile/page.tsx`

Restructured the trade cards to match the feed style:

**Before:**
- Simple text link for trader name
- Market title as plain text
- Badge positioned separately

**After:**
- **Trader Row:** Avatar + name + wallet address + timestamp + expand button
- **Market Row:** Market avatar + market title + outcome badge
- **Stats Grid:** (unchanged - entry, current, amount, ROI)
- Matches the visual hierarchy and spacing of feed cards

### 5. Backfill Script
**File:** `scripts/backfill-copied-trades-avatars.js`

Created a Node.js script to populate existing trades with images:
- Fetches trader profile images from Polymarket leaderboard API
- Fetches market avatars from Polymarket market API
- Updates existing `copied_trades` records in batches
- Includes rate limiting (200ms between requests)
- Provides detailed progress logging

## How to Run

### 1. Apply Database Migration
```bash
# If using Supabase CLI
supabase db push

# Or run the SQL directly in Supabase dashboard
```

### 2. Backfill Existing Trades
```bash
# Make sure environment variables are set
export NEXT_PUBLIC_SUPABASE_URL="your-supabase-url"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Run the backfill script
node scripts/backfill-copied-trades-avatars.js
```

### 3. Test the Changes
1. Navigate to the profile page
2. View the Copied Trades tab
3. Verify that trader avatars and market icons are displayed
4. Compare with the feed page to ensure visual consistency

## Benefits

1. **Visual Consistency:** Profile and feed pages now have matching trade card styles
2. **Better UX:** Icons make it easier to quickly identify traders and markets
3. **Professional Look:** Avatars add visual polish to the interface
4. **Performance:** Images are stored in the database, avoiding repeated API calls
5. **Backward Compatible:** Existing trades can be backfilled with the script

## Technical Notes

- **Trader Profile Images:** Fetched from Polymarket leaderboard API using the trader's wallet address
- **Market Avatars:** Passed from the feed data or fetched from Polymarket market API
- **Fallbacks:** If images aren't available, colored avatar fallbacks with initials are shown
- **Rate Limiting:** Backfill script includes 200ms delays between API requests
- **Caching:** API route uses Next.js cache with 1-hour revalidation for profile images

## Future Enhancements

Consider these optional improvements:
1. Add a periodic job to refresh trader profile images (they can change on Polymarket)
2. Implement lazy loading for images in long lists
3. Add image error handling with retry logic
4. Cache trader profile images at the application level for better performance

