"use client"

import type { LucideIcon } from "lucide-react"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="p-4 bg-poly-black/5 mb-5">
        <Icon className="h-8 w-8 text-poly-black/40" />
      </div>

      <h3 className="font-sans text-lg font-bold uppercase tracking-wide text-poly-black mb-2">{title}</h3>
      <p className="font-body text-sm text-poly-black/60 max-w-sm mb-6">{description}</p>

      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="bg-poly-yellow px-5 py-2.5 font-sans text-xs font-bold uppercase tracking-[0.2em] text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
