"use client"

import React, { useState, useCallback, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Copy, Download, Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toPng } from "html-to-image"

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

export interface BotShareData {
  id: string
  name: string
  description: string
  status: string
  startDate?: string
  totalPnl: number
  roi: number
  winRate: number
  totalTrades: number
  openPositions: number
  dailyPnl?: Array<{ date: string; cumulative: number }>
}

type CardTheme = "cream" | "dark" | "profit" | "fire"

interface BotShareCardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bot: BotShareData
}

const MODAL_THEMES: Array<{ value: CardTheme; number: string; bg: string; border: string }> = [
  { value: "cream", number: "1", bg: "#F9F8F1", border: "#E8E4DA" },
  { value: "dark", number: "2", bg: "#0F0F0F", border: "#333333" },
  { value: "profit", number: "3", bg: "#ECFDF5", border: "#A7F3D0" },
  { value: "fire", number: "4", bg: "#FFF7ED", border: "#FFD6C4" },
]

/* ═══════════════════════════════════════════════════════
   Theme Styles — inline for html-to-image reliability
   ═══════════════════════════════════════════════════════ */

const THEME_STYLES: Record<
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
    teal: "#0D9488", red: "#EF4444", chartStroke: "#0D9488", chartFill: "#0D9488",
  },
  dark: {
    bg: "#0F0F0F", cardBg: "#1A1A1A", text: "#FFFFFF", muted: "#6B7280",
    border: "rgba(255,255,255,0.08)", accent: "#FDB022", accentText: "#0F0F0F",
    darkBg: "#FFFFFF", darkText: "#0F0F0F",
    teal: "#0D9488", red: "#EF4444", chartStroke: "#FDB022", chartFill: "#FDB022",
  },
  profit: {
    bg: "#ECFDF5", cardBg: "#FFFFFF", text: "#064E3B", muted: "#6B8A7A",
    border: "rgba(16,185,129,0.12)", accent: "#10B981", accentText: "#FFFFFF",
    darkBg: "#064E3B", darkText: "#FFFFFF",
    teal: "#0D9488", red: "#EF4444", chartStroke: "#10B981", chartFill: "#10B981",
  },
  fire: {
    bg: "#FFF7ED", cardBg: "#FFFFFF", text: "#7C2D12", muted: "#B45B3E",
    border: "rgba(249,115,22,0.1)", accent: "#F97316", accentText: "#FFFFFF",
    darkBg: "#7C2D12", darkText: "#FFFFFF",
    teal: "#F97316", red: "#EF4444", chartStroke: "#F97316", chartFill: "#F97316",
  },
}

/* ─── Gradient Area Chart SVG (html-to-image safe) ─── */

function BotChartSVG({ data, stroke, fill, h = 128 }: { data: Array<{ cumulative: number }>; stroke: string; fill: string; h?: number }) {
  if (data.length < 2) return null
  const w = 480, gradId = `bg${Math.random().toString(36).slice(2, 6)}`
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
      <path d={line} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function formatPnl(value: number): string {
  const abs = Math.abs(value), s = value >= 0 ? "+" : "-"
  if (abs >= 1e6) return `${s}$${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${s}$${(abs / 1e3).toFixed(2)}K`
  return `${s}$${abs.toFixed(0)}`
}

/* ═══════════════════════════════════════════════════════
   BotShareCard — rendered offscreen for image capture
   All inline styles for html-to-image compatibility
   ═══════════════════════════════════════════════════════ */

function BotShareCard({ bot, theme }: { bot: BotShareData; theme: CardTheme }) {
  const t = THEME_STYLES[theme]

  const stats = [
    { label: "TOTAL P&L", value: formatPnl(bot.totalPnl), color: bot.totalPnl >= 0 ? t.teal : t.red },
    { label: "ROI", value: `${bot.roi >= 0 ? "+" : ""}${bot.roi.toFixed(1)}%`, color: bot.roi >= 0 ? t.teal : t.red },
    { label: "WIN RATE", value: `${bot.winRate.toFixed(1)}%` },
    { label: "TRADES", value: String(bot.totalTrades) },
  ]

  return (
    <div style={{ width: 480, height: 600, backgroundColor: t.bg, padding: 40, display: "flex", flexDirection: "column", fontFamily: "'DM Sans', sans-serif", color: t.text, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 40 }}>
        {/* Logo */}
        <div style={{ display: "flex", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: "0.04em" }}>
          <div style={{ backgroundColor: t.accent, color: t.accentText, padding: "6px 10px", display: "flex", alignItems: "center" }}>POLY</div>
          <div style={{ backgroundColor: t.darkBg, color: t.darkText, padding: "6px 10px", display: "flex", alignItems: "center" }}>COPY</div>
        </div>
        {/* Tag */}
        <div style={{ backgroundColor: t.darkBg, display: "flex", alignItems: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
          <div style={{ padding: 10, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: t.accent }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={t.accentText}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
          </div>
          <span style={{ color: t.darkText, fontSize: 10, fontWeight: 700, padding: "6px 12px", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>LIVE_ALGO</span>
        </div>
      </div>

      {/* Bot Name + Description */}
      <div style={{ marginBottom: 8, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", textTransform: "uppercase" as const }}>{bot.name}</div>
          {bot.status === "ACTIVE" && (
            <div style={{ backgroundColor: t.darkBg, color: t.darkText, fontSize: 8, fontWeight: 900, padding: "4px 8px", letterSpacing: "0.1em", textTransform: "uppercase" as const, flexShrink: 0, marginLeft: 16 }}>PREMIUM_ACCESS</div>
          )}
        </div>
        <div style={{ fontSize: 11, color: t.muted, fontWeight: 500, lineHeight: 1.4 }}>
          {bot.description.length > 80 ? bot.description.slice(0, 80) + "..." : bot.description}
        </div>
      </div>

      {/* Big ROI */}
      <div style={{ marginTop: 16, marginBottom: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", color: t.muted, textTransform: "uppercase" as const, display: "block", marginBottom: 4 }}>ROI_30D</span>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 52, fontWeight: 700, color: bot.roi >= 0 ? t.teal : t.red, lineHeight: 1, letterSpacing: "-0.04em" }}>
          {bot.roi >= 0 ? "+" : ""}{bot.roi.toFixed(1)}%
        </span>
      </div>

      {/* Chart */}
      {bot.dailyPnl && bot.dailyPnl.length > 1 && (
        <div style={{ height: 128, width: "calc(100% + 40px)", marginLeft: -20, marginBottom: 32 }}>
          <BotChartSVG data={bot.dailyPnl.map(d => ({ cumulative: d.cumulative }))} stroke={t.chartStroke} fill={t.chartFill} h={128} />
        </div>
      )}

      {/* 4-col Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, padding: "24px 0", borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}`, marginTop: "auto" }}>
        {stats.map(s => (
          <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: t.muted, textTransform: "uppercase" as const }}>{s.label}</span>
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

/* ═══════════════════════════════════════════════════════
   BotShareCardModal
   ═══════════════════════════════════════════════════════ */

export function BotShareCardModal({ open, onOpenChange, bot }: BotShareCardModalProps) {
  const [selectedTheme, setSelectedTheme] = useState<CardTheme>("cream")
  const [isGenerating, setIsGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [imageBlobs, setImageBlobs] = useState<Record<CardTheme, Blob | null>>({
    cream: null,
    dark: null,
    profit: null,
    fire: null,
  })
  const cardRefs = useRef<Record<CardTheme, HTMLDivElement | null>>({
    cream: null,
    dark: null,
    profit: null,
    fire: null,
  })

  /* ─── Image Generation ─── */

  const waitForImagesToLoad = useCallback(async (element: HTMLElement) => {
    const images = element.querySelectorAll("img")
    const imagePromises = Array.from(images).map((img) => {
      if (img.complete) return Promise.resolve()
      return new Promise((resolve) => {
        img.onload = resolve
        img.onerror = resolve
        setTimeout(() => resolve(null), 5000)
      })
    })
    await Promise.all(imagePromises)
  }, [])

  const generateImage = useCallback(
    async (theme: CardTheme): Promise<Blob> => {
      const cardRef = cardRefs.current[theme]
      if (!cardRef) throw new Error("Card ref not available")

      await waitForImagesToLoad(cardRef)

      const dataUrl = await toPng(cardRef, {
        quality: 1,
        pixelRatio: 2.5,
        cacheBust: true,
        width: 480,
        height: 600,
      })

      const base64Data = dataUrl.split(",")[1]
      const byteCharacters = atob(base64Data)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      return new Blob([new Uint8Array(byteNumbers)], { type: "image/png" })
    },
    [waitForImagesToLoad]
  )

  useEffect(() => {
    if (!open || !bot) return

    const generateAll = async () => {
      setIsGenerating(true)
      try {
        let attempts = 0
        while (attempts < 20) {
          if (Object.values(cardRefs.current).every((ref) => ref !== null)) break
          await new Promise((r) => setTimeout(r, 50))
          attempts++
        }

        await new Promise((r) => setTimeout(r, 500))

        const themeKeys: CardTheme[] = ["cream", "dark", "profit", "fire"]
        const blobs = await Promise.all(themeKeys.map((t) => generateImage(t)))
        setImageBlobs({
          cream: blobs[0],
          dark: blobs[1],
          profit: blobs[2],
          fire: blobs[3],
        })
      } catch (err) {
        console.error("Failed to generate bot share images:", err)
      } finally {
        setIsGenerating(false)
      }
    }

    generateAll()
  }, [open, bot, generateImage])

  useEffect(() => {
    if (open) {
      setImageBlobs({ cream: null, dark: null, profit: null, fire: null })
    }
  }, [open])

  /* ─── Actions ─── */

  const handleCopy = useCallback(async () => {
    const blob = imageBlobs[selectedTheme]
    if (!blob) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      console.error("Failed to copy image")
    }
  }, [imageBlobs, selectedTheme])

  const handleSave = useCallback(async () => {
    const blob = imageBlobs[selectedTheme]
    if (!blob) return
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `polycopy-bot-${bot.id.slice(0, 12)}-${selectedTheme}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }, [imageBlobs, selectedTheme, bot.id])

  const handleShareToX = useCallback(async () => {
    const blob = imageBlobs[selectedTheme]
    if (!blob) return

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    )

    const botUrl = `${window.location.origin}/v2/bots/${bot.id}`
    const shareText = `Check out ${bot.name}'s performance on @polycopy_app!\n\n${formatPnl(bot.totalPnl)} P&L | ${bot.roi >= 0 ? "+" : ""}${bot.roi.toFixed(1)}% ROI | ${bot.winRate.toFixed(1)}% Win Rate\n\n${botUrl}`

    if (isMobile && navigator.share && navigator.canShare) {
      try {
        const file = new File([blob], `polycopy-bot-share.png`, { type: "image/png" })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ text: shareText, files: [file] })
          return
        }
      } catch {
        // Fall through
      }
    }

    const url = window.URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `polycopy-bot-${selectedTheme}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    await new Promise((r) => setTimeout(r, 300))
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`,
      "_blank",
      "width=550,height=420,noopener,noreferrer"
    )
    onOpenChange(false)
  }, [imageBlobs, selectedTheme, bot, onOpenChange])

  const currentBlob = imageBlobs[selectedTheme]

  /* ─── Render ─── */

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="overflow-hidden border-none bg-poly-cream p-0 shadow-2xl sm:rounded-none"
        style={{ maxWidth: "min(85vw, 720px)" }}
      >
        <DialogTitle className="sr-only">Share Bot Card</DialogTitle>
        <div className="flex flex-col lg:flex-row">
          {/* ── Left Panel (Controls) ── */}
          <div className="flex shrink-0 flex-col gap-5 border-b border-border px-6 py-6 lg:w-[260px] lg:border-b-0 lg:border-r">
            <div>
              <h2 className="font-sans text-lg font-bold uppercase tracking-wide text-poly-black">
                Share Bot
              </h2>
              <p className="mt-0.5 font-body text-[11px] uppercase tracking-wide text-muted-foreground">
                Share {bot.name}&apos;s performance
              </p>
            </div>

            {/* Theme */}
            <div>
              <p className="mb-1.5 font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Theme
              </p>
              <div className="grid grid-cols-4 gap-2">
                {MODAL_THEMES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setSelectedTheme(t.value)}
                    disabled={isGenerating}
                    className={cn(
                      "relative flex aspect-square items-center justify-center border-2 transition-all",
                      selectedTheme === t.value
                        ? "border-poly-yellow"
                        : "border-border hover:border-poly-black/30",
                      isGenerating && "opacity-50"
                    )}
                    style={{ backgroundColor: t.bg }}
                  >
                    <span
                      className={cn(
                        "font-sans text-sm font-bold",
                        t.value === "dark" ? "text-white" : "text-poly-black"
                      )}
                    >
                      {t.number}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={handleCopy}
                  disabled={!currentBlob || isGenerating}
                  className="flex items-center justify-center gap-1.5 border border-poly-black py-2.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-colors hover:bg-poly-black/5 disabled:opacity-40"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </>
                  )}
                </button>
                <button
                  onClick={handleSave}
                  disabled={!currentBlob || isGenerating}
                  className="flex items-center justify-center gap-1.5 border border-poly-black py-2.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-colors hover:bg-poly-black/5 disabled:opacity-40"
                >
                  <Download className="h-3.5 w-3.5" /> Save
                </button>
              </div>
              <button
                onClick={handleShareToX}
                disabled={!currentBlob || isGenerating}
                className="flex w-full items-center justify-center gap-1.5 bg-poly-yellow py-2.5 font-sans text-[11px] font-bold uppercase tracking-widest text-poly-black transition-colors hover:bg-poly-yellow/90 disabled:opacity-40"
              >
                <span className="text-base">𝕏</span> Share to X
              </button>
            </div>
          </div>

          {/* ── Right Panel (Preview) ── */}
          <div className="flex flex-1 items-center justify-center bg-white p-6">
            {isGenerating || !currentBlob ? (
              <div className="flex flex-col items-center gap-4 py-20">
                <Loader2 className="h-8 w-8 animate-spin text-poly-yellow" />
                <p className="font-body text-xs text-muted-foreground">Generating card...</p>
              </div>
            ) : (
              <img
                src={URL.createObjectURL(currentBlob)}
                alt="Bot Share Card Preview"
                className="h-auto w-auto max-h-[60vh] object-contain shadow-lg"
              />
            )}
          </div>
        </div>

        {/* Hidden card components for image generation */}
        {typeof document !== "undefined" &&
          createPortal(
            <div
              aria-hidden
              style={{
                position: "fixed",
                left: "-9999px",
                top: 0,
                width: "480px",
                zIndex: -1,
                opacity: 0,
                pointerEvents: "none",
                display: "flex",
                flexDirection: "column",
                gap: "20px",
              }}
            >
              {(["cream", "dark", "profit", "fire"] as CardTheme[]).map((theme) => (
                <div
                  key={theme}
                  ref={(el) => {
                    cardRefs.current[theme] = el
                  }}
                >
                  <BotShareCard bot={bot} theme={theme} />
                </div>
              ))}
            </div>,
            document.body
          )}
      </DialogContent>
    </Dialog>
  )
}
