"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { ExternalLink, Shield } from "lucide-react"
import { IframeStamper } from "@turnkey/iframe-stamper"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"

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
  const [accountDataError, setAccountDataError] = useState<string | null>(null)
  const [iframeReady, setIframeReady] = useState(false)
  const [iframeError, setIframeError] = useState<string | null>(null)
  const iframeContainerRef = useRef<HTMLDivElement | null>(null)
  const iframeStamperRef = useRef<IframeStamper | null>(null)

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
      return "This key looks the wrong length. Turnkey expects a 32-byte private key (64 hex characters). If yours starts with 0x, remove the 0x and make sure there are no spaces or line breaks."
    }
    if (normalized.includes("private key")) {
      return "We couldn't read that key. Double-check the private key format and try again."
    }
    return message
  }

  useEffect(() => {
    let cancelled = false

    const setupIframe = async () => {
      if (step !== "enter-private-key") return
      if (iframeStamperRef.current || !iframeContainerRef.current) return

      setIframeError(null)
      setIframeReady(false)

      try {
        const stamper = new IframeStamper({
          iframeUrl: "https://import.turnkey.com",
          iframeContainer: iframeContainerRef.current,
          iframeElementId: "turnkey-import-iframe",
        })
        iframeStamperRef.current = stamper
        await stamper.init()

        const bundleRes = await fetch("/api/turnkey/import-private-key", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        })
        const bundleData = await bundleRes.json()
        if (!bundleRes.ok || !bundleData?.importBundle || !bundleData?.organizationId || !bundleData?.userId) {
          throw new Error(bundleData?.error || "Failed to load import bundle")
        }

        const injected = await stamper.injectImportBundle(
          bundleData.importBundle,
          bundleData.organizationId,
          bundleData.userId
        )
        if (injected !== true) {
          throw new Error("Failed to initialize Turnkey import iframe")
        }

        if (!cancelled) {
          setIframeReady(true)
        }
      } catch (err: any) {
        if (!cancelled) {
          setIframeError(err?.message || "Failed to load Turnkey import")
        }
      }
    }

    setupIframe()

    return () => {
      cancelled = true
    }
  }, [step])

  useEffect(() => {
    if (step !== "enter-private-key") {
      setIframeReady(false)
      setIframeError(null)
      iframeStamperRef.current = null
    }
  }, [step])

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
      setWalletAddress(trimmed)
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
    setIsSubmitting(true)
    setImportError(null)

    try {
      if (!iframeStamperRef.current || !iframeReady) {
        throw new Error("Turnkey import is not ready yet. Please wait.")
      }

      const encryptedBundle = await iframeStamperRef.current.extractWalletEncryptedBundle()

      if (!encryptedBundle) {
        throw new Error("Failed to retrieve encrypted bundle from Turnkey")
      }

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
      setAccountDataError(null)
      setAccountData({ accountValue: null, openPositions: null })
      setIframeReady(false)
      setIframeError(null)
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
        setAccountDataError(null)
        setAccountData({ accountValue: null, openPositions: null })
        setIframeReady(false)
        setIframeError(null)
        iframeStamperRef.current = null
      }, 300)
    }
  }


  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 gap-0 max-h-[90vh] overflow-y-auto">
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
                <Button type="button" variant="outline" onClick={handleBack} className="flex-1 bg-transparent">
                  Back
                </Button>
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
            <DialogHeader className="bg-gradient-to-r from-yellow-400 to-amber-500 text-black p-6">
              <div className="flex items-start gap-2 mb-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  className="text-black hover:bg-black/10 -ml-2"
                >
                  Back
                </Button>
              </div>
              <DialogTitle className="text-xl font-bold">Connect your wallet, securely</DialogTitle>
              <p className="text-sm text-black/80 mt-2">
                You'll paste your Polymarket private key into Turnkey's secure form. Polycopy never sees the key.
              </p>
            </DialogHeader>

            <form onSubmit={handleLinkPrivateKey} className="p-6 space-y-5">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white border border-slate-200 text-[10px] font-bold text-slate-700">
                    TK
                  </span>
                  Powered by Turnkey
                </div>
                <a
                  href="https://www.turnkey.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  turnkey.com
                </a>
              </div>

              {/* Security Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-2 text-sm">
                    <p className="font-bold text-blue-900 text-base">Polycopy can't access your private key</p>
                    <p className="text-blue-800">
                      Your key is encrypted inside Turnkey's iframe and never touches Polycopy servers. Turnkey is an
                      industry-leading wallet infrastructure provider.{" "}
                      <a
                        href="https://www.turnkey.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline font-medium"
                      >
                        Learn more about Turnkey.
                      </a>
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-sm font-medium text-slate-900">Secure import form</label>
                  <a
                    href="https://polymarket.com/profile"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    Open Polymarket to export your private key
                  </a>
                </div>
                <p className="text-xs text-slate-500">
                  Tip: Turnkey expects the raw 64-character key. If your key starts with 0x, remove it.
                </p>
                <div
                  ref={iframeContainerRef}
                  className="h-48 w-full rounded-lg border border-slate-200 bg-white"
                />
                {!iframeReady && !iframeError && (
                  <p className="text-xs text-slate-600">Loading secure import form…</p>
                )}
              </div>

              {iframeError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                  <strong>Error:</strong> {iframeError}
                </div>
              )}

              {importError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                  <strong>Couldn't import:</strong> {resolveImportErrorMessage(importError)}
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  className="w-full bg-transparent"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !iframeReady}
                  className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold"
                >
                  {isSubmitting ? "Connecting..." : "Connect wallet"}
                </Button>
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
