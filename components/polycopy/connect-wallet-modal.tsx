"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { ExternalLink, Shield } from "lucide-react"
import { IframeStamper } from "@turnkey/iframe-stamper"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

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
  const [importError, setImportError] = useState<string | null>(null)
  const [iframeReady, setIframeReady] = useState(false)
  const [iframeError, setIframeError] = useState<string | null>(null)
  const iframeContainerRef = useRef<HTMLDivElement | null>(null)
  const iframeStamperRef = useRef<IframeStamper | null>(null)

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
        if (!bundleRes.ok || !bundleData?.importBundle) {
          throw new Error(bundleData?.error || "Failed to load import bundle")
        }

        const injected = await stamper.injectImportBundle(bundleData.importBundle)
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

  // Mock account data (replace with real data from API)
  const [accountData, setAccountData] = useState({
    accountValue: "452.93",
    openPositions: 22,
  })

  const handleLinkAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000))

    setIsSubmitting(false)
    setStep("account-linked")
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
      setImportError(null)
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
        setImportError(null)
        setIframeReady(false)
        setIframeError(null)
        iframeStamperRef.current = null
      }, 300)
    }
  }


  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 gap-0 overflow-hidden">
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
                  <div className="text-2xl font-bold text-slate-900">{accountData.accountValue} USDC</div>
                </div>
                <div className="border border-slate-200 rounded-lg p-4">
                  <div className="text-xs text-slate-500 uppercase mb-1">Open Positions</div>
                  <div className="text-2xl font-bold text-slate-900">{accountData.openPositions}</div>
                </div>
              </div>

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
              <DialogTitle className="text-xl font-bold">Import your wallet securely</DialogTitle>
              <p className="text-sm text-black/80 mt-2">
                Use Turnkey's embedded import form to encrypt your key inside the iframe.
              </p>
            </DialogHeader>

            <form onSubmit={handleLinkPrivateKey} className="p-6 space-y-5">
              {/* Security Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-2 text-sm">
                    <p className="font-bold text-blue-900 text-base">Polycopy can never access your private keys</p>
                    <p className="text-blue-800">
                      Polycopy never sees or stores your private key. We use Turnkey, an industry-leading secure wallet
                      infrastructure provider, to handle all key management.{" "}
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
                <label className="text-sm font-medium text-slate-900">Turnkey import</label>
                <div
                  ref={iframeContainerRef}
                  className="h-64 w-full rounded-lg border border-slate-200 bg-white"
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
                  <strong>Error:</strong> {importError}
                </div>
              )}

              <Button
                type="submit"
                disabled={isSubmitting || !iframeReady}
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold"
              >
                {isSubmitting ? "Securing Connection..." : "Link"}
              </Button>
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
