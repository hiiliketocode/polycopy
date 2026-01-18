"use client"

import { ChevronDown, ChevronUp } from "lucide-react"
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
  filled: "text-emerald-600",
  partial: "text-amber-600",
  failed: "text-rose-600",
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
          className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-lg"
          aria-label="Expand trade updates"
        >
          <span className="text-[11px] font-semibold tracking-wide text-slate-500">
            Trade updates
          </span>
          <span className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-900 px-1 text-[11px] font-semibold text-white">
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
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
        {showCelebration ? (
          <div key={celebrationKey} className="confetti-layer" aria-hidden="true">
            {CONFETTI_PIECES.map((index) => (
              <span key={index} className="confetti" />
            ))}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-2.5 text-left"
          aria-label="Collapse trade updates"
        >
          <span className="text-[11px] font-semibold tracking-wide text-slate-500">
            Trade updates
          </span>
          <span className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
            {notifications.length}
            <ChevronDown className="h-4 w-4" />
          </span>
        </button>
        <div
          ref={listRef}
          className="max-h-[180px] divide-y divide-slate-100 overflow-y-auto"
        >
          {notifications.map((notice) => (
            <div key={notice.id} className="flex min-h-[60px] items-start gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => onNavigate(notice)}
                className="flex-1 text-left"
              >
                <p className="text-sm font-semibold text-slate-900">
                  Your trade on {notice.market}{" "}
                  <span className={cn("font-semibold", STATUS_STYLES[notice.status])}>
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
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          z-index: 10;
        }

        .confetti {
          position: absolute;
          top: -8px;
          width: 6px;
          height: 12px;
          border-radius: 3px;
          opacity: 0;
          animation: confetti-fall ${CELEBRATION_MS}ms ease-out forwards;
        }

        .confetti-layer span:nth-child(1) {
          left: 12%;
          background: #34d399;
          animation-delay: 0ms;
        }
        .confetti-layer span:nth-child(2) {
          left: 24%;
          background: #fbbf24;
          animation-delay: 60ms;
        }
        .confetti-layer span:nth-child(3) {
          left: 36%;
          background: #60a5fa;
          animation-delay: 120ms;
        }
        .confetti-layer span:nth-child(4) {
          left: 48%;
          background: #f472b6;
          animation-delay: 180ms;
        }
        .confetti-layer span:nth-child(5) {
          left: 60%;
          background: #34d399;
          animation-delay: 90ms;
        }
        .confetti-layer span:nth-child(6) {
          left: 72%;
          background: #a78bfa;
          animation-delay: 140ms;
        }
        .confetti-layer span:nth-child(7) {
          left: 84%;
          background: #fb7185;
          animation-delay: 40ms;
        }
        .confetti-layer span:nth-child(8) {
          left: 18%;
          background: #f97316;
          animation-delay: 200ms;
        }
        .confetti-layer span:nth-child(9) {
          left: 66%;
          background: #22d3ee;
          animation-delay: 160ms;
        }
        .confetti-layer span:nth-child(10) {
          left: 90%;
          background: #facc15;
          animation-delay: 20ms;
        }

        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(90px) rotate(160deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
