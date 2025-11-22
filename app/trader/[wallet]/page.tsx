'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Header from '@/app/components/Header';

interface TraderData {
  wallet: string;
  displayName: string;
  pnl: number;
  volume: number;
  followerCount: number;
  roi?: number; // Optional: calculated value
  roiFormatted?: string; // Optional: pre-formatted ROI
}

interface Trade {
  timestamp: number;
  market: string;
  side: string;
  outcome: string;
  size: number;
  price: number;
  timeAgo: string;
  marketSlug?: string;
  conditionId?: string;
}

export default function TraderProfilePage({
  params,
}: {
  params: Promise<{ wallet: string }>;
}) {
  const [wallet, setWallet] = useState<string>('');
  const [traderData, setTraderData] = useState<TraderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [checkingFollow, setCheckingFollow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loadingTrades, setLoadingTrades] = useState(false);
  const router = useRouter();

  // Unwrap params Promise
  useEffect(() => {
    params.then((p) => setWallet(p.wallet));
  }, [params]);

  // Fetch trader data (hybrid approach: check sessionStorage first for instant load)
  useEffect(() => {
    if (!wallet) return;

    const loadTraderData = async () => {
      // First, check if we have cached data from clicking a TraderCard
      const cachedData = sessionStorage.getItem(`trader-${wallet}`);
      
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData);
          console.log('✅ Using cached trader data (instant load, no API call)');
          console.log('📦 Cached data:', parsed);
          
          // Set trader data immediately (no loading state!)
          setTraderData(parsed);
          setLoading(false);
          
          // Clear the cache after use
          sessionStorage.removeItem(`trader-${wallet}`);
          
          // DO NOT fetch from API - use cached data as-is
          // This ensures the profile shows EXACTLY the same data as the card
          return;
        } catch (err) {
          console.log('❌ Failed to parse cached data, will fetch from API');
          // If cache is corrupted, continue to API fetch
        }
      }

      // No cached data, fetch from API (direct URL visit)
      console.log('📡 No cached data found, fetching from API...');
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/trader/${wallet}`);

        if (!response.ok) {
          throw new Error('Failed to fetch trader data');
        }

        const data = await response.json();
        console.log('✅ Fetched trader data from API:', data);
        setTraderData(data);
      } catch (err: any) {
        console.error('❌ Error fetching trader:', err);
        setError(err.message || 'Failed to load trader data');
      } finally {
        setLoading(false);
      }
    };

    loadTraderData();
  }, [wallet]);

  // Fetch username from leaderboard (SAME AS FEED PAGE)
  useEffect(() => {
    if (!wallet || !traderData) return;

    const fetchUsername = async () => {
      console.log('🔍 Fetching username from leaderboard for wallet:', wallet);
      
      try {
        // Use the same leaderboard API as Feed page
        const response = await fetch('/api/polymarket/leaderboard?limit=100&orderBy=PNL');
        
        if (!response.ok) {
          console.log('⚠️ Leaderboard request failed:', response.status);
          return;
        }

        const leaderboardData = await response.json();
        console.log('✅ Leaderboard data fetched');
        
        // Find this trader in the leaderboard
        const trader = leaderboardData.traders?.find(
          (t: any) => t.wallet.toLowerCase() === wallet.toLowerCase()
        );
        
        if (trader && trader.displayName) {
          console.log('✅ Found username in leaderboard:', trader.displayName);
          
          // Update trader data with username from leaderboard
          setTraderData(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              displayName: trader.displayName
            };
          });
        } else {
          console.log('⚠️ Wallet not found in leaderboard, using:', traderData.displayName);
        }
      } catch (err) {
        console.error('❌ Error fetching username from leaderboard:', err);
        // Keep existing displayName if leaderboard fetch fails
      }
    };

    fetchUsername();
  }, [wallet]); // FIXED: Removed traderData from dependencies to prevent infinite loop

  // Check if user is following this trader
  useEffect(() => {
    if (!wallet) return;

    const checkFollowStatus = async () => {
      setCheckingFollow(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('follows')
          .select('id')
          .eq('user_id', user.id)
          .eq('trader_wallet', wallet)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error checking follow status:', error);
        } else if (data) {
          setFollowing(true);
        }
      }
      setCheckingFollow(false);
    };
    checkFollowStatus();
  }, [wallet]);

  // Fetch trader's recent trades
  useEffect(() => {
    if (!wallet) return;

    const fetchTraderTrades = async () => {
      console.log('📊 Fetching recent trades for wallet:', wallet);
      setLoadingTrades(true);

      try {
        const response = await fetch(
          `https://data-api.polymarket.com/trades?wallet=${wallet}&limit=20`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch trades');
        }

        const tradesData = await response.json();
        console.log('✅ Fetched', tradesData.length, 'trades from Polymarket');

        // Format trades for display
        const formattedTrades: Trade[] = tradesData.map((trade: any) => {
          return {
            timestamp: trade.timestamp,
            market: trade.title || trade.market?.title || trade.marketTitle || 'Unknown Market',
            side: trade.side || 'BUY',
            outcome: trade.outcome || trade.option || '',
            size: parseFloat(trade.size || 0),
            price: parseFloat(trade.price || 0),
            timeAgo: getRelativeTime(trade.timestamp),
            marketSlug: trade.slug || trade.market?.slug || trade.marketSlug || '',
            conditionId: trade.conditionId || trade.condition_id || trade.asset_id || '',
          };
        });

        setTrades(formattedTrades);
        console.log('✅ Formatted', formattedTrades.length, 'trades for display');
      } catch (err) {
        console.error('❌ Error fetching trades:', err);
        setTrades([]);
      } finally {
        setLoadingTrades(false);
      }
    };

    fetchTraderTrades();
  }, [wallet]);

  // Toggle follow status
  const handleFollowToggle = async () => {
    setFollowLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push('/login');
      setFollowLoading(false);
      return;
    }

    try {
      if (following) {
        // Unfollow
        const { error: deleteError } = await supabase
          .from('follows')
          .delete()
          .eq('user_id', user.id)
          .eq('trader_wallet', wallet);

        if (deleteError) {
          throw deleteError;
        }
        setFollowing(false);
      } else {
        // Follow
        const { error: insertError } = await supabase
          .from('follows')
          .insert({ user_id: user.id, trader_wallet: wallet });

        if (insertError) {
          throw insertError;
        }
        setFollowing(true);
      }
    } catch (err: any) {
      console.error('Error toggling follow:', err);
      alert(err.message || 'Failed to update follow status.');
    } finally {
      setFollowLoading(false);
    }
  };

  // Helper function to convert Unix timestamp to relative time
  const getRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const tradeTime = timestamp * 1000; // Convert seconds to milliseconds
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
  };

  // Generate consistent color from wallet address
  const getAvatarColor = (address: string) => {
    let hash = 0;
    for (let i = 0; i < address.length; i++) {
      hash = address.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 65%, 50%)`;
  };

  // Copy wallet to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(wallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Format P&L with sign and currency
  const formatPnL = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}$${value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  // Calculate ROI
  const calculateROI = (pnl: number, volume: number) => {
    if (volume === 0) return 0;
    return ((pnl / volume) * 100).toFixed(1);
  };

  // Format volume with M/K abbreviations
  const formatVolume = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    } else {
      return `$${value.toFixed(0)}`;
    }
  };

  // Abbreviate wallet address
  const abbreviateWallet = (address: string) => {
    if (address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20">
        <Header />
        <div className="flex items-center justify-center pt-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-brand-yellow mx-auto mb-4"></div>
            <p className="text-slate-600 text-lg">Loading trader data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !traderData) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20">
        <Header />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Link
            href="/discover"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Discover
          </Link>
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div className="text-6xl mb-6">😞</div>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Trader Not Found</h2>
            <p className="text-slate-600 text-lg mb-6">
              {error || 'Unable to load trader data'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const avatarColor = getAvatarColor(wallet);
  const initials = wallet.slice(2, 4).toUpperCase();
  const roi = calculateROI(traderData.pnl, traderData.volume);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Header />

      {/* Back Button */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <Link
            href="/discover"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
        </div>
      </div>

      {/* Profile Header Section */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* Avatar + Name + Follow Button */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-6">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div
                className="h-16 w-16 rounded-full flex items-center justify-center text-white font-bold text-2xl flex-shrink-0 ring-2 ring-white shadow-sm"
                style={{ backgroundColor: avatarColor }}
              >
                {initials}
              </div>
              
              {/* Name and Wallet */}
              <div>
                <h1 className="text-2xl font-bold text-slate-900 mb-1">
                  {traderData.displayName}
                </h1>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-slate-500 font-mono">
                    {abbreviateWallet(wallet)}
                  </span>
                  <button
                    onClick={handleCopy}
                    className="text-slate-400 hover:text-slate-900 transition-colors"
                    title="Copy wallet address"
                  >
                    {copied ? '✓' : '📋'}
                  </button>
                </div>
                <p className="text-sm text-slate-500">
                  {traderData.followerCount.toLocaleString()} {traderData.followerCount === 1 ? 'follower' : 'followers'} on Polycopy
                </p>
              </div>
            </div>

            {/* Follow Button */}
            <button
              onClick={handleFollowToggle}
              disabled={followLoading || checkingFollow}
              className={`rounded-lg px-6 py-3 text-sm font-bold transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed border-b-4 active:border-b-0 active:translate-y-1 ${
                following
                  ? 'bg-slate-200 text-slate-700 hover:bg-slate-300 border-slate-400'
                  : 'bg-[#FDB022] hover:bg-[#F59E0B] text-slate-900 border-[#D97706]'
              }`}
            >
              {checkingFollow || followLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  {following ? 'Unfollowing...' : 'Following...'}
                </span>
              ) : following ? (
                '✓ Following'
              ) : (
                '+ Follow'
              )}
            </button>
          </div>

          {/* Stats Grid - 3 columns like Polymarket */}
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">Total P&L</div>
              <div className={`text-2xl font-bold ${
                traderData.pnl >= 0 ? 'text-emerald-600' : 'text-red-500'
              }`}>
                {formatPnL(traderData.pnl)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">ROI</div>
              <div className={`text-2xl font-bold ${
                parseFloat(String(roi)) >= 0 ? 'text-emerald-600' : 'text-red-500'
              }`}>
                {traderData.roiFormatted || roi}%
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">Volume</div>
              <div className="text-2xl font-bold text-slate-900">
                {formatVolume(traderData.volume)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Trades Section */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-xl font-bold text-slate-900 mb-6">
            Recent Trades
          </h3>
          
          {loadingTrades ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-brand-yellow mx-auto mb-4"></div>
              <p className="text-slate-500">Loading trades...</p>
            </div>
          ) : trades.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📊</div>
              <p className="text-slate-600 text-lg font-medium mb-2">
                No recent trades found
              </p>
              <p className="text-slate-500 text-sm">
                This trader hasn't made any trades recently
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider w-24">Time</th>
                    <th className="px-3 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider w-80">Market</th>
                    <th className="px-3 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider w-20">Side</th>
                    <th className="px-3 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider w-20">Size</th>
                    <th className="px-3 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider w-20">Price</th>
                    <th className="px-3 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider w-24">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade, index) => {
                    // Generate Polymarket link with multiple fallback strategies
                    let polymarketUrl = 'https://polymarket.com';
                    
                    if (trade.marketSlug) {
                      // Try event URL with slug
                      polymarketUrl = `https://polymarket.com/event/${trade.marketSlug}?utm_source=polycopy&utm_medium=copy_trade&utm_campaign=trader_profile`;
                    } else if (trade.conditionId) {
                      // Try condition ID
                      polymarketUrl = `https://polymarket.com/market/${trade.conditionId}?utm_source=polycopy&utm_medium=copy_trade&utm_campaign=trader_profile`;
                    } else if (trade.market) {
                      // Fallback: Use search with market title
                      polymarketUrl = `https://polymarket.com/search?q=${encodeURIComponent(trade.market)}`;
                    }

                    return (
                      <tr 
                        key={`${trade.timestamp}-${index}`}
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                      >
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="text-sm text-slate-500">{trade.timeAgo}</span>
                        </td>
                        
                        {/* Market column - full text visible with horizontal scroll */}
                        <td className="py-3 px-3">
                          <div className="text-sm text-slate-900 font-medium">
                            {trade.market}
                          </div>
                        </td>
                        
                        <td className="py-3 px-3 text-left">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                            ['yes', 'up', 'over'].includes(trade.outcome.toLowerCase())
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {trade.outcome.toUpperCase()}
                          </span>
                        </td>
                        
                        <td className="py-3 px-3 text-right">
                          <span className="text-sm font-semibold text-slate-900">
                            ${trade.size.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                        </td>
                        
                        <td className="py-3 px-3 text-right">
                          <span className="text-sm text-slate-600">
                            ${trade.price.toFixed(2)}
                          </span>
                        </td>
                        
                        {/* Copy Trade button column */}
                        <td className="py-3 px-3 text-right">
                          <a
                            href={polymarketUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg bg-[#FDB022] px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-[#F59E0B] transition-colors"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                            </svg>
                            <span className="hidden sm:inline">Copy</span>
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

