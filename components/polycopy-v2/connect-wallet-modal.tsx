"use client"

import type React from "react"
import { useState } from "react"
import {
  ExternalLink,
  CheckCircle2,
  Shield,
  Lock,
  Eye,
  EyeOff,
  ArrowLeftRight,
  ArrowLeft,
  ChevronDown,
  Info,
  Settings,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { USDC_DECIMALS } from "@/lib/turnkey/config"

interface ConnectWalletModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnect?: (walletAddress: string) => void
}

type Step = "intro" | "link-account" | "enter-private-key" | "success"

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
  const lowBalanceThresholdRaw = BigInt(10) ** BigInt(USDC_DECIMALS)
  const shouldShowFundingReminder =
    !!balanceData?.usdcBalanceRaw &&
    !balanceLoading &&
    BigInt(balanceData.usdcBalanceRaw) < lowBalanceThresholdRaw

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

      setIsSubmitting(false)
      setPrivateKey("")
      setShowPrivateKey(false)
      if (onConnect) {
        onConnect(walletAddress)
      }
      setStep("success")
    } catch (err: any) {
      console.error('Wallet import error:', err)
      setImportError(err?.message || 'Failed to import wallet')
      setIsSubmitting(false)
    }
  }

  const handleDone = () => {
    onOpenChange(false)
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

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen)
    if (!newOpen) {
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
      <DialogContent className="max-w-[min(560px,calc(100vw-2rem))] p-0 gap-0 overflow-hidden border-0 bg-poly-cream">
        {/* Intro */}
        {step === "intro" && (
          <>
            <DialogHeader className="bg-poly-yellow px-8 pb-6 pt-8">
              <div className="flex items-center justify-center gap-3">
                <div className="h-10 w-10 border border-poly-black/10 bg-white p-1">
                  <img
                    src="/logos/polycopy-logo-icon.png"
                    alt="Polycopy"
                    className="h-full w-full object-contain"
                    loading="eager"
                    decoding="async"
                  />
                </div>
                <div className="relative flex items-center justify-center">
                  <ArrowLeftRight className="h-5 w-5 text-poly-black/40 link-flow-arrow" />
                </div>
                <div className="flex items-center gap-2 border border-poly-black/10 bg-white px-3 py-1">
                  <img
                    src="/logos/polymarket-logo.svg"
                    alt="Polymarket"
                    className="h-5 w-5 object-contain"
                    loading="eager"
                    decoding="async"
                  />
                </div>
              </div>
              <div className="font-sans text-xs font-bold uppercase tracking-widest text-poly-black/50 mt-4 text-center">
                WALLET CONNECTION
              </div>
              <DialogTitle className="font-sans text-2xl font-black uppercase tracking-tight text-poly-black mt-1 text-center">
                Connect your Polymarket account
              </DialogTitle>
            </DialogHeader>

            <div className="border-b border-border bg-white px-8 py-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="border border-border bg-poly-cream p-3">
                  <div className="font-sans text-xs font-bold uppercase tracking-widest text-poly-black/50">Step 1</div>
                  <div className="font-sans text-sm font-bold text-poly-black mt-1">Enter Polymarket address</div>
                  <p className="font-body text-xs text-poly-black/60 mt-1">We use it to link your profile.</p>
                </div>
                <div className="border border-border bg-poly-cream p-3">
                  <div className="font-sans text-xs font-bold uppercase tracking-widest text-poly-black/50">Step 2</div>
                  <div className="font-sans text-sm font-bold text-poly-black mt-1">Securely connect your key</div>
                  <p className="font-body text-xs text-poly-black/60 mt-1">Encrypted via Turnkey.</p>
                </div>
              </div>
            </div>

            <div className="px-8 py-6">
              <button
                type="button"
                onClick={() => setStep("link-account")}
                className="w-full bg-poly-black py-4 font-sans text-xs font-bold uppercase tracking-[0.2em] text-poly-yellow transition-all hover:bg-poly-yellow hover:text-poly-black"
              >
                Continue
              </button>
            </div>
          </>
        )}

        {/* Step 1: Link Account */}
        {step === "link-account" && (
          <>
            <DialogHeader className="bg-poly-yellow px-8 pb-6 pt-8">
              <div className="font-sans text-xs font-bold uppercase tracking-widest text-poly-black/50">
                STEP 1 OF 2
              </div>
              <DialogTitle className="font-sans text-2xl font-black uppercase tracking-tight text-poly-black mt-1">
                Enter your Polymarket address
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleLinkAccount} className="border-b border-border bg-white px-8 py-6 space-y-5">
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
                  className="w-full h-12 text-base font-body border-border"
                  required
                />
              </div>

              {(linkAccountError || validateError) && (
                <div className="border border-loss-red/30 bg-loss-red/10 p-3 text-sm font-body text-loss-red">
                  {linkAccountError || validateError}
                </div>
              )}

              {(showAccountDetails || balanceLoading || tradeCountLoading) && (
                <div className="border border-border bg-poly-cream p-4">
                  <p className="text-sm font-body text-poly-black/60">
                    Confirm these details match your Polymarket account before continuing.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="border border-border bg-white p-4">
                      <p className="font-sans text-xs font-bold uppercase tracking-widest text-poly-black/50">Account value</p>
                      <p className="text-lg font-sans font-bold text-poly-black mt-2">
                        {balanceLoading ? "Loading..." : balanceData?.usdcBalanceFormatted || "\u2014"}
                      </p>
                      {balanceError && <p className="text-xs font-body text-loss-red mt-1">{balanceError}</p>}
                    </div>
                    <div className="border border-border bg-white p-4">
                      <p className="font-sans text-xs font-bold uppercase tracking-widest text-poly-black/50">Trade count</p>
                      <p className="text-lg font-sans font-bold text-poly-black mt-2">
                        {tradeCountLoading ? "Loading..." : tradeCount ?? "\u2014"}
                      </p>
                      {tradeCountError && <p className="text-xs font-body text-loss-red mt-1">{tradeCountError}</p>}
                    </div>
                  </div>
                  {shouldShowFundingReminder && (
                    <div className="mt-3 border border-poly-yellow/30 bg-poly-yellow/10 p-3 text-xs font-body text-poly-black/70">
                      Your Polymarket account balance is under $1. Fund your account with USDC before trading.
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || validateLoading || !walletAddress}
                className="w-full bg-poly-black py-4 font-sans text-xs font-bold uppercase tracking-[0.2em] text-poly-yellow transition-all hover:bg-poly-yellow hover:text-poly-black disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Checking..." : showAccountDetails ? "Continue" : "Check account"}
              </button>

              <div className="border border-border bg-poly-cream p-4 space-y-4">
                <div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      window.open("https://polymarket.com/", "_blank", "noopener,noreferrer")
                    }}
                    className="border border-border bg-white px-3 py-2.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black hover:bg-poly-black/5 transition-all inline-flex items-center gap-2"
                  >
                    Open Polymarket
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <div>
                  <p className="font-sans text-sm font-bold text-poly-black">What is the Polymarket wallet address?</p>
                  <p className="text-sm font-body text-poly-black/60 mt-1 leading-relaxed">
                    It is the public wallet tied to your Polymarket profile.
                  </p>
                </div>
                <div>
                  <p className="font-sans text-sm font-bold text-poly-black">How to find it</p>
                  <p className="text-sm font-body text-poly-black/60 mt-1 leading-relaxed">
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
            <DialogHeader className="bg-poly-yellow px-8 pb-6 pt-8">
              <div className="flex items-start gap-2 mb-2">
                <button
                  type="button"
                  onClick={handleBack}
                  className="text-poly-black/60 hover:text-poly-black -ml-2 h-8 w-8 p-0 inline-flex items-center justify-center transition-colors"
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              </div>
              <div className="font-sans text-xs font-bold uppercase tracking-widest text-poly-black/50">
                STEP 2 OF 2
              </div>
              <DialogTitle className="font-sans text-2xl font-black uppercase tracking-tight text-poly-black mt-1">
                Enter your private key
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleLinkPrivateKey} className="border-b border-border bg-white px-8 py-6 space-y-5">
              <div className="relative">
                <Input
                  id="private-key"
                  type={showPrivateKey ? "text" : "password"}
                  placeholder="Paste your private key"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  className="w-full h-12 text-base font-mono pr-10 border-border"
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
                      <EyeOff className="h-4 w-4 text-poly-black/50" />
                    ) : (
                      <Eye className="h-4 w-4 text-poly-black/50" />
                    )}
                  </Button>
                )}
              </div>

              {importError && (
                <div className="bg-loss-red/10 border border-loss-red/30 p-3 text-sm font-body text-loss-red">
                  <strong>Error:</strong> {importError}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !privateKey}
                className="w-full bg-poly-black py-4 font-sans text-xs font-bold uppercase tracking-[0.2em] text-poly-yellow transition-all hover:bg-poly-yellow hover:text-poly-black disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Securing Connection..." : "Link"}
              </button>

              <a
                href="https://www.turnkey.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 border border-border bg-white px-3 py-2.5 font-sans text-xs uppercase tracking-widest text-poly-black/60 hover:bg-poly-black/5 transition-all"
              >
                <span>Secured by</span>
                <span className="flex items-center gap-1.5 font-bold text-poly-black">
                  <span className="inline-flex h-5 w-5 items-center justify-center bg-poly-black text-xs font-bold text-white">
                    T
                  </span>
                  Turnkey
                </span>
              </a>

              <div className="border border-border bg-poly-cream p-4 space-y-3">
                <Collapsible>
                  <CollapsibleTrigger className="flex w-full items-center justify-between border border-border bg-white px-3 py-2 font-sans text-sm font-bold text-poly-black hover:bg-poly-black/5 transition-all">
                    <span className="flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      How to get your private key
                    </span>
                    <ChevronDown className="h-4 w-4 text-poly-black/40" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3 text-sm font-body text-poly-black/60">
                    <ol className="space-y-2 list-decimal list-inside">
                      <li>Sign in with the email tied to your Polymarket account.</li>
                      <li>
                        Go to{" "}
                        <span className="inline-flex items-center gap-1">
                          Settings
                          <Settings className="h-3 w-3 text-poly-black/50" aria-hidden="true" />
                        </span>{" "}
                        &gt; Export Private Key.
                      </li>
                      <li>Click &quot;Reveal Private Key&quot; and complete authentication.</li>
                      <li>Copy the key that starts with &quot;0x&quot;.</li>
                    </ol>
                  </CollapsibleContent>
                </Collapsible>

                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-6 w-6 items-center justify-center border border-border bg-white text-poly-black/50"
                        aria-label="Opens in a new tab"
                      >
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent sideOffset={6}>
                      Opens Polymarket&apos;s Magic Link export page in a new tab.
                    </TooltipContent>
                  </Tooltip>
                  <button
                    type="button"
                    onClick={() => window.open("https://reveal.magic.link/polymarket", "_blank", "noopener,noreferrer")}
                    className="border border-border bg-white px-3 py-2.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black hover:bg-poly-black/5 transition-all inline-flex items-center gap-2"
                  >
                    Open Polymarket key export
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>

                <Collapsible>
                  <CollapsibleTrigger className="flex w-full items-center justify-between border border-border bg-white px-3 py-2 font-sans text-sm font-bold text-poly-black hover:bg-poly-black/5 transition-all">
                    <span className="flex items-center gap-2">
                      <Info className="h-4 w-4" />
                      I can&apos;t find Export Private Key?
                    </span>
                    <ChevronDown className="h-4 w-4 text-poly-black/40" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3 text-sm font-body text-poly-black/60">
                    This most likely means you created your account with a wallet (not an email). It needs to be an
                    email account.{" "}
                    <a
                      href="https://docs.polymarket.com/polymarket-learn/get-started/how-to-signup"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold underline underline-offset-2"
                    >
                      Learn more here.
                    </a>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <div className="bg-info-blue/10 border border-info-blue/30 p-4">
                <div className="flex items-start gap-2">
                  <Shield className="h-5 w-5 text-info-blue flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-body text-poly-black/70">
                    Polycopy never sees or stores your private key. Key management is handled by Turnkey.{" "}
                    <a
                      href="https://www.turnkey.com/what-is-turnkey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold underline underline-offset-2"
                    >
                      Learn more.
                    </a>
                  </p>
                </div>
              </div>
            </form>
          </>
        )}

        {step === "success" && (
          <>
            <DialogHeader className="bg-poly-yellow px-8 pb-6 pt-8">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-14 w-14 items-center justify-center border border-profit-green/30 bg-profit-green/10">
                  <CheckCircle2 className="h-7 w-7 text-profit-green" />
                </div>
                <div className="font-sans text-xs font-bold uppercase tracking-widest text-poly-black/50 mt-4">
                  SETUP COMPLETE
                </div>
                <DialogTitle className="font-sans text-2xl font-black uppercase tracking-tight text-poly-black mt-1">
                  Congratulations!
                </DialogTitle>
                <p className="font-body text-sm text-poly-black/60 mt-2">
                  Setup complete. You are now ready to trade.
                </p>
              </div>
            </DialogHeader>
            <div className="px-8 py-6">
              <button
                type="button"
                onClick={handleDone}
                className="w-full bg-poly-black py-4 font-sans text-xs font-bold uppercase tracking-[0.2em] text-poly-yellow transition-all hover:bg-poly-yellow hover:text-poly-black"
              >
                Start Trading
              </button>
            </div>
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
