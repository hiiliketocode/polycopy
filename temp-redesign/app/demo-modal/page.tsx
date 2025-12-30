"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { MarkTradeCopiedModal } from "@/components/polycopy/mark-trade-copied-modal"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default function DemoModalPage() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 h-16">
            <Link href="/" className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Back to Home</span>
            </Link>
            <h1 className="text-lg font-semibold text-slate-900">Modal Demo</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">Mark Trade as Copied Modal</h2>
          <p className="text-slate-600">Click the button below to preview the modal component</p>
          <Button onClick={() => setModalOpen(true)} className="bg-[#FDB022] hover:bg-[#FDB022]/90 text-white">
            Open Modal
          </Button>
        </div>

        <MarkTradeCopiedModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          trade={{
            market: "Will Donald Trump win the 2024 US Presidential Election?",
            traderName: "CryptoWhale.eth",
            position: "YES",
            traderPrice: 0.67,
          }}
        />
      </div>
    </div>
  )
}
