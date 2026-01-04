# Logo Fixes Guide

## 🎨 Issues to Fix:
1. **Navigation logo** - Low quality, weird spacing
2. **Magic link email logo** - Looks weird

---

## ✅ Fix 1: Navigation Logo (Code Change)

### Update to use SVG for crisp quality:

**File:** `/Users/bradmichelson/Documents/Cursor/Polycopy/polycopy/components/polycopy/navigation.tsx`

**Current (Lines 140-143):**
```tsx
<Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
  <Image src="/logos/polycopy-logo-icon.png" alt="Polycopy" width={32} height={32} className="w-8 h-8" />
  <span className="text-xl font-bold text-slate-900">Polycopy</span>
</Link>
```

**Change to:**
```tsx
<Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
  <Image 
    src="/logos/polycopy-logo-icon.svg" 
    alt="Polycopy" 
    width={32} 
    height={32} 
    className="w-8 h-8 object-contain" 
    priority 
  />
  <span className="text-xl font-bold text-slate-900 tracking-tight">Polycopy</span>
</Link>
```

**Changes made:**
- ✅ Use `.svg` instead of `.png` (crisp at any resolution)
- ✅ `gap-3` → `gap-2` (better spacing)
- ✅ Added `object-contain` (prevents distortion)
- ✅ Added `priority` (loads faster)
- ✅ Added `tracking-tight` to text (better kerning)

**Also update mobile version (Line 286):**
```tsx
<Image 
  src="/logos/polycopy-logo-icon.svg" 
  alt="Polycopy" 
  width={24} 
  height={24} 
  className="h-6 w-6 object-contain" 
/>
```

---

## ✅ Fix 2: Magic Link Email Logo (Supabase Dashboard)

The magic link email uses Supabase's default template. You need to update it in the Supabase dashboard:

### Step-by-Step:

1. **Go to Supabase Dashboard**
   - Navigate to: [https://supabase.com/dashboard](https://supabase.com/dashboard)
   - Select your Polycopy project

2. **Open Email Templates**
   - Left sidebar → **Authentication** → **Email Templates**

3. **Edit "Confirm signup" template**
   - This is the magic link template
   - Click "Confirm signup" to edit

4. **Update the logo URL in the HTML**

   Find this section (around line 20-30):
   ```html
   <img src="https://your-old-logo-url.png" />
   ```

   Replace with:
   ```html
   <img src="https://polycopy.app/logos/polycopy-logo-primary.svg" 
        alt="Polycopy" 
        style="width: 180px; height: auto; margin: 0 auto; display: block;" />
   ```

   **OR** if you want to use the icon + text:
   ```html
   <div style="text-align: center; margin: 20px 0;">
     <img src="https://polycopy.app/logos/polycopy-logo-icon.svg" 
          alt="Polycopy" 
          style="width: 48px; height: 48px; display: block; margin: 0 auto;" />
     <h1 style="margin-top: 12px; font-size: 24px; font-weight: bold; color: #1e293b;">Polycopy</h1>
   </div>
   ```

5. **Save Changes**
   - Click "Save" at the bottom

6. **Test the email**
   - Log out of Polycopy
   - Try to log in again
   - Check your email - logo should now be crisp!

---

## 🎨 Alternative: Host Logo on Supabase Storage (Recommended)

If the logo doesn't load from polycopy.app, you can upload it to Supabase Storage:

### Steps:

1. **Go to Supabase Dashboard** → **Storage**

2. **Create a public bucket** (if you don't have one)
   - Name it: `public-assets`
   - Make it public

3. **Upload the logo**
   - Upload `/public/logos/polycopy-logo-primary.svg`
   - Get the public URL (something like):
   ```
   https://[project-id].supabase.co/storage/v1/object/public/public-assets/polycopy-logo-primary.svg
   ```

4. **Use that URL in the email template**
   ```html
   <img src="https://[project-id].supabase.co/storage/v1/object/public/public-assets/polycopy-logo-primary.svg" 
        alt="Polycopy" 
        style="width: 180px; height: auto; margin: 0 auto; display: block;" />
   ```

---

## 📋 Summary

| Issue | Fix | Where |
|-------|-----|-------|
| Nav logo quality | Use `.svg` instead of `.png` | Code (`navigation.tsx`) |
| Nav logo spacing | Change `gap-3` to `gap-2` | Code (`navigation.tsx`) |
| Email logo | Update Supabase email template | Supabase Dashboard |

---

## 🚀 After Making Changes:

### For Navigation:
1. Save `navigation.tsx`
2. Refresh localhost:3000
3. Logo should be crisp and well-spaced ✅

### For Email:
1. Update Supabase email template
2. Log out and log in again
3. Check email - logo should look good ✅

---

**Need help with any step?** Let me know!

