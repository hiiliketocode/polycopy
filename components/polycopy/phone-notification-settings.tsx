"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Phone, MessageSquare, Check, Loader2, Crown, ExternalLink } from "lucide-react"
import { toast } from "sonner"
import { QRCodeSVG } from "qrcode.react"

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
  const [whatsappEnabled, setWhatsappEnabled] = useState(false)
  const [loadingPrefs, setLoadingPrefs] = useState(true)
  const [showWhatsAppQR, setShowWhatsAppQR] = useState(false)

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
              Upgrade to Premium to receive notifications via WhatsApp
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
                Enter your phone number to receive WhatsApp notifications
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

      {/* WhatsApp Opt-In & Notifications */}
      {isVerified && (
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-4">
          <div className="flex items-start gap-3">
            <MessageSquare className="h-5 w-5 text-slate-600 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-slate-900 mb-1">WhatsApp Notifications</p>
              <p className="text-sm text-slate-500 mb-3">
                Get real-time notifications via WhatsApp
              </p>

              {!whatsappEnabled ? (
                <>
                  <p className="text-sm text-slate-700 mb-3">
                    To enable WhatsApp notifications, send a message to connect your account:
                  </p>

                  {/* Buttons */}
                  <div className="flex flex-col sm:flex-row gap-2 mb-3">
                    <Button
                      onClick={() => {
                        const twilioNumber = process.env.NEXT_PUBLIC_TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886'
                        const message = 'join shadow-butter' // Twilio sandbox code
                        const whatsappUrl = `https://wa.me/${twilioNumber.replace('whatsapp:', '')}?text=${encodeURIComponent(message)}`
                        window.open(whatsappUrl, '_blank')
                      }}
                      variant="default"
                      size="sm"
                      className="flex-1"
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Open WhatsApp
                      <ExternalLink className="h-3 w-3 ml-2" />
                    </Button>
                    <Button
                      onClick={() => setShowWhatsAppQR(!showWhatsAppQR)}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      {showWhatsAppQR ? "Hide" : "Show"} QR Code
                    </Button>
                  </div>

                  {/* QR Code */}
                  {showWhatsAppQR && (
                    <div className="flex flex-col items-center p-4 bg-white rounded-lg border border-slate-200">
                      <p className="text-xs text-slate-600 mb-3 text-center">
                        Scan this QR code with your phone to open WhatsApp
                      </p>
                      <QRCodeSVG
                        value={`https://wa.me/14155238886?text=${encodeURIComponent('join shadow-butter')}`}
                        size={180}
                        level="M"
                        includeMargin={true}
                      />
                      <p className="text-xs text-slate-500 mt-2">
                        Send: <code className="bg-slate-100 px-1 rounded">join shadow-butter</code>
                      </p>
                    </div>
                  )}

                  <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs text-blue-800">
                      💡 <strong>After sending the message:</strong> Click "Enable" below to start receiving notifications
                    </p>
                  </div>

                  {/* Enable Button */}
                  <Button
                    onClick={handleToggleWhatsApp}
                    disabled={loading}
                    variant="default"
                    size="sm"
                    className="w-full mt-3"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enable WhatsApp Notifications"}
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="bg-green-100 rounded-full p-1">
                      <Check className="h-3 w-3 text-green-700" />
                    </div>
                    <p className="text-sm text-green-700 font-medium">WhatsApp Connected</p>
                  </div>
                  <Button
                    onClick={handleToggleWhatsApp}
                    disabled={loading}
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disable WhatsApp Notifications"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500 px-1">
        💡 Tip: You'll receive notifications when traders you follow close their positions or when
        markets resolve
      </p>
    </div>
  )
}

