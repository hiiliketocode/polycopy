"use client"

import { Crown } from "lucide-react"
import { Button } from "@/components/ui/button"
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
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-amber-500 p-4 rounded-lg">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500 rounded-full p-2">
              <Crown className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">{message}</p>
              <p className="text-sm text-slate-600">Upgrade to Premium for $20/month</p>
            </div>
          </div>
          <Button
            onClick={handleUpgrade}
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-black font-semibold"
          >
            Upgrade
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-amber-200 rounded-lg p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-900">{message}</p>
        </div>
        <Button
          onClick={handleUpgrade}
          size="sm"
          className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-black font-semibold"
        >
          Upgrade
        </Button>
      </div>
    </div>
  )
}
