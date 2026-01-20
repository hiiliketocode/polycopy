# Profile Picture Sync from Polymarket - Implementation Guide

## ✅ What's Been Implemented

### 1. Database Schema
**File**: `RUN_THIS_ADD_PROFILE_IMAGE.sql`
- Created SQL migration to add `profile_image_url` column to `profiles` table
- **Action Required**: Run this SQL in Supabase SQL Editor

### 2. API Updates
**Files Modified**:
- `app/api/polymarket/leaderboard/route.ts`
  - Now returns `profileImage` field from Polymarket API
  - Included in trader data response

- `app/api/polymarket/lookup-user/route.ts`
  - Now returns `profileImage` when looking up a user by username
  - Logs profile image URL for debugging

### 3. Navigation Component
**File**: `components/polycopy/navigation.tsx`
- Added `profileImageUrl` prop
- Avatar component now displays profile picture if available
- Falls back to initials if no profile picture

---

## 🚧 What Still Needs to Be Done

### Step 1: Run Database Migration

**Execute this SQL in Supabase:**
```bash
# Copy the contents of RUN_THIS_ADD_PROFILE_IMAGE.sql
# Paste into Supabase SQL Editor
# Run the query
```

This adds the `profile_image_url TEXT` column to the `profiles` table.

---

### Step 2: Update Profile Page to Fetch and Display Profile Image

**File to modify**: `app/profile/page.tsx`

**Add profile image state and fetching:**

```typescript
// Add state for profile image
const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);

// Fetch profile image from database when user loads
useEffect(() => {
  if (!user) return;
  
  const fetchProfileImage = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('profile_image_url')
      .eq('id', user.id)
      .single();
    
    if (!error && data?.profile_image_url) {
      setProfileImageUrl(data.profile_image_url);
    }
  };
  
  fetchProfileImage();
}, [user]);

// Pass profileImageUrl to Navigation component
<Navigation 
  user={user ? { id: user.id, email: user.email || '' } : null} 
  isPremium={isPremium}
  walletAddress={profile?.trading_wallet_address}
  profileImageUrl={profileImageUrl}  // <-- Add this
/>
```

---

### Step 3: Update Wallet Connection to Save Profile Image

**Option A: For Turnkey Wallet Connection** 
(Current flow: `/profile/connect-wallet/page.tsx`)

When user connects via Turnkey, fetch their profile image:

```typescript
// After wallet is connected, fetch profile image from leaderboard
const fetchAndSaveProfileImage = async (walletAddress: string, userId: string) => {
  try {
    // Fetch from leaderboard API
    const response = await fetch(
      `/api/polymarket/leaderboard?limit=1000&orderBy=PNL&timePeriod=all`
    );
    
    if (response.ok) {
      const data = await response.json();
      const trader = data.traders?.find(
        (t: any) => t.wallet.toLowerCase() === walletAddress.toLowerCase()
      );
      
      if (trader?.profileImage) {
        // Save to profiles table
        await supabase
          .from('profiles')
          .update({ profile_image_url: trader.profileImage })
          .eq('id', userId);
        
        console.log('✅ Profile image saved:', trader.profileImage);
      }
    }
  } catch (error) {
    console.error('Error fetching profile image:', error);
    // Non-critical, continue anyway
  }
};
```

**Option B: For Username-Based Connection**
(If you have a flow where users enter Polymarket username)

The `/api/polymarket/lookup-user` endpoint already returns `profileImage`, so just save it:

```typescript
// When user connects by username
const connectByUsername = async (username: string) => {
  const response = await fetch('/api/polymarket/lookup-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username })
  });
  
  const data = await response.json();
  
  if (data.success) {
    // Save wallet, username, AND profile image
    await supabase
      .from('profiles')
      .update({ 
        polymarket_username: data.username,
        wallet_address: data.walletAddress,
        profile_image_url: data.profileImage  // <-- Add this
      })
      .eq('id', user.id);
  }
};
```

---

### Step 4: Update Other Pages That Use Navigation

Find all pages that render the `<Navigation>` component and pass `profileImageUrl`:

**Files to check:**
- `app/discover/page.tsx`
- `app/feed/page.tsx`
- `app/orders/page.tsx`
- `app/trader/[wallet]/page.tsx`
- Any other pages using Navigation

**Example update:**
```typescript
// Before
<Navigation 
  user={user}
  isPremium={isPremium}
  walletAddress={walletAddress}
/>

// After
<Navigation 
  user={user}
  isPremium={isPremium}
  walletAddress={walletAddress}
  profileImageUrl={profileImageUrl}  // <-- Add this
/>
```

---

### Step 5: (Optional) Update Profile Page Avatar

If you want the large profile picture on the profile page itself to also use Polymarket image:

**File**: `app/profile/page.tsx`

Find the Avatar component in the profile header and update similarly:

```tsx
<Avatar className="h-24 w-24 ring-4 ring-white shadow-lg">
  {profileImageUrl ? (
    <AvatarImage src={profileImageUrl} alt="Profile" />
  ) : null}
  <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-yellow-500 text-slate-900 font-bold text-3xl">
    {user?.email?.charAt(0).toUpperCase() || 'U'}
  </AvatarFallback>
</Avatar>
```

---

## 🎯 Testing Checklist

Once implemented:

1. **Run SQL Migration**
   - [ ] Execute `RUN_THIS_ADD_PROFILE_IMAGE.sql` in Supabase
   - [ ] Verify column exists: `SELECT profile_image_url FROM profiles LIMIT 1;`

2. **Test Profile Image Fetching**
   - [ ] Connect a wallet that exists on Polymarket leaderboard
   - [ ] Check database: Profile image URL should be saved
   - [ ] Check console logs for "Profile image saved" message

3. **Test UI Display**
   - [ ] Navigation bar should show Polymarket profile picture
   - [ ] Picture should have correct aspect ratio
   - [ ] Falls back to initials if no picture

4. **Test Edge Cases**
   - [ ] User not on leaderboard (no profile picture) - should use initials
   - [ ] Invalid image URL - should fall back to initials
   - [ ] Premium vs non-premium users - both work

---

## 📊 Data Flow

```
User Connects Wallet
       ↓
Fetch from Polymarket Leaderboard API
       ↓
Extract profileImage URL
       ↓
Save to profiles.profile_image_url
       ↓
Fetch on page load
       ↓
Pass to Navigation component
       ↓
Display in Avatar with fallback to initials
```

---

## 🔍 Troubleshooting

### Profile image not showing
1. Check database: `SELECT id, email, profile_image_url FROM profiles WHERE id = 'user_id';`
2. Check console logs for "Profile image saved" message
3. Verify image URL is valid and accessible
4. Check browser network tab for image loading errors

### Image URL is null
- User might not be on Polymarket leaderboard (need significant trading volume)
- Username lookup might have failed
- API might be temporarily unavailable (non-critical, will retry on next connection)

### Wrong image showing
- Check that wallet address matches
- Verify leaderboard API is returning correct trader data
- Check for any caching issues

---

## 🚀 Future Enhancements

1. **Periodic Refresh**
   - Add cron job to refresh profile images weekly
   - Update when user reconnects wallet

2. **Manual Upload**
   - Allow users to upload custom profile picture
   - Fallback to Polymarket image if custom not set

3. **Image Optimization**
   - Use Next.js Image component for optimization
   - Add CDN caching layer
   - Resize/compress images for faster loading

4. **Profile Page Integration**
   - Show Polymarket badge/verification
   - Link to Polymarket profile
   - Show Polymarket stats

---

## 📝 Summary

**Status**: 🟡 Partially Implemented

**Completed**:
- ✅ Database migration file created
- ✅ API endpoints updated to return profile images
- ✅ Navigation component updated to display images

**Remaining**:
- ⏳ Run database migration
- ⏳ Update profile page to fetch and pass profile image
- ⏳ Add logic to save profile image on wallet connection
- ⏳ Update all pages that use Navigation component
- ⏳ Test end-to-end flow

**Estimated Time to Complete**: 30-45 minutes


