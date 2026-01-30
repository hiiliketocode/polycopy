# Mobile Onboarding Updates - Jan 30, 2026

## Changes Made

### 1. ✅ Wider Cards on Mobile
**File:** `components/onboarding/step-follow-traders.tsx`

- **Before:** 160px wide on mobile, 180px on desktop
- **After:** 180px wide on mobile, 200px on desktop
- **Reason:** Ensures all stats (ROI, P&L, VOL) fit properly without truncation

```tsx
// Grid with updated card widths
<div className="grid grid-rows-2 grid-flow-col gap-3 md:gap-4 auto-cols-[180px] md:auto-cols-[200px]">
```

### 2. ✅ Hidden Bottom Navigation
**File:** `app/onboardingtest/page.tsx`

Added two methods to hide mobile bottom nav:

**Method 1: CSS (inline)**
```jsx
<style jsx global>{`
  /* Hide mobile navigation on onboarding test page */
  body nav[class*="bottom"],
  body footer nav,
  body [class*="mobile-nav"],
  body [class*="MobileNav"],
  body [class*="bottom-nav"],
  body [class*="BottomNav"] {
    display: none !important;
  }
`}</style>
```

**Method 2: JavaScript (useEffect)**
```tsx
React.useEffect(() => {
  // Hide any bottom navigation bars
  const navElements = document.querySelectorAll('[role="navigation"], nav, footer nav');
  navElements.forEach(el => {
    if (el instanceof HTMLElement) {
      el.style.display = 'none';
    }
  });

  return () => {
    // Restore on unmount
    navElements.forEach(el => {
      if (el instanceof HTMLElement) {
        el.style.display = '';
      }
    });
  };
}, []);
```

---

## Mobile Experience Now:

✅ **Card Width:** 180px (wider to fit all stats)
✅ **Bottom Nav:** Hidden completely during onboarding
✅ **Stats:** All three metrics (ROI, P&L, VOL) display properly
✅ **Scroll:** Horizontal scroll with visible chevron buttons
✅ **2 Rows:** Cards arranged in 2 rows that scroll left/right

---

## Testing Mobile

### On Desktop Browser:
1. Open DevTools (F12)
2. Toggle device toolbar (Cmd+Shift+M / Ctrl+Shift+M)
3. Select iPhone or Android device
4. Navigate to: `http://localhost:3000/onboardingtest`

### On Real Device:
1. Find your local IP: `ifconfig | grep "inet "`
2. Visit on phone (same wifi): `http://YOUR_IP:3000/onboardingtest`

---

## Visual Changes Summary:

**Before:**
- Cards: 160px wide on mobile
- Stats: Text wrapping/truncating
- Bottom nav: Visible (Feed, Discover, Portfolio, Account)

**After:**
- Cards: 180px wide on mobile (20px wider)
- Stats: All values fit properly
- Bottom nav: Hidden (clean full-screen experience)

---

**Refresh your browser** to see the mobile improvements! 📱
