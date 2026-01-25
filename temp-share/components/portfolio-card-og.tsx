/**
 * Portfolio Card for @vercel/og (OG Image Generation)
 * 
 * Matches the interactive card design EXACTLY.
 * 
 * Constraints followed:
 * - Inline styles only (no Tailwind classes)
 * - Flexbox layout (no CSS Grid)
 * - Inline SVGs (no icon libraries)
 * - No backdrop-filter/blur
 * - System fonts only
 * 
 * Dimensions: 380px x 507px (3:4 aspect ratio)
 */

export type CardTheme = "cream" | "dark" | "profit" | "fire"

interface PortfolioCardOGProps {
  username: string
  memberSince: string
  totalPnL: number
  roi: number
  winRate: number
  totalVolume: number
  numberOfTrades: number
  followingCount: number
  theme?: CardTheme
}

// ============================================================================
// THEME DEFINITIONS - Exact hex values from interactive card
// ============================================================================
const themes = {
  cream: {
    // Outer shell: from-stone-200 via-stone-100 to-stone-200
    shell: "linear-gradient(to bottom, #e7e5e4, #f5f5f4, #e7e5e4)",
    lanyardHole: "#d4d4d4", // zinc-300
    // Inner card: bg-white
    cardBg: "#ffffff",
    // Gradient overlay: from-[#fff5eb]/60 via-[#fffaf5]/30 to-transparent (left to right)
    gradientOverlay: "linear-gradient(to right, rgba(255, 245, 235, 0.6) 0%, rgba(255, 250, 245, 0.3) 30%, transparent 100%)",
    // Text colors
    text: "#292524", // stone-800
    textMuted: "#78716c", // stone-500
    textSubtle: "#a8a29e", // stone-400
    // Stat boxes: bg-white/80, border-stone-200/60
    statBg: "rgba(255, 255, 255, 0.8)",
    border: "rgba(231, 229, 228, 0.6)", // stone-200/60
    // Avatar/accent: bg-amber-500/10
    accentBg: "rgba(245, 158, 11, 0.1)",
    // Icon circle in P&L: bg-stone-100
    iconCircleBg: "#f5f5f4",
  },
  dark: {
    // Outer shell: from-slate-600 via-slate-500 to-slate-600
    shell: "linear-gradient(to bottom, #475569, #64748b, #475569)",
    lanyardHole: "#334155", // slate-700
    // Inner card: from-[#1a2332] via-[#1e2838] to-[#1a2332]
    cardBg: "linear-gradient(to bottom right, #1a2332, #1e2838, #1a2332)",
    // Gradient overlay: from-slate-700/30 via-transparent to-transparent
    gradientOverlay: "linear-gradient(to right, rgba(51, 65, 85, 0.3) 0%, transparent 100%)",
    text: "#ffffff",
    textMuted: "#94a3b8", // slate-400
    textSubtle: "#64748b", // slate-500
    statBg: "rgba(30, 41, 59, 0.6)", // slate-800/60
    border: "rgba(71, 85, 105, 0.5)", // slate-600/50
    accentBg: "rgba(71, 85, 105, 0.5)", // slate-700/50
    iconCircleBg: "rgba(255, 255, 255, 0.1)",
  },
  profit: {
    // Outer shell: from-zinc-200 via-zinc-100 to-zinc-200
    shell: "linear-gradient(to bottom, #e4e4e7, #f4f4f5, #e4e4e7)",
    lanyardHole: "#d4d4d4", // zinc-300
    // Inner card: from-emerald-950 via-emerald-900 to-teal-950
    cardBg: "linear-gradient(to bottom right, #022c22, #064e3b, #134e4a)",
    // Gradient overlay: from-emerald-500/20 via-emerald-600/10 to-teal-500/20
    gradientOverlay: "linear-gradient(to right, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.1) 50%, rgba(20, 184, 166, 0.2) 100%)",
    text: "#ffffff",
    textMuted: "rgba(167, 243, 208, 0.6)", // emerald-200/60
    textSubtle: "rgba(110, 231, 183, 0.4)", // emerald-300/40
    statBg: "rgba(6, 78, 59, 0.3)", // emerald-800/30
    border: "rgba(52, 211, 153, 0.2)", // emerald-400/20
    accentBg: "rgba(16, 185, 129, 0.2)", // emerald-500/20
    iconCircleBg: "rgba(16, 185, 129, 0.2)",
  },
  fire: {
    // Outer shell: from-rose-300 via-rose-200 to-rose-300
    shell: "linear-gradient(to bottom, #fda4af, #fecdd3, #fda4af)",
    lanyardHole: "#d4d4d4", // zinc-300
    // Inner card: bg-[#a83246]
    cardBg: "#a83246",
    // Gradient overlay: from-[#8a2538]/60 via-[#8a2538]/30 to-transparent
    gradientOverlay: "linear-gradient(to right, rgba(138, 37, 56, 0.6) 0%, rgba(138, 37, 56, 0.3) 30%, transparent 100%)",
    text: "#ffffff",
    textMuted: "rgba(255, 228, 230, 0.7)", // rose-100/70
    textSubtle: "rgba(254, 205, 211, 0.5)", // rose-200/50
    statBg: "rgba(255, 255, 255, 0.9)", // bg-white/90
    border: "rgba(255, 255, 255, 0.1)",
    accentBg: "rgba(255, 255, 255, 0.15)",
    iconCircleBg: "#f5f5f4", // stone-100
  },
}

// ============================================================================
// INLINE SVG ICONS - Matching Lucide icons exactly
// ============================================================================
const CalendarIcon = ({ color }: { color: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)

const UsersIcon = ({ color }: { color: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const TrendingUpIcon = ({ color, size = 16 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
)

const TrendingDownIcon = ({ color, size = 16 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
    <polyline points="17 18 23 18 23 12" />
  </svg>
)

const TargetIcon = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
)

const ZapIcon = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
)

const BarChart3Icon = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" />
    <path d="M18 17V9" />
    <path d="M13 17V5" />
    <path d="M8 17v-3" />
  </svg>
)

// ============================================================================
// POLYCOPY LOGO - Two overlapping rounded squares
// ============================================================================
const PolycopyLogo = ({ isDark = false }: { isDark?: boolean }) => (
  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
    <div style={{ position: "relative", width: "24px", height: "24px" }}>
      {/* Back square (lighter yellow) */}
      <div
        style={{
          position: "absolute",
          top: "0",
          right: "0",
          width: "18px",
          height: "18px",
          borderRadius: "5px",
          backgroundColor: "#F6C344",
          opacity: 0.6,
        }}
      />
      {/* Front square (darker orange) */}
      <div
        style={{
          position: "absolute",
          bottom: "0",
          left: "0",
          width: "18px",
          height: "18px",
          borderRadius: "5px",
          backgroundColor: "#F6A623",
        }}
      />
    </div>
    <span
      style={{
        fontSize: "16px",
        fontWeight: 700,
        color: isDark ? "#ffffff" : "#292524",
        letterSpacing: "-0.02em",
      }}
    >
      Polycopy
    </span>
  </div>
)

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function formatCurrency(value: number): string {
  const absValue = Math.abs(value)
  if (absValue >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`
  }
  if (absValue >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return value.toFixed(2)
}

function formatVolume(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`
  }
  return `$${value.toFixed(0)}`
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export function PortfolioCardOG({
  username,
  memberSince,
  totalPnL,
  roi,
  winRate,
  totalVolume,
  numberOfTrades,
  followingCount,
  theme = "cream",
}: PortfolioCardOGProps) {
  const t = themes[theme]
  const isProfit = totalPnL >= 0
  const pnlColor = isProfit ? "#10B981" : "#EF4444" // emerald-500 / rose-500
  
  // Cream and fire themes have light stat boxes with dark text
  const isLightStatBox = theme === "cream" || theme === "fire"
  const statText = isLightStatBox ? "#292524" : t.text // stone-800
  const statTextMuted = isLightStatBox ? "#78716c" : t.textMuted // stone-500
  const statTextSubtle = isLightStatBox ? "#a8a29e" : t.textSubtle // stone-400
  const badgeTextColor = isLightStatBox ? "#57534e" : t.text // stone-600

  return (
    <div
      style={{
        width: "380px",
        height: "507px",
        display: "flex",
        position: "relative",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* ================================================================== */}
      {/* OUTER SHELL - Metallic gradient frame (3px padding) */}
      {/* ================================================================== */}
      <div
        style={{
          position: "absolute",
          inset: "0",
          background: t.shell,
          borderRadius: "28px",
          padding: "3px",
          display: "flex",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
      >
        {/* ================================================================ */}
        {/* LANYARD HOLE - Centered at top of shell */}
        {/* ================================================================ */}
        <div
          style={{
            position: "absolute",
            top: "12px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "48px",
            height: "16px",
            backgroundColor: t.lanyardHole,
            borderRadius: "9999px",
            boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.1)",
          }}
        />

        {/* ================================================================ */}
        {/* INNER CARD */}
        {/* ================================================================ */}
        <div
          style={{
            width: "100%",
            height: "100%",
            background: t.cardBg,
            borderRadius: "25px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
          {/* Gradient overlay (left to right) */}
          <div
            style={{
              position: "absolute",
              inset: "0",
              background: t.gradientOverlay,
              pointerEvents: "none",
            }}
          />

          {/* ============================================================ */}
          {/* CONTENT CONTAINER - p-6 pt-10 (24px padding, 40px top) */}
          {/* ============================================================ */}
          <div
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              height: "100%",
              padding: "24px",
              paddingTop: "40px",
            }}
          >
            {/* ========================================================== */}
            {/* HEADER - Logo + Verified Badge (mb-6 = 24px) */}
            {/* ========================================================== */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "24px",
              }}
            >
              <PolycopyLogo isDark={theme !== "cream"} />

              {/* Verified Badge: px-2.5 py-1, rounded-full */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 10px",
                  borderRadius: "9999px",
                  backgroundColor: t.statBg,
                }}
              >
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: "#34D399", // emerald-400
                  }}
                />
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 500,
                    color: badgeTextColor,
                    opacity: 0.8,
                  }}
                >
                  VERIFIED TRADER
                </span>
              </div>
            </div>

            {/* ========================================================== */}
            {/* USER INFO - Avatar + Name + Details (mb-6 = 24px) */}
            {/* ========================================================== */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "24px",
              }}
            >
              {/* Avatar: w-12 h-12 (48px) */}
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  backgroundColor: t.accentBg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px",
                  fontWeight: 700,
                  color: t.text,
                }}
              >
                {username.charAt(0).toUpperCase()}
              </div>

              {/* Name and meta info */}
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {/* Username: text-2xl (24px) */}
                <span
                  style={{
                    fontSize: "24px",
                    fontWeight: 700,
                    color: t.text,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {username}
                </span>
                {/* Member since: text-sm (14px) with icon */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <CalendarIcon color={t.textMuted} />
                  <span style={{ fontSize: "12px", color: t.textMuted }}>
                    Member since {memberSince}
                  </span>
                </div>
                {/* Following count: text-sm (14px) with icon */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <UsersIcon color={t.textMuted} />
                  <span style={{ fontSize: "12px", color: t.textMuted }}>
                    Following {followingCount} traders
                  </span>
                </div>
              </div>
            </div>

            {/* ========================================================== */}
            {/* P&L DISPLAY - p-4 rounded-2xl (mb-6 = 24px) */}
            {/* ========================================================== */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px",
                borderRadius: "16px",
                backgroundColor: t.statBg,
                border: `1px solid ${t.border}`,
                marginBottom: "24px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {/* Label: text-xs uppercase */}
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 500,
                    color: statTextMuted,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Total P&L
                </span>
                {/* Value: text-4xl (36px) */}
                <span
                  style={{
                    fontSize: "32px",
                    fontWeight: 700,
                    color: pnlColor,
                    letterSpacing: "-0.02em",
                    lineHeight: 1,
                  }}
                >
                  {isProfit ? "+" : "-"}${formatCurrency(Math.abs(totalPnL))}
                </span>
              </div>

              {/* Trend icon circle: w-14 h-14 (56px) */}
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  backgroundColor: t.iconCircleBg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isProfit ? (
                  <TrendingUpIcon color={pnlColor} size={28} />
                ) : (
                  <TrendingDownIcon color={pnlColor} size={28} />
                )}
              </div>
            </div>

            {/* ========================================================== */}
            {/* STATS GRID - 2x2 with gap-3 (12px) */}
            {/* ========================================================== */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                flex: 1,
              }}
            >
              {/* Row 1: ROI + Win Rate */}
              <div style={{ display: "flex", gap: "12px", flex: 1 }}>
                {/* ROI Box: p-3 rounded-xl */}
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    padding: "12px",
                    borderRadius: "12px",
                    backgroundColor: t.statBg,
                    border: `1px solid ${t.border}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <TrendingUpIcon color={statTextSubtle} size={16} />
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 500,
                        color: statTextMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      ROI
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: "18px",
                      fontWeight: 700,
                      color: roi >= 0 ? "#10B981" : "#EF4444",
                    }}
                  >
                    {roi >= 0 ? "+" : ""}{roi.toFixed(1)}%
                  </span>
                </div>

                {/* Win Rate Box */}
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    padding: "12px",
                    borderRadius: "12px",
                    backgroundColor: t.statBg,
                    border: `1px solid ${t.border}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <TargetIcon color={statTextSubtle} />
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 500,
                        color: statTextMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Win Rate
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: "18px",
                      fontWeight: 700,
                      color: winRate >= 50 ? "#10B981" : statText,
                    }}
                  >
                    {winRate.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Row 2: Copy Trades + Volume */}
              <div style={{ display: "flex", gap: "12px", flex: 1 }}>
                {/* Copy Trades Box */}
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    padding: "12px",
                    borderRadius: "12px",
                    backgroundColor: t.statBg,
                    border: `1px solid ${t.border}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <ZapIcon color={statTextSubtle} />
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 500,
                        color: statTextMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Copy Trades
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: "18px",
                      fontWeight: 700,
                      color: statText,
                    }}
                  >
                    {numberOfTrades}
                  </span>
                </div>

                {/* Volume Box */}
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    padding: "12px",
                    borderRadius: "12px",
                    backgroundColor: t.statBg,
                    border: `1px solid ${t.border}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <BarChart3Icon color={statTextSubtle} />
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 500,
                        color: statTextMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Volume
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: "18px",
                      fontWeight: 700,
                      color: statText,
                    }}
                  >
                    {formatVolume(totalVolume)}
                  </span>
                </div>
              </div>
            </div>

            {/* ========================================================== */}
            {/* FOOTER - pt-4 border-t */}
            {/* ========================================================== */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: "16px",
                borderTop: `1px solid ${t.border}`,
                marginTop: "auto",
              }}
            >
              <span style={{ fontSize: "11px", color: t.textSubtle }}>
                polycopy.app
              </span>
              <span
                style={{
                  fontSize: "11px",
                  color: t.textSubtle,
                  fontFamily: "monospace",
                }}
              >
                {new Date().toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// CONVENIENCE EXPORTS - Individual themed components
// ============================================================================
export const CreamCard = (props: Omit<PortfolioCardOGProps, "theme">) => (
  <PortfolioCardOG {...props} theme="cream" />
)

export const DarkCard = (props: Omit<PortfolioCardOGProps, "theme">) => (
  <PortfolioCardOG {...props} theme="dark" />
)

export const ProfitCard = (props: Omit<PortfolioCardOGProps, "theme">) => (
  <PortfolioCardOG {...props} theme="profit" />
)

export const FireCard = (props: Omit<PortfolioCardOGProps, "theme">) => (
  <PortfolioCardOG {...props} theme="fire" />
)
