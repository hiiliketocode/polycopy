"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Phone, MessageSquare, Check, Loader2, Crown } from "lucide-react"
import { toast } from "sonner"

interface PhoneNotificationSettingsProps {
  isPremium: boolean
  onUpgradeClick: () => void
}

export function PhoneNotificationSettings({
  isPremium,
  onUpgradeClick,
}: PhoneNotificationSettingsProps) {
  const [phoneNumber, setPhoneNumber] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [isVerified, setIsVerified] = useState(false)
  const [showVerification, setShowVerification] = useState(false)
  const [loading, setLoading] = useState(false)
  const [smsEnabled, setSmsEnabled] = useState(false)
  const [whatsappEnabled, setWhatsappEnabled] = useState(false)
  const [loadingPrefs, setLoadingPrefs] = useState(true)

  // Load current phone and preferences
  useEffect(() => {
    loadPreferences()
  }, [])

  const loadPreferences = async () => {
    try {
      const response = await fetch("/api/phone/update-preferences")
      if (response.ok) {
        const data = await response.json()
        if (data.phoneNumber) {
          setPhoneNumber(data.phoneNumber)
        }
        setIsVerified(data.phoneVerified || false)
        setSmsEnabled(data.preferences?.sms || false)
        setWhatsappEnabled(data.preferences?.whatsapp || false)
      }
    } catch (error) {
      console.error("Failed to load preferences:", error)
    } finally {
      setLoadingPrefs(false)
    }
  }

  const handleSendVerification = async () => {
    if (!phoneNumber.trim()) {
      toast.error("Please enter a phone number")
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/phone/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success("Verification code sent! Check your phone.")
        setShowVerification(true)
      } else {
        toast.error(data.error || "Failed to send verification code")
      }
    } catch (error) {
      toast.error("Failed to send verification code")
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      toast.error("Please enter the verification code")
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/phone/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, code: verificationCode }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success("Phone number verified!")
        setIsVerified(true)
        setShowVerification(false)
        setVerificationCode("")
      } else {
        toast.error(data.error || "Invalid verification code")
      }
    } catch (error) {
      toast.error("Failed to verify code")
    } finally {
      setLoading(false)
    }
  }

  const handleToggleSms = async () => {
    if (!isVerified) {
      toast.error("Please verify your phone number first")
      return
    }

    const newValue = !smsEnabled
    setSmsEnabled(newValue)

    try {
      const response = await fetch("/api/phone/update-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sms: newValue }),
      })

      const data = await response.json()

      if (!response.ok) {
        setSmsEnabled(!newValue) // Revert on error
        toast.error(data.error || "Failed to update preference")
      } else {
        toast.success(newValue ? "SMS notifications enabled" : "SMS notifications disabled")
      }
    } catch (error) {
      setSmsEnabled(!newValue) // Revert on error
      toast.error("Failed to update preference")
    }
  }

  const handleToggleWhatsApp = async () => {
    if (!isVerified) {
      toast.error("Please verify your phone number first")
      return
    }

    const newValue = !whatsappEnabled
    setWhatsappEnabled(newValue)

    try {
      const response = await fetch("/api/phone/update-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp: newValue }),
      })

      const data = await response.json()

      if (!response.ok) {
        setWhatsappEnabled(!newValue) // Revert on error
        toast.error(data.error || "Failed to update preference")
      } else {
        toast.success(
          newValue ? "WhatsApp notifications enabled" : "WhatsApp notifications disabled"
        )
      }
    } catch (error) {
      setWhatsappEnabled(!newValue) // Revert on error
      toast.error("Failed to update preference")
    }
  }

  if (loadingPrefs) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!isPremium) {
    return (
      <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
        <div className="flex items-start gap-3">
          <Crown className="h-5 w-5 text-yellow-600 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-yellow-900 mb-1">Premium Feature</p>
            <p className="text-sm text-yellow-700 mb-3">
              Upgrade to Premium to receive notifications via SMS and WhatsApp
            </p>
            <Button
              onClick={onUpgradeClick}
              size="sm"
              className="bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-white"
            >
              <Crown className="mr-2 h-3.5 w-3.5" />
              Upgrade to Premium
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Phone Verification */}
      {!isVerified ? (
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
          <div className="flex items-start gap-3">
            <Phone className="h-5 w-5 text-slate-600 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-slate-900 mb-1">Verify Phone Number</p>
              <p className="text-sm text-slate-500 mb-3">
                Enter your phone number to receive SMS and WhatsApp notifications
              </p>

              {!showVerification ? (
                <div className="flex gap-2">
                  <Input
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="flex-1"
                    disabled={loading}
                  />
                  <Button onClick={handleSendVerification} disabled={loading} size="sm">
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Send Code"
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-slate-600">
                    Enter the 6-digit code sent to {phoneNumber}
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="123456"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      maxLength={6}
                      className="flex-1"
                      disabled={loading}
                    />
                    <Button onClick={handleVerifyCode} disabled={loading} size="sm">
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Verify"
                      )}
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowVerification(false)}
                    className="text-xs"
                  >
                    Change phone number
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 rounded-full p-1">
              <Check className="h-4 w-4 text-green-700" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-green-900">Phone Verified</p>
              <p className="text-sm text-green-700">{phoneNumber}</p>
            </div>
          </div>
        </div>
      )}

      {/* SMS Notifications */}
      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex items-center gap-3">
          <Phone className="h-5 w-5 text-slate-600" />
          <div>
            <p className="font-medium text-slate-900">SMS Notifications</p>
            <p className="text-sm text-slate-500">Get notified via text message</p>
          </div>
        </div>
        <Button
          onClick={handleToggleSms}
          disabled={!isVerified}
          variant={smsEnabled ? "default" : "outline"}
          size="sm"
        >
          {smsEnabled ? "Enabled" : "Disabled"}
        </Button>
      </div>

      {/* WhatsApp Notifications */}
      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-5 w-5 text-slate-600" />
          <div>
            <p className="font-medium text-slate-900">WhatsApp Notifications</p>
            <p className="text-sm text-slate-500">Get notified via WhatsApp</p>
          </div>
        </div>
        <Button
          onClick={handleToggleWhatsApp}
          disabled={!isVerified}
          variant={whatsappEnabled ? "default" : "outline"}
          size="sm"
        >
          {whatsappEnabled ? "Enabled" : "Disabled"}
        </Button>
      </div>

      <p className="text-xs text-slate-500 px-1">
        💡 Tip: You'll receive notifications when traders you follow close their positions or when
        markets resolve
      </p>
    </div>
  )
}

