"use client"

import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

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
      <div className="p-4 rounded-2xl bg-slate-100 mb-5">
        <Icon className="h-8 w-8 text-slate-400" />
      </div>

      <h3 className="text-lg font-semibold text-slate-950 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm mb-6">{description}</p>

      {actionLabel && onAction && (
        <Button onClick={onAction} className="bg-[#FDB022] hover:bg-[#E09A1A] text-slate-950 font-semibold">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
