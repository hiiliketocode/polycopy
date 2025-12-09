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
  avgPrice?: number;
  curPrice?: number;
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
  const [positionsLoaded, setPositionsLoaded] = useState(false); // Track if positions have been fetched
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
            total_trades: undefined,    // Not provided by V1 API
            roi: undefined,             // Will calculate from pnl/vol
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

    // Reset positions loaded state when wallet changes
    setPositionsLoaded(false);

    const fetchPositions = async () => {
      console.log('📈 Fetching ALL positions with pagination...');
      
      try {
        let allPositions: any[] = [];
        let offset = 0;
        const limit = 500; // API seems to cap at 500 per request
        let hasMore = true;
        
        // Fetch positions in batches until we get all of them
        while (hasMore) {
          const apiUrl = `https://data-api.polymarket.com/positions?user=${wallet}&limit=${limit}&offset=${offset}`;
          console.log(`📈 Fetching positions batch: offset=${offset}, limit=${limit}`);
          
          const response = await fetch(apiUrl);
          
          if (!response.ok) {
            console.log('⚠️ Positions request failed:', response.status);
            break;
          }

          const positionsData = await response.json();
          const batchSize = positionsData?.length || 0;
          
          console.log(`📈 Batch received: ${batchSize} positions`);
          
          if (batchSize > 0) {
            allPositions = allPositions.concat(positionsData);
            offset += batchSize;
            
            // If we got fewer positions than the limit, we've reached the end
            hasMore = batchSize === limit;
          } else {
            hasMore = false;
          }
        }
        
        console.log('📈 TOTAL positions fetched:', allPositions.length);
        const positionsData = allPositions;
        
        // 🏀 NBA DIAGNOSTIC: Check if raw response contains NBA positions
        if (positionsData && positionsData.length > 0) {
          const nbaPositions = positionsData.filter((p: any) => 
            p.title?.toLowerCase().includes('nba') ||
            p.title?.toLowerCase().includes('magic') ||
            p.title?.toLowerCase().includes('heat') ||
            p.market?.toLowerCase().includes('nba')
          );
          console.log('🏀 NBA positions in raw API response:', nbaPositions.length);
          if (nbaPositions.length > 0) {
            console.log('🏀 NBA position examples (raw):', nbaPositions.slice(0, 3).map((p: any) => ({
              title: p.title,
              slug: p.slug,
              market_slug: p.market_slug,
              outcome: p.outcome,
              conditionId: p.conditionId
            })));
          }
        }
        
        // Build Set of open position keys for matching
        // Use slug:outcome as primary (most reliable), with ID fallbacks
        const openPositionKeys = new Set<string>();
        const positionsList: Position[] = [];
        
        positionsData?.forEach((position: any) => {
          // PRIMARY: slug + outcome (most reliable matching method)
          const posSlug = position.slug || position.market_slug || '';
          const posOutcome = position.outcome || '';
          if (posSlug && posOutcome) {
            openPositionKeys.add(`${posSlug.toLowerCase()}:${posOutcome.toLowerCase()}`);
          }
          
          // FALLBACK: Add ID-based identifiers for positions without slug
          const identifiers = [
            position.conditionId,
            position.condition_id,
            position.asset,
            position.assetId,
            position.asset_id,
            position.marketId,
            position.market_id,
            position.id,
          ].filter(Boolean);
          
          identifiers.forEach(id => {
            if (id && typeof id === 'string') {
              openPositionKeys.add(id.toLowerCase());
            }
          });
          
          // Store full position data for URL construction AND price data
          const conditionId = position.conditionId || position.condition_id || position.asset || position.marketId || '';
          positionsList.push({
            conditionId: conditionId,
            asset: position.asset,
            eventSlug: position.eventSlug || position.event_slug || position.slug || '',
            slug: posSlug,
            title: position.title || position.market,
            outcome: posOutcome,
            size: position.size,
            avgPrice: position.avgPrice ? parseFloat(position.avgPrice) : undefined,
            curPrice: position.curPrice || position.currentPrice ? parseFloat(position.curPrice || position.currentPrice) : undefined,
          });
        });
        
        console.log('📈 Open position keys:', openPositionKeys.size);
        console.log('🔍 DIAGNOSTIC: Sample position keys (first 10):', [...openPositionKeys].slice(0, 10));
        
        // Log position price data availability
        const positionsWithPrice = positionsList.filter(p => p.curPrice).length;
        console.log('💰 Position price data:', {
          totalPositions: positionsList.length,
          withCurPrice: positionsWithPrice,
          withoutCurPrice: positionsList.length - positionsWithPrice,
          coverage: ((positionsWithPrice / positionsList.length) * 100).toFixed(1) + '%'
        });
        
        // Sample of positions with price data
        const sampleWithPrice = positionsList
          .filter(p => p.curPrice)
          .slice(0, 3)
          .map(p => ({
            title: p.title?.substring(0, 30),
            outcome: p.outcome,
            avgPrice: p.avgPrice,
            curPrice: p.curPrice
          }));
        if (sampleWithPrice.length > 0) {
          console.log('💰 Sample positions with curPrice:', sampleWithPrice);
        }
        
        // 🏀 NBA/TODAY DIAGNOSTIC: Check if current NBA/today positions exist
        const nbaKeys = [...openPositionKeys].filter(key => 
          key.includes('nba') || key.includes('magic') || key.includes('heat') || key.includes('2025-12-05')
        );
        console.log('🏀 NBA/Today position keys found:', nbaKeys.length);
        console.log('🏀 NBA/Today position keys:', nbaKeys);
        
        // Log first 10 position objects to see actual slug values
        console.log('🏀 First 10 position objects (raw):', positionsList.slice(0, 10).map(p => ({
          title: p.title,
          slug: p.slug,
          outcome: p.outcome,
          conditionId: p.conditionId?.substring(0, 20)
        })));
        
        // Also check if positions contain today's date at all
        const todayKeys = [...openPositionKeys].filter(key => key.includes('2025-12-05'));
        console.log('🏀 Positions with today\'s date (2025-12-05):', todayKeys.length, todayKeys);
        
        // 🔥 Check for all Heat vs Magic positions (moneyline + spread)
        const miaOrlKeys = [...openPositionKeys].filter(key => 
          key.includes('mia-orl') || key.includes('magic') || key.includes('heat')
        );
        console.log('🔥 All Heat vs Magic position keys:', miaOrlKeys.length);
        console.log('🔥 Heat vs Magic keys LIST:', JSON.stringify(miaOrlKeys, null, 2));
        
        // 📊 Check for all spread positions
        const spreadKeys = [...openPositionKeys].filter(key => key.includes('spread'));
        console.log('📊 All spread position keys:', spreadKeys.length);
        if (spreadKeys.length > 0) {
          console.log('📊 Spread position examples LIST:', JSON.stringify(spreadKeys.slice(0, 20), null, 2));
        }
        
        setOpenMarketIds(openPositionKeys);
        setPositions(positionsList);
        setPositionsLoaded(true); // Mark positions as loaded
        
      } catch (err) {
        console.error('❌ Error fetching positions:', err);
        setPositionsLoaded(true); // Mark as loaded even on error so trades can proceed
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
  // IMPORTANT: Only fetch after positions are loaded to avoid race condition
  useEffect(() => {
    if (!wallet) return;
    if (!positionsLoaded) {
      console.log('⏳ Waiting for positions to load before formatting trades...');
      return;
    }

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
        console.log('🔄 TOTAL trades fetched:', tradesData?.length || 0);
        console.log('🔍 DIAGNOSTIC: openMarketIds size when formatting trades:', openMarketIds.size);
        console.log('🔍 DIAGNOSTIC: openMarketIds sample:', [...openMarketIds].slice(0, 5));

        // Batch fetch prices for unique markets using our API proxy (avoids CORS)
        // Store cache as Map<conditionId, {prices: number[], outcomes: string[]}>
        const marketPriceCache = new Map<string, { prices: number[]; outcomes: string[] }>();
        const uniqueConditionIds = new Set<string>();
        
        // Collect unique condition IDs
        tradesData.forEach((trade: any) => {
          const conditionId = trade.conditionId || trade.condition_id || trade.asset || trade.marketId || '';
          if (conditionId) {
            uniqueConditionIds.add(conditionId);
          }
        });

        // Fetch prices via CLOB API (returns actual outcome names like "PARIVISION", "3DMAX")
        console.log('📊 Fetching current prices for', uniqueConditionIds.size, 'unique markets via CLOB API...');
        
        try {
          const conditionIdsArray = Array.from(uniqueConditionIds);
          
          // Fetch all markets in parallel using CLOB API
          const fetchPromises = conditionIdsArray.map(async (conditionId) => {
            try {
              const response = await fetch(`https://clob.polymarket.com/markets/${conditionId}`);
              
              if (response.ok) {
                const market = await response.json();
                
                // CLOB returns tokens array with actual outcome names
                if (market.tokens && Array.isArray(market.tokens)) {
                  const outcomes = market.tokens.map((t: any) => t.outcome);
                  const prices = market.tokens.map((t: any) => parseFloat(t.price));
                  
                  return {
                    conditionId,
                    outcomes,
                    prices
                  };
                }
              }
              return null;
            } catch (err) {
              console.error('Error fetching market:', conditionId.substring(0, 12), err);
              return null;
            }
          });
          
          const results = await Promise.all(fetchPromises);
          
          // Populate cache with successful results
          let successCount = 0;
          results.forEach((result) => {
            if (result) {
              marketPriceCache.set(result.conditionId.toLowerCase(), {
                prices: result.prices,
                outcomes: result.outcomes
              });
              successCount++;
              
              // Debug: Log for first market to show structure
              if (marketPriceCache.size <= 3) {
                console.log('🔍 Cache entry example (CLOB):', {
                  conditionId: result.conditionId.substring(0, 12) + '...',
                  outcomes: result.outcomes,
                  prices: result.prices
                });
              }
            }
          });
          
          console.log(`📊 Successfully cached ${successCount} out of ${conditionIdsArray.length} markets from CLOB`);
          
          // Calculate total outcome prices
          const totalOutcomes = Array.from(marketPriceCache.values()).reduce((sum, data) => sum + data.outcomes.length, 0);
          console.log('📊 Total outcome prices available:', totalOutcomes);
        } catch (err) {
          console.error('📊 Error fetching CLOB prices:', err);
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
          
          // Determine trade status using slug matching (without outcome to catch both sides)
          let status: 'Open' | 'Trader Closed' | 'Bonded' = 'Open'; // Default to Open
          
          if (trade.status === 'bonded' || trade.marketStatus === 'bonded') {
            status = 'Bonded';
          } else if (openMarketIds.size > 0) {
            const tradeSlug = trade.slug || trade.market_slug || '';
            const tradeOutcome = trade.outcome || '';
            const tradeSlugKey = tradeSlug && tradeOutcome 
              ? `${tradeSlug.toLowerCase()}:${tradeOutcome.toLowerCase()}`
              : null;
            
            let isOpen = false;
            let matchMethod = 'none';
            
            // PRIMARY: Try slug:outcome match
            if (tradeSlugKey && openMarketIds.has(tradeSlugKey)) {
              isOpen = true;
              matchMethod = 'slug:outcome';
            } 
            // SECONDARY: Try slug-only match (catches opposite side of same market)
            else if (tradeSlug) {
              const slugOnlyMatch = Array.from(openMarketIds).some(key => 
                key.startsWith(tradeSlug.toLowerCase() + ':')
              );
              if (slugOnlyMatch) {
                isOpen = true;
                matchMethod = 'slug-only';
              }
            }
            
            // FALLBACK: Try ID-based matching
            if (!isOpen) {
              const tradeIdentifiers = [
                trade.conditionId,
                trade.condition_id,
                trade.asset,
                trade.assetId,
                trade.asset_id,
                trade.marketId,
                trade.market_id,
                trade.id,
              ].filter(Boolean);
              
              isOpen = tradeIdentifiers.some(id => 
                id && typeof id === 'string' && openMarketIds.has(id.toLowerCase())
              );
              
              if (isOpen) {
                matchMethod = 'id-based';
              }
            }
            
            status = isOpen ? 'Open' : 'Trader Closed';
            // 🎯 SPREAD MAGIC TRADE: Special logging for spread Magic trades
            if ((trade.title?.toLowerCase().includes('spread') && 
                 (trade.title?.toLowerCase().includes('magic') || trade.outcome?.toLowerCase().includes('magic'))) ||
                (trade.slug?.includes('spread') && trade.slug?.includes('mia-orl'))) {
              console.log('🎯 SPREAD MAGIC TRADE:', {
                tradeTitle: trade.title?.substring(0, 60),
                tradeSlug: trade.slug,
                tradeOutcome: trade.outcome,
                slugKey: tradeSlugKey,
                searchingFor: tradeSlug ? tradeSlug + ':' : 'N/A',
                matchingPositionKeys: [...openMarketIds].filter(k => k.includes(tradeSlug || 'NO_SLUG')),
                matchMethod: matchMethod,
                status: status
              });
            }
            
            // 🔍 DIAGNOSTIC: Log first few trades with detailed matching info
            if (index < 5) {
              console.log('🔍 DIAGNOSTIC: Trade', index, {
                title: trade.title?.substring(0, 50),
                slug: tradeSlug,
                outcome: tradeOutcome,
                slugKey: tradeSlugKey,
                conditionId: trade.conditionId?.substring(0, 20),
                asset: trade.asset?.substring(0, 20),
                matchMethod: matchMethod,
                isOpen: isOpen,
                status: status,
                setSize: openMarketIds.size
              });
              
              // Show if slug exists in any form
              if (tradeSlug) {
                const slugMatches = Array.from(openMarketIds)
                  .filter(key => key.includes(tradeSlug.toLowerCase()))
                  .slice(0, 3);
                if (slugMatches.length > 0) {
                  console.log('  └─ Slug found in position keys:', slugMatches);
                } else {
                  console.log('  └─ Slug NOT found in any position keys');
                }
              }
            }
          }
          
          // Store first identifier for other uses
          const tradeConditionId = trade.conditionId || trade.condition_id || trade.asset || trade.marketId || '';
          
          // Find matching position to get current price for ROI calculation
          let matchingPosition = null;
          if (status === 'Open') {
            // Try to find position by slug:outcome
            const tradeSlug = trade.slug || trade.market_slug || '';
            const tradeOutcome = trade.outcome || '';
            
            if (tradeSlug && tradeOutcome) {
              matchingPosition = positions.find(pos => 
                pos.slug?.toLowerCase() === tradeSlug.toLowerCase() &&
                pos.outcome?.toLowerCase() === tradeOutcome.toLowerCase()
              );
            }
            
            // Fallback: Find by conditionId
            if (!matchingPosition && tradeConditionId) {
              matchingPosition = positions.find(pos => 
                pos.conditionId?.toLowerCase() === tradeConditionId.toLowerCase()
              );
            }
          }
          
          // Determine current price: try position data first, then cache
          let currentPrice: number | undefined;
          let priceSource = 'none';
          
          if (matchingPosition?.curPrice !== undefined && matchingPosition?.curPrice !== null) {
            currentPrice = matchingPosition.curPrice;
            priceSource = 'position';
          } else if (trade.currentPrice !== undefined && trade.currentPrice !== null) {
            currentPrice = parseFloat(trade.currentPrice);
            priceSource = 'trade-data';
          } else {
            // Try to get from cache using conditionId
            const cachedMarket = marketPriceCache.get(tradeConditionId?.toLowerCase() || '');
            
            if (cachedMarket) {
              // For binary markets (2 outcomes), match by position
              // Gamma returns ["Yes", "No"] but trades have actual names
              // We need to determine which outcome index this trade represents
              
              // Try to match by outcome name first (case-insensitive)
              const outcomeIndex = cachedMarket.outcomes.findIndex((o: string) => 
                o.toLowerCase() === trade.outcome?.toLowerCase()
              );
              
              if (outcomeIndex >= 0 && cachedMarket.prices[outcomeIndex] !== undefined) {
                currentPrice = cachedMarket.prices[outcomeIndex];
                priceSource = 'clob-cache';
                console.log(`✅ Matched by outcome name: ${trade.outcome} → index ${outcomeIndex} → price ${currentPrice}`);
              } else if (cachedMarket.prices.length === 2) {
                // Binary market fallback: if we can't match by name, 
                // we can't reliably determine which outcome without more data
                // Log this case for debugging
                console.log(`⚠️ Binary market: couldn't match "${trade.outcome}" to outcomes [${cachedMarket.outcomes.join(', ')}]`);
              }
            }
            
            // Debug logging for first 5 trades without price
            if ((currentPrice === undefined || currentPrice === null) && index < 5) {
              const cachedForCondition = marketPriceCache.get(tradeConditionId?.toLowerCase() || '');
              
              console.log(`❌ Trade ${index} missing price:`, {
                market: trade.title?.substring(0, 30),
                tradeOutcome: trade.outcome,
                conditionId: tradeConditionId?.substring(0, 12),
                cacheHasCondition: !!cachedForCondition,
                cachedOutcomes: cachedForCondition?.outcomes,
                cachedPrices: cachedForCondition?.prices,
                cacheSize: marketPriceCache.size
              });
            }
          }
          
          // MARKET RESOLUTION DETECTION: Check if market has resolved based on price
          // If current price is $1 or $0, the market has resolved regardless of position status
          if (currentPrice !== undefined && currentPrice !== null && status !== 'Bonded') {
            if (currentPrice >= 0.99) {
              // Market resolved in favor of this outcome
              status = 'Trader Closed';
            } else if (currentPrice <= 0.01) {
              // Market resolved against this outcome
              status = 'Trader Closed';
            }
          }
          
          return {
            timestamp: trade.timestamp,
            market: trade.title || trade.market?.title || trade.marketTitle || 'Unknown Market',
            side: trade.side || 'BUY',
            outcome: trade.outcome || trade.option || '',
            size: parseFloat(trade.size || 0),
            price: parseFloat(trade.price || 0),
            avgPrice: matchingPosition?.avgPrice || trade.avgPrice ? parseFloat(trade.avgPrice || matchingPosition?.avgPrice || 0) : undefined,
            currentPrice: currentPrice,
            priceSource: priceSource, // Track where price came from
            formattedDate: formattedDate,
            marketSlug: trade.slug || trade.market?.slug || trade.marketSlug || '',
            eventSlug: trade.eventSlug || trade.event_slug || '',
            conditionId: tradeConditionId,
            status: status,
          };
        });

        // Sort by timestamp descending (newest first)
        formattedTrades.sort((a, b) => b.timestamp - a.timestamp);

        // Log ROI coverage statistics with price sources
        // Note: 0 is a valid price (trade lost), so check for null/undefined explicitly
        const tradesWithPrice = formattedTrades.filter(t => t.currentPrice !== undefined && t.currentPrice !== null).length;
        const tradesWithoutPrice = formattedTrades.length - tradesWithPrice;
        
        // Break down by price source
        const priceSourceStats = {
          position: formattedTrades.filter(t => (t as any).priceSource === 'position').length,
          'clob-cache': formattedTrades.filter(t => (t as any).priceSource === 'clob-cache').length,
          'trade-data': formattedTrades.filter(t => (t as any).priceSource === 'trade-data').length,
          none: formattedTrades.filter(t => (t as any).priceSource === 'none').length
        };
        
        console.log('✅ Formatted', formattedTrades.length, 'trades for display');
        console.log('📊 ROI Coverage:', {
          withCurrentPrice: tradesWithPrice,
          withoutCurrentPrice: tradesWithoutPrice,
          coveragePercent: ((tradesWithPrice / formattedTrades.length) * 100).toFixed(1) + '%'
        });
        console.log('📊 Price Sources:', priceSourceStats);

        setTrades(formattedTrades);
      } catch (err) {
        console.error('❌ Error fetching trades:', err);
        setTrades([]);
      } finally {
        setLoadingTrades(false);
      }
    };

    fetchTraderTrades();
  }, [wallet, positionsLoaded, openMarketIds]); // Depend on positionsLoaded to ensure proper sequencing

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
      } else {
        // Follow
        const { data: insertData, error: insertError } = await supabase
          .from('follows')
          .insert({ user_id: user.id, trader_wallet: normalizedWallet })
          .select();
        
        if (insertError) {
          throw insertError;
        }
        
        if (!insertData || insertData.length === 0) {
          throw new Error('Failed to create follow - please try again');
        }
        
        setFollowing(true);
      }
      
      // Refetch trader data to update follower count
      try {
        const response = await fetch(`/api/trader/${wallet}`);
        
        if (response.ok) {
          const data = await response.json();
          
          setTraderData(prev => {
            if (!prev) return prev;
            console.log('🔄 Previous follower count:', prev.followerCount);
            console.log('🔄 New follower count:', data.followerCount);
            return {
              ...prev,
              followerCount: data.followerCount
            };
          });
          console.log('✅ Updated follower count:', data.followerCount);
        } else {
          console.error('❌ API response not OK:', response.status);
        }
      } catch (err) {
        console.error('❌ Failed to refetch follower count:', err);
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
      
      // Log what we're about to save for debugging
      console.log('📝 Copying trade:', {
        market_title: selectedTrade.market,
        market_slug: selectedTrade.marketSlug || selectedTrade.eventSlug,
        conditionId: selectedTrade.conditionId,
        outcome: selectedTrade.outcome,
        entryPrice,
      });
      
      // Insert directly into Supabase (like follow/unfollow does)
      const { data: createdTrade, error: insertError } = await supabase
        .from('copied_trades')
        .insert({
          user_id: user.id,
          trader_wallet: wallet,
          trader_username: traderData?.displayName || wallet.slice(0, 8),
          market_id: marketId,
          market_title: selectedTrade.market,
          market_slug: selectedTrade.marketSlug || selectedTrade.eventSlug || null,
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
  // Use roi from API if available, otherwise calculate it
  const roi = traderData.roi !== null && traderData.roi !== undefined 
    ? traderData.roi.toFixed(1)
    : calculateROI(traderData.pnl, traderData.volume);
  
  // Calculate win rate: (Profitable Trades / Total Trades) × 100%
  // Only count trades where we have price data to calculate ROI
  const tradesWithROI = trades.filter(t => {
    const entryPrice = t.price;
    const currentPrice = t.currentPrice;
    return entryPrice && currentPrice !== undefined && currentPrice !== null && entryPrice !== 0;
  });
  
  const profitableTrades = tradesWithROI.filter(t => {
    const entryPrice = t.price;
    const currentPrice = t.currentPrice;
    if (entryPrice && currentPrice !== undefined && currentPrice !== null && entryPrice !== 0) {
      const tradeROI = ((currentPrice - entryPrice) / entryPrice) * 100;
      return tradeROI > 0;
    }
    return false;
  });
  
  const winRate = tradesWithROI.length > 0 
    ? ((profitableTrades.length / tradesWithROI.length) * 100).toFixed(1)
    : '--';
  
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

          {/* Stats Grid - Desktop: 5 separate cards, Mobile: Combined card */}
          <div className="hidden md:grid grid-cols-5 gap-3">
            {/* Desktop Stat Cards */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">P&L</div>
              <div className={`text-xl font-bold ${
                traderData.pnl > 0 ? 'text-emerald-600' : traderData.pnl < 0 ? 'text-red-500' : 'text-slate-900'
              }`}>
                {formatPnL(traderData.pnl)}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">ROI</div>
              <div className={`text-xl font-bold ${
                roi !== '--' && parseFloat(String(roi)) > 0 ? 'text-emerald-600' : 
                roi !== '--' && parseFloat(String(roi)) < 0 ? 'text-red-500' : 'text-slate-900'
              }`}>
                {roi !== '--' ? `${roi}%` : '--'}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">WIN RATE</div>
              <div className={`text-xl font-bold ${
                winRate !== '--' && parseFloat(String(winRate)) >= 50 ? 'text-emerald-600' : 
                winRate !== '--' && parseFloat(String(winRate)) < 50 ? 'text-slate-600' : 'text-slate-900'
              }`}>
                {winRate !== '--' ? `${winRate}%` : '--'}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">VOLUME</div>
              <div className="text-xl font-bold text-slate-900">
                {formatVolume(traderData.volume)}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">TRADES</div>
              <div className="text-xl font-bold text-slate-900">
                {formatTradesCount(tradesCount, hasMoreTrades)}
              </div>
            </div>
          </div>

          {/* Mobile: Combined stat card - 5 columns in one card */}
          <div className="md:hidden bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
            <div className="grid grid-cols-5 gap-1 text-center">
              <div>
                <div className="text-[10px] text-slate-500 uppercase mb-1">P&L</div>
                <div className={`text-xs font-bold ${
                  traderData.pnl > 0 ? 'text-emerald-600' : traderData.pnl < 0 ? 'text-red-500' : 'text-slate-900'
                }`}>
                  {formatPnL(traderData.pnl)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase mb-1">ROI</div>
                <div className={`text-xs font-bold ${
                  roi !== '--' && parseFloat(String(roi)) > 0 ? 'text-emerald-600' : 
                  roi !== '--' && parseFloat(String(roi)) < 0 ? 'text-red-500' : 'text-slate-900'
                }`}>
                  {roi !== '--' ? `${roi}%` : '--'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase mb-1">Win</div>
                <div className={`text-xs font-bold ${
                  winRate !== '--' && parseFloat(String(winRate)) >= 50 ? 'text-emerald-600' : 
                  winRate !== '--' && parseFloat(String(winRate)) < 50 ? 'text-slate-600' : 'text-slate-900'
                }`}>
                  {winRate !== '--' ? `${winRate}%` : '--'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase mb-1">Vol</div>
                <div className="text-xs font-bold text-slate-900">
                  {formatVolume(traderData.volume)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase mb-1">Trades</div>
                <div className="text-xs font-bold text-slate-900">
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
                <table className="w-full min-w-[700px]">
                  <thead className="bg-slate-50 border-b-2 border-slate-200">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider w-[90px]">Date</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Market</th>
                      <th className="px-2 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider w-[80px]">Outcome</th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider w-[85px]">Status</th>
                      <th className="px-3 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider w-[70px]">Size</th>
                      <th className="px-3 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider w-[60px]">Price</th>
                      <th className="px-3 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider w-[65px]">ROI</th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider w-[100px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {trades.map((trade, index) => {
                      const polymarketUrl = getPolymarketUrl(trade);
                      const isAlreadyCopied = isTradeCopied(trade);
                      
                      // Calculate ROI
                      // For ROI calculation, use:
                      // - Entry price: trade.price (the actual trade execution price)
                      // - Current price: trade.currentPrice (from position or Gamma API)
                      let roi: number | null = null;
                      const entryPrice = trade.price; // This is the actual trade price
                      const currentPrice = trade.currentPrice;
                      
                      // Calculate ROI if we have both prices (0 is valid for currentPrice)
                      if ((entryPrice !== undefined && entryPrice !== null && entryPrice !== 0) && 
                          (currentPrice !== undefined && currentPrice !== null)) {
                        roi = ((currentPrice - entryPrice) / entryPrice) * 100;
                      }
                      
                      // Enhanced debug logging for first 5 trades to diagnose ROI issues
                      if (index < 5) {
                        console.log(`Trade ${index}: "${trade.market.substring(0, 35)}..."`, {
                          outcome: trade.outcome,
                          status: trade.status,
                          entryPrice: trade.price,
                          avgPrice: trade.avgPrice,
                          currentPrice: trade.currentPrice,
                          conditionId: trade.conditionId?.substring(0, 12) + '...',
                          roi: roi !== null ? `${roi.toFixed(1)}%` : 'NULL - missing currentPrice',
                          hasCurrentPrice: trade.currentPrice !== undefined && trade.currentPrice !== null,
                          roiCalculated: roi !== null,
                          entryPriceValid: entryPrice !== undefined && entryPrice !== null && entryPrice !== 0
                        });
                      }

                      return (
                        <tr 
                          key={`${trade.timestamp}-${index}`}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="text-sm text-slate-500">{trade.formattedDate}</span>
                              <span className="text-xs text-slate-400">
                                {new Date(trade.timestamp).toLocaleTimeString('en-US', { 
                                  hour: 'numeric', 
                                  minute: '2-digit',
                                  hour12: true 
                                })}
                              </span>
                            </div>
                          </td>
                          
                          <td className="py-3 px-3 max-w-[220px]">
                            <span className="text-sm text-slate-900 font-medium break-words leading-snug">{trade.market}</span>
                          </td>
                          
                          <td className="py-3 pl-3 pr-2">
                            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full uppercase truncate max-w-[70px] ${
                              ['yes', 'up', 'over'].includes(trade.outcome.toLowerCase())
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {trade.outcome}
                            </span>
                          </td>
                          
                          <td className="py-3 px-3 text-center whitespace-nowrap">
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
                          
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <span className="text-sm font-semibold text-slate-900">
                              ${trade.size.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                          </td>
                          
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <span className="text-sm font-semibold text-slate-900">
                              ${trade.price.toFixed(2)}
                            </span>
                          </td>
                          
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <span className={`text-sm font-semibold ${
                              roi === null ? 'text-slate-400' :
                              roi > 0 ? 'text-green-600' :
                              roi < 0 ? 'text-red-600' :
                              'text-slate-500'
                            }`}>
                              {roi === null ? '--' : `${roi > 0 ? '+' : ''}${roi.toFixed(1)}%`}
                            </span>
                          </td>
                          
                          <td className="py-3 px-3">
                            <div className="flex flex-col gap-1">
                              {/* Copy Trade button - opens Polymarket */}
                              <a
                                href={polymarketUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap text-center bg-[#FDB022] text-white hover:bg-[#E69E1A]"
                              >
                                Copy Trade
                              </a>
                              
                              {/* Mark as Copied button */}
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleMarkAsCopied(trade);
                                }}
                                disabled={isAlreadyCopied}
                                className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                                  isAlreadyCopied
                                    ? 'bg-emerald-100 text-emerald-700 cursor-default'
                                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer'
                                }`}
                                title={isAlreadyCopied ? "Already marked as copied" : "Mark as Copied"}
                              >
                                {isAlreadyCopied ? '✓ Copied' : 'Mark as Copied'}
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
                
                // Calculate ROI - same logic as desktop
                let roi: number | null = null;
                const entryPrice = trade.price;
                const currentPrice = trade.currentPrice;
                
                // Calculate ROI if we have both prices (0 is valid for currentPrice)
                if ((entryPrice !== undefined && entryPrice !== null && entryPrice !== 0) && 
                    (currentPrice !== undefined && currentPrice !== null)) {
                  roi = ((currentPrice - entryPrice) / entryPrice) * 100;
                }

                return (
                  <div key={`${trade.timestamp}-${index}`} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                    {/* Header: Date + Status + Outcome Badge */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <span className="text-sm text-slate-500">{trade.formattedDate}</span>
                          <span className="text-xs text-slate-400">
                            {new Date(trade.timestamp).toLocaleTimeString('en-US', { 
                              hour: 'numeric', 
                              minute: '2-digit',
                              hour12: true 
                            })}
                          </span>
                        </div>
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
                      <div className="grid grid-cols-4 gap-3 text-center">
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
                          <div className="text-xs text-slate-500 mb-1">ROI</div>
                          <div className={`font-semibold text-sm ${
                            roi === null ? 'text-slate-400' :
                            roi > 0 ? 'text-green-600' :
                            roi < 0 ? 'text-red-600' :
                            'text-slate-500'
                          }`}>
                            {roi === null ? '--' : `${roi > 0 ? '+' : ''}${roi.toFixed(1)}%`}
                          </div>
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
