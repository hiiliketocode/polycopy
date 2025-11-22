# Wallet Connection Feature

## Overview
Users can connect their Polymarket account to their Polycopy profile using **two methods**:
1. **By Username** (Recommended) - Easier, just enter your Polymarket username
2. **By Wallet Address** - Manual entry of Ethereum wallet address

This allows the app to track their trading activity and positions on Polymarket.

---

## Database Setup

### 1. Run the SQL Migration

**Option A: Using Supabase SQL Editor (Recommended for quick setup)**
1. Go to your Supabase Dashboard: `https://supabase.com/dashboard`
2. Select your project
3. Navigate to "SQL Editor"
4. Click "New Query"
5. Copy the entire content of `RUN_THIS_ADD_WALLET.sql`
6. Paste and click "Run"
7. Verify the output shows both columns were added

**Option B: Using Supabase CLI (For version-controlled migrations)**
1. The migration file is already in `supabase/migrations/004_add_wallet_to_profiles.sql`
2. Run: `supabase db push`

### 2. Database Changes
The migration adds:
- **Column**: `wallet_address TEXT` (nullable)
- **Column**: `polymarket_username TEXT` (nullable)
- **Index**: `profiles_wallet_address_idx` for fast wallet lookups
- **Index**: `profiles_polymarket_username_idx` for fast username lookups
- **Comments**: Documentation for both columns

---

## How It Works

### User Flow

#### Method 1: Connect by Username (Recommended) 👤

1. **Visit Profile Page** (`/profile`)
2. **Click "Connect Account"** button
3. **Username tab is selected by default** (shows "Recommended" badge)
4. **Enter Polymarket Username**
   - Example: `election_guru`
   - Can include or omit the `@` symbol
5. **Click Connect**
   - Frontend calls `/api/polymarket/lookup-user` API
   - API fetches user's profile page from Polymarket
   - Extracts wallet address from the page
   - Returns both username and wallet address
6. **Save to Database**
   - Both `polymarket_username` and `wallet_address` are saved
7. **Show Connected Status**
   - Green badge: "✓ Connected as @username"
   - Link to Polymarket profile
   - Abbreviated wallet address
   - Copy button

#### Method 2: Connect by Wallet Address 👛

1. **Visit Profile Page** (`/profile`)
2. **Click "Connect Account"** button
3. **Click "Wallet" tab**
4. **Enter Wallet Address**
   - Paste Ethereum address (0x...)
5. **Validation**
   - Checks if address starts with `0x`
   - Verifies it's exactly 42 characters long
   - Ensures it only contains hex characters (0-9, a-f, A-F)
6. **Save to Database**
   - Only `wallet_address` is saved
   - `polymarket_username` is set to NULL
7. **Show Connected Status**
   - Green badge: "✓ Wallet Connected"
   - Abbreviated address display (0xabc1...def4)
   - Copy button

### Disconnect

Users can disconnect their account:
1. Click **"Disconnect"** button
2. Confirm the action
3. Both `wallet_address` and `polymarket_username` are set to `NULL`
4. UI returns to "Connect Account" state

---

## API Route: Username Lookup

### Endpoint
`POST /api/polymarket/lookup-user`

### Request Body
```json
{
  "username": "election_guru"
}
```

### Response (Success)
```json
{
  "success": true,
  "username": "election_guru",
  "walletAddress": "0xabc123...",
  "profileUrl": "https://polymarket.com/profile/election_guru"
}
```

### Response (Error)
```json
{
  "error": "User not found on Polymarket"
}
```

### How It Works

1. **Clean Input**
   - Remove `@` symbol if present
   - Trim whitespace

2. **Fetch Profile Page**
   ```
   GET https://polymarket.com/profile/{username}
   ```

3. **Extract Wallet Address**
   - Try multiple methods:
     - Meta tags
     - Page content (regex for 0x addresses)
     - JSON-LD scripts
     - Data attributes
   - Return first valid address found

4. **Return Data**
   - Username (cleaned)
   - Wallet address (lowercase)
   - Profile URL

---

## UI Components

### Tab Selector (in Modal)

```
┌─────────────────────────────────┐
│ Connect Account             ×   │
│                                 │
│ ┌───────────────────────────┐   │
│ │ 👤 Username [Recommended] │   │
│ │        👛 Wallet          │   │
│ └───────────────────────────┘   │
│                                 │
│ ...content...                   │
└─────────────────────────────────┘
```

### Connected State (By Username)

```
┌─────────────────────────────────┐
│ Polymarket Account              │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ ✓ Connected as @username    │ │
│ │                             │ │
│ │ View Profile on Polymarket→ │ │
│ │                             │ │
│ │ 0xd7f8...9e4  📋           │ │
│ │                             │ │
│ │ Trades will be tracked      │ │
│ └─────────────────────────────┘ │
│                                 │
│ [Disconnect]                    │
└─────────────────────────────────┘
```

### Connected State (By Wallet)

```
┌─────────────────────────────────┐
│ Polymarket Account              │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ ✓ Wallet Connected          │ │
│ │                             │ │
│ │ 0xd7f8...9e4  📋           │ │
│ │                             │ │
│ │ Trades will be tracked      │ │
│ └─────────────────────────────┘ │
│                                 │
│ [Disconnect]                    │
└─────────────────────────────────┘
```

### Not Connected State

```
┌─────────────────────────────────┐
│ Polymarket Account              │
│                                 │
│ [🔗 Connect Account]            │
│                                 │
│ Connect your Polymarket account │
│ to track your trades            │
└─────────────────────────────────┘
```

### Username Method Modal

```
┌─────────────────────────────────┐
│ Connect Account             ×   │
│                                 │
│ [👤 Username ✓] [👛 Wallet]    │
│                                 │
│ Enter your Polymarket username. │
│ We'll find your wallet address. │
│                                 │
│ Polymarket Username             │
│ ┌─────────────────────────────┐ │
│ │ e.g., election_guru         │ │
│ └─────────────────────────────┘ │
│                                 │
│ 💡 Easiest method! Your username│
│ is in your profile URL:         │
│ polymarket.com/profile/username │
│                                 │
│ [Cancel]         [Connect]      │
└─────────────────────────────────┘
```

### Wallet Method Modal

```
┌─────────────────────────────────┐
│ Connect Account             ×   │
│                                 │
│ [👤 Username] [👛 Wallet ✓]    │
│                                 │
│ Enter your Polymarket wallet    │
│ address (Ethereum address).     │
│                                 │
│ Wallet Address                  │
│ ┌─────────────────────────────┐ │
│ │ 0x...                       │ │
│ └─────────────────────────────┘ │
│                                 │
│ 💡 Find in Polymarket settings  │
│ or MetaMask wallet              │
│                                 │
│ [Cancel]         [Connect]      │
└─────────────────────────────────┘
```

---

## Validation

### Username Validation
- **Not empty** after trimming
- `@` symbol is automatically removed
- No specific format requirements

### Wallet Address Validation
- **Format**: `0x[a-fA-F0-9]{40}`
- **Length**: Exactly 42 characters (including 0x)
- **Characters**: 0-9, a-f, A-F (hexadecimal)

**Examples:**
- ✅ Valid: `0xd7f85d0eb0fe0732ca38d9107ad0d4d01b1289e4`
- ✅ Valid: `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`
- ❌ Invalid: `d7f85d0eb0fe0732ca38d9107ad0d4d01b1289e4` (missing 0x)
- ❌ Invalid: `0xabc123` (too short)
- ❌ Invalid: `0xGGGGG...` (invalid hex characters)

---

## Technical Implementation

### Frontend (`app/profile/page.tsx`)

**State Management:**
```typescript
const [walletAddress, setWalletAddress] = useState<string | null>(null);
const [polymarketUsername, setPolymarketUsername] = useState<string | null>(null);
const [showWalletModal, setShowWalletModal] = useState(false);
const [connectionMethod, setConnectionMethod] = useState<'username' | 'wallet'>('username');
const [usernameInput, setUsernameInput] = useState('');
const [walletInput, setWalletInput] = useState('');
const [connectionError, setConnectionError] = useState('');
const [savingConnection, setSavingConnection] = useState(false);
```

**Connect by Username:**
```typescript
// Call API to lookup username
const response = await fetch('/api/polymarket/lookup-user', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: usernameInput.trim() })
});

const data = await response.json();

// Save both to database
await supabase
  .from('profiles')
  .update({ 
    polymarket_username: data.username,
    wallet_address: data.walletAddress 
  })
  .eq('id', user.id);
```

**Connect by Wallet:**
```typescript
// Save wallet only, clear username
await supabase
  .from('profiles')
  .update({ 
    wallet_address: walletInput.trim().toLowerCase(),
    polymarket_username: null
  })
  .eq('id', user.id);
```

**Disconnect:**
```typescript
// Clear both fields
await supabase
  .from('profiles')
  .update({ 
    wallet_address: null,
    polymarket_username: null
  })
  .eq('id', user.id);
```

### Database Schema

**Table:** `profiles`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | - | Primary key (user ID) |
| email | TEXT | YES | - | User email |
| wallet_address | TEXT | YES | NULL | Ethereum wallet address |
| polymarket_username | TEXT | YES | NULL | Polymarket username |
| created_at | TIMESTAMP | NO | NOW() | Profile creation time |

**Indexes:**
- `profiles_wallet_address_idx` on `wallet_address`
- `profiles_polymarket_username_idx` on `polymarket_username`

---

## Advantages of Username Method

### Why Username is Recommended:

1. **Easier for Users** ✅
   - No need to find and copy long hex address
   - Just remember your username
   - Type a few characters vs 42-character address

2. **Better UX** 🎨
   - Show "Connected as @username" (more personal)
   - Link directly to Polymarket profile
   - Easier to verify you connected the right account

3. **More Memorable** 🧠
   - Users know their username
   - May not remember their wallet address

4. **Future Features** 🚀
   - Can display username throughout app
   - Show "@username" instead of "0xabc...def"
   - Better for social features

---

## Future Enhancements

### Planned Features:

1. **Wallet Verification** 🔐
   - Sign a message with MetaMask to verify ownership
   - Add `wallet_verified` boolean column
   - Show "Verified" badge

2. **Fetch Live Trading Data** 📊
   - Use Polymarket Data API: `https://data-api.polymarket.com/positions?user={wallet}`
   - Display user's own P&L, positions, trades
   - Show real-time performance stats on profile

3. **MetaMask Integration** 🦊
   - Click button → MetaMask popup
   - Auto-fill address from connected wallet
   - One-click connection (no manual paste)

4. **Multiple Accounts** 🎯
   - Allow users to connect multiple Polymarket accounts
   - New table: `user_wallets` (one-to-many)
   - Select "primary" account for display

5. **Auto-Refresh** 🔄
   - Periodically re-fetch username to update wallet if changed
   - Detect if user changes their Polymarket wallet

6. **Username Search** 🔍
   - Search for other Polycopy users by Polymarket username
   - Autocomplete username suggestions

7. **Profile Enrichment** ⭐
   - Fetch additional profile data from Polymarket
   - Avatar, bio, stats
   - Display on Polycopy profile

---

## Security Considerations

### Current Implementation (MVP):

✅ **Safe:**
- Only stores wallet address and username (public information)
- Address is stored in lowercase for consistency
- Uses Supabase RLS policies (users can only update their own profile)
- Validates format before saving
- No private keys or sensitive data
- Username lookup happens server-side (protects against CORS)

⚠️ **Limitations:**
- No ownership verification (anyone can paste any address or username)
- Address is visible in database (but it's public on blockchain anyway)
- Web scraping may break if Polymarket changes their page structure

### Future Security Enhancements:

1. **Signature Verification:**
   - Use Web3 to sign a message
   - Verify signature matches wallet address
   - Add `wallet_verified` field

2. **Rate Limiting:**
   - Limit username lookup attempts
   - Prevent spam/abuse of API

3. **Privacy Options:**
   - Let users hide wallet from public view
   - Only show verified wallets publicly

---

## Testing

### Test Scenarios:

**1. Connect by Username (Valid):**
```
Input: election_guru
Expected: ✅ Looks up wallet, saves both username and wallet
```

**2. Connect by Username (Not Found):**
```
Input: user_that_does_not_exist_12345
Expected: ❌ Error: "User not found on Polymarket"
```

**3. Connect by Username (With @ Symbol):**
```
Input: @election_guru
Expected: ✅ Removes @, looks up successfully
```

**4. Connect by Wallet (Valid):**
```
Input: 0xd7f85d0eb0fe0732ca38d9107ad0d4d01b1289e4
Expected: ✅ Saves wallet, username is null
```

**5. Connect by Wallet (Invalid Format):**
```
Input: 0xabc123
Expected: ❌ Error: "Invalid Ethereum address..."
```

**6. Switch Between Methods:**
```
Action: Connect by username → Disconnect → Connect by wallet
Expected: ✅ Username cleared, only wallet saved
```

**7. Reconnect:**
```
Action: Connect by username → Disconnect → Connect by username again
Expected: ✅ Works both times
```

**8. Persistence:**
```
Action: Connect → Refresh page
Expected: ✅ Still connected (persisted in database)
```

---

## Console Logging

For debugging, the feature logs:

```
🔍 Looking up username: election_guru
✅ Found wallet address: 0x...
💾 Saving wallet address...
✅ Connection saved successfully
🔌 Disconnecting...
✅ Disconnected successfully
❌ Error: [error message]
```

---

## Troubleshooting

### Problem: "User not found on Polymarket"

**Solutions:**
- Check spelling of username
- Make sure user has a public Polymarket profile
- Try visiting `https://polymarket.com/profile/{username}` directly
- If page exists but error persists, try wallet method instead

### Problem: Username lookup is slow

**Explanation:**
- Web scraping takes time (2-5 seconds is normal)
- Polymarket server response time varies
- This is why we show a loading spinner

**Solutions:**
- Be patient, it should complete within 5-10 seconds
- If it hangs, try again or use wallet method

### Problem: Can't save connection

**Solutions:**
- Check your internet connection
- Make sure you're logged in
- Try logging out and back in
- Check browser console for errors
- Verify database migration ran successfully

### Problem: Profile link doesn't work

**Explanation:**
- Only shown when connected by username
- Not shown when connected by wallet only

**Solution:**
- Disconnect and reconnect using username method

---

## How to Find Your Polymarket Username

### Method 1: From Your Profile URL
1. Log in to Polymarket
2. Click on your profile/avatar
3. Look at the URL in your browser
4. Format: `https://polymarket.com/profile/YOUR_USERNAME`
5. Copy `YOUR_USERNAME` part

### Method 2: From Account Settings
1. Go to Polymarket
2. Click Settings
3. Find "Username" or "Profile" section
4. Copy your username

### Method 3: From Any Trade
1. View any trade you made on Polymarket
2. Click on your name
3. You'll be taken to your profile
4. Check the URL for your username

---

## Support

If you encounter issues:

1. Check browser console for errors (F12 → Console tab)
2. Verify database migration ran successfully
3. Check Supabase RLS policies
4. Review the console logs in the app
5. Try the alternative connection method

For username lookup issues:
- Visit `https://polymarket.com/profile/{username}` to verify profile exists
- Check that the profile is public
- Try wallet method as alternative

For database issues:
- Run `RUN_THIS_ADD_WALLET.sql` in Supabase SQL Editor
- Verify both columns exist: `SELECT * FROM profiles LIMIT 1;`
