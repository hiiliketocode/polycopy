'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

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
  }, [wallet, traderData]);

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
        const formattedTrades: Trade[] = tradesData.map((trade: any) => ({
          timestamp: trade.timestamp,
          market: trade.title || trade.market?.title || trade.marketTitle || 'Unknown Market',
          side: trade.side || 'BUY',
          outcome: trade.outcome || trade.option || '',
          size: parseFloat(trade.size || 0),
          price: parseFloat(trade.price || 0),
          timeAgo: getRelativeTime(trade.timestamp),
        }));

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
      <div className="min-h-screen bg-secondary pb-20 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary mx-auto mb-4"></div>
          <p className="text-tertiary text-lg">Loading trader data...</p>
        </div>
      </div>
    );
  }

  if (error || !traderData) {
    return (
      <div className="min-h-screen bg-secondary pb-20">
        <div className="bg-primary p-8 text-center">
          <h1 className="text-4xl font-bold text-tertiary">Trader Not Found</h1>
        </div>
        <div className="flex flex-col items-center justify-center pt-20 px-4">
          <p className="text-tertiary text-lg mb-6">
            {error || 'Unable to load trader data'}
          </p>
          <button
            onClick={() => router.push('/')}
            className="bg-primary text-tertiary px-6 py-3 rounded-xl font-semibold hover:bg-yellow-400 transition-all duration-200"
          >
            ← Back to Discover
          </button>
        </div>
      </div>
    );
  }

  const avatarColor = getAvatarColor(wallet);
  const initials = wallet.slice(2, 4).toUpperCase();

  return (
    <div className="min-h-screen bg-secondary pb-20">
      {/* Header */}
      <div className="bg-primary p-6 md:p-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => router.back()}
            className="text-tertiary hover:text-gray-700 mb-4 flex items-center gap-2 text-sm font-medium transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-3xl md:text-4xl font-bold text-tertiary">
            Trader Profile
          </h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
        {/* Trader Info Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 md:p-8 mb-6">
          {/* Avatar and Basic Info */}
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-6 pb-6 border-b border-gray-100">
            {/* Avatar */}
            <div
              className="w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center text-white font-bold text-2xl md:text-3xl flex-shrink-0"
              style={{ backgroundColor: avatarColor }}
            >
              {initials}
            </div>

            {/* Name and Wallet */}
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl md:text-3xl font-bold text-tertiary mb-2">
                {traderData.displayName}
              </h2>

              {/* Abbreviated Wallet */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg text-gray-600 font-mono">
                  {abbreviateWallet(wallet)}
                </span>
                <button
                  onClick={handleCopy}
                  className="text-gray-400 hover:text-tertiary transition-colors flex-shrink-0"
                  title="Copy full wallet address"
                >
                  {copied ? '✓' : '📋'}
                </button>
              </div>

              {/* Follower Count */}
              <div className="text-sm text-gray-600 font-medium">
                👥 {traderData.followerCount.toLocaleString()} {traderData.followerCount === 1 ? 'follower' : 'followers'} on Polycopy
              </div>
            </div>

            {/* Follow Button (Desktop) */}
            <div className="hidden md:block">
              <button
                onClick={handleFollowToggle}
                disabled={followLoading || checkingFollow}
                className={`py-3 px-6 rounded-xl font-semibold transition-all duration-200 min-w-[140px]
                  ${
                    following
                      ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      : 'bg-primary text-tertiary hover:bg-yellow-400'
                  }
                  ${followLoading || checkingFollow ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                {checkingFollow || followLoading ? (
                  <span className="flex items-center justify-center">
                    <svg
                      className="animate-spin h-5 w-5 mr-2"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  </span>
                ) : following ? (
                  '✓ Following'
                ) : (
                  '+ Follow'
                )}
              </button>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4 md:gap-8 mb-6">
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <div
                className={`text-2xl md:text-3xl font-bold mb-1 ${
                  traderData.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {formatPnL(traderData.pnl)}
              </div>
              <div className="text-sm text-gray-500 font-medium">Total P&L</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <div
                className={`text-2xl md:text-3xl font-bold mb-1 ${
                  traderData.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {traderData.roiFormatted || calculateROI(traderData.pnl, traderData.volume)}%
              </div>
              <div className="text-sm text-gray-500 font-medium">ROI</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <div className="text-2xl md:text-3xl font-bold text-tertiary mb-1">
                {formatVolume(traderData.volume)}
              </div>
              <div className="text-sm text-gray-500 font-medium">
                Volume
              </div>
            </div>
          </div>

          {/* Follow Button (Mobile) */}
          <div className="md:hidden">
            <button
              onClick={handleFollowToggle}
              disabled={followLoading || checkingFollow}
              className={`w-full py-3 px-4 rounded-xl font-semibold transition-all duration-200
                ${
                  following
                    ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    : 'bg-primary text-tertiary hover:bg-yellow-400'
                }
                ${followLoading || checkingFollow ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {checkingFollow || followLoading ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin h-5 w-5 mr-3 text-gray-500"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Loading...
                </span>
              ) : following ? (
                '✓ Following'
              ) : (
                '+ Follow'
              )}
            </button>
          </div>
        </div>

        {/* Recent Trades Section */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 md:p-8">
          <h3 className="text-xl md:text-2xl font-bold text-tertiary mb-4">
            Recent Trades
          </h3>
          
          {loadingTrades ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-primary mx-auto mb-4"></div>
              <p className="text-gray-500">Loading trades...</p>
            </div>
          ) : trades.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📊</div>
              <p className="text-gray-500 text-lg">
                No recent trades found
              </p>
              <p className="text-gray-400 text-sm mt-2">
                This trader hasn't made any trades recently
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Time</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Market</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-gray-600">Side</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">Size</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade, index) => (
                    <tr 
                      key={`${trade.timestamp}-${index}`}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-4 px-4">
                        <span className="text-sm text-gray-500">{trade.timeAgo}</span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-sm text-gray-900 font-medium line-clamp-1">
                          {trade.market}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                          ['yes', 'up'].includes(trade.outcome.toLowerCase())
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {trade.outcome.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <span className="text-sm font-semibold text-gray-900">
                          ${trade.size.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <span className="text-sm text-gray-600">
                          ${trade.price.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

