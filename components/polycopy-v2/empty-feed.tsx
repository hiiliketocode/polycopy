"use client"

import { Activity, UserPlus } from "lucide-react"
import Link from "next/link"

export function EmptyFeed() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center bg-gray-100">
        <Activity className="h-8 w-8 text-gray-400" strokeWidth={1.5} />
      </div>
      <h2 className="mb-2 font-sans text-lg font-bold uppercase tracking-wide text-poly-black">
        No Trades Yet
      </h2>
      <p className="mb-6 max-w-sm text-sm text-gray-600">
        Follow traders to see their latest moves in your feed
      </p>
      <Link
        href="/v2/discover"
        className="btn-primary inline-flex items-center gap-2 px-6 py-3"
      >
        <UserPlus className="h-4 w-4" />
        Discover Traders
      </Link>
    </div>
  )
}
