"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  Settings,
  Pause,
  Play,
  XCircle,
  X,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
} from "lucide-react"
import { cn } from "@/lib/utils"

export interface BotSubscription {
  strategy_id: string
  ft_wallet_id: string
  display_name: string
  is_active: boolean
  is_paused: boolean
  initial_capital: number
  available_cash: number
  locked_capital: number
  cooldown_capital?: number
  created_at: string
}

interface ManageBotModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  subscription: BotSubscription
  onUpdate?: (sub: BotSubscription) => void
  onUnsubscribe?: (ftWalletId: string) => void
}

type ModalView = "main" | "confirm-cancel" | "saving" | "success" | "error"

export function ManageBotModal({
  open,
  onOpenChange,
  subscription,
  onUpdate,
  onUnsubscribe,
}: ManageBotModalProps) {
  const [view, setView] = useState<ModalView>("main")
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  const [capitalInput, setCapitalInput] = useState("")
  const [isPaused, setIsPaused] = useState(subscription.is_paused)
  const [isTogglingPause, setIsTogglingPause] = useState(false)

  const totalCapital = Number(subscription.initial_capital) || 0
  const available = Number(subscription.available_cash) || 0
  const locked = Number(subscription.locked_capital) || 0
  const cooldown = Number(subscription.cooldown_capital) || 0

  useEffect(() => {
    if (open) {
      setView("main")
      setCapitalInput(String(totalCapital))
      setIsPaused(subscription.is_paused)
      setErrorMessage("")
      setSuccessMessage("")
    }
  }, [open, subscription, totalCapital])

  const handleSaveCapital = useCallback(async () => {
    const newCapital = parseFloat(capitalInput)
    if (isNaN(newCapital) || newCapital < 5) return
    if (newCapital === totalCapital) return

    setView("saving")
    try {
      const res = await fetch("/api/v2/bots/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ft_wallet_id: subscription.ft_wallet_id,
          initial_capital: newCapital,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Failed to update capital")
        setView("error")
        return
      }
      setSuccessMessage("Capital updated successfully")
      setView("success")
      onUpdate?.({
        ...subscription,
        initial_capital: data.strategy.initial_capital,
        available_cash: data.strategy.available_cash,
      })
    } catch {
      setErrorMessage("Network error. Please try again.")
      setView("error")
    }
  }, [capitalInput, totalCapital, subscription, onUpdate])

  const handleTogglePause = useCallback(async () => {
    setIsTogglingPause(true)
    try {
      const res = await fetch("/api/v2/bots/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ft_wallet_id: subscription.ft_wallet_id }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) return
      setIsPaused(data.is_paused)
      onUpdate?.({ ...subscription, is_paused: data.is_paused })
    } catch {
      // silently fail
    } finally {
      setIsTogglingPause(false)
    }
  }, [subscription, onUpdate])

  const handleCancelSubscription = useCallback(async () => {
    setView("saving")
    try {
      const res = await fetch("/api/v2/bots/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ft_wallet_id: subscription.ft_wallet_id }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Failed to cancel subscription")
        setView("error")
        return
      }
      setSuccessMessage("Subscription cancelled")
      setView("success")
      onUnsubscribe?.(subscription.ft_wallet_id)
    } catch {
      setErrorMessage("Network error. Please try again.")
      setView("error")
    }
  }, [subscription, onUnsubscribe])

  const capitalChanged = parseFloat(capitalInput) !== totalCapital && parseFloat(capitalInput) >= 5

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="overflow-hidden border-none bg-poly-cream p-0 shadow-2xl sm:rounded-none"
        style={{ maxWidth: "min(90vw, 520px)" }}
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Manage Bot</DialogTitle>

        {/* Header */}
        <div className="border-b border-border bg-poly-black px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-poly-yellow" />
              <h2 className="font-sans text-lg font-bold uppercase tracking-wide text-white">
                MANAGE BOT
              </h2>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="text-white/60 transition-colors hover:text-white"
            >
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </button>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <p className="font-body text-sm text-white/70">
              {subscription.display_name}
            </p>
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 font-sans text-[9px] font-bold uppercase tracking-widest",
                isPaused
                  ? "bg-poly-yellow/20 text-poly-yellow"
                  : "bg-profit-green/20 text-profit-green"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isPaused ? "bg-poly-yellow" : "bg-profit-green"
                )}
              />
              {isPaused ? "PAUSED" : "ACTIVE"}
            </span>
          </div>
        </div>

        {/* Success */}
        {view === "success" && (
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <CheckCircle2 className="h-12 w-12 text-profit-green" />
            <div>
              <h3 className="font-sans text-lg font-bold uppercase text-poly-black">
                Done
              </h3>
              <p className="mt-1 font-body text-sm text-muted-foreground">
                {successMessage}
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

        {/* Error */}
        {view === "error" && (
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <AlertTriangle className="h-12 w-12 text-loss-red" />
            <div>
              <h3 className="font-sans text-lg font-bold uppercase text-poly-black">
                Error
              </h3>
              <p className="mt-1 font-body text-sm text-muted-foreground">
                {errorMessage}
              </p>
            </div>
            <button
              onClick={() => setView("main")}
              className="mt-2 border border-poly-black px-8 py-2.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-colors hover:bg-poly-black hover:text-poly-cream"
            >
              GO BACK
            </button>
          </div>
        )}

        {/* Saving */}
        {view === "saving" && (
          <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-poly-yellow" />
            <p className="font-body text-sm text-muted-foreground">
              Updating settings...
            </p>
          </div>
        )}

        {/* Confirm Cancel */}
        {view === "confirm-cancel" && (
          <div className="flex flex-col gap-4 px-6 py-8">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-loss-red" />
              <div>
                <h3 className="font-sans text-sm font-bold uppercase text-poly-black">
                  Cancel Subscription?
                </h3>
                <p className="mt-1 font-body text-sm text-muted-foreground">
                  This will deactivate {subscription.display_name}. The bot will
                  stop placing new trades. Existing open positions will remain
                  until resolved.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setView("main")}
                className="flex-1 border border-border py-2.5 font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:border-poly-black hover:text-poly-black"
              >
                GO BACK
              </button>
              <button
                onClick={handleCancelSubscription}
                className="flex-1 bg-loss-red py-2.5 font-sans text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-loss-red/90"
              >
                YES, CANCEL
              </button>
            </div>
          </div>
        )}

        {/* Main View */}
        {view === "main" && (
          <div className="flex flex-col gap-0">
            {/* Capital Section */}
            <div className="border-b border-border px-6 py-5">
              <div className="mb-3 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-poly-black" />
                <h3 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black">
                  Capital
                </h3>
              </div>

              <div className="mb-4 grid grid-cols-3 gap-3">
                <div className="border border-border bg-white px-3 py-2.5">
                  <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                    Available
                  </p>
                  <p className="mt-0.5 font-body text-sm font-semibold tabular-nums text-profit-green">
                    ${available.toFixed(2)}
                  </p>
                </div>
                <div className="border border-border bg-white px-3 py-2.5">
                  <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                    Locked
                  </p>
                  <p className="mt-0.5 font-body text-sm font-semibold tabular-nums text-poly-black">
                    ${locked.toFixed(2)}
                  </p>
                </div>
                <div className="border border-border bg-white px-3 py-2.5">
                  <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                    Cooldown
                  </p>
                  <p className="mt-0.5 font-body text-sm font-semibold tabular-nums text-muted-foreground">
                    ${cooldown.toFixed(2)}
                  </p>
                </div>
              </div>

              <label className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                TOTAL CAPITAL (USD)
              </label>
              <div className="mt-1 flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-body text-sm text-muted-foreground">
                    $
                  </span>
                  <input
                    type="number"
                    min={5}
                    step={1}
                    value={capitalInput}
                    onChange={(e) => setCapitalInput(e.target.value)}
                    className="w-full border border-border bg-white py-2.5 pl-7 pr-4 font-body text-sm tabular-nums text-poly-black outline-none transition-colors focus:border-poly-yellow"
                  />
                </div>
                <button
                  onClick={handleSaveCapital}
                  disabled={!capitalChanged}
                  className={cn(
                    "shrink-0 px-5 py-2.5 font-sans text-[10px] font-bold uppercase tracking-widest transition-colors",
                    capitalChanged
                      ? "bg-poly-yellow text-poly-black hover:bg-poly-black hover:text-poly-yellow"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  )}
                >
                  SAVE
                </button>
              </div>
              <p className="mt-1 font-body text-[11px] text-muted-foreground">
                Minimum: $5. Increasing capital adds to available cash; decreasing
                reduces it.
              </p>
            </div>

            {/* Controls Section */}
            <div className="px-6 py-5">
              <div className="mb-3 flex items-center gap-2">
                <Settings className="h-4 w-4 text-poly-black" />
                <h3 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black">
                  Controls
                </h3>
              </div>

              <div className="flex flex-col gap-3">
                {/* Pause / Resume */}
                <button
                  onClick={handleTogglePause}
                  disabled={isTogglingPause}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 border py-3 font-sans text-xs font-bold uppercase tracking-widest transition-colors",
                    isPaused
                      ? "border-profit-green text-profit-green hover:bg-profit-green/10"
                      : "border-poly-yellow text-poly-black hover:bg-poly-yellow/10"
                  )}
                >
                  {isTogglingPause ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isPaused ? (
                    <Play className="h-4 w-4" />
                  ) : (
                    <Pause className="h-4 w-4" />
                  )}
                  {isPaused ? "RESUME BOT" : "PAUSE BOT"}
                </button>

                {/* Cancel Subscription */}
                <button
                  onClick={() => setView("confirm-cancel")}
                  className="flex w-full items-center justify-center gap-2 border border-loss-red/30 py-3 font-sans text-xs font-bold uppercase tracking-widest text-loss-red transition-colors hover:bg-loss-red/10"
                >
                  <XCircle className="h-4 w-4" />
                  CANCEL SUBSCRIPTION
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
