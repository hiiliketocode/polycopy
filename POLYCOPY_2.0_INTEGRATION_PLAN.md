# Polycopy 2.0 Integration Plan
**v0 Output → Production Codebase**  
Created: February 14, 2026

---

## 📊 Status: v0 Output Reviewed

### ✅ What v0 Built Successfully

**Phase 1: Foundation** ✅
- ✅ Complete design system in `globals.css`
- ✅ Tailwind config with Polycopy brand colors
- ✅ Font loading (Space Grotesk + DM Sans)
- ✅ CSS utility classes (card-technical, btn-primary, etc.)
- ✅ All CSS variables defined

**Phase 2: Pages** ✅
- ✅ Feed page (`/feed`)
- ✅ Bots Dashboard (`/bots`)
- ✅ Discover page (`/discover`)
- ✅ Trader Profile (`/trader/[wallet]`)
- ✅ Portfolio page (`/portfolio`)

**Components Built** ✅
- ✅ TradeCard (with PolyScore badge, locked states)
- ✅ TraderCard
- ✅ BotCard (with sparkline charts)
- ✅ TopNav (desktop)
- ✅ BottomNav (mobile)
- ✅ Logo component
- ✅ FilterBar
- ✅ All Radix UI components installed

---

## 🔴 Critical Gaps (What's Missing)

### 1. **NO REAL DATA INTEGRATION** ❌
**Issue:** Everything uses mock data  
**Impact:** Pages render but don't connect to your backend

**What needs to be connected:**
- `/api/feed` → Feed page
- `/api/ft/wallets` + `/api/lt/strategies` → Bots page
- `/api/trader/stats` + `/api/polymarket/leaderboard` → Discover page
- `/api/trader/[wallet]` → Trader profile
- `/api/portfolio` + `/api/orders` → Portfolio page

---

### 2. **NO AUTHENTICATION** ❌
**Issue:** No user session handling, no premium checks  
**Impact:** Can't gate features, can't know who's logged in

**What needs to be added:**
- Supabase auth integration
- User session checking
- Premium user detection (`is_premium` flag)
- Wallet connection status

---

### 3. **NO ACTUAL FUNCTIONALITY** ❌
**Issue:** Buttons don't do anything  
**Impact:** "Copy Trade" button is placeholder, etc.

**What needs to be wired up:**
- Copy Trade button → Place order flow
- Follow/Unfollow trader
- Activate/Pause bot
- Close position
- All interactive elements

---

### 4. **MISSING PAGES** ❌
**Issue:** Key pages not built at all  
**Impact:** Incomplete product

**Missing pages:**
- Landing page (`/`)
- Login page (`/login`)
- SEO content pages
- Settings/Profile pages

---

### 5. **INCOMPLETE COMPONENTS** ⚠️
**Issue:** Components missing features from current product

**TradeCard missing:**
- Category badge
- "I Wish I Copied That" button
- Current price vs entry price
- Time-sensitive indicators
- Real trader avatar links

**Trader Profile missing:**
- Share button (OG cards)
- Real follow status
- Category breakdown details

**Portfolio missing:**
- Bot positions separately tracked
- Manual vs automated trades distinction
- Real PnL calculations from blockchain

---

## 🎯 Integration Strategy

### Stage 1: Foundation Setup (1-2 hours)
**Goal:** Get v0's code into your codebase structure

**Tasks:**
1. Copy design system files:
   - `globals.css` → merge with your existing
   - `tailwind.config.ts` → extend your config
   - Font loading → update `layout.tsx`
   
2. Copy component library:
   - `components/polycopy/*` → into your project
   - `components/ui/*` → shadcn components
   
3. Install missing dependencies:
   - Already have most (React Query, Radix UI)
   - Add: `recharts`, `vaul`, `sonner` (if missing)

---

### Stage 2: Feed Page (Priority #1) (3-4 hours)
**Goal:** Get Feed working with real data first

**Tasks:**
1. **Replace mock data with API call:**
   ```tsx
   // In app/feed/page.tsx
   import { useQuery } from '@tanstack/react-query'
   
   const { data: trades } = useQuery({
     queryKey: ['feed'],
     queryFn: async () => {
       const res = await fetch('/api/feed')
       return res.json()
     }
   })
   ```

2. **Add authentication:**
   ```tsx
   import { createClient } from '@/lib/supabase/client'
   
   const { data: user } = useQuery({
     queryKey: ['user'],
     queryFn: async () => {
       const supabase = createClient()
       const { data } = await supabase.auth.getUser()
       return data.user
     }
   })
   ```

3. **Wire up TradeCard:**
   - Add real `onCopy` handler → opens copy trade modal
   - Add trader profile link → navigate to `/trader/[wallet]`
   - Add PolyScore drawer (premium feature)
   - Add category badges
   - Add current price fetching

4. **Add missing features:**
   - Real-time polling (every 30s)
   - Infinite scroll / Load more
   - Empty state when no follows
   - Loading skeletons

---

### Stage 3: Bots Dashboard (Priority #2) (4-5 hours)
**Goal:** Connect to your FT/LT strategy system

**Tasks:**
1. **Fetch real bot data:**
   ```tsx
   // My Bots = LT Strategies (active)
   const { data: myBots } = useQuery({
     queryKey: ['lt-strategies'],
     queryFn: async () => {
       const res = await fetch('/api/lt/strategies')
       return res.json()
     }
   })
   
   // Available Bots = FT Wallets
   const { data: availableBots } = useQuery({
     queryKey: ['ft-wallets'],
     queryFn: async () => {
       const res = await fetch('/api/ft/wallets')
       return res.json()
     }
   })
   ```

2. **Wire up bot activation:**
   ```tsx
   const activateBot = async (ftWalletId: string) => {
     const res = await fetch('/api/lt/strategies', {
       method: 'POST',
       body: JSON.stringify({
         ft_wallet_id: ftWalletId,
         initial_capital: 1000,
       })
     })
     // Refresh bot list
   }
   ```

3. **Add premium gating:**
   - Free tier: Show only 3 basic bots
   - Premium bots: Show upgrade modal when clicked
   - Premium users: Show all bots

4. **Map FT strategies to friendly names:**
   - Use bot naming framework from brand doc
   - Display clean names instead of `FT_HIGH_CONVICTION`

---

### Stage 4: Discover Page (Priority #3) (2-3 hours)
**Goal:** Connect to trader leaderboard and search

**Tasks:**
1. **Fetch traders:**
   ```tsx
   const { data: traders } = useQuery({
     queryKey: ['traders', category, searchQuery],
     queryFn: async () => {
       const params = new URLSearchParams({ category, search: searchQuery })
       const res = await fetch(`/api/trader/stats?${params}`)
       return res.json()
     }
   })
   ```

2. **Wire up follow/unfollow:**
   ```tsx
   const handleFollow = async (wallet: string) => {
     await fetch('/api/user/follow', {
       method: 'POST',
       body: JSON.stringify({ trader_wallet: wallet })
     })
   }
   ```

3. **Add search functionality:**
   - Debounce search input (300ms)
   - Search by trader name or wallet

4. **Add sort/filter options:**
   - Sort by: PnL, Win Rate, Volume, ROI
   - Filter by category

---

### Stage 5: Trader Profile (Priority #4) (3-4 hours)
**Goal:** Show detailed trader stats and history

**Tasks:**
1. **Fetch trader data:**
   ```tsx
   const { data: trader } = useQuery({
     queryKey: ['trader', wallet],
     queryFn: async () => {
       const res = await fetch(`/api/trader/${wallet}`)
       return res.json()
     }
   })
   
   const { data: trades } = useQuery({
     queryKey: ['trader-trades', wallet],
     queryFn: async () => {
       const res = await fetch(`/api/trader/${wallet}/trades`)
       return res.json()
     }
   })
   ```

2. **Add share functionality:**
   - Generate OG image for trader (share card)
   - Copy link button
   - Social sharing

3. **Wire up follow button:**
   - Check current follow status
   - Handle follow/unfollow
   - Update UI optimistically

---

### Stage 6: Portfolio Page (Priority #5) (4-5 hours)
**Goal:** Show real positions and order history

**Tasks:**
1. **Fetch portfolio data:**
   ```tsx
   const { data: portfolio } = useQuery({
     queryKey: ['portfolio'],
     queryFn: async () => {
       const res = await fetch('/api/portfolio')
       return res.json()
     },
     refetchInterval: 30000, // Every 30s
   })
   
   const { data: orders } = useQuery({
     queryKey: ['orders'],
     queryFn: async () => {
       const res = await fetch('/api/orders')
       return res.json()
     }
   })
   ```

2. **Add close position functionality:**
   ```tsx
   const closePosition = async (conditionId: string) => {
     await fetch('/api/polymarket/positions/close', {
       method: 'POST',
       body: JSON.stringify({ condition_id: conditionId })
     })
   }
   ```

3. **Show bot positions separately:**
   - Distinguish manual copy trades from bot trades
   - Link bot positions to specific strategies

4. **Add real PnL calculations:**
   - Fetch current prices
   - Calculate unrealized PnL
   - Show realized PnL from closed positions

---

### Stage 7: Landing Page (NEW) (2-3 hours)
**Goal:** Build new home page with Industrial Block aesthetic

**Tasks:**
1. **Hero section:**
   - Big headline: "The Home for Copy Trading on Polymarket"
   - Subheadline
   - CTA buttons (Sign Up, Learn More)
   - Hero visual (use brand assets)

2. **Value props section:**
   - Copy Feed card (with teal accent)
   - Copy Traders card (with indigo accent)
   - Copy Bots card (with coral accent)

3. **Social proof:**
   - User count
   - Total trades copied
   - Top trader stats

4. **Pricing callout:**
   - Free vs Premium comparison
   - CTA to pricing page

5. **Footer:**
   - Links to all pages
   - Social media
   - Legal (Terms, Privacy)

---

### Stage 8: SEO Content Pages (1-2 hours each)
**Goal:** Update existing SEO pages with new design

**Pages to update:**
- `/best-polymarket-traders`
- `/polymarket-trading-strategies`
- `/how-to-copy-trade-polymarket`
- `/sports-prediction-markets`
- `/politics-prediction-markets`
- `/crypto-prediction-markets`

**Approach:**
1. Keep existing content (already SEO-optimized)
2. Apply new design system styling
3. Update components to use v0's components
4. Add CTAs with new button styles

---

## 📋 Detailed TODO List

### 🔥 CRITICAL (Must Do First)

- [ ] **1.1** Copy `globals.css` design system → Merge into your project
- [ ] **1.2** Update `tailwind.config.ts` with Polycopy brand colors
- [ ] **1.3** Update `app/layout.tsx` with Space Grotesk + DM Sans fonts
- [ ] **1.4** Copy all `components/polycopy/*` into your project
- [ ] **1.5** Copy all `components/ui/*` shadcn components
- [ ] **1.6** Install missing dependencies: `pnpm add recharts vaul sonner`

### 🎯 HIGH PRIORITY (Core Features)

**Feed Page:**
- [ ] **2.1** Replace mock data with `/api/feed` call
- [ ] **2.2** Add Supabase auth user check
- [ ] **2.3** Wire up "Copy Trade" button → open copy modal
- [ ] **2.4** Add trader profile links (click avatar/name)
- [ ] **2.5** Add category badges to trade cards
- [ ] **2.6** Add PolyScore drawer (premium feature)
- [ ] **2.7** Add current price fetching
- [ ] **2.8** Add real-time polling (30s interval)
- [ ] **2.9** Add infinite scroll / pagination
- [ ] **2.10** Add empty state when no follows
- [ ] **2.11** Add loading skeletons

**Bots Dashboard:**
- [ ] **3.1** Fetch LT strategies from `/api/lt/strategies`
- [ ] **3.2** Fetch FT wallets from `/api/ft/wallets`
- [ ] **3.3** Map FT strategy IDs to friendly bot names
- [ ] **3.4** Wire up bot activation → POST `/api/lt/strategies`
- [ ] **3.5** Wire up pause/resume bot
- [ ] **3.6** Add premium gating (free = 3 bots only)
- [ ] **3.7** Add upgrade modal for premium bots
- [ ] **3.8** Calculate summary stats from real data
- [ ] **3.9** Add bot configuration drawer

**Discover Page:**
- [ ] **4.1** Fetch traders from `/api/trader/stats`
- [ ] **4.2** Add search functionality (debounced)
- [ ] **4.3** Wire up follow/unfollow → POST `/api/user/follow`
- [ ] **4.4** Add sort options (PnL, Win Rate, Volume, ROI)
- [ ] **4.5** Add category filtering
- [ ] **4.6** Add pagination / load more
- [ ] **4.7** Link trader cards to profile pages

**Trader Profile:**
- [ ] **5.1** Fetch trader data from `/api/trader/[wallet]`
- [ ] **5.2** Fetch trader trades from `/api/trader/[wallet]/trades`
- [ ] **5.3** Wire up follow button
- [ ] **5.4** Add share button (generate OG image)
- [ ] **5.5** Add performance chart with real data
- [ ] **5.6** Add category breakdown
- [ ] **5.7** Add "Copy Last Trade" functionality
- [ ] **5.8** Add trade history with real trades

**Portfolio Page:**
- [ ] **6.1** Fetch portfolio from `/api/portfolio`
- [ ] **6.2** Fetch orders from `/api/orders`
- [ ] **6.3** Wire up "Close Position" button
- [ ] **6.4** Add real PnL calculations
- [ ] **6.5** Distinguish bot trades from manual trades
- [ ] **6.6** Add real-time price updates (30s polling)
- [ ] **6.7** Add order history filtering
- [ ] **6.8** Add portfolio sharing (OG image)

### ⚡ MEDIUM PRIORITY (New Pages)

**Landing Page:**
- [ ] **7.1** Create `app/page.tsx` (new home page)
- [ ] **7.2** Build hero section with Industrial Block style
- [ ] **7.3** Build value props section (Feed, Traders, Bots)
- [ ] **7.4** Add social proof section
- [ ] **7.5** Add pricing callout
- [ ] **7.6** Add footer with links
- [ ] **7.7** Make fully responsive

**SEO Content Pages:**
- [ ] **8.1** Update `/best-polymarket-traders` with new design
- [ ] **8.2** Update `/polymarket-trading-strategies` with new design
- [ ] **8.3** Update `/how-to-copy-trade-polymarket` with new design
- [ ] **8.4** Update `/sports-prediction-markets` with new design
- [ ] **8.5** Update `/politics-prediction-markets` with new design
- [ ] **8.6** Update `/crypto-prediction-markets` with new design

### 🎨 LOW PRIORITY (Polish)

**Missing Features:**
- [ ] **9.1** Add "I Wish I Copied That" button to trade cards
- [ ] **9.2** Add notifications bell functionality
- [ ] **9.3** Add user settings page
- [ ] **9.4** Add wallet connection modal
- [ ] **9.5** Add upgrade modal with Stripe checkout
- [ ] **9.6** Add error boundaries
- [ ] **9.7** Add toast notifications (Sonner)
- [ ] **9.8** Add loading transitions between pages
- [ ] **9.9** Add keyboard shortcuts
- [ ] **9.10** Add accessibility improvements

**Share Cards (OG Images):**
- [ ] **10.1** Build portfolio share card generator
- [ ] **10.2** Build trader profile share card generator
- [ ] **10.3** Add share functionality throughout

---

## 🚀 Implementation Order (Recommended)

### Week 1: Core Pages
**Day 1-2: Foundation + Feed**
- [ ] Copy design system files
- [ ] Integrate Feed page with real data
- [ ] Wire up copy trade functionality

**Day 3: Bots Dashboard**
- [ ] Connect to FT/LT APIs
- [ ] Wire up bot activation
- [ ] Add premium gating

**Day 4: Discover + Trader Profile**
- [ ] Connect Discover to trader API
- [ ] Build out Trader Profile with real data

**Day 5: Portfolio**
- [ ] Connect to portfolio/orders API
- [ ] Wire up close position
- [ ] Add real PnL calculations

### Week 2: New Pages + Polish
**Day 6-7: Landing Page + SEO**
- [ ] Build new home page
- [ ] Update all SEO content pages

**Day 8-9: Polish + Testing**
- [ ] Add missing features
- [ ] Test all functionality
- [ ] Fix bugs
- [ ] Mobile testing

**Day 10: Launch Prep**
- [ ] Final QA
- [ ] Performance optimization
- [ ] Create deployment plan
- [ ] Backup current site

---

## 🛠️ Technical Notes

### File Structure
```
app/
├── feed/
│   └── page.tsx (v0's version → integrate with real data)
├── bots/
│   └── page.tsx (v0's version → integrate with real data)
├── discover/
│   └── page.tsx (v0's version → integrate with real data)
├── trader/
│   └── [wallet]/
│       └── page.tsx (v0's version → integrate with real data)
├── portfolio/
│   └── page.tsx (v0's version → integrate with real data)
├── page.tsx (NEW - landing page to build)
├── layout.tsx (update with new fonts)
└── globals.css (merge v0's design system)

components/
├── polycopy/ (v0's components)
│   ├── trade-card.tsx
│   ├── trader-card.tsx
│   ├── bot-card.tsx
│   ├── bottom-nav.tsx
│   ├── top-nav.tsx
│   ├── logo.tsx
│   └── ...
└── ui/ (shadcn components)
    └── ... (all Radix UI primitives)
```

### Key Dependencies Already in Your Project
- ✅ Next.js 16
- ✅ React 19
- ✅ React Query
- ✅ Radix UI components
- ✅ Supabase
- ✅ Stripe

### New Dependencies Needed
```bash
pnpm add recharts vaul sonner
```

### Migration Strategy

**Option A: Gradual (Recommended)**
1. Keep old pages live
2. Build v0 pages at new routes (e.g., `/v2/feed`)
3. Test thoroughly
4. Switch routes when ready
5. Remove old pages

**Option B: Big Bang**
1. Create feature branch
2. Replace all pages at once
3. Test extensively
4. Deploy all at once

**Recommendation:** Option A (gradual) is safer

---

## 💡 Quick Wins (Do These First)

### 1. Design System Setup (30 min)
Just copy the CSS and see the new aesthetic immediately:
- Copy `globals.css`
- Update `tailwind.config.ts`
- Update fonts in `layout.tsx`

### 2. Feed Page (2 hours)
Replace mock data with real API call - this will show immediate progress:
- Wire up `/api/feed`
- Test with real trades
- See new design with real data

### 3. Bot Activation (1 hour)
Wire up one button to see backend working:
- Connect "Activate Bot" button
- POST to `/api/lt/strategies`
- Show success state

---

## ❓ Questions for You

Before I start integrating, please confirm:

1. **Which page should I tackle first?**
   - My recommendation: Feed page (most important)
   
2. **Do you want to test v0's pages in isolation first?**
   - Create `/v2/*` routes to test before replacing?
   
3. **Any deadline pressure?**
   - How fast do you need this done?
   
4. **Should I preserve old pages during migration?**
   - Keep them as backup?

5. **Any specific features to prioritize?**
   - What's most important to you?

---

## 🎯 Ready to Start?

Let me know which task from the TODO list you want me to start with, and I'll begin implementing immediately!

**My recommendation: Start with "Quick Win #1" (Design System Setup) to see immediate visual progress, then move to Feed page.**

---

**End of Integration Plan**

*Last updated: February 14, 2026*