"use client"

import type React from "react"
import { useState } from "react"
import {
  ExternalLink,
  Shield,
  Lock,
  Eye,
  EyeOff,
  ArrowLeftRight,
  ArrowLeft,
  ChevronDown,
  Info,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface ConnectWalletModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnect?: (walletAddress: string) => void
}

type Step = "intro" | "link-account" | "enter-private-key"

type ValidateResponse = {
  isValidAddress: boolean
  isContract: boolean
  chainId: number
  error?: string
}

type BalanceResponse = {
  accountAddress: string
  usdcBalanceRaw: string
  usdcBalanceFormatted: string
  error?: string
}

type TradeStatsResponse = {
  totalTrades?: number
  error?: string
}

export function ConnectWalletModal({ open, onOpenChange, onConnect }: ConnectWalletModalProps) {
  const [step, setStep] = useState<Step>("intro")
  const [walletAddress, setWalletAddress] = useState("")
  const [privateKey, setPrivateKey] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [linkAccountError, setLinkAccountError] = useState<string | null>(null)
  const [showAccountDetails, setShowAccountDetails] = useState(false)
  const [validateLoading, setValidateLoading] = useState(false)
  const [validateError, setValidateError] = useState<string | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [balanceData, setBalanceData] = useState<BalanceResponse | null>(null)
  const [tradeCountLoading, setTradeCountLoading] = useState(false)
  const [tradeCountError, setTradeCountError] = useState<string | null>(null)
  const [tradeCount, setTradeCount] = useState<number | null>(null)

  const validateAccount = async (addressOverride?: string) => {
    const targetAddress = (addressOverride ?? walletAddress).trim()
    if (!targetAddress) {
      setValidateError("Please enter a Polymarket wallet address")
      return null
    }

    setValidateLoading(true)
    setValidateError(null)

    try {
      const res = await fetch("/api/turnkey/polymarket/validate-account", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ accountAddress: targetAddress }),
      })

      const data = (await res.json()) as ValidateResponse
      if (!res.ok) {
        throw new Error(data?.error || "Failed to validate account")
      }
      return data
    } catch (err: any) {
      setValidateError(err?.message || "Failed to validate account")
      return null
    } finally {
      setValidateLoading(false)
    }
  }

  const fetchBalance = async (addressOverride?: string) => {
    const targetAddress = (addressOverride ?? walletAddress).trim()
    if (!targetAddress) {
      setBalanceError("Enter a Polymarket wallet address first")
      setBalanceData(null)
      return null
    }

    setBalanceLoading(true)
    setBalanceError(null)
    setBalanceData(null)

    try {
      const res = await fetch("/api/turnkey/polymarket/usdc-balance", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ accountAddress: targetAddress }),
      })
      const data = (await res.json()) as BalanceResponse
      if (!res.ok) {
        throw new Error(data?.error || "Failed to fetch account value")
      }
      setBalanceData(data)
      return data
    } catch (err: any) {
      setBalanceError(err?.message || "Failed to fetch account value")
      return null
    } finally {
      setBalanceLoading(false)
    }
  }

  const fetchTradeCount = async (addressOverride?: string) => {
    const targetAddress = (addressOverride ?? walletAddress).trim()
    if (!targetAddress) {
      setTradeCountError("Enter a Polymarket wallet address first")
      setTradeCount(null)
      return null
    }

    setTradeCountLoading(true)
    setTradeCountError(null)
    setTradeCount(null)

    try {
      const res = await fetch(`/api/polymarket/trader-stats?wallet=${targetAddress}`, {
        credentials: "include",
        cache: "no-store",
      })
      const data = (await res.json()) as TradeStatsResponse
      if (!res.ok) {
        throw new Error(data?.error || "Failed to fetch trade count")
      }
      const count = typeof data?.totalTrades === "number" ? data.totalTrades : 0
      setTradeCount(count)
      return count
    } catch (err: any) {
      setTradeCountError(err?.message || "Failed to fetch trade count")
      setTradeCount(null)
      return null
    } finally {
      setTradeCountLoading(false)
    }
  }

  const handleLinkAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (showAccountDetails) {
      setStep("enter-private-key")
      return
    }
    setLinkAccountError(null)
    setIsSubmitting(true)

    const targetAddress = walletAddress.trim()
    if (!targetAddress) {
      setLinkAccountError("Please enter a Polymarket wallet address")
      setIsSubmitting(false)
      return
    }

    const validation = await validateAccount(targetAddress)
    await fetchBalance(targetAddress)
    await fetchTradeCount(targetAddress)

    if (validation?.isContract) {
      setShowAccountDetails(true)
    } else if (!validation?.isContract && !validateError) {
      setLinkAccountError("That address does not look like a Polymarket account. Please try again.")
    }

    setIsSubmitting(false)
  }

  const handleBack = () => {
    if (step === "enter-private-key") {
      setStep("link-account")
    }
  }

  const handleLinkPrivateKey = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setImportError(null)

    try {
      // Step 1: Get import bundle from server
      const bundleRes = await fetch('/api/turnkey/import-private-key', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      })

      if (!bundleRes.ok) {
        const bundleData = await bundleRes.json()
        throw new Error(bundleData?.error || 'Failed to get import bundle')
      }

      const { importBundle, userId: importUserId, organizationId: importOrgId } = await bundleRes.json()

      if (!importBundle) {
        throw new Error('Import bundle not received from server')
      }

      // Step 2: Encrypt private key client-side using Turnkey SDK
      const { encryptPrivateKeyToBundle } = await import('@turnkey/crypto')

      const trimmedKey = privateKey.trim()
      const encryptedBundleString = await encryptPrivateKeyToBundle({
        privateKey: trimmedKey,
        keyFormat: 'HEXADECIMAL',
        importBundle,
        userId: importUserId,
        organizationId: importOrgId,
      })

      let encryptedBundle: Record<string, any>
      try {
        encryptedBundle = JSON.parse(encryptedBundleString)
      } catch {
        throw new Error('Failed to parse encrypted bundle')
      }

      // Step 3: Send encrypted bundle to server
      const importRes = await fetch('/api/turnkey/import-private-key', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          polymarket_account_address: walletAddress.trim(),
          encryptedBundle,
        }),
      })

      const importData = await importRes.json()
      if (!importRes.ok) {
        throw new Error(importData?.error || 'Failed to import wallet')
      }

      // Success!
      setIsSubmitting(false)
      handleDone()
    } catch (err: any) {
      console.error('Wallet import error:', err)
      setImportError(err?.message || 'Failed to import wallet')
      setIsSubmitting(false)
    }
  }

  const handleDone = () => {
    if (onConnect) {
      onConnect(walletAddress)
    }
    onOpenChange(false)
    // Reset state
    setTimeout(() => {
      setStep("intro")
      setWalletAddress("")
      setPrivateKey("")
      setImportError(null)
      setLinkAccountError(null)
      setValidateError(null)
      setBalanceError(null)
      setBalanceData(null)
      setTradeCountError(null)
      setTradeCount(null)
      setShowAccountDetails(false)
    }, 300)
  }

  // Reset error when modal opens/closes
  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen)
    if (!newOpen) {
      // Reset state when closing
      setTimeout(() => {
        setStep("intro")
        setWalletAddress("")
        setPrivateKey("")
        setImportError(null)
        setLinkAccountError(null)
        setValidateError(null)
        setBalanceError(null)
        setBalanceData(null)
        setTradeCountError(null)
        setTradeCount(null)
        setShowAccountDetails(false)
      }, 300)
    }
  }


  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 gap-0 overflow-hidden bg-white">
        {/* Intro */}
        {step === "intro" && (
          <>
            <DialogHeader className="bg-white border-b border-slate-100 p-6">
              <div className="flex items-center justify-center gap-3">
                <div className="h-10 w-10 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                  <img
                    src="/logos/polycopy-logo-icon.png"
                    alt="Polycopy"
                    className="h-full w-full object-contain"
                    loading="eager"
                    decoding="async"
                  />
                </div>
                <div className="relative flex items-center justify-center">
                  <ArrowLeftRight className="h-5 w-5 text-slate-400 link-flow-arrow" />
                </div>
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 shadow-sm">
                  <img
                    src="/logos/polymarket-logo.svg"
                    alt="Polymarket"
                    className="h-5 w-5 object-contain"
                    loading="eager"
                    decoding="async"
                  />
                </div>
              </div>
              <DialogTitle className="text-xl font-semibold text-slate-900 mt-4 text-center">
                Connect your Polymarket account
              </DialogTitle>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Step 1</div>
                  <div className="text-sm font-medium text-slate-900">Enter Polymarket address</div>
                  <p className="text-xs text-slate-600 mt-1">We use it to link your profile.</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Step 2</div>
                  <div className="text-sm font-medium text-slate-900">Securely connect your key</div>
                  <p className="text-xs text-slate-600 mt-1">Encrypted via Turnkey.</p>
                </div>
              </div>
            </DialogHeader>

            <div className="p-6">
              <Button
                type="button"
                onClick={() => setStep("link-account")}
                className="w-full h-12 text-base bg-slate-900 hover:bg-slate-800 text-white font-semibold"
              >
                Continue
              </Button>
            </div>
          </>
        )}

        {/* Step 1: Link Account */}
        {step === "link-account" && (
          <>
            <DialogHeader className="bg-white border-b border-slate-100 p-6">
              <DialogTitle className="text-xl font-semibold text-slate-900">
                Step 1: Enter your Polymarket address
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleLinkAccount} className="p-6 space-y-5">
              <div className="space-y-2">
                <label htmlFor="wallet-address" className="sr-only">
                  Polymarket wallet address
                </label>
                <Input
                  id="wallet-address"
                  type="text"
                  placeholder="Paste your Polymarket wallet address (0x...)"
                  value={walletAddress}
                  onChange={(e) => {
                    setWalletAddress(e.target.value)
                    setShowAccountDetails(false)
                    setBalanceData(null)
                    setTradeCount(null)
                    setBalanceError(null)
                    setTradeCountError(null)
                    setValidateError(null)
                    setLinkAccountError(null)
                  }}
                  className="w-full h-12 text-base"
                  required
                />
              </div>

              {(linkAccountError || validateError) && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {linkAccountError || validateError}
                </div>
              )}

              {(showAccountDetails || balanceLoading || tradeCountLoading) && (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-sm text-slate-600">
                    Confirm these details match your Polymarket account before continuing.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">Account value</p>
                      <p className="text-lg font-semibold text-slate-900 mt-2">
                        {balanceLoading ? "Loading..." : balanceData?.usdcBalanceFormatted || "—"}
                      </p>
                      {balanceError && <p className="text-xs text-rose-600 mt-1">{balanceError}</p>}
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">Trade count</p>
                      <p className="text-lg font-semibold text-slate-900 mt-2">
                        {tradeCountLoading ? "Loading..." : tradeCount ?? "—"}
                      </p>
                      {tradeCountError && <p className="text-xs text-rose-600 mt-1">{tradeCountError}</p>}
                    </div>
                  </div>
                </div>
              )}

              <Button
                type="submit"
                disabled={isSubmitting || validateLoading || !walletAddress}
                className="w-full h-12 text-base bg-slate-900 hover:bg-slate-800 text-white font-semibold"
              >
                {isSubmitting ? "Checking..." : showAccountDetails ? "Continue" : "Check account"}
              </Button>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4">
                <div>
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      window.open("https://polymarket.com/", "_blank", "noopener,noreferrer")
                    }}
                    variant="ghost"
                    size="sm"
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Open Polymarket
                    <ExternalLink className="ml-2 h-3 w-3" />
                  </Button>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">What is the Polymarket wallet address?</p>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                    It is the public wallet tied to your Polymarket profile.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">How to find it</p>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                    Open your profile screen by tapping your username in the top-right menu, then click your profile
                    image to reveal your wallet address.
                  </p>
                </div>
              </div>
            </form>
          </>
        )}


        {/* Step 2: Enter Private Key */}
        {step === "enter-private-key" && (
          <>
            <DialogHeader className="bg-white border-b border-slate-100 p-6">
              <div className="flex items-start gap-2 mb-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  className="text-slate-700 hover:bg-slate-100 -ml-2 h-8 w-8 p-0"
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </div>
              <DialogTitle className="text-xl font-semibold text-slate-900">
                Step 2: Securely enter your private key
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleLinkPrivateKey} className="p-6 space-y-5">
              <div className="relative">
                <Input
                  id="private-key"
                  type={showPrivateKey ? "text" : "password"}
                  placeholder="Paste your private key"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  className="w-full h-12 text-base font-mono pr-10"
                  required
                />
                {privateKey && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                  >
                    {showPrivateKey ? (
                      <EyeOff className="h-4 w-4 text-slate-500" />
                    ) : (
                      <Eye className="h-4 w-4 text-slate-500" />
                    )}
                  </Button>
                )}
              </div>

              {importError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                  <strong>Error:</strong> {importError}
                </div>
              )}

              <Button
                type="submit"
                disabled={isSubmitting || !privateKey}
                className="w-full h-12 text-base bg-slate-900 hover:bg-slate-800 text-white font-semibold"
              >
                {isSubmitting ? "Securing Connection..." : "Link"}
              </Button>

              <a
                href="https://www.turnkey.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-slate-700"
              >
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] uppercase tracking-wide">
                  Secured by
                </span>
                <span className="text-sm font-semibold text-slate-800">Turnkey</span>
              </a>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500"
                        aria-label="Opens in a new tab"
                      >
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent sideOffset={6}>
                      Opens Polymarket's Magic Link export page in a new tab.
                    </TooltipContent>
                  </Tooltip>
                  <Button
                    type="button"
                    onClick={() => window.open("https://reveal.magic.link/polymarket", "_blank", "noopener,noreferrer")}
                    variant="outline"
                    className="flex-1 justify-between"
                  >
                    Open Polymarket key export
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>

                <Collapsible>
                  <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <span className="flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      How to get your private key
                    </span>
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3 text-sm text-slate-600">
                    <ol className="space-y-2 list-decimal list-inside">
                      <li>Sign in with the email tied to your Polymarket account.</li>
                      <li>Click “Reveal Private Key” and complete authentication.</li>
                      <li>Copy the key that starts with “0x”.</li>
                    </ol>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-800">
                    Polycopy never sees or stores your private key. Key management is handled by Turnkey.
                  </p>
                </div>
              </div>
            </form>
          </>
        )}

        <style jsx>{`
          .link-flow-arrow {
            animation: link-flow 1.6s ease-in-out infinite;
          }

          @keyframes link-flow {
            0%,
            100% {
              transform: translateX(-6px);
              opacity: 0.5;
            }
            50% {
              transform: translateX(6px);
              opacity: 1;
            }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  )
}
