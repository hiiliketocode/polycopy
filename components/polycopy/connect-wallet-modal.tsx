"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ExternalLink, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"
import Image from "next/image"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { encryptPrivateKeyToBundle } from "@turnkey/crypto"

interface ConnectWalletModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnect?: (walletAddress: string) => void
}

type Step = "link-account" | "account-linked" | "enter-private-key" | "success"

export function ConnectWalletModal({ open, onOpenChange, onConnect }: ConnectWalletModalProps) {
  const [step, setStep] = useState<Step>("link-account")
  const [walletAddress, setWalletAddress] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [clobSetupError, setClobSetupError] = useState<string | null>(null)
  const [accountDataError, setAccountDataError] = useState<string | null>(null)
  const autoAdvanceRef = useRef(false)
  const [privateKeyInput, setPrivateKeyInput] = useState("")

  const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/

  const resolveImportErrorMessage = (message: string) => {
    const normalized = message.toLowerCase()
    if (normalized.includes("no wallet mnemonic") || normalized.includes("mnemonic")) {
      return "Paste your wallet seed phrase or private key into the secure Turnkey form to continue."
    }
    if (
      normalized.includes("expected 32 bytes") ||
      normalized.includes("turnkey error 3") ||
      (normalized.includes("private key") && normalized.includes("32"))
    ) {
      return "This key looks the wrong length. Turnkey expects a 32-byte private key (64 hex characters). Make sure there are no spaces or line breaks."
    }
    if (normalized.includes("private key")) {
      return "We couldn't read that key. Double-check the private key format and try again."
    }
    return message
  }

  const [accountData, setAccountData] = useState({
    accountValue: null as number | null,
    openPositions: null as number | null,
  })

  useEffect(() => {
    if (!open) return
    if (walletAddress.trim()) return

    let cancelled = false

    const fetchSavedAddress = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser()
        const user = userData?.user
        if (!user) return
        const { data, error } = await supabase
          .from("profiles")
          .select("trading_wallet_address")
          .eq("id", user.id)
          .maybeSingle()
        if (cancelled || error) return
        if (data?.trading_wallet_address) {
          setWalletAddress(data.trading_wallet_address)
        }
      } catch {
        // Best effort only.
      }
    }

    fetchSavedAddress()
    return () => {
      cancelled = true
    }
  }, [open, walletAddress])

  const loadAccountDataForWallet = async (address: string) => {
    const trimmed = address.trim()
    if (!ADDRESS_REGEX.test(trimmed)) return
    setAccountDataError(null)
    setIsSubmitting(true)

    try {
      const [walletRes, positionsRes] = await Promise.all([
        fetch(`/api/polymarket/wallet/${trimmed}`, { cache: "no-store" }),
        fetch(`/api/polymarket/open-positions?wallet=${encodeURIComponent(trimmed)}`, {
          cache: "no-store",
        }),
      ])

      const walletPayload = await walletRes.json().catch(() => null)
      const positionsPayload = await positionsRes.json().catch(() => null)

      const accountValue =
        walletRes.ok && typeof walletPayload?.portfolioValue === "number"
          ? walletPayload.portfolioValue
          : 0
      const openPositions =
        positionsRes.ok && typeof positionsPayload?.open_positions === "number"
          ? positionsPayload.open_positions
          : 0

      if (!walletRes.ok || !positionsRes.ok) {
        setAccountDataError("We couldn't fetch live account stats yet. You can still continue.")
      }

      setAccountData({
        accountValue,
        openPositions,
      })
      setStep("account-linked")
    } catch {
      setAccountData({
        accountValue: 0,
        openPositions: 0,
      })
      setAccountDataError("We couldn't fetch live account stats yet. You can still continue.")
      setStep("account-linked")
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    if (!open) {
      autoAdvanceRef.current = false
      return
    }
    if (step !== "link-account") return
    if (!walletAddress.trim()) return
    if (autoAdvanceRef.current) return
    autoAdvanceRef.current = true
    loadAccountDataForWallet(walletAddress)
  }, [open, step, walletAddress])

  const handleLinkAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = walletAddress.trim()
    if (!ADDRESS_REGEX.test(trimmed)) {
      setLinkError("Enter a valid Polymarket wallet address (0x...).")
      return
    }
    setLinkError(null)
    setIsSubmitting(true)
    setAccountDataError(null)

    try {
      const importResponse = await fetch("/api/wallet/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: trimmed }),
      })
      if (!importResponse.ok) {
        setAccountDataError("We couldn't save this wallet address yet. You can still continue.")
      }
      setWalletAddress(trimmed)
      await loadAccountDataForWallet(trimmed)
    } catch {
      setAccountData({
        accountValue: 0,
        openPositions: 0,
      })
      setAccountDataError("We couldn't fetch live account stats yet. You can still continue.")
      setStep("account-linked")
    } finally {
      setIsSubmitting(false)
    }

  }

  const handleNext = () => {
    setStep("enter-private-key")
  }

  const handleBack = () => {
    if (step === "account-linked") {
      setStep("link-account")
    } else if (step === "enter-private-key") {
      setStep("account-linked")
    }
  }

  const normalizePrivateKey = (value: string) => {
    let trimmed = value.trim().replace(/\s+/g, "")
    if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
      trimmed = trimmed.slice(2)
    }
    return trimmed
  }

  const BackButton = ({ className = "" }: { className?: string }) => (
    <Button
      type="button"
      variant="ghost"
      onClick={handleBack}
      className={`flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 ${className}`}
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </Button>
  )

  const formatUsdc = (value: number | null) => {
    if (value === null || Number.isNaN(value)) return "--"
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const handleLinkPrivateKey = async (e: React.FormEvent) => {
    e.preventDefault()
    setImportError(null)
    const normalizedKey = normalizePrivateKey(privateKeyInput)
    if (!normalizedKey) {
      setImportError("Paste your private key to continue.")
      return
    }
    if (!/^[0-9a-fA-F]{64}$/.test(normalizedKey)) {
      setImportError("This key should be 64 hex characters. Remove 0x and any spaces or line breaks.")
      return
    }

    setIsSubmitting(true)
    try {
      const bundleRes = await fetch("/api/turnkey/import-private-key", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      })
      const bundleData = await bundleRes.json()
      if (!bundleRes.ok || !bundleData?.importBundle || !bundleData?.organizationId || !bundleData?.userId) {
        throw new Error(bundleData?.error || "Failed to load Turnkey import bundle")
      }

      const encryptedBundle = await encryptPrivateKeyToBundle({
        privateKey: normalizedKey,
        keyFormat: "HEXADECIMAL",
        importBundle: bundleData.importBundle,
        userId: bundleData.userId,
        organizationId: bundleData.organizationId,
      })

      // Send encrypted bundle to server
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

      const l2Response = await fetch('/api/polymarket/l2-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polymarketAccountAddress: walletAddress.trim() }),
      })
      if (!l2Response.ok) {
        const l2Payload = await l2Response.json().catch(() => null)
        const l2Message = l2Payload?.error || 'Unable to create CLOB credentials'
        setClobSetupError(l2Message)
        setImportError(`Wallet connected, but CLOB setup failed: ${l2Message}.`)
        setIsSubmitting(false)
        return
      }
      setClobSetupError(null)

      // Success!
      setIsSubmitting(false)
      setStep("success")
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
      setStep("link-account")
      setWalletAddress("")
      setLinkError(null)
      setImportError(null)
      setClobSetupError(null)
      setAccountDataError(null)
      setAccountData({ accountValue: null, openPositions: null })
      setPrivateKeyInput("")
    }, 300)
  }

  // Reset error when modal opens/closes
  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen)
    if (!newOpen) {
      // Reset state when closing
      setTimeout(() => {
        setStep("link-account")
        setWalletAddress("")
        setLinkError(null)
        setImportError(null)
        setClobSetupError(null)
        setAccountDataError(null)
        setAccountData({ accountValue: null, openPositions: null })
        setPrivateKeyInput("")
      }, 300)
    }
  }


  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-0 gap-0 overflow-hidden">
        {/* Step 1: Link Account */}
        {step === "link-account" && (
          <>
            <DialogHeader className="bg-gradient-to-r from-yellow-400 to-amber-500 text-black p-6">
              <DialogTitle className="text-xl font-bold">Link Your Polymarket Wallet</DialogTitle>
              <div className="text-sm text-black/80 mt-2 space-y-1">
                <p>
                  <strong>Step 1:</strong> Go to Polymarket.com, log in, and navigate to your profile.
                </p>
                <p>
                  <strong>Step 2:</strong> To the right of your username, click the icon that looks like a head in a box
                  to copy your Polymarket wallet address.
                </p>
                <p>
                  <strong>Step 3:</strong> Paste the address in the box below.
                </p>
              </div>
            </DialogHeader>

            <form onSubmit={handleLinkAccount} className="p-6 space-y-5">
              <div>
                <Button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    window.open("https://polymarket.com/", "_blank", "noopener,noreferrer");
                  }}
                  variant="outline"
                  className="mb-4 gap-2"
                >
                  Get My Polymarket Wallet Address
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <label htmlFor="wallet-address" className="text-sm font-medium text-slate-900">
                  Polymarket address
                </label>
                <Input
                  id="wallet-address"
                  type="text"
                  placeholder="0x..."
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  className="w-full"
                  required
                />
                {linkError && <p className="text-xs text-rose-600">{linkError}</p>}
              </div>

              <Button
                type="submit"
                disabled={isSubmitting || !walletAddress}
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold"
              >
                {isSubmitting ? "Linking..." : "Link"}
              </Button>
            </form>
          </>
        )}

        {/* Step 2: Account Linked */}
        {step === "account-linked" && (
          <>
            <DialogHeader className="bg-gradient-to-r from-yellow-400 to-amber-500 text-black p-6">
              <DialogTitle className="text-xl font-bold">Account linked</DialogTitle>
              <p className="text-sm text-black/80 mt-2">
                Your Polymarket profile is now linked. Please confirm the following details and click 'next'. If the details are wrong, click 'back' and re-enter your wallet address.
              </p>
            </DialogHeader>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-lg p-4">
                  <div className="text-xs text-slate-500 uppercase mb-1">Account Value</div>
                  <div className="text-2xl font-bold text-slate-900">{formatUsdc(accountData.accountValue)}</div>
                </div>
                <div className="border border-slate-200 rounded-lg p-4">
                  <div className="text-xs text-slate-500 uppercase mb-1">Open Positions</div>
                  <div className="text-2xl font-bold text-slate-900">
                    {accountData.openPositions ?? "--"}
                  </div>
                </div>
              </div>
              {accountDataError && <p className="text-xs text-amber-700">{accountDataError}</p>}

              <div className="flex gap-3">
                <BackButton className="flex-1 justify-center border border-slate-200 bg-transparent hover:bg-slate-50" />
                <Button
                  type="button"
                  onClick={handleNext}
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-white"
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Step 3: Import with Turnkey */}
        {step === "enter-private-key" && (
          <>
            <DialogHeader className="bg-[#FFF4D6] text-slate-900 p-4">
              <div className="flex items-center justify-between gap-3">
                <BackButton className="-ml-2" />
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <span>Secured by Turnkey</span>
                  <Image src="/logos/turnkey-logo.png" alt="Turnkey" width={78} height={18} />
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <DialogTitle className="text-base font-bold">
                  Now we need to add your Polymarket private key
                </DialogTitle>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-semibold text-slate-600"
                        aria-label="Why we need your private key"
                      >
                        ?
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>
                        Turnkey encrypts your key in your browser so trades can be executed securely without Polycopy ever
                        seeing it.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="text-xs text-slate-700 mt-1">
                Paste it into the secure Turnkey form below.
              </p>
            </DialogHeader>

            <form onSubmit={handleLinkPrivateKey} className="p-5 space-y-4 bg-white">
              <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                <Shield className="h-4 w-4" />
                Polycopy never sees your private key. Turnkey encrypts it in your browser.
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-sm font-medium text-slate-900">Secure import form</label>
                  <a
                    href="https://polymarket.com/profile"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-[#4C48FF] hover:underline"
                  >
                    Open Polymarket to export your private key
                  </a>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                  <span>Use the raw 64-character key. If it starts with 0x, remove it.</span>
                  <button type="button" className="font-medium text-slate-600 hover:text-slate-800">
                    How do I change that?
                  </button>
                  <button type="button" className="font-medium text-slate-600 hover:text-slate-800">
                    How do I find my Turnkey?
                  </button>
                </div>
                <textarea
                  value={privateKeyInput}
                  onChange={(event) => setPrivateKeyInput(event.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-[#8B8CFB] focus:outline-none focus:ring-2 focus:ring-[#8B8CFB]/30"
                  placeholder="Paste your private key here"
                />
              </div>

              {importError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                  <strong>Couldn't import:</strong> {resolveImportErrorMessage(importError)}
                </div>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#8B8CFB] hover:bg-[#7B7BF6] text-white font-semibold"
              >
                {isSubmitting ? "Connecting..." : "Continue with Turnkey"}
              </Button>
              {clobSetupError && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={async () => {
                    setIsSubmitting(true)
                    setImportError(null)
                    try {
                      const res = await fetch('/api/polymarket/l2-credentials', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ polymarketAccountAddress: walletAddress.trim() }),
                      })
                      if (!res.ok) {
                        const payload = await res.json().catch(() => null)
                        const message = payload?.error || 'Unable to create CLOB credentials'
                        setClobSetupError(message)
                        setImportError(`Wallet connected, but CLOB setup failed: ${message}.`)
                        return
                      }
                      setClobSetupError(null)
                      setStep("success")
                    } finally {
                      setIsSubmitting(false)
                    }
                  }}
                  className="w-full"
                >
                  Retry CLOB setup
                </Button>
              )}

              <div className="pt-1 space-y-2 text-xs text-slate-700">
                <p className="font-semibold text-slate-900">FAQs</p>
                <details className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <summary className="cursor-pointer font-medium text-slate-800">
                    How do I find my Turnkey wallet private key?
                  </summary>
                  <p className="mt-2 text-slate-600">
                    Open your Polymarket profile, export your private key, and paste the raw 64-character key here.
                  </p>
                </details>
                <details className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <summary className="cursor-pointer font-medium text-slate-800">Why do I need it?</summary>
                  <p className="mt-2 text-slate-600">
                    Turnkey uses it to sign trades after you approve a copy trade.
                  </p>
                </details>
                <details className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <summary className="cursor-pointer font-medium text-slate-800">How is it secure?</summary>
                  <p className="mt-2 text-slate-600">
                    Your key is encrypted in your browser and sent directly to Turnkey. Polycopy never sees or stores it.
                  </p>
                </details>
              </div>
            </form>
          </>
        )}

        {/* Step 4: Success */}
        {step === "success" && (
          <>
            <DialogHeader className="bg-gradient-to-r from-yellow-400 to-amber-500 text-black p-6">
              <DialogTitle className="text-xl font-bold">Connection Successful!</DialogTitle>
            </DialogHeader>

            <div className="p-6 space-y-5">
              <div className="text-center space-y-3 py-4">
                <h3 className="text-lg font-semibold text-slate-900">Your wallet is connected</h3>
                <p className="text-sm text-slate-600 max-w-md mx-auto">
                  Your private key has been securely passed to Turnkey. You can now execute trades directly from
                  Polycopy.
                </p>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Wallet Address:</span>
                  <span className="font-mono text-slate-900">
                    {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Status:</span>
                  <span className="text-green-600 font-medium">Connected</span>
                </div>
              </div>

              <Button
                type="button"
                onClick={handleDone}
                className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-slate-900 font-semibold"
              >
                Done
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
