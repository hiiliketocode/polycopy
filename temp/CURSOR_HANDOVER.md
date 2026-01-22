# Polycopy Landing Page - Cursor Handover Document

## Overview

This is the production-ready landing page for Polycopy, a copy trading platform for Polymarket. The landing page is built with Next.js 16, Tailwind CSS v4, and shadcn/ui components.

**Important:** This landing page is a standalone component. The rest of the app (authentication, API routes, database) already exists. Your job is to integrate this landing page with the existing infrastructure.

---

## Existing App Infrastructure

### Authentication (Supabase Auth)
- **Provider**: Supabase Auth
- **Methods**: Email/password with magic links
- **User flow**: 
  - Logged-out users land on `/home` 
  - Sign up redirects to `/login?mode=signup`
  - After auth, redirect to `/feed`
- **Session management**: Already handled via Supabase client

### Existing API Endpoints
The backend is fully built. Key endpoints to use:

| Endpoint | Purpose |
|----------|---------|
| `/api/polymarket/leaderboard` | Trending/top traders (use for Top Traders section) |
| `/api/polymarket/*` | Polymarket data fetching |
| `/api/copied-trades/*` | User's copied trades |
| `/api/trader/[wallet]/*` | Trader profiles and stats |
| `/api/portfolio/stats` | User portfolio data |
| `/api/orders/quick-copy` | Premium quick copy execution |
| `/api/stripe/*` | Payment/subscription handling |

### Database (Supabase PostgreSQL)
Existing tables with RLS policies:
- `profiles` - User profiles
- `orders` - All copied trades
- `follows` - User follows traders
- `traders` - Trader metadata
- `notification_preferences` - User settings

### Polymarket Integration
Two copy modes exist:
1. **Free (Manual)**: "Copy Trade" opens Polymarket in new tab, user executes there, returns to mark as copied
2. **Premium (Quick Copy)**: User connects Turnkey wallet, 1-click execution via Polymarket CLOB API. Private keys managed by Turnkey (never touch servers).

### Payment (Stripe)
- Already configured in `/api/stripe/*`
- Flow: Upgrade button → Stripe Checkout → Webhook updates DB → Premium features unlocked
- Plan: $19/month (configured in Stripe dashboard)

### Deployment
- **Platform**: Vercel
- **Config**: `vercel.json` in root
- **Environment**: All env vars in Vercel dashboard
- **Branch deployments**: Automatic on push

---

## File Structure

```
/app
  page.tsx                    # Main landing page (this is what you're integrating)
  layout.tsx                  # Root layout with Inter font, metadata
  globals.css                 # Global styles, color tokens, animations

/components/landing
  header.tsx                  # Navigation header (fixed, with mobile menu)
  hero.tsx                    # Hero with scroll-jacking iPhone feed mockup
  features-carousel.tsx       # "Everything you need to copy trade" carousel
  top-traders.tsx             # "See who you could be following" section
  steps-section.tsx           # "Get started in 3 simple steps" section
  pricing.tsx                 # Pricing cards (Free vs Premium)
  security.tsx                # Security features section
  cta.tsx                     # Final call-to-action section
  footer.tsx                  # Footer with links and disclaimer

/hooks
  use-confetti.ts             # Confetti effect for "Copy Trade" button demos
```

---

## Design System

### Brand Colors (defined in globals.css)

| Token | Value | Usage |
|-------|-------|-------|
| `--polycopy-yellow` | #FDB022 | Primary brand color, CTAs, highlights |
| `--polycopy-yellow-hover` | #E5A020 | Hover state for yellow buttons |
| `--neutral-black` | #0F0F0F | Dark backgrounds, text |
| `--profit-green` | #10B981 | Positive ROI, success states |
| `--loss-red` | #EF4444 | Negative ROI, error states |
| `--info-blue` | #3B82F6 | Informational elements |

### Typography
- **Font Family**: Inter (loaded via `next/font/google`)
- **Tailwind Class**: `font-sans`

### Spacing & Radius
- **Border Radius**: `--radius: 0.75rem` (12px base)
- **Section Padding**: `py-16 lg:py-32` (vertical), `px-4 sm:px-6 lg:px-8` (horizontal)
- **Max Width**: `max-w-7xl` for content containers

---

## Integration Tasks (Priority Order)

### 1. Hero Section (hero.tsx) - HIGHEST PRIORITY

**Dynamic Stats Banner:**
- Current: Hardcoded "2,847 trades in Polycopy feeds in the last 24 hours"
- TODO: Fetch from API (create endpoint or calculate from existing data)
- Suggestion: Cache with 5-15 minute TTL

**CTA Button:**
- "Start Copying For Free" → Link to `/login?mode=signup`

**Copy Trade Buttons (in feed mockup):**
- Currently triggers confetti demo effect
- For production: Either keep as demo, or wire up to show signup prompt for logged-out users

### 2. Top Traders Section (top-traders.tsx)

**Current State:** Hardcoded mock data for 10 traders

**Integration:**
```typescript
// Fetch from existing endpoint
const response = await fetch('/api/polymarket/leaderboard')
const traders = await response.json()
```

**Data Structure Expected:**
```typescript
interface Trader {
  rank: number
  name: string
  handle: string        // e.g., "@cryptowhale"
  avatar: string        // Tailwind bg color class
  roi: string          // e.g., "+142%"
  winRate: string      // e.g., "68%"
  volume: string       // e.g., "$2.4M"
  specialty: string    // "Crypto" | "Politics" | "Sports" | "Tech"
}
```

**Buttons:**
- "View Profile" → Link to `/traders/[wallet]` or appropriate profile URL
- "Explore All Traders" → Link to `/discover`

### 3. Pricing Section (pricing.tsx)

**Buttons:**
- "Start For Free" → Link to `/login?mode=signup`
- "Upgrade to Premium" → Trigger Stripe checkout flow (use existing `/api/stripe/*`)

**Note:** Price shown is $20/mo but Stripe is configured for $19/mo. Update copy if needed.

### 4. Navigation & CTAs

**Header (header.tsx):**
| Button | Link To |
|--------|---------|
| Sign In | `/login` |
| Start Free | `/login?mode=signup` |

**Steps Section (steps-section.tsx):**
- "Sign Up Free" → `/login?mode=signup`

**CTA Section (cta.tsx):**
- "Sign Up Free" → `/login?mode=signup`

**Footer (footer.tsx):**
| Link | URL |
|------|-----|
| FAQ | `/faq` or help center URL |
| Trading Setup | `/docs/setup` or guide URL |
| Terms of Service | `/terms` |
| Privacy Policy | `/privacy` |

---

## Component Configuration Details

### Hero Scroll-Jacking (hero.tsx)

**Behavior:**
1. User scrolls in hero section
2. iPhone feed scrolls internally first (0-800px)
3. After 800px of feed scroll, page scrolling resumes

**Configuration:**
- `maxFeedScroll = 800` - Adjust to change internal scroll distance

### Features Carousel (features-carousel.tsx)

**5 Slides (hardcoded, no API needed):**
1. Follow Top Traders - 500K+ traders
2. Performance Analytics - 50+ data points
3. Quick Copy Trades - 3 taps
4. Smart Notifications - Instant alerts
5. Your Keys, Your Control - 100% non-custodial

### Security Section (security.tsx)

**3 Features (hardcoded, no API needed):**
1. Turnkey Infrastructure - Bank-level encryption
2. Non-Custodial - User maintains full control
3. No Hidden Fees - $20/month flat

---

## Responsive Breakpoints

| Breakpoint | Width | Key Changes |
|------------|-------|-------------|
| Default | < 640px | Mobile layout |
| sm | 640px+ | Minor adjustments |
| lg | 1024px+ | Full desktop layout |

### Key Responsive Behaviors
- **Hero**: Feed mockup centered mobile, side-by-side desktop
- **Top Traders**: 2x3 grid (6 cards) mobile, 2x4 grid (8 cards) desktop
- **Features Carousel**: Compact card mobile, larger card desktop
- **Steps**: Vertical stack mobile, horizontal desktop
- **Header**: Hamburger menu mobile, full nav desktop

---

## Assets

### Icons
All from `lucide-react`. No custom icon files needed.

### Favicon Files (verify in /public)
- `/icon-light-32x32.png`
- `/icon-dark-32x32.png`
- `/icon.svg`
- `/apple-icon.png`

### Logo
Rendered as CSS in header.tsx (yellow square with shadow effect).

---

## Integration Checklist

### Must Do Before Launch
- [ ] Wire "Start Copying For Free" / "Sign Up Free" buttons to `/login?mode=signup`
- [ ] Wire "Sign In" to `/login`
- [ ] Fetch real trader data from `/api/polymarket/leaderboard` for Top Traders section
- [ ] Make stats banner dynamic (trade count)
- [ ] Wire "Upgrade to Premium" to Stripe checkout
- [ ] Add real URLs to footer links
- [ ] Verify favicon files exist

### Nice to Have
- [ ] Add analytics tracking to CTAs
- [ ] Replace confetti with signup prompt for logged-out users
- [ ] Add Open Graph / Twitter card images

---

## Do NOT Change

These are already built and working in the main app:
- Authentication flow (`/app/api/auth/*`, Supabase client setup)
- Database schema (Supabase tables and RLS policies)
- API routes (`/app/api/*`)
- Existing components outside `/components/landing`
- Stripe integration
- Turnkey wallet integration

---

## Quick Reference: URL Patterns

| Action | URL |
|--------|-----|
| Sign up | `/login?mode=signup` |
| Sign in | `/login` |
| Main feed (after auth) | `/feed` |
| Discover traders | `/discover` |
| Trader profile | `/traders/[wallet]` |
| User's copied trades | `/copied-trades` |

---

## Dependencies

### npm packages used in landing page:
- `next` - Framework
- `react`, `react-dom` - UI
- `tailwindcss` - Styling
- `lucide-react` - Icons
- shadcn/ui components (Button, Badge, Card)

### Confetti hook
`use-confetti.ts` uses canvas-confetti. Can be removed once demo effect is no longer needed.
