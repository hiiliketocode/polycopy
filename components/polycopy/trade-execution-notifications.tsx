"use client"

import { X } from "lucide-react"
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
  onDismiss: (id: string) => void
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

export function TradeExecutionNotifications({
  notifications,
  onDismiss,
  onNavigate,
}: TradeExecutionNotificationsProps) {
  if (notifications.length === 0) return null

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Trade updates</p>
          <span className="text-[11px] font-medium text-slate-400">{notifications.length}</span>
        </div>
        <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
          {notifications.map((notice) => (
            <div key={notice.id} className="flex items-start gap-3 px-4 py-3">
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
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onDismiss(notice.id)
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                aria-label="Dismiss trade notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
