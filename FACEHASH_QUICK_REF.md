# FaceHash Quick Reference

## Installation
```bash
npm install facehash
```

## Import
```tsx
import { TraderAvatar, UserAvatar, MarketAvatar } from '@/components/ui/polycopy-avatar'
```

## Basic Usage

### Trader
```tsx
<TraderAvatar
  displayName="Alice"
  wallet="0x1234567890abcdef"
  src={profileImage}
  size={48}
/>
```

### User
```tsx
<UserAvatar
  identifier={user?.email}
  src={profileImageUrl}
  size={40}
/>
```

### Market
```tsx
<MarketAvatar
  marketName="Will Trump win?"
  src={marketAvatarUrl}
  size={56}
/>
```

### API Route (PNG)
```tsx
<img src="/api/avatar?name=alice@example.com&size=80" />
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | `string \| null` | - | Profile image URL |
| `name`/`displayName`/`identifier` | `string \| null` | - | Used for FaceHash generation |
| `size` | `number` | 40 | Avatar size in pixels |
| `showRing` | `boolean` | true | Show border ring |
| `ringColor` | `string` | `ring-slate-100` | Ring color class |
| `className` | `string` | - | Additional CSS classes |

## Brand Colors (Auto-Applied)
```tsx
colors: [
  '#FDB022', // Polycopy yellow
  '#F59E0B', // Amber-500
  '#D97706', // Amber-600
  '#FBBF24', // Yellow-400
  '#F97316', // Orange-500
]
```

## Key Features
- ✅ **Deterministic**: Same input = same face
- ✅ **Zero Dependencies**: No API calls
- ✅ **Brand Consistent**: Polycopy colors
- ✅ **Unique**: Each face is different
- ✅ **Fast**: < 1ms generation
- ✅ **Offline**: Works without network

## Demo
Visit: `http://localhost:3000/test/facehash-demo`

## Full Docs
See: `FACEHASH_INTEGRATION.md`
