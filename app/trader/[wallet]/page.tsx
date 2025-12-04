'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Copy, Check } from 'lucide-react';
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
  tradesCount?: number; // Total number of trades
}

interface LeaderboardData {
  username?: string;
  total_pnl?: number;
  volume?: number;
  total_trades?: number;
  roi?: number;
}

interface Trade {
  timestamp: number;
  market: string;
  side: string;
  outcome: string;
  size: number;
  price: number;
  avgPrice?: number;
  currentPrice?: number;
  formattedDate: string;
  marketSlug?: string;
  conditionId?: string;
  status: 'Open' | 'Closed' | 'Bonded';
}

export default function TraderProfilePage({
  params,
}: {
  params: Promise<{ wallet: string }>;
}) {
  const [wallet, setWallet] = useState<string>('');
  const [traderData, setTraderData] = useState<TraderData | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [checkingFollow, setCheckingFollow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loadingTrades, setLoadingTrades] = useState(false);
  const [openMarketIds, setOpenMarketIds] = useState<Set<string>>(new Set());
  const router = useRouter();

  // Unwrap params Promise
  useEffect(() => {
    params.then((p) => {
      console.log('🔍 Wallet from URL:', p.wallet);
      console.log('🔍 Wallet format check:', {
        length: p.wallet.length,
        startsWithOx: p.wallet.startsWith('0x'),
        isValidFormat: p.wallet.startsWith('0x') && p.wallet.length === 42,
        isUsername: !p.wallet.startsWith('0x'),
      });
      setWallet(p.wallet);
    });
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
      console.log('📡 No cached data found, fetching from internal API...');
      console.log('📡 Internal API URL:', `/api/trader/${wallet}`);
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/trader/${wallet}`);
        
        console.log('📡 Internal API response status:', response.status);

        if (!response.ok) {
          throw new Error('Failed to fetch trader data');
        }

        const data = await response.json();
        console.log('📡 Internal API response:', JSON.stringify(data, null, 2));
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

  // Fetch username and stats directly from Polymarket leaderboard API
  useEffect(() => {
    if (!wallet) return;

    const fetchLeaderboardData = async () => {
      const apiUrl = `https://data-api.polymarket.com/leaderboard?address=${wallet}`;
      console.log('📊 Fetching leaderboard data...');
      console.log('📊 Leaderboard API URL:', apiUrl);
      
      try {
        // Use direct address lookup from Polymarket leaderboard API
        const response = await fetch(apiUrl);
        
        console.log('📊 Leaderboard response status:', response.status);
        
        if (!response.ok) {
          console.log('⚠️ Leaderboard request failed:', response.status);
          return;
        }

        const data = await response.json();
        console.log('📊 Leaderboard RAW response:', JSON.stringify(data, null, 2));
        console.log('📊 Leaderboard data type:', typeof data);
        console.log('📊 Is array:', Array.isArray(data));
        console.log('📊 Data length:', Array.isArray(data) ? data.length : 'N/A');
        
        // The API returns an array, get the first result
        const trader = Array.isArray(data) ? data[0] : data;
        
        if (trader) {
          console.log('📊 Trader data found:', {
            username: trader.username,
            name: trader.name,
            total_pnl: trader.total_pnl,
            pnl: trader.pnl,
            volume: trader.volume,
            total_trades: trader.total_trades,
            trades_count: trader.trades_count,
            roi: trader.roi,
            allKeys: Object.keys(trader),
          });
          
          setLeaderboardData({
            username: trader.username || trader.name,
            total_pnl: trader.total_pnl ?? trader.pnl,
            volume: trader.volume,
            total_trades: trader.total_trades ?? trader.trades_count,
            roi: trader.roi,
          });
          
          // Update trader data with username if available
          if (trader.username || trader.name) {
            setTraderData(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                displayName: trader.username || trader.name || prev.displayName,
                pnl: trader.total_pnl ?? trader.pnl ?? prev.pnl,
                volume: trader.volume ?? prev.volume,
                tradesCount: trader.total_trades ?? trader.trades_count,
              };
            });
          }
        } else {
          console.log('⚠️ No leaderboard data found for this wallet');
          console.log('⚠️ Empty response from leaderboard API');
        }
      } catch (err) {
        console.error('❌ Error fetching leaderboard data:', err);
      }
    };

    fetchLeaderboardData();
  }, [wallet]);
  
  // Fetch trader's current positions from Polymarket
  // Positions represent OPEN markets that the trader currently has
  useEffect(() => {
    if (!wallet) return;

    const fetchPositions = async () => {
      const apiUrl = `https://data-api.polymarket.com/positions?user=${wallet}`;
      console.log('📈 Fetching positions data...');
      console.log('📈 Positions API URL:', apiUrl);
      
      try {
        const response = await fetch(apiUrl);
        
        console.log('📈 Positions response status:', response.status);
        
        if (!response.ok) {
          console.log('⚠️ Positions request failed:', response.status);
          return;
        }

        const positionsData = await response.json();
        console.log('📈 Positions RAW response:', JSON.stringify(positionsData?.slice(0, 3), null, 2)); // First 3 for brevity
        console.log('📈 Number of OPEN positions:', positionsData?.length || 0);
        
        // Log each position's details for debugging
        if (positionsData && positionsData.length > 0) {
          console.log('📈 Position sample - all keys:', Object.keys(positionsData[0]));
          positionsData.slice(0, 3).forEach((position: any, index: number) => {
            console.log(`📈 Position ${index + 1}:`, {
              conditionId: position.conditionId,
              asset: position.asset,
              market: position.title || position.market,
              outcome: position.outcome,
              size: position.size,
            });
          });
        }
        
        // Build Set of open market identifiers
        // Positions API only returns markets where the trader currently holds a position
        // These are OPEN markets - anything not in this set is CLOSED
        const openIds = new Set<string>();
        positionsData?.forEach((position: any) => {
          // Try multiple identifier fields
          if (position.conditionId) openIds.add(position.conditionId);
          if (position.asset) openIds.add(position.asset);
          if (position.condition_id) openIds.add(position.condition_id);
          if (position.marketId) openIds.add(position.marketId);
        });
        
        console.log('📈 Open market IDs extracted:', openIds.size);
        console.log('📈 Open market IDs sample:', Array.from(openIds).slice(0, 5));
        
        setOpenMarketIds(openIds);
        
      } catch (err) {
        console.error('❌ Error fetching positions:', err);
      }
    };

    fetchPositions();
  }, [wallet]);

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

  // Fetch trader's ALL trades (no limit)
  useEffect(() => {
    if (!wallet) return;

    const fetchTraderTrades = async () => {
      // Note: Using 'user' parameter instead of 'wallet' for the Polymarket API
      // Removed limit to get ALL trades
      const apiUrl = `https://data-api.polymarket.com/trades?user=${wallet}`;
      console.log('🔄 Fetching ALL trades (no limit)...');
      console.log('🔄 Trades API URL:', apiUrl);
      setLoadingTrades(true);

      try {
        const response = await fetch(apiUrl);
        
        console.log('🔄 Trades response status:', response.status);

        if (!response.ok) {
          throw new Error('Failed to fetch trades');
        }

        const tradesData = await response.json();
        console.log('🔄 Trades RAW response (first 3):', JSON.stringify(tradesData?.slice(0, 3), null, 2));
        console.log('🔄 TOTAL trades fetched:', tradesData?.length || 0);
        
        // Log first trade structure for debugging
        if (tradesData && tradesData.length > 0) {
          console.log('🔄 First trade all keys:', Object.keys(tradesData[0]));
          console.log('🔄 Trade sample for status matching:', {
            conditionId: tradesData[0].conditionId,
            condition_id: tradesData[0].condition_id,
            asset_id: tradesData[0].asset_id,
            asset: tradesData[0].asset,
            marketId: tradesData[0].marketId,
          });
        }

        // Format trades for display
        const formattedTrades: Trade[] = tradesData.map((trade: any) => {
          // Parse timestamp - handle both Unix seconds and milliseconds
          let timestampMs = trade.timestamp;
          // If timestamp is in seconds (10 digits), convert to milliseconds
          if (timestampMs < 10000000000) {
            timestampMs = timestampMs * 1000;
          }
          
          const tradeDate = new Date(timestampMs);
          const formattedDate = tradeDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          });
          
          // Get trade's market identifier
          const tradeConditionId = trade.conditionId || trade.condition_id || trade.asset_id || trade.asset || trade.marketId || '';
          
          // Determine market status by checking if this market is in openMarketIds
          // If the trader has an active position in this market, it's Open
          // If the trader has no active position (sold or market closed), it's Closed
          let status: 'Open' | 'Closed' | 'Bonded' = 'Closed'; // Default to Closed
          
          if (openMarketIds.size > 0) {
            // Check if this trade's market is in the open positions
            const isOpen = openMarketIds.has(tradeConditionId);
            status = isOpen ? 'Open' : 'Closed';
          } else {
            // If positions API returned empty (no open positions), all trades are Closed
            // Unless explicitly marked as bonded
            if (trade.status === 'bonded' || trade.marketStatus === 'bonded') {
              status = 'Bonded';
            }
          }
          
          return {
            timestamp: trade.timestamp,
            market: trade.title || trade.market?.title || trade.marketTitle || 'Unknown Market',
            side: trade.side || 'BUY',
            outcome: trade.outcome || trade.option || '',
            size: parseFloat(trade.size || 0),
            price: parseFloat(trade.price || 0),
            avgPrice: trade.avgPrice ? parseFloat(trade.avgPrice) : undefined,
            currentPrice: trade.currentPrice ? parseFloat(trade.currentPrice) : undefined,
            formattedDate: formattedDate,
            marketSlug: trade.slug || trade.market?.slug || trade.marketSlug || '',
            conditionId: tradeConditionId,
            status: status,
          };
        });

        // Sort by timestamp descending (newest first)
        formattedTrades.sort((a, b) => b.timestamp - a.timestamp);

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
  }, [wallet, openMarketIds]);

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

  /**
   * Generate a consistent avatar color from wallet address
   * 
   * This is a custom implementation (not using external library like Dicebear or Boring Avatars)
   * - Uses a simple hash function on the wallet address string
   * - Converts hash to a hue value (0-360) for HSL color
   * - Saturation fixed at 65%, Lightness at 50% for vibrant, readable colors
   * - The initials are taken from characters 2-4 of the wallet (after "0x" prefix)
   * 
   * Example: "0xabc123..." -> hash -> hue 180 -> "hsl(180, 65%, 50%)" with initials "AB"
   */
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

  // Format P&L with sign and currency - returns "--" if no data
  const formatPnL = (value: number | null | undefined) => {
    if (value === null || value === undefined || (value === 0 && !leaderboardData)) {
      return '--';
    }
    const sign = value >= 0 ? '+' : '';
    return `${sign}$${value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  // Calculate ROI - returns "--" string if cannot calculate
  const calculateROI = (pnl: number | null | undefined, volume: number | null | undefined): string => {
    if (pnl === null || pnl === undefined || volume === null || volume === undefined || volume === 0) {
      return '--';
    }
    return ((pnl / volume) * 100).toFixed(1);
  };

  // Format volume with M/K abbreviations - returns "--" if no data
  const formatVolume = (value: number | null | undefined) => {
    if (value === null || value === undefined || (value === 0 && !leaderboardData)) {
      return '--';
    }
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    } else {
      return `$${value.toFixed(0)}`;
    }
  };

  // Format trades count - returns "--" if no data
  const formatTradesCount = (count: number | null | undefined): string => {
    if (count === null || count === undefined) {
      return '--';
    }
    return count.toLocaleString('en-US', { maximumFractionDigits: 0 });
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
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
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
  // Avatar initials: first 2 characters after "0x" prefix, uppercased
  const initials = wallet.slice(2, 4).toUpperCase();
  const roi = traderData.roiFormatted || calculateROI(traderData.pnl, traderData.volume);
  const tradesCount = traderData.tradesCount ?? leaderboardData?.total_trades ?? trades.length;

  // Determine display name: prefer leaderboard username, then traderData, then "Anonymous Trader"
  const displayName = leaderboardData?.username || traderData.displayName || 'Anonymous Trader';

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Header />

      {/* Back Button */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
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
                <h1 className="text-3xl font-bold text-slate-900">
                  {displayName}
                </h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-slate-500 font-mono">
                    {abbreviateWallet(wallet)}
                  </span>
                  <button
                    onClick={handleCopy}
                    className="p-1 hover:bg-slate-100 rounded transition-colors"
                    title="Copy wallet address"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                    )}
                  </button>
                </div>
                <p className="text-sm text-slate-500 mt-1">
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

          {/* Stats Grid - Desktop: 4 separate cards, Mobile: Combined card */}
          <div className="hidden md:grid grid-cols-4 gap-4">
            {/* Desktop Stat Cards */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="text-sm text-slate-500 uppercase tracking-wide mb-1">TOTAL P&L</div>
              <div className={`text-2xl font-bold ${
                traderData.pnl > 0 ? 'text-emerald-600' : traderData.pnl < 0 ? 'text-red-500' : 'text-slate-900'
              }`}>
                {formatPnL(traderData.pnl)}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="text-sm text-slate-500 uppercase tracking-wide mb-1">ROI</div>
              <div className={`text-2xl font-bold ${
                roi !== '--' && parseFloat(String(roi)) > 0 ? 'text-emerald-600' : 
                roi !== '--' && parseFloat(String(roi)) < 0 ? 'text-red-500' : 'text-slate-900'
              }`}>
                {roi !== '--' ? `${roi}%` : '--'}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="text-sm text-slate-500 uppercase tracking-wide mb-1">VOLUME</div>
              <div className="text-2xl font-bold text-slate-900">
                {formatVolume(traderData.volume)}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="text-sm text-slate-500 uppercase tracking-wide mb-1">TRADES</div>
              <div className="text-2xl font-bold text-slate-900">
                {formatTradesCount(tradesCount)}
              </div>
            </div>
          </div>

          {/* Mobile: Combined stat card - 4 columns in one card */}
          <div className="md:hidden bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-xs text-slate-500 uppercase mb-1">P&L</div>
                <div className={`text-sm font-bold ${
                  traderData.pnl > 0 ? 'text-emerald-600' : traderData.pnl < 0 ? 'text-red-500' : 'text-slate-900'
                }`}>
                  {formatPnL(traderData.pnl)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase mb-1">ROI</div>
                <div className={`text-sm font-bold ${
                  roi !== '--' && parseFloat(String(roi)) > 0 ? 'text-emerald-600' : 
                  roi !== '--' && parseFloat(String(roi)) < 0 ? 'text-red-500' : 'text-slate-900'
                }`}>
                  {roi !== '--' ? `${roi}%` : '--'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase mb-1">Volume</div>
                <div className="text-sm font-bold text-slate-900">
                  {formatVolume(traderData.volume)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase mb-1">Trades</div>
                <div className="text-sm font-bold text-slate-900">
                  {formatTradesCount(tradesCount)}
                </div>
              </div>
            </div>
          </div>
          
          {/* Leaderboard stats explanation */}
          {!leaderboardData && (
            <p className="text-xs text-slate-500 mt-3 text-center md:text-left">
              * Stats only available for top-ranked Leaderboard traders on Polymarket
            </p>
          )}
        </div>
      </div>

      {/* Trade History Section */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h3 className="text-xl font-bold text-slate-900 mb-6">
          Trade History {trades.length > 0 && <span className="text-slate-400 font-normal">({trades.length})</span>}
        </h3>
        
        {loadingTrades ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-brand-yellow mx-auto mb-4"></div>
            <p className="text-slate-500">Loading trades...</p>
          </div>
        ) : trades.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
            <div className="text-6xl mb-4">📊</div>
            <p className="text-slate-600 text-lg font-medium mb-2">
              No trade history found
            </p>
            <p className="text-slate-500 text-sm">
              This trader hasn't made any trades yet
            </p>
          </div>
        ) : (
          <>
            {/* Desktop: Table View */}
            <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b-2 border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Market</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Outcome</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Size</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Avg Price</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
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
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="py-4 px-4 whitespace-nowrap">
                            <span className="text-sm text-slate-500">{trade.formattedDate}</span>
                          </td>
                          
                          <td className="py-4 px-4">
                            <div className="text-sm text-slate-900 font-medium">
                              {trade.market}
                            </div>
                          </td>
                          
                          <td className="py-4 px-4">
                            <span className={`badge ${
                              ['yes', 'up', 'over'].includes(trade.outcome.toLowerCase())
                                ? 'badge-yes'
                                : 'badge-no'
                            }`}>
                              {trade.outcome.toUpperCase()}
                            </span>
                          </td>
                          
                          <td className="py-4 px-4 text-right">
                            <span className="text-sm font-semibold text-slate-900">
                              ${trade.size.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                          </td>
                          
                          <td className="py-4 px-4 text-right">
                            <span className="text-sm font-semibold text-slate-900">
                              ${trade.price.toFixed(2)}
                            </span>
                          </td>
                          
                          <td className="py-4 px-4 text-center">
                            {trade.status === 'Open' ? (
                              <a
                                href={polymarketUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-3 py-1 bg-[#FDB022] hover:bg-[#F59E0B] text-slate-900 text-xs font-bold rounded-full cursor-pointer transition-colors"
                              >
                                Copy Trade
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            ) : (
                              <span className="inline-flex items-center px-3 py-1 bg-slate-500 text-white text-xs font-semibold rounded-full">
                                Closed
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile: Card-Based View */}
            <div className="md:hidden space-y-4">
              {trades.map((trade, index) => {
                // Generate Polymarket link
                let polymarketUrl = 'https://polymarket.com';
                
                if (trade.marketSlug) {
                  polymarketUrl = `https://polymarket.com/event/${trade.marketSlug}?utm_source=polycopy&utm_medium=copy_trade&utm_campaign=trader_profile`;
                } else if (trade.conditionId) {
                  polymarketUrl = `https://polymarket.com/market/${trade.conditionId}?utm_source=polycopy&utm_medium=copy_trade&utm_campaign=trader_profile`;
                } else if (trade.market) {
                  polymarketUrl = `https://polymarket.com/search?q=${encodeURIComponent(trade.market)}`;
                }

                return (
                  <div key={`${trade.timestamp}-${index}`} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                    {/* Header: Date + Outcome Badge */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm text-slate-500">{trade.formattedDate}</div>
                      <span className={`badge ${
                        ['yes', 'up', 'over'].includes(trade.outcome.toLowerCase())
                          ? 'badge-yes'
                          : 'badge-no'
                      }`}>
                        {trade.outcome.toUpperCase()}
                      </span>
                    </div>
                    
                    {/* Market Name */}
                    <div className="font-semibold text-base text-slate-900 mb-3 leading-tight">
                      {trade.market}
                    </div>
                    
                    {/* Trade Details Grid */}
                    <div className="bg-slate-50 rounded-xl p-4 mb-3">
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <div className="text-xs text-slate-500 mb-1">Size</div>
                          <div className="font-semibold text-slate-900 text-sm">
                            ${trade.size.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-1">Avg Price</div>
                          <div className="font-semibold text-slate-900 text-sm">${trade.price.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-1">Total</div>
                          <div className="font-semibold text-slate-900 text-sm">
                            ${(trade.size * trade.price).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Status/Action Button */}
                    {trade.status === 'Open' ? (
                      <a
                        href={polymarketUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#FDB022] hover:bg-[#F59E0B] text-slate-900 text-sm font-bold rounded-full cursor-pointer transition-colors"
                      >
                        <span>Copy Trade</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ) : (
                      <div className="w-full flex items-center justify-center px-4 py-2.5 bg-slate-500 text-white text-sm font-semibold rounded-full">
                        Closed
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
