"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"

interface ProductIconProps {
  icon:
    | "bot_intelligence"
    | "classic_squares"
    | "execution"
    | "expert_network"
    | "signal_feed"
  size?: number
  className?: string
}

export function ProductIcon({ icon, size = 48, className }: ProductIconProps) {
  const iconMap = {
    bot_intelligence: "/logos/icon_bot_intelligence.svg",
    classic_squares: "/logos/icon_classic_squares.svg",
    execution: "/logos/icon_execution.svg",
    expert_network: "/logos/icon_expert_network.svg",
    signal_feed: "/logos/icon_signal_feed.svg",
  }

  return (
    <Image
      src={iconMap[icon]}
      alt={icon.replace(/_/g, " ")}
      width={size}
      height={size}
      className={cn("h-auto w-auto", className)}
    />
  )
}
