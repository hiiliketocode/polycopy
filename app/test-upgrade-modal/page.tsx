'use client'

import { useState } from 'react'
import { SubscriptionSuccessModal } from '@/components/polycopy/subscription-success-modal'
import { ConnectWalletModal } from '@/components/polycopy/connect-wallet-modal'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function TestUpgradeModalPage() {
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [showConnectModal, setShowConnectModal] = useState(false)

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <Card className="max-w-2xl mx-auto p-8">
        <h1 className="text-3xl font-bold mb-4">Upgrade Flow Preview</h1>
        <p className="text-slate-600 mb-6">
          Test the new subscription success modal and wallet connection flow without going through Stripe.
        </p>
        
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-2">Step 1: Success Modal</h2>
            <p className="text-sm text-slate-600 mb-3">
              This is what users see immediately after returning from Stripe checkout.
            </p>
            <Button onClick={() => setShowSuccessModal(true)}>
              Preview Success Modal
            </Button>
          </div>

          <div className="pt-4 border-t">
            <h2 className="text-xl font-semibold mb-2">Step 2: Connect Wallet Modal</h2>
            <p className="text-sm text-slate-600 mb-3">
              This opens when users click "Connect Wallet" from the success modal.
            </p>
            <Button onClick={() => setShowConnectModal(true)} variant="outline">
              Preview Connect Wallet Modal
            </Button>
          </div>
        </div>

        <div className="mt-8 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">Testing Instructions:</h3>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Click "Preview Success Modal" to see the new upgrade confirmation</li>
            <li>Notice the progress indicator and "Required" messaging</li>
            <li>Try clicking outside the modal (it won't close - by design)</li>
            <li>Click the primary button to see the wallet connection flow</li>
            <li>Compare the prominence of the skip option (now small text link)</li>
          </ul>
        </div>
      </Card>

      <SubscriptionSuccessModal
        open={showSuccessModal}
        onOpenChange={setShowSuccessModal}
        onConnectWallet={() => {
          setShowSuccessModal(false)
          setShowConnectModal(true)
        }}
      />

      <ConnectWalletModal
        open={showConnectModal}
        onOpenChange={setShowConnectModal}
      />
    </div>
  )
}
