# Portfolio Card OG Image - Exact Design Specification

This document provides the exact specifications to make the Vercel OG-generated card visually identical to the interactive React component.

## Overall Structure

The card has a **layered structure** (outside to inside):

```
1. Outer Shell (metallic frame with lanyard hole)
   └── 2. Inner Card (white/colored background)
       └── 3. Gradient Overlay (subtle warm tint)
           └── 4. Content (logo, user info, stats, footer)
```

## Dimensions

- **Total card size**: 380px × 507px (3:4 aspect ratio)
- **Outer shell padding**: 3px
- **Inner card size**: 374px × 501px (380 - 6px for shell padding)

## Layer 1: Outer Shell

The "physical card" metallic frame effect.

```
Position: absolute, fills entire 380x507 area
Border radius: 28px
Background: linear-gradient(to bottom, #e7e5e4, #f5f5f4, #e7e5e4)
           (stone-200 → stone-100 → stone-200)
Padding: 3px (creates the frame thickness)
Box shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) (shadow-2xl)
```

### Lanyard Hole (centered at top of shell)

```
Position: absolute, top: 12px, centered horizontally
Width: 48px
Height: 16px
Background: #d4d4d4 (zinc-300)
Border radius: 9999px (fully rounded / pill shape)
Box shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1)
```

## Layer 2: Inner Card

```
Position: relative, fills shell minus padding
Border radius: 25px
Background (cream): #ffffff (solid white)
Overflow: hidden
Box shadow: inset 0 2px 4px rgba(0, 0, 0, 0.05)
```

## Layer 3: Gradient Overlay (Cream Theme)

Very subtle warm tint on the LEFT side, fading to transparent.

```
Position: absolute, fills inner card
Background: linear-gradient(to right, 
  rgba(255, 245, 235, 0.6) 0%,    /* warm peach at 60% opacity */
  rgba(255, 250, 245, 0.3) 30%,   /* lighter at 30% opacity */
  transparent 100%                 /* fades to nothing */
)
```

## Layer 4: Content Container

```
Position: relative, z-index: 10
Display: flex, flex-direction: column
Height: 100%
Padding: 24px (p-6)
Padding-top: 40px (pt-10) - extra space for lanyard hole
```

---

## Content Elements (Top to Bottom)

### Header Row (Logo + Badge)

```
Display: flex
Justify-content: space-between
Align-items: center
Margin-bottom: 24px
```

**Logo**:
- Height: 24px (h-6)
- Auto width to maintain aspect ratio

**Verified Badge**:
```
Display: flex
Align-items: center
Gap: 6px
Padding: 4px 10px (py-1 px-2.5)
Border radius: 9999px (fully rounded)
Background: rgba(255, 255, 255, 0.8) (white at 80% opacity)
Backdrop-filter: blur(4px)
```

Badge dot:
```
Width: 8px
Height: 8px
Border radius: 50%
Background: #34d399 (emerald-400)
```

Badge text:
```
Font size: 12px (text-xs)
Font weight: 500 (medium)
Color: #57534e (stone-600)
Opacity: 0.8
Text: "VERIFIED TRADER"
```

### User Section

```
Margin-bottom: 24px
```

**Avatar**:
```
Width: 48px
Height: 48px
Border radius: 50%
Background: rgba(245, 158, 11, 0.1) (amber-500 at 10% opacity)
Display: flex, centered
Font size: 20px (text-xl)
Font weight: 700 (bold)
Color: #292524 (stone-800)
Content: First letter of username, uppercase
```

**User info container**:
```
Margin-left: 12px (gap-3 from avatar)
```

**Username**:
```
Font size: 24px (text-2xl)
Font weight: 700 (bold)
Color: #292524 (stone-800)
Letter-spacing: -0.025em (tracking-tight)
```

**Member since / Following lines**:
```
Font size: 14px (text-sm)
Color: #78716c (stone-500)
Display: flex
Align-items: center
Gap: 6px
```

Icon (Calendar/Users):
```
Width: 12px
Height: 12px
```

### P&L Section

```
Margin-bottom: 24px
Padding: 16px (p-4)
Border radius: 16px (rounded-2xl)
Background: rgba(255, 255, 255, 0.8)
Backdrop-filter: blur(4px)
Border: 1px solid rgba(231, 229, 228, 0.6) (stone-200 at 60% opacity)
```

**"TOTAL P&L" label**:
```
Font size: 12px (text-xs)
Font weight: 500 (medium)
Color: #78716c (stone-500)
Text-transform: uppercase
Letter-spacing: 0.05em (tracking-wider)
Margin-bottom: 4px
```

**P&L Value**:
```
Font size: 36px (text-4xl)
Font weight: 700 (bold)
Color (profit): #10b981 (emerald-500)
Color (loss): #ef4444 (rose-500)
Format: "+$47.8K" or "-$3.8K"
```

**Trend Icon Circle**:
```
Width: 56px
Height: 56px
Border radius: 50%
Background: #f5f5f4 (stone-100)
Display: flex, centered
```

Icon inside:
```
Width: 28px
Height: 28px
Color: matches P&L color (emerald-500 or rose-500)
Icon: TrendingUp (↗) for profit, TrendingDown (↘) for loss
```

### Stats Grid

```
Display: grid
Grid-template-columns: repeat(2, 1fr)
Gap: 12px (gap-3)
Flex: 1 (fills remaining space)
```

**Individual Stat Box**:
```
Padding: 12px (p-3)
Border radius: 12px (rounded-xl)
Background: rgba(255, 255, 255, 0.8)
Backdrop-filter: blur(4px)
Border: 1px solid rgba(231, 229, 228, 0.6)
```

**Stat label row**:
```
Display: flex
Align-items: center
Gap: 8px
Margin-bottom: 4px
```

Icon:
```
Width: 16px
Height: 16px
Color: #a8a29e (stone-400)
```

Label text:
```
Font size: 12px (text-xs)
Font weight: 500 (medium)
Color: #78716c (stone-500)
Text-transform: uppercase
Letter-spacing: 0.05em
```

**Stat value**:
```
Font size: 18px (text-lg)
Font weight: 700 (bold)
Color: #292524 (stone-800)
Color (if highlighted, e.g. ROI positive or win rate >= 50%): #10b981 (emerald-500)
```

**Stats displayed**:
1. ROI - icon: TrendingUp (or checkmark ✓)
2. Win Rate - icon: Target (or dot ●)
3. Copy Trades - icon: Zap (or lightning ⚡)
4. Volume - icon: BarChart3 (or money bag 💰)

### Footer

```
Display: flex
Justify-content: space-between
Align-items: center
Padding-top: 16px (pt-4)
Border-top: 1px solid rgba(231, 229, 228, 0.6)
```

**Left text (polycopy.app)**:
```
Font size: 12px (text-xs)
Color: #a8a29e (stone-400)
```

**Right text (date)**:
```
Font size: 12px (text-xs)
Color: #a8a29e (stone-400)
Font-family: monospace
Format: "Jan 2026"
```

---

## Color Reference (Cream Theme)

| Element | Tailwind Class | Hex Value |
|---------|---------------|-----------|
| Shell gradient start/end | stone-200 | #e7e5e4 |
| Shell gradient middle | stone-100 | #f5f5f4 |
| Lanyard hole | zinc-300 | #d4d4d4 |
| Inner card bg | white | #ffffff |
| Warm gradient | custom | rgba(255,245,235,0.6) |
| Primary text | stone-800 | #292524 |
| Muted text | stone-500 | #78716c |
| Subtle text | stone-400 | #a8a29e |
| Stat box bg | white/80 | rgba(255,255,255,0.8) |
| Borders | stone-200/60 | rgba(231,229,228,0.6) |
| Profit color | emerald-500 | #10b981 |
| Loss color | rose-500 | #ef4444 |
| Badge dot | emerald-400 | #34d399 |
| Icon circle bg | stone-100 | #f5f5f4 |
| Avatar bg | amber-500/10 | rgba(245,158,11,0.1) |

---

## Other Theme Colors

### Dark Theme
- Shell: slate-600 → slate-500 → slate-600 (#475569 → #64748b → #475569)
- Card: #1a2332 → #1e2838 (dark navy gradient)
- Text: white (#ffffff)
- Muted: slate-400 (#94a3b8)
- Stat bg: rgba(30,40,56,0.6)
- Borders: rgba(71,85,105,0.5)

### Profit Theme
- Shell: zinc-200 → zinc-100 → zinc-200 (#e4e4e7 → #f4f4f5 → #e4e4e7)
- Card: emerald-950 → emerald-900 → teal-950 (deep green gradient)
- Text: white (#ffffff)
- Stat bg: rgba(6,78,59,0.3)

### Fire Theme
- Shell: rose-300 → rose-200 → rose-300 (#fda4af → #fecdd3 → #fda4af)
- Card: solid #a83246 (dark red/maroon)
- Gradient overlay: rgba(138,37,56,0.6) on left
- Text: white on card, dark on stat boxes
- Stat bg: rgba(255,255,255,0.9) (white boxes like cream)

---

## Key Visual Details Often Missed

1. **The outer shell is essential** - without it, the card looks flat
2. **The lanyard hole** - small detail but adds authenticity
3. **Gradient direction** - warm tint comes from LEFT, not top
4. **Stat box transparency** - 80% white, not solid white
5. **Backdrop blur** - adds depth to stat boxes
6. **Border opacity** - borders are subtle at 60% opacity
7. **Font weights** - labels are medium (500), values are bold (700)
8. **Letter spacing** - labels have tracking-wider (0.05em)
9. **The inner shadow** on the card creates depth
10. **Padding consistency** - 24px throughout, except 40px top for lanyard space
