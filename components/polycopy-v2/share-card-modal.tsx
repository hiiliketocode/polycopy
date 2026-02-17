"use client"

import React, { useState, useCallback, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Copy, Download, Check, Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { toPng } from "html-to-image"
import { TraderShareCard, type CardTheme, type CardVariant } from "@/components/polycopy-v2/trader-share-card"
import { useTraderCardData } from "@/hooks/useTraderCardData"
import type { TimePeriod } from "@/lib/time-period-utils"

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

interface ShareCardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  walletAddress: string
  /** "trader" shows trader stats, "user" shows the user's own copy performance */
  variant?: "trader" | "user"
}

type Theme = CardTheme

const THEMES: Array<{ value: Theme; number: string; bg: string; border: string }> = [
  { value: "cream", number: "1", bg: "#F9F8F1", border: "#E8E4DA" },
  { value: "dark", number: "2", bg: "#0F0F0F", border: "#333333" },
  { value: "profit", number: "3", bg: "#ECFDF5", border: "#A7F3D0" },
  { value: "fire", number: "4", bg: "#FFF7ED", border: "#FFD6C4" },
]

const TIME_PERIODS: Array<{ value: TimePeriod; label: string }> = [
  { value: "1D", label: "24H" },
  { value: "7D", label: "7D" },
  { value: "30D", label: "30D" },
  { value: "ALL", label: "ALL" },
]

/* ═══════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════ */

export function ShareCardModal({
  open,
  onOpenChange,
  walletAddress,
  variant = "trader",
}: ShareCardModalProps) {
  const [selectedTheme, setSelectedTheme] = useState<Theme>("cream")
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("ALL")
  const [isGenerating, setIsGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [imageBlobs, setImageBlobs] = useState<Record<Theme, Blob | null>>({
    cream: null,
    dark: null,
    profit: null,
    fire: null,
  })
  const cardRefs = useRef<Record<Theme, HTMLDivElement | null>>({
    cream: null,
    dark: null,
    profit: null,
    fire: null,
  })

  // Fetch trader card data
  const {
    data: traderData,
    isLoading: isLoadingData,
  } = useTraderCardData(walletAddress, selectedPeriod)

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
    async (theme: Theme): Promise<Blob> => {
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

  // Generate all theme images when data loads
  useEffect(() => {
    if (!open || !traderData || isLoadingData) return

    const generateAll = async () => {
      setIsGenerating(true)
      try {
        // Wait for refs
        let attempts = 0
        while (attempts < 20) {
          if (Object.values(cardRefs.current).every((ref) => ref !== null)) break
          await new Promise((r) => setTimeout(r, 50))
          attempts++
        }

        await new Promise((r) => setTimeout(r, 500))

        const themeKeys: Theme[] = ["cream", "dark", "profit", "fire"]
        const blobs = await Promise.all(themeKeys.map((t) => generateImage(t)))
        setImageBlobs({
          cream: blobs[0],
          dark: blobs[1],
          profit: blobs[2],
          fire: blobs[3],
        })
      } catch (err) {
        console.error("Failed to generate images:", err)
      } finally {
        setIsGenerating(false)
      }
    }

    generateAll()
  }, [open, traderData, isLoadingData, generateImage])

  // Reset blobs when period changes
  const handlePeriodChange = (period: TimePeriod) => {
    setSelectedPeriod(period)
    setImageBlobs({ cream: null, dark: null, profit: null, fire: null })
  }

  /* ─── Actions ─── */

  const handleCopy = useCallback(async () => {
    const blob = imageBlobs[selectedTheme]
    if (!blob) return
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ])
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
    link.download = `polycopy-${variant}-${walletAddress.slice(0, 8)}-${selectedTheme}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }, [imageBlobs, selectedTheme, walletAddress, variant])

  const handleShareToX = useCallback(async () => {
    const blob = imageBlobs[selectedTheme]
    if (!blob || !traderData) return

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    )

    const formatPnL = (val: number) => {
      const abs = Math.abs(val)
      if (abs >= 1000) return `${val >= 0 ? "+" : "-"}$${(abs / 1000).toFixed(1)}K`
      return `${val >= 0 ? "+" : ""}$${val.toFixed(0)}`
    }

    const traderUrl = `${window.location.origin}/v2/trader/${walletAddress}`
    const shareText =
      variant === "trader"
        ? `Check out ${traderData.displayName}'s performance on @polycopy_app!\n\n${formatPnL(traderData.totalPnL)} P&L | ${traderData.roi >= 0 ? "+" : ""}${traderData.roi.toFixed(1)}% ROI\n\n${traderUrl}`
        : `My copy trading performance on @polycopy_app!\n\n${formatPnL(traderData.totalPnL)} P&L | ${traderData.winRate.toFixed(1)}% Win Rate\n\npolycopy.app`

    if (isMobile && navigator.share && navigator.canShare) {
      try {
        const file = new File([blob], `polycopy-share.png`, { type: "image/png" })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ text: shareText, files: [file] })
          return
        }
      } catch {
        // Fall through
      }
    }

    // Download + open Twitter
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `polycopy-${variant}-${selectedTheme}.png`
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
  }, [imageBlobs, selectedTheme, traderData, walletAddress, variant, onOpenChange])

  const isLoading = isLoadingData || isGenerating
  const currentBlob = imageBlobs[selectedTheme]

  /* ─── Render ─── */

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border-none bg-poly-cream p-0 shadow-2xl sm:rounded-none" style={{ maxWidth: "min(85vw, 720px)" }}>
        <DialogTitle className="sr-only">Share Card</DialogTitle>
        <div className="flex flex-col lg:flex-row">
          {/* ── Left Panel (Controls) ── */}
          <div className="flex shrink-0 flex-col gap-5 border-b border-border px-6 py-6 lg:w-[260px] lg:border-b-0 lg:border-r">
            {/* Header */}
            <div>
              <h2 className="font-sans text-lg font-bold uppercase tracking-wide text-poly-black">
                Share Card
              </h2>
              <p className="mt-0.5 font-body text-[11px] uppercase tracking-wide text-muted-foreground">
                {variant === "trader"
                  ? "Share Trader's Performance"
                  : "Share Your Performance"}
              </p>
            </div>

            {/* Period */}
            <div>
              <p className="mb-1.5 font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Period
              </p>
              <div className="flex gap-1">
                {TIME_PERIODS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => handlePeriodChange(p.value)}
                    disabled={isLoading}
                    className={cn(
                      "flex-1 py-1.5 font-sans text-[10px] font-bold uppercase tracking-widest transition-all",
                      selectedPeriod === p.value
                        ? "bg-poly-black text-poly-cream"
                        : "border border-border text-poly-black hover:bg-poly-black/5",
                      isLoading && "opacity-50"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme */}
            <div>
              <p className="mb-1.5 font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Theme
              </p>
              <div className="grid grid-cols-4 gap-2">
                {THEMES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setSelectedTheme(t.value)}
                    disabled={isLoading}
                    className={cn(
                      "relative flex aspect-square items-center justify-center border-2 transition-all",
                      selectedTheme === t.value
                        ? "border-poly-yellow"
                        : "border-border hover:border-poly-black/30",
                      isLoading && "opacity-50"
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

            {/* Action Buttons — directly below theme, no mt-auto */}
            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={handleCopy}
                  disabled={!currentBlob || isLoading}
                  className="flex items-center justify-center gap-1.5 border border-poly-black py-2 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-black transition-colors hover:bg-poly-black/5 disabled:opacity-40"
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
                  disabled={!currentBlob || isLoading}
                  className="flex items-center justify-center gap-1.5 border border-poly-black py-2 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-black transition-colors hover:bg-poly-black/5 disabled:opacity-40"
                >
                  <Download className="h-3.5 w-3.5" /> Save
                </button>
              </div>
              <button
                onClick={handleShareToX}
                disabled={!currentBlob || isLoading}
                className="flex w-full items-center justify-center gap-1.5 bg-poly-yellow py-2.5 font-sans text-[11px] font-bold uppercase tracking-widest text-poly-black transition-colors hover:bg-poly-yellow/90 disabled:opacity-40"
              >
                <span className="text-base">𝕏</span> Share to X
              </button>
            </div>
          </div>

          {/* ── Right Panel (Preview) ── */}
          <div className="flex flex-1 items-center justify-center bg-white p-6">
            {isLoading || !currentBlob ? (
              <div className="flex flex-col items-center gap-4 py-20">
                <Loader2 className="h-8 w-8 animate-spin text-poly-yellow" />
                <p className="font-body text-xs text-muted-foreground">
                  {isLoadingData ? "Loading data..." : "Generating card..."}
                </p>
              </div>
            ) : (
              <img
                src={URL.createObjectURL(currentBlob)}
                alt="Share Card Preview"
                className="h-auto w-auto max-h-[60vh] object-contain shadow-lg"
              />
            )}
          </div>
        </div>

        {/* Hidden card components for image generation */}
        {traderData &&
          typeof document !== "undefined" &&
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
              {(["cream", "dark", "profit", "fire"] as Theme[]).map((theme) => (
                <div
                  key={theme}
                  ref={(el) => {
                    cardRefs.current[theme] = el
                  }}
                >
                  <TraderShareCard {...traderData} theme={theme} variant={variant} />
                </div>
              ))}
            </div>,
            document.body
          )}
      </DialogContent>
    </Dialog>
  )
}
