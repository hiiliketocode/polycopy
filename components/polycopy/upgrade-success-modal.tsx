"use client"

import { Check, Crown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

export function UpgradeSuccessModal() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Check if user just returned from successful Stripe checkout
    const upgradeStatus = searchParams.get('upgrade')
    
    if (upgradeStatus === 'success') {
      setOpen(true)
      // Remove query param from URL without reloading
      const url = new URL(window.location.href)
      url.searchParams.delete('upgrade')
      window.history.replaceState({}, '', url.toString())
    }
  }, [searchParams])

  const handleClose = () => {
    setOpen(false)
    // Refresh the page to update premium status
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden">
        {/* Success Header */}
        <div className="bg-gradient-to-br from-yellow-400 via-amber-400 to-yellow-500 p-8 text-center text-white">
          <div className="bg-white/20 backdrop-blur-sm rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Check className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Welcome to Premium!</h2>
          <p className="text-yellow-50 text-sm">Your payment was successful. You're now on Polycopy Premium.</p>
        </div>

        <div className="p-6 space-y-6">
          {/* Success Details */}
          <div className="bg-gradient-to-br from-slate-50 to-white border-2 border-yellow-400 rounded-xl p-5">
            <div className="flex items-start gap-4">
              <div className="bg-yellow-100 rounded-full p-2 flex-shrink-0">
                <Crown className="h-5 w-5 text-yellow-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 mb-1">You're all set!</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  You now have access to all premium features including automated trade execution, advanced
                  analytics, real-time notifications, and priority support.
                </p>
              </div>
            </div>
          </div>

          {/* Get Started Button */}
          <Button
            onClick={handleClose}
            className="w-full h-12 bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-white font-bold text-base shadow-lg hover:shadow-xl transition-all"
          >
            Start Using Premium
          </Button>

          <p className="text-xs text-center text-slate-500">A confirmation email has been sent to your inbox</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

