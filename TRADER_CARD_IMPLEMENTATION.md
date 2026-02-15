# Trader Player Card Share Feature - Implementation Summary

## Overview
Added the ability for users to share trader profile cards with performance data, similar to the existing portfolio share feature.

## Files Created

### 1. `/lib/time-period-utils.ts`
**Purpose:** Utilities for filtering and calculating trader stats based on time periods

**Key Functions:**
- `filterByTimePeriod()` - Filters daily P&L data by time period (1D, 7D, 30D, 3M, 6M, ALL)
- `calculatePeriodStats()` - Calculates aggregated stats for a time period
- `getTimePeriodLabel()` - Returns display-friendly labels
- `formatChartData()` - Formats data for the accumulated P&L chart

**Types:**
- `TimePeriod` - Union type for time period options
- `DailyPnlRow` - Daily P&L data structure
- `PeriodStats` - Calculated stats for a period

### 2. `/components/polycopy/trader-card.tsx`
**Purpose:** React component that renders the trader player card

**Features:**
- 4 theme options (cream, dark, profit, fire) matching portfolio cards
- Displays trader info: name, wallet address, avatar, member since
- Shows performance metrics: P&L, ROI, Win Rate, Trades, Volume
- Includes accumulated P&L chart (mini sparkline)
- Conditional "TOP 100" badge for ranked traders
- Time period label below P&L

**Props:**
```typescript
interface TraderCardProps {
  displayName: string
  walletAddress: string
  profileImage?: string | null
  isTopHundred: boolean
  memberSince?: string
  totalPnL: number
  roi: number
  winRate: number
  volume: number
  trades: number
  avgReturn: number
  dailyPnlData: Array<{ date: string; pnl: number; cumulative: number }>
  timePeriod: '1D' | '7D' | '30D' | '3M' | '6M' | 'ALL'
  timePeriodLabel: string
  theme?: CardTheme
}
```

**Card Layout:**
```
┌─────────────────────────────────┐
│ Polycopy Logo    [TOP 100 badge]│ (if applicable)
│                                 │
│  Avatar  @username              │
│          0x1234...5678          │
│          Member since Jan 2026  │
│                                 │
│  ↗ $X,XXX.XX                   │ (P&L with trend)
│     [Time Period Label]         │ (e.g., "Last 30 Days")
│                                 │
│  ROI        Win Rate            │
│  XX%        XX%                 │
│                                 │
│  Trades     Volume              │
│  XXX        $X.XXK              │
│                                 │
│  [Mini Accumulated Chart]       │ (Sparkline/area chart)
│                                 │
│  polycopy.app                   │
│  Feb 8, 2026                    │
└─────────────────────────────────┘
```

### 3. `/hooks/useTraderCardData.ts`
**Purpose:** Custom hook for fetching and formatting trader data

**Features:**
- Fetches trader info and realized P&L data in parallel
- Filters data by selected time period
- Calculates period-specific stats
- Determines if trader is in TOP 100
- Formats chart data for display
- Returns loading and error states

**Return Type:**
```typescript
{
  data: TraderCardData | null
  isLoading: boolean
  error: string | null
}
```

### 4. `/components/polycopy/share-trader-modal.tsx`
**Purpose:** Modal component for sharing trader cards

**Features:**
- Time period selector (1D, 7D, 30D, 3M, 6M, ALL)
- Theme selector (cream, dark, profit, fire)
- Live preview of selected card
- Image generation using `html-to-image`
- Pre-generates all 4 themes for instant switching
- Copy to clipboard functionality
- Download as PNG
- Share to X (Twitter) with pre-filled text

**Share Text Template:**
```
Check out {displayName}'s performance on Polycopy! 📊

{+/-}${pnl} P&L | {+/-}{roi}% ROI | {winRate}% Win Rate

https://polycopy.app/trader/{walletAddress}
```

**User Flow:**
1. User clicks "Share" button on trader profile
2. Modal opens with loading state
3. Fetches trader data for ALL time by default
4. Generates all 4 theme cards in background
5. Shows preview of selected theme
6. User can change time period (regenerates cards)
7. User can change theme (instant switch)
8. User can copy/download/share

## Files Modified

### 1. `/app/trader/[wallet]/page.tsx`
**Changes:**
- Added `Share2` icon import from lucide-react
- Added `ShareTraderModal` component import
- Added `isShareModalOpen` state variable
- Added "Share" button in trader header next to external link
- Added `<ShareTraderModal>` component at end of JSX

**Button Location:**
Added in the header section, inline with the wallet address copy button and Polymarket external link:
```
[Avatar] [Name]
         [Wallet] [Copy] [External Link] [Share Button]
```

## Technical Details

### Image Generation
- Uses `html-to-image` library's `toPng()` function
- Client-side rendering (no API routes needed)
- Renders cards off-screen in hidden div
- 2x pixel ratio for high quality (840px actual width)
- Converts to PNG blob for clipboard/download

### Data Sources
- **Basic Info:** `/api/trader/{wallet}?timePeriod=all`
- **P&L Data:** `/api/trader/{wallet}/realized-pnl`
- **Top 100 Status:** Derived from rankings in realized P&L response

### Performance Optimizations
- Parallel data fetching (trader info + P&L)
- Pre-generation of all themes on modal open
- Cached blobs for instant theme switching
- Only regenerates on time period change

## Testing Instructions

### 1. Start the Development Server
```bash
npm run dev
```

### 2. Navigate to a Trader Profile
Visit: `http://localhost:3000/trader/[any-wallet-address]`

Example: `http://localhost:3000/trader/0x...`

### 3. Test the Share Button
1. Look for the "Share" button in the trader header (next to wallet address)
2. Click the "Share" button
3. Modal should open with loading indicator

### 4. Test Time Period Selection
1. Wait for cards to generate
2. Click different time periods: 24H, 7D, 30D, 3M, 6M, ALL
3. Observe cards regenerating for selected period
4. Verify P&L and stats update correctly

### 5. Test Theme Selection
1. Click different themes: Cream, Dark, Profit, Fire
2. Verify preview switches instantly (no regeneration)
3. Check all themes render correctly

### 6. Test TOP 100 Badge
1. Find a trader in top 100 (check `/api/trader/{wallet}/realized-pnl` for rank)
2. Verify gold "TOP 100" badge appears on card
3. Test with trader outside top 100 (no badge should show)

### 7. Test Actions
**Copy:**
1. Click "Copy" button
2. Paste into an image-capable app (Slack, Twitter, etc.)
3. Verify image appears

**Download:**
1. Click "Download" button
2. Check downloads folder for PNG file
3. Verify file name format: `polycopy-trader-{wallet}-{theme}.png`

**Share to X:**
1. Click "Share to X" button
2. If Web Share API supported: Native share dialog appears
3. If not supported: Image downloads + Twitter opens with text
4. Verify share text includes P&L, ROI, win rate, and trader URL

### 8. Test Edge Cases
- Trader with no P&L data
- Trader with no profile image (initials fallback)
- Very long trader names
- Very large/small P&L values
- Different time periods with no data

### 9. Visual Regression Testing
Compare with portfolio cards to ensure consistent styling:
- Card dimensions (420px width)
- Theme colors match exactly
- Font sizes and spacing
- Border radius and shadows
- Logo placement

## Known Limitations

1. **Trade Count:** Approximated as days active in period (actual trade count would require querying full trade history)
2. **Member Since:** Calculated from first day in P&L data, not actual account creation
3. **Chart Data:** Limited to available daily P&L data (may be sparse for inactive traders)
4. **TOP 100 Status:** Based on ALL time rank, not time-period-specific rank

## Future Enhancements (Optional)

1. Add share count tracking
2. Add more time period options (YTD, 1Y, etc.)
3. Add custom date range selector
4. Include additional metrics (max drawdown, Sharpe ratio, etc.)
5. Add leaderboard rank to card if in top 100
6. Add category breakdown chart
7. Social proof (follower count, copy count)
8. Add trader bio/description if available
9. QR code linking to profile
10. Animated charts for social media videos

## Dependencies

All required dependencies are already installed in package.json:
- `html-to-image@^1.11.13` - Image generation
- `recharts@^2.15.4` - Charts
- `lucide-react@^0.554.0` - Icons
- Radix UI components - Dialog, Button, etc.

## Files Structure
```
polycopy/
├── lib/
│   └── time-period-utils.ts          (NEW)
├── hooks/
│   └── useTraderCardData.ts          (NEW)
├── components/
│   └── polycopy/
│       ├── trader-card.tsx           (NEW)
│       └── share-trader-modal.tsx    (NEW)
└── app/
    └── trader/
        └── [wallet]/
            └── page.tsx               (MODIFIED)
```

## Commit Message Suggestion
```
feat: add shareable trader player cards

- Add time-period-based trader card generation
- Support 4 themes (cream, dark, profit, fire)
- Include accumulated P&L chart
- Add TOP 100 badge for ranked traders
- Implement time period selector (1D-ALL)
- Add copy/download/share to X functionality
- Integrate share button in trader profile header
```

## Success Criteria
✅ User can click "Share" button on trader profile
✅ Modal opens with time period and theme selectors
✅ Cards generate for selected time period
✅ Theme switching is instant
✅ TOP 100 badge shows for ranked traders
✅ Accumulated P&L chart displays correctly
✅ Copy to clipboard works
✅ Download saves PNG file
✅ Share to X includes correct text and trader URL
✅ All 4 themes render correctly
✅ No linter errors
✅ Mobile responsive design
