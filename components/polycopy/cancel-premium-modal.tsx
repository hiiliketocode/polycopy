"use client"

import { useState } from "react"
import { AlertTriangle, X, Crown, TrendingDown, Bell, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { toast } from "sonner"

interface CancelPremiumModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCancelConfirmed: () => void
}

export function CancelPremiumModal({
  open,
  onOpenChange,
  onCancelConfirmed,
}: CancelPremiumModalProps) {
  const [step, setStep] = useState<"confirm" | "feedback" | "processing">("confirm")
  const [cancelReason, setCancelReason] = useState("")
  const [feedbackText, setFeedbackText] = useState("")
  const [loading, setLoading] = useState(false)

  const cancelReasons = [
    "Too expensive",
    "Not using it enough",
    "Missing features I need",
    "Technical issues",
    "Found a better alternative",
    "Just testing it out",
    "Other",
  ]

  const handleClose = () => {
    setStep("confirm")
    setCancelReason("")
    setFeedbackText("")
    setLoading(false)
    onOpenChange(false)
  }

  const handleContinueToFeedback = () => {
    setStep("feedback")
  }

  const handleFinalCancel = async () => {
    setLoading(true)
    try {
      // Call API to cancel subscription
      const response = await fetch("/api/stripe/cancel-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: cancelReason,
          feedback: feedbackText,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to cancel subscription")
      }

      toast.success("Subscription canceled. You'll have access until the end of your billing period.")
      onCancelConfirmed()
      handleClose()
    } catch (error: any) {
      console.error("Cancel error:", error)
      toast.error(error.message || "Failed to cancel subscription. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const lostFeatures = [
    {
      icon: Zap,
      title: "Real Copy Trading",
      description: "Automatic trade execution synced with top traders",
    },
    {
      icon: Bell,
      title: "WhatsApp Notifications",
      description: "Real-time alerts when traders close positions",
    },
    {
      icon: TrendingDown,
      title: "Advanced Analytics",
      description: "Track performance, ROI, and trade history",
    },
    {
      icon: Crown,
      title: "Priority Support",
      description: "Fast response times and dedicated help",
    },
  ]

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[540px] p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
        {step === "confirm" && (
          <>
            <DialogHeader className="relative bg-gradient-to-br from-slate-100 to-slate-200 p-6 pb-5 flex-shrink-0">
              <div className="flex items-center gap-3 mb-1.5">
                <div className="bg-slate-300 rounded-full p-2">
                  <AlertTriangle className="h-5 w-5 text-slate-700" />
                </div>
                <DialogTitle className="text-xl font-bold text-slate-900">
                  Cancel Premium?
                </DialogTitle>
              </div>
              <p className="text-slate-600 text-sm">
                You'll lose access to these powerful features
              </p>
            </DialogHeader>

            <div className="p-6 space-y-5 overflow-y-auto">
              {/* What You'll Lose */}
              <div className="space-y-3">
                {lostFeatures.map((feature, index) => {
                  const Icon = feature.icon
                  return (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200"
                    >
                      <div className="bg-slate-200 rounded-full p-2 flex-shrink-0">
                        <Icon className="h-4 w-4 text-slate-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900 text-sm">
                          {feature.title}
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {feature.description}
                        </p>
                      </div>
                      <X className="h-4 w-4 text-red-500 flex-shrink-0 mt-1" />
                    </div>
                  )
                })}
              </div>

              {/* Downgrade Impact */}
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-sm text-amber-900 font-medium mb-2">
                  ⚠️ What happens after cancellation:
                </p>
                <ul className="text-xs text-amber-800 space-y-1 ml-4 list-disc">
                  <li>Switch to Manual Copy (slower, requires manual trade execution)</li>
                  <li>No more real-time notifications</li>
                  <li>Limited to basic analytics</li>
                  <li>You'll keep access until your billing period ends</li>
                </ul>
              </div>

              {/* Buttons */}
              <div className="flex flex-col gap-2 pt-2">
                <Button
                  onClick={() => handleClose()}
                  className="w-full h-11 bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-white font-bold"
                >
                  <Crown className="h-4 w-4 mr-2" />
                  Keep My Premium
                </Button>
                <Button
                  onClick={handleContinueToFeedback}
                  variant="outline"
                  className="w-full h-11 text-slate-600 hover:text-slate-900"
                >
                  Continue to Cancel
                </Button>
              </div>

              <p className="text-xs text-center text-slate-500">
                Cancel anytime • No questions asked • Easy to reactivate
              </p>
            </div>
          </>
        )}

        {step === "feedback" && (
          <>
            <DialogHeader className="relative bg-slate-100 p-6 pb-5 flex-shrink-0">
              <DialogTitle className="text-xl font-bold text-slate-900">
                Help us improve
              </DialogTitle>
              <p className="text-slate-600 text-sm">
                We'd love to know why you're canceling (optional)
              </p>
            </DialogHeader>

            <div className="p-6 space-y-5 overflow-y-auto">
              {/* Reason Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-slate-900">
                  What's your main reason for canceling?
                </Label>
                <RadioGroup value={cancelReason} onValueChange={setCancelReason}>
                  {cancelReasons.map((reason) => (
                    <div key={reason} className="flex items-center space-x-2">
                      <RadioGroupItem value={reason} id={reason} />
                      <Label
                        htmlFor={reason}
                        className="text-sm text-slate-700 cursor-pointer"
                      >
                        {reason}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {/* Additional Feedback */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-900">
                  Anything else we should know? (optional)
                </Label>
                <Textarea
                  placeholder="Your feedback helps us improve..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex flex-col gap-2 pt-2">
                <Button
                  onClick={handleFinalCancel}
                  disabled={loading}
                  variant="destructive"
                  className="w-full h-11"
                >
                  {loading ? "Processing..." : "Confirm Cancellation"}
                </Button>
                <Button
                  onClick={() => setStep("confirm")}
                  variant="outline"
                  className="w-full h-11"
                  disabled={loading}
                >
                  Go Back
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

