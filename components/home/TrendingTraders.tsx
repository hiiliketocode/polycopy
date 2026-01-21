'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getTraderAvatarInitials } from '@/lib/trader-name';
import { Button } from '@/components/ui/button';

// Helper function to truncate wallet addresses that are used as display names
function formatDisplayName(name: string, wallet: string): string {
  // Check if the display name is actually a wallet address (starts with 0x and is long)
  if (name.startsWith('0x') && name.length > 20) {
    return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
  }
  return name;
}

interface Trader {
  wallet: string;
  displayName: string;
  pnl: number;
  winRate: number;
  totalTrades: number;
  volume: number;
  rank: number;
  followerCount: number;
  roi?: number;
  profileImage?: string | null;
}

function formatLargeNumber(num: number): string {
  const absNum = Math.abs(num);
  
  if (absNum >= 1000000) {
    return `$${(num / 1000000).toFixed(1)}M`;
  } else if (absNum >= 1000) {
    return `$${(num / 1000).toFixed(1)}K`;
  } else {
    return `$${num.toFixed(0)}`;
  }
}

export function TrendingTraders() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch trending traders - get more for scrolling
    fetch('/api/polymarket/leaderboard?category=OVERALL&period=30d&limit=12')
      .then(res => res.json())
      .then(data => {
        if (data.traders) {
          setTraders(data.traders);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching traders:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="bg-slate-50 py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl lg:text-5xl font-black text-slate-900 mb-6 text-center">
            See who you could be following
          </h2>
          <p className="text-xl text-slate-600 mb-16 text-center max-w-3xl mx-auto">
            Browse top-performing traders across all categories
          </p>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl p-6 w-[300px] flex-shrink-0">
                <div className="animate-pulse">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="h-16 w-16 bg-slate-200 rounded-xl"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="h-16 bg-slate-200 rounded"></div>
                    <div className="h-16 bg-slate-200 rounded"></div>
                    <div className="h-16 bg-slate-200 rounded"></div>
                  </div>
                  <div className="h-10 bg-slate-200 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 py-20 lg:py-32">
      <div className="max-w-7xl mx-auto px-6">
        <h2 className="text-4xl lg:text-5xl font-black text-slate-900 mb-6 text-center">
          See who you could be following
        </h2>
        <p className="text-xl text-slate-600 mb-16 text-center max-w-3xl mx-auto">
          Browse top-performing traders across all categories
        </p>
        
        <div className="relative group">
          {/* Scrollable container */}
          <div id="trending-traders-scroll" className="overflow-x-auto pb-4 -mx-3 px-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 scrollbar-hide">
            <div className="flex gap-4" style={{ width: "max-content" }}>
              {traders.map((trader) => (
                <div
                  key={trader.wallet}
                  className="bg-white border border-slate-200 rounded-xl p-6 hover:shadow-lg transition-shadow flex-shrink-0 w-[300px]"
                >
                  <Link href={`/trader/${trader.wallet}`} className="block">
                    <div className="flex items-center gap-4 mb-6">
                      <Avatar className="h-16 w-16 border-2 border-white shadow-sm flex-shrink-0">
                        {trader.profileImage ? (
                          <AvatarImage src={trader.profileImage} alt={trader.displayName} />
                        ) : null}
                        <AvatarFallback className="bg-gradient-to-br from-slate-700 to-slate-900 text-white font-bold text-lg">
                          {getTraderAvatarInitials({ displayName: trader.displayName, wallet: trader.wallet })}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 truncate">
                          {formatDisplayName(trader.displayName, trader.wallet)}
                        </div>
                        <div className="text-sm text-slate-500">
                          #{trader.rank} • {trader.followerCount} followers
                        </div>
                      </div>
                    </div>
                  </Link>
                  
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="bg-slate-50 rounded-lg p-2 text-center">
                      <div className="text-xs text-slate-500 mb-1">ROI</div>
                      <div className="text-sm font-bold text-green-600">
                        {trader.roi ? `+${Math.round(trader.roi)}%` : '-'}
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2 text-center">
                      <div className="text-xs text-slate-500 mb-1">Win Rate</div>
                      <div className="text-sm font-bold text-slate-900">
                        {Math.round(trader.winRate * 100)}%
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2 text-center">
                      <div className="text-xs text-slate-500 mb-1">Volume</div>
                      <div className="text-sm font-bold text-slate-900">
                        {formatLargeNumber(trader.volume)}
                      </div>
                    </div>
                  </div>
                  
                  <Button className="w-full bg-[#FDB022] text-slate-900 hover:bg-yellow-400 font-bold" size="sm">
                    View Profile
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="text-center mt-8">
          <Link href="/discover">
            <Button className="bg-[#FDB022] text-slate-900 hover:bg-yellow-400 font-bold" size="lg">
              Explore All Traders
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
