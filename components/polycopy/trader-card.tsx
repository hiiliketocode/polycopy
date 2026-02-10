"use client"

import React from "react"
import { TrendingUp, TrendingDown, Target, BarChart3, Trophy } from "lucide-react"
import { ResponsiveContainer, AreaChart, Area } from "recharts"
import { TraderAvatar } from "@/components/ui/polycopy-avatar"

export type CardTheme = "cream" | "dark" | "profit" | "fire"

interface TraderCardProps {
  displayName: string
  walletAddress: string
  profileImage?: string | null
  isTopHundred: boolean
  memberSince?: string
  totalPnL: number
  roi: number
  winRate: number
  volume: number
  trades: number
  avgReturn: number
  dailyPnlData: Array<{ date: string; pnl: number; cumulative: number }>
  timePeriod: '1D' | '7D' | '30D' | '3M' | '6M' | 'ALL'
  timePeriodLabel: string
  theme?: CardTheme
  rank?: number | null
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
    chartColor: "#f59e0b",
    chartGradient: ["#fef3c7", "#fef3c700"],
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
    chartColor: "#94a3b8",
    chartGradient: ["#475569", "#47556900"],
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
    chartColor: "#10b981",
    chartGradient: ["#34d399", "#34d39900"],
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
    chartColor: "#fb7185",
    chartGradient: ["#fda4af", "#fda4af00"],
  },
}

export function TraderCard({
  displayName,
  walletAddress,
  profileImage,
  isTopHundred,
  memberSince,
  totalPnL,
  roi,
  winRate,
  volume,
  avgReturn,
  dailyPnlData,
  timePeriodLabel,
  theme = "cream",
  rank,
}: TraderCardProps) {
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

  const formatAverageDaily = (value: number) => {
    const absValue = Math.abs(value)
    const sign = value >= 0 ? "+" : "-"
    if (absValue >= 1000000) {
      return `${sign}$${(absValue / 1000000).toFixed(2)}M`
    }
    if (absValue >= 1000) {
      return `${sign}$${(absValue / 1000).toFixed(2)}K`
    }
    return `${sign}$${absValue.toFixed(2)}`
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

  const truncateWallet = (address: string): string => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // Determine P&L display color based on actual profit/loss
  const pnlColor = isProfit ? "text-emerald-500" : "text-rose-500"

  return (
    <div className="relative w-[900px]">
      {/* Outer shell - the "physical card" effect */}
      <div className={`relative bg-gradient-to-b ${styles.shell} rounded-[60px] p-[6px] shadow-2xl`}>
        {/* Card slot / lanyard hole */}
        <div className={`absolute top-6 left-1/2 -translate-x-1/2 w-24 h-8 ${theme === "dark" ? "bg-slate-700" : "bg-zinc-300"} rounded-full shadow-inner`} />

        {/* Inner card */}
        <div
          className={`relative w-full ${theme === "cream" || theme === "fire" ? styles.card : `bg-gradient-to-br ${styles.card}`} rounded-[54px] overflow-hidden shadow-inner`}
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

              {/* Top 100 badge (if applicable) */}
              {isTopHundred && (
                <div className={`flex items-center gap-3 px-5 py-2 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 backdrop-blur-sm`}>
                  <Trophy className="w-6 h-6 text-amber-900" />
                  <span className="text-amber-900 text-base font-bold">
                    TOP 100
                  </span>
                </div>
              )}
            </div>

            {/* Username and Wallet */}
            <div className="mb-10">
              <div className="flex items-center gap-6">
                <TraderAvatar
                  displayName={displayName}
                  wallet={walletAddress}
                  src={profileImage}
                  size={100}
                  className={`border-4 ${styles.border}`}
                />
                <div>
                  <h2 className={`${styles.text} text-5xl font-bold tracking-tight`}>
                    {displayName}
                  </h2>
                  <p className={`${styles.textMuted} text-2xl font-mono mt-1`}>
                    {truncateWallet(walletAddress)}
                  </p>
                  {memberSince && (
                    <p className={`${styles.textMuted} text-lg mt-1`}>
                      Member since {memberSince}
                    </p>
                  )}
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
                  <p className={`${theme === "cream" || theme === "fire" ? "text-stone-400" : styles.textSubtle} text-base mt-2`}>
                    {timePeriodLabel}
                  </p>
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
            <div className="grid grid-cols-2 gap-6 mb-7">
              <StatBox
                icon={<BarChart3 className="w-8 h-8" />}
                label="Average per day"
                value={formatAverageDaily(avgReturn)}
                highlight={avgReturn >= 0}
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
                icon={<Trophy className="w-8 h-8" />}
                label="P&L Rank"
                value={rank ? `#${rank.toLocaleString()}` : 'N/A'}
                highlight={rank !== null && rank !== undefined && rank <= 100}
                styles={styles}
                theme={theme}
              />
              <StatBox
                icon={<BarChart3 className="w-8 h-8" />}
                label="Volume"
                value={formatVolume(volume)}
                styles={styles}
                theme={theme}
              />
            </div>

            {/* Accumulated P&L Chart */}
            {dailyPnlData.length > 0 && (
              <div className={`mb-10 p-6 rounded-2xl ${styles.statBg} backdrop-blur-sm border-2 ${styles.border}`}>
                <p className={`${theme === "cream" || theme === "fire" ? "text-stone-500" : styles.textMuted} text-base font-medium uppercase tracking-wider mb-3`}>
                  Accumulated P&L
                </p>
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={dailyPnlData}>
                    <defs>
                      <linearGradient id={`gradient-${theme}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={styles.chartColor} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={styles.chartColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="cumulative"
                      stroke={styles.chartColor}
                      fill={`url(#gradient-${theme})`}
                      strokeWidth={3}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

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
