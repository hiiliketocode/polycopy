"use client"

import { ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"

type PremiumUpsellBannerProps = {
  message: string
  placement?: "profile-top" | "inline"
}

export function PremiumUpsellBanner({ message, placement = "inline" }: PremiumUpsellBannerProps) {
  const router = useRouter()

  const handleUpgrade = () => {
    router.push("/portfolio?upgrade=true")
  }

  if (placement === "profile-top") {
    return (
      <div className="border border-poly-yellow bg-poly-yellow/10 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-sans text-xs font-bold uppercase tracking-wide text-poly-black">{message}</p>
            <p className="mt-0.5 font-body text-xs text-muted-foreground">
              Upgrade to Premium for $20/month
            </p>
          </div>
          <button
            onClick={handleUpgrade}
            className="inline-flex shrink-0 items-center gap-1.5 bg-poly-yellow px-4 py-2 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
          >
            UPGRADE <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-poly-yellow bg-poly-yellow/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-sans text-[11px] font-bold uppercase tracking-wide text-poly-black">{message}</p>
        <button
          onClick={handleUpgrade}
          className="inline-flex shrink-0 items-center gap-1 bg-poly-yellow px-3 py-1.5 font-sans text-[9px] font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
        >
          UPGRADE <ArrowRight className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  )
}
