"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ArrowRight, Trophy } from "lucide-react"
import { getTraderAvatarInitials } from "@/lib/trader-name"

interface Trader {
  wallet: string
  displayName: string
  pnl: number
  roi?: number
  volume: number
  rank: number
  profileImage?: string | null
}

interface TopTradersProps {
  traderLinkBase?: string
}

// Helper function to format large numbers
function formatLargeNumber(num: number): string {
  const absNum = Math.abs(num)
  
  if (absNum >= 1000000) {
    return `$${(num / 1000000).toFixed(1)}M`
  } else if (absNum >= 1000) {
    return `$${(num / 1000).toFixed(1)}K`
  } else {
    return `$${num.toFixed(0)}`
  }
}

// Helper function to truncate wallet addresses
function formatDisplayName(name: string, wallet: string): string {
  if (name.startsWith('0x') && name.length > 20) {
    return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
  }
  return name
}

export function TopTraders({ traderLinkBase = "" }: TopTradersProps = {}) {
  const [traders, setTraders] = useState<Trader[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isV2 = traderLinkBase === "/v2"

  useEffect(() => {
    const fetchTraders = async () => {
      try {
        const response = await fetch('/api/polymarket/leaderboard?limit=8&orderBy=PNL&category=OVERALL&timePeriod=month')
        if (response.ok) {
          const data = await response.json()
          
          // Calculate ROI for each trader
          const tradersWithROI = (data.traders || []).map((trader: any) => ({
            ...trader,
            roi: trader.volume > 0 ? ((trader.pnl / trader.volume) * 100) : 0
          }))
          
          // Sort by ROI
          const sortedByROI = tradersWithROI.sort((a: any, b: any) => (b.roi || 0) - (a.roi || 0))
          
          setTraders(sortedByROI.slice(0, 8))
        } else {
          setError('Failed to fetch traders')
        }
      } catch (err) {
        setError('Network error')
      } finally {
        setLoading(false)
      }
    }

    fetchTraders()
  }, [])

  const traderHref = (wallet: string) => traderLinkBase ? `${traderLinkBase}/trader/${wallet}` : `/trader/${wallet}`

  if (loading) {
    return (
      <section className={`py-16 lg:pt-32 lg:pb-20 ${isV2 ? "bg-poly-paper border-b border-border" : "bg-secondary/30"}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-muted-foreground">
            {isV2 ? (
              <>
                <div className="inline-block h-8 w-8 animate-spin border-2 border-poly-yellow border-r-transparent align-middle" />
                <span className="ml-2 align-middle">Loading top traders...</span>
              </>
            ) : (
              "Loading top traders..."
            )}
          </div>
        </div>
      </section>
    )
  }

  if (error || traders.length === 0) {
    return (
      <section className={`py-16 lg:pt-32 lg:pb-20 ${isV2 ? "bg-poly-paper border-b border-border" : "bg-secondary/30"}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">{error || 'No traders available'}</p>
            {isV2 ? (
              <Link
                href="/discover"
                className="inline-flex items-center border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
              >
                Explore All Traders
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            ) : (
              <Link href="/discover">
                <Button variant="outline" size="lg" className="font-semibold border-polycopy-yellow text-polycopy-yellow hover:bg-polycopy-yellow hover:text-neutral-black bg-transparent">
                  Explore All Traders
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className={`py-16 lg:pt-32 lg:pb-20 ${isV2 ? "bg-poly-paper border-b border-border" : "bg-secondary/30"}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className={`inline-flex items-center gap-2 mb-4 ${isV2 ? "bg-poly-yellow px-4 py-2 font-sans text-xs font-bold uppercase tracking-widest text-poly-black" : "px-3 py-1 rounded-full bg-polycopy-yellow/10 border border-polycopy-yellow/20 text-sm font-medium text-foreground"}`}>
            <Trophy className="w-4 h-4" />
            Top Performers
          </div>
          <h2 className={`text-3xl sm:text-4xl lg:text-5xl mb-4 text-balance ${isV2 ? "font-sans font-black uppercase tracking-tight text-poly-black" : "font-bold text-foreground"}`}>
            See who you could be following
          </h2>
          <p className={isV2 ? "font-body text-sm text-muted-foreground" : "text-lg text-muted-foreground"}>
            Top Traders by ROI (Last 30 Days)
          </p>
        </div>

        {/* Traders Grid - 6 on mobile (2x3), 8 on desktop (2x4) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6 mb-8 lg:mb-12">
          {traders.map((trader, index) => {
            const displayName = formatDisplayName(trader.displayName, trader.wallet)
            const initials = getTraderAvatarInitials({ displayName: trader.displayName, wallet: trader.wallet })
            const displayRank = index + 1 // Use display order for rank badge
            
            return (
              <div
                key={trader.wallet}
                className={`group relative bg-card border border-border p-3 lg:p-6 transition-all duration-300 ${index >= 6 ? 'hidden lg:block' : ''} ${isV2 ? "hover:border-poly-yellow" : "rounded-xl lg:rounded-2xl hover:border-polycopy-yellow/30 hover:shadow-lg"}`}
              >
                {/* Rank Badge */}
                <div className={`absolute -top-2 -right-2 lg:-top-3 lg:-right-3 w-6 h-6 lg:w-8 lg:h-8 bg-poly-black text-white flex items-center justify-center text-xs lg:text-sm font-bold ${isV2 ? "" : "rounded-full"}`}>
                  #{displayRank}
                </div>

                {/* Avatar & Name */}
                <div className="flex items-center gap-2 lg:gap-3 mb-2 lg:mb-4">
                  {isV2 ? (
                    <div className="flex h-12 w-12 items-center justify-center bg-poly-yellow font-sans text-sm font-bold text-poly-black flex-shrink-0">
                      {initials}
                    </div>
                  ) : (
                    <Avatar className="w-10 h-10 lg:w-14 lg:h-14 rounded-lg lg:rounded-xl">
                      {trader.profileImage && <AvatarImage src={trader.profileImage} alt={displayName} />}
                      <AvatarFallback className="rounded-lg lg:rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-white font-bold text-sm lg:text-xl">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className="min-w-0">
                    <div className={`font-bold text-sm lg:text-base truncate ${isV2 ? "text-poly-black" : "text-foreground"}`}>{displayName}</div>
                    <div className="text-xs lg:text-sm text-muted-foreground truncate">
                      {trader.wallet.slice(0, 6)}...{trader.wallet.slice(-4)}
                    </div>
                  </div>
                </div>

                {/* Stats - ROI / P&L / VOLUME */}
                <div className="grid grid-cols-3 gap-2 mb-3 lg:mb-4">
                  <div className={`text-center p-1.5 lg:p-2 ${isV2 ? "border border-border" : "bg-secondary/50 rounded-lg"}`}>
                    <div className={`text-[10px] lg:text-xs ${isV2 ? "font-sans font-bold uppercase tracking-widest text-poly-yellow" : "text-muted-foreground"}`}>ROI</div>
                    <div className={`text-xs lg:text-sm font-bold ${(trader.roi || 0) >= 0 ? 'text-profit-green' : 'text-loss-red'}`}>
                      {trader.roi ? `${trader.roi > 0 ? '+' : ''}${trader.roi.toFixed(0)}%` : 'N/A'}
                    </div>
                  </div>
                  <div className={`text-center p-1.5 lg:p-2 ${isV2 ? "border border-border" : "bg-secondary/50 rounded-lg"}`}>
                    <div className={`text-[10px] lg:text-xs ${isV2 ? "font-sans font-bold uppercase tracking-widest text-poly-yellow" : "text-muted-foreground"}`}>P&L</div>
                    <div className={`text-xs lg:text-sm font-bold ${trader.pnl >= 0 ? 'text-profit-green' : 'text-loss-red'}`}>
                      {formatLargeNumber(trader.pnl)}
                    </div>
                  </div>
                  <div className={`text-center p-1.5 lg:p-2 ${isV2 ? "border border-border" : "bg-secondary/50 rounded-lg"}`}>
                    <div className={`text-[10px] lg:text-xs ${isV2 ? "font-sans font-bold uppercase tracking-widest text-poly-yellow" : "text-muted-foreground"}`}>Vol</div>
                    <div className={`text-xs lg:text-sm font-bold ${isV2 ? "text-poly-black" : "text-foreground"}`}>
                      {formatLargeNumber(trader.volume)}
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <Link href={traderHref(trader.wallet)}>
                  {isV2 ? (
                    <span className="block w-full text-center bg-poly-yellow px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow">
                      View Profile
                    </span>
                  ) : (
                    <Button className="w-full bg-polycopy-yellow text-neutral-black hover:bg-polycopy-yellow-hover font-semibold text-xs lg:text-sm h-8 lg:h-10">
                      View Profile
                    </Button>
                  )}
                </Link>

                {!isV2 && (
                  <div className="absolute inset-0 rounded-xl lg:rounded-2xl bg-gradient-to-br from-polycopy-yellow/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                )}
              </div>
            )
          })}
        </div>

        {/* Explore All CTA */}
        <div className="text-center">
          {isV2 ? (
            <Link
              href="/discover"
              className="inline-flex items-center justify-center bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
            >
              Explore All Traders
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          ) : (
            <Link href="/discover">
              <Button size="lg" className="bg-polycopy-yellow text-neutral-black hover:bg-polycopy-yellow-hover font-semibold text-sm lg:text-base px-6 lg:px-8 h-11 lg:h-12 shadow-lg shadow-polycopy-yellow/20">
                Explore All Traders
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
