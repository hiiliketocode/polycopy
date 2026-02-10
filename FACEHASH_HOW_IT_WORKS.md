# How FaceHash Avatar Assignment Works

## Overview

FaceHash avatars are **deterministic** - meaning the same input will always generate the same unique face. Here's how it works:

## The Algorithm

### 1. **Input String**
Each user/trader has a unique identifier:
- **Users**: Email address (e.g., `alice@example.com`)
- **Traders**: Display name or wallet address (e.g., `kch123` or `0x1234567890abcdef`)

### 2. **Normalization**
The input is normalized for consistency:
```tsx
const facehashName = name.trim().toLowerCase()
```

Examples:
- `"Alice@Example.com"` → `"alice@example.com"`
- `"KCH123"` → `"kch123"`
- `"0xABCD..."` → `"0xabcd..."`

### 3. **Hashing**
FaceHash uses a deterministic hash function on the normalized string to generate a unique number. This number is used as a "seed" for the avatar.

### 4. **Feature Generation**
The hash/seed determines:
- **Eye shape** (e.g., round, almond, dots)
- **Eye position** (spacing, height)
- **Mouth shape** (smile, line, oval)
- **Mouth position** (centered, offset)
- **Face color** (from the provided color palette)

### 5. **Rendering**
An SVG face is generated with those specific features.

## Key Points

### ✅ Deterministic
**Same input = Same face, always**

```
alice@example.com → Always gets Face A (😊 with ^v^ eyes)
bob@example.com   → Always gets Face B (😃 with ◠‿◠ eyes)
alice@example.com → Still Face A (same input!)
```

### ✅ Unique Per User
Different inputs generate different faces:

```
alice@example.com     → Face A (unique features)
alice2@example.com    → Face B (different features)
bob@example.com       → Face C (different features)
charlie@example.com   → Face D (different features)
```

### ✅ Consistent Across Sessions
The same user will **always** see the same face:
- On different devices
- After logging out and back in
- Today, tomorrow, next year
- Even if the app is redeployed

### ✅ No Database Storage
Avatar faces are generated on-the-fly based on the input string. Nothing is stored in a database about which face a user has.

## Examples

### Trader Avatars

```tsx
<TraderAvatar
  displayName="kch123"
  wallet="0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee"
  src={null}
/>
```

**How it's determined:**
1. Uses `displayName` if available → `"kch123"`
2. Normalizes to lowercase → `"kch123"`
3. Hashes `"kch123"` → generates seed (e.g., 482910)
4. Seed determines face features → unique face for kch123
5. **Result:** kch123 always gets the same face

If no displayName:
```tsx
<TraderAvatar
  displayName={null}
  wallet="0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee"
  src={null}
/>
```

**How it's determined:**
1. Falls back to `wallet` → `"0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee"`
2. Normalizes to lowercase → `"0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee"`
3. Hashes wallet → generates seed (e.g., 982471)
4. Seed determines face features → unique face for this wallet
5. **Result:** This wallet always gets the same face

### User Avatars

```tsx
<UserAvatar
  identifier="alice@example.com"
  src={null}
/>
```

**How it's determined:**
1. Uses `identifier` → `"alice@example.com"`
2. Normalizes to lowercase → `"alice@example.com"`
3. Hashes email → generates seed (e.g., 182904)
4. Seed determines face features → unique face for alice@example.com
5. **Result:** alice@example.com always gets the same face

## Technical Details

### The Hash Function
FaceHash uses a fast, deterministic hash function internally (likely FNV-1a or similar):

```
Input:  "alice@example.com"
Hash:   → 3421908234 (example number)
Modulo: → 3421908234 % 1000000 = 908234
Seed:   → 908234
```

### Feature Mapping
The seed is used to select features:

```typescript
// Pseudocode of how FaceHash works internally
const seed = hash(inputString)

const eyeShapes = ['round', 'almond', 'dots', 'lines', 'ovals']
const eyeShape = eyeShapes[seed % eyeShapes.length]

const mouthShapes = ['smile', 'line', 'oval', 'curve']
const mouthShape = mouthShapes[(seed / 10) % mouthShapes.length]

const eyeSpacing = (seed % 20) + 30 // Between 30-50px
const mouthHeight = (seed % 15) + 60 // Between 60-75px

// ... and so on for all features
```

## Why This Works

### 1. **Cryptographic Stability**
The hash function always produces the same output for the same input.

### 2. **Large Feature Space**
With multiple variables (eye shape, mouth shape, positions, etc.), there are thousands of possible unique faces.

### 3. **No Collisions (Practically)**
While theoretically two different inputs could produce the same face, the probability is extremely low with thousands of possible combinations.

### 4. **No External Dependencies**
Everything is computed locally - no API calls, no database lookups, no randomness.

## Color Consistency

### Current Implementation
All avatars now use the **same lighter yellow color** (`#FBBF24` - Yellow-400):

```tsx
colors: ['#FBBF24'] // Single consistent color
variant: 'solid'     // No gradients
intensity3d: 'subtle' // Subtle depth
```

This means:
- ✅ All avatars have the same background color
- ✅ Different faces, same color palette
- ✅ Consistent brand look

### Why Same Color?
- **Brand consistency**: All avatars feel cohesive
- **Visual harmony**: Users don't stand out with random colors
- **Predictable design**: Easier to design around
- **Professional look**: Clean, unified appearance

## Market Avatars (No FaceHash)

Market avatars do NOT use FaceHash:

```tsx
<MarketAvatar
  src={polymarketOfficialImage}
  marketName="Will Trump win 2024?"
/>
```

**Behavior:**
- ✅ Shows Polymarket's official market image if available
- ✅ Falls back to simple initials (e.g., "Wi") if no image
- ❌ Does NOT generate FaceHash avatars

**Why?**
- Markets should use official Polymarket branding
- Market images are provided by Polymarket API
- Consistency with Polymarket's design

## Summary

| Input Type | Example | Avatar Determined By |
|------------|---------|---------------------|
| **User** | `alice@example.com` | Email address (hashed) |
| **Trader (with name)** | `kch123` | Display name (hashed) |
| **Trader (no name)** | `0x1234...abcd` | Wallet address (hashed) |
| **Market** | Polymarket image | Official image (no hash) |

### Key Takeaways
1. ✅ **Deterministic**: Same input = same face
2. ✅ **Unique**: Different inputs = different faces
3. ✅ **Consistent**: Same face across all sessions/devices
4. ✅ **No storage**: Generated on-the-fly
5. ✅ **Same color**: All avatars use lighter yellow (#FBBF24)
6. ❌ **Markets excluded**: Markets use Polymarket images only
