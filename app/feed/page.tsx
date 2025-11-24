'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import Header from '@/app/components/Header';

// Types
interface FeedTrade {
  id: string;
  trader: {
    wallet: string;
    displayName: string;
  };
  market: {
    title: string;
    slug: string;
    eventSlug?: string;
  };
  trade: {
    side: 'BUY' | 'SELL';
    outcome: string;
    size: number;
    price: number;
    timestamp: number;
  };
}

interface TradeCardProps {
  traderName: string;
  traderAddress: string;
  market: string;
  side: string;
  type: 'buy' | 'sell';
  price: number;
  size: number;
  timestamp: number;
  onCopyTrade: () => void;
}

// Helper: Format relative time
function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const tradeTime = timestamp;
  const diffInSeconds = Math.floor((now - tradeTime) / 1000);
  
  if (diffInSeconds < 0) return 'Just now';
  if (diffInSeconds < 60) return 'Just now';
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  
  return new Date(tradeTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// TradeCard Component
function TradeCard({
  traderName,
  traderAddress,
  market,
  side,
  type,
  price,
  size,
  timestamp,
  onCopyTrade,
}: TradeCardProps) {
  const timeAgo = getRelativeTime(timestamp);
  const isYes = ['yes', 'up', 'over'].includes(side.toLowerCase());
  const isBuy = type === 'buy';
  const total = price * size;

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm hover:shadow-md transition-all">
      <div className="p-4">
        {/* Header: Trader info + Timestamp */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            {/* Avatar: 40x40, yellow gradient */}
            <Link href={`/trader/${traderAddress}`}>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FDB022] to-[#E69E1A] flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity">
                <span className="text-sm text-white font-semibold">
                  {traderName.slice(0, 2).toUpperCase()}
                </span>
              </div>
            </Link>
            <div>
              <Link
                href={`/trader/${traderAddress}`}
                className="font-medium text-neutral-900 hover:text-[#FDB022] transition-colors"
              >
                {traderName}
              </Link>
              <p className="text-xs text-neutral-500 font-mono">
                {traderAddress.slice(0, 6)}...{traderAddress.slice(-4)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-neutral-500">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{timeAgo}</span>
          </div>
        </div>

        {/* Market question */}
        <div className="mb-3">
          <p className="text-neutral-900 leading-snug mb-2">{market}</p>
          <div className="flex items-center gap-2">
            <span className={`badge ${isYes ? 'badge-yes' : 'badge-no'}`}>
              {side.toUpperCase()}
            </span>
            <div className={`flex items-center gap-1 text-sm font-medium ${
              isBuy ? 'text-[#10B981]' : 'text-[#EF4444]'
            }`}>
              {isBuy ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  <span>Buy</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                  </svg>
                  <span>Sell</span>
                </>
              )}
            </div>
          </div>
        </div>
        
        {/* Trade details - gray box */}
        <div className="flex items-center justify-between mb-4 p-3 bg-neutral-50 rounded-lg">
          <div>
            <p className="text-xs text-neutral-600 mb-0.5">Price</p>
            <p className="font-semibold text-neutral-900">${price.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-600 mb-0.5">Size</p>
            <p className="font-semibold text-neutral-900">{size.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-600 mb-0.5">Total</p>
            <p className="font-semibold text-neutral-900">${total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
          </div>
        </div>
        
        {/* Copy Trade button */}
        <button
          onClick={onCopyTrade}
          className="w-full bg-[#FDB022] hover:bg-[#E69E1A] text-neutral-900 font-semibold py-2.5 rounded-lg transition-colors"
        >
          Copy Trade
        </button>
      </div>
    </div>
  );
}

// Main Feed Page Component
export default function FeedPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'buys' | 'sells'>('all');
  
  // Data state
  const [trades, setTrades] = useState<FeedTrade[]>([]);
  const [followingCount, setFollowingCount] = useState(0);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Stats
  const [todayVolume, setTodayVolume] = useState(0);
  const [todaysTradeCount, setTodaysTradeCount] = useState(0);

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/login');
        return;
      }
      
      setUser(user);
      setLoading(false);
    };
    
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.push('/login');
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  // Fetch feed data
  useEffect(() => {
    if (!user) return;

    const fetchFeed = async () => {
      setLoadingFeed(true);
      setError(null);

      try {
        // 1. Fetch followed traders
        const { data: follows, error: followsError } = await supabase
          .from('follows')
          .select('trader_wallet')
          .eq('user_id', user.id);

        if (followsError) throw new Error('Failed to fetch follows');
        if (!follows || follows.length === 0) {
          setTrades([]);
          setFollowingCount(0);
          setLoadingFeed(false);
          return;
        }

        setFollowingCount(follows.length);

        // 2. Fetch trader names from leaderboard
        const traderNames: Record<string, string> = {};
        try {
          const leaderboardRes = await fetch('/api/polymarket/leaderboard?limit=100&orderBy=PNL');
          if (leaderboardRes.ok) {
            const leaderboardData = await leaderboardRes.json();
            for (const follow of follows) {
              const trader = leaderboardData.traders?.find(
                (t: any) => t.wallet.toLowerCase() === follow.trader_wallet.toLowerCase()
              );
              if (trader?.displayName) {
                traderNames[follow.trader_wallet.toLowerCase()] = trader.displayName;
              }
            }
          }
        } catch (err) {
          console.warn('Failed to fetch trader names:', err);
        }

        // 3. Fetch trades for each followed wallet (parallel)
        const tradePromises = follows.map(async (follow) => {
          const wallet = follow.trader_wallet;
          
          try {
            const response = await fetch(
              `https://data-api.polymarket.com/trades?limit=50&user=${wallet}`
            );
            
            if (!response.ok) return [];
            
            const walletTrades = await response.json();
            
            return walletTrades.map((trade: any) => ({
              ...trade,
              _followedWallet: wallet.toLowerCase(),
            }));
          } catch (error) {
            console.warn(`Error fetching trades for ${wallet}:`, error);
            return [];
          }
        });
        
        const allTradesArrays = await Promise.all(tradePromises);
        const allTradesRaw = allTradesArrays.flat();
        
        if (allTradesRaw.length === 0) {
          setTrades([]);
          setLoadingFeed(false);
          return;
        }

        // Sort by timestamp
        allTradesRaw.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));

        // 4. Format trades
        const formattedTrades: FeedTrade[] = allTradesRaw.map((trade: any) => {
          const wallet = trade._followedWallet || trade.user || trade.wallet || '';
          const displayName = traderNames[wallet.toLowerCase()] || 
                             (wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : 'Unknown');
          
          return {
            id: `${trade.id || trade.timestamp}-${Math.random()}`,
            trader: {
              wallet: wallet,
              displayName: displayName,
            },
            market: {
              title: trade.market || trade.title || 'Unknown Market',
              slug: trade.market_slug || trade.slug || '',
              eventSlug: trade.eventSlug || trade.event_slug || '',
            },
            trade: {
              side: (trade.side || 'BUY').toUpperCase() as 'BUY' | 'SELL',
              outcome: trade.outcome || trade.option || 'YES',
              size: parseFloat(trade.size || trade.amount || 0),
              price: parseFloat(trade.price || 0),
              timestamp: (trade.timestamp || Date.now() / 1000) * 1000,
            },
          };
        });

        setTrades(formattedTrades);

        // Calculate today's volume and trade count
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime();
        
        const todaysTrades = formattedTrades.filter(t => {
          const tradeDate = new Date(t.trade.timestamp);
          tradeDate.setHours(0, 0, 0, 0);
          return tradeDate.getTime() === todayTimestamp;
        });
        
        const volumeToday = todaysTrades.reduce((sum, t) => sum + (t.trade.price * t.trade.size), 0);
        setTodayVolume(volumeToday);
        setTodaysTradeCount(todaysTrades.length);

      } catch (err: any) {
        console.error('Error fetching feed:', err);
        setError(err.message || 'Failed to load feed');
      } finally {
        setLoadingFeed(false);
      }
    };

    fetchFeed();
  }, [user]);

  // Filter trades
  const filteredTrades = trades.filter(trade => {
    if (filter === 'buys') return trade.trade.side === 'BUY';
    if (filter === 'sells') return trade.trade.side === 'SELL';
    return true;
  });

  // Copy trade handler
  const handleCopyTrade = (trade: FeedTrade) => {
    let url = 'https://polymarket.com';
    
    if (trade.market.eventSlug) {
      url = `https://polymarket.com/event/${trade.market.eventSlug}?utm_source=polycopy&utm_medium=copy_trade&utm_campaign=feed`;
    } else if (trade.market.slug) {
      url = `https://polymarket.com/market/${trade.market.slug}?utm_source=polycopy&utm_medium=copy_trade&utm_campaign=feed`;
    } else if (trade.market.title) {
      url = `https://polymarket.com/search?q=${encodeURIComponent(trade.market.title)}`;
    }
    
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20">
        <Header />
        <div className="flex items-center justify-center pt-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#FDB022] mx-auto mb-4"></div>
            <p className="text-slate-600 text-lg">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Header />

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-4 md:py-6">
        {/* Page Title - Condensed */}
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-neutral-900">
            <span className="md:hidden">Feed</span>
            <span className="hidden md:inline">Activity Feed</span>
          </h1>
          <p className="hidden md:block text-neutral-600 mt-1">
            Recent trades from traders you follow
          </p>
        </div>

        {/* Stats Banner - Desktop Only - Reordered to match Figma */}
        <div className="hidden lg:grid grid-cols-3 gap-4 mb-4">
          {/* Card 1: Today's Volume - with green trending icon */}
          <div className="bg-white rounded-xl p-4 border border-neutral-200">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-4 h-4 text-[#10B981]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <span className="text-sm text-neutral-600">Today's Volume</span>
            </div>
            <p className="text-2xl font-semibold text-neutral-900">
              ${todayVolume >= 1000 
                ? `${(todayVolume / 1000).toFixed(1)}K` 
                : todayVolume.toFixed(0)
              }
            </p>
          </div>
          
          {/* Card 2: Following */}
          <div className="bg-white rounded-xl p-4 border border-neutral-200">
            <span className="text-sm text-neutral-600 block mb-1">Following</span>
            <p className="text-2xl font-semibold text-neutral-900">{followingCount} traders</p>
          </div>
          
          {/* Card 3: Trades Today */}
          <div className="bg-white rounded-xl p-4 border border-neutral-200">
            <span className="text-sm text-neutral-600 block mb-1">Trades Today</span>
            <p className="text-2xl font-semibold text-neutral-900">
              {todaysTradeCount} {todaysTradeCount === 1 ? 'trade' : 'trades'}
            </p>
          </div>
        </div>

        {/* Filter Buttons - Centered with equal width */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
              filter === 'all'
                ? 'bg-neutral-900 text-white'
                : 'bg-white text-neutral-700 border border-neutral-200 hover:border-neutral-300'
            }`}
          >
            All Trades
          </button>
          <button
            onClick={() => setFilter('buys')}
            className={`flex-1 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
              filter === 'buys'
                ? 'bg-neutral-900 text-white'
                : 'bg-white text-neutral-700 border border-neutral-200 hover:border-neutral-300'
            }`}
          >
            Buys Only
          </button>
          <button
            onClick={() => setFilter('sells')}
            className={`flex-1 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
              filter === 'sells'
                ? 'bg-neutral-900 text-white'
                : 'bg-white text-neutral-700 border border-neutral-200 hover:border-neutral-300'
            }`}
          >
            Sells Only
          </button>
        </div>

        {/* Feed Content */}
        {loadingFeed ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-neutral-200 rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-neutral-200 rounded w-1/3 mb-2"></div>
                    <div className="h-4 bg-neutral-200 rounded w-3/4 mb-3"></div>
                    <div className="h-3 bg-neutral-200 rounded w-1/4"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-8 text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h3 className="text-xl font-bold text-neutral-900 mb-2">Failed to load feed</h3>
            <p className="text-neutral-600 mb-6">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-[#FDB022] hover:bg-[#E69E1A] text-neutral-900 font-semibold py-2.5 px-6 rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : followingCount === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-8 text-center">
            <div className="text-6xl mb-4">📋</div>
            <h3 className="text-xl font-bold text-neutral-900 mb-2">Your feed is empty</h3>
            <p className="text-neutral-600 mb-6">
              Follow traders on the Discover page to see their activity here
            </p>
            <Link 
              href="/discover"
              className="inline-block bg-[#FDB022] hover:bg-[#E69E1A] text-neutral-900 font-semibold py-2.5 px-6 rounded-lg transition-colors"
            >
              Discover Traders
            </Link>
          </div>
        ) : filteredTrades.length === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-8 text-center">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-xl font-bold text-neutral-900 mb-2">No {filter} trades</h3>
            <p className="text-neutral-600">
              Try selecting a different filter to see more trades.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTrades.map((trade) => (
              <TradeCard
                key={trade.id}
                traderName={trade.trader.displayName}
                traderAddress={trade.trader.wallet}
                market={trade.market.title}
                side={trade.trade.outcome}
                type={trade.trade.side === 'BUY' ? 'buy' : 'sell'}
                price={trade.trade.price}
                size={trade.trade.size}
                timestamp={trade.trade.timestamp}
                onCopyTrade={() => handleCopyTrade(trade)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
