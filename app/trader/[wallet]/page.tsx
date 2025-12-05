'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Copy, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Header from '@/app/components/Header';
import type { User } from '@supabase/supabase-js';

// Copy Trade Modal Component
function CopyTradeModal({ 
  isOpen, 
  trade, 
  traderWallet,
  traderName,
  onClose, 
  onConfirm, 
  isSubmitting 
}: { 
  isOpen: boolean; 
  trade: Trade | null;
  traderWallet: string;
  traderName: string;
  onClose: () => void; 
  onConfirm: (entryPrice: number, amountInvested?: number) => void;
  isSubmitting: boolean;
}) {
  const [entryPrice, setEntryPrice] = useState('');
  const [amountInvested, setAmountInvested] = useState('');

  useEffect(() => {
    if (trade) {
      setEntryPrice(trade.price.toFixed(2));
      setAmountInvested('');
    }
  }, [trade]);

  if (!isOpen || !trade) return null;

  const handleConfirm = () => {
    const price = entryPrice ? parseFloat(entryPrice) : trade.price;
    const amount = amountInvested ? parseFloat(amountInvested) : undefined;
    onConfirm(price, amount);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 overflow-hidden"
      onClick={handleBackdropClick}
    >
      <div className="h-full w-full overflow-y-auto flex items-start justify-center pt-8 pb-24 px-4 sm:items-center sm:pt-4 sm:pb-4">
        <div 
          className="w-full max-w-md bg-white rounded-2xl shadow-xl mx-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 max-h-[calc(100vh-8rem)] sm:max-h-[85vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-neutral-900">Mark Trade as Copied</h3>
              <button 
                onClick={onClose}
                className="text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Trade Details */}
            <div className="bg-neutral-50 rounded-xl p-3 sm:p-4 mb-4">
              <p className="text-sm text-neutral-600 mb-1">Market</p>
              <p className="font-medium text-neutral-900 mb-3 text-sm sm:text-base break-words">{trade.market}</p>
              
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-neutral-600 mb-1">Trader</p>
                  <p className="font-medium text-neutral-900 text-sm sm:text-base truncate">{traderName}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-neutral-600 mb-1">Position</p>
                  <p className="font-medium text-neutral-900 text-sm sm:text-base">
                    <span className={trade.outcome.toUpperCase() === 'YES' ? 'text-[#10B981]' : 'text-[#EF4444]'}>
                      {trade.outcome.toUpperCase()}
                    </span>
                    {' '}at {Math.round(trade.price * 100)}¢
                  </p>
                </div>
              </div>
            </div>

            {/* Entry Price Input */}
            <div className="mb-4 w-full">
              <label className="block w-full text-sm font-medium text-neutral-700 mb-2">
                Your entry price <span className="text-red-500">*</span>
              </label>
              <div className="relative w-full">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
                <input
                  type="number"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  placeholder="0.58"
                  min="0.01"
                  max="0.99"
                  step="0.01"
                  className="w-full pl-8 pr-4 py-2.5 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FDB022] focus:border-transparent"
                />
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                The price you bought/sold at (trader's price: ${trade.price.toFixed(2)})
              </p>
            </div>

            {/* Amount Input */}
            <div className="mb-6 w-full">
              <label className="block w-full text-sm font-medium text-neutral-700 mb-2">
                Amount invested (optional)
              </label>
              <div className="relative w-full">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
                <input
                  type="number"
                  value={amountInvested}
                  onChange={(e) => setAmountInvested(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full pl-8 pr-4 py-2.5 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FDB022] focus:border-transparent"
                />
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                Track how much you invested to calculate your ROI later
              </p>
            </div>

            {/* Buttons */}
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 w-full">
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="w-full sm:flex-1 py-2.5 px-4 border border-neutral-300 rounded-lg font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={isSubmitting}
                className="w-full sm:flex-1 py-2.5 px-4 bg-[#FDB022] hover:bg-[#E69E1A] rounded-lg font-semibold text-neutral-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-neutral-900/30 border-t-neutral-900 rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  'Confirm'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  eventSlug?: string;
  status: 'Open' | 'Trader Closed' | 'Bonded';
}

interface Position {
  conditionId: string;
  asset?: string;
  eventSlug?: string;
  slug?: string;
  title?: string;
  outcome?: string;
  size?: number;
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
  const [positions, setPositions] = useState<Position[]>([]);  // Store full position data for URL construction
  const router = useRouter();
  
  // User state
  const [user, setUser] = useState<User | null>(null);
  
  // Modal state for Mark as Copied
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Toast state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // Copied trades tracking
  const [copiedTradeIds, setCopiedTradeIds] = useState<Set<string>>(new Set());

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

  // Fetch current user
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      
      // If user is logged in, fetch their copied trades
      if (user) {
        const { data: copiedTrades } = await supabase
          .from('copied_trades')
          .select('market_id, trader_wallet')
          .eq('user_id', user.id);
        
        if (copiedTrades) {
          const ids = new Set(copiedTrades.map(t => `${t.market_id}-${t.trader_wallet}`));
          setCopiedTradeIds(ids);
        }
      }
    };
    
    fetchUser();
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    
    return () => subscription.unsubscribe();
  }, []);

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

  // Fetch username and stats directly from Polymarket V1 leaderboard API
  // NOTE: This duplicates some data from /api/trader/[wallet] but ensures we have
  // the username and all-time stats even if the API route fails
  useEffect(() => {
    if (!wallet) return;

    const fetchLeaderboardData = async () => {
      // CORRECT API: V1 endpoint that Polymarket actually uses
      const apiUrl = `https://data-api.polymarket.com/v1/leaderboard?timePeriod=all&orderBy=VOL&limit=1&offset=0&category=overall&user=${wallet}`;
      console.log('📊 Fetching V1 leaderboard data...');
      console.log('📊 V1 Leaderboard API URL:', apiUrl);
      
      try {
        const response = await fetch(apiUrl);
        
        console.log('📊 V1 Leaderboard response status:', response.status);
        
        if (!response.ok) {
          console.log('⚠️ V1 Leaderboard request failed:', response.status);
          return;
        }

        const data = await response.json();
        console.log('📊 V1 Leaderboard RAW response:', JSON.stringify(data, null, 2));
        console.log('📊 V1 Leaderboard data type:', typeof data);
        console.log('📊 Is array:', Array.isArray(data));
        console.log('📊 Data length:', Array.isArray(data) ? data.length : 'N/A');
        
        // The V1 API returns an array, get the first result
        const trader = Array.isArray(data) && data.length > 0 ? data[0] : null;
        
        if (trader) {
          console.log('📊 V1 Trader data found:', {
            userName: trader.userName,  // Note: userName not username!
            proxyWallet: trader.proxyWallet,
            pnl: trader.pnl,
            vol: trader.vol,  // Note: vol not volume!
            rank: trader.rank,
            allKeys: Object.keys(trader),
          });
          
          setLeaderboardData({
            username: trader.userName,  // userName from V1 API
            total_pnl: trader.pnl,      // pnl is all-time in V1 API
            volume: trader.vol,         // vol from V1 API
            total_trades: null,         // Not provided by V1 API
            roi: null,                  // Will calculate from pnl/vol
          });
          
          // Update trader data with V1 API stats (most accurate)
          setTraderData(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              displayName: trader.userName || prev.displayName,
              pnl: trader.pnl ?? prev.pnl,
              volume: trader.vol ?? prev.volume,
            };
          });
        } else {
          console.log('⚠️ No V1 leaderboard data found for this wallet (empty array)');
        }
      } catch (err) {
        console.error('❌ Error fetching V1 leaderboard data:', err);
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
        const positionsList: Position[] = [];
        
        positionsData?.forEach((position: any) => {
          // Try ALL possible identifier fields and add them to the set
          // This ensures we catch trades regardless of which ID field they use
          const identifiers = [
            position.conditionId,
            position.condition_id,
            position.asset,
            position.assetId,
            position.asset_id,
            position.marketId,
            position.market_id,
            position.id,
          ].filter(Boolean); // Remove null/undefined
          
          // IMPORTANT: Normalize to lowercase for case-insensitive matching
          // Add all possible identifiers to maximize match rate
          identifiers.forEach(id => {
            if (id && typeof id === 'string') {
              openIds.add(id.toLowerCase());
            }
          });
          
          // Store full position data for URL construction
          const conditionId = position.conditionId || position.condition_id || position.asset || position.marketId || '';
          positionsList.push({
            conditionId: conditionId,
            asset: position.asset,
            eventSlug: position.eventSlug || position.event_slug || position.slug || '',
            slug: position.slug || position.market_slug || '',
            title: position.title || position.market,
            outcome: position.outcome,
            size: position.size,
          });
        });
        
        console.log('📈 Open market IDs extracted:', openIds.size);
        console.log('📈 Open market IDs sample:', Array.from(openIds).slice(0, 5));
        console.log('📈 Sample position data:', positionsList[0]);
        
        setOpenMarketIds(openIds);
        setPositions(positionsList);
        
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
        // IMPORTANT: Normalize wallet to lowercase for consistent database queries
        const normalizedWallet = wallet.toLowerCase();
        
        const { data, error } = await supabase
          .from('follows')
          .select('id')
          .eq('user_id', user.id)
          .eq('trader_wallet', normalizedWallet)
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
          console.log('🔄 First trade keys:', Object.keys(tradesData[0]));
        }

        // Format trades for display
        const formattedTrades: Trade[] = tradesData.map((trade: any, index: number) => {
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
          
          // Get trade's market identifier - try ALL possible fields
          const tradeIdentifiers = [
            trade.conditionId,
            trade.condition_id,
            trade.asset_id,
            trade.assetId,
            trade.asset,
            trade.marketId,
            trade.market_id,
            trade.id,
          ].filter(Boolean); // Remove null/undefined
          
          // Determine trade status:
          // - If trade is marked bonded -> "Bonded"
          // - If positions API returned data AND any trade ID matches -> "Open"
          // - If positions API returned data AND no trade IDs match -> "Trader Closed"
          // - If positions API returned empty -> Default to "Open" (unreliable API)
          let status: 'Open' | 'Trader Closed' | 'Bonded' = 'Open'; // Default to Open
          
          if (trade.status === 'bonded' || trade.marketStatus === 'bonded') {
            status = 'Bonded';
          } else if (openMarketIds.size > 0) {
            // Check if ANY of the trade's identifiers match an open position
            const isInPositions = tradeIdentifiers.some(id => 
              id && typeof id === 'string' && openMarketIds.has(id.toLowerCase())
            );
            
            status = isInPositions ? 'Open' : 'Trader Closed';
            
            // Debug logging for first few trades
            if (index < 3) {
              console.log(`🔄 Trade ${index} status check:`, {
                tradeIdentifiers: tradeIdentifiers.slice(0, 3),
                isInPositions,
                status,
                openMarketIdsSize: openMarketIds.size
              });
            }
          }
          // If openMarketIds is empty, keep default "Open" status
          // (positions API may have failed or returned empty due to proxy wallet issues)
          
          // Store first identifier for other uses
          const tradeConditionId = tradeIdentifiers[0] || '';
          
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
            eventSlug: trade.eventSlug || trade.event_slug || '',
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
      // IMPORTANT: Normalize wallet to lowercase for consistent database storage
      const normalizedWallet = wallet.toLowerCase();
      
      if (following) {
        // Unfollow
        const { error: deleteError } = await supabase
          .from('follows')
          .delete()
          .eq('user_id', user.id)
          .eq('trader_wallet', normalizedWallet);

        if (deleteError) {
          throw deleteError;
        }
        setFollowing(false);
        console.log('✅ Unfollowed trader:', normalizedWallet);
      } else {
        // Follow
        const { error: insertError } = await supabase
          .from('follows')
          .insert({ user_id: user.id, trader_wallet: normalizedWallet });

        if (insertError) {
          throw insertError;
        }
        setFollowing(true);
        console.log('✅ Followed trader:', normalizedWallet);
      }
    } catch (err: any) {
      console.error('Error toggling follow:', err);
      alert(err.message || 'Failed to update follow status.');
    } finally {
      setFollowLoading(false);
    }
  };

  // Handle Mark as Copied click
  const handleMarkAsCopied = (trade: Trade) => {
    if (!user) {
      router.push('/login');
      return;
    }
    setSelectedTrade(trade);
    setModalOpen(true);
  };

  // Handle confirm copy from modal
  const handleConfirmCopy = async (entryPrice: number, amountInvested?: number) => {
    if (!selectedTrade || !user) return;

    setIsSubmitting(true);

    try {
      // Generate market ID from trade data
      const marketId = selectedTrade.conditionId || selectedTrade.marketSlug || selectedTrade.market;
      
      // Insert directly into Supabase (like follow/unfollow does)
      const { data: createdTrade, error: insertError } = await supabase
        .from('copied_trades')
        .insert({
          user_id: user.id,
          trader_wallet: wallet,
          trader_username: traderData?.displayName || wallet.slice(0, 8),
          market_id: marketId,
          market_title: selectedTrade.market,
          outcome: selectedTrade.outcome.toUpperCase(),
          price_when_copied: entryPrice,
          amount_invested: amountInvested || null,
        })
        .select()
        .single();

      if (insertError) {
        console.error('❌ Insert error:', insertError);
        throw new Error(insertError.message || 'Failed to save copied trade');
      }

      console.log('✅ Trade copied successfully:', createdTrade?.id);

      // Update local state
      const tradeKey = `${marketId}-${wallet}`;
      setCopiedTradeIds(prev => new Set([...prev, tradeKey]));

      // Close modal
      setModalOpen(false);
      setSelectedTrade(null);

      // Show success toast
      setToastMessage('Trade marked as copied!');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);

    } catch (err: any) {
      console.error('Error saving copied trade:', err);
      alert(err.message || 'Failed to save copied trade');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if a trade is already copied
  const isTradeCopied = (trade: Trade): boolean => {
    const marketId = trade.conditionId || trade.marketSlug || trade.market;
    const tradeKey = `${marketId}-${wallet}`;
    return copiedTradeIds.has(tradeKey);
  };

  // Find position for a trade (to get correct eventSlug)
  const findPositionForTrade = (trade: Trade): Position | undefined => {
    if (!trade.conditionId) return undefined;
    // IMPORTANT: Case-insensitive matching for hex conditionIds
    const tradeConditionLower = trade.conditionId.toLowerCase();
    return positions.find(p => 
      p.conditionId?.toLowerCase() === tradeConditionLower || 
      p.asset?.toLowerCase() === tradeConditionLower
    );
  };

  // Get Polymarket URL for a trade - always try to construct a URL
  const getPolymarketUrl = (trade: Trade): string => {
    // Try 1: Find matching position (has most accurate eventSlug)
    const position = findPositionForTrade(trade);
    if (position) {
      const eventSlug = position.eventSlug || position.slug;
      if (eventSlug) {
        return `https://polymarket.com/event/${eventSlug}`;
      }
    }
    
    // Try 2: Use trade's own slug/eventSlug data
    if (trade.eventSlug) {
      return `https://polymarket.com/event/${trade.eventSlug}`;
    }
    if (trade.marketSlug) {
      return `https://polymarket.com/event/${trade.marketSlug}`;
    }
    
    // Try 3: Fallback to search URL using market title
    return `https://polymarket.com/search?q=${encodeURIComponent(trade.market)}`;
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
    if (value === null || value === undefined) {
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
    if (value === null || value === undefined) {
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

  // Format trades count - returns "--" if no data, or "100+" if we've hit the load limit
  const formatTradesCount = (count: number | null | undefined, showPlus: boolean = false): string => {
    if (count === null || count === undefined) {
      // If we have loaded trades but no official count, show loaded count with "+"
      if (showPlus && trades.length > 0) {
        return `${trades.length}+`;
      }
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
  // Only show trades count if we have it from leaderboard data (reliable source)
  // If we only have loaded trades, show that count with "+" to indicate there are more
  const tradesCount = traderData.tradesCount ?? leaderboardData?.total_trades ?? null;
  const hasMoreTrades = !tradesCount && trades.length >= 100; // API default limit is 100

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
          {/* Mobile: Avatar + Name + Follow Button (single row with button right-aligned) */}
          <div className="md:hidden mb-6">
            <div className="flex items-start justify-between gap-3 mb-3">
              {/* Left side: Avatar + Name */}
              <div className="flex items-start gap-3 min-w-0 flex-1">
                {/* Avatar */}
                <div
                  className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 ring-2 ring-white shadow-sm"
                  style={{ backgroundColor: avatarColor }}
                >
                  {initials}
                </div>
                
                {/* Name and Wallet */}
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl font-bold text-slate-900 truncate">
                    {displayName}
                  </h1>
                </div>
              </div>

              {/* Right side: Follow Button */}
              <button
                onClick={handleFollowToggle}
                disabled={followLoading || checkingFollow}
                className={`rounded-lg px-4 py-2 text-xs font-bold transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed border-b-4 active:border-b-0 active:translate-y-1 flex-shrink-0 ${
                  following
                    ? 'bg-slate-200 text-slate-700 hover:bg-slate-300 border-slate-400'
                    : 'bg-[#FDB022] hover:bg-[#F59E0B] text-slate-900 border-[#D97706]'
                }`}
              >
                {checkingFollow || followLoading ? (
                  <span className="flex items-center justify-center gap-1">
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
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
                  </span>
                ) : following ? (
                  '✓ Following'
                ) : (
                  '+ Follow'
                )}
              </button>
            </div>
            
            {/* Wallet address and copy button (second row) */}
            <div className="flex items-center gap-2 pl-15 mb-1">
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
            
            {/* Follower count (third row) */}
            <p className="text-sm text-slate-500 pl-15">
              {traderData.followerCount.toLocaleString()} {traderData.followerCount === 1 ? 'follower' : 'followers'} on Polycopy
            </p>
          </div>

          {/* Desktop: Avatar + Name + Follow Button (original layout) */}
          <div className="hidden md:flex flex-row items-center justify-between gap-6 mb-6">
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
                {formatTradesCount(tradesCount, hasMoreTrades)}
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
                  {formatTradesCount(tradesCount, hasMoreTrades)}
                </div>
              </div>
            </div>
          </div>
          
          {/* Stats availability explanation */}
          {(traderData.pnl === null || traderData.pnl === undefined || !leaderboardData) && (
            <p className="text-xs text-slate-500 mt-3 text-center md:text-left">
              ℹ️ Stats unavailable - This trader is not on Polymarket's leaderboard
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
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Size</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Avg Price</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {trades.map((trade, index) => {
                      const polymarketUrl = getPolymarketUrl(trade);
                      const isAlreadyCopied = isTradeCopied(trade);

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
                          
                          <td className="py-4 px-4 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                              trade.status === 'Open'
                                ? 'bg-emerald-100 text-emerald-700'
                                : trade.status === 'Bonded'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {trade.status}
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
                          
                          <td className="py-4 px-4">
                            <div className="flex items-center justify-center gap-2">
                              {/* Copy Trade - always show link to Polymarket */}
                              {polymarketUrl && (
                                <a
                                  href={polymarketUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-3 py-1 bg-[#FDB022] hover:bg-[#F59E0B] text-slate-900 text-xs font-bold rounded-full cursor-pointer transition-colors"
                                >
                                  Copy
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </a>
                              )}
                              
                              {/* Mark as Copied - available for ALL trades */}
                              <button
                                onClick={() => handleMarkAsCopied(trade)}
                                disabled={isAlreadyCopied}
                                className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-full transition-colors ${
                                  isAlreadyCopied
                                    ? 'bg-emerald-100 text-emerald-700 cursor-default'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer'
                                }`}
                              >
                                {isAlreadyCopied ? (
                                  <>
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                    </svg>
                                    Copied
                                  </>
                                ) : (
                                  'Mark Copied'
                                )}
                              </button>
                            </div>
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
                const polymarketUrl = getPolymarketUrl(trade);
                const isAlreadyCopied = isTradeCopied(trade);

                return (
                  <div key={`${trade.timestamp}-${index}`} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                    {/* Header: Date + Status + Outcome Badge */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-500">{trade.formattedDate}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                          trade.status === 'Open'
                            ? 'bg-emerald-100 text-emerald-700'
                            : trade.status === 'Bonded'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {trade.status}
                        </span>
                      </div>
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
                    
                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      {/* Copy Trade - always show link to Polymarket */}
                      <a
                        href={polymarketUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#FDB022] hover:bg-[#F59E0B] text-slate-900 text-sm font-bold rounded-full cursor-pointer transition-colors"
                      >
                        <span>Copy Trade</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                      
                      {/* Mark as Copied - available for ALL trades */}
                      <button
                        onClick={() => handleMarkAsCopied(trade)}
                        disabled={isAlreadyCopied}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-full transition-colors ${
                          isAlreadyCopied
                            ? 'bg-emerald-100 text-emerald-700 cursor-default'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer'
                        }`}
                      >
                        {isAlreadyCopied ? (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                            <span>Copied</span>
                          </>
                        ) : (
                          <span>Mark as Copied</span>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      
      {/* Copy Trade Modal */}
      <CopyTradeModal
        isOpen={modalOpen}
        trade={selectedTrade}
        traderWallet={wallet}
        traderName={traderData?.displayName || wallet.slice(0, 8)}
        onClose={() => {
          setModalOpen(false);
          setSelectedTrade(null);
        }}
        onConfirm={handleConfirmCopy}
        isSubmitting={isSubmitting}
      />
      
      {/* Success Toast */}
      {showToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-neutral-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
            <svg className="w-5 h-5 text-[#10B981]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
