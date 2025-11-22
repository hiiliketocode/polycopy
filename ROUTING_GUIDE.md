# Polycopy Routing Guide

## App Structure

The app uses Next.js App Router with the following page structure:

### Main Routes

| Route | File | Description |
|-------|------|-------------|
| `/` | `app/page.tsx` | **Feed Page** - Shows personalized feed of followed traders (or empty state) |
| `/discover` | `app/discover/page.tsx` | **Discover Page** - Browse and search for traders to follow |
| `/profile` | `app/profile/page.tsx` | **Profile Page** - User settings and profile |
| `/login` | `app/login/page.tsx` | **Login Page** - Magic link authentication |
| `/trader/[wallet]` | `app/trader/[wallet]/page.tsx` | **Trader Profile** - Individual trader details |

### Navigation (Bottom Nav)

The bottom navigation bar (visible on all pages) has three tabs:

1. **Feed** 📋 → `/` (Homepage)
2. **Discover** 🔍 → `/discover` (Trader discovery)
3. **Profile** 👤 → `/profile` (User profile)

### API Routes

| Route | File | Description |
|-------|------|-------------|
| `/api/trader/[wallet]` | `app/api/trader/[wallet]/route.ts` | Fetch trader data from Polymarket |
| `/api/test-polymarket` | `app/api/test-polymarket/route.ts` | Test Polymarket API connection |
| `/auth/callback` | `app/auth/callback/route.ts` | Handle Supabase magic link callback |

## Page States

### Feed Page (`/`)

**When user is NOT logged in:**
- Shows lock icon 🔒
- Message: "Log in to see your feed"
- Button → `/login`

**When user IS logged in but has NO follows:**
- Shows empty feed icon 📋
- Message: "Your feed is empty"
- Button → `/discover` ("Find Traders to Follow")

**When user IS logged in and HAS follows:**
- Shows placeholder message
- Two buttons:
  - "Find More Traders" → `/discover`
  - "View Profile" → `/profile`

### Discover Page (`/discover`)

Always accessible (logged in or not) with:
- Search bar for wallets/usernames
- Featured traders (horizontal scroll)
- Category filters (All, Sports, Politics, Crypto)
- Top traders grid (3 columns on desktop)
- Each trader card links to `/trader/[wallet]`

### Trader Profile Page (`/trader/[wallet]`)

- Shows trader stats, avatar, P&L, win rate
- Follow/Unfollow button
- Recent trades section (placeholder)
- Back button to previous page

## User Flow Examples

### New User Flow:
1. Visit `/` → See "Log in to see your feed"
2. Click "Sign In" → Go to `/login`
3. Enter email → Receive magic link
4. Click magic link → Redirect to `/auth/callback` → Redirect to `/`
5. See "Your feed is empty"
6. Click "Find Traders to Follow" → Go to `/discover`
7. Click trader card → Go to `/trader/[wallet]`
8. Click "Follow" → Follow trader
9. Click Feed tab → Go to `/` → See feed placeholder

### Returning User Flow:
1. Visit `/` → See personalized feed
2. Click Discover tab → Go to `/discover`
3. Browse traders
4. Click Profile tab → Go to `/profile`

## Component Hierarchy

```
layout.tsx (root)
├── page.tsx (Feed)
├── discover/
│   └── page.tsx (Discover)
├── profile/
│   └── page.tsx (Profile)
├── login/
│   └── page.tsx (Login)
├── trader/
│   └── [wallet]/
│       └── page.tsx (Trader Profile)
└── components/
    ├── BottomNav.tsx (Fixed navigation)
    └── TraderCard.tsx (Reusable card)
```

## Notes

- **Removed `/following` route** - This was redundant with the feed functionality
- **Feed is now at `/`** - The main landing page shows your personalized feed
- **Discover is at `/discover`** - All trader discovery happens here
- All routes use client components (`'use client'`) for interactivity
- BottomNav is visible on all pages (fixed at bottom)
- Authentication state is checked on each page

