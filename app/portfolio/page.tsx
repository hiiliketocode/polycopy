'use client';

import React, { useState, useEffect, useRef, useMemo, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabase, ensureProfile } from '@/lib/supabase';
import { getOrRefreshSession } from '@/lib/auth/session';
import { resolveFeatureTier, tierHasPremiumAccess } from '@/lib/feature-tier';
import { triggerLoggedOut } from '@/lib/auth/logout-events';
import type { User } from '@supabase/supabase-js';
import { Navigation } from '@/components/polycopy/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UpgradeModal } from '@/components/polycopy/upgrade-modal';
import { ConnectWalletModal } from '@/components/polycopy/connect-wallet-modal';
import { SubscriptionSuccessModal } from '@/components/polycopy/subscription-success-modal';
import { MarkTradeClosed } from '@/components/polycopy/mark-trade-closed';
import { EditCopiedTrade } from '@/components/polycopy/edit-copied-trade';
import { OrdersScreen } from '@/components/orders/OrdersScreen';
import ClosePositionModal from '@/components/orders/ClosePositionModal';
import OrderRowDetails from '@/components/orders/OrderRowDetails';
import { ShareStatsModal } from '@/components/polycopy/share-stats-modal';
import type { OrderRow } from '@/lib/orders/types';
import type { PositionSummary } from '@/lib/orders/position';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Settings,
  Trash2,
  RotateCcw,
  Check,
  Info,
  ArrowUpRight,
  Share2,
  Loader2,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  AreaChart,
  BarChart,
  Bar,
  ReferenceLine,
  Area,
  Cell,
} from 'recharts';

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
  entry_size?: number | null;
  amount_invested: number | null;
  copied_at: string;
  trader_still_has_position: boolean;
  trader_closed_at: string | null;
  current_price: number | null;
  market_resolved: boolean;
  market_resolved_at: string | null;
  roi: number | null;
  pnl_usd?: number | null;
  user_closed_at: string | null;
  user_exit_price: number | null;
  resolved_outcome?: string | null;
  trade_method?: 'quick' | 'manual' | 'auto' | null;
  order_id?: string | null;
  copied_trade_id?: string | null;
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

type ProfileTab = 'trades' | 'performance';

const MIN_OPEN_POSITION_SIZE = 1e-4;
const ENABLE_LIVE_PRICE_REFRESH = false;

interface PortfolioStats {
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalVolume: number;
  roi: number;
  winRate: number;
  totalTrades: number;
  totalBuyTrades?: number;
  totalSellTrades?: number;
  openTrades: number;
  closedTrades: number;
  winningPositions?: number;
  losingPositions?: number;
}

interface RealizedPnlRow {
  date: string;
  realized_pnl: number;
  pnl_to_date: number | null;
}

// Helper: Format relative time
function formatRelativeTime(dateString: string): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
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

function formatDuration(durationMs: number | null): string {
  if (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0) return '—';
  const totalMinutes = Math.round(durationMs / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const totalHours = Math.round(totalMinutes / 60);
  if (totalHours < 24) return `${totalHours}h`;
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days}d ${hours}h`;
}

function formatTimestamp(dateString: string): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatOutcomeLabel(value: string | null | undefined) {
  if (!value) return 'Outcome';
  const trimmed = value.trim();
  if (!trimmed) return 'Outcome';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function normalizeOutcomeValue(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

function resolveResolvedOutcomeFromRaw(raw: any): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidates = [
    raw.resolved_outcome,
    raw.resolvedOutcome,
    raw.market?.resolved_outcome,
    raw.market?.resolvedOutcome,
    raw.market?.winning_outcome,
    raw.market?.winner_outcome,
    raw.market?.winner,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function isSettlementPrice(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return false;
  return Math.abs((value as number) - 1) < 1e-6 || Math.abs((value as number) - 0) < 1e-6;
}

function buildLiveMarketKey(marketId: string, outcome: string) {
  return `${marketId}:${outcome.toUpperCase()}`;
}

// Formatting functions for charts and stats
const formatSignedCurrency = (amount: number, decimals = 0) => {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(amount));
  if (amount > 0) return `+${formatted}`;
  if (amount < 0) return `-${formatted}`;
  return formatted;
};

const formatCompactCurrency = (amount: number) => {
  const abs = Math.abs(amount);
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
};

const formatAverageDaily = (amount: number) => {
  const abs = Math.abs(amount);
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return formatSignedCurrency(amount, 2);
};

const toDateObj = (dateStr: string) => new Date(`${dateStr}T00:00:00Z`);

function formatCompactNumber(value: number) {
  const absValue = Math.abs(value);
  if (absValue >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (absValue >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const fixed = value.toFixed(4);
  const trimmed = fixed.replace(/\.?0+$/, "");
  return `$${trimmed}`;
}

function formatContracts(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function getCopiedTradeTimestamp(trade: CopiedTrade) {
  const dateValue = trade.copied_at || (trade as any).created_at || null;
  if (!dateValue) return 0;
  const parsed = Date.parse(dateValue);
  if (Number.isNaN(parsed)) return 0;
  return parsed;
}

function mergeCopiedTrades(base: CopiedTrade[], extras: CopiedTrade[]) {
  const map = new Map<string, CopiedTrade>();
  base.forEach((trade) => map.set(trade.id, trade));
  extras.forEach((trade) => map.set(trade.id, trade));
  const merged = Array.from(map.values());
  merged.sort((a, b) => getCopiedTradeTimestamp(b) - getCopiedTradeTimestamp(a));
  return merged;
}

type OrderIdentifier = {
  column: 'copied_trade_id' | 'order_id';
  value: string;
};

function resolveOrderIdentifier(trade: CopiedTrade): OrderIdentifier | null {
  if (trade.copied_trade_id) {
    return { column: 'copied_trade_id', value: trade.copied_trade_id };
  }
  const fallback = trade.order_id ?? trade.id;
  if (fallback) {
    return { column: 'order_id', value: fallback };
  }
  return null;
}

const buildPositionKey = (marketId?: string | null, outcome?: string | null) => {
  if (!marketId || !outcome) return null;
  return `${marketId.toLowerCase()}::${outcome.toUpperCase()}`;
};

function ProfilePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [followingCount, setFollowingCount] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);
  
  // Premium and trading wallet state
  const [profile, setProfile] = useState<any>(null);
  const featureTier = resolveFeatureTier(Boolean(user), profile);
  const hasPremiumAccess = tierHasPremiumAccess(featureTier);
  const hasConnectedWallet = Boolean(profile?.trading_wallet_address);
  const canExecuteTrades = hasPremiumAccess && hasConnectedWallet;
  
  // Copied trades state
  const [copiedTradesBase, setCopiedTradesBase] = useState<CopiedTrade[]>([]);
  const [autoCopyExtras, setAutoCopyExtras] = useState<CopiedTrade[]>([]);
  const copiedTrades = useMemo(
    () => mergeCopiedTrades(copiedTradesBase, autoCopyExtras),
    [copiedTradesBase, autoCopyExtras]
  );
  const [loadingCopiedTrades, setLoadingCopiedTrades] = useState(true);
  const [portfolioTradesTotal, setPortfolioTradesTotal] = useState<number | null>(null);
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);
  const [expandedQuickDetailsId, setExpandedQuickDetailsId] = useState<string | null>(null);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [tradeFilter, setTradeFilter] = useState<'all' | 'open' | 'closed' | 'resolved' | 'history'>('open');
  const [tradeSort, setTradeSort] = useState<'date' | 'invested' | 'currentValue' | 'roi'>('date');
  const [mobileMetric, setMobileMetric] = useState<'price' | 'size' | 'roi' | 'time'>('price');
  const [portfolioStats, setPortfolioStats] = useState<PortfolioStats | null>(null);
  const [portfolioStatsLoading, setPortfolioStatsLoading] = useState(false);
  const [portfolioStatsError, setPortfolioStatsError] = useState<string | null>(null);
  
  // Realized PnL chart state
  const [realizedPnlRows, setRealizedPnlRows] = useState<RealizedPnlRow[]>([]);
  const [loadingRealizedPnl, setLoadingRealizedPnl] = useState(false);
  const [realizedPnlError, setRealizedPnlError] = useState<string | null>(null);
  const [pnlWindow, setPnlWindow] = useState<'1D' | '7D' | '30D' | '90D' | '1Y' | 'ALL'>('30D');
  const [pnlView, setPnlView] = useState<'daily' | 'cumulative'>('daily');
  
  // Quick trades (orders) state  
  const [quickTrades, setQuickTrades] = useState<OrderRow[]>([]);
  const [loadingQuickTrades, setLoadingQuickTrades] = useState(true);
  const [marketMeta, setMarketMeta] = useState<
    Map<
      string,
      {
        title: string | null;
        image: string | null;
        slug?: string | null;
      }
    >
  >(new Map());
  const [positions, setPositions] = useState<PositionSummary[]>([]);
  const [closeTarget, setCloseTarget] = useState<{ order: OrderRow; position: PositionSummary } | null>(null);
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeSuccess, setCloseSuccess] = useState<string | null>(null);
  const [closeOrderId, setCloseOrderId] = useState<string | null>(null);
  const [closeSubmittedAt, setCloseSubmittedAt] = useState<string | null>(null);
  
  // Performance tab data
  const [positionSizeBuckets, setPositionSizeBuckets] = useState<PositionSizeBucket[]>([]);
  const [categoryDistribution, setCategoryDistribution] = useState<CategoryDistribution[]>([]);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [hoveredBucket, setHoveredBucket] = useState<{ range: string; count: number; percentage: number; x: number; y: number } | null>(null);
  const [showAllTraders, setShowAllTraders] = useState(false);
  const [topTradersStats, setTopTradersStats] = useState<Array<{
    trader_id: string;
    trader_name: string;
    trader_wallet: string;
    copy_count: number;
    total_invested: number;
    pnl: number;
    roi: number;
    win_rate: number;
  }>>([]);
  
  // Edit/Close trade modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [tradeToEdit, setTradeToEdit] = useState<CopiedTrade | null>(null);
  
  // Toast state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // UI state - Check for tab query parameter
  const tabParam = searchParams?.get('tab');
  const preferredDefaultTab: ProfileTab = 'trades';
  const initialTab =
    tabParam === 'performance' || tabParam === 'trades'
      ? (tabParam as ProfileTab)
      : preferredDefaultTab;
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);
  const hasAppliedPreferredTab = useRef(false);
  const buildTabUrl = useCallback((tab: ProfileTab) => {
    const params = new URLSearchParams(searchParams?.toString());
    params.set('tab', tab);
    const queryString = params.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  }, [pathname, searchParams]);

  const currentUrl = useMemo(() => {
    const queryString = searchParams?.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  }, [pathname, searchParams]);

  const handleTabChange = useCallback((tab: ProfileTab) => {
    setActiveTab(tab);
    const nextUrl = buildTabUrl(tab);
    if (nextUrl !== currentUrl) {
      router.replace(nextUrl, { scroll: false });
    }
  }, [buildTabUrl, currentUrl, router]);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [showSubscriptionSuccessModal, setShowSubscriptionSuccessModal] = useState(false);
  const [isShareStatsModalOpen, setIsShareStatsModalOpen] = useState(false);

  // Check for upgrade success in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgrade') === 'success') {
      setShowSubscriptionSuccessModal(true);
      // Clean up URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    } else if (params.get('upgrade') === 'true') {
      // Open upgrade modal when upgrade=true in URL
      setShowUpgradeModal(true);
      // Clean up URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);
  
  // Polymarket username state
  const [polymarketUsername, setPolymarketUsername] = useState<string | null>(null);
  
  // Profile image state
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  
  // Pagination state for copied trades
  const [tradesToShow, setTradesToShow] = useState(50);
  
  // Live market data (prices and scores)
  const [liveMarketData, setLiveMarketData] = useState<Map<string, { 
    price: number; 
    score?: string;
    closed?: boolean;
  }>>(new Map());
  
  // Refs to prevent re-fetching on tab focus
  const hasLoadedStatsRef = useRef(false);
  const hasLoadedTradesRef = useRef(false);
  const hasLoadedQuickTradesRef = useRef(false);
  const hasLoadedPositionsRef = useRef(false);

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      setLoading(true);

      try {
        const { session } = await getOrRefreshSession();

        if (!session?.user) {
          triggerLoggedOut('session_missing');
          router.push('/login');
          return;
        }

        setUser(session.user);
        await ensureProfile(session.user.id, session.user.email!);
      } catch (err) {
        console.error('Auth error:', err);
        triggerLoggedOut('auth_error');
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        triggerLoggedOut('signed_out');
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

  // Sync tab from URL parameter
  useEffect(() => {
    if (tabParam === 'performance' || tabParam === 'trades') {
      setActiveTab(tabParam as ProfileTab);
    } else if (!tabParam && !hasAppliedPreferredTab.current && !loadingStats) {
      // Set default tab on initial load if no tab param
      hasAppliedPreferredTab.current = true;
      setActiveTab(preferredDefaultTab);
    }
  }, [tabParam, loadingStats, preferredDefaultTab]);

  useEffect(() => {
    if (tabParam === 'settings') {
      router.replace('/settings');
    }
  }, [tabParam, router]);

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
      setPortfolioTradesTotal(null);
      try {
        const allTrades: CopiedTrade[] = [];
        let page = 1;
        let hasMore = true;
        const MAX_PAGES = 10; // cap to avoid runaway fetch
        let totalTradesFromApi: number | null = null;

        while (hasMore && page <= MAX_PAGES) {
          const response = await fetch(
            `/api/portfolio/trades?userId=${user.id}&page=${page}&pageSize=50`,
            { cache: 'no-store' }
          );
          if (!response.ok) {
            const errorText = await response.text();
            console.error('Error fetching portfolio trades:', errorText);
            throw new Error(errorText || 'Failed to fetch portfolio trades');
          }

          const payload = await response.json();
          if (typeof payload?.total === 'number') {
            totalTradesFromApi = payload.total;
          }
          const trades = (payload?.trades || []) as CopiedTrade[];
          allTrades.push(...trades);

          hasMore = Boolean(payload?.hasMore);
          page += 1;
        }

        setPortfolioTradesTotal(totalTradesFromApi);

        // Normalize ROI for user-closed trades if missing
        const tradesWithCorrectRoi = allTrades.map(trade => {
          const tradePrice = trade.price_when_copied;
          const copiedAt = trade.copied_at || (trade as any).created_at || null;
          if (trade.user_closed_at && trade.user_exit_price && tradePrice) {
            const correctRoi = ((trade.user_exit_price - tradePrice) / tradePrice) * 100;
            return {
              ...trade,
              copied_at: copiedAt,
              roi: parseFloat(correctRoi.toFixed(2)),
            };
          }
          return {
            ...trade,
            copied_at: copiedAt,
          };
        });

        setCopiedTradesBase(tradesWithCorrectRoi);

        // Fetch live market data for the trades (disabled: server now returns cached prices)
        if (ENABLE_LIVE_PRICE_REFRESH) {
          fetchLiveMarketData(tradesWithCorrectRoi);
        }
      } catch (err) {
        console.error('Error fetching portfolio trades:', err);
        setCopiedTradesBase([]);
      } finally {
        setLoadingCopiedTrades(false);
      }
    };

    fetchCopiedTrades();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const fetchAutoCopyLogs = async () => {
      try {
        const response = await fetch('/api/auto-copy/logs', { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load auto copy logs');
        }

        const normalized = (payload?.logs || []).map((log: any) => {
          const executedAt = log.executed_at || log.created_at || new Date().toISOString();
          const normalizedTrade: CopiedTrade = {
            id: log.id,
            trader_wallet: log.trader_wallet,
            trader_username: log.trader_username ?? null,
            trader_profile_image_url: log.trader_profile_image_url ?? null,
            market_id: log.market_id ?? '',
            market_title: log.market_title ?? 'Auto copy trade',
            market_slug: log.market_slug ?? null,
            market_avatar_url: log.market_avatar_url ?? null,
            outcome: log.outcome ?? 'Outcome',
            price_when_copied: Number(log.price ?? log.amount_usd ?? 0) || 0,
            entry_size: log.size ?? null,
            amount_invested: log.amount_usd ?? null,
            copied_at: executedAt,
            trader_still_has_position: true,
            trader_closed_at: null,
            current_price: log.price ?? null,
            market_resolved: false,
            market_resolved_at: null,
            roi: null,
            pnl_usd: null,
            user_closed_at: null,
            user_exit_price: null,
            resolved_outcome: null,
            trade_method: 'auto'
          };
          (normalizedTrade as any).created_at = log.created_at ?? executedAt;
          return normalizedTrade;
        });

        setAutoCopyExtras(normalized);
      } catch (err) {
        console.error('Error loading auto copy logs:', err);
      }
    };

    fetchAutoCopyLogs();
  }, [user]);

  // Fetch quick trades (orders) from /api/orders
  useEffect(() => {
    if (!user || hasLoadedQuickTradesRef.current) return;
    hasLoadedQuickTradesRef.current = true;

    const fetchQuickTrades = async () => {
      setLoadingQuickTrades(true);
      try {
        const response = await fetch('/api/orders', { cache: 'no-store' });
        const data = await response.json();

        if (!response.ok) {
          console.error('Error fetching orders:', data.error);
          setQuickTrades([]);
          setLoadingQuickTrades(false);
          return;
        }

        setQuickTrades(data.orders || []);
        
        // Fetch positions for sell button functionality using the correct endpoint
        if (data.orders && data.orders.length > 0) {
          try {
            const positionsResponse = await fetch('/api/polymarket/positions', { cache: 'no-store' });
            if (positionsResponse.ok) {
              const positionsData = await positionsResponse.json();
              setPositions(positionsData.positions || []);
            }
          } catch (err) {
            console.error('Error fetching positions:', err);
          }
        }
      } catch (err) {
        console.error('Error fetching quick trades:', err);
        setQuickTrades([]);
      } finally {
        setLoadingQuickTrades(false);
      }
    };

    fetchQuickTrades();
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const idsToFetch = Array.from(
      new Set(
        [...quickTrades, ...copiedTrades]
          .map((trade) => {
            if ('marketId' in trade) {
              return trade.marketId?.trim() || null;
            }
            return trade.market_id?.trim() || null;
          })
          .filter((id): id is string => Boolean(id))
      )
    ).filter((id) => !marketMeta.has(id));

    if (idsToFetch.length === 0) return () => {
      cancelled = true;
    };

    const fetchMeta = async () => {
      const entries: Array<[string, { title: string | null; image: string | null; slug?: string | null }]> = [];
      await Promise.allSettled(
        idsToFetch.map(async (conditionId) => {
          try {
            const resp = await fetch(`/api/polymarket/market?conditionId=${encodeURIComponent(conditionId)}`, {
              cache: 'no-store',
            });
            if (!resp.ok) return;
            const data = await resp.json();
            entries.push([
              conditionId,
              {
                title: data?.question ?? null,
                image: data?.icon ?? data?.image ?? null,
                slug: data?.slug ?? null,
              },
            ]);
          } catch {
            /* ignore fetch errors */
          }
        })
      );

      if (!cancelled && entries.length > 0) {
        setMarketMeta((prev) => {
          const next = new Map(prev);
          entries.forEach(([id, meta]) => next.set(id, meta));
          return next;
        });
      }
    };

    fetchMeta();
    return () => {
      cancelled = true;
    };
  }, [quickTrades, copiedTrades, marketMeta]);

  const refreshPositions = useCallback(async (): Promise<PositionSummary[] | null> => {
    try {
      const positionsResponse = await fetch('/api/polymarket/positions', { cache: 'no-store' });
      if (!positionsResponse.ok) return null;
      const positionsData = await positionsResponse.json();
      const nextPositions = positionsData.positions || [];
      setPositions(nextPositions);
      return nextPositions;
    } catch (err) {
      console.error('Error refreshing positions:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!user || !hasConnectedWallet || hasLoadedPositionsRef.current) return;
    hasLoadedPositionsRef.current = true;
    refreshPositions().catch(() => {
      /* best effort */
    });
  }, [user, hasConnectedWallet, refreshPositions]);

  // Fetch aggregated portfolio stats (realized + unrealized PnL)
  useEffect(() => {
    if (!user) return;

    const fetchPortfolioStats = async () => {
      setPortfolioStatsLoading(true);
      setPortfolioStatsError(null);
      try {
        const response = await fetch(`/api/portfolio/stats?userId=${user.id}`, { cache: 'no-store' });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || 'Failed to fetch portfolio stats');
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const message = await response.text();
          console.error('Portfolio stats returned non-JSON response:', message.slice(0, 200));
          throw new Error('Invalid portfolio stats response');
        }

        const data = await response.json();
        setPortfolioStats({
          totalPnl: data.totalPnl ?? 0,
          realizedPnl: data.realizedPnl ?? 0,
          unrealizedPnl: data.unrealizedPnl ?? 0,
          totalVolume: data.totalVolume ?? 0,
          roi: data.roi ?? 0,
          winRate: data.winRate ?? 0,
          totalTrades: data.totalTrades ?? data.totalBuyTrades ?? 0,
          totalBuyTrades: data.totalBuyTrades ?? data.totalTrades ?? 0,
          totalSellTrades: data.totalSellTrades ?? 0,
          openTrades: data.openTrades ?? 0,
          closedTrades: data.closedTrades ?? 0,
          winningPositions: data.winningPositions ?? 0,
          losingPositions: data.losingPositions ?? 0,
        });
      } catch (err: any) {
        console.error('Error fetching portfolio stats:', err);
        setPortfolioStatsError(err?.message || 'Failed to load portfolio stats');
      } finally {
        setPortfolioStatsLoading(false);
      }
    };

    fetchPortfolioStats();
  }, [user]);

  // Fetch realized PnL daily series
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const controller = new AbortController();

    const loadRealizedPnl = async () => {
      if (!cancelled) {
        setLoadingRealizedPnl(true);
        setRealizedPnlError(null);
      }
      try {
        const response = await fetch(`/api/portfolio/realized-pnl?userId=${user.id}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch realized PnL`);
        }
        const data = await response.json();
        const daily = Array.isArray(data?.daily)
          ? data.daily
              .map((row: any) => ({
                date: row?.date,
                realized_pnl: Number(row?.realized_pnl ?? 0),
                pnl_to_date:
                  row?.pnl_to_date === null || row?.pnl_to_date === undefined
                    ? null
                    : Number(row.pnl_to_date),
              }))
              .filter((row: RealizedPnlRow) => row.date && Number.isFinite(row.realized_pnl))
              .sort((a: RealizedPnlRow, b: RealizedPnlRow) => new Date(a.date).getTime() - new Date(b.date).getTime())
          : [];
        if (!cancelled) {
          setRealizedPnlRows(daily);
        }
      } catch (err: any) {
        if (controller.signal.aborted) return;
        console.error('Error fetching realized PnL:', err);
        if (!cancelled) {
          setRealizedPnlRows([]);
          setRealizedPnlError(err?.message || 'Failed to load realized PnL');
        }
      } finally {
        if (!cancelled) {
          setLoadingRealizedPnl(false);
        }
      }
    };

    loadRealizedPnl();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [user]);

  // Fetch top traders stats (realized-only, FIFO position-based)
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const controller = new AbortController();

    const loadTopTraders = async () => {
      try {
        const response = await fetch(`/api/portfolio/top-traders`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch top traders stats`);
        }
        const data = await response.json();
        if (!cancelled) {
          setTopTradersStats(Array.isArray(data.traders) ? data.traders : []);
        }
      } catch (err: any) {
        if (controller.signal.aborted) return;
        console.error('Error fetching top traders stats:', err);
        if (!cancelled) {
          setTopTradersStats([]);
        }
      }
    };

    loadTopTraders();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [user]);

  // Fetch live market data (prices and scores)
  const fetchLiveMarketData = async (trades: CopiedTrade[], unifiedTrades: UnifiedTrade[] = []) => {
    const outcomeTargets = new Map<string, Set<string>>();
    const manualTargets = trades.filter(
      (t) => !t.user_closed_at && !t.market_resolved && t.market_id && t.outcome
    );
    const unifiedTargets = unifiedTrades.filter(
      (t) => t.status === 'open' && t.market_id && t.outcome
    );

    for (const trade of manualTargets) {
      const key = trade.market_id;
      if (!outcomeTargets.has(key)) outcomeTargets.set(key, new Set());
      outcomeTargets.get(key)!.add(trade.outcome);
    }

    for (const trade of unifiedTargets) {
      const key = trade.market_id;
      if (!outcomeTargets.has(key)) outcomeTargets.set(key, new Set());
      outcomeTargets.get(key)!.add(trade.outcome);
    }

    const uniqueMarketIds = [...outcomeTargets.keys()];
    if (uniqueMarketIds.length === 0) {
      setLiveMarketData(new Map());
      return;
    }

    const newLiveData = new Map<string, { price: number; score?: string; closed?: boolean }>();
    
    console.log(`📊 Fetching live data for ${uniqueMarketIds.length} markets`);
    
    await Promise.all(
      uniqueMarketIds.map(async (marketId) => {
        try {
          // Fetch current price from Polymarket API
          const priceResponse = await fetch(`/api/polymarket/price?conditionId=${marketId}`);
          if (priceResponse.ok) {
            const priceData = await priceResponse.json();

            if (priceData.success && priceData.market) {
              const { outcomes, outcomePrices, closed, resolved } = priceData.market;
              const marketResolved = resolved === true || Boolean(closed);
              const outcomeSet = outcomeTargets.get(marketId) || new Set<string>();
              for (const outcome of outcomeSet) {
                const outcomeIndex = outcomes?.findIndex((o: string) => o.toUpperCase() === outcome.toUpperCase());
                if (outcomeIndex !== -1 && outcomePrices && outcomePrices[outcomeIndex]) {
                  const price = Number(outcomePrices[outcomeIndex]);
                  newLiveData.set(buildLiveMarketKey(marketId, outcome), {
                    price,
                    closed: marketResolved,
                  });
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

    // Apply live prices to open trades so PnL is mark-to-market
    if (newLiveData.size > 0) {
      setCopiedTradesBase((prev) => {
        let changed = false;
        const next = prev.map((trade) => {
          if (!trade.market_id || trade.user_closed_at || trade.market_resolved) return trade;
          const live = newLiveData.get(buildLiveMarketKey(trade.market_id, trade.outcome));
          if (!live || trade.current_price === live.price) return trade;
          changed = true;
          return {
            ...trade,
            current_price: live.price,
          };
        });
        return changed ? next : prev;
      });
    }
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

    // Top Traders Stats will be fetched from API (using FIFO position-based calculation)
  }, [copiedTrades]);


  // Calculate stats
  const calculateStats = (): PortfolioStats => {
    const invested = (trade: CopiedTrade) => {
      if (trade.amount_invested !== null && trade.amount_invested !== undefined) {
        return trade.amount_invested;
      }
      if (trade.entry_size && trade.price_when_copied) {
        return trade.entry_size * trade.price_when_copied;
      }
      return 0;
    };

    const pnlValue = (trade: CopiedTrade) => {
      if (trade.pnl_usd !== null && trade.pnl_usd !== undefined) return trade.pnl_usd;

      const entryPrice = trade.price_when_copied || null;
      const exitPrice =
        trade.user_exit_price ??
        trade.current_price ??
        null;
      const size = trade.entry_size ?? null;

      if (entryPrice !== null && exitPrice !== null && size !== null) {
        return (exitPrice - entryPrice) * size;
      }

      if (trade.roi !== null && trade.roi !== undefined) {
        return invested(trade) * (trade.roi / 100);
      }

      return 0;
    };

    const openTrades = copiedTrades.filter(t => !t.user_closed_at && !t.market_resolved);
    const closedTrades = copiedTrades.filter(t => t.user_closed_at || t.market_resolved);

    const realizedPnl = closedTrades.reduce((sum, trade) => sum + pnlValue(trade), 0);
    const unrealizedPnl = openTrades.reduce((sum, trade) => sum + pnlValue(trade), 0);
    const totalPnl = realizedPnl + unrealizedPnl;

    const totalVolume = copiedTrades.reduce((sum, trade) => sum + invested(trade), 0);

    const actualRoi = totalVolume > 0 ? (totalPnl / totalVolume) * 100 : 0;

    const winningTrades = closedTrades.filter(t => pnlValue(t) > 0).length;
    const winRate = closedTrades.length > 0 ? (winningTrades / closedTrades.length) * 100 : 0;

    // Debug: Check how many open trades have prices
    const openTradesWithPrices = openTrades.filter(t => t.current_price !== null).length;
    const openTradesWithoutPrices = openTrades.length - openTradesWithPrices;
    
    console.log('📊 Fallback Calculation Detail:', {
      openTrades: openTrades.length,
      openWithPrices: openTradesWithPrices,
      openWithoutPrices: openTradesWithoutPrices,
      closedTrades: closedTrades.length,
      realizedPnl: realizedPnl.toFixed(2),
      unrealizedPnl: unrealizedPnl.toFixed(2),
      totalPnl: totalPnl.toFixed(2),
      sampleOpenTrades: openTrades.slice(0, 5).map(t => ({
        market: t.market_title?.substring(0, 30),
        entryPrice: t.price_when_copied,
        currentPrice: t.current_price,
        size: t.entry_size,
        pnl: pnlValue(t).toFixed(2)
      }))
    });

    return {
      totalPnl,
      roi: actualRoi,
      totalVolume,
      winRate: Math.round(winRate),
      realizedPnl,
      unrealizedPnl,
      totalTrades: copiedTrades.length,
      openTrades: openTrades.length,
      closedTrades: closedTrades.length,
    };
  };

  const fallbackStats = calculateStats();
  const userStats = portfolioStats ?? fallbackStats;

  // PnL window options
  const pnlWindowOptions = [
    { key: '1D' as const, label: '1 Day', days: 1 },
    { key: '7D' as const, label: '7 Days', days: 7 },
    { key: '30D' as const, label: '30 Days', days: 30 },
    { key: '90D' as const, label: '90 Days', days: 90 },
    { key: '1Y' as const, label: '1 Year', days: 365 },
    { key: 'ALL' as const, label: 'All Time', days: null },
  ];

  const pnlWindowLabel = useMemo(
    () => pnlWindowOptions.find((option) => option.key === pnlWindow)?.label ?? '90 Days',
    [pnlWindow]
  );

  // Sorted copy for consistent first/last dates
  const sortedPnlRows = useMemo(
    () => [...realizedPnlRows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [realizedPnlRows]
  );

  // True when the selected window encompasses all of the user's data (e.g. 1Y selected but only a few weeks of data)
  const windowCoversAllData = useMemo(() => {
    if (sortedPnlRows.length === 0) return false;
    const option = pnlWindowOptions.find((entry) => entry.key === pnlWindow) ?? pnlWindowOptions[3];
    if (option.key === 'ALL' || option.days === null) return true;
    const firstDataDate = toDateObj(sortedPnlRows[0].date);
    const lastDataDate = toDateObj(sortedPnlRows[sortedPnlRows.length - 1].date);
    const todayStr = new Date().toISOString().slice(0, 10);
    const anchorDate =
      sortedPnlRows[sortedPnlRows.length - 1].date === todayStr && sortedPnlRows.length > 1
        ? toDateObj(sortedPnlRows[sortedPnlRows.length - 2].date)
        : lastDataDate;
    const start = new Date(Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), anchorDate.getUTCDate()));
    start.setUTCDate(start.getUTCDate() - (option.days - 1));
    return start <= firstDataDate;
  }, [pnlWindow, sortedPnlRows]);

  // Filter realized PnL rows by window
  const realizedWindowRows = useMemo(() => {
    if (sortedPnlRows.length === 0) return [];
    const option = pnlWindowOptions.find((entry) => entry.key === pnlWindow) ?? pnlWindowOptions[3];

    if (option.key === 'ALL' || option.days === null) {
      return sortedPnlRows;
    }

    const firstDataDate = toDateObj(sortedPnlRows[0].date);
    let anchorDate = toDateObj(sortedPnlRows[sortedPnlRows.length - 1].date);
    const todayStr = new Date().toISOString().slice(0, 10);
    if (sortedPnlRows[sortedPnlRows.length - 1].date === todayStr && sortedPnlRows.length > 1) {
      anchorDate = toDateObj(sortedPnlRows[sortedPnlRows.length - 2].date);
    }

    const start = new Date(Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), anchorDate.getUTCDate()));
    start.setUTCDate(start.getUTCDate() - (option.days - 1));
    const windowLongerThanSpan = start <= firstDataDate;

    let startDate: Date | null = windowLongerThanSpan ? null : start;
    let endDate: Date | null = windowLongerThanSpan ? null : anchorDate;

    return sortedPnlRows.filter((row) => {
      const day = toDateObj(row.date);
      if (startDate && day < startDate) return false;
      if (endDate && day > endDate) return false;
      return true;
    });
  }, [sortedPnlRows, pnlWindow]);

  // Build chart series
  const realizedChartSeries = useMemo(() => {
    let running = 0;
    return realizedWindowRows.map((row) => {
      running += row.realized_pnl;
      return {
        date: row.date,
        dailyPnl: row.realized_pnl,
        cumulativePnl: running,
      };
    });
  }, [realizedWindowRows]);

  // Calculate summary stats from chart data
  const realizedSummary = useMemo(() => {
    const totalPnl = realizedWindowRows.reduce((acc, row) => acc + (row.realized_pnl || 0), 0);
    const avgDaily = realizedWindowRows.length > 0 ? totalPnl / realizedWindowRows.length : 0;
    const daysUp = realizedWindowRows.filter((row) => row.realized_pnl > 0).length;
    const daysDown = realizedWindowRows.filter((row) => row.realized_pnl < 0).length;
    const daysActive = realizedWindowRows.filter((row) => row.realized_pnl !== 0).length;
    return { totalPnl, avgDaily, daysUp, daysDown, daysActive };
  }, [realizedWindowRows]);

  // Use portfolio stats (top card) as single source of truth whenever the window covers all data.
  // E.g. "1 Year" selected but user has only a few weeks → same total as "All Time".
  const chartSectionTotalPnl = windowCoversAllData ? userStats.realizedPnl : realizedSummary.totalPnl;
  const chartSectionAvgDaily =
    windowCoversAllData && realizedSummary.daysActive > 0
      ? userStats.realizedPnl / realizedSummary.daysActive
      : realizedSummary.avgDaily;

  const realizedRangeLabel = useMemo(() => {
    if (realizedWindowRows.length === 0) return pnlWindowLabel;
    const start = new Date(`${realizedWindowRows[0].date}T00:00:00Z`);
    const end = new Date(`${realizedWindowRows[realizedWindowRows.length - 1].date}T00:00:00Z`);
    const format = (date: Date) =>
      date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    return `${format(start)} - ${format(end)}`;
  }, [realizedWindowRows, pnlWindowLabel]);

  const dailyBarSize = useMemo(() => {
    const length = realizedChartSeries.length;
    if (length <= 1) return 56;
    if (length <= 3) return 36;
    if (length <= 7) return 24;
    if (length <= 14) return 18;
    return 10;
  }, [realizedChartSeries.length]);

  const dailyBarGap = realizedChartSeries.length <= 2 ? '10%' : '25%';

  const tradeStats = useMemo(() => {
    const windowDays = 30;
    const windowMs = windowDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const getInvested = (trade: CopiedTrade) => {
      if (trade.amount_invested !== null && trade.amount_invested !== undefined) {
        return trade.amount_invested;
      }
      if (trade.entry_size && trade.price_when_copied) {
        return trade.entry_size * trade.price_when_copied;
      }
      return 0;
    };

    const getReturnPct = (trade: CopiedTrade) => {
      if (Number.isFinite(trade.roi ?? NaN)) return trade.roi as number;
      const entry = trade.price_when_copied;
      if (!entry) return null;
      const exit = trade.user_exit_price ?? trade.current_price ?? null;
      if (exit === null || exit === undefined) return null;
      return ((exit - entry) / entry) * 100;
    };

    const getOpenTimestamp = (trade: CopiedTrade) => {
      const ts = Date.parse(trade.copied_at || '');
      return Number.isFinite(ts) ? ts : null;
    };

    const getCloseTimestamp = (trade: CopiedTrade) => {
      const candidate = trade.user_closed_at || trade.market_resolved_at || trade.trader_closed_at;
      if (!candidate) return null;
      const ts = Date.parse(candidate);
      return Number.isFinite(ts) ? ts : null;
    };

    const tradesWithTime = copiedTrades
      .map((trade) => {
        const ts = getOpenTimestamp(trade);
        return ts ? { trade, ts } : null;
      })
      .filter((entry): entry is { trade: CopiedTrade; ts: number } => entry !== null);

    const lastTradeTs = tradesWithTime.length > 0
      ? Math.max(...tradesWithTime.map((entry) => entry.ts))
      : null;

    const recentTrades = tradesWithTime.filter(({ ts }) => now - ts <= windowMs);
    const tradesPerWeek = recentTrades.length > 0 ? recentTrades.length / (windowDays / 7) : 0;
    const frequencyLabel =
      tradesPerWeek === 0 ? 'None' : tradesPerWeek >= 5 ? 'High' : tradesPerWeek >= 2 ? 'Medium' : 'Low';

    const activeDays = new Set(
      recentTrades.map(({ ts }) => new Date(ts).toISOString().slice(0, 10))
    ).size;

    const amounts = copiedTrades
      .map(getInvested)
      .filter((value) => Number.isFinite(value) && value > 0);
    const avgTradeSize =
      amounts.length > 0 ? amounts.reduce((sum, value) => sum + value, 0) / amounts.length : null;

    const closedTrades = copiedTrades.filter((trade) => trade.user_closed_at || trade.market_resolved);
    const returns = closedTrades
      .map(getReturnPct)
      .filter((value): value is number => value !== null && Number.isFinite(value));
    const avgReturn =
      returns.length > 0 ? returns.reduce((sum, value) => sum + value, 0) / returns.length : null;

    const holdDurations = closedTrades
      .map((trade) => {
        const openTs = getOpenTimestamp(trade);
        const closeTs = getCloseTimestamp(trade);
        if (openTs === null || closeTs === null) return null;
        const diff = closeTs - openTs;
        return diff > 0 ? diff : null;
      })
      .filter((value): value is number => value !== null);
    const avgHoldMs =
      holdDurations.length > 0 ? holdDurations.reduce((sum, value) => sum + value, 0) / holdDurations.length : null;

    const recentClosed = closedTrades
      .map((trade) => {
        const ts = getCloseTimestamp(trade) ?? getOpenTimestamp(trade);
        return ts ? { trade, ts } : null;
      })
      .filter((entry): entry is { trade: CopiedTrade; ts: number } => entry !== null)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 10);

    const consistency =
      recentClosed.length > 0
        ? (recentClosed.filter(({ trade }) => {
            const value = getReturnPct(trade);
            return value !== null && value > 0;
          }).length / recentClosed.length) * 100
        : null;

    return {
      lastTradeTs,
      tradesPerWeek,
      frequencyLabel,
      activeDays,
      avgTradeSize,
      avgReturn,
      avgHoldMs,
      consistency,
      consistencySampleSize: recentClosed.length,
    };
  }, [copiedTrades]);

  const lastTradeLabel = tradeStats.lastTradeTs
    ? formatRelativeTime(new Date(tradeStats.lastTradeTs).toISOString())
    : '—';

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
      
      setCopiedTradesBase(tradesWithFreshStatus);
      
      // Also refresh live market data (disabled: rely on cached prices from API)
      if (ENABLE_LIVE_PRICE_REFRESH) {
        await fetchLiveMarketData(tradesWithFreshStatus);
      }
      await refreshPositions();
      
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


  // Edit trade handler
  const handleEditTrade = async (entryPrice: number, amountInvested: number | null) => {
    if (!user || !tradeToEdit) return;
    const identifier = resolveOrderIdentifier(tradeToEdit);
    if (!identifier) {
      console.error('[Profile] Unable to identify trade for edit', tradeToEdit);
      return;
    }
    
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          price_when_copied: entryPrice,
          amount_invested: amountInvested,
        })
        .eq(identifier.column, identifier.value)
        .eq('copy_user_id', user.id);
      
      if (error) throw error;
      
      // Update local state
      setCopiedTradesBase(trades =>
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
    const identifier = resolveOrderIdentifier(tradeToEdit);
    if (!identifier) {
      console.error('[Profile] Unable to identify trade for closing', tradeToEdit);
      return;
    }
    
    try {
      const roi = ((exitPrice - tradeToEdit.price_when_copied) / tradeToEdit.price_when_copied) * 100;
      
      const { error } = await supabase
        .from('orders')
        .update({
          user_closed_at: new Date().toISOString(),
          user_exit_price: exitPrice,
          roi: parseFloat(roi.toFixed(2)),
        })
        .eq(identifier.column, identifier.value)
        .eq('copy_user_id', user.id);
      
      if (error) throw error;
      
      // Update local state
      setCopiedTradesBase(trades =>
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
    
    const identifier = resolveOrderIdentifier(trade);
    if (!identifier) {
      console.error('[Profile] Unable to identify trade for unmarking closed', trade);
      return;
    }
    
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          user_closed_at: null,
          user_exit_price: null,
        })
        .eq(identifier.column, identifier.value)
        .eq('copy_user_id', user.id);
      
      if (error) throw error;
      
      // Update local state
      setCopiedTradesBase(trades =>
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
      setCopiedTradesBase(trades => trades.filter(t => t.id !== trade.id));

      setToastMessage(payload.message || 'Trade deleted!');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error('Error deleting trade:', err);
    }
  };


  // Handle confirm close for quick trades
  const handleConfirmClose = async ({
    tokenId,
    amount,
    price,
    slippagePercent,
    orderType,
    isClosingFullPosition,
  }: {
    tokenId: string;
    amount: number;
    price: number;
    slippagePercent: number;
    orderType: 'FAK' | 'GTC';
    isClosingFullPosition?: boolean;
  }) => {
    const positionSide = closeTarget?.position.side;
    const sideForClose: 'BUY' | 'SELL' = positionSide === 'SELL' ? 'BUY' : 'SELL';

    if (!closeTarget) {
      setCloseError('No position selected to close');
      return;
    }

    setCloseSubmitting(true);
    setCloseError(null);
    try {
      const requestId =
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const payload = {
        tokenId,
        amount,
        price,
        isClosingFullPosition, // Pass flag to API
        side: sideForClose,
        orderType,
        confirm: true,
      };
      
      const response = await fetch('/api/polymarket/orders/place', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-request-id': requestId,
        },
        body: JSON.stringify(payload),
      });
      let data: any = null;
      try {
        data = await response.json();
      } catch (parseError) {
        data = null;
      }
      
      if (!response.ok) {
        const errorMessage =
          typeof data?.error === 'string'
            ? data.error
            : typeof data?.message === 'string'
              ? data.message
              : typeof data?.snippet === 'string'
                ? data.snippet
                : typeof data?.raw === 'string'
                  ? data.raw
                  : data
                    ? JSON.stringify(data)
                    : 'Failed to place close order.';
        throw new Error(errorMessage);
      }
      
      setCloseSuccess(`Close order submitted (${slippagePercent.toFixed(1)}% slippage)`);
      setCloseOrderId(data?.orderId ?? null);
      setCloseSubmittedAt(data?.submittedAt ?? null);
      
      // Refresh quick trades to show the new sell order
      hasLoadedQuickTradesRef.current = false;
      const fetchQuickTrades = async () => {
        setLoadingQuickTrades(true);
        try {
          const response = await fetch('/api/orders?refresh=true', { cache: 'no-store' });
          const data = await response.json();
          if (response.ok) {
            setQuickTrades(data.orders || []);
          }
        } catch (err) {
          console.error('Error refreshing quick trades:', err);
        } finally {
          setLoadingQuickTrades(false);
        }
      };
      await fetchQuickTrades();
      try {
        await fetch('/api/polymarket/orders/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      } catch (err) {
        console.error('Error refreshing orders status:', err);
      }
      try {
        await refreshPositions();
      } catch (err) {
        console.error('Error refreshing positions after close:', err);
      }
      
      setToastMessage('Sell order placed successfully!');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err: any) {
      console.error('Close position error:', err);
      setCloseError(err?.message || 'Failed to close position');
    } finally {
      setCloseSubmitting(false);
    }
  };

  const handleManualClose = async ({
    orderId,
    amount,
    exitPrice,
  }: {
    orderId: string;
    amount: number;
    exitPrice: number;
  }) => {
    setCloseSubmitting(true);
    setCloseError(null);
    try {
      // Get the order to calculate entry price and ROI
      const order = quickTrades.find(o => o.orderId === orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      const entryPrice = order.priceOrAvgPrice ?? 0;
      if (entryPrice === 0) {
        throw new Error('Invalid entry price');
      }

      const roi = ((exitPrice - entryPrice) / entryPrice) * 100;

      // Update the order in the database
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      const { error: updateError } = await supabase
        .from('orders')
        .update({
          user_closed_at: new Date().toISOString(),
          user_exit_price: exitPrice,
          roi: parseFloat(roi.toFixed(2)),
        })
        .eq('order_id', orderId)
        .eq('copy_user_id', user.id);

      if (updateError) {
        throw updateError;
      }

      setCloseSuccess(`Position marked as sold at ${exitPrice.toFixed(4)}`);
      setCloseTarget(null);
      
      // Refresh quick trades
      hasLoadedQuickTradesRef.current = false;
      const fetchQuickTrades = async () => {
        setLoadingQuickTrades(true);
        try {
          const response = await fetch('/api/orders?refresh=true', { cache: 'no-store' });
          const data = await response.json();
          if (response.ok) {
            setQuickTrades(data.orders || []);
          }
        } catch (err) {
          console.error('Error refreshing quick trades:', err);
        } finally {
          setLoadingQuickTrades(false);
        }
      };
      await fetchQuickTrades();
      
      setToastMessage('Position marked as sold successfully!');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err: any) {
      console.error('Manual close error:', err);
      setCloseError(err?.message || 'Failed to mark position as sold');
    } finally {
      setCloseSubmitting(false);
    }
  };

  // Helper: Get status for a trade
  const getTradeStatus = (trade: CopiedTrade | OrderRow): 'open' | 'user-closed' | 'trader-closed' | 'resolved' => {
    // For manual trades (CopiedTrade)
    if ('trade_method' in trade) {
      if (trade.market_resolved) return 'resolved';
      if (trade.user_closed_at) return 'user-closed';
      if (trade.trader_closed_at) return 'trader-closed';
      return 'open';
    }
    
    // For quick trades (OrderRow)
    const order = trade as OrderRow;
    if (order.marketResolved) return 'resolved';
    if (order.status === 'matched' || order.status === 'filled' || order.status === 'partial') return 'open';
    if (order.positionState === 'closed') return 'user-closed';
    return 'open';
  };

  // Helper: Convert OrderRow to unified trade format
  interface UnifiedTrade {
    id: string;
    type: 'manual' | 'quick';
    status: 'open' | 'user-closed' | 'trader-closed' | 'resolved';
    created_at: string;
    market_title: string;
    market_id: string;
    market_slug: string | null;
    outcome: string;
    price_entry: number;
    price_current: number | null | undefined;
    amount: number | null | undefined;
    roi: number | null | undefined;
    trader_wallet: string | null;
    trader_username?: string | null;
    trader_profile_image?: string | null;
    market_avatar_url?: string | null;
    raw?: any; // For quick trades, we keep the full OrderRow
    copiedTrade?: CopiedTrade; // For manual trades, keep the full CopiedTrade
  }

  const convertOrderToUnifiedTrade = (
    order: OrderRow,
    statusOverride?: UnifiedTrade['status'] | null
  ): UnifiedTrade => {
    const meta = order.marketId ? marketMeta.get(order.marketId.trim()) : null;
    const rawMarketTitle = order.marketTitle?.trim() ?? '';
    const isUnknownTitle = rawMarketTitle.length === 0 || rawMarketTitle.toLowerCase() === 'unknown market';
    const marketTitle = isUnknownTitle ? meta?.title ?? rawMarketTitle ?? 'Unknown Market' : rawMarketTitle;
    const rawOutcome =
      order.raw?.outcome ??
      order.raw?.token?.outcome ??
      order.raw?.market?.outcome ??
      order.raw?.market?.winning_outcome ??
      null;
    const outcome = order.outcome || rawOutcome || (order.side === 'BUY' ? 'YES' : 'NO');
    
    return {
      id: `quick-${order.orderId}`,
      type: 'quick',
      status: statusOverride ?? getTradeStatus(order),
      created_at: order.createdAt || new Date().toISOString(),
      market_title: marketTitle,
      market_id: order.marketId || '',
      market_slug: order.marketSlug || meta?.slug || null,
      outcome: outcome,
      price_entry: order.priceOrAvgPrice || 0,
      price_current: order.currentPrice || order.priceOrAvgPrice || 0,
      amount: order.size ? order.size * (order.priceOrAvgPrice || 0) : undefined,
      roi: order.pnlUsd && order.size && order.priceOrAvgPrice 
        ? (order.pnlUsd / (order.size * order.priceOrAvgPrice)) * 100 
        : undefined,
      trader_wallet: order.copiedTraderWallet || null,
      trader_username: order.traderName || null,
      trader_profile_image: order.traderAvatarUrl || null,
      market_avatar_url: order.marketImageUrl || meta?.image || null,
      raw: order,
    };
  };

  const isDisplayableQuickTrade = (order: OrderRow) => {
    // Only show orders that have matched (partial) or fully filled.
    return order.status === 'matched' || order.status === 'filled' || order.status === 'partial';
  };

  const convertCopiedTradeToUnified = (trade: CopiedTrade): UnifiedTrade => {
    const meta = trade.market_id ? marketMeta.get(trade.market_id.trim()) : null;
    const rawMarketTitle = trade.market_title?.trim() ?? '';
    const isUnknownTitle = rawMarketTitle.length === 0 || rawMarketTitle.toLowerCase() === 'unknown market';
    const marketTitle = isUnknownTitle ? meta?.title ?? rawMarketTitle ?? 'Unknown Market' : rawMarketTitle;
    return {
      id: `manual-${trade.id}`,
      type: 'manual',
      status: getTradeStatus(trade),
      created_at: trade.copied_at,
      market_title: marketTitle,
      market_id: trade.market_id,
      market_slug: trade.market_slug ?? meta?.slug ?? null,
      outcome: trade.outcome,
      price_entry: trade.price_when_copied,
      price_current: trade.current_price,
      amount: trade.amount_invested,
      roi: trade.roi,
      trader_wallet: trade.trader_wallet,
      trader_username: trade.trader_username,
      trader_profile_image: trade.trader_profile_image_url,
      market_avatar_url: trade.market_avatar_url ?? meta?.image ?? null,
      copiedTrade: trade,
    };
  };

  const quickCloseIndex = useMemo(() => {
    const latestSellByKey = new Map<string, number>();
    const latestSellByMarket = new Map<string, number>();

    const isSellOrder = (order: OrderRow) => {
      const side = order.side?.toLowerCase();
      return side === 'sell' || order.activity === 'sold' || order.positionState === 'closed';
    };

    quickTrades.forEach((order) => {
      if (!isSellOrder(order)) return;
      const createdAt = Date.parse(order.createdAt || '');
      const timestamp = Number.isFinite(createdAt) ? createdAt : 0;
      if (order.marketId) {
        const prevMarket = latestSellByMarket.get(order.marketId) ?? 0;
        if (timestamp > prevMarket) latestSellByMarket.set(order.marketId, timestamp);
      }
      const outcomeKey = order.outcome ? order.outcome.toUpperCase() : '';
      const key = `${order.marketId}::${outcomeKey}`;
      const prevKey = latestSellByKey.get(key) ?? 0;
      if (timestamp > prevKey) latestSellByKey.set(key, timestamp);
    });

    return { latestSellByKey, latestSellByMarket };
  }, [quickTrades]);

  const getQuickCloseTimestamp = (order: OrderRow) => {
    const outcomeKey = order.outcome ? order.outcome.toUpperCase() : '';
    const key = `${order.marketId}::${outcomeKey}`;
    const keyTimestamp = quickCloseIndex.latestSellByKey.get(key);
    if (keyTimestamp) return keyTimestamp;
    return quickCloseIndex.latestSellByMarket.get(order.marketId) ?? null;
  };

  const isQuickSellOrder = (order: OrderRow) => {
    const side = order.side?.toLowerCase();
    return side === 'sell' || order.activity === 'sold' || order.positionState === 'closed';
  };

  const getTradeContracts = useCallback((trade: UnifiedTrade) => {
    if (trade.type === 'quick' && trade.raw) {
      const filledSize =
        Number.isFinite(trade.raw.filledSize) && trade.raw.filledSize > 0
          ? trade.raw.filledSize
          : trade.raw.size;
      if (Number.isFinite(filledSize) && filledSize > 0) return filledSize;
    }
    if (trade.type === 'manual' && trade.copiedTrade?.entry_size) {
      return trade.copiedTrade.entry_size;
    }
    if (trade.amount && trade.price_entry) {
      return trade.amount / trade.price_entry;
    }
    return null;
  }, []);

  const getTradeDisplayPrice = useCallback(
    (trade: UnifiedTrade) => {
      const currentPrice = trade.price_current ?? trade.price_entry ?? null;
      const resolvedOutcome =
        trade.type === 'manual'
          ? trade.copiedTrade?.resolved_outcome ?? null
          : resolveResolvedOutcomeFromRaw(trade.raw);
      const normalizedOutcome = normalizeOutcomeValue(trade.outcome);
      const normalizedResolvedOutcome = normalizeOutcomeValue(resolvedOutcome);
      const settlementPrice =
        normalizedOutcome && normalizedResolvedOutcome
          ? normalizedOutcome === normalizedResolvedOutcome
            ? 1
            : 0
          : null;
      if (settlementPrice !== null) return settlementPrice;
      if (trade.status === 'open' && trade.market_id && trade.outcome) {
        const liveKey = buildLiveMarketKey(trade.market_id, trade.outcome);
        const livePrice = liveMarketData.get(liveKey)?.price;
        return livePrice ?? currentPrice;
      }
      return currentPrice;
    },
    [liveMarketData]
  );

  const netQuickPositionByKey = useMemo(() => {
    const map = new Map<string, number>();
    quickTrades.forEach((order) => {
      const key = buildPositionKey(order.marketId, order.outcome);
      if (!key) return;
      const normalizedSide = order.side?.toLowerCase() === 'sell' ? -1 : 1;
      const filled = Number.isFinite(order.filledSize) && order.filledSize > 0 ? order.filledSize : order.size;
      if (!Number.isFinite(filled) || filled <= 0) return;
      const nextNet = (map.get(key) ?? 0) + normalizedSide * filled;
      map.set(key, nextNet);
    });
    return map;
  }, [quickTrades]);

  const openPositionByKey = useMemo(() => {
    const map = new Map<string, number>();
    positions.forEach((pos) => {
      const key = buildPositionKey(pos.marketId, pos.outcome);
      if (!key) return;
      if (pos.size > MIN_OPEN_POSITION_SIZE) {
        map.set(key, pos.size);
      }
    });
    return map;
  }, [positions]);

  const positionByKey = useMemo(() => {
    const map = new Map<string, PositionSummary>();
    positions.forEach((pos) => {
      const key = buildPositionKey(pos.marketId, pos.outcome);
      if (!key) return;
      map.set(key, pos);
    });
    return map;
  }, [positions]);

  const buildFallbackPositionFromOrder = useCallback((order: OrderRow): PositionSummary | null => {
    const raw = order.raw ?? {};
    let tokenId: string | null = null;

    const tokenIdCandidates = [
      raw.token_id,
      raw.tokenId,
      raw.tokenID,
      raw.asset_id,
      raw.assetId,
      raw.asset,
      raw.market?.token_id,
      raw.market?.asset_id,
    ];

    for (const candidate of tokenIdCandidates) {
      if (candidate && typeof candidate === 'string' && candidate.trim().length > 0) {
        tokenId = candidate.trim();
        break;
      }
    }

    const size = order.filledSize && order.filledSize > 0 ? order.filledSize : order.size;
    const normalizedSide = order.side?.trim().toUpperCase() ?? 'BUY';
    const direction = normalizedSide === 'SELL' ? 'SHORT' : 'LONG';
    const side = normalizedSide === 'SELL' ? 'SELL' : 'BUY';

    if (tokenId && size && size > 0) {
      return {
        tokenId,
        marketId: order.marketId ?? null,
        outcome: order.outcome ?? null,
        direction: direction as 'LONG' | 'SHORT',
        side: side as 'BUY' | 'SELL',
        size,
        avgEntryPrice: order.priceOrAvgPrice ?? null,
        firstTradeAt: order.createdAt ?? null,
        lastTradeAt: order.updatedAt ?? null,
      };
    }

    return null;
  }, []);

  const buildSyntheticOrder = useCallback(
    (trade: UnifiedTrade, position: PositionSummary): OrderRow => {
      const meta = trade.market_id ? marketMeta.get(trade.market_id.trim()) : null;
      const marketTitle = trade.market_title || meta?.title || 'Market';
      const marketImageUrl = trade.market_avatar_url || meta?.image || null;
      const marketSlug = trade.market_slug ?? meta?.slug ?? null;
      const side = position.side ?? 'BUY';
      const outcome = trade.outcome || position.outcome || null;
      const createdAt = trade.created_at || new Date().toISOString();
      const entryPrice = position.avgEntryPrice ?? trade.price_entry ?? null;
      const currentPrice = getTradeDisplayPrice(trade);
      const activity = side === 'SELL' ? 'sold' : 'bought';
      const activityLabel = side === 'SELL' ? 'Sold' : 'Bought';

      return {
        orderId: trade.id,
        status: 'filled',
        activity,
        activityLabel,
        activityIcon: activity,
        marketId: trade.market_id || position.marketId || '',
        marketTitle,
        marketImageUrl,
        marketIsOpen: trade.status === 'open',
        marketResolved: trade.status === 'resolved',
        marketSlug,
        traderId: trade.trader_wallet || 'unknown',
        traderWallet: trade.trader_wallet ?? null,
        traderName: trade.trader_username ?? 'Trader',
        traderAvatarUrl: trade.trader_profile_image ?? null,
        copiedTraderId: null,
        copiedTraderWallet: trade.trader_wallet ?? null,
        side,
        outcome,
        size: position.size,
        filledSize: position.size,
        priceOrAvgPrice: entryPrice,
        currentPrice: currentPrice ?? entryPrice ?? null,
        pnlUsd: null,
        positionState: 'open',
        positionStateLabel: 'Open',
        createdAt,
        updatedAt: createdAt,
        raw: null,
      };
    },
    [getTradeDisplayPrice, marketMeta]
  );

  const resolveTokenIdForTrade = useCallback(async (trade: UnifiedTrade): Promise<string | null> => {
    const marketId = trade.market_id?.trim();
    const normalizedOutcome = normalizeOutcomeValue(trade.outcome);
    if (!marketId || !normalizedOutcome) return null;
    try {
      const response = await fetch(
        `/api/polymarket/market?conditionId=${encodeURIComponent(marketId)}`,
        { cache: 'no-store' }
      );
      if (!response.ok) return null;
      const data = await response.json();
      const tokens = Array.isArray(data?.tokens) ? data.tokens : [];
      const match = tokens.find(
        (token: any) => normalizeOutcomeValue(token?.outcome) === normalizedOutcome
      );
      if (typeof match?.token_id === 'string' && match.token_id.trim()) {
        return match.token_id.trim();
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const findPositionMatch = useCallback(
    (positionsList: PositionSummary[], trade: UnifiedTrade): PositionSummary | null => {
      const normalizedMarketId = trade.market_id?.trim().toLowerCase();
      if (!normalizedMarketId) return null;
      const normalizedOutcome = normalizeOutcomeValue(trade.outcome);
      const candidates = positionsList.filter(
        (pos) => pos.marketId?.trim().toLowerCase() === normalizedMarketId
      );
      if (candidates.length === 0) return null;
      if (normalizedOutcome) {
        const outcomeMatch = candidates.find(
          (pos) => normalizeOutcomeValue(pos.outcome) === normalizedOutcome
        );
        if (outcomeMatch) return outcomeMatch;
      }
      if (candidates.length === 1) return candidates[0];
      return null;
    },
    []
  );

  const resolvePositionForTrade = useCallback(
    async (trade: UnifiedTrade): Promise<PositionSummary | null> => {
      const cached = findPositionMatch(positions, trade);
      if (cached) return cached;
      const fresh = await refreshPositions();
      if (!fresh) return null;
      return findPositionMatch(fresh, trade);
    },
    [findPositionMatch, positions, refreshPositions]
  );

  // Merge and sort all trades
  const allUnifiedTrades = useMemo(() => {
    // Filter out trades that are explicitly marked as 'quick' - those should only come from orders API
    // Keep trades where trade_method is 'manual' or null/undefined (older trades)
    const actualManualTrades = copiedTrades.filter(trade => trade.trade_method === 'manual' || trade.trade_method === null || trade.trade_method === undefined);
    const manualTrades = actualManualTrades.map(convertCopiedTradeToUnified);
    const quickTradesConverted = quickTrades
      .filter(isDisplayableQuickTrade)
      .map((order) => {
        const createdAt = Date.parse(order.createdAt || '');
        const createdAtMs = Number.isFinite(createdAt) ? createdAt : 0;
        const closeTimestamp = getQuickCloseTimestamp(order);
        const positionKey = buildPositionKey(order.marketId, order.outcome);
        const hasOpenPosition = positionKey
          ? openPositionByKey.has(positionKey) ||
            Math.abs(netQuickPositionByKey.get(positionKey) ?? 0) > MIN_OPEN_POSITION_SIZE
          : false;
        const isClosedBySell =
          !isQuickSellOrder(order) &&
          closeTimestamp !== null &&
          createdAtMs > 0 &&
          createdAtMs <= closeTimestamp;
        const statusOverride = order.marketResolved
          ? 'resolved'
          : hasOpenPosition
            ? 'open'
            : isQuickSellOrder(order) || isClosedBySell
            ? 'user-closed'
            : null;
        return convertOrderToUnifiedTrade(order, statusOverride);
      });
    const combined = [...manualTrades, ...quickTradesConverted];
    
    // Sort by created date, newest first
    combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    return combined;
  }, [copiedTrades, quickTrades, openPositionByKey]);

  useEffect(() => {
    if (tradeFilter === 'history' || !ENABLE_LIVE_PRICE_REFRESH) return;
    fetchLiveMarketData(copiedTradesBase, allUnifiedTrades).catch(() => {
      /* best effort */
    });
  }, [allUnifiedTrades, tradeFilter]);

  // Filter unified trades
  const filteredUnifiedTrades = useMemo(() => {
    const isSoldTrade = (trade: UnifiedTrade) => {
      if (trade.type === 'quick') {
        const order = trade.raw as OrderRow | undefined;
        if (!order) return false;
        const positionKey = buildPositionKey(trade.market_id, trade.outcome);
        const hasOpenPosition = positionKey
          ? openPositionByKey.has(positionKey) ||
            Math.abs(netQuickPositionByKey.get(positionKey) ?? 0) > MIN_OPEN_POSITION_SIZE
          : false;
        if (hasOpenPosition) return false;
        if (isQuickSellOrder(order)) return true;
        const createdAt = Date.parse(order.createdAt || '');
        const createdAtMs = Number.isFinite(createdAt) ? createdAt : 0;
        const closeTimestamp = getQuickCloseTimestamp(order);
        return closeTimestamp !== null && createdAtMs > 0 && createdAtMs <= closeTimestamp;
      }

      return Boolean(trade.copiedTrade?.user_closed_at || trade.copiedTrade?.trader_closed_at);
    };

    const isLiveResolved = (trade: UnifiedTrade) => {
      if (trade.status !== 'open' || !trade.market_id || !trade.outcome) return false;
      const live = liveMarketData.get(buildLiveMarketKey(trade.market_id, trade.outcome));
      return Boolean(live?.closed);
    };

    if (tradeFilter === 'all') return allUnifiedTrades;
    
    return allUnifiedTrades.filter(trade => {
      switch (tradeFilter) {
        case 'open':
          return trade.status === 'open' && !isSoldTrade(trade) && !isLiveResolved(trade);
        case 'closed':
          return isSoldTrade(trade);
        case 'resolved':
          return (trade.status === 'resolved' || isLiveResolved(trade)) && !isSoldTrade(trade);
        default:
          return true;
      }
    });
  }, [allUnifiedTrades, tradeFilter, openPositionByKey, liveMarketData]);

  const sortedUnifiedTrades = useMemo(() => {
    const trades = [...filteredUnifiedTrades];
    if (tradeSort === 'date') {
      return trades.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    if (tradeSort === 'invested') {
      return trades.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
    }
    if (tradeSort === 'roi') {
      return trades.sort((a, b) => {
        const aPrice = getTradeDisplayPrice(a);
        const bPrice = getTradeDisplayPrice(b);
        const aIsSell = a.type === 'quick' && a.raw?.side?.toLowerCase() === 'sell';
        const bIsSell = b.type === 'quick' && b.raw?.side?.toLowerCase() === 'sell';
        const aRoi =
          a.roi ??
          (a.price_entry != null && aPrice != null
            ? (((aIsSell ? a.price_entry - aPrice : aPrice - a.price_entry) / a.price_entry) * 100)
            : 0);
        const bRoi =
          b.roi ??
          (b.price_entry != null && bPrice != null
            ? (((bIsSell ? b.price_entry - bPrice : bPrice - b.price_entry) / b.price_entry) * 100)
            : 0);
        return bRoi - aRoi;
      });
    }
    return trades.sort((a, b) => {
      const aContracts = getTradeContracts(a);
      const bContracts = getTradeContracts(b);
      const aPrice = getTradeDisplayPrice(a);
      const bPrice = getTradeDisplayPrice(b);
      const aValue = aContracts && aPrice ? aContracts * aPrice : 0;
      const bValue = bContracts && bPrice ? bContracts * bPrice : 0;
      return bValue - aValue;
    });
  }, [filteredUnifiedTrades, tradeSort, getTradeContracts, getTradeDisplayPrice]);

  const handleCopyAgain = (trade: UnifiedTrade) => {
    if (trade.status !== 'open') return;

    const meta = trade.market_id ? marketMeta.get(trade.market_id.trim()) : null;
    const slug = trade.market_slug ?? meta?.slug ?? null;

    if (canExecuteTrades) {
      const params = new URLSearchParams();
      params.set('prefill', '1');
      if (trade.market_id) params.set('conditionId', trade.market_id);
      if (slug) params.set('marketSlug', slug);
      if (trade.market_title) params.set('marketTitle', trade.market_title);
      if (trade.outcome) params.set('outcome', trade.outcome);
      const contracts = getTradeContracts(trade);
      if (Number.isFinite(contracts)) params.set('size', String(contracts));
      if (Number.isFinite(trade.price_entry) && trade.price_entry > 0) {
        params.set('price', String(trade.price_entry));
      }

      const positionKey = buildPositionKey(trade.market_id, trade.outcome);
      const positionSide =
        trade.type === 'quick'
          ? trade.raw?.side
          : positionKey
            ? positionByKey.get(positionKey)?.side
            : null;
      if (positionSide) params.set('side', String(positionSide).toUpperCase());

      if (trade.trader_username) params.set('traderName', trade.trader_username);
      if (trade.trader_wallet) params.set('traderWallet', trade.trader_wallet);

      router.push(`/trade-execute?${params.toString()}`);
      return;
    }

    let url = 'https://polymarket.com';
    if (slug) {
      url = `https://polymarket.com/market/${slug}?utm_source=polycopy&utm_medium=copy_again&utm_campaign=profile`;
    } else if (trade.market_title) {
      url = `https://polymarket.com/search?q=${encodeURIComponent(trade.market_title)}`;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSellTrade = async (trade: UnifiedTrade) => {
    if (trade.status !== 'open') return;
    if (trade.type !== 'quick' && !canExecuteTrades) {
      setToastMessage('Connect your Polymarket wallet to sell positions.');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
      return;
    }

    let position = await resolvePositionForTrade(trade);
    if (!position && trade.type === 'quick' && trade.raw) {
      position = buildFallbackPositionFromOrder(trade.raw);
    }

    if (!position) {
      const tokenId = await resolveTokenIdForTrade(trade);
      const size = getTradeContracts(trade);
      if (tokenId && size && size > 0) {
        const sideRaw =
          trade.type === 'quick' ? trade.raw?.side : null;
        const normalizedSide = sideRaw ? String(sideRaw).trim().toUpperCase() : 'BUY';
        const side = normalizedSide === 'SELL' ? 'SELL' : 'BUY';
        position = {
          tokenId,
          marketId: trade.market_id ?? null,
          outcome: trade.outcome ?? null,
          direction: side === 'SELL' ? 'SHORT' : 'LONG',
          side,
          size,
          avgEntryPrice: trade.price_entry ?? null,
          firstTradeAt: trade.created_at ?? null,
          lastTradeAt: trade.created_at ?? null,
        };
      }
    }

    if (!position) {
      setToastMessage('Unable to locate an open position to sell. Please refresh and try again.');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
      return;
    }

    const order =
      trade.type === 'quick' && trade.raw ? trade.raw : buildSyntheticOrder(trade, position);
    setCloseTarget({ order, position });
  };

  const tradeSortOptions = useMemo(
    () => [
      { value: 'date' as const, label: 'Latest' },
      { value: 'currentValue' as const, label: 'Current Value' },
      { value: 'invested' as const, label: 'Invested' },
      { value: 'roi' as const, label: 'P&L %' },
    ],
    []
  );
  const activeSortLabel = tradeSortOptions.find((option) => option.value === tradeSort)?.label ?? 'Latest';
  const mobileMetricOptions = [
    { value: 'price' as const, label: 'Price' },
    { value: 'size' as const, label: 'Size' },
    { value: 'roi' as const, label: 'P&L' },
    { value: 'time' as const, label: 'Time' },
  ];
  const activeMobileMetricLabel =
    mobileMetricOptions.find((option) => option.value === mobileMetric)?.label ?? 'Price';

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

  const tabButtons = useMemo(() => ([
    { key: 'trades' as ProfileTab, label: 'Trades', href: buildTabUrl('trades') },
    { key: 'performance' as ProfileTab, label: 'Performance', href: buildTabUrl('performance') },
  ]), [buildTabUrl]);
  const tabTooltips: Partial<Record<ProfileTab, string>> = {};

  return (
    <>
      <Navigation 
        user={user ? { id: user.id, email: user.email || '' } : null} 
        isPremium={isPremium}
        walletAddress={profile?.trading_wallet_address}
        profileImageUrl={profileImageUrl}
      />
      
      {/* Mobile top nav banner (logo only, no page title) */}
      <div className="md:hidden sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="px-4 py-3">
          <Image
            src="/logos/polycopy-logo-primary.svg"
            alt="Polycopy"
            width={120}
            height={32}
            className="h-7 w-auto"
          />
        </div>
      </div>
      
      <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pt-2 md:pt-0 pb-20 md:pb-8">
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

          {/* User Profile Header */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <Avatar className="h-16 w-16 border-2 border-white shadow-md flex-shrink-0 bg-gradient-to-br from-yellow-400 to-orange-500">
              <AvatarFallback className="text-white text-xl font-semibold bg-transparent">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-semibold text-slate-900 mb-1">
                {profile?.trading_wallet_address && polymarketUsername
                  ? polymarketUsername.startsWith('0x') && polymarketUsername.length > 20
                    ? truncateAddress(polymarketUsername)
                    : polymarketUsername
                  : 'You'}
              </h1>
              {profile?.trading_wallet_address && (
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-sm font-mono text-slate-500">
                    {truncateAddress(profile.trading_wallet_address)}
                  </p>
                  <button
                    onClick={() => navigator.clipboard.writeText(profile.trading_wallet_address)}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                    title="Copy wallet address"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <a
                    href={`https://polymarket.com/profile/${profile.trading_wallet_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-600"
                    aria-label="Open on Polymarket"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </div>
              )}
              <Link 
                href="/following"
                className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
              >
                <Avatar className="h-6 w-6 ring-2 ring-slate-100">
                  <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-yellow-500 text-slate-900 text-xs font-semibold">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <span>Following {followingCount} traders</span>
              </Link>
            </div>

            <div className="flex items-center gap-3">
              {copiedTrades.length > 0 && (
                <Button
                  onClick={() => setIsShareStatsModalOpen(true)}
                  className="bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-slate-900 font-semibold shadow-sm"
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share My Stats
                </Button>
              )}
              {!profile?.trading_wallet_address && hasPremiumAccess && (
                <Button
                  onClick={() => setIsConnectModalOpen(true)}
                  className="bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-semibold"
                  size="sm"
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  Connect Wallet
                </Button>
              )}
            </div>
          </div>

          {/* Portfolio Stats Card */}
          <Card className="bg-white border-slate-200/80 shadow-sm">
            <div className="p-6 space-y-6">
              {/* Primary Metrics - Top Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-xs font-medium text-slate-500 tracking-wide mb-2">Total P&L</p>
                  <p className={cn(
                    'text-3xl font-bold tabular-nums',
                    userStats.totalPnl > 0 ? 'text-emerald-600' : userStats.totalPnl < 0 ? 'text-red-600' : 'text-slate-900'
                  )}>
                    {formatSignedCurrency(userStats.totalPnl)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-medium text-slate-500 tracking-wide mb-2">ROI</p>
                  <p className={cn(
                    'text-3xl font-bold tabular-nums',
                    userStats.roi > 0 ? 'text-emerald-600' : userStats.roi < 0 ? 'text-red-600' : 'text-slate-900'
                  )}>
                    {userStats.roi >= 0 ? '+' : ''}{userStats.roi.toFixed(1)}%
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-medium text-slate-500 tracking-wide mb-2">Volume</p>
                  <p className="text-3xl font-bold tabular-nums text-slate-900">
                    {formatCompactCurrency(userStats.totalVolume)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-medium text-slate-500 tracking-wide mb-2">Win Rate</p>
                  <p className="text-3xl font-bold tabular-nums text-slate-900">
                    {userStats.winRate.toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-slate-200"></div>

              {/* Secondary Metrics - Bottom Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-xs font-medium text-slate-500 tracking-wide mb-2">Realized P&L</p>
                  <p className={cn(
                    'text-2xl font-semibold tabular-nums',
                    userStats.realizedPnl > 0 ? 'text-emerald-600' : userStats.realizedPnl < 0 ? 'text-red-600' : 'text-slate-900'
                  )}>
                    {formatSignedCurrency(userStats.realizedPnl)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-medium text-slate-500 tracking-wide mb-2">Unrealized P&L</p>
                  <p className={cn(
                    'text-2xl font-semibold tabular-nums',
                    userStats.unrealizedPnl > 0 ? 'text-emerald-600' : userStats.unrealizedPnl < 0 ? 'text-red-600' : 'text-slate-900'
                  )}>
                    {formatSignedCurrency(userStats.unrealizedPnl)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-medium text-slate-500 tracking-wide mb-2">Total Trades</p>
                  <p className="text-2xl font-semibold tabular-nums text-slate-900">
                    {userStats.totalTrades.toLocaleString()}
                  </p>
                  {userStats.totalSellTrades !== undefined && userStats.totalSellTrades > 0 && (
                    <p className="text-xs text-slate-400 mt-1">
                      {userStats.totalBuyTrades || userStats.totalTrades} buys · {userStats.totalSellTrades} sells
                    </p>
                  )}
                </div>
                <div className="text-center">
                  <p className="text-xs font-medium text-slate-500 tracking-wide mb-2">Open Positions</p>
                  <p className="text-2xl font-semibold tabular-nums text-slate-900">
                    {userStats.openTrades.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Additional Position Stats */}
              {(userStats.winningPositions !== undefined || userStats.losingPositions !== undefined) && 
               (userStats.winningPositions! > 0 || userStats.losingPositions! > 0) && (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                  <div className="text-center">
                    <p className="text-xs font-medium text-slate-500 tracking-wide mb-2">Winning Positions</p>
                    <p className="text-xl font-semibold tabular-nums text-emerald-600">
                      {userStats.winningPositions?.toLocaleString() || 0}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-medium text-slate-500 tracking-wide mb-2">Losing Positions</p>
                    <p className="text-xl font-semibold tabular-nums text-red-600">
                      {userStats.losingPositions?.toLocaleString() || 0}
                    </p>
                  </div>
                </div>
              )}

              {/* Loading/Error States */}
              {portfolioStatsLoading && (
                <div className="flex items-center justify-center gap-2 text-sm text-slate-500 pt-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Refreshing P&L with live prices…</span>
                </div>
              )}
              {portfolioStatsError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                  Stats unavailable: {portfolioStatsError}
                </div>
              )}
            </div>
          </Card>

          {/* Tab Navigation */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <div className="flex flex-1 flex-wrap gap-2">
              {tabButtons.map(({ key, label, href }) => {
                const tooltipText = tabTooltips[key];
                const button = (
                  <Button
                    asChild
                    variant="ghost"
                    className={cn(
                      "w-full px-3 py-3 rounded-md font-medium text-sm transition-all whitespace-nowrap",
                      activeTab === key
                        ? "bg-slate-900 text-white shadow-md hover:bg-slate-800"
                        : "bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200"
                    )}
                  >
                    <Link
                      href={href}
                      scroll={false}
                      onClick={(event) => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) {
                          return;
                        }
                        event.preventDefault();
                        handleTabChange(key);
                      }}
                      aria-current={activeTab === key ? 'page' : undefined}
                    >
                      {label}
                    </Link>
                  </Button>
                );

                return (
                  <div key={key} className="flex-1 min-w-[150px]">
                    {tooltipText ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {button}
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>{tooltipText}</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      button
                    )}
                  </div>
                );
              })}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 border-slate-200 text-slate-600 hover:text-slate-900"
                >
                  <Link href="/settings" aria-label="Open settings">
                    <Settings className="h-4 w-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Settings</TooltipContent>
            </Tooltip>
          </div>

          {/* Tab Content */}
          {activeTab === 'trades' && (
            <div className="space-y-4">
              {/* Filter and Refresh */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex gap-2 items-center">
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
                      {filter === 'closed'
                        ? 'Sold'
                        : filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </button>
                  ))}
                  
                  {/* Separator */}
                  <span className="text-slate-300 text-lg mx-1">|</span>
                  
                  {/* Activity Button */}
                  <button
                    onClick={() => setTradeFilter('history')}
                    className={cn(
                      "px-4 py-2 rounded-lg font-medium text-sm transition-all",
                      tradeFilter === 'history'
                        ? "bg-slate-900 text-white"
                        : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    Activity
                  </button>
                </div>
                <div className="flex items-center gap-2 md:hidden">
                  <span className="text-xs text-slate-500">Show</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm"
                      >
                        <span>{activeMobileMetricLabel}</span>
                        <ChevronDown className="h-3 w-3 text-slate-500" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-40 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                      <DropdownMenuRadioGroup
                        value={mobileMetric}
                        onValueChange={(value) => setMobileMetric(value as typeof mobileMetric)}
                      >
                        {mobileMetricOptions.map((option) => (
                          <DropdownMenuRadioItem
                            key={option.value}
                            value={option.value}
                            className="text-sm font-medium text-slate-700 focus:bg-slate-100"
                          >
                            {option.label}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex items-center gap-3 ml-auto">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300"
                      >
                        <span className="text-xs font-semibold text-slate-500">Sort</span>
                        <span className="text-sm font-semibold text-slate-900">{activeSortLabel}</span>
                        <ChevronDown className="h-4 w-4 text-slate-500" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                      <DropdownMenuRadioGroup
                        value={tradeSort}
                        onValueChange={(value) => setTradeSort(value as typeof tradeSort)}
                      >
                        {tradeSortOptions.map((option) => (
                          <DropdownMenuRadioItem
                            key={option.value}
                            value={option.value}
                            className="text-sm font-medium text-slate-700 focus:bg-slate-100"
                          >
                            {option.label}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    onClick={handleManualRefresh}
                    disabled={refreshingStatus}
                    variant="outline"
                    size="icon"
                    aria-label="Refresh status"
                    className="h-9 w-9"
                  >
                    <RefreshCw className={cn("h-4 w-4", refreshingStatus && "animate-spin")} />
                  </Button>
                </div>
              </div>

              {/* Trades List or History View */}
              {tradeFilter === 'history' ? (
                <div className="space-y-4">
                  <OrdersScreen 
                    hideNavigation 
                    contentWrapperClassName="bg-transparent" 
                    defaultTab="history"
                    hideTabButtons={true}
                    historyTableTitle="Order History - Premium Quick Copy Trades Only"
                  />
                </div>
              ) : (loadingCopiedTrades || loadingQuickTrades) ? (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-[320px] md:min-w-[1020px] w-full text-sm table-fixed md:table-auto border-separate border-spacing-y-2 border-spacing-x-0">
                      <thead className="bg-slate-50 text-xs text-slate-500">
                        <tr className="border-b border-slate-200">
                          <th className="px-3 py-3 text-center font-semibold hidden md:table-cell md:px-4 w-[120px]">Copied Trader</th>
                          <th className="px-3 py-3 text-center font-semibold md:px-4">Market</th>
                          <th className="px-3 py-3 text-center font-semibold hidden md:table-cell md:px-4">Outcome</th>
                          <th className="px-3 py-3 text-center font-semibold hidden md:table-cell md:px-4">
                            <span className="block">Invested</span>
                            <span className="block text-[10px] font-medium text-slate-400">Contracts</span>
                          </th>
                          <th className="px-3 py-3 text-center font-semibold hidden md:table-cell md:px-4">
                            <span className="block">
                              Entry <span aria-hidden="true">→</span> Current
                            </span>
                          </th>
                          <th className="px-3 py-3 text-center font-semibold hidden md:table-cell md:px-4">
                            <span className="block">Current Value</span>
                            <span className="block text-[10px] font-medium text-slate-400">P&L</span>
                          </th>
                          <th className="px-3 py-3 text-center font-semibold hidden md:table-cell md:px-4">Time</th>
                          <th className="px-3 py-3 text-center font-semibold md:hidden md:px-4">Detail</th>
                          <th className="px-3 py-3 text-right font-semibold w-[120px] md:w-[80px] md:px-4"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {[1, 2, 3].map((i) => (
                          <tr key={i} className="border-b border-slate-100 animate-pulse">
                            {Array.from({ length: 9 }).map((_, index) => (
                              <td key={index} className="px-4 py-4">
                                <div className="h-3 w-full max-w-[120px] rounded-full bg-slate-200" />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : sortedUnifiedTrades.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-slate-600">No trades yet.</p>
                </Card>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-[320px] md:min-w-[1020px] w-full text-sm table-fixed md:table-auto border-separate border-spacing-y-2 border-spacing-x-0">
                      <thead className="bg-slate-50 text-xs text-slate-500">
                        <tr className="border-b border-slate-200">
                          <th className="px-3 py-3 text-center font-semibold hidden md:table-cell md:px-4 w-[120px]">Copied Trader</th>
                          <th className="px-3 py-3 text-center font-semibold md:px-4">Market</th>
                          <th className="px-3 py-3 text-center font-semibold hidden md:table-cell md:px-4">Outcome</th>
                          <th className="px-3 py-3 text-center font-semibold hidden md:table-cell md:px-4">
                            <span className="block">Invested</span>
                            <span className="block text-[10px] font-medium text-slate-400">Contracts</span>
                          </th>
                          <th className="px-3 py-3 text-center font-semibold hidden md:table-cell md:px-4">
                            <span className="block">
                              Entry <span aria-hidden="true">→</span> Current
                            </span>
                          </th>
                          <th className="px-3 py-3 text-center font-semibold hidden md:table-cell md:px-4">
                            <span className="block">Current Value</span>
                            <span className="block text-[10px] font-medium text-slate-400">P&L</span>
                          </th>
                          <th className="px-3 py-3 text-center font-semibold hidden md:table-cell md:px-4">Time</th>
                          <th className="px-3 py-3 text-center font-semibold md:hidden md:px-4">Detail</th>
                          <th className="px-3 py-3 text-right font-semibold w-[120px] md:w-[80px] md:px-4"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedUnifiedTrades.slice(0, tradesToShow).map((trade) => {
                          const actionLabel =
                            trade.type === 'quick' && trade.raw?.side?.toLowerCase() === 'sell' ? 'Sell' : 'Buy';
                          const invested = trade.amount ?? null;
                          const contracts = getTradeContracts(trade);
                          const statusLabel =
                            trade.status === 'open'
                              ? 'Open'
                              : trade.status === 'user-closed'
                                ? 'Sold'
                                : trade.status === 'trader-closed'
                                  ? 'Trader Closed'
                                  : 'Resolved';
                          const resolvedOutcome =
                            trade.type === 'manual'
                              ? trade.copiedTrade?.resolved_outcome ?? null
                              : resolveResolvedOutcomeFromRaw(trade.raw);
                          const normalizedOutcome = normalizeOutcomeValue(trade.outcome);
                          const normalizedResolvedOutcome = normalizeOutcomeValue(resolvedOutcome);
                          const settlementPrice =
                            normalizedOutcome && normalizedResolvedOutcome
                              ? normalizedOutcome === normalizedResolvedOutcome
                                ? 1
                                : 0
                              : null;
                          const displayPrice = settlementPrice ?? getTradeDisplayPrice(trade);
                          const isResolvedLive = Boolean(
                            trade.status === 'open' &&
                              trade.market_id &&
                              trade.outcome &&
                              liveMarketData.get(buildLiveMarketKey(trade.market_id, trade.outcome))?.closed
                          );
                          const isResolvedMarket = trade.status === 'resolved' || isResolvedLive;
                          const displayStatus = isResolvedMarket ? 'Resolved' : statusLabel;
                          const resolvedDisplayPrice =
                            isResolvedMarket && settlementPrice === null ? 0 : null;
                          const finalDisplayPrice =
                            resolvedDisplayPrice !== null ? resolvedDisplayPrice : displayPrice;
                          const roiValue =
                            trade.roi ??
                            (trade.price_entry != null && finalDisplayPrice != null
                              ? (((actionLabel === 'Sell' ? trade.price_entry - finalDisplayPrice : finalDisplayPrice - trade.price_entry) /
                                  trade.price_entry) *
                                  100)
                              : null);
                          const roiClass =
                            roiValue === null
                              ? "text-slate-400"
                              : roiValue > 0
                                ? "text-emerald-600"
                                : roiValue < 0
                                  ? "text-red-600"
                                  : "text-slate-600";
                          const statusBadgeClass = cn(
                            'inline-flex w-fit items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-none',
                            displayStatus === 'Open' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                            displayStatus === 'Resolved' && 'bg-rose-50 text-rose-700 border-rose-200',
                            displayStatus === 'Trader Closed' && 'bg-orange-50 text-orange-700 border-orange-200',
                            displayStatus === 'Sold' && 'bg-slate-50 text-slate-600 border-slate-200'
                          );
                          const outcomeBadgeClass = cn(
                            'inline-flex items-center rounded-full border px-2.5 py-1 text-[12px] font-semibold',
                            'bg-slate-50 text-slate-600 border-slate-200'
                          );
                          const currentValue =
                            contracts && finalDisplayPrice !== null ? contracts * finalDisplayPrice : null;
                          const mobileDetail =
                            mobileMetric === 'price'
                              ? `${formatPrice(trade.price_entry)} -> ${formatPrice(finalDisplayPrice)}`
                              : mobileMetric === 'size'
                                ? `${formatCurrency(invested)} / ${formatContracts(contracts)}`
                                : mobileMetric === 'roi'
                                  ? `${currentValue !== null ? formatCurrency(currentValue) : '—'} · ${
                                      roiValue === null ? '—' : `${roiValue > 0 ? '+' : ''}${roiValue.toFixed(1)}%`
                                    }`
                                  : formatTimestamp(trade.created_at);

                          const canCopyAgain = trade.status === 'open' && !isResolvedMarket;
                          const canSell =
                            trade.status === 'open' &&
                            !isResolvedMarket &&
                            (trade.type === 'quick' ? Boolean(trade.raw) : canExecuteTrades);

                          return (
                            <React.Fragment key={trade.id}>
                              <tr className="border-b border-slate-100 align-top">
                                <td className="px-3 py-2 align-top hidden md:table-cell md:px-4 md:py-3 w-[120px] bg-slate-50 first:rounded-l-lg last:rounded-r-lg">
                                  {trade.trader_wallet && trade.trader_username ? (
                                    <a
                                      href={`/trader/${trade.trader_wallet}`}
                                      className="text-sm font-medium text-slate-700 hover:text-slate-900 truncate block max-w-[120px]"
                                      title={trade.trader_username}
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      {trade.trader_username}
                                    </a>
                                  ) : (
                                    <span className="text-sm text-slate-400">Unknown</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 align-top md:px-4 md:py-3 bg-slate-50 first:rounded-l-lg last:rounded-r-lg">
                                  <div className="mt-1 flex items-start gap-2 md:gap-3">
                                    <div className="h-7 w-7 md:h-8 md:w-8 shrink-0 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
                                      {trade.market_avatar_url ? (
                                        <img
                                          src={trade.market_avatar_url}
                                          alt={trade.market_title}
                                          className="h-full w-full object-cover"
                                        />
                                      ) : (
                                        <span className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-slate-500">
                                          {trade.market_title.slice(0, 2)}
                                        </span>
                                      )}
                                    </div>
                                    <div className="min-w-0 md:max-w-[260px]">
                                      <div className="flex flex-wrap items-center gap-2">
                                        {trade.market_slug ? (
                                          <a
                                            href={`https://polymarket.com/market/${trade.market_slug}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm font-semibold text-slate-900 hover:underline line-clamp-2"
                                            onClick={(event) => event.stopPropagation()}
                                          >
                                            {trade.market_title}
                                          </a>
                                        ) : (
                                          <span className="text-sm font-semibold text-slate-900 line-clamp-2">
                                            {trade.market_title}
                                          </span>
                                        )}
                                        <span className={cn("hidden md:inline-flex", statusBadgeClass)}>
                                          {displayStatus}
                                        </span>
                                      </div>
                                      <div className="mt-1 flex flex-wrap items-center gap-2 md:hidden">
                                        <span className={cn("inline-flex", statusBadgeClass)}>
                                          {displayStatus}
                                        </span>
                                        <span className={cn("inline-flex", outcomeBadgeClass)}>
                                          {formatOutcomeLabel(trade.outcome)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2 align-top hidden md:table-cell md:px-4 md:py-3 bg-slate-50 first:rounded-l-lg last:rounded-r-lg">
                                  <span className={cn("inline-flex", outcomeBadgeClass)}>
                                    {formatOutcomeLabel(trade.outcome)}
                                  </span>
                                </td>
                                <td className="px-3 py-2 align-top hidden md:table-cell md:px-4 md:py-3 bg-slate-50 first:rounded-l-lg last:rounded-r-lg">
                                  <p className="text-sm font-semibold text-slate-900">{formatCurrency(invested)}</p>
                                  <p className="text-xs text-slate-500">{formatContracts(contracts)}</p>
                                </td>
                                <td className="px-3 py-2 align-top hidden md:table-cell md:px-4 md:py-3 bg-slate-50 first:rounded-l-lg last:rounded-r-lg">
                                  <p className="text-sm font-semibold text-slate-900">
                                    {formatPrice(trade.price_entry)}
                                    <span className="mx-1 text-slate-400">-&gt;</span>
                                    {formatPrice(finalDisplayPrice)}
                                  </p>
                                </td>
                                <td className="px-3 py-2 align-top hidden md:table-cell md:px-4 md:py-3 bg-slate-50 first:rounded-l-lg last:rounded-r-lg">
                                  <p className="text-sm font-semibold text-slate-900">
                                    {contracts && finalDisplayPrice !== null ? formatCurrency(contracts * finalDisplayPrice) : "—"}
                                  </p>
                                  <p className={cn("text-xs font-semibold", roiClass)}>
                                    {roiValue === null ? "—" : `${roiValue > 0 ? "+" : ""}${roiValue.toFixed(1)}%`}
                                  </p>
                                </td>
                                <td className="px-3 py-2 align-top hidden md:table-cell md:px-4 md:py-3 bg-slate-50 first:rounded-l-lg last:rounded-r-lg">
                                  <p className="text-xs font-medium text-slate-600 whitespace-nowrap">
                                    {formatTimestamp(trade.created_at)}
                                  </p>
                                </td>
                                <td className="px-3 py-2 align-top md:hidden md:px-4 md:py-3 bg-slate-50 first:rounded-l-lg last:rounded-r-lg">
                                  <p
                                    className={cn(
                                      "text-xs font-semibold",
                                      mobileMetric === 'roi' ? roiClass : "text-slate-900"
                                    )}
                                  >
                                    {mobileDetail}
                                  </p>
                                </td>
                                <td className="px-3 py-2 align-top text-right w-[120px] md:w-[80px] md:px-4 md:py-3 bg-slate-50 first:rounded-l-lg last:rounded-r-lg">
                                  <div className="mt-1 flex flex-col items-end gap-1">
                                    {(canCopyAgain || canSell) && (
                                      <div className="flex w-full flex-col items-stretch gap-2 md:w-auto md:flex-row-reverse md:items-center md:justify-end md:gap-2">
                                        {canSell && (
                                          <Button
                                            onClick={() => handleSellTrade(trade)}
                                            size="sm"
                                            variant="outline"
                                            className="h-7 w-full px-3 text-[11px] font-semibold text-red-600 border border-red-300 bg-white hover:bg-red-50 hover:text-red-600 md:w-auto"
                                          >
                                            Sell
                                          </Button>
                                        )}
                                        {canCopyAgain && (
                                          <Button
                                            onClick={() => handleCopyAgain(trade)}
                                            size="sm"
                                            variant="outline"
                                            className="h-7 w-full px-3 text-[11px] font-semibold text-amber-700 border border-amber-300 bg-white hover:bg-amber-50 hover:text-amber-700 md:w-auto"
                                          >
                                            Copy Again
                                          </Button>
                                        )}
                                      </div>
                                    )}
                                    {(trade.type === 'quick' && trade.raw) || trade.type === 'manual' ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (trade.type === 'quick') {
                                            setExpandedQuickDetailsId(
                                              expandedQuickDetailsId === trade.id ? null : trade.id
                                            );
                                          } else {
                                            setExpandedTradeId(expandedTradeId === trade.id ? null : trade.id);
                                          }
                                        }}
                                        className="text-[10px] font-medium text-slate-400 hover:text-slate-500"
                                      >
                                        Details
                                      </button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>

                              {trade.type === 'quick' && trade.raw && expandedQuickDetailsId === trade.id && (
                                <tr className="border-b border-slate-100 bg-slate-100/60">
                                  <td colSpan={9} className="px-4 py-4">
                                    <OrderRowDetails order={trade.raw as OrderRow} />
                                  </td>
                                </tr>
                              )}

                              {trade.type === 'manual' && expandedTradeId === trade.id && (
                                <tr className="border-b border-slate-100 bg-slate-100/60">
                                  <td colSpan={9} className="px-4 py-4">
                                    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                                      <div className="grid grid-cols-2 gap-4">
                                        <div>
                                          <p className="text-xs text-slate-500 mb-1">Shares</p>
                                          <p className="font-semibold text-slate-900">
                                            {trade.amount && trade.price_entry 
                                              ? Math.round(trade.amount / trade.price_entry)
                                              : '—'}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs text-slate-500 mb-1">Amount Invested</p>
                                          <p className="font-semibold text-slate-900">
                                            ${trade.amount?.toFixed(0) || '—'}
                                          </p>
                                        </div>
                                      </div>

                                      {trade.type === 'manual' && trade.copiedTrade && (
                                        <div className="flex flex-wrap gap-2">
                                          {!trade.copiedTrade.user_closed_at && !trade.copiedTrade.market_resolved && (
                                            <>
                                              <Button
                                                onClick={() => {
                                                  setTradeToEdit(trade.copiedTrade!);
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
                                                  setTradeToEdit(trade.copiedTrade!);
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
                                                onClick={() => handleDeleteTrade(trade.copiedTrade!)}
                                                variant="ghost"
                                                size="icon"
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                                              >
                                                <Trash2 className="h-5 w-5" />
                                              </Button>
                                            </>
                                          )}

                                          {trade.copiedTrade.user_closed_at && (
                                            <>
                                              <Button
                                                onClick={() => {
                                                  setTradeToEdit(trade.copiedTrade!);
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
                                                onClick={() => handleUnmarkClosed(trade.copiedTrade!)}
                                                variant="outline"
                                                size="default"
                                                className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-50 gap-2"
                                              >
                                                <RotateCcw className="h-4 w-4" />
                                                Unmark as Closed
                                              </Button>
                                              <Button
                                                onClick={() => handleDeleteTrade(trade.copiedTrade!)}
                                                variant="ghost"
                                                size="icon"
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                                              >
                                                <Trash2 className="h-5 w-5" />
                                              </Button>
                                            </>
                                          )}

                                          {trade.copiedTrade.market_resolved && !trade.copiedTrade.user_closed_at && (
                                            <>
                                              <Button
                                                onClick={() => {
                                                  setTradeToEdit(trade.copiedTrade!);
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
                                                onClick={() => handleDeleteTrade(trade.copiedTrade!)}
                                                variant="ghost"
                                                size="icon"
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                                              >
                                                <Trash2 className="h-5 w-5" />
                                              </Button>
                                            </>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* View More Button */}
                  {sortedUnifiedTrades.length > tradesToShow && (
                    <div className="flex justify-center pt-4 pb-4">
                      {(() => {
                        const showingTradesCount = Math.min(sortedUnifiedTrades.length, tradesToShow);
                        const totalFromApi = portfolioTradesTotal;
                        const remainingCount =
                          totalFromApi !== null
                            ? Math.max(totalFromApi - showingTradesCount, 0)
                            : Math.max(sortedUnifiedTrades.length - tradesToShow, 0);

                        return (
                          <Button
                            onClick={() => setTradesToShow((prev) => prev + 50)}
                            variant="outline"
                            className="border-slate-300 text-slate-700 hover:bg-slate-50"
                          >
                            {totalFromApi !== null
                              ? `View More Trades (showing ${showingTradesCount} of ${totalFromApi})`
                              : 'View More Trades (load 50)'}
                            <span className="ml-2 text-xs text-slate-500">
                              {remainingCount} remaining
                            </span>
                          </Button>
                        );
                      })()}
                    </div>
                  )}
                </div>

              )}
            </div>
          )}

          {activeTab === 'performance' && (
            <div className="space-y-6">
              {/* Header Section */}
              {/* Realized P&L Chart Section */}
              <Card className="border-slate-200/80 bg-white/90 p-5">
                <div className="space-y-6">
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-2xl font-semibold text-slate-900">Realized P&amp;L</h3>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-xs font-semibold text-slate-500 cursor-help">
                              ?
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Shows profit or loss only from positions that are closed or resolved. Based on your PolyCopy trades.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {pnlWindowOptions.map((option) => {
                        const isActive = option.key === pnlWindow;
                        return (
                          <button
                            key={option.key}
                            onClick={() => setPnlWindow(option.key)}
                            className={cn(
                              'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                              isActive
                                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            )}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {realizedPnlError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {realizedPnlError}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200/70 bg-white p-4 text-center shadow-sm">
                        <p className="text-sm font-semibold text-slate-600">Total P&amp;L</p>
                        <p
                          className={cn(
                            'mt-2 text-2xl font-semibold leading-tight sm:text-3xl',
                            chartSectionTotalPnl > 0
                              ? 'text-emerald-700'
                              : chartSectionTotalPnl < 0
                                ? 'text-red-600'
                                : 'text-slate-900'
                          )}
                        >
                          {formatSignedCurrency(chartSectionTotalPnl)}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">{pnlWindowLabel}</p>
                      </div>

                      <div className="rounded-2xl border border-slate-200/70 bg-white p-4 text-center shadow-sm">
                        <p className="text-sm font-semibold text-slate-600">Average per day</p>
                        <p
                          className={cn(
                            'mt-2 text-2xl font-semibold leading-tight sm:text-3xl',
                            chartSectionAvgDaily > 0
                              ? 'text-emerald-700'
                              : chartSectionAvgDaily < 0
                                ? 'text-red-600'
                                : 'text-slate-900'
                          )}
                        >
                          {formatAverageDaily(chartSectionAvgDaily)}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-center shadow-sm">
                        <p className="text-sm font-semibold text-slate-600">Days Active</p>
                        <p className="mt-2 text-xl font-semibold leading-tight text-slate-900 sm:text-2xl">{realizedSummary.daysActive}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-center shadow-sm">
                        <p className="text-sm font-semibold text-slate-600">Days Up</p>
                        <p className="mt-2 text-xl font-semibold leading-tight text-emerald-700 sm:text-2xl">{realizedSummary.daysUp}</p>
                      </div>

                      <div className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-center shadow-sm">
                        <p className="text-sm font-semibold text-slate-600">Days Down</p>
                        <p className="mt-2 text-xl font-semibold leading-tight text-red-600 sm:text-2xl">{realizedSummary.daysDown}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/80 bg-white/80 p-4 shadow-sm sm:p-6">
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                      <div className="text-sm font-semibold text-slate-900">P&amp;L</div>
                      <div className="text-xs text-slate-500">{realizedRangeLabel}</div>
                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 p-1 shadow-sm">
                          {(['daily', 'cumulative'] as const).map((mode) => (
                            <button
                              key={mode}
                              onClick={() => setPnlView(mode)}
                              className={cn(
                                'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                                pnlView === mode
                                  ? 'bg-slate-900 text-white'
                                  : 'text-slate-600 hover:text-slate-900'
                              )}
                            >
                              {mode === 'daily' ? 'Daily Change' : 'Accumulated'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {loadingRealizedPnl && realizedChartSeries.length === 0 ? (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading realized P&amp;L...
                      </div>
                    ) : realizedChartSeries.length > 0 ? (
                      <div className="h-72 w-full animate-in fade-in duration-700 sm:h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          {pnlView === 'daily' ? (
                            <BarChart data={realizedChartSeries} barSize={dailyBarSize} barCategoryGap={dailyBarGap}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis
                                dataKey="date"
                                tickLine={false}
                                axisLine={false}
                                interval="preserveStartEnd"
                                tickFormatter={(value) =>
                                  new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    timeZone: 'UTC',
                                  })
                                }
                                tickMargin={10}
                                minTickGap={32}
                                tick={{ fontSize: 11, fill: '#475569' }}
                              />
                              <YAxis
                                tickLine={false}
                                axisLine={false}
                                width={64}
                                tickMargin={10}
                                tick={{ fontSize: 11, fill: '#475569' }}
                                tickCount={6}
                                domain={[
                                  (min: number) => Math.min(min, 0),
                                  (max: number) => Math.max(max, 0),
                                ]}
                                tickFormatter={(value) => formatCompactCurrency(value)}
                              />
                              <RechartsTooltip
                                contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0' }}
                                formatter={(value: any) => formatSignedCurrency(Number(value), 2)}
                                labelFormatter={(label) =>
                                  new Date(`${label}T00:00:00Z`).toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    timeZone: 'UTC',
                                  })
                                }
                              />
                              <ReferenceLine y={0} stroke="#cbd5e1" />
                              <Bar
                                dataKey="dailyPnl"
                                name="Daily PnL"
                                minPointSize={2}
                                radius={[6, 6, 6, 6]}
                                isAnimationActive
                                animationDuration={900}
                              >
                                {realizedChartSeries.map((entry, index) => (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={entry.dailyPnl >= 0 ? '#10b981' : '#ef4444'}
                                  />
                                ))}
                              </Bar>
                            </BarChart>
                          ) : (
                            <AreaChart data={realizedChartSeries}>
                              <defs>
                                <linearGradient id="pnlCumulative" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#0f172a" stopOpacity={0.35} />
                                  <stop offset="100%" stopColor="#0f172a" stopOpacity={0.05} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis
                                dataKey="date"
                                tickLine={false}
                                axisLine={false}
                                interval="preserveStartEnd"
                                tickFormatter={(value) =>
                                  new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    timeZone: 'UTC',
                                  })
                                }
                                tickMargin={10}
                                minTickGap={32}
                                tick={{ fontSize: 11, fill: '#475569' }}
                              />
                              <YAxis
                                tickLine={false}
                                axisLine={false}
                                width={64}
                                tickMargin={10}
                                tick={{ fontSize: 11, fill: '#475569' }}
                                tickFormatter={(value) => formatCompactCurrency(value)}
                              />
                              <RechartsTooltip
                                contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0' }}
                                formatter={(value: any) => formatSignedCurrency(Number(value), 2)}
                                labelFormatter={(label) =>
                                  new Date(`${label}T00:00:00Z`).toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    timeZone: 'UTC',
                                  })
                                }
                              />
                              <ReferenceLine y={0} stroke="#cbd5e1" />
                              <Area
                                type="monotone"
                                dataKey="cumulativePnl"
                                stroke="#0f172a"
                                strokeWidth={2}
                                fill="url(#pnlCumulative)"
                                isAnimationActive
                                animationDuration={900}
                              />
                            </AreaChart>
                          )}
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="flex h-72 items-center justify-center text-sm text-slate-500 sm:h-80">
                        <p>No realized P&amp;L data available yet</p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* Top Traders Copied */}
              {topTradersStats.length > 0 && (
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-slate-900">Top Traders Copied</h3>
                    {topTradersStats.length > 10 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAllTraders(!showAllTraders)}
                        className="text-sm"
                      >
                        {showAllTraders ? 'Show Top 10' : `Show All (${topTradersStats.length})`}
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 mb-6">Performance of all realized trades you copied (all traders)</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-3 px-2 font-semibold text-slate-700">Trader</th>
                          <th className="text-right py-3 px-2 font-semibold text-slate-700">Copies</th>
                          <th className="text-right py-3 px-2 font-semibold text-slate-700">Invested</th>
                          <th className="text-right py-3 px-2 font-semibold text-slate-700">P&L</th>
                          <th className="text-right py-3 px-2 font-semibold text-slate-700">ROI</th>
                          <th className="text-right py-3 px-2 font-semibold text-slate-700">Win Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(showAllTraders ? topTradersStats : topTradersStats.slice(0, 10)).map((trader) => (
                          <tr key={trader.trader_wallet} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3 px-2">
                              <Link
                                href={`/trader/${trader.trader_wallet}`}
                                className="font-medium text-slate-900 hover:text-yellow-600 transition-colors"
                              >
                                {trader.trader_name}
                              </Link>
                            </td>
                            <td className="text-right py-3 px-2 text-slate-700">{trader.copy_count}</td>
                            <td className="text-right py-3 px-2 text-slate-700">
                              {formatCurrency(trader.total_invested)}
                            </td>
                            <td
                              className={cn(
                                "text-right py-3 px-2 font-semibold",
                                trader.pnl >= 0 ? "text-emerald-600" : "text-red-600"
                              )}
                            >
                              {trader.pnl >= 0 ? '+' : ''}{formatCurrency(trader.pnl)}
                            </td>
                            <td
                              className={cn(
                                "text-right py-3 px-2 font-semibold",
                                trader.roi >= 0 ? "text-emerald-600" : "text-red-600"
                              )}
                            >
                              {trader.roi >= 0 ? '+' : ''}{trader.roi.toFixed(1)}%
                            </td>
                            <td className="text-right py-3 px-2 text-slate-700">
                              {trader.win_rate.toFixed(0)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

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
                      <div
                        className="absolute -bottom-6 left-0 right-0 grid text-xs text-slate-500"
                        style={{ gridTemplateColumns: `repeat(${positionSizeBuckets.length}, minmax(0, 1fr))` }}
                      >
                        {positionSizeBuckets.map((bucket, i) => (
                          <span key={i} className="text-center">
                            {bucket.range}
                          </span>
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
                      <div key={trade.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 line-clamp-2">{trade.market_title}</p>
                            <p className="text-xs text-slate-500">{formatRelativeTime(trade.copied_at)}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:gap-4">
                            <div className="flex flex-col items-start text-left sm:items-end sm:text-right">
                              <span className="text-[11px] font-medium text-slate-500">Outcome</span>
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
                            </div>
                            <div className="flex flex-col items-start text-left sm:items-end sm:text-right">
                              <span className="text-[11px] font-medium text-slate-500">ROI</span>
                              <p className={cn(
                                "text-base font-semibold",
                                (trade.roi || 0) >= 0 ? "text-emerald-600" : "text-red-600"
                              )}>
                                {(trade.roi || 0) >= 0 ? '+' : ''}{(trade.roi || 0).toFixed(1)}%
                              </p>
                            </div>
                          </div>
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
        </div>
      </div>

      {/* Modals */}
      <UpgradeModal open={showUpgradeModal} onOpenChange={setShowUpgradeModal} />
      <ConnectWalletModal
        open={isConnectModalOpen}
        onOpenChange={setIsConnectModalOpen}
        onConnect={handleWalletConnect}
      />
      <SubscriptionSuccessModal
        open={showSubscriptionSuccessModal}
        onOpenChange={setShowSubscriptionSuccessModal}
        onConnectWallet={() => {
          setShowSubscriptionSuccessModal(false);
          setIsConnectModalOpen(true);
        }}
      />
      <ShareStatsModal
        open={isShareStatsModalOpen}
        onOpenChange={setIsShareStatsModalOpen}
        username={polymarketUsername || 'My copy trades'}
        stats={{
          pnl: userStats.totalPnl,
          roi: userStats.roi,
          winRate: userStats.winRate,
          volume: userStats.totalVolume,
          trades: copiedTrades.length,
          followers: followingCount,
          memberSince: profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Jan 2026',
        }}
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

      {/* Close Position Modal for Quick Trades */}
      {closeTarget && (
        <ClosePositionModal
          target={closeTarget}
          isSubmitting={closeSubmitting}
          submitError={closeError}
          onClose={() => {
            setCloseTarget(null);
            setCloseError(null);
            setCloseSuccess(null);
            setCloseOrderId(null);
            setCloseSubmittedAt(null);
          }}
          onSubmit={handleConfirmClose}
          onManualClose={handleManualClose}
          orderId={closeOrderId}
          submittedAt={closeSubmittedAt}
        />
      )}

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
