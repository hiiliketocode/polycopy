# Core Web Vitals Fixes - Action Plan

## Date: January 30, 2026

---

## 🚨 Current Issues (From Google Search Console)

### Mobile:
- **LCP (Largest Contentful Paint)**: >2.5s on 5 URLs ❌
  - Target: <2.5s
  - Impact: Slow page loads hurt rankings

### Desktop:
- **CLS (Cumulative Layout Shift)**: >0.1 on 5 URLs ❌
  - Target: <0.1
  - Impact: Layout shifts create poor UX
- **LCP**: >2.5s ❌

---

## 🔧 Quick Fixes (Highest Impact)

### 1. Image Optimization ⚠️ HIGH PRIORITY
**Problem:** Large, unoptimized images slow down page load

**Solution:**
```typescript
// In next.config.ts, add:
const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
  },
  // ... rest of config
};
```

**Also:**
- Use Next.js `<Image>` component everywhere
- Add `priority` to above-the-fold images
- Specify `width` and `height` on all images

**Example:**
```tsx
import Image from 'next/image';

// Above-the-fold image (hero, logo)
<Image
  src="/og-image.png"
  alt="Polycopy"
  width={1200}
  height={630}
  priority // Loads immediately
/>

// Below-the-fold images
<Image
  src={trader.profileImage}
  alt={trader.displayName}
  width={100}
  height={100}
  loading="lazy" // Loads when scrolled into view
/>
```

---

### 2. Fix Layout Shift (CLS) ⚠️ HIGH PRIORITY
**Problem:** Elements jumping around as page loads

**Common Causes:**
1. Images without dimensions
2. Ads or embeds loading late
3. Fonts loading (FOUT - Flash of Unstyled Text)
4. Dynamic content injected

**Solutions:**

**A. Always specify image dimensions:**
```tsx
// ❌ Bad - causes layout shift
<img src="/logo.png" />

// ✅ Good - reserves space
<Image src="/logo.png" width={120} height={40} alt="Logo" />
```

**B. Reserve space for dynamic content:**
```tsx
// For loading states
{loading ? (
  <div className="h-[400px] animate-pulse bg-gray-200" />
) : (
  <TraderCard trader={trader} />
)}
```

**C. Optimize font loading:**
```typescript
// In app/layout.tsx
import { Inter } from "next/font/google";

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap', // Prevents FOUT
  preload: true,
});
```

---

### 3. Lazy Load Heavy Components 📦 MEDIUM PRIORITY
**Problem:** Loading everything at once slows initial page load

**Solution:**
```tsx
import dynamic from 'next/dynamic';

// Lazy load heavy components
const TradeChart = dynamic(() => import('@/components/TradeChart'), {
  loading: () => <div className="h-[300px] animate-pulse bg-gray-100" />,
  ssr: false, // If it uses browser-only APIs
});

const RealizedPnlChart = dynamic(() => import('@/components/RealizedPnlChart'), {
  loading: () => <div className="h-[400px] animate-pulse bg-gray-100" />,
});
```

**Apply to:**
- Charts (Recharts components)
- Heavy modals
- Third-party widgets
- Analytics scripts

---

### 4. Optimize Third-Party Scripts 📊 MEDIUM PRIORITY
**Problem:** Google Tag Manager and other scripts block rendering

**Current (in layout.tsx):**
```tsx
<Script id="google-tag-manager" strategy="afterInteractive">
  {/* GTM code */}
</Script>
```

**Better:**
```tsx
<Script
  id="google-tag-manager"
  strategy="lazyOnload" // Load after page is interactive
  src="https://www.googletagmanager.com/gtm.js?id=GTM-WBP9V9WH"
/>
```

---

### 5. Reduce JavaScript Bundle Size 📦 MEDIUM PRIORITY

**Check current bundle size:**
```bash
npm run build
```

Look for:
- Large page bundles (>500KB is too big)
- Unused dependencies
- Duplicate dependencies

**Quick wins:**
1. **Remove unused imports**
2. **Use tree-shaking**
3. **Lazy load routes:**
```typescript
// next.config.ts
const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['recharts', 'lucide-react'],
  },
};
```

---

### 6. Enable Compression 🗜️ LOW PRIORITY (but easy)

**Ensure your server compresses responses:**
```typescript
// In next.config.ts
const nextConfig: NextConfig = {
  compress: true, // Should be default, but verify
};
```

**Also check Fly.io settings** (since you're using Fly.io based on fly.toml):
- Enable Brotli compression
- Enable HTTP/2
- Enable caching headers

---

## 🎯 Priority Order

### Do First (This Week):
1. ✅ Add image optimization config to `next.config.ts`
2. ✅ Fix all images to use Next.js `<Image>` with dimensions
3. ✅ Add `priority` to above-the-fold images
4. ✅ Reserve space for loading states (fix CLS)

### Do Second (Next Week):
5. ✅ Lazy load charts and heavy components
6. ✅ Optimize Google Tag Manager loading
7. ✅ Check bundle size and optimize

### Do Third (As Needed):
8. ✅ Enable compression (verify)
9. ✅ Monitor and iterate

---

## 📊 Expected Results

### Week 1-2 (After Image Fixes):
- LCP: 2.5s → ~1.5-2.0s ✅
- Mobile score improves

### Week 3-4 (After CLS Fixes):
- CLS: >0.1 → <0.05 ✅
- Desktop score improves

### Month 2:
- All URLs passing Core Web Vitals ✅
- Better rankings due to performance
- Lower bounce rate

---

## 🔍 How to Test

### 1. PageSpeed Insights
- URL: https://pagespeed.web.dev/
- Test: `https://polycopy.app`
- Look for: LCP, CLS, FID scores

### 2. Chrome DevTools (Lighthouse)
1. Open your site in Chrome
2. Press F12 → Lighthouse tab
3. Run audit for Mobile & Desktop
4. Check Performance score

### 3. Google Search Console
- Core Web Vitals report (what you showed)
- Monitor weekly for improvements

### 4. Real User Monitoring
Google Search Console shows **real user data** (field data), which is what matters most for rankings.

---

## 💡 Quick Image Audit

Check these pages for unoptimized images:
- Homepage hero images
- Trader profile pictures
- Market avatars
- Logo in navigation
- OG images

**Find images without Next.js Image component:**
```bash
# Search for <img> tags (should use <Image> instead)
grep -r "<img" app/ --include="*.tsx" --include="*.jsx"
```

---

## 📝 Implementation Checklist

- [ ] Add image optimization to `next.config.ts`
- [ ] Convert all `<img>` to `<Image>` with dimensions
- [ ] Add `priority` to hero/logo images
- [ ] Reserve space for loading states
- [ ] Lazy load charts and heavy components
- [ ] Change GTM to `lazyOnload` strategy
- [ ] Run `npm run build` and check bundle sizes
- [ ] Test with PageSpeed Insights
- [ ] Test with Chrome Lighthouse
- [ ] Deploy and monitor Search Console

---

## 🚀 After Fixes

Once you fix these issues:

1. **Request re-crawl** in Google Search Console
2. **Monitor Core Web Vitals** report weekly
3. **Watch rankings improve** in 2-4 weeks
4. **Expect 10-20% traffic increase** from better performance

---

## 📞 Questions?

If you need help implementing any of these fixes, let me know!
