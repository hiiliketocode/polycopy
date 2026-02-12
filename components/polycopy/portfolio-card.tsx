"use client"

import React from "react"

import { TrendingUp, TrendingDown, Users, Calendar, BarChart3, Target, Zap } from "lucide-react"

export type CardTheme = "cream" | "dark" | "profit" | "fire"

interface PortfolioCardProps {
  username: string
  memberSince: string
  totalPnL: number
  roi: number
  winRate: number
  totalVolume: number
  numberOfTrades: number
  followingCount: number
  avatarUrl?: string
  theme?: CardTheme
}

const themeStyles = {
  cream: {
    shell: "from-stone-200 via-stone-100 to-stone-200",
    card: "bg-white",
    gradient: "from-[#fff5eb]/60 via-[#fffaf5]/30 to-transparent",
    orb: "bg-orange-100/20",
    text: "text-stone-800",
    textMuted: "text-stone-500",
    textSubtle: "text-stone-400",
    accent: "text-amber-600",
    accentBg: "bg-amber-500/10",
    accentSolid: "bg-amber-500",
    border: "border-stone-200/60",
    statBg: "bg-white/80",
    logo: "text-stone-600",
    logoMuted: "text-stone-400",
  },
  dark: {
    shell: "from-slate-600 via-slate-500 to-slate-600",
    card: "from-[#1a2332] via-[#1e2838] to-[#1a2332]",
    gradient: "from-slate-700/30 via-transparent to-transparent",
    orb: "bg-slate-600/20",
    text: "text-white",
    textMuted: "text-slate-400",
    textSubtle: "text-slate-500",
    accent: "text-slate-300",
    accentBg: "bg-slate-700/50",
    accentSolid: "bg-slate-600",
    border: "border-slate-600/50",
    statBg: "bg-slate-800/60",
    logo: "text-white",
    logoMuted: "text-slate-500",
  },
  profit: {
    shell: "from-zinc-200 via-zinc-100 to-zinc-200",
    card: "from-emerald-950 via-emerald-900 to-teal-950",
    gradient: "from-emerald-500/20 via-emerald-600/10 to-teal-500/20",
    orb: "bg-emerald-500/30",
    text: "text-white",
    textMuted: "text-emerald-200/60",
    textSubtle: "text-emerald-300/40",
    accent: "text-emerald-400",
    accentBg: "bg-emerald-500/20",
    accentSolid: "bg-emerald-500",
    border: "border-emerald-400/20",
    statBg: "bg-emerald-800/30",
    logo: "text-white",
    logoMuted: "text-emerald-300/50",
  },
  fire: {
    shell: "from-rose-300 via-rose-200 to-rose-300",
    card: "bg-[#a83246]",
    gradient: "from-[#8a2538]/60 via-[#8a2538]/30 to-transparent",
    orb: "bg-rose-400/10",
    text: "text-white",
    textMuted: "text-rose-100/70",
    textSubtle: "text-rose-200/50",
    accent: "text-rose-200",
    accentBg: "bg-white/15",
    accentSolid: "bg-rose-500",
    border: "border-white/10",
    statBg: "bg-white/90",
    statText: "text-stone-800",
    statTextMuted: "text-stone-500",
    logo: "text-white",
    logoMuted: "text-rose-200/50",
  },
}

export function PortfolioCard({
  username,
  memberSince,
  totalPnL,
  roi,
  winRate,
  totalVolume,
  numberOfTrades,
  followingCount,
  avatarUrl,
  theme = "cream",
}: PortfolioCardProps) {
  const isProfit = totalPnL >= 0
  const styles = themeStyles[theme]

  const formatCurrency = (value: number) => {
    const absValue = Math.abs(value)
    if (absValue >= 1000000) {
      return `${(value / 1000000).toFixed(2)}M`
    }
    if (absValue >= 1000) {
      return `${(value / 1000).toFixed(1)}K`
    }
    return value.toFixed(2)
  }

const formatVolume = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`
    }
    return `$${value.toFixed(0)}`
  }

  // Determine P&L display color based on actual profit/loss
  const pnlColor = isProfit ? "text-emerald-500" : "text-rose-500"

  return (
    <div className="relative w-[900px]">
      {/* Inner card */}
      <div
        className={`relative w-full ${theme === "cream" || theme === "fire" ? styles.card : `bg-gradient-to-br ${styles.card}`} rounded-[60px] overflow-hidden shadow-2xl`}
      >
        {/* Gradient overlay */}
        <div
          className={`absolute inset-0 bg-gradient-to-r ${styles.gradient}`}
        />

        {/* Noise texture */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Glowing orb effect */}
        <div
          className={`absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] rounded-full blur-3xl ${styles.orb}`}
        />

        {/* Content container */}
        <div className="relative z-10 flex flex-col p-12 pt-20 pb-10">
            {/* Header - Logo and badge */}
            <div className="flex items-center justify-between mb-10">
              {/* Polycopy Full Logo */}
              <img
                src={theme === "cream" ? "/logos/polycopy-logo-primary.png" : "/logos/polycopy-logo-white.png"}
                alt="Polycopy"
                className="h-12"
              />

              {/* Verification badge */}
              <div className={`flex items-center gap-3 px-5 py-2 rounded-full ${styles.statBg} backdrop-blur-sm`}>
                <div className="w-4 h-4 rounded-full bg-emerald-400 animate-pulse" />
                <span className={`${theme === "cream" || theme === "fire" ? "text-stone-600" : styles.text} opacity-80 text-base font-medium`}>
                  VERIFIED TRADER
                </span>
              </div>
            </div>

            {/* Username */}
            <div className="mb-10">
              <div className="flex items-center gap-6">
                {avatarUrl ? (
                  <img
                    src={avatarUrl || "/placeholder.svg"}
                    alt={username}
                    className={`w-[100px] h-[100px] rounded-full border-4 ${styles.border}`}
                  />
                ) : (
                  <div className={`w-[100px] h-[100px] rounded-full ${styles.accentBg} flex items-center justify-center ${styles.text} text-4xl font-bold`}>
                    {username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 className={`${styles.text} text-5xl font-bold tracking-tight`}>
                    {username}
                  </h2>
                  <p className={`${styles.textMuted} text-xl flex items-center gap-3 mt-1`}>
                    <Calendar className="w-6 h-6" />
                    Member since {memberSince}
                  </p>
                  <p className={`${styles.textMuted} text-xl flex items-center gap-3 mt-1`}>
                    <Users className="w-6 h-6" />
                    Following {followingCount} traders
                  </p>
                </div>
              </div>
            </div>

            {/* Main P&L Display */}
            <div
              className={`mb-8 p-8 rounded-3xl ${styles.statBg} backdrop-blur-sm border-2 ${styles.border}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className={`${theme === "cream" || theme === "fire" ? "text-stone-500" : styles.textMuted} text-lg font-medium uppercase tracking-wider mb-2`}>
                    Total P&L
                  </p>
                  <div className="flex items-baseline gap-3">
                    <span className={`text-7xl font-bold ${pnlColor}`}>
                      {isProfit ? "+" : "-"}${formatCurrency(Math.abs(totalPnL))}
                    </span>
                  </div>
                </div>
                <div
                  className={`w-28 h-28 rounded-full ${theme === "cream" || theme === "fire" ? "bg-stone-100" : styles.accentBg} flex items-center justify-center`}
                >
                  {isProfit ? (
                    <TrendingUp className={`w-14 h-14 ${pnlColor}`} />
                  ) : (
                    <TrendingDown className={`w-14 h-14 ${pnlColor}`} />
                  )}
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-6 mb-10">
              <StatBox
                icon={<TrendingUp className="w-8 h-8" />}
                label="ROI"
                value={`${isProfit ? "+" : ""}${roi.toFixed(1)}%`}
                highlight={roi >= 0}
                styles={styles}
                theme={theme}
              />
              <StatBox
                icon={<Target className="w-8 h-8" />}
                label="Win Rate"
                value={`${winRate.toFixed(1)}%`}
                highlight={winRate >= 50}
                styles={styles}
                theme={theme}
              />
              <StatBox
                icon={<Zap className="w-8 h-8" />}
                label="Copy Trades"
                value={numberOfTrades.toString()}
                styles={styles}
                theme={theme}
              />
              <StatBox
                icon={<BarChart3 className="w-8 h-8" />}
                label="Volume"
                value={formatVolume(totalVolume)}
                styles={styles}
                theme={theme}
              />
            </div>

            {/* Footer */}
            <div className={`flex items-center justify-between pt-6 border-t-2 ${styles.border}`}>
              <span className={`${styles.textSubtle} text-lg`}>polycopy.app</span>
              <span className={`${styles.textSubtle} text-lg font-mono`}>
                {new Date().toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>
      </div>
  )
}

function StatBox({
  icon,
  label,
  value,
  highlight = false,
  styles,
  theme,
}: {
  icon: React.ReactNode
  label: string
  value: string
  highlight?: boolean
  styles: typeof themeStyles.cream
  theme: CardTheme
}) {
  // Fire theme has white stat boxes with dark text
  const isLightStatBox = theme === "cream" || theme === "fire"
  const textColor = isLightStatBox ? "text-stone-800" : styles.text
  const mutedColor = isLightStatBox ? "text-stone-500" : styles.textMuted
  const subtleColor = isLightStatBox ? "text-stone-400" : styles.textSubtle

  return (
    <div className={`p-6 rounded-2xl ${styles.statBg} backdrop-blur-sm border-2 ${styles.border}`}>
      <div className="flex items-center gap-3 mb-2">
        <span className={subtleColor}>{icon}</span>
        <span className={`${mutedColor} text-base font-medium uppercase tracking-wider`}>
          {label}
        </span>
      </div>
      <span
        className={`text-3xl font-bold ${highlight ? "text-emerald-500" : textColor}`}
      >
        {value}
      </span>
    </div>
  )
}
