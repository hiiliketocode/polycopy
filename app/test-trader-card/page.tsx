/**
 * Test page for Trader Card components
 * Visit: http://localhost:3001/test-trader-card
 */
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ShareTraderModal } from '@/components/polycopy/share-trader-modal'

export default function TestTraderCardPage() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  
  // Example wallet address - feel free to change this
  const testWallet = '0x6b44ba0a126a2a1a8aa6cd1adeed002e141bcd44'

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">Trader Card Test Page</h1>
        
        <div className="bg-white rounded-lg p-6 shadow-sm mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Configuration</h2>
          <p className="text-sm text-slate-600 mb-2">
            <strong>Test Wallet:</strong> {testWallet}
          </p>
          <p className="text-sm text-slate-600 mb-4">
            This will test the trader card share modal with real data from the API.
          </p>
          
          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900"
          >
            Open Share Trader Modal
          </Button>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Testing Checklist</h2>
          <ul className="space-y-2 text-sm text-slate-700">
            <li>✓ Modal opens when button clicked</li>
            <li>✓ Time period selector works (1D, 7D, 30D, 3M, 6M, ALL)</li>
            <li>✓ Theme selector works (Cream, Dark, Profit, Fire)</li>
            <li>✓ Card preview displays correctly</li>
            <li>✓ TOP 100 badge shows if applicable</li>
            <li>✓ Accumulated P&L chart renders</li>
            <li>✓ Copy button works</li>
            <li>✓ Download button works</li>
            <li>✓ Share to X button works</li>
          </ul>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 mt-6">
          <h3 className="text-lg font-semibold text-amber-900 mb-2">
            💡 Testing Tips
          </h3>
          <ul className="space-y-1 text-sm text-amber-800">
            <li>• Change the testWallet variable to test different traders</li>
            <li>• Check browser console for any errors</li>
            <li>• Try different time periods and themes</li>
            <li>• Test copy/download/share functionality</li>
            <li>• Verify the share text includes correct data</li>
          </ul>
        </div>
      </div>

      <ShareTraderModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        walletAddress={testWallet}
      />
    </div>
  )
}
