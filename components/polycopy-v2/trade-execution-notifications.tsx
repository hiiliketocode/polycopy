"use client"

import { ChevronDown, ChevronUp, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

export type TradeExecutionNotification = {
  id: string
  market: string
  status: "filled" | "partial" | "failed"
  tradeAnchorId: string
  timestamp: number
}

type TradeExecutionNotificationsProps = {
  notifications: TradeExecutionNotification[]
  onNavigate: (notification: TradeExecutionNotification) => void
}

const STATUS_LABELS: Record<TradeExecutionNotification["status"], string> = {
  filled: "filled",
  partial: "partially filled",
  failed: "failed",
}

const STATUS_STYLES: Record<TradeExecutionNotification["status"], string> = {
  filled: "text-profit-green",
  partial: "text-poly-yellow",
  failed: "text-loss-red",
}

const AUTO_COLLAPSE_MS = 3000
const CELEBRATION_MS = 1200
const CONFETTI_PIECES = Array.from({ length: 10 }, (_, index) => index)

export function TradeExecutionNotifications({
  notifications,
  onNavigate,
}: TradeExecutionNotificationsProps) {
  const [isExpanded, setIsExpanded] = useState(() => notifications.length > 0)
  const [showCelebration, setShowCelebration] = useState(false)
  const [celebrationKey, setCelebrationKey] = useState(0)
  const listRef = useRef<HTMLDivElement | null>(null)
  const previousIdsRef = useRef<Set<string>>(new Set())
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (notifications.length === 0) {
      previousIdsRef.current = new Set()
      return
    }

    const previousIds = previousIdsRef.current
    const newNotices = notifications.filter((notice) => !previousIds.has(notice.id))

    if (newNotices.length > 0) {
      setIsExpanded(true)
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current)
      }
      collapseTimerRef.current = setTimeout(() => {
        setIsExpanded(false)
      }, AUTO_COLLAPSE_MS)

      if (newNotices.some((notice) => notice.status === "filled")) {
        setCelebrationKey((prev) => prev + 1)
        setShowCelebration(true)
        if (celebrationTimerRef.current) {
          clearTimeout(celebrationTimerRef.current)
        }
        celebrationTimerRef.current = setTimeout(() => {
          setShowCelebration(false)
        }, CELEBRATION_MS)
      }

      if (listRef.current) {
        listRef.current.scrollTop = 0
      }
    }

    previousIdsRef.current = new Set(notifications.map((notice) => notice.id))
  }, [notifications])

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current)
      }
      if (celebrationTimerRef.current) {
        clearTimeout(celebrationTimerRef.current)
      }
    }
  }, [])

  if (notifications.length === 0) return null

  if (!isExpanded) {
    return (
      <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-3 border border-border bg-white px-4 py-2 shadow-lg"
          aria-label="Expand trade updates"
        >
          <span className="font-sans text-xs font-bold uppercase tracking-widest text-poly-black/50">
            Trade updates
          </span>
          <span className="flex items-center gap-2 font-sans text-xs font-bold text-poly-black/50">
            <span className="flex h-5 min-w-[20px] items-center justify-center bg-poly-black px-1 font-sans text-xs font-bold text-poly-yellow">
              {notifications.length}
            </span>
            <ChevronUp className="h-4 w-4" />
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2">
      <div className="relative overflow-hidden border border-border bg-white shadow-lg">
        {showCelebration ? (
          <div key={celebrationKey} className="confetti-layer" aria-hidden="true">
            {CONFETTI_PIECES.map((index) => (
              <span key={index} className="confetti" />
            ))}
          </div>
        ) : null}
        <div className="flex items-center justify-between border-b border-border px-2 py-2.5">
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="flex flex-1 items-center justify-between px-2 py-2.5 text-left"
            aria-label="Collapse trade updates"
          >
<span className="font-sans text-xs font-bold uppercase tracking-widest text-poly-black/50">
            Trade updates
          </span>
            <span className="flex items-center gap-2 font-sans text-xs font-bold text-poly-black/40">
              {notifications.length}
              <ChevronDown className="h-4 w-4" />
            </span>
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="ml-2 flex h-8 w-8 items-center justify-center text-poly-black/40 transition hover:bg-poly-black/5 hover:text-poly-black/60"
            aria-label="Close trade updates"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div
          ref={listRef}
          className="max-h-[180px] divide-y divide-border overflow-y-auto"
        >
          {notifications.map((notice) => (
            <div key={notice.id} className="flex min-h-[60px] items-start gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => onNavigate(notice)}
                className="flex-1 text-left"
              >
                <p className="text-sm font-body font-semibold text-poly-black">
                  Your trade on {notice.market}{" "}
                  <span className={cn("font-bold", STATUS_STYLES[notice.status])}>
                    {STATUS_LABELS[notice.status]}
                  </span>
                </p>
              </button>
            </div>
          ))}
        </div>
      </div>
      <style jsx>{`
        .confetti-layer {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
          overflow: hidden;
          z-index: 10;
        }
        .confetti {
          position: absolute;
          width: 6px;
          height: 6px;
          top: -6px;
          animation: confetti-fall 1.2s ease-out forwards;
        }
        .confetti:nth-child(1) { left: 10%; background: #FDB022; animation-delay: 0ms; }
        .confetti:nth-child(2) { left: 20%; background: #10B981; animation-delay: 50ms; }
        .confetti:nth-child(3) { left: 30%; background: #0F0F0F; animation-delay: 100ms; }
        .confetti:nth-child(4) { left: 40%; background: #FDB022; animation-delay: 150ms; }
        .confetti:nth-child(5) { left: 50%; background: #3B82F6; animation-delay: 200ms; }
        .confetti:nth-child(6) { left: 60%; background: #FDB022; animation-delay: 80ms; }
        .confetti:nth-child(7) { left: 70%; background: #10B981; animation-delay: 130ms; }
        .confetti:nth-child(8) { left: 80%; background: #0F0F0F; animation-delay: 180ms; }
        .confetti:nth-child(9) { left: 90%; background: #FDB022; animation-delay: 60ms; }
        .confetti:nth-child(10) { left: 95%; background: #3B82F6; animation-delay: 110ms; }
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(200px) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
