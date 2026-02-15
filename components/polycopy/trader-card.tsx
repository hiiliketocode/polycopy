"use client"

import React from "react"
import { ResponsiveContainer, AreaChart, Area } from "recharts"

export type CardTheme = "cream" | "dark" | "profit" | "fire"
export type CardVariant = "trader" | "user"

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
  timePeriod: "1D" | "7D" | "30D" | "3M" | "6M" | "ALL"
  timePeriodLabel: string
  theme?: CardTheme
  variant?: CardVariant
  rank?: number | null
}

/* ═══════════════════════════════════════════════════════
   Theme Styles — matches Figma v2 brand share cards
   ═══════════════════════════════════════════════════════ */

const themeStyles = {
  cream: {
    bg: "#F5F0E8",
    statCard: "#FFFFFF",
    chartCardBg: "#FFFFFF",
    text: "#1A1A1A",
    textMuted: "#8C8C8C",
    valueAccent: "#16A34A",
    valueNeutral: "#1A1A1A",
    labelColor: "#8C8C8C",
    footerColor: "#A3A3A3",
    chartLine: "#22C55E",
    chartFill: ["#22C55E30", "#22C55E00"],
    logoPoly: { bg: "#FDB022", text: "#1A1A1A" },
    logoCopy: { bg: "#1A1A1A", text: "#FFFFFF" },
    badgeDot: "#22C55E",
    badgeText: "#8C8C8C",
    avatarBg: "#FDB022",
    avatarText: "#1A1A1A",
    subtitleColor: "#A3A3A3",
  },
  dark: {
    bg: "#1A202C",
    statCard: "#2D3748",
    chartCardBg: "#2D3748",
    text: "#FFFFFF",
    textMuted: "#94A3B8",
    valueAccent: "#22C55E",
    valueNeutral: "#FFFFFF",
    labelColor: "#94A3B8",
    footerColor: "#64748B",
    chartLine: "#22C55E",
    chartFill: ["#22C55E30", "#22C55E00"],
    logoPoly: { bg: "#FDB022", text: "#1A1A1A" },
    logoCopy: { bg: "#1A1A1A", text: "#FFFFFF" },
    badgeDot: "#22C55E",
    badgeText: "#94A3B8",
    avatarBg: "#FDB022",
    avatarText: "#1A1A1A",
    subtitleColor: "#94A3B8",
  },
  profit: {
    bg: "#E4F3E5",
    statCard: "#FFFFFF",
    chartCardBg: "#FFFFFF",
    text: "#1A1A1A",
    textMuted: "#6B7280",
    valueAccent: "#16A34A",
    valueNeutral: "#1A1A1A",
    labelColor: "#6B7280",
    footerColor: "#9CA3AF",
    chartLine: "#22C55E",
    chartFill: ["#22C55E25", "#22C55E00"],
    logoPoly: { bg: "#FDB022", text: "#1A1A1A" },
    logoCopy: { bg: "#1A1A1A", text: "#FFFFFF" },
    badgeDot: "#22C55E",
    badgeText: "#6B7280",
    avatarBg: "#FDB022",
    avatarText: "#1A1A1A",
    subtitleColor: "#9CA3AF",
  },
  fire: {
    bg: "#FDDCCE",
    statCard: "#F5E0D5",
    chartCardBg: "#F5E0D5",
    text: "#1A1A1A",
    textMuted: "#92400E",
    valueAccent: "#16A34A",
    valueNeutral: "#78350F",
    labelColor: "#92400E",
    footerColor: "#A8856F",
    chartLine: "#92400E",
    chartFill: ["#92400E20", "#92400E00"],
    logoPoly: { bg: "#FDB022", text: "#1A1A1A" },
    logoCopy: { bg: "#1A1A1A", text: "#FFFFFF" },
    badgeDot: "#22C55E",
    badgeText: "#92400E",
    avatarBg: "#FDB022",
    avatarText: "#1A1A1A",
    subtitleColor: "#A8856F",
  },
}

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */

const formatCurrency = (value: number) => {
  const absValue = Math.abs(value)
  if (absValue >= 1000000) return `$${(absValue / 1000000).toFixed(1)}M`
  if (absValue >= 1000) return `$${(absValue / 1000).toFixed(1)}K`
  return `$${absValue.toFixed(0)}`
}

const formatSignedCurrency = (value: number) => {
  const sign = value >= 0 ? "+" : "-"
  return `${sign}${formatCurrency(Math.abs(value))}`
}

const formatVolume = (value: number) => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

/* ═══════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════ */

export function TraderCard({
  displayName,
  walletAddress,
  profileImage,
  memberSince,
  totalPnL,
  roi,
  winRate,
  volume,
  trades,
  avgReturn,
  dailyPnlData,
  timePeriod,
  theme = "cream",
  variant = "trader",
  rank,
}: TraderCardProps) {
  const s = themeStyles[theme]

  // Format the current date for the footer
  const currentDate = new Date().toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  }).toUpperCase()

  // Format member since with underscores
  const formattedMemberSince = memberSince
    ? `MEMBER_SINCE_${memberSince.replace(" ", "_").toUpperCase()}`
    : "MEMBER_SINCE_2026"

  // Get initial letter for avatar
  const initial = displayName ? displayName[0].toUpperCase() : "?"

  // Badge label
  const badgeLabel = variant === "user" ? "LIVE_FEED" : "TRADER_SIG"

  // Subtitle
  const subtitle =
    variant === "user" ? formattedMemberSince : "ACTIVE_POLY_TRADER"

  // Build stats based on variant
  const stats =
    variant === "user"
      ? [
          {
            label: "ROI",
            value: `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`,
            isAccent: roi >= 0,
          },
          {
            label: "WIN RATE",
            value: `${winRate.toFixed(1)}%`,
            isAccent: false,
          },
          {
            label: "COPY TRADES",
            value: `${trades}`,
            isAccent: false,
          },
          {
            label: "VOLUME",
            value: formatVolume(volume),
            isAccent: false,
          },
        ]
      : [
          {
            label: "P&L",
            value: formatSignedCurrency(totalPnL),
            isAccent: totalPnL >= 0,
          },
          {
            label: "AVG. PER DAY",
            value: formatSignedCurrency(avgReturn),
            isAccent: avgReturn >= 0,
          },
          {
            label: "P&L RANK",
            value: rank ? `#${rank}` : "N/A",
            isAccent: false,
          },
          {
            label: "VOLUME",
            value: formatVolume(volume),
            isAccent: false,
          },
        ]

  // Period label for chart
  const periodLabel = timePeriod === "ALL" ? "ALL" : timePeriod

  return (
    <div
      className="relative w-[900px]"
      style={{
        fontFamily: "'Space Grotesk', 'DM Sans', sans-serif",
        backgroundColor: s.bg,
        width: "900px",
        height: "1200px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "56px 60px 44px 60px",
          height: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* ── Header Row ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "44px",
            flexShrink: 0,
          }}
        >
          {/* Logo: POLY | COPY */}
          <div style={{ display: "flex" }}>
            <div
              style={{
                backgroundColor: s.logoPoly.bg,
                color: s.logoPoly.text,
                padding: "10px 16px",
                fontSize: "26px",
                fontWeight: 800,
                letterSpacing: "0.02em",
                lineHeight: 1,
              }}
            >
              POLY
            </div>
            <div
              style={{
                backgroundColor: s.logoCopy.bg,
                color: s.logoCopy.text,
                padding: "10px 16px",
                fontSize: "26px",
                fontWeight: 800,
                letterSpacing: "0.02em",
                lineHeight: 1,
              }}
            >
              COPY
            </div>
          </div>

          {/* Badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor: s.badgeDot,
              }}
            />
            <span
              style={{
                fontSize: "20px",
                fontWeight: 600,
                color: s.badgeText,
                letterSpacing: "0.05em",
              }}
            >
              {badgeLabel}
            </span>
          </div>
        </div>

        {/* ── Profile Section ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "28px",
            marginBottom: "56px",
            flexShrink: 0,
          }}
        >
          {/* Avatar */}
          {profileImage ? (
            <img
              src={profileImage}
              alt={displayName}
              style={{
                width: "120px",
                height: "120px",
                objectFit: "cover",
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: "120px",
                height: "120px",
                backgroundColor: s.avatarBg,
                color: s.avatarText,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "56px",
                fontWeight: 800,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              {initial}
            </div>
          )}
          <div>
            <div
              style={{
                fontSize: "52px",
                fontWeight: 800,
                color: s.text,
                letterSpacing: "-0.01em",
                lineHeight: 1.1,
              }}
            >
              {displayName.toUpperCase()}
            </div>
            <div
              style={{
                fontSize: "20px",
                fontWeight: 500,
                color: s.subtitleColor,
                letterSpacing: "0.05em",
                marginTop: "6px",
              }}
            >
              {subtitle}
            </div>
          </div>
        </div>

        {/* ── Chart Card ── */}
        <div
          style={{
            backgroundColor: s.chartCardBg,
            padding: "36px 40px",
            marginBottom: "24px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: s.labelColor,
              letterSpacing: "0.06em",
              marginBottom: "20px",
              textTransform: "uppercase",
            }}
          >
            P&L_PERFORMANCE ({periodLabel})
          </div>
          <div style={{ width: "100%", height: "280px" }}>
            {dailyPnlData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyPnlData}>
                  <defs>
                    <linearGradient
                      id={`v2-gradient-${theme}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={s.chartLine} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={s.chartLine} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="natural"
                    dataKey="cumulative"
                    stroke={s.chartLine}
                    fill={`url(#v2-gradient-${theme})`}
                    strokeWidth={5}
                    isAnimationActive={false}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: s.labelColor,
                  fontSize: "18px",
                }}
              >
                No data available
              </div>
            )}
          </div>
        </div>

        {/* ── Stats Grid (2×2) ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "20px",
            flexShrink: 0,
          }}
        >
          {stats.map((stat, i) => (
            <div
              key={i}
              style={{
                backgroundColor: s.statCard,
                padding: "32px 36px",
              }}
            >
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: s.labelColor,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: "10px",
                }}
              >
                {stat.label}
              </div>
              <div
                style={{
                  fontSize: "56px",
                  fontWeight: 800,
                  color: stat.isAccent ? s.valueAccent : s.valueNeutral,
                  lineHeight: 1.1,
                  letterSpacing: "-0.02em",
                }}
              >
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "auto",
            paddingTop: "32px",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: "18px",
              fontWeight: 500,
              color: s.footerColor,
              letterSpacing: "0.05em",
            }}
          >
            POLYCOPY.APP
          </span>
          <span
            style={{
              fontSize: "18px",
              fontWeight: 500,
              color: s.footerColor,
              letterSpacing: "0.05em",
            }}
          >
            {currentDate}
          </span>
        </div>
      </div>
    </div>
  )
}
