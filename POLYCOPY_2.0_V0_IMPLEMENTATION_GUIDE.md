# Polycopy 2.0 - v0 Implementation Guide
**Complete UI/UX Specification for React Component Generation**  
Version 2.0 • February 2026

---

## Table of Contents
1. [Brand System Overview](#brand-system-overview)
2. [Technical Stack & Requirements](#technical-stack--requirements)
3. [Design System Foundations](#design-system-foundations)
4. [Component Library Specifications](#component-library-specifications)
5. [Page-by-Page Implementation](#page-by-page-implementation)
6. [Data Integration & API Mapping](#data-integration--api-mapping)
7. [Responsive Behavior](#responsive-behavior)
8. [Implementation Instructions for v0](#implementation-instructions-for-v0)

---

## Brand System Overview

### The Industrial Block Identity

Polycopy 2.0 introduces **"The Industrial Block"** - a bold, technical brand identity inspired by institutional financial terminals. This system emphasizes:

- **Authority & Precision:** Sharp corners, bold typography, high-contrast layouts
- **Technical Excellence:** Data-rich interfaces with clear hierarchy
- **Professional Approachability:** Friendly but serious about performance
- **Mobile-First:** Designed for on-the-go trading

### Core Brand Elements

**Logo System:**
- Primary: "POLY" (yellow) + "COPY" (black) split wordmark
- Icon: "P" lettermark in yellow square
- Style: Sharp corners, uppercase, bold geometric forms

**Brand Personality:**
- "Precision Meets Performance"
- Institutional-grade but accessible
- Data-driven decision making
- Copy trading command center

---

## Technical Stack & Requirements

### Current Tech Stack (Must Maintain Compatibility)

```javascript
// Framework & Runtime
Next.js 16 (App Router)
React 19.2.3
TypeScript 5.9.3

// Styling
Tailwind CSS 4
CSS Variables for theming

// UI Components
Radix UI primitives (@radix-ui/*)
Custom components built on Radix

// Icons
Lucide React

// State Management
React Query (@tanstack/react-query)
React hooks

// Database & Backend
Supabase (PostgreSQL)
Next.js API Routes

// External APIs
Polymarket CLOB API
Turnkey (wallet management)
```

### Design System Requirements

**CSS Variable System:**
All colors, spacing, and typography must be defined as CSS variables for easy theming and consistency.

**Component Philosophy:**
- Build on Radix UI primitives where possible
- Mobile-first responsive design
- Accessibility (WCAG AA minimum)
- Performance-optimized (lazy loading, code splitting)

---

## Design System Foundations

### 1. Color System

#### CSS Variables (from `variables.css`)

```css
:root {
  /* Brand Foundation */
  --poly-yellow: #FDB022;
  --poly-black: #0F0F0F;
  --poly-cream: #F9F8F1;
  
  /* Brand Accents */
  --poly-indigo: #4F46E5;
  --poly-teal: #0D9488;
  --poly-coral: #E07A5F;
  
  /* Neutrals (extend existing gray scale) */
  --poly-paper: #FFFFFF;
  --neutral-grey: #9CA3AF;
  
  /* Data Visualization (keep existing) */
  --profit-green: #10B981;
  --loss-red: #EF4444;
  --info-blue: #3B82F6;
  
  /* UI Grays (keep existing scale) */
  --gray-50: #F9FAFB;
  --gray-100: #F3F4F6;
  --gray-200: #E5E7EB;
  --gray-300: #D1D5DB;
  --gray-400: #9CA3AF;
  --gray-500: #6B7280;
  --gray-600: #4B5563;
  --gray-700: #374151;
  --gray-800: #1F2937;
  --gray-900: #111827;
}
```

#### Tailwind Config Extension

```javascript
// tailwind.config.js additions
module.exports = {
  theme: {
    extend: {
      colors: {
        'poly': {
          yellow: '#FDB022',
          black: '#0F0F0F',
          cream: '#F9F8F1',
          indigo: '#4F46E5',
          teal: '#0D9488',
          coral: '#E07A5F',
        }
      }
    }
  }
}
```

#### Color Usage Guidelines

**Primary Yellow (`#FDB022`):**
- Primary CTAs and buttons
- Active states
- Brand moments (logo, badges)
- Key highlights
- **Usage:** 5-10% of interface

**Brand Accents:**
- **Indigo (`#4F46E5`):** Trust, stability features (Copy Traders section)
- **Teal (`#0D9488`):** Growth, precision (Copy Feed section)  
- **Coral (`#E07A5F`):** Energy, signals (Copy Bots section)
- **Usage:** 15-20% of interface for section differentiation

**Neutrals:**
- **Poly Cream (`#F9F8F1`):** Primary backgrounds (light mode)
- **Poly Black (`#0F0F0F`):** Text, dark mode backgrounds
- **Paper White (`#FFFFFF`):** Card backgrounds
- **Usage:** 60-70% of interface

**Data Colors (Never Decorative):**
- Green: Profit, positive, wins
- Red: Loss, negative, losses
- Blue: Informational, neutral data

### 2. Typography System

#### Font Stack

```css
:root {
  --font-display: 'Space Grotesk', -apple-system, sans-serif;
  --font-body: 'DM Sans', -apple-system, sans-serif;
}
```

**Space Grotesk:** Headlines, display text, buttons (bold, uppercase)  
**DM Sans:** Body text, UI labels, descriptions (clean, readable)

#### Type Scale

```css
/* Display (Space Grotesk) */
.text-display-xl { font-size: 64px; font-weight: 700; line-height: 1.1; } /* Hero */
.text-display-lg { font-size: 48px; font-weight: 700; line-height: 1.1; } /* Landing */
.text-display { font-size: 40px; font-weight: 700; line-height: 1.2; } /* Major headers */

/* Headings (Space Grotesk) */
.text-h1 { font-size: 36px; font-weight: 700; line-height: 1.2; } /* Page titles */
.text-h2 { font-size: 30px; font-weight: 700; line-height: 1.3; } /* Section headers */
.text-h3 { font-size: 24px; font-weight: 600; line-height: 1.3; } /* Card titles */
.text-h4 { font-size: 20px; font-weight: 600; line-height: 1.4; } /* Subsections */

/* Body (DM Sans) */
.text-body-xl { font-size: 20px; font-weight: 400; line-height: 1.6; } /* Lead */
.text-body-lg { font-size: 18px; font-weight: 400; line-height: 1.6; } /* Emphasized */
.text-body { font-size: 16px; font-weight: 400; line-height: 1.6; } /* Default */
.text-body-sm { font-size: 14px; font-weight: 400; line-height: 1.5; } /* Secondary */
.text-caption { font-size: 12px; font-weight: 400; line-height: 1.4; } /* Labels */
.text-micro { font-size: 10px; font-weight: 500; line-height: 1.3; } /* Tiny labels */
```

#### Typography Utilities

**Button Text (Space Grotesk):**
```css
.text-button {
  font-family: var(--font-display);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.2em; /* Wide tracking for authority */
}
```

**Data Display (Tabular Numbers):**
```css
.text-data {
  font-variant-numeric: tabular-nums;
  font-family: var(--font-body);
  font-weight: 600;
}
```

**Mobile Adjustments:**
- Scale down 10-15% on mobile
- Minimum 14px for body text
- Increase line-height by 0.1

### 3. Spacing & Layout

#### Spacing Scale (8px base unit)

```css
:root {
  --space-1: 4px;   /* Tiny gaps */
  --space-2: 8px;   /* Small gaps */
  --space-3: 12px;  /* Base spacing */
  --space-4: 16px;  /* Default */
  --space-6: 24px;  /* Section */
  --space-8: 32px;  /* Major sections */
  --space-12: 48px; /* Page sections */
  --space-16: 64px; /* Hero sections */
}
```

#### Grid System

**Desktop (1280px container):**
- 12 columns
- 24px gutter
- 80px side margins
- Max content width: 1280px

**Mobile (375px viewport):**
- 4 columns (logical)
- 16px gutter
- 16px side margins
- Full-bleed for emphasis elements

#### Border Radius (Sharp Aesthetic)

```css
:root {
  --radius-none: 0px;    /* Preferred for most elements */
  --radius-sm: 2px;      /* Subtle if needed */
  --radius-md: 4px;      /* Maximum for inputs/buttons */
  --radius-lg: 6px;      /* Very rare, only for modals */
}
```

**Default:** 0px (sharp corners)  
**Exception:** Can use 2-4px for buttons/inputs if it improves usability

#### Shadows (Subtle Elevation)

```css
:root {
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.08);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.12);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.16);
}
```

**Usage:**
- Cards: `--shadow-sm`
- Dropdowns: `--shadow-md`
- Modals: `--shadow-lg`

### 4. Iconography

**Icon Library:** Lucide React (current)

**Custom Product Icons** (from `02_Product_Icons/`):
- Classic Squares (overlapping copy symbol)
- Signal Feed (wave/signal icon)
- Bot Intelligence (robot/automation icon)

**Icon Sizing:**
```css
--icon-xs: 16px;  /* Inline text */
--icon-sm: 20px;  /* Buttons */
--icon-md: 24px;  /* Default UI */
--icon-lg: 32px;  /* Feature cards */
--icon-xl: 48px;  /* Hero sections */
```

**Icon Style:**
- 2px stroke weight
- Sharp corners where possible
- Match brand geometric style

---

## Component Library Specifications

### Button System

#### Primary Button (CTA)

```tsx
// Visual Spec
<button className="btn-primary">
  COPY TRADE
</button>

// Styles
.btn-primary {
  background: var(--poly-yellow);
  color: var(--poly-black);
  font-family: var(--font-display);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  border-radius: 0px; /* Sharp corners */
  border: 1px solid rgba(0,0,0,0.1);
  padding: 12px 24px; /* Medium size */
  font-size: 14px;
  cursor: pointer;
  transition: all 150ms ease;
}

.btn-primary:hover {
  background: #E5A01F; /* Slightly darker yellow */
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.btn-primary:active {
  transform: translateY(0);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

#### Secondary Button (Alternative)

```tsx
.btn-secondary {
  background: var(--poly-black);
  color: var(--poly-yellow);
  border: 1px solid var(--poly-yellow);
  /* Same sizing/typography as primary */
}

.btn-secondary:hover {
  background: #1a1a1a;
}
```

#### Ghost Button (Subtle)

```tsx
.btn-ghost {
  background: transparent;
  color: var(--poly-black);
  border: 1px solid var(--gray-300);
}

.btn-ghost:hover {
  background: var(--gray-100);
}
```

#### Button Sizes

```tsx
// Small
.btn-sm {
  padding: 8px 16px;
  font-size: 12px;
  height: 32px;
}

// Medium (default)
.btn-md {
  padding: 12px 24px;
  font-size: 14px;
  height: 40px;
}

// Large
.btn-lg {
  padding: 16px 32px;
  font-size: 16px;
  height: 48px;
}
```

### Card System

#### Base Card (Technical Block)

```tsx
<div className="card-technical">
  {/* Content */}
</div>

// Styles
.card-technical {
  background: var(--poly-paper);
  border: 1px solid rgba(0,0,0,0.05);
  border-radius: 0px; /* Sharp */
  padding: 24px;
  box-shadow: var(--shadow-sm);
}

.card-technical:hover {
  border-color: rgba(0,0,0,0.1);
  box-shadow: var(--shadow-md);
}
```

#### Trade Card (Key Component)

**Structure:**
```
┌─────────────────────────────────┐
│ [Avatar] Trader Name   [Badge]  │ Header
│          @wallet • 2h ago       │
├─────────────────────────────────┤
│ Will Trump Win 2024?            │ Market Title
│ > YES                           │ Token
├─────────────────────────────────┤
│ ┌─────────┬─────────┬─────────┐│
│ │  63.5¢  │ $2.4K  │  2.8x   ││ Metrics
│ │  Entry  │  Size  │  Conv.  ││
│ └─────────┴─────────┴─────────┘│
├─────────────────────────────────┤
│ [🔒 PolyScore: 78] [COPY TRADE] │ Footer
└─────────────────────────────────┘
```

**Implementation:**

```tsx
interface TradeCardProps {
  trade: {
    trader: {
      name: string;
      wallet: string;
      avatar?: string;
      isPremium?: boolean;
    };
    market: {
      title: string;
      token: string;
      condition_id: string;
    };
    entry_price: number;
    size_usd: number;
    conviction: number; // multiplier vs avg
    timestamp: string;
    polyscore?: number; // Premium only
  };
  onCopy: () => void;
  isPremiumUser: boolean;
}

// Component structure
<div className="card-technical trade-card">
  {/* Header */}
  <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-2">
      <Avatar src={trade.trader.avatar} size="sm" />
      <div>
        <p className="text-body-sm font-semibold">{trade.trader.name}</p>
        <p className="text-caption text-gray-500">
          @{trade.trader.wallet.slice(0,6)}... • {formatTime(trade.timestamp)}
        </p>
      </div>
    </div>
    {trade.trader.isPremium && (
      <Badge variant="premium">PREMIUM</Badge>
    )}
  </div>

  {/* Market Info */}
  <div className="mb-4">
    <h3 className="text-h4 mb-1">{trade.market.title}</h3>
    <p className="text-body-sm text-poly-teal font-medium">
      &gt; {trade.market.token}
    </p>
  </div>

  {/* Metrics Grid */}
  <div className="grid grid-cols-3 gap-3 mb-4">
    <div className="text-center">
      <p className="text-data text-2xl">{formatPrice(trade.entry_price)}¢</p>
      <p className="text-caption text-gray-500">Entry</p>
    </div>
    <div className="text-center">
      <p className="text-data text-2xl">{formatUSD(trade.size_usd)}</p>
      <p className="text-caption text-gray-500">Size</p>
    </div>
    <div className="text-center">
      <p className="text-data text-2xl">{trade.conviction.toFixed(1)}x</p>
      <p className="text-caption text-gray-500">Conviction</p>
    </div>
  </div>

  {/* Footer */}
  <div className="flex items-center justify-between">
    {isPremiumUser && trade.polyscore ? (
      <PolyScoreBadge score={trade.polyscore} />
    ) : (
      <LockedFeatureBadge feature="PolyScore" />
    )}
    <Button variant="primary" size="sm" onClick={onCopy}>
      COPY TRADE
    </Button>
  </div>
</div>
```

**Variants:**
- **Compact:** Remove metrics grid, show only entry price inline
- **Expanded:** Add full market description, current price, PnL projection
- **Premium:** Show PolyScore breakdown, AI insights drawer

#### Trader Card

**Structure:**
```
┌─────────────────────────────────┐
│        [Large Avatar]           │
│                                 │
│        Trader Name              │
│        @0x2b4f...               │
├─────────────────────────────────┤
│ ┌──────┬──────┬──────┬──────┐ │
│ │ +$5K │ 67%  │ 234  │ 3.2x │ │
│ │  PnL │  WR  │Trade │ ROI  │ │
│ └──────┴──────┴──────┴──────┘ │
├─────────────────────────────────┤
│      [FOLLOW] [VIEW PROFILE]    │
└─────────────────────────────────┘
```

**Implementation:**

```tsx
interface TraderCardProps {
  trader: {
    wallet: string;
    name?: string;
    avatar?: string;
    stats: {
      pnl: number;
      win_rate: number;
      total_trades: number;
      roi: number;
    };
    isFollowed: boolean;
  };
  onFollow: () => void;
  onViewProfile: () => void;
}

<div className="card-technical trader-card text-center">
  {/* Avatar */}
  <div className="flex justify-center mb-4">
    <Avatar src={trader.avatar} size="xl" />
  </div>

  {/* Name */}
  <h3 className="text-h3 mb-1">{trader.name || 'Anonymous'}</h3>
  <p className="text-body-sm text-gray-500 mb-6">
    @{trader.wallet.slice(0,10)}...
  </p>

  {/* Stats Grid */}
  <div className="grid grid-cols-4 gap-2 mb-6 p-4 bg-poly-cream rounded-sm">
    <div>
      <p className={`text-data text-lg ${trader.stats.pnl >= 0 ? 'text-profit-green' : 'text-loss-red'}`}>
        {formatUSD(trader.stats.pnl)}
      </p>
      <p className="text-caption text-gray-500">PnL</p>
    </div>
    <div>
      <p className="text-data text-lg">{trader.stats.win_rate}%</p>
      <p className="text-caption text-gray-500">Win Rate</p>
    </div>
    <div>
      <p className="text-data text-lg">{trader.stats.total_trades}</p>
      <p className="text-caption text-gray-500">Trades</p>
    </div>
    <div>
      <p className="text-data text-lg">{trader.stats.roi.toFixed(1)}x</p>
      <p className="text-caption text-gray-500">ROI</p>
    </div>
  </div>

  {/* Actions */}
  <div className="flex gap-2">
    <Button 
      variant={trader.isFollowed ? "secondary" : "primary"}
      onClick={onFollow}
      className="flex-1"
    >
      {trader.isFollowed ? "FOLLOWING" : "FOLLOW"}
    </Button>
    <Button variant="ghost" onClick={onViewProfile} className="flex-1">
      VIEW PROFILE
    </Button>
  </div>
</div>
```

#### Strategy Bot Card (NEW)

**Structure:**
```
┌─────────────────────────────────┐
│ [🤖 Icon] Bot Name       [★]    │
│ Aggressive Value Hunter         │
├─────────────────────────────────┤
│    [Performance Sparkline]      │
│         📈 +24.5%              │
├─────────────────────────────────┤
│ ┌──────┬──────┬──────────────┐│
│ │ 67%  │ 234  │ AGGRESSIVE   ││
│ │  WR  │Trade │  Risk Level  ││
│ └──────┴──────┴──────────────┘│
├─────────────────────────────────┤
│      [ACTIVATE BOT] [$30/mo]    │
└─────────────────────────────────┘
```

**Implementation:**

```tsx
interface BotCardProps {
  bot: {
    id: string;
    name: string;
    description: string;
    icon: string;
    performance: {
      return_pct: number;
      win_rate: number;
      total_trades: number;
      sparkline_data: number[]; // 30d performance
    };
    risk_level: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
    is_premium: boolean;
    price_monthly?: number;
    is_active: boolean;
  };
  onActivate: () => void;
  isPremiumUser: boolean;
}

<div className="card-technical bot-card">
  {/* Header */}
  <div className="flex items-center justify-between mb-2">
    <div className="flex items-center gap-2">
      <span className="text-2xl">{bot.icon}</span>
      <div>
        <h3 className="text-h4">{bot.name}</h3>
        {bot.is_premium && <Badge variant="premium-small">PRO</Badge>}
      </div>
    </div>
    <StarIcon className={bot.is_active ? "fill-poly-yellow" : "stroke-gray-400"} />
  </div>
  
  <p className="text-body-sm text-gray-600 mb-4">{bot.description}</p>

  {/* Performance */}
  <div className="mb-4 p-3 bg-poly-cream rounded-sm">
    <Sparkline data={bot.performance.sparkline_data} color={bot.performance.return_pct >= 0 ? 'green' : 'red'} />
    <p className={`text-data text-2xl text-center mt-2 ${bot.performance.return_pct >= 0 ? 'text-profit-green' : 'text-loss-red'}`}>
      {bot.performance.return_pct >= 0 ? '+' : ''}{bot.performance.return_pct}%
    </p>
    <p className="text-caption text-gray-500 text-center">30-Day Performance</p>
  </div>

  {/* Stats */}
  <div className="grid grid-cols-3 gap-2 mb-4">
    <div className="text-center">
      <p className="text-data text-lg">{bot.performance.win_rate}%</p>
      <p className="text-caption text-gray-500">Win Rate</p>
    </div>
    <div className="text-center">
      <p className="text-data text-lg">{bot.performance.total_trades}</p>
      <p className="text-caption text-gray-500">Trades</p>
    </div>
    <div className="text-center">
      <RiskBadge level={bot.risk_level} />
    </div>
  </div>

  {/* Action */}
  {bot.is_premium && !isPremiumUser ? (
    <Button variant="primary" className="w-full" onClick={() => showUpgradeModal()}>
      UPGRADE TO UNLOCK
    </Button>
  ) : (
    <Button 
      variant={bot.is_active ? "secondary" : "primary"}
      className="w-full"
      onClick={onActivate}
    >
      {bot.is_active ? "PAUSE BOT" : `ACTIVATE BOT${bot.price_monthly ? ` • $${bot.price_monthly}/mo` : ''}`}
    </Button>
  )}
</div>
```

### Navigation Components

#### Top Navigation (Desktop)

```tsx
<nav className="top-nav">
  <div className="container mx-auto px-8 h-16 flex items-center justify-between">
    {/* Logo */}
    <Logo variant="horizontal" />
    
    {/* Primary Nav */}
    <div className="flex items-center gap-6">
      <NavLink href="/feed">FEED</NavLink>
      <NavLink href="/discover">DISCOVER</NavLink>
      <NavLink href="/bots">BOTS</NavLink>
      <NavLink href="/portfolio">PORTFOLIO</NavLink>
    </div>

    {/* User Menu */}
    <UserMenu />
  </div>
</nav>

// Styles
.top-nav {
  background: var(--poly-paper);
  border-bottom: 1px solid var(--gray-200);
  position: sticky;
  top: 0;
  z-index: 50;
}

.nav-link {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--poly-black);
  text-decoration: none;
  padding: 8px 12px;
  border-radius: 2px;
  transition: all 150ms ease;
}

.nav-link:hover {
  background: var(--poly-cream);
}

.nav-link.active {
  background: var(--poly-yellow);
  color: var(--poly-black);
}
```

#### Bottom Navigation (Mobile)

```tsx
<nav className="bottom-nav">
  <NavItem href="/feed" icon={<SignalIcon />} label="FEED" />
  <NavItem href="/discover" icon={<UsersIcon />} label="DISCOVER" />
  <NavItem href="/bots" icon={<BotIcon />} label="BOTS" />
  <NavItem href="/profile" icon={<UserIcon />} label="PROFILE" />
</nav>

// Styles
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  background: var(--poly-paper);
  border-top: 1px solid var(--gray-200);
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding-bottom: env(safe-area-inset-bottom); /* iOS safe area */
  z-index: 50;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  text-decoration: none;
  color: var(--gray-500);
  transition: all 150ms ease;
}

.nav-item.active {
  color: var(--poly-yellow);
}

.nav-item svg {
  width: 24px;
  height: 24px;
}

.nav-item span {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

### Form Components

#### Input Field

```tsx
<div className="form-group">
  <label className="form-label">Trade Amount</label>
  <input 
    type="text"
    className="form-input"
    placeholder="Enter amount..."
  />
  <p className="form-hint">Minimum $10</p>
</div>

// Styles
.form-label {
  display: block;
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--poly-black);
  margin-bottom: 8px;
}

.form-input {
  width: 100%;
  height: 48px;
  padding: 12px 16px;
  font-family: var(--font-body);
  font-size: 16px; /* Prevent iOS zoom */
  border: 1px solid var(--gray-300);
  border-radius: 2px;
  background: var(--poly-paper);
  transition: all 150ms ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--poly-yellow);
  border-width: 2px;
  box-shadow: 0 0 0 3px rgba(253, 176, 34, 0.1);
}

.form-input:disabled {
  background: var(--gray-100);
  color: var(--gray-500);
  cursor: not-allowed;
}

.form-input.error {
  border-color: var(--loss-red);
}

.form-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--gray-500);
}

.form-error {
  margin-top: 4px;
  font-size: 12px;
  color: var(--loss-red);
}
```

#### Toggle Switch

```tsx
<Toggle
  checked={isActive}
  onCheckedChange={setIsActive}
  label="Auto-copy enabled"
/>

// Using Radix UI Switch
import * as Switch from '@radix-ui/react-switch';

<div className="flex items-center justify-between">
  <span className="text-body-sm">{label}</span>
  <Switch.Root className="switch-root" checked={checked} onCheckedChange={onCheckedChange}>
    <Switch.Thumb className="switch-thumb" />
  </Switch.Root>
</div>

// Styles
.switch-root {
  width: 44px;
  height: 24px;
  background: var(--gray-300);
  border-radius: 12px;
  position: relative;
  transition: background 150ms ease;
  cursor: pointer;
}

.switch-root[data-state="checked"] {
  background: var(--poly-yellow);
}

.switch-thumb {
  display: block;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 10px;
  transition: transform 150ms ease;
  transform: translateX(2px);
}

.switch-root[data-state="checked"] .switch-thumb {
  transform: translateX(22px);
}
```

### Modal & Drawer Components

#### Modal (Desktop)

```tsx
import * as Dialog from '@radix-ui/react-dialog';

<Dialog.Root>
  <Dialog.Trigger asChild>
    <Button>OPEN SETTINGS</Button>
  </Dialog.Trigger>
  
  <Dialog.Portal>
    <Dialog.Overlay className="modal-overlay" />
    <Dialog.Content className="modal-content">
      <Dialog.Title className="modal-title">
        SETTINGS
      </Dialog.Title>
      
      <Dialog.Description className="modal-description">
        Configure your trading preferences.
      </Dialog.Description>

      {/* Modal body */}
      <div className="modal-body">
        {children}
      </div>

      <div className="modal-footer">
        <Dialog.Close asChild>
          <Button variant="ghost">CANCEL</Button>
        </Dialog.Close>
        <Button variant="primary">SAVE</Button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

// Styles
.modal-overlay {
  background: rgba(0, 0, 0, 0.6);
  position: fixed;
  inset: 0;
  z-index: 100;
  animation: fadeIn 200ms ease;
}

.modal-content {
  background: var(--poly-paper);
  border-radius: 4px;
  box-shadow: var(--shadow-lg);
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 90vw;
  max-width: 540px;
  max-height: 85vh;
  padding: 32px;
  z-index: 101;
  animation: slideUp 250ms ease;
}

.modal-title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 8px;
}

.modal-description {
  font-size: 14px;
  color: var(--gray-600);
  margin-bottom: 24px;
}

.modal-body {
  margin-bottom: 24px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { 
    opacity: 0;
    transform: translate(-50%, -48%);
  }
  to { 
    opacity: 1;
    transform: translate(-50%, -50%);
  }
}
```

#### Drawer (Mobile)

```tsx
<Sheet>
  <SheetTrigger asChild>
    <Button>VIEW DETAILS</Button>
  </SheetTrigger>
  
  <SheetContent side="bottom" className="drawer-content">
    <SheetHandle />
    
    <SheetTitle className="drawer-title">
      TRADE DETAILS
    </SheetTitle>

    <div className="drawer-body">
      {children}
    </div>
  </SheetContent>
</Sheet>

// Styles
.drawer-content {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--poly-paper);
  border-top-left-radius: 12px;
  border-top-right-radius: 12px;
  max-height: 90vh;
  padding: 24px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
  z-index: 101;
  animation: slideUpMobile 250ms ease;
}

.sheet-handle {
  width: 32px;
  height: 4px;
  background: var(--gray-300);
  border-radius: 2px;
  margin: 0 auto 16px;
}

@keyframes slideUpMobile {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
```

### Badge Components

#### Premium Badge

```tsx
<Badge variant="premium">
  <StarIcon className="w-3 h-3" />
  PREMIUM
</Badge>

// Styles
.badge-premium {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: linear-gradient(135deg, #FDB022 0%, #E5A01F 100%);
  color: var(--poly-black);
  font-family: var(--font-display);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  border-radius: 2px;
}
```

#### PolyScore Badge

```tsx
<PolyScoreBadge score={78} />

// Component
const PolyScoreBadge = ({ score }: { score: number }) => {
  const getScoreColor = (score: number) => {
    if (score >= 75) return 'profit-green';
    if (score >= 60) return 'poly-yellow';
    if (score >= 45) return 'neutral-grey';
    return 'loss-red';
  };

  return (
    <div className={`polyscore-badge bg-${getScoreColor(score)}/10 border-${getScoreColor(score)}`}>
      <SparklesIcon className={`w-4 h-4 text-${getScoreColor(score)}`} />
      <span className={`text-${getScoreColor(score)}`}>
        PolyScore: {score}
      </span>
    </div>
  );
};

// Styles
.polyscore-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid;
  border-radius: 2px;
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

#### Locked Feature Badge

```tsx
<LockedFeatureBadge feature="PolyScore" />

// Component
<div className="locked-badge" onClick={showUpgradeModal}>
  <LockIcon className="w-4 h-4" />
  <span>{feature}</span>
  <ChevronRightIcon className="w-3 h-3" />
</div>

// Styles
.locked-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--gray-100);
  border: 1px solid var(--gray-300);
  border-radius: 2px;
  color: var(--gray-600);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 150ms ease;
}

.locked-badge:hover {
  background: var(--gray-200);
  border-color: var(--poly-yellow);
}
```

---

## Page-by-Page Implementation

### Page 1: Feed (`/feed`)

**Purpose:** Real-time personalized feed of followed traders' trades

**Layout Structure (Mobile):**
```
┌─────────────────────────────────┐
│  [Logo]              [Filters]  │ Header (64px)
├─────────────────────────────────┤
│                                 │
│   [Trade Card]                  │
│                                 │
│   [Trade Card]                  │ Scrollable Feed
│                                 │
│   [Trade Card]                  │
│                                 │
├─────────────────────────────────┤
│ [Feed][Discover][Bots][Profile] │ Bottom Nav (64px)
└─────────────────────────────────┘
```

**Implementation:**

```tsx
// app/feed/page.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { TradeCard } from '@/components/polycopy/TradeCard';
import { FilterBar } from '@/components/polycopy/FilterBar';
import { BottomNav } from '@/components/polycopy/BottomNav';

export default function FeedPage() {
  const { data: trades, isLoading } = useQuery({
    queryKey: ['feed'],
    queryFn: fetchFeed,
  });

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: fetchCurrentUser,
  });

  return (
    <div className="min-h-screen bg-poly-cream pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-poly-paper border-b border-gray-200 px-4 h-16 flex items-center justify-between">
        <Logo variant="horizontal" size="sm" />
        <FilterBar />
      </header>

      {/* Feed */}
      <main className="container max-w-2xl mx-auto px-4 py-6">
        {isLoading ? (
          <LoadingSkeleton count={3} />
        ) : trades?.length === 0 ? (
          <EmptyFeed />
        ) : (
          <div className="space-y-4">
            {trades?.map((trade) => (
              <TradeCard
                key={trade.id}
                trade={trade}
                onCopy={() => handleCopyTrade(trade)}
                isPremiumUser={user?.is_premium || false}
              />
            ))}
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <BottomNav active="feed" />
    </div>
  );
}
```

**Desktop Adaptations:**
- Max width: 640px centered
- Add top navigation instead of bottom
- Side filters panel (optional)
- 3 trades visible at once

**Key Features:**
- Infinite scroll / Load more
- Pull-to-refresh (mobile)
- Real-time updates via polling or websocket
- Filter by: All, Sports, Politics, Crypto
- Sort by: Recent, PolyScore (premium)

**API Integration:**
```typescript
// Fetch from existing feed API
async function fetchFeed() {
  const res = await fetch('/api/feed', {
    headers: { 'Content-Type': 'application/json' },
  });
  return res.json();
}
```

---

### Page 2: Discover (`/discover`)

**Purpose:** Browse and search for top traders to follow

**Layout Structure (Mobile):**
```
┌─────────────────────────────────┐
│  [Search Bar]                   │ Search (56px)
├─────────────────────────────────┤
│ [All][Sports][Politics][Crypto] │ Category Tabs (48px)
├─────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐      │
│ │ Trader 1 │ │ Trader 2 │      │ Grid Layout
│ └──────────┘ └──────────┘      │ (2 columns)
│ ┌──────────┐ ┌──────────┐      │
│ │ Trader 3 │ │ Trader 4 │      │
│ └──────────┘ └──────────┘      │
├─────────────────────────────────┤
│ [Feed][Discover][Bots][Profile] │ Bottom Nav
└─────────────────────────────────┘
```

**Implementation:**

```tsx
// app/discover/page.tsx
'use client';

export default function DiscoverPage() {
  const [category, setCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: traders } = useQuery({
    queryKey: ['traders', category, searchQuery],
    queryFn: () => fetchTraders({ category, search: searchQuery }),
  });

  return (
    <div className="min-h-screen bg-poly-cream pb-20">
      {/* Search Header */}
      <header className="sticky top-0 z-40 bg-poly-paper border-b border-gray-200 p-4">
        <SearchInput
          placeholder="Search traders..."
          value={searchQuery}
          onChange={setSearchQuery}
        />
      </header>

      {/* Category Tabs */}
      <div className="sticky top-[72px] z-30 bg-poly-paper border-b border-gray-200 px-4 py-2">
        <CategoryTabs active={category} onChange={setCategory} />
      </div>

      {/* Trader Grid */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {traders?.map((trader) => (
            <TraderCard
              key={trader.wallet}
              trader={trader}
              onFollow={() => handleFollow(trader.wallet)}
              onViewProfile={() => router.push(`/trader/${trader.wallet}`)}
            />
          ))}
        </div>
      </main>

      <BottomNav active="discover" />
    </div>
  );
}
```

**Desktop Adaptations:**
- 3-4 columns
- Sidebar with filters (Win rate, ROI, Category)
- Leaderboard view option

**Key Features:**
- Search by name or wallet
- Filter by category
- Sort by: PnL, Win Rate, ROI, Volume
- Leaderboard rankings
- Follow/unfollow inline

**API Integration:**
```typescript
async function fetchTraders({ category, search }) {
  const params = new URLSearchParams({ category, search });
  const res = await fetch(`/api/trader/stats?${params}`);
  return res.json();
}
```

---

### Page 3: Strategy Bots Dashboard (`/bots`)

**Purpose:** Browse, activate, and manage copy trading bots

**Layout Structure (Mobile):**
```
┌─────────────────────────────────┐
│ COPY BOTS                       │ Header
│ Automate your copy trading      │
├─────────────────────────────────┤
│ ┌─────────┬─────────┬─────────┐│
│ │ $12.4K  │   3     │  +18%   ││ Summary Stats
│ │  Total  │ Active  │  30d    ││
│ └─────────┴─────────┴─────────┘│
├─────────────────────────────────┤
│ [My Bots] [Available]           │ Tabs
├─────────────────────────────────┤
│                                 │
│   [Strategy Bot Card]           │
│                                 │
│   [Strategy Bot Card]           │ Bot List
│                                 │
│   [Strategy Bot Card]           │
│                                 │
├─────────────────────────────────┤
│ [Feed][Discover][Bots][Profile] │ Bottom Nav
└─────────────────────────────────┘
```

**Implementation:**

```tsx
// app/bots/page.tsx
'use client';

export default function BotsPage() {
  const [activeTab, setActiveTab] = useState<'my-bots' | 'available'>('my-bots');

  const { data: myBots } = useQuery({
    queryKey: ['lt-strategies'],
    queryFn: fetchMyBots,
  });

  const { data: availableBots } = useQuery({
    queryKey: ['ft-wallets'],
    queryFn: fetchAvailableBots,
  });

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: fetchCurrentUser,
  });

  // Calculate summary stats
  const totalValue = myBots?.reduce((sum, bot) => sum + bot.available_cash, 0) || 0;
  const activeBots = myBots?.filter(b => b.is_active && !b.is_paused).length || 0;
  const thirtyDayReturn = calculateReturn(myBots);

  return (
    <div className="min-h-screen bg-poly-cream pb-20">
      {/* Header */}
      <header className="bg-poly-coral px-4 py-8 text-poly-paper">
        <h1 className="text-h1 mb-2">COPY BOTS</h1>
        <p className="text-body">Automate your copy trading with AI-powered strategies</p>
      </header>

      {/* Summary Stats */}
      <section className="px-4 -mt-6">
        <div className="card-technical grid grid-cols-3 gap-4 p-6">
          <div className="text-center">
            <p className="text-data text-2xl">{formatUSD(totalValue)}</p>
            <p className="text-caption text-gray-500">Total Invested</p>
          </div>
          <div className="text-center">
            <p className="text-data text-2xl">{activeBots}</p>
            <p className="text-caption text-gray-500">Active Bots</p>
          </div>
          <div className="text-center">
            <p className={`text-data text-2xl ${thirtyDayReturn >= 0 ? 'text-profit-green' : 'text-loss-red'}`}>
              {thirtyDayReturn >= 0 ? '+' : ''}{thirtyDayReturn}%
            </p>
            <p className="text-caption text-gray-500">30d Return</p>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="my-bots">MY BOTS</TabsTrigger>
            <TabsTrigger value="available">AVAILABLE</TabsTrigger>
          </TabsList>

          <TabsContent value="my-bots" className="space-y-4 mt-6">
            {myBots?.length === 0 ? (
              <EmptyBots message="You haven't activated any bots yet." />
            ) : (
              myBots?.map((bot) => (
                <BotCard
                  key={bot.strategy_id}
                  bot={bot}
                  onActivate={() => handlePauseResume(bot)}
                  isPremiumUser={user?.is_premium || false}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="available" className="space-y-4 mt-6">
            {/* Free Tier Bots */}
            <div className="mb-6">
              <h3 className="text-h4 mb-4">FREE TIER</h3>
              {availableBots?.filter(b => !b.is_premium).map((bot) => (
                <BotCard
                  key={bot.wallet_id}
                  bot={bot}
                  onActivate={() => handleActivateBot(bot)}
                  isPremiumUser={user?.is_premium || false}
                />
              ))}
            </div>

            {/* Premium Bots */}
            <div>
              <h3 className="text-h4 mb-4 flex items-center gap-2">
                PREMIUM BOTS
                <Badge variant="premium-small">PRO</Badge>
              </h3>
              {availableBots?.filter(b => b.is_premium).map((bot) => (
                <BotCard
                  key={bot.wallet_id}
                  bot={bot}
                  onActivate={() => handleActivateBot(bot)}
                  isPremiumUser={user?.is_premium || false}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <BottomNav active="bots" />
    </div>
  );
}
```

**Desktop Adaptations:**
- 2-3 column grid for bot cards
- Comparison table view option
- Detailed performance charts
- Side-by-side bot comparison

**Key Features:**
- Active bot management (pause/resume)
- Performance tracking per bot
- Free tier: 3 basic bots (Conservative, Moderate, Aggressive)
- Premium tier: All bots unlocked
- Bot configuration drawer
- Risk level indicators

**API Integration:**
```typescript
// Fetch user's active bots (LT strategies)
async function fetchMyBots() {
  const res = await fetch('/api/lt/strategies');
  return res.json();
}

// Fetch all available bot strategies (FT wallets)
async function fetchAvailableBots() {
  const res = await fetch('/api/ft/wallets');
  return res.json();
}

// Activate a new bot
async function handleActivateBot(bot) {
  const res = await fetch('/api/lt/strategies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ft_wallet_id: bot.wallet_id,
      initial_capital: 1000, // Default or from user input
    }),
  });
  return res.json();
}
```

---

### Page 4: Trader Profile (`/trader/[wallet]`)

**Purpose:** View detailed trader stats and trade history

**Layout Structure (Mobile):**
```
┌─────────────────────────────────┐
│ [< Back]              [Share]   │ Header
├─────────────────────────────────┤
│      [Large Avatar]             │
│      Trader Name                │ Hero Section
│      @0x2b4f...                 │
│                                 │
│  [FOLLOW]  [COPY LAST TRADE]    │
├─────────────────────────────────┤
│ ┌──────┬──────┬──────┬──────┐ │
│ │ +$5K │ 67%  │ 234  │ 3.2x │ │ Stats Grid
│ │  PnL │  WR  │Trade │ ROI  │ │
│ └──────┴──────┴──────┴──────┘ │
├─────────────────────────────────┤
│ [Performance] [Trades] [About]  │ Tabs
├─────────────────────────────────┤
│   [Performance Chart]           │
│                                 │ Tab Content
│   [Trade History List]          │
│                                 │
├─────────────────────────────────┤
│ [Feed][Discover][Bots][Profile] │ Bottom Nav
└─────────────────────────────────┘
```

**Implementation:**

```tsx
// app/trader/[wallet]/page.tsx
'use client';

export default function TraderProfilePage({ params }: { params: { wallet: string } }) {
  const [activeTab, setActiveTab] = useState<'performance' | 'trades' | 'about'>('performance');

  const { data: trader } = useQuery({
    queryKey: ['trader', params.wallet],
    queryFn: () => fetchTraderProfile(params.wallet),
  });

  const { data: trades } = useQuery({
    queryKey: ['trader-trades', params.wallet],
    queryFn: () => fetchTraderTrades(params.wallet),
    enabled: activeTab === 'trades',
  });

  const { data: isFollowing } = useQuery({
    queryKey: ['following', params.wallet],
    queryFn: () => checkIsFollowing(params.wallet),
  });

  return (
    <div className="min-h-screen bg-poly-cream pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-poly-paper border-b border-gray-200 px-4 h-16 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ChevronLeftIcon /> BACK
        </Button>
        <Button variant="ghost" size="sm" onClick={handleShare}>
          <ShareIcon /> SHARE
        </Button>
      </header>

      {/* Hero Section */}
      <section className="bg-poly-indigo text-poly-paper px-4 py-8 text-center">
        <Avatar src={trader?.avatar} size="2xl" className="mx-auto mb-4" />
        <h1 className="text-h2 mb-2">{trader?.name || 'Anonymous Trader'}</h1>
        <p className="text-body-sm mb-6">@{trader?.wallet.slice(0, 10)}...</p>
        
        <div className="flex gap-3 justify-center">
          <Button 
            variant={isFollowing ? "secondary" : "primary"}
            onClick={handleFollow}
          >
            {isFollowing ? "FOLLOWING" : "FOLLOW"}
          </Button>
          <Button variant="ghost" onClick={handleCopyLastTrade}>
            COPY LAST TRADE
          </Button>
        </div>
      </section>

      {/* Stats Grid */}
      <section className="px-4 -mt-6">
        <div className="card-technical grid grid-cols-4 gap-2 p-4">
          <div className="text-center">
            <p className={`text-data text-xl ${trader?.stats.pnl >= 0 ? 'text-profit-green' : 'text-loss-red'}`}>
              {formatUSD(trader?.stats.pnl)}
            </p>
            <p className="text-caption text-gray-500">Total PnL</p>
          </div>
          <div className="text-center">
            <p className="text-data text-xl">{trader?.stats.win_rate}%</p>
            <p className="text-caption text-gray-500">Win Rate</p>
          </div>
          <div className="text-center">
            <p className="text-data text-xl">{trader?.stats.total_trades}</p>
            <p className="text-caption text-gray-500">Trades</p>
          </div>
          <div className="text-center">
            <p className="text-data text-xl">{trader?.stats.roi.toFixed(1)}x</p>
            <p className="text-caption text-gray-500">ROI</p>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="performance">PERFORMANCE</TabsTrigger>
            <TabsTrigger value="trades">TRADES</TabsTrigger>
            <TabsTrigger value="about">ABOUT</TabsTrigger>
          </TabsList>

          <TabsContent value="performance" className="mt-6">
            <PerformanceChart data={trader?.performance_history} />
            
            {/* Category Breakdown */}
            <div className="mt-6">
              <h3 className="text-h4 mb-4">CATEGORY PERFORMANCE</h3>
              <CategoryBreakdown categories={trader?.category_stats} />
            </div>
          </TabsContent>

          <TabsContent value="trades" className="space-y-4 mt-6">
            {trades?.map((trade) => (
              <TradeCard
                key={trade.id}
                trade={trade}
                variant="compact"
                onCopy={() => handleCopyTrade(trade)}
              />
            ))}
          </TabsContent>

          <TabsContent value="about" className="mt-6">
            <div className="space-y-4">
              <InfoRow label="Member Since" value={formatDate(trader?.created_at)} />
              <InfoRow label="Last Active" value={formatRelativeTime(trader?.last_trade_time)} />
              <InfoRow label="Average Trade Size" value={formatUSD(trader?.avg_trade_size)} />
              <InfoRow label="Largest Win" value={formatUSD(trader?.largest_win)} />
              <InfoRow label="Win Streak" value={`${trader?.win_streak} trades`} />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <BottomNav active="discover" />
    </div>
  );
}
```

**Desktop Adaptations:**
- Sidebar with persistent stats
- Larger performance chart
- Split view: trades + chart side-by-side

**Key Features:**
- Share trader profile (OG cards)
- Follow/unfollow
- Copy last trade
- Performance chart (7d, 30d, All)
- Trade history with filters
- Category breakdown

**API Integration:**
```typescript
async function fetchTraderProfile(wallet: string) {
  const res = await fetch(`/api/trader/${wallet}`);
  return res.json();
}

async function fetchTraderTrades(wallet: string) {
  const res = await fetch(`/api/trader/${wallet}/trades`);
  return res.json();
}
```

---

### Page 5: Portfolio (`/portfolio`)

**Purpose:** Track user's positions, PnL, and copy trading history

**Layout Structure (Mobile):**
```
┌─────────────────────────────────┐
│ PORTFOLIO                       │ Header
├─────────────────────────────────┤
│      Total Value                │
│       $12,456                   │ Hero Stats
│    ↑ +$1,234 (11.2%)           │
├─────────────────────────────────┤
│ [Positions] [History] [Stats]   │ Tabs
├─────────────────────────────────┤
│                                 │
│   [Position Card]               │
│                                 │
│   [Position Card]               │ Content
│                                 │
│   [Position Card]               │
│                                 │
├─────────────────────────────────┤
│ [Feed][Discover][Bots][Profile] │ Bottom Nav
└─────────────────────────────────┘
```

**Implementation:**

```tsx
// app/portfolio/page.tsx
'use client';

export default function PortfolioPage() {
  const [activeTab, setActiveTab] = useState<'positions' | 'history' | 'stats'>('positions');

  const { data: portfolio } = useQuery({
    queryKey: ['portfolio'],
    queryFn: fetchPortfolio,
    refetchInterval: 30000, // Refresh every 30s
  });

  const { data: orders } = useQuery({
    queryKey: ['orders'],
    queryFn: fetchOrders,
    enabled: activeTab === 'history',
  });

  return (
    <div className="min-h-screen bg-poly-cream pb-20">
      {/* Header with Hero Stats */}
      <header className="bg-poly-teal text-poly-paper px-4 py-8">
        <h1 className="text-h2 mb-6">PORTFOLIO</h1>
        
        <div className="text-center">
          <p className="text-caption mb-2">Total Value</p>
          <p className="text-display">{formatUSD(portfolio?.total_value || 0)}</p>
          <p className={`text-body-lg mt-2 ${portfolio?.total_pnl >= 0 ? 'text-profit-green' : 'text-loss-red'}`}>
            {portfolio?.total_pnl >= 0 ? '↑' : '↓'} {formatUSD(Math.abs(portfolio?.total_pnl || 0))} 
            ({portfolio?.total_pnl_pct >= 0 ? '+' : ''}{portfolio?.total_pnl_pct}%)
          </p>
        </div>
      </header>

      {/* Tabs */}
      <div className="px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="positions">POSITIONS</TabsTrigger>
            <TabsTrigger value="history">HISTORY</TabsTrigger>
            <TabsTrigger value="stats">STATS</TabsTrigger>
          </TabsList>

          <TabsContent value="positions" className="space-y-4 mt-6">
            {portfolio?.positions?.length === 0 ? (
              <EmptyPositions />
            ) : (
              portfolio?.positions?.map((position) => (
                <PositionCard
                  key={position.condition_id}
                  position={position}
                  onClose={() => handleClosePosition(position)}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4 mt-6">
            {orders?.map((order) => (
              <OrderHistoryCard
                key={order.order_id}
                order={order}
              />
            ))}
          </TabsContent>

          <TabsContent value="stats" className="mt-6">
            <PortfolioStats stats={portfolio?.stats} />
          </TabsContent>
        </Tabs>
      </div>

      <BottomNav active="portfolio" />
    </div>
  );
}
```

**Desktop Adaptations:**
- 2-column layout: positions + chart
- More detailed table view
- Export history as CSV

**Key Features:**
- Real-time position updates
- Close positions
- Trade history with filters
- Performance stats
- Share portfolio (OG cards)

**API Integration:**
```typescript
async function fetchPortfolio() {
  const res = await fetch('/api/portfolio');
  return res.json();
}

async function fetchOrders() {
  const res = await fetch('/api/orders');
  return res.json();
}
```

---

## Data Integration & API Mapping

### Existing API Endpoints (Use These)

**Feed & Discovery:**
```typescript
GET /api/feed                    // User's personalized feed
GET /api/fire-feed              // Curated high-quality trades (admin)
GET /api/trader/[wallet]        // Trader profile data
GET /api/trader/stats           // Trader statistics
GET /api/polymarket/leaderboard // Top traders leaderboard
```

**Trading & Orders:**
```typescript
GET  /api/portfolio                    // User portfolio summary
GET  /api/orders                       // User's order history
POST /api/polymarket/orders/place      // Place order
POST /api/polymarket/orders/cancel     // Cancel order
GET  /api/polymarket/positions         // Open positions
POST /api/polymarket/positions/close   // Close position
```

**Copy Trading:**
```typescript
POST /api/copied-trades                // Create manual copy trade
GET  /api/copied-trades                // List copied trades
GET  /api/copied-trades/[id]           // Get copy trade details
POST /api/copied-trades/[id]/status    // Update copy trade status
```

**Bots (Forward Testing + Live Trading):**
```typescript
GET  /api/ft/wallets              // List FT strategies (available bots)
POST /api/ft/sync                 // Sync new trades (admin)
POST /api/ft/resolve              // Resolve positions (admin)
GET  /api/ft/snapshots            // Performance snapshots

GET  /api/lt/strategies           // List live strategies (user's active bots)
POST /api/lt/strategies           // Create live strategy (activate bot)
GET  /api/lt/strategies/[id]      // Get strategy details
POST /api/lt/strategies/[id]/pause   // Pause strategy
POST /api/lt/strategies/[id]/resume  // Resume strategy
GET  /api/lt/logs                 // Execution logs
```

**User & Auth:**
```typescript
GET  /api/user/profile            // Current user profile
POST /api/user/follow             // Follow trader
POST /api/user/unfollow           // Unfollow trader
```

**Stripe (Subscriptions):**
```typescript
POST /api/stripe/checkout         // Create checkout session
POST /api/stripe/webhook          // Handle webhooks
POST /api/stripe/portal           // Customer portal
POST /api/stripe/cancel-subscription  // Cancel subscription
```

### Data Models (Key Types)

```typescript
// Trade
interface Trade {
  id: string;
  wallet_address: string;
  timestamp: string;
  side: 'BUY' | 'SELL';
  shares_normalized: number;
  price: number;
  condition_id: string;
  market_slug: string;
  title: string;
  tx_hash: string;
  order_hash: string;
}

// Trader Stats
interface TraderStats {
  wallet: string;
  name?: string;
  avatar?: string;
  pnl: number;
  win_rate: number;
  total_trades: number;
  roi: number;
  avg_trade_size: number;
  category_stats: CategoryStat[];
}

// FT Strategy (Available Bot)
interface FTWallet {
  wallet_id: string;
  display_name: string;
  description: string;
  starting_balance: number;
  current_balance: number;
  total_trades: number;
  win_rate: number;
  is_premium: boolean;
  risk_level: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
}

// LT Strategy (Active Bot)
interface LTStrategy {
  strategy_id: string;
  ft_wallet_id: string;
  user_id: string;
  wallet_address: string;
  is_active: boolean;
  is_paused: boolean;
  initial_capital: number;
  available_cash: number;
  locked_capital: number;
  cooldown_capital: number;
}

// Order
interface Order {
  order_id: string;
  copy_user_id: string;
  condition_id: string;
  token_id: string;
  token_label: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  invested_usd: number;
  pnl_usd: number;
  status: 'pending' | 'filled' | 'cancelled' | 'closed';
  created_at: string;
}
```

---

## Responsive Behavior

### Breakpoints

```css
/* Mobile Small */
@media (min-width: 320px) { }

/* Mobile */
@media (min-width: 375px) { }

/* Tablet */
@media (min-width: 768px) {
  /* Switch to top navigation */
  /* Increase to 2-3 column grids */
  /* Show more data per card */
}

/* Desktop */
@media (min-width: 1024px) {
  /* Max width containers (1280px) */
  /* Multi-column layouts */
  /* Side panels/filters */
}

/* Desktop Large */
@media (min-width: 1440px) {
  /* Wider layouts */
  /* More breathing room */
}
```

### Mobile-First Rules

1. **Stack vertically on mobile**
2. **Bottom navigation on mobile, top on desktop**
3. **Drawers on mobile, modals on desktop**
4. **2 columns max on mobile, 3-4 on desktop**
5. **Touch targets: 44x44px minimum**
6. **Text: 16px minimum on mobile (prevent zoom)**
7. **Hide non-essential data on small screens**
8. **Progressive disclosure: Summary → Details**

### Responsive Component Patterns

```tsx
// Conditional Navigation
<div className="hidden md:block">
  <TopNav />
</div>
<div className="block md:hidden">
  <BottomNav />
</div>

// Responsive Grids
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

// Responsive Typography
<h1 className="text-2xl md:text-3xl lg:text-4xl">

// Responsive Spacing
<div className="px-4 md:px-8 py-6 md:py-12">

// Hide on Mobile
<div className="hidden md:block">
  {/* Desktop-only filters */}
</div>
```

---

## Implementation Instructions for v0

### Overview for v0

You are building **Polycopy 2.0**, a copy-trading platform for Polymarket prediction markets. This is a complete redesign with a new brand identity called **"The Industrial Block"** - a bold, technical, institutional-grade design system.

### Tech Stack You Must Use

```json
{
  "framework": "Next.js 16 (App Router)",
  "react": "19.2.3",
  "typescript": "5.9.3",
  "styling": "Tailwind CSS 4 + CSS Variables",
  "components": "Radix UI primitives",
  "icons": "Lucide React",
  "state": "React Query (@tanstack/react-query)",
  "database": "Supabase (existing)",
  "apis": "Next.js API Routes (existing)"
}
```

### Design System Fundamentals

**Brand Identity:**
- **Logo:** "POLY" (yellow #FDB022) + "COPY" (black #0F0F0F) split wordmark
- **Aesthetic:** Sharp corners (0-4px max), bold uppercase typography, high contrast
- **Fonts:** Space Grotesk (display) + DM Sans (body)
- **Colors:** Yellow primary, Indigo/Teal/Coral accents, Cream backgrounds

**Typography Style:**
- All headings: Space Grotesk, Bold, UPPERCASE, wide letter-spacing (0.2em)
- All body: DM Sans, Regular, sentence case
- Buttons: Space Grotesk, Bold, UPPERCASE, letter-spacing 0.2em
- Data/numbers: DM Sans, Semibold, tabular-nums

**Component Style:**
- Cards: White background, 1px border, 0px border-radius (sharp), subtle shadow
- Buttons: 0px border-radius, bold uppercase text, yellow primary
- Inputs: 2-4px border-radius max, 48px height minimum (prevent iOS zoom)
- All interactive: Clear hover states (150ms transition)

### Key Components to Build

**Priority 1 (Core):**
1. TradeCard - Display trader's trades with metrics and PolyScore
2. TraderCard - Display trader profiles with stats
3. BotCard - Display strategy bots with performance
4. Navigation (Top for desktop, Bottom for mobile)
5. Button system (Primary/Secondary/Ghost)

**Priority 2 (Essential):**
6. Modal & Drawer components (Radix Dialog)
7. Form inputs, toggles, dropdowns
8. Badges (Premium, PolyScore, Locked)
9. Empty states, loading skeletons
10. Avatar component

**Priority 3 (Nice-to-have):**
11. Performance charts (simple line charts)
12. Sparklines for bot cards
13. Share card generators (OG images)
14. Filter components
15. Search input

### Pages to Build (In Order)

1. **Feed** (`/feed`) - Personalized trade feed
2. **Discover** (`/discover`) - Browse traders
3. **Bots** (`/bots`) - Strategy bot dashboard
4. **Trader Profile** (`/trader/[wallet]`) - Individual trader page
5. **Portfolio** (`/portfolio`) - User's positions and history

### Critical Requirements

**Mobile-First:**
- Design for 375px width first
- Bottom navigation on mobile
- Touch targets: 44x44px minimum
- Test on actual devices

**Accessibility:**
- WCAG AA contrast minimum (4.5:1)
- Keyboard navigation for all interactions
- Screen reader support (proper labels)
- Focus states on all interactive elements

**Performance:**
- Code split by page
- Lazy load heavy components
- Optimize images (Next Image)
- Minimize bundle size

**Data Integration:**
- Use existing API endpoints (documented above)
- React Query for data fetching
- Proper loading and error states
- Real-time updates where needed

### v0-Specific Instructions

**When generating components:**
1. Use TypeScript with proper types
2. Use Tailwind CSS classes (no inline styles)
3. Use CSS variables for colors (var(--poly-yellow))
4. Build on Radix UI primitives where applicable
5. Include proper accessibility attributes
6. Add loading and error states
7. Make responsive (mobile-first)

**Component structure:**
```tsx
// Example structure for v0
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';

interface TradeCardProps {
  // Props with types
}

export function TradeCard({ ... }: TradeCardProps) {
  // State
  // Data fetching (if needed)
  // Handlers
  
  return (
    <div className="card-technical">
      {/* Component JSX */}
    </div>
  );
}
```

**Styling approach:**
```tsx
// Use Tailwind classes
<button className="btn-primary px-6 py-3 bg-poly-yellow text-poly-black font-display font-bold uppercase tracking-widest">
  COPY TRADE
</button>

// Or use custom classes defined in CSS
<button className="btn-primary">
  COPY TRADE
</button>
```

**Don't:**
- Don't use inline styles
- Don't use non-standard UI libraries
- Don't create overly complex abstractions
- Don't ignore mobile responsiveness
- Don't skip TypeScript types

**Do:**
- Keep components focused and reusable
- Use semantic HTML
- Add proper ARIA labels
- Test on mobile viewports
- Follow the brand guidelines exactly

### Questions v0 Should Ask

Before generating code, v0 should ask:

1. **Which component/page should I build first?**
2. **Do you have the API endpoints ready for data fetching?**
3. **Should I use existing Radix components or build custom?**
4. **Do you want dark mode support now or later?**
5. **Should I generate the CSS variables file or use existing?**
6. **Any specific animation preferences?**
7. **Should I build mobile or desktop version first?**

### Expected Output from v0

For each component/page, v0 should provide:

1. **Component file** (`.tsx`)
2. **Types file** (if complex types)
3. **CSS file** (if custom styles needed)
4. **Usage example**
5. **Props documentation**
6. **Accessibility notes**
7. **Mobile responsive behavior**

### Testing Checklist

After v0 generates components:

- [ ] Mobile (375px) - Does it work?
- [ ] Tablet (768px) - Does it adapt?
- [ ] Desktop (1280px) - Does it look good?
- [ ] Keyboard navigation - Can you tab through?
- [ ] Screen reader - Does it make sense?
- [ ] Loading states - Are they clear?
- [ ] Error states - Are they helpful?
- [ ] Empty states - Are they friendly?
- [ ] Brand guidelines - Does it match?

---

## Summary & Next Steps

### What We've Built

This document provides:

1. **Complete brand system** from Figma AI (The Industrial Block)
2. **Design foundations** (colors, typography, spacing, components)
3. **Component specifications** with code examples
4. **5 complete page layouts** with implementation details
5. **API integration guide** using existing endpoints
6. **Responsive behavior** guidelines
7. **v0-specific instructions** for code generation

### How to Use This with v0

**Step 1:** Share this entire document with v0

**Step 2:** Ask v0 to build components in this order:
1. Design system setup (CSS variables, Tailwind config)
2. Base components (Button, Card, Badge)
3. Feed page (simplest, most important)
4. Other pages sequentially

**Step 3:** For each component, provide:
- This spec document
- Any example data/mock data
- Specific requirements or tweaks

**Step 4:** Test generated components:
- Check mobile responsiveness
- Verify brand guidelines match
- Test accessibility
- Integrate with existing APIs

**Step 5:** Iterate:
- Refine based on testing
- Add missing features
- Optimize performance
- Polish details

### Contact & Support

If v0 has questions or needs clarification:
- Refer back to this document
- Check the Figma assets in `.cursor/temp-Rebrand/`
- Review existing codebase structure
- Ask specific, targeted questions

---

**End of v0 Implementation Guide**

*This document is production-ready and contains all necessary specifications for v0 to generate Polycopy 2.0 UI components. Figma brand assets are located in `.cursor/temp-Rebrand/` for reference.*