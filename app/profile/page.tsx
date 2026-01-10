'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase, ensureProfile } from '@/lib/supabase';
import { resolveFeatureTier, tierHasPremiumAccess } from '@/lib/feature-tier';
import type { User } from '@supabase/supabase-js';
import { Navigation } from '@/components/polycopy/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { UpgradeModal } from '@/components/polycopy/upgrade-modal';
import { ConnectWalletModal } from '@/components/polycopy/connect-wallet-modal';
import { MarkTradeClosed } from '@/components/polycopy/mark-trade-closed';
import { EditCopiedTrade } from '@/components/polycopy/edit-copied-trade';
import { OrdersScreen } from '@/components/orders/OrdersScreen';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  TrendingUp,
  Percent,
  DollarSign,
  Crown,
  Wallet,
  Copy,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Edit2,
  X,
  Bell,
  BellOff,
  Trash2,
  RotateCcw,
  Check,
  Info,
  ArrowUpRight,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// Types for copied trades
interface CopiedTrade {
  id: string;
  trader_wallet: string;
  trader_username: string | null;
  trader_profile_image_url: string | null;
  market_id: string;
  market_title: string;
  market_slug: string | null;
  market_avatar_url: string | null;
  outcome: string;
  price_when_copied: number;
  amount_invested: number | null;
  copied_at: string;
  trader_still_has_position: boolean;
  trader_closed_at: string | null;
  current_price: number | null;
  market_resolved: boolean;
  market_resolved_at: string | null;
  roi: number | null;
  user_closed_at: string | null;
  user_exit_price: number | null;
  resolved_outcome?: string | null;
}

interface PositionSizeBucket {
  range: string;
  count: number;
  percentage: number;
}

interface CategoryDistribution {
  category: string;
  count: number;
  percentage: number;
  color: string;
}

type ProfileTab = 'copied-trades' | 'performance' | 'settings' | 'manual-trades';

// Helper: Format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays} days ago`;
  if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatCompactNumber(value: number) {
  const absValue = Math.abs(value);
  if (absValue >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (absValue >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function ProfilePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [followingCount, setFollowingCount] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);
  
  // Premium and trading wallet state
  const [profile, setProfile] = useState<any>(null);
  const [showWalletSetup, setShowWalletSetup] = useState(false);
  const [disconnectingWallet, setDisconnectingWallet] = useState(false);
  const featureTier = resolveFeatureTier(Boolean(user), profile);
  const hasPremiumAccess = tierHasPremiumAccess(featureTier);
  
  // Copied trades state
  const [copiedTrades, setCopiedTrades] = useState<CopiedTrade[]>([]);
  const [loadingCopiedTrades, setLoadingCopiedTrades] = useState(true);
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [tradeFilter, setTradeFilter] = useState<'all' | 'open' | 'closed' | 'resolved'>('all');
  
  // Performance tab data
  const [positionSizeBuckets, setPositionSizeBuckets] = useState<PositionSizeBucket[]>([]);
  const [categoryDistribution, setCategoryDistribution] = useState<CategoryDistribution[]>([]);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [hoveredBucket, setHoveredBucket] = useState<{ range: string; count: number; percentage: number; x: number; y: number } | null>(null);
  
  // Edit/Close trade modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [tradeToEdit, setTradeToEdit] = useState<CopiedTrade | null>(null);
  
  // Toast state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // UI state - Check for tab query parameter
  const tabParam = searchParams?.get('tab');
  const initialTab =
    tabParam === 'settings' || tabParam === 'performance' || tabParam === 'manual-trades'
      ? (tabParam as ProfileTab)
      : 'copied-trades';
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  
  // Disconnect wallet confirmation modal state
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [disconnectConfirmText, setDisconnectConfirmText] = useState('');
  
  // Notification preferences state
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [loadingNotificationPrefs, setLoadingNotificationPrefs] = useState(false);
  
  // Polymarket username state
  const [polymarketUsername, setPolymarketUsername] = useState<string | null>(null);
  
  // Profile image state
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  
  // Pagination state for copied trades
  const [tradesToShow, setTradesToShow] = useState(15);
  
  // Live market data (prices and scores)
  const [liveMarketData, setLiveMarketData] = useState<Map<string, { 
    price: number; 
    score?: string;
    closed?: boolean;
  }>>(new Map());
  
  // Refs to prevent re-fetching on tab focus
  const hasLoadedStatsRef = useRef(false);
  const hasLoadedTradesRef = useRef(false);
  const hasLoadedNotificationPrefsRef = useRef(false);

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      setLoading(true);

      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          router.push('/login');
          return;
        }

        setUser(session.user);
        await ensureProfile(session.user.id, session.user.email!);
      } catch (err) {
        console.error('Auth error:', err);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        router.push('/login');
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  // Fetch user stats and wallet
  useEffect(() => {
    if (!user || hasLoadedStatsRef.current) return;
    hasLoadedStatsRef.current = true;

    const fetchStats = async () => {
      setLoadingStats(true);

      try {
        const { count, error } = await supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        if (error) {
          console.error('Error fetching following count:', error);
        } else {
          setFollowingCount(count || 0);
        }

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('is_premium, is_admin, premium_since, profile_image_url')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
        } else {
          setIsPremium(profileData?.is_premium || false);
          setProfileImageUrl(profileData?.profile_image_url || null);
        }

        // Fetch wallet from turnkey_wallets table
        const { data: walletData, error: walletError } = await supabase
          .from('turnkey_wallets')
          .select('polymarket_account_address, eoa_address')
          .eq('user_id', user.id)
          .maybeSingle();

        if (walletError) {
          console.error('Error fetching wallet:', walletError);
        }

        // Combine profile and wallet data
        setProfile({
          ...profileData,
          trading_wallet_address: walletData?.polymarket_account_address || walletData?.eoa_address || null
        });
      } catch (err) {
        console.error('Error fetching stats:', err);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchStats();
  }, [user]);

  // Fetch Polymarket username when wallet is connected
  useEffect(() => {
    if (!profile?.trading_wallet_address) {
      setPolymarketUsername(null);
      return;
    }

    const fetchPolymarketUsername = async () => {
      try {
        const response = await fetch(
          `https://data-api.polymarket.com/v1/leaderboard?timePeriod=all&orderBy=VOL&limit=1&offset=0&category=overall&user=${profile.trading_wallet_address}`
        );
        
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0 && data[0].userName) {
            setPolymarketUsername(data[0].userName);
          }
        }
      } catch (err) {
        console.error('Error fetching Polymarket username:', err);
      }
    };

    fetchPolymarketUsername();
  }, [profile?.trading_wallet_address]);

  // Fetch copied trades with auto-refresh status
  useEffect(() => {
    if (!user || hasLoadedTradesRef.current) return;
    hasLoadedTradesRef.current = true;
    
    const fetchCopiedTrades = async () => {
      setLoadingCopiedTrades(true);
      try {
        const response = await fetch(`/api/copied-trades?userId=${user.id}`);
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Error fetching copied trades:', errorText);
          setCopiedTrades([]);
          setLoadingCopiedTrades(false);
          return;
        }

        const payload = await response.json();
        const trades = (payload?.trades || []) as CopiedTrade[];
        
        // Recalculate ROI for user-closed trades
        const tradesWithCorrectRoi = trades.map(trade => {
          const tradePrice = trade.price_when_copied;
          if (trade.user_closed_at && trade.user_exit_price && tradePrice) {
            const correctRoi = ((trade.user_exit_price - tradePrice) / tradePrice) * 100;
            return {
              ...trade,
              roi: parseFloat(correctRoi.toFixed(2)),
            };
          }
          return trade;
        });
        
        setCopiedTrades(tradesWithCorrectRoi);
        
        // Fetch live market data for the trades
        fetchLiveMarketData(tradesWithCorrectRoi);
      } catch (err) {
        console.error('Error fetching copied trades:', err);
        setCopiedTrades([]);
      } finally {
        setLoadingCopiedTrades(false);
      }
    };

    fetchCopiedTrades();
  }, [user]);
  
  // Fetch live market data (prices and scores)
  const fetchLiveMarketData = async (trades: CopiedTrade[]) => {
    const newLiveData = new Map<string, { price: number; score?: string; closed?: boolean }>();
    
    // Get unique market IDs
    const uniqueMarketIds = [...new Set(trades.map(t => t.market_id).filter(Boolean))];
    
    console.log(`📊 Fetching live data for ${uniqueMarketIds.length} markets`);
    
    await Promise.all(
      uniqueMarketIds.map(async (marketId) => {
        try {
          // Fetch current price from Polymarket API
          const priceResponse = await fetch(`/api/polymarket/price?conditionId=${marketId}`);
          if (priceResponse.ok) {
            const priceData = await priceResponse.json();
            
            if (priceData.success && priceData.market) {
              // Find the trade to determine which outcome we need
              const trade = trades.find(t => t.market_id === marketId);
              if (trade) {
                const outcome = trade.outcome.toUpperCase();
                const { outcomes, outcomePrices, closed } = priceData.market;
                
                // Find the price for this specific outcome
                const outcomeIndex = outcomes?.findIndex((o: string) => o.toUpperCase() === outcome);
                if (outcomeIndex !== -1 && outcomePrices && outcomePrices[outcomeIndex]) {
                  const price = Number(outcomePrices[outcomeIndex]);
                  newLiveData.set(marketId, { price, closed: Boolean(closed) });
                }
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to fetch live data for ${marketId}:`, error);
        }
      })
    );
    
    console.log(`💾 Stored live data for ${newLiveData.size} markets`);
    setLiveMarketData(newLiveData);
  };

  // Process copied trades for performance metrics
  useEffect(() => {
    if (copiedTrades.length === 0) {
      setPositionSizeBuckets([]);
      setCategoryDistribution([]);
      return;
    }

    // Calculate Position Size Distribution
    const positionSizes = copiedTrades.map(trade => trade.amount_invested || 0);
    
    // Define buckets based on the data
    const buckets = [
      { min: 0, max: 100, label: '$0-$100' },
      { min: 100, max: 500, label: '$100-$500' },
      { min: 500, max: 1000, label: '$500-$1K' },
      { min: 1000, max: 5000, label: '$1K-$5K' },
      { min: 5000, max: 10000, label: '$5K-$10K' },
      { min: 10000, max: Infinity, label: '$10K+' },
    ];
    
    const bucketCounts = buckets.map(bucket => ({
      range: bucket.label,
      count: positionSizes.filter(size => size >= bucket.min && size < bucket.max).length,
      percentage: 0
    }));
    
    // Calculate percentages
    const totalTradesForBuckets = copiedTrades.length;
    bucketCounts.forEach(bucket => {
      bucket.percentage = (bucket.count / totalTradesForBuckets) * 100;
    });
    
    // Filter out empty buckets
    const nonEmptyBuckets = bucketCounts.filter(b => b.count > 0);

    setPositionSizeBuckets(nonEmptyBuckets);

    // Calculate Category Distribution
    const categoryMap: { [key: string]: number } = {};
    const categoryColors: { [key: string]: string } = {
      'Politics': '#3b82f6',
      'Sports': '#10b981',
      'Crypto': '#f59e0b',
      'Culture': '#ec4899',
      'Finance': '#8b5cf6',
      'Economics': '#06b6d4',
      'Tech': '#6366f1',
      'Weather': '#14b8a6',
      'Other': '#64748b'
    };

    copiedTrades.forEach(trade => {
      // Categorize based on market title keywords with comprehensive patterns
      const title = trade.market_title.toLowerCase();
      let category = 'Other';
      
      // Politics - elections, government, political figures
      if (title.match(/trump|biden|harris|election|president|congress|senate|governor|democrat|republican|political|vote|campaign|white house|administration|policy|parliament|prime minister|cabinet|legislation/)) {
        category = 'Politics';
      }
      // Sports - all major sports and events (including "vs", spread betting terms)
      else if (title.match(/\svs\s|\svs\.|spread:|o\/u\s|over\/under|moneyline|nfl|nba|nhl|mlb|soccer|football|basketball|baseball|hockey|tennis|golf|mma|ufc|boxing|olympics|world cup|super bowl|playoffs|championship|athlete|team|game|match|score|tournament|league|premier league|fifa|celtics|lakers|warriors|bulls|knicks|heat|nets|bucks|raptors|76ers|sixers|pacers|pistons|cavaliers|hornets|magic|hawks|wizards|spurs|mavericks|rockets|grizzlies|pelicans|thunder|jazz|suns|trail blazers|kings|clippers|nuggets|timberwolves|chiefs|bills|bengals|ravens|browns|steelers|texans|colts|jaguars|titans|broncos|raiders|chargers|cowboys|giants|eagles|commanders|packers|bears|lions|vikings|saints|falcons|panthers|buccaneers|rams|49ers|cardinals|seahawks|yankees|red sox|dodgers|astros|mets|braves|cubs|white sox|red wings|maple leafs|canadiens|bruins|rangers|flyers|penguins|capitals|lightning|panthers|hurricanes|islanders|devils|blue jackets|predators|jets|avalanche|stars|blues|wild|blackhawks|ducks|sharks|kraken|flames|oilers|canucks|golden knights/)) {
        category = 'Sports';
      }
      // Crypto - cryptocurrencies and blockchain
      else if (title.match(/bitcoin|btc|ethereum|eth|crypto|blockchain|defi|nft|solana|sol|dogecoin|doge|cardano|ada|polkadot|dot|binance|bnb|ripple|xrp|litecoin|ltc|satoshi|mining|wallet|token|coin/)) {
        category = 'Crypto';
      }
      // Culture - entertainment, celebrities, media
      else if (title.match(/movie|film|music|song|album|artist|celebrity|actor|actress|director|oscar|grammy|emmy|tv show|series|netflix|disney|spotify|concert|tour|premiere|box office|streaming|podcast|youtube|tiktok|instagram|social media|influencer|viral|trending|fashion|style|beauty/)) {
        category = 'Culture';
      }
      // Finance - markets, stocks, companies
      else if (title.match(/stock|s&p|nasdaq|dow|market|ipo|shares|trading|wall street|investor|portfolio|dividend|earnings|revenue|profit|valuation|acquisition|merger|bankruptcy|sec|ftx|robinhood|index|etf|mutual fund|hedge fund|investment|asset/)) {
        category = 'Finance';
      }
      // Economics - macro indicators, central banks
      else if (title.match(/gdp|inflation|recession|unemployment|interest rate|fed|federal reserve|central bank|cpi|ppi|economy|economic|jobs report|payroll|consumer|spending|debt|deficit|fiscal|monetary|quantitative easing|treasury|bond|yield/)) {
        category = 'Economics';
      }
      // Tech - technology companies and innovations
      else if (title.match(/ai|artificial intelligence|tech|technology|apple|google|microsoft|amazon|meta|facebook|tesla|spacex|nvidia|amd|intel|chip|semiconductor|software|hardware|startup|silicon valley|ipo|app|platform|cloud|data|cybersecurity|robot|autonomous|electric vehicle|ev|5g|quantum|vr|ar|metaverse|openai|chatgpt|gpt/)) {
        category = 'Tech';
      }
      // Weather - climate and weather events
      else if (title.match(/temperature|weather|climate|hurricane|storm|tornado|flood|drought|snow|rain|heat wave|cold|frost|wind|forecast|meteorolog|el nino|la nina|global warming|celsius|fahrenheit/)) {
        category = 'Weather';
      }
      
      categoryMap[category] = (categoryMap[category] || 0) + 1;
    });

    // Convert to array with percentages
    const totalTrades = copiedTrades.length;
    const categoryData: CategoryDistribution[] = Object.entries(categoryMap)
      .map(([category, count]) => ({
        category,
        count,
        percentage: (count / totalTrades) * 100,
        color: categoryColors[category] || '#64748b'
      }))
      .sort((a, b) => b.count - a.count);

    setCategoryDistribution(categoryData);
  }, [copiedTrades]);

  // Fetch notification preferences
  useEffect(() => {
    if (!user || hasLoadedNotificationPrefsRef.current) return;
    hasLoadedNotificationPrefsRef.current = true;
    
    const fetchNotificationPrefs = async () => {
      setLoadingNotificationPrefs(true);
      try {
        const { data, error } = await supabase
          .from('notification_preferences')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(); // Use maybeSingle() instead of single() to avoid error when no row exists
        
        // Don't log errors from maybeSingle() - it's expected to return no data for new users
        // Only log if there's a real error (has code, message, or details)
        if (error?.code || (error?.message && error.message.trim() !== '')) {
          console.error('Error fetching notification preferences:', error);
        }
        
        if (data) {
          setNotificationsEnabled(data.trader_closes_position || false);
        }
        // If no data and no error, user has no preferences yet - that's fine, use default
      } catch (err) {
        console.error('Error fetching notification preferences:', err);
      } finally {
        setLoadingNotificationPrefs(false);
      }
    };

    fetchNotificationPrefs();
  }, [user]);

  // Calculate stats
  const calculateStats = () => {
    const openTrades = copiedTrades.filter(t => !t.user_closed_at && !t.market_resolved);
    const closedTrades = copiedTrades.filter(t => t.user_closed_at || t.market_resolved);
    
    const totalPnl = closedTrades.reduce((sum, trade) => {
      if (trade.roi !== null && trade.amount_invested) {
        return sum + (trade.amount_invested * (trade.roi / 100));
      }
      return sum;
    }, 0);
    
    const totalVolume = copiedTrades.reduce((sum, trade) => {
      return sum + (trade.amount_invested || 0);
    }, 0);
    
    // Calculate total invested amount for closed trades
    const totalInvestedInClosedTrades = closedTrades.reduce((sum, trade) => {
      return sum + (trade.amount_invested || 0);
    }, 0);
    
    // Calculate actual ROI: (total P&L / total invested) * 100
    // This gives the true return on investment, not just an average of percentages
    const actualRoi = totalInvestedInClosedTrades > 0
      ? (totalPnl / totalInvestedInClosedTrades) * 100
      : 0;
    
    const winningTrades = closedTrades.filter(t => (t.roi || 0) > 0).length;
    const winRate = closedTrades.length > 0 ? (winningTrades / closedTrades.length) * 100 : 0;
    
    return {
      totalPnl,
      roi: actualRoi,
      totalVolume,
      winRate: Math.round(winRate),
    };
  };

  const userStats = calculateStats();

  // Filter trades
  const filteredTrades = copiedTrades.filter(trade => {
    if (tradeFilter === 'all') return true;
    if (tradeFilter === 'open') return !trade.user_closed_at && !trade.market_resolved;
    if (tradeFilter === 'closed') return Boolean(trade.user_closed_at);
    if (tradeFilter === 'resolved') return Boolean(trade.market_resolved);
    return true;
  });

  // Manual refresh status
  const handleManualRefresh = async () => {
    if (!user) return;
    
    setRefreshingStatus(true);
    
    try {
      const tradesWithFreshStatus = await Promise.all(
        copiedTrades.map(async (trade) => {
          if (trade.user_closed_at) {
            return trade;
          }
          
          try {
            const statusRes = await fetch(`/api/copied-trades/${trade.id}/status?userId=${user.id}`);
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              
              return {
                ...trade,
                trader_still_has_position: statusData.traderStillHasPosition ?? trade.trader_still_has_position,
                trader_closed_at: statusData.traderClosedAt ?? trade.trader_closed_at,
                market_resolved: statusData.marketResolved ?? trade.market_resolved,
                current_price: statusData.currentPrice ?? trade.current_price,
                roi: statusData.roi ?? trade.roi,
                resolved_outcome: statusData.resolvedOutcome ?? trade.resolved_outcome
              };
            }
          } catch (e) {
            console.error('Failed to refresh status for trade:', trade.id, e);
          }
          return trade;
        })
      );
      
      setCopiedTrades(tradesWithFreshStatus);
      
      // Also refresh live market data
      await fetchLiveMarketData(tradesWithFreshStatus);
      
      setToastMessage('Positions refreshed!');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error('Error refreshing status:', err);
    } finally {
      setRefreshingStatus(false);
    }
  };

  // Wallet handlers
  const handleWalletConnect = async (address: string) => {
    if (!user) return;
    
    // The ConnectWalletModal handles the Turnkey import
    // After successful import, the wallet is already in turnkey_wallets table
    // We just need to refresh the profile to show the wallet
    try {
      // Fetch the updated wallet from turnkey_wallets
      const { data: walletData, error: walletError } = await supabase
        .from('turnkey_wallets')
        .select('polymarket_account_address, eoa_address')
        .eq('user_id', user.id)
        .maybeSingle();

      if (walletError) throw walletError;

      const connectedWallet = walletData?.polymarket_account_address || walletData?.eoa_address || address;
      
      // First, delete any existing credentials to ensure clean state
      console.log('[Profile] Resetting existing L2 credentials...');
      try {
        await fetch('/api/polymarket/reset-credentials', {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
        });
        console.log('[Profile] Old credentials reset successfully');
      } catch (resetError) {
        console.error('[Profile] Error resetting credentials:', resetError);
        // Continue anyway - not critical
      }
      
      // Generate L2 CLOB credentials for trading
      console.log('[Profile] Generating L2 credentials for wallet:', connectedWallet);
      try {
        const l2Response = await fetch('/api/polymarket/l2-credentials', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            polymarketAccountAddress: connectedWallet,
          }),
        });
        
        const l2Data = await l2Response.json();
        
        if (!l2Response.ok) {
          console.error('[Profile] Failed to generate L2 credentials:', l2Data?.error);
          // Don't throw - allow wallet connection to succeed even if L2 creds fail
        } else {
          console.log('[Profile] L2 credentials generated successfully');
        }
      } catch (l2Error) {
        console.error('[Profile] L2 credential generation error:', l2Error);
        // Don't throw - allow wallet connection to succeed even if L2 creds fail
      }
      
      // Update local profile state with the wallet address
      setProfile({
        ...profile,
        trading_wallet_address: connectedWallet
      });
      
      // Fetch and save profile image from Polymarket leaderboard
      try {
        console.log('🖼️ Fetching profile image from Polymarket...');
        const leaderboardResponse = await fetch(
          `/api/polymarket/leaderboard?limit=1000&orderBy=PNL&timePeriod=all`
        );
        
        if (leaderboardResponse.ok) {
          const leaderboardData = await leaderboardResponse.json();
          const trader = leaderboardData.traders?.find(
            (t: any) => t.wallet.toLowerCase() === connectedWallet.toLowerCase()
          );
          
          if (trader?.profileImage) {
            // Save profile image to database
            const { error: imageError } = await supabase
              .from('profiles')
              .update({ profile_image_url: trader.profileImage })
              .eq('id', user.id);
            
            if (!imageError) {
              setProfileImageUrl(trader.profileImage);
              console.log('✅ Profile image saved:', trader.profileImage);
            }
          } else {
            console.log('ℹ️ No profile image found for this wallet');
          }
        }
      } catch (imageErr) {
        console.error('Error fetching profile image:', imageErr);
        // Non-critical, continue anyway
      }
      
      setToastMessage('Wallet connected successfully!');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
      
      // Refresh the page to show the connected wallet and updated data
      console.log('[Profile] Refreshing page to show connected wallet');
      router.refresh();
    } catch (err) {
      console.error('Error fetching wallet after connection:', err);
      // Still update with the address we received
      setProfile({ ...profile, trading_wallet_address: address });
    } finally {
      setIsConnectModalOpen(false);
    }
  };

  const handleWalletDisconnect = async () => {
    if (!user || !profile?.trading_wallet_address) return;
    
    // Check if confirmation is correct
    if (disconnectConfirmText.toUpperCase() !== 'YES') {
      return;
    }
    
    setDisconnectingWallet(true);
    
    try {
      // Delete from turnkey_wallets table
      const { error } = await supabase
        .from('turnkey_wallets')
        .delete()
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      setProfile({ ...profile, trading_wallet_address: null });
      setShowDisconnectModal(false);
      setDisconnectConfirmText('');
      setToastMessage('Wallet disconnected');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error('Error disconnecting wallet:', err);
    } finally {
      setDisconnectingWallet(false);
    }
  };

  // Edit trade handler
  const handleEditTrade = async (entryPrice: number, amountInvested: number | null) => {
    if (!user || !tradeToEdit) return;
    
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          price_when_copied: entryPrice,
          amount_invested: amountInvested,
        })
        .eq('copied_trade_id', tradeToEdit.id)
        .eq('copy_user_id', user.id);
      
      if (error) throw error;
      
      // Update local state
      setCopiedTrades(trades =>
        trades.map(t =>
          t.id === tradeToEdit.id
            ? { ...t, price_when_copied: entryPrice, amount_invested: amountInvested }
            : t
        )
      );
      
      setShowEditModal(false);
      setTradeToEdit(null);
      setToastMessage('Trade updated!');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error('Error updating trade:', err);
    }
  };

  // Close trade handler
  const handleCloseTrade = async (exitPrice: number) => {
    if (!user || !tradeToEdit) return;
    
    try {
      const roi = ((exitPrice - tradeToEdit.price_when_copied) / tradeToEdit.price_when_copied) * 100;
      
      const { error } = await supabase
        .from('orders')
        .update({
          user_closed_at: new Date().toISOString(),
          user_exit_price: exitPrice,
          roi: parseFloat(roi.toFixed(2)),
        })
        .eq('copied_trade_id', tradeToEdit.id)
        .eq('copy_user_id', user.id);
      
      if (error) throw error;
      
      // Update local state
      setCopiedTrades(trades =>
        trades.map(t =>
          t.id === tradeToEdit.id
            ? {
                ...t,
                user_closed_at: new Date().toISOString(),
                user_exit_price: exitPrice,
                roi: parseFloat(roi.toFixed(2)),
              }
            : t
        )
      );
      
      setShowCloseModal(false);
      setTradeToEdit(null);
      setToastMessage('Position closed!');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error('Error closing trade:', err);
    }
  };

  // Unmark trade as closed
  const handleUnmarkClosed = async (trade: CopiedTrade) => {
    if (!user) return;
    
    if (!confirm('Are you sure you want to reopen this trade? This will clear your exit price and ROI.')) {
      return;
    }
    
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          user_closed_at: null,
          user_exit_price: null,
        })
        .eq('copied_trade_id', trade.id)
        .eq('copy_user_id', user.id);
      
      if (error) throw error;
      
      // Update local state
      setCopiedTrades(trades =>
        trades.map(t =>
          t.id === trade.id
            ? {
                ...t,
                user_closed_at: null,
                user_exit_price: null,
              }
            : t
        )
      );
      
      setToastMessage('Trade reopened!');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error('Error unmarking trade:', err);
    }
  };

  // Delete trade
  const handleDeleteTrade = async (trade: CopiedTrade) => {
    if (!user) return;
    
    if (!confirm('Are you sure you want to delete this copied trade? This action cannot be undone.')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/copied-trades/${trade.id}?userId=${user.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const payload = await response.json();

      if (!response.ok) {
        console.error('Error deleting copied trade:', payload);
        throw new Error(payload.error || 'Failed to delete copied trade');
      }

      // Remove from local state
      setCopiedTrades(trades => trades.filter(t => t.id !== trade.id));

      setToastMessage(payload.message || 'Trade deleted!');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error('Error deleting trade:', err);
    }
  };

  // Notification toggle
  const handleToggleNotifications = async () => {
    if (!user) return;
    
    const newValue = !notificationsEnabled;
    setNotificationsEnabled(newValue);
    
    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: user.id,
          trader_closes_position: newValue,
          market_resolves: newValue,
        });
      
      if (error) throw error;
      
      setToastMessage(`Notifications ${newValue ? 'enabled' : 'disabled'}`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error('Error updating notification preferences:', err);
      setNotificationsEnabled(!newValue);
    }
  };

  // Loading state
  if (loading) {
    return (
      <>
        <Navigation 
          user={user ? { id: user.id, email: user.email || '' } : null} 
          isPremium={isPremium}
          walletAddress={profile?.trading_wallet_address}
          profileImageUrl={profileImageUrl}
        />
        <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#FDB022] mx-auto mb-4"></div>
            <p className="text-slate-600 text-lg">Loading...</p>
          </div>
        </div>
      </>
    );
  }

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <>
      <Navigation 
        user={user ? { id: user.id, email: user.email || '' } : null} 
        isPremium={isPremium}
        walletAddress={profile?.trading_wallet_address}
        profileImageUrl={profileImageUrl}
      />
      
      <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pt-4 md:pt-0 pb-20 md:pb-8">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 space-y-6 py-8">
          {/* Mobile-only Upgrade to Premium button */}
          {!isPremium && (
            <div className="lg:hidden">
              <Button
                onClick={() => setShowUpgradeModal(true)}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold shadow-md hover:shadow-lg transition-all"
              >
                <Crown className="mr-2 h-4 w-4" />
                Upgrade to Premium
              </Button>
            </div>
          )}

          {/* User Profile Card */}
          <Card className="bg-white border-slate-200 p-4 sm:p-8">
            <div className="flex flex-col lg:flex-row lg:items-start gap-6">
              {/* Left side - Profile info */}
              <div className="flex flex-col items-center lg:flex-row lg:items-start gap-4 flex-1">
                <Avatar className="h-20 w-20 bg-gradient-to-br from-yellow-400 to-orange-500">
                  <AvatarFallback className="text-2xl font-bold text-white bg-transparent">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 text-center lg:text-left">
                  <h2 className="text-2xl font-bold text-slate-900 mb-1">
                    {profile?.trading_wallet_address && polymarketUsername
                      ? polymarketUsername.startsWith('0x') && polymarketUsername.length > 20
                        ? truncateAddress(polymarketUsername)
                        : polymarketUsername
                      : 'You'}
                  </h2>
                  {profile?.trading_wallet_address && (
                    <>
                      <p className="text-sm font-mono text-slate-500 mt-2">
                        {truncateAddress(profile.trading_wallet_address)}
                      </p>
                      <div className="flex items-center gap-3 mt-3 justify-center lg:justify-start">
                        <a
                          href={`https://polymarket.com/profile/${profile.trading_wallet_address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-yellow-600 transition-colors"
                        >
                          View on Polymarket
                          <ArrowUpRight className="h-3 w-3" />
                        </a>
                        <div className="flex items-center gap-1">
                          <Button
                            onClick={() => navigator.clipboard.writeText(profile.trading_wallet_address)}
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-slate-500 hover:text-slate-900"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            onClick={() => setShowDisconnectModal(true)}
                            disabled={disconnectingWallet}
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-red-500 hover:text-red-700"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}

                  {!profile?.trading_wallet_address && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 justify-center lg:justify-start mt-2">
                      <Avatar className="h-9 w-9 ring-2 ring-slate-100">
                        <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-yellow-500 text-slate-900 text-xs font-semibold">
                          {user?.email?.charAt(0).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <span>Following {followingCount} traders</span>
                    </div>
                  )}

                  {!profile?.trading_wallet_address && hasPremiumAccess && (
                    <Button
                      onClick={() => setIsConnectModalOpen(true)}
                      className="mt-3 bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-semibold"
                      size="sm"
                    >
                      <Wallet className="mr-2 h-4 w-4" />
                      Connect Polymarket Wallet
                    </Button>
                  )}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <div className="text-xs font-medium text-slate-500 mb-1">
                    Total P&L
                  </div>
                  <div className={cn("text-2xl font-bold", userStats.totalPnl >= 0 ? "text-emerald-600" : "text-red-600")}>
                    {userStats.totalPnl >= 0 ? "+" : ""}
                    {formatCompactNumber(userStats.totalPnl)}
                  </div>
                </div>
                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <div className="text-xs font-medium text-slate-500 mb-1">
                    ROI
                  </div>
                  <div className={cn("text-2xl font-bold", userStats.roi >= 0 ? "text-emerald-600" : "text-red-600")}>
                    {userStats.roi >= 0 ? '+' : ''}{userStats.roi.toFixed(1)}%
                  </div>
                </div>
                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <div className="text-xs font-medium text-slate-500 mb-1">
                    Volume
                  </div>
                  <div className="text-2xl font-bold text-slate-900">
                    {formatCompactNumber(userStats.totalVolume)}
                  </div>
                </div>
                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <div className="text-xs font-medium text-slate-500 mb-1">
                    Win Rate
                  </div>
                  <div className="text-2xl font-bold text-slate-900">{userStats.winRate}%</div>
                </div>
              </div>
            </div>
          </Card>

          {/* Tab Navigation */}
          <div className="flex gap-2 mb-6">
            <Button
              onClick={() => setActiveTab('copied-trades')}
              variant="ghost"
              className={cn(
                "flex-1 px-3 py-3 rounded-md font-medium text-sm transition-all whitespace-nowrap",
                activeTab === 'copied-trades'
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                  : "bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-300"
              )}
            >
              Manual Trades
            </Button>
            <Button
              onClick={() => setActiveTab('manual-trades')}
              variant="ghost"
              className={cn(
                "flex-1 px-3 py-3 rounded-md font-medium text-sm transition-all whitespace-nowrap",
                activeTab === 'manual-trades'
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                  : "bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-300"
              )}
            >
              Quick Trades
            </Button>
            <Button
              onClick={() => setActiveTab('performance')}
              variant="ghost"
              className={cn(
                "flex-1 px-3 py-3 rounded-md font-medium text-sm transition-all whitespace-nowrap",
                activeTab === 'performance'
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                  : "bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-300"
              )}
            >
              Performance
            </Button>
            <Button
              onClick={() => setActiveTab('settings')}
              variant="ghost"
              className={cn(
                "flex-1 px-3 py-3 rounded-md font-medium text-sm transition-all whitespace-nowrap",
                activeTab === 'settings'
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                  : "bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-300"
              )}
            >
              Settings
            </Button>
          </div>

          {/* Tab Content */}
          {activeTab === 'manual-trades' && (
            <div className="space-y-4">
              <OrdersScreen hideNavigation contentWrapperClassName="bg-transparent" />
            </div>
          )}
          {activeTab === 'copied-trades' && (
            <div className="space-y-4">
              {/* Filter and Refresh */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2">
                  {(['all', 'open', 'closed', 'resolved'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setTradeFilter(filter)}
                      className={cn(
                        "px-4 py-2 rounded-lg font-medium text-sm transition-all",
                        tradeFilter === filter
                          ? "bg-slate-900 text-white"
                          : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      {filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </button>
                  ))}
                </div>
                <Button
                  onClick={handleManualRefresh}
                  disabled={refreshingStatus}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <RefreshCw className={cn("h-4 w-4", refreshingStatus && "animate-spin")} />
                  Refresh Status
                </Button>
              </div>

              {/* Trades List */}
              {loadingCopiedTrades ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="p-6 animate-pulse">
                      <div className="h-4 bg-slate-200 rounded w-3/4 mb-3"></div>
                      <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                    </Card>
                  ))}
                </div>
              ) : filteredTrades.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-slate-600">No copied trades yet.</p>
                  <Link href="/discover">
                    <Button className="mt-4 bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900">
                      Discover Traders
                    </Button>
                  </Link>
                </Card>
              ) : (
                <div className="space-y-3">
                  {filteredTrades.slice(0, tradesToShow).map((trade) => (
                    <Card key={trade.id} className="p-4 sm:p-6">
                      <div className="space-y-4">
                        {/* Trader Header Row */}
                        <div className="flex items-start justify-between gap-3">
                          <Link
                            href={`/trader/${trade.trader_wallet}`}
                            className="flex items-center gap-3 min-w-0 hover:opacity-70 transition-opacity"
                          >
                            <Avatar className="h-10 w-10 ring-2 ring-slate-100">
                              {trade.trader_profile_image_url ? (
                                <img
                                  src={trade.trader_profile_image_url}
                                  alt={trade.trader_username || 'Trader'}
                                  className="h-full w-full object-cover"
                                />
                              ) : null}
                              <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-yellow-500 text-slate-900 text-sm font-semibold">
                                {(trade.trader_username || trade.trader_wallet).slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900 text-sm">
                                {trade.trader_username || `${trade.trader_wallet.slice(0, 6)}...${trade.trader_wallet.slice(-4)}`}
                              </p>
                              <p className="text-xs text-slate-500 font-mono truncate">
                                {`${trade.trader_wallet.slice(0, 6)}...${trade.trader_wallet.slice(-4)}`}
                              </p>
                            </div>
                          </Link>
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            {/* Live Price Display */}
                            {liveMarketData.get(trade.market_id) && (
                              <div className="flex items-center gap-1.5 px-2 py-1 h-7 rounded bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 shadow-sm">
                                <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Price:</span>
                                <span className="text-xs font-bold text-slate-900">
                                  ${liveMarketData.get(trade.market_id)!.price.toFixed(2)}
                                </span>
                                {(() => {
                                  const currentPrice = liveMarketData.get(trade.market_id)!.price;
                                  const priceChange = ((currentPrice - trade.price_when_copied) / trade.price_when_copied) * 100;
                                  if (Math.abs(priceChange) > 0.1) {
                                    return (
                                      <span className={`text-xs font-semibold flex items-center ${priceChange > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {priceChange > 0 ? '↑' : '↓'}{Math.abs(priceChange).toFixed(1)}%
                                      </span>
                                    );
                                  }
                                })()}
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
                                {formatRelativeTime(trade.copied_at)}
                              </span>
                              <button
                                onClick={() => setExpandedTradeId(expandedTradeId === trade.id ? null : trade.id)}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                              >
                                {expandedTradeId === trade.id ? (
                                  <ChevronUp className="h-5 w-5" />
                                ) : (
                                  <ChevronDown className="h-5 w-5" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Market Row */}
                        <div className="flex items-center gap-3">
                          <Avatar className="h-11 w-11 ring-2 ring-slate-100 bg-slate-50">
                            {trade.market_avatar_url ? (
                              <img
                                src={trade.market_avatar_url}
                                alt={trade.market_title}
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                            <AvatarFallback className="bg-slate-100 text-slate-700 text-xs font-semibold uppercase">
                              {trade.market_title.slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 flex items-center gap-2">
                            <h3 className="font-medium text-slate-900 leading-snug">
                              {trade.market_title}
                            </h3>
                            <Badge
                              className={cn(
                                "font-semibold flex-shrink-0",
                                trade.outcome === 'YES'
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-red-50 text-red-700 border-red-200"
                              )}
                            >
                              {trade.outcome}
                            </Badge>
                          </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 rounded-lg p-3">
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Entry</p>
                            <p className="font-semibold text-slate-900">${trade.price_when_copied.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Current</p>
                            <p className="font-semibold text-slate-900">
                              ${trade.current_price?.toFixed(2) || trade.price_when_copied.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Amount</p>
                            <p className="font-semibold text-slate-900">
                              ${trade.amount_invested?.toFixed(0) || '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 mb-1">ROI</p>
                            <p className={cn(
                              "font-semibold",
                              (trade.roi || 0) >= 0 ? "text-emerald-600" : "text-red-600"
                            )}>
                              {(trade.roi || 0) >= 0 ? '+' : ''}{(trade.roi || 0).toFixed(1)}%
                            </p>
                          </div>
                        </div>

                        {/* Status Badges */}
                        <div className="flex flex-wrap gap-2">
                          {trade.market_resolved && (
                            <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                              Market Resolved: {trade.resolved_outcome || 'Unknown'}
                            </Badge>
                          )}
                          {trade.user_closed_at && (
                            <Badge variant="secondary" className="bg-gray-50 text-gray-700 border-gray-200">
                              You Closed
                            </Badge>
                          )}
                          {!trade.trader_still_has_position && !trade.market_resolved && !trade.user_closed_at && (
                            <Badge variant="secondary" className="bg-orange-50 text-orange-700 border-orange-200">
                              Trader Exited
                            </Badge>
                          )}
                        </div>

                        {/* Expanded Details */}
                        {expandedTradeId === trade.id && (
                          <div className="space-y-4 pt-4 border-t border-slate-200">
                            {/* Additional Details in 2x2 Grid */}
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-xs text-slate-500 mb-1">Current Price</p>
                                <p className="font-semibold text-slate-900">
                                  ${trade.current_price?.toFixed(2) || trade.price_when_copied.toFixed(2)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500 mb-1">Shares</p>
                                <p className="font-semibold text-slate-900">
                                  {trade.amount_invested && trade.price_when_copied 
                                    ? Math.round(trade.amount_invested / trade.price_when_copied)
                                    : '—'}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500 mb-1">Amount Invested</p>
                                <p className="font-semibold text-slate-900">
                                  ${trade.amount_invested?.toFixed(0) || '—'}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500 mb-1">P&L</p>
                                <p className={cn(
                                  "font-semibold",
                                  (trade.roi || 0) >= 0 ? "text-emerald-600" : "text-red-600"
                                )}>
                                  {trade.amount_invested && trade.roi
                                    ? `${(trade.roi >= 0 ? '+' : '')}$${((trade.amount_invested * trade.roi) / 100).toFixed(0)}`
                                    : '—'}
                                </p>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2">
                              {/* Open trades: Mark as Closed, Edit, Delete */}
                              {!trade.user_closed_at && !trade.market_resolved && (
                                <>
                                  <Button
                                    onClick={() => {
                                      setTradeToEdit(trade);
                                      setShowCloseModal(true);
                                    }}
                                    variant="outline"
                                    size="default"
                                    className="flex-1 border-blue-600 text-blue-600 hover:bg-blue-50 gap-2"
                                  >
                                    <Check className="h-4 w-4" />
                                    Mark as Closed
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      setTradeToEdit(trade);
                                      setShowEditModal(true);
                                    }}
                                    variant="outline"
                                    size="default"
                                    className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-50 gap-2"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                    Edit
                                  </Button>
                                  <Button
                                    onClick={() => handleDeleteTrade(trade)}
                                    variant="ghost"
                                    size="icon"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                                  >
                                    <Trash2 className="h-5 w-5" />
                                  </Button>
                                </>
                              )}
                              
                              {/* User-closed trades: Edit, Unmark as Closed, Delete */}
                              {trade.user_closed_at && (
                                <>
                                  <Button
                                    onClick={() => {
                                      setTradeToEdit(trade);
                                      setShowEditModal(true);
                                    }}
                                    variant="outline"
                                    size="default"
                                    className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-50 gap-2"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                    Edit
                                  </Button>
                                  <Button
                                    onClick={() => handleUnmarkClosed(trade)}
                                    variant="outline"
                                    size="default"
                                    className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-50 gap-2"
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                    Unmark as Closed
                                  </Button>
                                  <Button
                                    onClick={() => handleDeleteTrade(trade)}
                                    variant="ghost"
                                    size="icon"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                                  >
                                    <Trash2 className="h-5 w-5" />
                                  </Button>
                                </>
                              )}
                              
                              {/* Market-resolved trades: Edit, Delete */}
                              {trade.market_resolved && !trade.user_closed_at && (
                                <>
                                  <Button
                                    onClick={() => {
                                      setTradeToEdit(trade);
                                      setShowEditModal(true);
                                    }}
                                    variant="outline"
                                    size="default"
                                    className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-50 gap-2"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                    Edit
                                  </Button>
                                  <Button
                                    onClick={() => handleDeleteTrade(trade)}
                                    variant="ghost"
                                    size="icon"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                                  >
                                    <Trash2 className="h-5 w-5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                  
                  {/* View More Button */}
                  {filteredTrades.length > tradesToShow && (
                    <div className="flex justify-center pt-4">
                      <Button
                        onClick={() => setTradesToShow(prev => prev + 15)}
                        variant="outline"
                        className="border-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        View More Manual Trades ({filteredTrades.length - tradesToShow} remaining)
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'performance' && (
            <div className="space-y-6">
              {/* Header Section */}
              <div className="mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Performance Analysis</h2>
                <p className="text-sm text-slate-500 mt-1">Your complete trading performance across all copied trades</p>
              </div>

              {/* Position Size Distribution */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-900">Position Size Distribution</h3>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-slate-400 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Shows how you size your copied positions. Consistent sizing indicates disciplined risk management.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full font-medium">Your Trades</span>
                </div>
                {positionSizeBuckets.length > 0 ? (
                  <div className="relative h-64">
                    {/* Y-axis labels */}
                    <div className="absolute left-0 top-0 bottom-8 flex flex-col justify-between text-xs text-slate-500">
                      {(() => {
                        const maxCount = Math.max(...positionSizeBuckets.map(b => b.count), 1);
                        const steps = 5;
                        return Array.from({ length: steps }, (_, i) => {
                          const value = maxCount - (i / (steps - 1)) * maxCount;
                          return <span key={i}>{Math.round(value)}</span>;
                        });
                      })()}
                    </div>
                    
                    {/* Chart area */}
                    <div className="ml-12 h-full border-l border-b border-slate-200 relative">
                      <svg className="w-full h-full" viewBox="0 0 600 200" preserveAspectRatio="xMidYMid meet">
                        {/* Bar chart */}
                        {positionSizeBuckets.map((bucket, i) => {
                          const maxCount = Math.max(...positionSizeBuckets.map(b => b.count), 1);
                          const barWidth = 600 / positionSizeBuckets.length * 0.7;
                          const x = (i / positionSizeBuckets.length) * 600 + (600 / positionSizeBuckets.length - barWidth) / 2;
                          const height = (bucket.count / maxCount) * 200;
                          const y = 200 - height;
                          
                          return (
                            <rect
                              key={i}
                              x={x}
                              y={y}
                              width={barWidth}
                              height={height}
                              fill="#10b981"
                              className="cursor-pointer hover:opacity-80 transition-opacity"
                              onMouseEnter={() => setHoveredBucket({ range: bucket.range, count: bucket.count, percentage: bucket.percentage, x: x + barWidth / 2, y })}
                              onMouseLeave={() => setHoveredBucket(null)}
                            />
                          );
                        })}
                      </svg>
                      
                      {/* Tooltip for bars */}
                      {hoveredBucket && (
                        <div 
                          className="absolute bg-slate-900 text-white rounded-lg shadow-lg p-3 pointer-events-none z-10 text-sm"
                          style={{
                            left: `${(hoveredBucket.x / 600) * 100}%`,
                            top: `${(hoveredBucket.y / 200) * 100}%`,
                            transform: 'translate(-50%, -120%)'
                          }}
                        >
                          <div className="font-semibold">{hoveredBucket.range}</div>
                          <div className="text-emerald-400">
                            {hoveredBucket.count} {hoveredBucket.count === 1 ? 'trade' : 'trades'}
                          </div>
                          <div className="text-slate-300 text-xs">
                            {hoveredBucket.percentage.toFixed(1)}% of total
                          </div>
                        </div>
                      )}
                      
                      {/* X-axis labels */}
                      <div className="absolute -bottom-6 left-0 right-0 flex justify-between text-xs text-slate-500">
                        {positionSizeBuckets.map((bucket, i) => (
                          <span key={i} className="text-center">{bucket.range}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-slate-500">
                    <p>Not enough trade data to display position sizing</p>
                  </div>
                )}
              </Card>

              {/* Performance Metrics */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Performance Metrics</h3>
                <p className="text-sm text-slate-500 mb-6">Showing lifetime performance across all trades</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Lifetime ROI */}
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-sm text-slate-500 mb-1">Lifetime ROI</p>
                    <p className={`text-2xl font-bold ${(() => {
                      const closedTrades = copiedTrades.filter(t => t.roi !== null && t.roi !== 0);
                      if (closedTrades.length === 0) return 'text-slate-900';
                      const totalROI = closedTrades.reduce((sum, t) => sum + (t.roi || 0), 0) / closedTrades.length;
                      return totalROI > 0 ? 'text-emerald-600' : 'text-red-600';
                    })()}`}>
                      {(() => {
                        const closedTrades = copiedTrades.filter(t => t.roi !== null && t.roi !== 0);
                        if (closedTrades.length === 0) return 'N/A';
                        const totalROI = closedTrades.reduce((sum, t) => sum + (t.roi || 0), 0) / closedTrades.length;
                        return `${totalROI > 0 ? '+' : ''}${totalROI.toFixed(1)}%`;
                      })()}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">All time</p>
                  </div>

                  {/* Total P&L */}
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-sm text-slate-500 mb-1">Total P&L</p>
                    <p className={`text-2xl font-bold ${(() => {
                      const totalPnL = copiedTrades
                        .filter(t => t.roi !== null && t.roi !== 0)
                        .reduce((sum, t) => sum + ((t.amount_invested || 0) * ((t.roi || 0) / 100)), 0);
                      return totalPnL > 0 ? 'text-emerald-600' : 'text-red-600';
                    })()}`}>
                      {(() => {
                        const totalPnL = copiedTrades
                          .filter(t => t.roi !== null && t.roi !== 0)
                          .reduce((sum, t) => sum + ((t.amount_invested || 0) * ((t.roi || 0) / 100)), 0);
                        return `${totalPnL > 0 ? '+' : ''}$${Math.abs(totalPnL).toFixed(0)}`;
                      })()}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">All time</p>
                  </div>

                  {/* Best Position */}
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-sm text-slate-500 mb-1">Best Position</p>
                    <p className="text-2xl font-bold text-slate-900">
                      ${(() => {
                        if (copiedTrades.length === 0) return '0';
                        const maxTrade = Math.max(...copiedTrades.map(t => t.amount_invested || 0));
                        return maxTrade >= 1000000 
                          ? `${(maxTrade / 1000000).toFixed(2)}M`
                          : maxTrade >= 1000 
                            ? `${(maxTrade / 1000).toFixed(1)}K` 
                            : maxTrade.toFixed(0);
                      })()}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Largest trade</p>
                  </div>

                  {/* Total Trades */}
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-sm text-slate-500 mb-1">Total Trades</p>
                    <p className="text-2xl font-bold text-slate-900">{copiedTrades.length}</p>
                    <p className="text-xs text-slate-500 mt-1">All time</p>
                  </div>

                  {/* Net P&L / Trade */}
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-sm text-slate-500 mb-1">Net P&L / Trade</p>
                    <p className={`text-2xl font-bold ${(() => {
                      const totalPnL = copiedTrades
                        .filter(t => t.roi !== null && t.roi !== 0)
                        .reduce((sum, t) => sum + ((t.amount_invested || 0) * ((t.roi || 0) / 100)), 0);
                      return totalPnL > 0 ? 'text-emerald-600' : 'text-red-600';
                    })()}`}>
                      {(() => {
                        if (copiedTrades.length === 0) return '$0';
                        const totalPnL = copiedTrades
                          .filter(t => t.roi !== null && t.roi !== 0)
                          .reduce((sum, t) => sum + ((t.amount_invested || 0) * ((t.roi || 0) / 100)), 0);
                        const avgPnL = totalPnL / copiedTrades.length;
                        return `${avgPnL > 0 ? '+' : ''}$${Math.abs(avgPnL).toFixed(0)}`;
                      })()}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Per trade</p>
                  </div>

                  {/* Avg ROI / Trade */}
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-sm text-slate-500 mb-1">Avg ROI / Trade</p>
                    <p className={`text-2xl font-bold ${(() => {
                      const closedTrades = copiedTrades.filter(t => t.roi !== null && t.roi !== 0);
                      if (closedTrades.length === 0) return 'text-slate-900';
                      const avgROI = closedTrades.reduce((sum, t) => sum + (t.roi || 0), 0) / closedTrades.length;
                      return avgROI > 0 ? 'text-emerald-600' : 'text-red-600';
                    })()}`}>
                      {(() => {
                        const closedTrades = copiedTrades.filter(t => t.roi !== null && t.roi !== 0);
                        if (closedTrades.length === 0) return 'N/A';
                        const avgROI = closedTrades.reduce((sum, t) => sum + (t.roi || 0), 0) / closedTrades.length;
                        return `${avgROI > 0 ? '+' : ''}${avgROI.toFixed(2)}%`;
                      })()}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Per trade</p>
                  </div>

                  {/* Open Positions */}
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-sm text-slate-500 mb-1">Open Positions</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {copiedTrades.filter(t => !t.market_resolved && !t.user_closed_at).length}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Currently active</p>
                  </div>

                  {/* Avg P&L / Trade */}
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-sm text-slate-500 mb-1">Avg P&L / Trade</p>
                    <p className={`text-2xl font-bold ${(() => {
                      const totalPnL = copiedTrades
                        .filter(t => t.roi !== null && t.roi !== 0)
                        .reduce((sum, t) => sum + ((t.amount_invested || 0) * ((t.roi || 0) / 100)), 0);
                      return totalPnL > 0 ? 'text-emerald-600' : 'text-red-600';
                    })()}`}>
                      {(() => {
                        if (copiedTrades.length === 0) return '$0';
                        const totalPnL = copiedTrades
                          .filter(t => t.roi !== null && t.roi !== 0)
                          .reduce((sum, t) => sum + ((t.amount_invested || 0) * ((t.roi || 0) / 100)), 0);
                        const avgPnL = totalPnL / copiedTrades.length;
                        return `${avgPnL > 0 ? '+' : ''}$${Math.abs(avgPnL).toFixed(0)}`;
                      })()}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Average</p>
                  </div>
                </div>
              </Card>

              {/* Category Distribution Pie Chart */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-6">Trading Categories</h3>
                {categoryDistribution.length > 0 ? (
                  <div className="flex flex-col md:flex-row gap-6 items-center md:items-start justify-center">
                    {/* Pie Chart */}
                    <div className="relative w-56 h-56 flex-shrink-0">
                      <svg viewBox="0 0 200 200" className="w-full h-full">
                        {(() => {
                          let currentAngle = -90; // Start at top
                          return categoryDistribution.map((cat, i) => {
                            const angle = (cat.percentage / 100) * 360;
                            const startAngle = currentAngle;
                            const endAngle = currentAngle + angle;
                            currentAngle = endAngle;

                            // Calculate path for pie slice
                            const startRad = (startAngle * Math.PI) / 180;
                            const endRad = (endAngle * Math.PI) / 180;
                            const x1 = 100 + 80 * Math.cos(startRad);
                            const y1 = 100 + 80 * Math.sin(startRad);
                            const x2 = 100 + 80 * Math.cos(endRad);
                            const y2 = 100 + 80 * Math.sin(endRad);
                            const largeArc = angle > 180 ? 1 : 0;

                            return (
                              <g
                                key={i}
                                onMouseEnter={() => setHoveredCategory(cat.category)}
                                onMouseLeave={() => setHoveredCategory(null)}
                                className="cursor-pointer transition-opacity"
                                style={{ opacity: hoveredCategory === null || hoveredCategory === cat.category ? 1 : 0.3 }}
                              >
                                <path
                                  d={`M 100 100 L ${x1} ${y1} A 80 80 0 ${largeArc} 1 ${x2} ${y2} Z`}
                                  fill={cat.color}
                                  stroke="white"
                                  strokeWidth="2"
                                />
                              </g>
                            );
                          });
                        })()}
                      </svg>
                      
                      {/* Tooltip */}
                      {hoveredCategory && (
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg p-4 border border-slate-200 pointer-events-none z-10">
                          <p className="font-semibold text-slate-900">
                            {hoveredCategory}
                          </p>
                          <p className="text-sm text-slate-600">
                            {categoryDistribution.find(c => c.category === hoveredCategory)?.percentage.toFixed(1)}%
                          </p>
                          <p className="text-xs text-slate-500">
                            {categoryDistribution.find(c => c.category === hoveredCategory)?.count} trades
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Legend */}
                    <div className="flex-1 space-y-2">
                      {categoryDistribution.map((cat) => (
                        <div
                          key={cat.category}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                          onMouseEnter={() => setHoveredCategory(cat.category)}
                          onMouseLeave={() => setHoveredCategory(null)}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-4 h-4 rounded"
                              style={{ backgroundColor: cat.color }}
                            />
                            <span className="text-sm font-medium text-slate-700">{cat.category}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-sm text-slate-500">{cat.count} trades</span>
                            <span className="text-sm font-semibold text-slate-900 min-w-[3rem] text-right">
                              {cat.percentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-slate-500">
                    <p>No trade data available</p>
                  </div>
                )}
              </Card>

              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Top Performing Trades</h3>
                <div className="space-y-3">
                  {copiedTrades
                    .filter(t => t.user_closed_at || t.market_resolved)
                    .sort((a, b) => (b.roi || 0) - (a.roi || 0))
                    .slice(0, 5)
                    .map((trade) => (
                      <div key={trade.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 truncate">{trade.market_title}</p>
                          <p className="text-sm text-slate-500">{formatRelativeTime(trade.copied_at)}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge
                            className={cn(
                              "font-semibold",
                              trade.outcome === 'YES'
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-red-50 text-red-700 border-red-200"
                            )}
                          >
                            {trade.outcome}
                          </Badge>
                          <p className={cn(
                            "font-bold text-lg",
                            (trade.roi || 0) >= 0 ? "text-emerald-600" : "text-red-600"
                          )}>
                            {(trade.roi || 0) >= 0 ? '+' : ''}{(trade.roi || 0).toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    ))}
                  {copiedTrades.filter(t => t.user_closed_at || t.market_resolved).length === 0 && (
                    <p className="text-center py-8 text-slate-500">
                      No closed trades yet. Close some positions to see your top performers!
                    </p>
                  )}
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'settings' && (
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Notifications</h3>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-3">
                    {notificationsEnabled ? (
                      <Bell className="h-5 w-5 text-slate-600" />
                    ) : (
                      <BellOff className="h-5 w-5 text-slate-400" />
                    )}
                    <div>
                      <p className="font-medium text-slate-900">Email Notifications</p>
                      <p className="text-sm text-slate-500">Get notified when traders close positions</p>
                    </div>
                  </div>
                  <Button
                    onClick={handleToggleNotifications}
                    disabled={loadingNotificationPrefs}
                    variant={notificationsEnabled ? "default" : "outline"}
                    size="sm"
                  >
                    {notificationsEnabled ? 'Enabled' : 'Disabled'}
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Premium</h3>
                {isPremium ? (
                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Crown className="h-5 w-5 text-yellow-600" />
                      <p className="font-semibold text-yellow-900">Premium Member</p>
                    </div>
                    <p className="text-sm text-yellow-700">
                      You have access to all premium features including Real Copy trading.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-sm text-slate-600 mb-3">
                      Upgrade to Premium to unlock Real Copy trading and advanced features.
                    </p>
                    <Button
                      onClick={() => setShowUpgradeModal(true)}
                      className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                    >
                      <Crown className="mr-2 h-4 w-4" />
                      Upgrade to Premium
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Modals */}
      <UpgradeModal open={showUpgradeModal} onOpenChange={setShowUpgradeModal} />
      <ConnectWalletModal
        open={isConnectModalOpen}
        onOpenChange={setIsConnectModalOpen}
        onConnect={handleWalletConnect}
      />
      <EditCopiedTrade
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setTradeToEdit(null);
        }}
        trade={tradeToEdit ? {
          id: tradeToEdit.id,
          market: tradeToEdit.market_title,
          position: tradeToEdit.outcome as "YES" | "NO",
          entryPrice: tradeToEdit.price_when_copied,
          amount: tradeToEdit.amount_invested || 0,
        } : null}
        onSave={handleEditTrade}
      />
      <MarkTradeClosed
        isOpen={showCloseModal}
        onClose={() => {
          setShowCloseModal(false);
          setTradeToEdit(null);
        }}
        trade={tradeToEdit ? {
          id: tradeToEdit.id,
          market: tradeToEdit.market_title,
          position: tradeToEdit.outcome as "YES" | "NO",
          entryPrice: tradeToEdit.price_when_copied,
          currentPrice: tradeToEdit.current_price || tradeToEdit.price_when_copied,
        } : null}
        onConfirm={handleCloseTrade}
      />

      {/* Disconnect Wallet Confirmation Modal */}
      <Dialog open={showDisconnectModal} onOpenChange={setShowDisconnectModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-red-600">Disconnect Wallet?</DialogTitle>
            <DialogDescription className="text-slate-600 mt-2">
              This will remove your connected Polymarket wallet from Polycopy. You will need to reconnect it to use Real Copy trading features.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-red-900 mb-2">⚠️ Warning:</p>
              <ul className="text-sm text-red-800 space-y-1 list-disc list-inside">
                <li>You will lose access to automated trade execution</li>
                <li>Your private key will be removed from secure storage</li>
                <li>This action cannot be undone</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="confirm-text" className="text-sm font-medium text-slate-900">
                Type <span className="font-bold">YES</span> to confirm:
              </label>
              <Input
                id="confirm-text"
                type="text"
                placeholder="Type YES to confirm"
                value={disconnectConfirmText}
                onChange={(e) => setDisconnectConfirmText(e.target.value)}
                className="font-mono"
              />
            </div>
            
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDisconnectModal(false);
                  setDisconnectConfirmText('');
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleWalletDisconnect}
                disabled={disconnectConfirmText.toUpperCase() !== 'YES' || disconnectingWallet}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                {disconnectingWallet ? 'Disconnecting...' : 'Disconnect Wallet'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toast */}
      {showToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg">
            {toastMessage}
          </div>
        </div>
      )}
    </>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center">Loading...</div>}>
      <ProfilePageContent />
    </Suspense>
  );
}
