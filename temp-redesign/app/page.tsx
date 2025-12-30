"use client"

import { TraderCard } from "@/components/polycopy/trader-card"
import { StatsCard } from "@/components/polycopy/stats-card"
import { PositionCard } from "@/components/polycopy/position-card"
import { ActivityItem } from "@/components/polycopy/activity-item"
import { EmptyState } from "@/components/polycopy/empty-state"
import { TradeCard } from "@/components/polycopy/trade-card"
import { Wallet, Users, TrendingUp, Copy, ArrowRight } from "lucide-react"
import { useState } from "react"
import Link from "next/link"

export default function Home() {
  const [followingStates, setFollowingStates] = useState<Record<string, boolean>>({
    trader1: false,
    trader2: true,
    trader3: false,
  })

  const toggleFollow = (traderId: string) => {
    setFollowingStates((prev) => ({
      ...prev,
      [traderId]: !prev[traderId],
    }))
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 mt-16 md:mt-0">
        {/* Stats Overview */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-slate-950 mb-6">Portfolio Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatsCard label="Total Value" value="$12,450" change={8.2} changeLabel="this month" icon={Wallet} />
            <StatsCard label="Active Positions" value="14" icon={TrendingUp} />
            <StatsCard label="Following" value="8" icon={Users} />
            <StatsCard label="Total Return" value="+24.5%" change={12.3} changeLabel="vs last month" />
          </div>
        </section>

        {/* Top Traders */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-950">Top Traders</h2>
            <Link
              href="/discover"
              className="text-sm font-medium text-slate-600 hover:text-slate-950 flex items-center gap-1 group"
            >
              View all
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <TraderCard
              name="Alex Chen"
              username="alexchen"
              winRate={72}
              totalReturn={45.8}
              followers={2400}
              volume={125000}
              trades={234}
              isFollowing={followingStates.trader1}
              onFollowClick={() => toggleFollow("trader1")}
              onCopyClick={() => console.log("Copy trade")}
            />
            <TraderCard
              name="Sarah Kim"
              username="sarahkim"
              winRate={68}
              totalReturn={38.2}
              followers={1800}
              volume={98000}
              trades={187}
              isFollowing={followingStates.trader2}
              onFollowClick={() => toggleFollow("trader2")}
              onCopyClick={() => console.log("Copy trade")}
            />
            <TraderCard
              name="Michael Torres"
              username="mtorres"
              winRate={65}
              totalReturn={32.5}
              followers={1200}
              volume={76000}
              trades={156}
              isFollowing={followingStates.trader3}
              onFollowClick={() => toggleFollow("trader3")}
              onCopyClick={() => console.log("Copy trade")}
            />
          </div>
        </section>

        {/* Active Positions */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-950">Active Positions</h2>
            <button className="text-sm font-medium text-slate-600 hover:text-slate-950">View all</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <PositionCard
              market="2024 Election"
              prediction="Will Donald Trump win the 2024 presidential election?"
              position="YES"
              shares={100}
              avgPrice={0.52}
              currentPrice={0.58}
              pnl={6.0}
              pnlPercent={11.5}
            />
            <PositionCard
              market="Tech Stocks"
              prediction="Will NVIDIA hit $1000 per share by end of 2024?"
              position="NO"
              shares={75}
              avgPrice={0.45}
              currentPrice={0.42}
              pnl={-2.25}
              pnlPercent={-6.7}
            />
            <PositionCard
              market="Sports"
              prediction="Will the Lakers win the 2024 NBA Championship?"
              position="YES"
              shares={50}
              avgPrice={0.28}
              currentPrice={0.35}
              pnl={3.5}
              pnlPercent={25.0}
            />
          </div>
        </section>

        {/* Recent Activity */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-slate-950 mb-6">Recent Activity</h2>

          <div className="space-y-3">
            <ActivityItem
              traderName="Alex Chen"
              traderUsername="alexchen"
              action="BUY"
              position="YES"
              market="Will Bitcoin reach $100k in 2024?"
              shares={150}
              price={0.64}
              timestamp="2h ago"
            />
            <ActivityItem
              traderName="Sarah Kim"
              traderUsername="sarahkim"
              action="SELL"
              position="NO"
              market="Will inflation drop below 2% by Q4 2024?"
              shares={200}
              price={0.48}
              timestamp="5h ago"
            />
            <ActivityItem
              traderName="Michael Torres"
              traderUsername="mtorres"
              action="BUY"
              position="YES"
              market="Will SpaceX launch Starship successfully in 2024?"
              shares={100}
              price={0.72}
              timestamp="8h ago"
            />
          </div>
        </section>

        {/* Trade Card Feed */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-950">Trade Feed</h2>
            <Link
              href="/feed"
              className="text-sm font-medium text-slate-600 hover:text-slate-950 flex items-center gap-1 group"
            >
              View full feed
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="space-y-4 max-w-2xl">
            <TradeCard
              trader={{
                id: "1",
                name: "Alex Chen",
                address: "0x1234...5678",
                avatar: "/placeholder.svg?height=40&width=40",
              }}
              market="Will Trump release the Epstein files by December 19?"
              position="YES"
              action="Buy"
              price={0.93}
              size={2000}
              total={1860}
              timestamp="2m ago"
              onCopyTrade={() => console.log("Copy trade")}
              onMarkAsCopied={() => console.log("Mark as copied")}
            />

            <TradeCard
              trader={{
                id: "2",
                name: "Sarah Kim",
                address: "0xabcd...ef90",
                avatar: "/placeholder.svg?height=40&width=40",
              }}
              market="Will Bitcoin reach $150,000 by end of 2025?"
              position="NO"
              action="Sell"
              price={0.45}
              size={5000}
              total={2250}
              timestamp="15m ago"
              onCopyTrade={() => console.log("Copy trade")}
              onMarkAsCopied={() => console.log("Mark as copied")}
            />

            <TradeCard
              trader={{
                id: "3",
                name: "Michael Torres",
                address: "0x9876...4321",
                avatar: "/placeholder.svg?height=40&width=40",
              }}
              market="Will OpenAI release GPT-5 before July 2025?"
              position="YES"
              action="Buy"
              price={0.67}
              size={1500}
              total={1005}
              timestamp="1h ago"
              onCopyTrade={() => console.log("Copy trade")}
              onMarkAsCopied={() => console.log("Mark as copied")}
            />
          </div>
        </section>

        {/* Empty State Example */}
        <section>
          <div className="bg-white border border-slate-200 rounded-2xl">
            <EmptyState
              icon={Copy}
              title="No copied trades yet"
              description="Start copying trades from top performers to grow your portfolio automatically."
              actionLabel="Browse Traders"
              onAction={() => (window.location.href = "/discover")}
            />
          </div>
        </section>
      </main>
    </div>
  )
}
