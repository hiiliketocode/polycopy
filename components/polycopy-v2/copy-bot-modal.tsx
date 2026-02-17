"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  Zap,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  Shield,
} from "lucide-react"
import { cn } from "@/lib/utils"

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

interface CopyBotModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  botId: string
  botName: string
  isPremium: boolean
  minBet?: number
  maxBet?: number
  walletAddress?: string | null
  usdcBalance?: number | null
  onSuccess?: () => void
}

type ModalStep = "configure" | "submitting" | "success" | "error"

/* ═══════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════ */

export function CopyBotModal({
  open,
  onOpenChange,
  botId,
  botName,
  isPremium,
  minBet = 1,
  maxBet = 100,
  walletAddress,
  usdcBalance,
  onSuccess,
}: CopyBotModalProps) {
  const [step, setStep] = useState<ModalStep>("configure")
  const [errorMessage, setErrorMessage] = useState("")

  // Section 1: Capital allocation
  const [capitalInput, setCapitalInput] = useState("")
  const capital = parseFloat(capitalInput) || 0

  // Section 2: Risk settings (collapsible)
  const [showRiskSettings, setShowRiskSettings] = useState(false)
  const [maxPerTrade, setMaxPerTrade] = useState(String(maxBet))
  const [dailyBudget, setDailyBudget] = useState("")
  const [slippage, setSlippage] = useState("3")

  // Section 3: Disclosures
  const [accepted, setAccepted] = useState(false)

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setStep("configure")
      setCapitalInput("")
      setMaxPerTrade(String(maxBet))
      setDailyBudget("")
      setSlippage("3")
      setAccepted(false)
      setShowRiskSettings(false)
      setErrorMessage("")
    }
  }, [open, maxBet])

  // Compute default daily budget (20% of capital)
  const defaultDailyBudget = capital > 0 ? Math.round(capital * 0.2 * 100) / 100 : 0

  const handleSubmit = useCallback(async () => {
    if (capital < 5) return
    if (!accepted) return

    setStep("submitting")
    setErrorMessage("")

    try {
      const res = await fetch("/api/v2/bots/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ft_wallet_id: botId,
          initial_capital: capital,
          max_order_size_usd: parseFloat(maxPerTrade) || maxBet,
          daily_budget_usd: parseFloat(dailyBudget) || defaultDailyBudget || null,
          slippage_tolerance_pct: parseFloat(slippage) || 3,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Failed to subscribe to bot")
        setStep("error")
        return
      }

      setStep("success")
      onSuccess?.()
    } catch {
      setErrorMessage("Network error. Please try again.")
      setStep("error")
    }
  }, [capital, accepted, botId, maxPerTrade, dailyBudget, slippage, maxBet, defaultDailyBudget, onSuccess])

  const canSubmit = capital >= 5 && accepted && step === "configure"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="overflow-hidden border-none bg-poly-cream p-0 shadow-2xl sm:rounded-none"
        style={{ maxWidth: "min(90vw, 520px)" }}
      >
        <DialogTitle className="sr-only">Copy Bot</DialogTitle>

        {/* ── Header ── */}
        <div className="border-b border-border bg-poly-yellow px-6 py-4">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-poly-black" />
            <h2 className="font-sans text-lg font-bold uppercase tracking-wide text-poly-black">
              {step === "success" ? "BOT ACTIVATED" : `COPY ${botName}`}
            </h2>
          </div>
          {step === "configure" && (
            <p className="mt-0.5 font-body text-[11px] text-poly-black/70">
              Configure capital allocation and risk settings
            </p>
          )}
        </div>

        {/* ── Success State ── */}
        {step === "success" && (
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <CheckCircle2 className="h-12 w-12 text-profit-green" />
            <div>
              <h3 className="font-sans text-lg font-bold uppercase text-poly-black">
                Successfully Subscribed
              </h3>
              <p className="mt-1 font-body text-sm text-muted-foreground">
                {botName} is now actively trading on your behalf with{" "}
                <span className="font-semibold text-poly-black">
                  ${capital.toFixed(2)}
                </span>{" "}
                allocated capital.
              </p>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="mt-2 bg-poly-yellow px-8 py-2.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-colors hover:bg-poly-black hover:text-poly-yellow"
            >
              DONE
            </button>
          </div>
        )}

        {/* ── Error State ── */}
        {step === "error" && (
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <AlertTriangle className="h-12 w-12 text-loss-red" />
            <div>
              <h3 className="font-sans text-lg font-bold uppercase text-poly-black">
                Subscription Failed
              </h3>
              <p className="mt-1 font-body text-sm text-muted-foreground">
                {errorMessage}
              </p>
            </div>
            <button
              onClick={() => setStep("configure")}
              className="mt-2 border border-poly-black px-8 py-2.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-colors hover:bg-poly-black hover:text-poly-cream"
            >
              TRY AGAIN
            </button>
          </div>
        )}

        {/* ── Submitting State ── */}
        {step === "submitting" && (
          <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-poly-yellow" />
            <p className="font-body text-sm text-muted-foreground">
              Setting up your bot subscription...
            </p>
          </div>
        )}

        {/* ── Configure State ── */}
        {step === "configure" && (
          <div className="flex flex-col gap-0">
            {/* Section 1: Capital Allocation */}
            <div className="border-b border-border px-6 py-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center bg-poly-black font-sans text-[10px] font-bold text-poly-cream">
                  1
                </span>
                <h3 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black">
                  Capital Allocation
                </h3>
              </div>

              <div className="mb-2">
                <label className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  AMOUNT (USD)
                </label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-body text-sm text-muted-foreground">
                    $
                  </span>
                  <input
                    type="number"
                    min={5}
                    step={1}
                    value={capitalInput}
                    onChange={(e) => setCapitalInput(e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-border bg-white py-2.5 pl-7 pr-4 font-body text-sm tabular-nums text-poly-black outline-none transition-colors focus:border-poly-yellow"
                  />
                </div>
              </div>

              {usdcBalance != null && (
                <p className="font-body text-[11px] text-muted-foreground">
                  Wallet balance:{" "}
                  <span className="font-semibold text-poly-black">
                    ${usdcBalance.toFixed(2)} USDC
                  </span>
                </p>
              )}

              <p className="mt-1 font-body text-[11px] text-muted-foreground">
                Suggested range: ${minBet} – ${maxBet * 10} based on this bot's
                sizing. Minimum: $5.
              </p>

              {capital > 0 && usdcBalance != null && capital > usdcBalance && (
                <p className="mt-2 flex items-center gap-1 font-body text-[11px] text-loss-red">
                  <AlertTriangle className="h-3 w-3" />
                  Amount exceeds your current wallet balance
                </p>
              )}
            </div>

            {/* Section 2: Risk Settings (Collapsible) */}
            <div className="border-b border-border px-6 py-4">
              <button
                onClick={() => setShowRiskSettings(!showRiskSettings)}
                className="flex w-full items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center bg-poly-black font-sans text-[10px] font-bold text-poly-cream">
                    2
                  </span>
                  <h3 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black">
                    Risk Settings
                  </h3>
                  <span className="font-body text-[10px] text-muted-foreground">
                    (OPTIONAL)
                  </span>
                </div>
                {showRiskSettings ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {showRiskSettings && (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                      MAX PER TRADE
                    </label>
                    <div className="relative mt-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-body text-xs text-muted-foreground">
                        $
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={maxPerTrade}
                        onChange={(e) => setMaxPerTrade(e.target.value)}
                        className="w-full border border-border bg-white py-2 pl-6 pr-3 font-body text-xs tabular-nums text-poly-black outline-none transition-colors focus:border-poly-yellow"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                      DAILY BUDGET
                    </label>
                    <div className="relative mt-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-body text-xs text-muted-foreground">
                        $
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={dailyBudget}
                        onChange={(e) => setDailyBudget(e.target.value)}
                        placeholder={String(defaultDailyBudget || "")}
                        className="w-full border border-border bg-white py-2 pl-6 pr-3 font-body text-xs tabular-nums text-poly-black outline-none transition-colors focus:border-poly-yellow"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                      SLIPPAGE
                    </label>
                    <div className="relative mt-1">
                      <input
                        type="number"
                        min={0.5}
                        max={10}
                        step={0.5}
                        value={slippage}
                        onChange={(e) => setSlippage(e.target.value)}
                        className="w-full border border-border bg-white py-2 pl-3 pr-7 font-body text-xs tabular-nums text-poly-black outline-none transition-colors focus:border-poly-yellow"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 font-body text-xs text-muted-foreground">
                        %
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Section 3: Disclosures */}
            <div className="px-6 py-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center bg-poly-black font-sans text-[10px] font-bold text-poly-cream">
                  3
                </span>
                <h3 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black">
                  Disclosures
                </h3>
              </div>

              <div className="mb-4 flex flex-col gap-2">
                {!isPremium && (
                  <div className="flex items-start gap-2 bg-poly-yellow/20 px-3 py-2">
                    <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-poly-black" />
                    <p className="font-body text-[11px] text-poly-black">
                      A <span className="font-semibold">0.5% platform fee</span> applies
                      to all orders executed by this bot.
                    </p>
                  </div>
                )}
                <div className="flex flex-col gap-1.5 pl-1">
                  <p className="flex items-start gap-2 font-body text-[11px] text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    Past performance does not guarantee future results.
                  </p>
                  <p className="flex items-start gap-2 font-body text-[11px] text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    Slippage may cause execution prices to differ from signal prices.
                  </p>
                  <p className="flex items-start gap-2 font-body text-[11px] text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    Bot trades are executed automatically on your behalf.
                  </p>
                  <p className="flex items-start gap-2 font-body text-[11px] text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    You can pause or stop this bot at any time from your portfolio.
                  </p>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-poly-yellow"
                />
                <span className="font-body text-[11px] leading-relaxed text-poly-black">
                  I understand the risks and authorize Polycopy to execute trades
                  on my behalf.
                </span>
              </label>
            </div>

            {/* ── Confirm Button ── */}
            <div className="border-t border-border px-6 py-4">
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={cn(
                  "flex w-full items-center justify-center gap-2 py-3 font-sans text-xs font-bold uppercase tracking-widest transition-colors",
                  canSubmit
                    ? "bg-poly-yellow text-poly-black hover:bg-poly-black hover:text-poly-yellow"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                <Zap className="h-4 w-4" />
                ACTIVATE BOT — ${capital > 0 ? capital.toFixed(2) : "0.00"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
