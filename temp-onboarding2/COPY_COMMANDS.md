# Quick Integration Commands

## Copy These Files to Your Main Codebase

```bash
# Navigate to your project root
cd /Users/bradmichelson/Documents/Cursor/Polycopy/polycopy

# Create onboarding components directory if it doesn't exist
mkdir -p components/onboarding

# Copy all onboarding components
cp temp-onboarding2/components/onboarding/*.tsx components/onboarding/

# Copy the page component
cp temp-onboarding2/app/onboarding/page.tsx app/onboarding/page.tsx

# Verify files were copied
ls -la components/onboarding/
ls -la app/onboarding/
```

## Files That Will Be Copied

### Components (7 files):
1. `onboarding-flow.tsx` - Main container with state management
2. `step-follow-traders.tsx` - Screen 1: Follow traders
3. `trader-card.tsx` - Individual trader card component
4. `step-trade-explainer.tsx` - Screen 2: How to copy trades
5. `step-premium-upsell.tsx` - Screen 3: Premium upgrade
6. `step-complete.tsx` - Screen 4: Success screen
7. `progress-indicator.tsx` - Progress dots
8. `polycopy-logo.tsx` - Logo component (may need logo image fix)

### Pages (1 file):
1. `app/onboarding/page.tsx` - Route entry point

## After Copying

### 1. Fix the Logo Image Path

The `polycopy-logo.tsx` component references:
```tsx
<Image src="/images/polycopy-logo-white.png" ... />
```

Check if this file exists at:
```bash
ls -la public/images/polycopy-logo-white.png
```

If not, copy from your existing location:
```bash
# Find where your white logo is
find public -name "*logo*white*"

# Then update the path in components/onboarding/polycopy-logo.tsx
```

### 2. Test Locally

```bash
# Start your dev server
npm run dev

# Visit http://localhost:3000/onboarding
# Should show the new onboarding flow
```

### 3. Test Auth Flow

To test the full auth redirect:

1. Open browser in incognito
2. Go to http://localhost:3000/login
3. Sign up with new test email
4. Click magic link from email
5. Should auto-redirect to /onboarding
6. Complete onboarding
7. Should redirect to /feed

### 4. Verify Database

After completing onboarding:

```sql
-- Check if onboarding was marked complete
SELECT id, email, has_completed_onboarding 
FROM profiles 
WHERE email = 'your-test-email@example.com';

-- Should show: has_completed_onboarding = true

-- Check if follows were created
SELECT user_id, trader_wallet 
FROM follows 
WHERE user_id = 'your-user-id';

-- Should show 5+ trader follows
```

## Cleanup (Optional)

Once everything is working, you can remove the temp folder:

```bash
# Delete temp folder
rm -rf temp-onboarding2/

# Or keep for reference
mv temp-onboarding2/ _archive/onboarding-v4/
```

## Rollback Plan

If something breaks:

1. Your old onboarding is still at `app/onboarding/page.tsx` (will be overwritten)
2. Make a backup first:

```bash
# Backup current onboarding before copying
cp app/onboarding/page.tsx app/onboarding/page.tsx.backup

# If you need to rollback
mv app/onboarding/page.tsx.backup app/onboarding/page.tsx
```

## Quick Test Checklist

- [ ] Copy files with commands above
- [ ] Start dev server
- [ ] Visit /onboarding directly
- [ ] Can select traders
- [ ] Progress through all 4 screens
- [ ] Premium modal opens
- [ ] Completion works
- [ ] No console errors
- [ ] Mobile responsive works

Ready to go! 🚀
