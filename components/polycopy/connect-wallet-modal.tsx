"use client"

import type React from "react"
import { useState } from "react"
import { ExternalLink, Shield, Lock, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

interface ConnectWalletModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnect?: (walletAddress: string) => void
}

type Step = "link-account" | "account-linked" | "enter-private-key" | "success"

export function ConnectWalletModal({ open, onOpenChange, onConnect }: ConnectWalletModalProps) {
  const [step, setStep] = useState<Step>("link-account")
  const [walletAddress, setWalletAddress] = useState("")
  const [privateKey, setPrivateKey] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPrivateKey, setShowPrivateKey] = useState(false)

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

    // Simulate API call to Turnkey
    await new Promise((resolve) => setTimeout(resolve, 1500))

    setIsSubmitting(false)
    setStep("success")
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
      setPrivateKey("")
    }, 300)
  }

  const handleOpenMagicLink = () => {
    // Open Magic Link reveal page to get private key
    window.open("https://reveal.magic.link/", "_blank", "noopener,noreferrer")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 gap-0 overflow-hidden">
        {/* Step 1: Link Account */}
        {step === "link-account" && (
          <>
            <DialogHeader className="bg-gradient-to-r from-yellow-400 to-amber-500 text-black p-6">
              <DialogTitle className="text-xl font-bold">Link Your Polymarket Wallet</DialogTitle>
              <div className="text-sm text-black/80 mt-2 space-y-1">
                <p>
                  <strong>Step 1:</strong> Go to Polymarket.com and head to your profile
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
                    window.open("https://polymarket.com/profile", "_blank", "noopener,noreferrer");
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
                Your Polymarket profile is now linked. Please confirm the following details and click 'next'. If not,
                click 'back' and re-enter your wallet address.
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

        {/* Step 3: Enter Private Key */}
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
              <DialogTitle className="text-xl font-bold">Enter your private key</DialogTitle>
              <p className="text-sm text-black/80 mt-2">
                Securely connect your wallet to enable trade execution using Turnkey.
              </p>
            </DialogHeader>

            <form onSubmit={handleLinkPrivateKey} className="p-6 space-y-5">
              {/* Security Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-2 text-sm">
                    <p className="font-semibold text-blue-900">Polycopy can never access your private keys</p>
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

              {/* Steps */}
              <div className="space-y-3">
                <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  How to get your private key:
                </h3>
                <ol className="space-y-2 list-decimal list-inside text-sm text-slate-700 ml-1">
                  <li>Click the button below to open Magic Link authentication</li>
                  <li>Complete the authentication process in the new window</li>
                  <li>Copy your private key (starts with "0x...")</li>
                  <li>Paste it into the field below</li>
                </ol>
              </div>

              <Button
                type="button"
                onClick={handleOpenMagicLink}
                variant="outline"
                className="w-full gap-2 bg-transparent"
              >
                Get Private Key Using Magic Link
                <ExternalLink className="h-4 w-4" />
              </Button>

              <div className="space-y-2">
                <label htmlFor="private-key" className="text-sm font-medium text-slate-900">
                  Paste Your Private Key
                </label>
                <div className="relative">
                  <Input
                    id="private-key"
                    type={showPrivateKey ? "text" : "password"}
                    placeholder="Paste your private key here"
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    className="w-full font-mono text-sm pr-10"
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
              </div>

              <Button
                type="submit"
                disabled={isSubmitting || !privateKey}
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
