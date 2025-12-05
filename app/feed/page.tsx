'use client';

import { useState, useEffect, useCallback } from 'react';
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
    id?: string;
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
  marketId?: string;
  side: string;
  type: 'buy' | 'sell';
  price: number;
  size: number;
  timestamp: number;
  isCopied: boolean;
  onCopyTrade: () => void;
  onMarkAsCopied: () => void;
}

interface CopiedTrade {
  id: string;
  market_id: string;
  trader_wallet: string;
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
  marketId,
  side,
  type,
  price,
  size,
  timestamp,
  isCopied,
  onCopyTrade,
  onMarkAsCopied,
}: TradeCardProps) {
  const timeAgo = getRelativeTime(timestamp);
  const isYes = ['yes', 'up', 'over'].includes(side.toLowerCase());
  const isBuy = type === 'buy';
  const total = price * size;

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm hover:shadow-md transition-all w-full max-w-full overflow-hidden">
      <div className="p-4 w-full">
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
          <div className="flex items-center gap-2">
            {/* Warning for SELL trades - trader is exiting their position */}
            {!isBuy && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Exiting
              </span>
            )}
            <div className="flex items-center gap-1.5 text-xs text-neutral-500">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{timeAgo}</span>
            </div>
          </div>
        </div>

        {/* Market question */}
        <div className="mb-3 w-full">
          <p className="text-neutral-900 leading-snug mb-2 break-words">{market}</p>
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
        
        {/* Buttons */}
        <div className="flex gap-2">
          {/* Copy Trade button - opens Polymarket */}
          <button
            onClick={onCopyTrade}
            className="flex-1 bg-[#FDB022] hover:bg-[#E69E1A] text-neutral-900 font-semibold py-2.5 rounded-lg transition-colors"
          >
            Copy Trade
          </button>
          
          {/* Mark as Copied button */}
          <button
            onClick={onMarkAsCopied}
            disabled={isCopied}
            className={`flex-1 py-2.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              isCopied
                ? 'bg-[#10B981] text-white font-bold cursor-not-allowed shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                : 'bg-[#FDB022] hover:bg-[#E69E1A] text-black font-semibold'
            }`}
          >
            {isCopied ? (
              <>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                </svg>
                <span className="text-base">Copied</span>
              </>
            ) : (
              <span>Mark as Copied</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Confirmation Modal Component
interface ConfirmModalProps {
  isOpen: boolean;
  trade: FeedTrade | null;
  onClose: () => void;
  onConfirm: (entryPrice: number, amountInvested?: number) => void;
  isSubmitting: boolean;
}

function ConfirmModal({ isOpen, trade, onClose, onConfirm, isSubmitting }: ConfirmModalProps) {
  const [entryPrice, setEntryPrice] = useState<string>('');
  const [amountInvested, setAmountInvested] = useState<string>('');

  // Pre-fill entry price when trade changes (in dollars)
  useEffect(() => {
    if (trade) {
      // Convert to dollars with 2 decimal places
      setEntryPrice(trade.trade.price.toFixed(2));
    }
  }, [trade]);

  if (!isOpen || !trade) return null;

  const handleConfirm = () => {
    // Entry price is already in dollars
    const price = entryPrice ? parseFloat(entryPrice) : trade.trade.price;
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
              <p className="font-medium text-neutral-900 mb-3 text-sm sm:text-base break-words">{trade.market.title}</p>
              
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-neutral-600 mb-1">Trader</p>
                  <p className="font-medium text-neutral-900 text-sm sm:text-base truncate">{trade.trader.displayName}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-neutral-600 mb-1">Position</p>
                  <p className="font-medium text-neutral-900 text-sm sm:text-base">
                    <span className={trade.trade.outcome.toUpperCase() === 'YES' ? 'text-[#10B981]' : 'text-[#EF4444]'}>
                      {trade.trade.outcome.toUpperCase()}
                    </span>
                    {' '}at {Math.round(trade.trade.price * 100)}¢
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
                The price you bought/sold at (trader's price: ${trade.trade.price.toFixed(2)})
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

// Success Toast Component
function SuccessToast({ message, isVisible }: { message: string; isVisible: boolean }) {
  if (!isVisible) return null;
  
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-neutral-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
        <svg className="w-5 h-5 text-[#10B981]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
        </svg>
        <span>{message}</span>
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

  // Copied trades state
  const [copiedTradeIds, setCopiedTradeIds] = useState<Set<string>>(new Set());
  const [loadingCopiedTrades, setLoadingCopiedTrades] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<FeedTrade | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Toast state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // Manual refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // Fetch copied trades when user is available - using direct Supabase (like follow)
  useEffect(() => {
    if (!user) return;
    
    const fetchCopiedTrades = async () => {
      setLoadingCopiedTrades(true);
      try {
        // Direct Supabase query - same pattern as follow/unfollow
        const { data: trades, error } = await supabase
          .from('copied_trades')
          .select('market_id, trader_wallet')
          .eq('user_id', user.id);
        
        if (error) {
          console.error('Error fetching copied trades:', error);
          setCopiedTradeIds(new Set());
        } else {
          const copiedIds = new Set<string>(
            trades?.map((t: { market_id: string; trader_wallet: string }) => 
              `${t.market_id}-${t.trader_wallet}`
            ) || []
          );
          setCopiedTradeIds(copiedIds);
        }
      } catch (err) {
        console.error('Error fetching copied trades:', err);
        setCopiedTradeIds(new Set());
      } finally {
        setLoadingCopiedTrades(false);
      }
    };

    fetchCopiedTrades();
  }, [user]);

  // Extract fetchFeed as a stable function using useCallback
  // This prevents unnecessary re-renders and ensures it only changes when user changes
  const fetchFeed = useCallback(async () => {
    if (!user) return;
    
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
              // IMPORTANT: Prioritize conditionId for Gamma API price lookups
              id: trade.conditionId || trade.market_slug || trade.asset_id || trade.id || '',
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
  }, [user]); // Only recreate when user changes

  // Manual refresh handler
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchFeed();
    setIsRefreshing(false);
    
    // Show success toast
    setToastMessage('Feed refreshed!');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // Fetch feed data ONLY on initial mount or when user logs in/out
  // No automatic refresh on tab focus, visibility change, or any other event
  useEffect(() => {
    if (!user) return;
    
    // Only fetch if we haven't loaded trades yet (initial load)
    if (trades.length === 0 && !loadingFeed) {
      console.log('📊 Initial feed load');
      fetchFeed();
    }
  }, [user, fetchFeed, trades.length, loadingFeed]);

  // Filter trades
  const filteredTrades = trades.filter(trade => {
    if (filter === 'buys') return trade.trade.side === 'BUY';
    if (filter === 'sells') return trade.trade.side === 'SELL';
    return true;
  });

  // Copy trade handler - opens Polymarket
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

  // Mark as copied handler - opens modal
  const handleMarkAsCopied = (trade: FeedTrade) => {
    setSelectedTrade(trade);
    setModalOpen(true);
  };

  // Confirm mark as copied - using Supabase directly (like follow/unfollow)
  const handleConfirmCopy = async (entryPrice: number, amountInvested?: number) => {
    if (!selectedTrade || !user) return;

    setIsSubmitting(true);

    try {
      // Insert directly into Supabase (like follow/unfollow does)
      // This works because the client-side Supabase client already has auth
      const { data: createdTrade, error: insertError } = await supabase
        .from('copied_trades')
        .insert({
          user_id: user.id,
          trader_wallet: selectedTrade.trader.wallet,
          trader_username: selectedTrade.trader.displayName,
          market_id: selectedTrade.market.id || selectedTrade.market.slug || selectedTrade.market.title,
          market_title: selectedTrade.market.title,
          outcome: selectedTrade.trade.outcome.toUpperCase(),
          price_when_copied: entryPrice,
          amount_invested: amountInvested || null,
        })
        .select()
        .single();

      if (insertError) {
        console.error('❌ Insert error:', insertError);
        throw new Error(insertError.message || 'Failed to save copied trade');
      }

      if (!createdTrade?.id) {
        console.error('❌ No trade ID in response');
        throw new Error('Trade created but no ID returned');
      }

      console.log('✅ Trade copied successfully:', createdTrade.id);

      // Update local state
      const tradeKey = `${selectedTrade.market.id || selectedTrade.market.slug || selectedTrade.market.title}-${selectedTrade.trader.wallet}`;
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

  // Check if a trade is copied
  const isTradecopied = (trade: FeedTrade): boolean => {
    const tradeKey = `${trade.market.id || trade.market.slug || trade.market.title}-${trade.trader.wallet}`;
    return copiedTradeIds.has(tradeKey);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 pb-24 w-full max-w-full overflow-x-hidden">
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
    <div className="min-h-screen bg-slate-50 pb-24 w-full max-w-full overflow-x-hidden">
      <Header />

      {/* Main Content */}
      <div className="w-full max-w-4xl mx-auto px-4 md:px-8 py-4 md:py-6">
        {/* Page Title - Condensed */}
        <div className="mb-4">
          {/* Title and Refresh button row for mobile */}
          <div className="flex items-center justify-between md:block">
            <h1 className="text-2xl font-semibold text-neutral-900">
              <span className="md:hidden">Feed</span>
              <span className="hidden md:inline">Activity Feed</span>
            </h1>
            {/* Mobile Refresh button - matches mobile Refresh Status style */}
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing || loadingFeed}
              className="md:hidden text-sm text-[#FDB022] hover:text-[#E69E1A] font-medium flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
              aria-label="Refresh feed"
            >
              <svg 
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          {/* Desktop: Subheading with Refresh button on the same line */}
          <div className="hidden md:flex items-center justify-between mt-1">
            <p className="text-neutral-600">
              Recent trades from traders you follow
            </p>
            {/* Desktop Refresh button - matches Refresh Status button from profile page */}
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing || loadingFeed}
              className="flex items-center gap-1.5 text-sm text-[#FDB022] hover:text-[#E69E1A] font-medium disabled:opacity-50 whitespace-nowrap"
            >
              {isRefreshing ? (
                <>
                  <svg className={`w-4 h-4 animate-spin`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Refreshing...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Refresh Feed</span>
                </>
              )}
            </button>
          </div>
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
                marketId={trade.market.id}
                side={trade.trade.outcome}
                type={trade.trade.side === 'BUY' ? 'buy' : 'sell'}
                price={trade.trade.price}
                size={trade.trade.size}
                timestamp={trade.trade.timestamp}
                isCopied={isTradecopied(trade)}
                onCopyTrade={() => handleCopyTrade(trade)}
                onMarkAsCopied={() => handleMarkAsCopied(trade)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={modalOpen}
        trade={selectedTrade}
        onClose={() => {
          setModalOpen(false);
          setSelectedTrade(null);
        }}
        onConfirm={handleConfirmCopy}
        isSubmitting={isSubmitting}
      />

      {/* Success Toast */}
      <SuccessToast message={toastMessage} isVisible={showToast} />
    </div>
  );
}
