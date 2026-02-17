"use client"

import React from "react"

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

export type CardTheme = "cream" | "dark" | "profit" | "fire"
export type CardVariant = "trader" | "user"

interface TraderShareCardProps {
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
   Theme — Industrial Block System
   ═══════════════════════════════════════════════════════ */

const THEMES: Record<
  CardTheme,
  {
    bg: string; cardBg: string; text: string; muted: string; border: string
    accent: string; accentText: string; darkBg: string; darkText: string
    teal: string; red: string; chartStroke: string; chartFill: string
  }
> = {
  cream: {
    bg: "#F9F8F1", cardBg: "#FFFFFF", text: "#0F0F0F", muted: "#9CA3AF",
    border: "rgba(15,15,15,0.05)", accent: "#FDB022", accentText: "#0F0F0F",
    darkBg: "#0F0F0F", darkText: "#FFFFFF",
    teal: "#0D9488", red: "#EF4444",
    chartStroke: "#0D9488", chartFill: "#0D9488",
  },
  dark: {
    bg: "#0F0F0F", cardBg: "#1A1A1A", text: "#FFFFFF", muted: "#6B7280",
    border: "rgba(255,255,255,0.08)", accent: "#FDB022", accentText: "#0F0F0F",
    darkBg: "#FFFFFF", darkText: "#0F0F0F",
    teal: "#0D9488", red: "#EF4444",
    chartStroke: "#FDB022", chartFill: "#FDB022",
  },
  profit: {
    bg: "#ECFDF5", cardBg: "#FFFFFF", text: "#064E3B", muted: "#6B8A7A",
    border: "rgba(16,185,129,0.12)", accent: "#10B981", accentText: "#FFFFFF",
    darkBg: "#064E3B", darkText: "#FFFFFF",
    teal: "#0D9488", red: "#EF4444",
    chartStroke: "#10B981", chartFill: "#10B981",
  },
  fire: {
    bg: "#FFF7ED", cardBg: "#FFFFFF", text: "#7C2D12", muted: "#B45B3E",
    border: "rgba(249,115,22,0.1)", accent: "#F97316", accentText: "#FFFFFF",
    darkBg: "#7C2D12", darkText: "#FFFFFF",
    teal: "#F97316", red: "#EF4444",
    chartStroke: "#F97316", chartFill: "#F97316",
  },
}

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */

function fmtPnl(v: number) {
  const a = Math.abs(v), s = v >= 0 ? "+" : "-"
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(2)}K`
  return `${s}$${a.toFixed(0)}`
}
function fmtVol(v: number) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}
function fmtAvg(v: number) {
  const a = Math.abs(v), s = v >= 0 ? "+" : "-"
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(2)}K`
  return `${s}$${a.toFixed(0)}`
}
function truncAddr(a: string) {
  if (!a || a.length < 10) return a
  return `${a.slice(0, 6)} . . . ${a.slice(-4)}`
}

/* ─── Inline SVG Mini Chart ─── */

function MiniChart({ data, stroke, fill, h = 48 }: { data: Array<{ cumulative: number }>; stroke: string; fill: string; h?: number }) {
  if (data.length < 2) return null
  const w = 480
  const vals = data.map(d => d.cumulative)
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1
  const pts = data.map((d, i) => ({
    x: (i / (data.length - 1)) * w,
    y: 4 + (h - 8) - ((d.cumulative - min) / range) * (h - 8),
  }))
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
  const area = `${line} L${w},${h} L0,${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="none">
      <path d={area} fill={fill} opacity={0.06} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ─── Larger Chart with gradient ─── */
function AreaChartSVG({ data, stroke, fill, h = 64 }: { data: Array<{ cumulative: number }>; stroke: string; fill: string; h?: number }) {
  if (data.length < 2) return null
  const w = 400, gradId = `g${Math.random().toString(36).slice(2, 6)}`
  const vals = data.map(d => d.cumulative)
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1
  const pts = data.map((d, i) => ({
    x: (i / (data.length - 1)) * w,
    y: 4 + (h - 8) - ((d.cumulative - min) / range) * (h - 8),
  }))
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
  const area = `${line} L${w},${h} L0,${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={fill} stopOpacity={0.15} />
          <stop offset="95%" stopColor={fill} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ─── Trophy SVG Icon ─── */
function TrophyIcon({ color = "#0F0F0F", size = 14 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z" stroke={color} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ─── Zap SVG Icon ─── */
function ZapIcon({ color = "#0F0F0F", size = 14 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  )
}

/* ═══════════════════════════════════════════════════════
   SHARED: Logo + CardFrame
   ═══════════════════════════════════════════════════════ */

function Logo({ accent, accentText, darkBg, darkText }: { accent: string; accentText: string; darkBg: string; darkText: string }) {
  return (
    <div style={{ display: "flex", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: "0.04em" }}>
      <div style={{ backgroundColor: accent, color: accentText, padding: "6px 10px", display: "flex", alignItems: "center" }}>POLY</div>
      <div style={{ backgroundColor: darkBg, color: darkText, padding: "6px 10px", display: "flex", alignItems: "center" }}>COPY</div>
    </div>
  )
}

function Tag({ label, icon, tagColor, darkBg, darkText }: { label: string; icon: React.ReactNode; tagColor: string; darkBg: string; darkText: string }) {
  return (
    <div style={{ backgroundColor: darkBg, display: "flex", alignItems: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
      <div style={{ padding: 10, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: tagColor }}>{icon}</div>
      <span style={{ color: darkText, fontSize: 10, fontWeight: 700, padding: "6px 12px", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>{label}</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */

export function TraderShareCard({
  displayName, walletAddress, profileImage, isTopHundred, memberSince,
  totalPnL, roi, winRate, volume, trades, avgReturn,
  dailyPnlData, timePeriodLabel, theme = "cream", variant = "trader", rank,
}: TraderShareCardProps) {
  const t = THEMES[theme]
  const positive = totalPnL >= 0
  const pnlColor = positive ? t.teal : t.red

  /* ─── TRADER VARIANT ─── */
  if (variant === "trader") {
    const stats = [
      { label: "AVG PER DAY", value: fmtAvg(avgReturn) },
      { label: "WIN RATE", value: `${winRate.toFixed(1)}%` },
      { label: "ROI", value: `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%` },
      { label: "TOTAL TRADES", value: trades.toLocaleString() },
    ]

    return (
      <div style={{ width: 480, height: 600, backgroundColor: t.bg, padding: 40, display: "flex", flexDirection: "column", fontFamily: "'DM Sans', sans-serif", color: t.text, overflow: "hidden", position: "relative" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 40 }}>
          <Logo accent={t.accent} accentText={t.accentText} darkBg={t.darkBg} darkText={t.darkText} />
          <Tag label="POLYMARKET_TRADER" icon={<TrophyIcon color={t.accentText} />} tagColor={t.accent} darkBg={t.darkBg} darkText={t.darkText} />
        </div>

        {/* Avatar + Name */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24, flexShrink: 0 }}>
          <div style={{ width: 56, height: 56, backgroundColor: t.cardBg, border: `1px solid ${t.border}`, boxShadow: "0 1px 2px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", flexShrink: 0, overflow: "hidden" }}>
            {profileImage ? (
              <img src={profileImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700, color: t.accent }}>{displayName.substring(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 700, lineHeight: 1, marginBottom: 4, letterSpacing: "-0.02em" }}>{displayName}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 9, fontWeight: 700, color: t.muted, letterSpacing: "0.1em", textTransform: "uppercase" as const }}>
              <span>{truncAddr(walletAddress)}</span>
              <span style={{ width: 3, height: 3, borderRadius: "50%", backgroundColor: t.muted, opacity: 0.3 }} />
              <span>EST. {memberSince || "2025"}</span>
            </div>
          </div>
        </div>

        {/* P&L Box */}
        <div style={{ backgroundColor: t.cardBg, padding: 20, display: "flex", flexDirection: "column", gap: 2, marginBottom: 12, border: `1px solid ${t.border}`, boxShadow: "0 1px 2px rgba(0,0,0,0.05)", position: "relative", overflow: "hidden" }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", color: t.muted, textTransform: "uppercase" as const }}>TOTAL P&L</span>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 44, fontWeight: 700, color: pnlColor, lineHeight: 1, letterSpacing: "-0.04em", marginBottom: 8 }}>{fmtPnl(totalPnL)}</span>
          <div style={{ height: 48, width: "calc(100% + 40px)", marginLeft: -20, marginBottom: -20, marginTop: 4 }}>
            <MiniChart data={dailyPnlData} stroke={t.chartStroke} fill={t.chartFill} h={48} />
          </div>
        </div>

        {/* 2x2 Stats Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: "auto" }}>
          {stats.map(s => (
            <div key={s.label} style={{ backgroundColor: t.cardBg, padding: 20, display: "flex", flexDirection: "column", gap: 6, border: `1px solid ${t.border}`, boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: t.muted, textTransform: "uppercase" as const }}>{s.label}</span>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, color: t.text, lineHeight: 1 }}>{s.value}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: "auto", paddingTop: 32, borderTop: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", color: t.muted, opacity: 0.5, textTransform: "uppercase" as const }}>
          <span>POLYCOPY.APP</span>
          <span>{new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase()}</span>
        </div>
      </div>
    )
  }

  /* ─── PORTFOLIO / USER VARIANT ─── */
  const portStats = [
    { label: "WIN RATE", value: `${winRate.toFixed(1)}%` },
    { label: "TRADES", value: trades.toLocaleString() },
    { label: "AVG / DAY", value: fmtAvg(avgReturn) },
    { label: "RANK", value: rank ? `#${rank}` : "N/A", color: t.accent },
  ]

  return (
    <div style={{ width: 480, height: 600, backgroundColor: t.bg, padding: 40, display: "flex", flexDirection: "column", fontFamily: "'DM Sans', sans-serif", color: t.text, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 40 }}>
        <Logo accent={t.accent} accentText={t.accentText} darkBg={t.darkBg} darkText={t.darkText} />
        <Tag label="MY_PORTFOLIO" icon={<TrophyIcon color={t.accentText} />} tagColor={t.accent} darkBg={t.darkBg} darkText={t.darkText} />
      </div>

      {/* Title */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 700, lineHeight: 1.1, marginBottom: 6, letterSpacing: "-0.04em", textTransform: "uppercase" as const }}>Portfolio Summary</div>
        <div style={{ height: 4, width: 32, backgroundColor: t.accent, marginBottom: 6 }} />
        <div style={{ fontSize: 9, color: t.muted, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Institutional Grade Tracking</div>
      </div>

      {/* Yellow P&L Box */}
      <div style={{ backgroundColor: t.accent, padding: 16, display: "flex", flexDirection: "column", gap: 2, marginBottom: 12, boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", bottom: -48, right: -48, width: 96, height: 96, backgroundColor: "rgba(0,0,0,0.05)", transform: "rotate(45deg)" }} />
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", color: `${t.text}66`, textTransform: "uppercase" as const, position: "relative", zIndex: 1 }}>NET PROFIT</span>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 40, fontWeight: 700, color: t.text, lineHeight: 1, letterSpacing: "-0.04em", position: "relative", zIndex: 1 }}>{fmtPnl(totalPnL)}</span>
      </div>

      {/* Chart Box */}
      <div style={{ backgroundColor: t.cardBg, border: `1px solid ${t.border}`, padding: 14, marginBottom: 12, position: "relative", overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.05)", height: 112 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", color: t.muted, textTransform: "uppercase" as const }}>PRECISION CURVE</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: t.accent }} />
            <span style={{ fontSize: 9, fontWeight: 900, color: t.accent, textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>{roi >= 0 ? "+" : ""}{roi.toFixed(1)}% ROI</span>
          </div>
        </div>
        <div style={{ height: 64, width: "100%" }}>
          <AreaChartSVG data={dailyPnlData} stroke={t.accent} fill={t.accent} h={64} />
        </div>
      </div>

      {/* 2x2 Stats (horizontal: label left, value right) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: "auto" }}>
        {portStats.map(s => (
          <div key={s.label} style={{ backgroundColor: t.cardBg, padding: 16, border: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: t.muted, textTransform: "uppercase" as const }}>{s.label}</span>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 700, color: s.color || t.text }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: "auto", paddingTop: 32, borderTop: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", color: t.muted, opacity: 0.5, textTransform: "uppercase" as const }}>
        <span>POLYCOPY.APP</span>
        <span>{new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase()}</span>
      </div>
    </div>
  )
}
