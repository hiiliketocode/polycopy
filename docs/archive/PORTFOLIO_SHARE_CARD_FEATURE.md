# Portfolio Share Card Feature

## Overview

This feature allows users to generate and share beautiful portfolio cards showcasing their copy trading statistics on social media. The implementation uses **client-side image generation** from React components via `html-to-image`, ensuring the generated card matches the preview exactly.

## Architecture

### Key Decision: Client-Side Generation

We use `html-to-image` to capture the actual React component as a PNG, rather than maintaining separate implementations for preview and image generation. This approach:

- **Guarantees visual parity**: The preview and downloaded image are identical (same React component)
- **Simplifies maintenance**: Single source of truth for card design
- **Avoids Satori limitations**: No need to work around CSS constraints in `@vercel/og`

### Components

1. **`PortfolioCard`** (`temp-share/components/portfolio-card.tsx`)
   - React component that renders the actual card
   - Uses Tailwind CSS with full feature support (gradients, backdrop effects, shadows)
   - Supports 4 themes: cream, dark, profit, fire
   - Includes metallic shell frame, lanyard hole, and layered glassmorphic design

2. **`ShareStatsModal`** (`components/polycopy/share-stats-modal.tsx`)
   - Modal interface for theme selection and sharing
   - Uses `html-to-image` to capture the `PortfolioCard` component
   - Provides copy, download, and Twitter/X share functionality
   - Instant theme switching after initial generation

## Features

### Card Dimensions
- **Width:** 380px
- **Height:** 507px (3:4 portrait aspect ratio)
- Perfect for social media sharing on Twitter/X, Instagram stories

### Themes

1. **Cream**: Clean white card with warm gradient overlay and stone-toned shell
2. **Dark**: Dark slate theme with blue tones and metallic shell
3. **Profit**: Emerald green theme for successful traders with zinc shell
4. **Fire**: Bold rose/burgundy theme with rose-tinted shell

### Card Elements

- **Outer Metallic Shell**: Gradient frame (3px padding) with physical card aesthetic
- **Lanyard Hole**: Centered pill-shaped cutout at top for "physical card" effect
- **Inner Card**: Main content area with theme-specific gradient background
- **Logo**: Polycopy full logo (adapts to theme - dark or light version)
- **Verified Badge**: Green pulsing indicator with "VERIFIED TRADER"
- **User Info**: Avatar (or initial), username, member since date, following count
- **P&L Display**: Large highlighted profit/loss with animated trend icon
- **Stats Grid**: ROI, Win Rate, Copy Trades, Volume in 2x2 layout with icons
- **Footer**: polycopy.app branding and current date

### Share Options

1. **Copy**: Copies image to clipboard (uses Clipboard API)
2. **Download**: Downloads PNG file directly
3. **Share to X**: 
   - Uses Web Share API on supported platforms (mobile, some browsers)
   - Falls back to download + Twitter intent URL with pre-filled text and instructions

## Technical Details

### Image Generation Process

1. Component renders off-screen in a hidden div (`position: fixed; left: -9999px; top: -9999px`)
2. Small delay (100ms) ensures React component is fully rendered with all styles
3. `html-to-image`'s `toPng()` captures the rendered component
4. Returns high-quality PNG at 2x pixel ratio (760x1014px actual resolution)
5. Blob is cached in state and reused for copy/download/share actions
6. When theme changes, new image is generated and cached

### Performance

- Initial generation: ~100-500ms (depends on browser and device)
- Theme switching: ~100-500ms per theme
- Download/copy/share: Instant (uses cached blob)
- No server-side API calls after component mount

### Browser Compatibility

- Works in all modern browsers (Chrome, Firefox, Safari, Edge)
- Clipboard API requires HTTPS (works in development with localhost)
- Web Share API available on mobile Safari, Android Chrome, and some desktop browsers

## Usage

```tsx
import { ShareStatsModal } from '@/components/polycopy/share-stats-modal'

<ShareStatsModal
  open={isOpen}
  onOpenChange={setIsOpen}
  username="tradername"
  stats={{
    pnl: 103.85,
    roi: 5.7,
    winRate: 60.7,
    volume: 2000,
    trades: 226,
    followers: 221,
    memberSince: "Jan 2026"
  }}
/>
```

## Integration

Integrated into user profile page (`app/profile/page.tsx`):
- "Share My Stats" button with `Share2` icon appears after stats grid
- Button only visible when `copiedTrades.length > 0`
- Opens modal with user's current stats pre-filled

## Dependencies

- `html-to-image`: ^1.11.11 - Client-side HTML to image conversion
- `lucide-react`: Icons (Calendar, Users, TrendingUp, etc.)
- `@radix-ui/react-dialog`: Modal component
- Tailwind CSS: All styling

## Why This Approach?

### Problems with Satori/Vercel OG
- Satori doesn't support many CSS features (backdrop-filter, complex gradients, CSS variables)
- Requires maintaining two separate implementations (React preview + Satori generation)
- Visual discrepancies between preview and generated image
- Time-consuming to debug and match designs pixel-perfect

### Benefits of html-to-image
- ✅ One source of truth - preview IS the generated image
- ✅ Full CSS support - use any Tailwind/CSS features
- ✅ Faster iteration - change component once, affects both preview and generation
- ✅ Easier maintenance - no need to translate React → Satori syntax
- ✅ Guaranteed visual parity

### Trade-offs
- Client-side generation means slightly longer initial load (100-500ms)
- Acceptable for a share feature where users expect a brief moment
- Could be enhanced later with server-side pre-generation if needed

## Future Enhancements

Potential improvements:
- Server-side generation with Puppeteer for pre-caching popular cards
- Additional themes based on user feedback
- Custom branding/personalization options
- Animated cards (GIF/video export using Remotion)
- Time period selector (Last 30 days / All time / 2026 Wrapped)
- Milestone badges (First $1K, 10 win streak, etc.)
- Auto-prompts after big wins to encourage sharing

## Reference

This implementation was inspired by:
- Polymarket's "share your bag" feature
- v0.dev for card design iteration
- Best practice of using actual components for image generation (vs duplicating logic)
