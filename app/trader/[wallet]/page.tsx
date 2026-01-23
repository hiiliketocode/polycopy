'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Check, ChevronDown, ChevronUp, Loader2, Info, ExternalLink, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { triggerLoggedOut } from '@/lib/auth/logout-events';
import { Navigation } from '@/components/polycopy/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TradeCard } from '@/components/polycopy/trade-card';
import { TradeExecutionNotifications, type TradeExecutionNotification } from '@/components/polycopy/trade-execution-notifications';
import { ConnectWalletModal } from '@/components/polycopy/connect-wallet-modal';
import { extractMarketAvatarUrl } from '@/lib/marketAvatar';
import { getTraderAvatarInitials } from '@/lib/trader-name';
import { getESPNScoresForTrades, getScoreDisplaySides, getFallbackEspnUrl } from '@/lib/espn/scores';
import type { User } from '@supabase/supabase-js';
import { cn } from '@/lib/utils';
import { extractDateFromTitle, pickBestStartTime } from '@/lib/event-time';
import { useManualTradingMode } from '@/hooks/use-manual-trading-mode';
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  AreaChart,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ReferenceLine,
  Area,
} from 'recharts';

interface TraderData {
  wallet: string;
  displayName: string;
  pnl: number;
  volume: number;
  followerCount: number;
  profileImage?: string | null;
  roi?: number;
  tradesCount?: number;
  winRate?: number | null;
}

interface Trade {
  timestamp: number;
  market: string;
  side: string;
  outcome: string;
  size: number;
  price: number;
  currentPrice?: number;
  formattedDate: string;
  marketSlug?: string;
  conditionId?: string;
  eventSlug?: string;
  tokenId?: string;
  status: 'Open' | 'Trader Closed' | 'Bonded';
  category?: string;
  marketAvatarUrl?: string | null;
  source?: 'onchain' | 'api' | 'copy';
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

interface TraderComputedStats {
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  volume: number;
  roi: number;
  winRate: number | null;
}

interface RealizedPnlRow {
  date: string;
  realized_pnl: number;
  pnl_to_date: number | null;
}

interface DailyPnlPoint {
  date: string;
  pnl: number;
  trades: number;
}

interface MyTradeStatsSummary {
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalVolume: number;
  roi: number;
  winRate: number;
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;
}

interface MyTradeStatsResponse {
  trader: MyTradeStatsSummary;
  overall: MyTradeStatsSummary;
  dailyPnl: DailyPnlPoint[];
  shares: {
    tradesPct: number | null;
    pnlPct: number | null;
    winsPct: number | null;
    lossesPct: number | null;
  };
}

const pnlWindowOptions = [
  { key: '1D', label: 'Yesterday', range: 'rolling', days: 1 },
  { key: '7D', label: 'Last 7 Days', range: 'rolling', days: 7 },
  { key: '30D', label: '30 Days', range: 'rolling', days: 30 },
  { key: '3M', label: '3 Months', range: 'rolling', days: 90 },
  { key: '6M', label: '6 Months', range: 'rolling', days: 180 },
  { key: 'ALL', label: 'All Time', range: 'all', days: null },
] as const;

type PnlWindowKey = typeof pnlWindowOptions[number]['key'];

const normalizeOutcome = (value: string) => value?.trim().toLowerCase();

const findOutcomeIndex = (outcomes: string[] | null | undefined, target: string) => {
  if (!outcomes || outcomes.length === 0) return -1;
  const normalizedTarget = normalizeOutcome(target);
  if (!normalizedTarget) return -1;
  const normalizedOutcomes = outcomes.map((outcome) => normalizeOutcome(outcome));
  const exactIndex = normalizedOutcomes.findIndex((outcome) => outcome === normalizedTarget);
  if (exactIndex >= 0) return exactIndex;
  return normalizedOutcomes.findIndex(
    (outcome) => outcome.includes(normalizedTarget) || normalizedTarget.includes(outcome)
  );
};

const pickOutcomeTeams = (outcomes?: string[] | null) => {
  if (!outcomes || outcomes.length === 0) return [];
  const filtered = outcomes.filter(outcome => !/^(draw|tie)$/i.test(outcome.trim()));
  if (filtered.length >= 2) return filtered.slice(0, 2);
  return outcomes.slice(0, 2);
};

type ESPNScoreLike = {
  gameId?: string;
  homeScore: number;
  awayScore: number;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamAbbrev: string;
  awayTeamAbbrev: string;
  status: 'scheduled' | 'live' | 'final';
  startTime: string;
  displayClock?: string;
  period?: number;
  statusDetail?: string;
  gameUrl?: string;
};

const buildScoreDisplay = ({
  trade,
  outcomes,
  liveScore,
  homeTeam,
  awayTeam,
  gameStartTime,
  espnScore,
}: {
  trade: Trade;
  outcomes?: string[] | null;
  liveScore?: unknown;
  homeTeam?: string | null;
  awayTeam?: string | null;
  gameStartTime?: string | null;
  espnScore?: ESPNScoreLike | null;
}) => {
  const hasTeamMetadata =
    (typeof homeTeam === 'string' && homeTeam.trim().length > 0) ||
    (typeof awayTeam === 'string' && awayTeam.trim().length > 0);
  const hasScoreMetadata =
    Boolean(
      liveScore &&
        (typeof liveScore === 'object' || (typeof liveScore === 'string' && liveScore.trim()))
    );
  const isSportsMarket =
    trade.market.includes(' vs. ') ||
    trade.market.includes(' vs ') ||
    trade.market.includes(' v ') ||
    trade.market.includes(' versus ') ||
    trade.market.includes(' @ ') ||
    trade.category === 'sports' ||
    hasTeamMetadata ||
    hasScoreMetadata;

  if (!isSportsMarket) {
    return { scoreDisplay: undefined, liveStatus: espnScore?.status };
  }

  let scoreDisplay: string | undefined;

  if (espnScore) {
    const { team1Label, team1Score, team2Label, team2Score } = getScoreDisplaySides(
      trade.market,
      espnScore
    );
    let clock = '';
    if (espnScore.displayClock) {
      clock = ` (${espnScore.displayClock})`;
    } else if (espnScore.statusDetail && !/\d+\s*-\s*\d+/.test(espnScore.statusDetail)) {
      clock = ` (${espnScore.statusDetail})`;
    }

    if (espnScore.status === 'final') {
      scoreDisplay = `${team1Label} ${team1Score} - ${team2Score} ${team2Label}`;
    } else if (espnScore.status === 'live') {
      scoreDisplay = `${team1Label} ${team1Score} - ${team2Score} ${team2Label}${clock}`;
    }
  } else if (liveScore && typeof liveScore === 'object') {
    const homeScoreRaw = (liveScore as any).home ?? (liveScore as any).homeScore ?? (liveScore as any).home_score ?? 0;
    const awayScoreRaw = (liveScore as any).away ?? (liveScore as any).awayScore ?? (liveScore as any).away_score ?? 0;
    const homeScore = Number.isFinite(Number(homeScoreRaw)) ? Number(homeScoreRaw) : 0;
    const awayScore = Number.isFinite(Number(awayScoreRaw)) ? Number(awayScoreRaw) : 0;
    const fallbackTeams = pickOutcomeTeams(outcomes);
    const homeTeamName = typeof homeTeam === 'string' ? homeTeam : fallbackTeams[0] || '';
    const awayTeamName = typeof awayTeam === 'string' ? awayTeam : fallbackTeams[1] || '';
    const derivedScore = {
      homeScore,
      awayScore,
      homeTeamName,
      awayTeamName,
      homeTeamAbbrev: '',
      awayTeamAbbrev: '',
      status: 'live' as const,
      startTime: gameStartTime || '',
      displayClock: undefined,
      period: undefined,
    };
    const { team1Label, team1Score, team2Label, team2Score } = getScoreDisplaySides(
      trade.market,
      derivedScore
    );
    scoreDisplay = `${team1Label} ${team1Score} - ${team2Score} ${team2Label}`;
  } else if (typeof liveScore === 'string' && liveScore.trim()) {
    scoreDisplay = liveScore.trim();
  }

  return { scoreDisplay, liveStatus: espnScore?.status };
};

const normalizeKeyPart = (value?: string | null) => value?.trim().toLowerCase() || '';
const buildCopiedTradeKey = (marketKey?: string | null, traderWallet?: string | null) => {
  const market = normalizeKeyPart(marketKey);
  const wallet = normalizeKeyPart(traderWallet);
  if (!market || !wallet) return '';
  return `${market}-${wallet}`;
};
const getMarketKeyForTrade = (trade: Trade) =>
  normalizeKeyPart(trade.conditionId || trade.marketSlug || trade.market || null);
export default function TraderProfilePage({
  params,
}: {
  params: Promise<{ wallet: string }>;
}) {
  const router = useRouter();
  const [wallet, setWallet] = useState<string>('');
  const [user, setUser] = useState<User | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [traderData, setTraderData] = useState<TraderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loadingTrades, setLoadingTrades] = useState(true);
  const [tradesToShow, setTradesToShow] = useState(15); // Start with 15 trades for faster loading
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<'positions' | 'performance'>('performance');

  const syncTabToUrl = (tab: 'positions' | 'performance') => {
    if (!pathname) return;
    const currentQuery = searchParams.toString();
    const nextParams = new URLSearchParams(currentQuery);
    const tabValue = tab === 'performance' ? 'performance' : 'trades';
    nextParams.set('tab', tabValue);
    const nextQuery = nextParams.toString();
    if (nextQuery === currentQuery) return;
    const targetUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    router.replace(targetUrl);
  };

  const handleTabSelection = (tab: 'positions' | 'performance') => {
    setActiveTab(tab);
    syncTabToUrl(tab);
  };

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (!tabParam) return;
    if (tabParam === 'trades' || tabParam === 'positions') {
      setActiveTab('positions');
    }
    if (tabParam === 'performance') {
      setActiveTab('performance');
    }
  }, [searchParams]);
  const [showResolvedTrades, setShowResolvedTrades] = useState(false);
  const espnCacheUpdatedRef = useRef(new Set<string>());
  
  const [showWalletConnectModal, setShowWalletConnectModal] = useState(false);
  const [showConnectWalletModal, setShowConnectWalletModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedTradeIds, setCopiedTradeIds] = useState<Set<string>>(new Set());
  const { manualModeEnabled, enableManualMode } = useManualTradingMode(
    isPremium,
    Boolean(walletAddress)
  );
  
  // Premium user expandable cards
  const [expandedTradeKeys, setExpandedTradeKeys] = useState<Set<string>>(new Set());
  const [tradeNotifications, setTradeNotifications] = useState<TradeExecutionNotification[]>([]);
  const [usdAmount, setUsdAmount] = useState<string>('');
  const [autoClose, setAutoClose] = useState(false);
  const [manualCopyTradeIndex, setManualCopyTradeIndex] = useState<number | null>(null);
  const [manualUsdAmount, setManualUsdAmount] = useState<string>('');
  const [defaultBuySlippage, setDefaultBuySlippage] = useState(3);
  const [defaultSellSlippage, setDefaultSellSlippage] = useState(3);
  
  // Performance tab data
  const [positionSizeBuckets, setPositionSizeBuckets] = useState<PositionSizeBucket[]>([]);
  const [categoryDistribution, setCategoryDistribution] = useState<CategoryDistribution[]>([]);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [computedStats, setComputedStats] = useState<TraderComputedStats | null>(null);
  const [realizedPnlRows, setRealizedPnlRows] = useState<RealizedPnlRow[]>([]);
  const [loadingRealizedPnl, setLoadingRealizedPnl] = useState(false);
  const [realizedPnlError, setRealizedPnlError] = useState<string | null>(null);
  const [pnlWindow, setPnlWindow] = useState<PnlWindowKey>('30D');
  const [pnlView, setPnlView] = useState<'daily' | 'cumulative'>('daily');
  const [rankingsByWindow, setRankingsByWindow] = useState<Record<string, {
    rank: number | null;
    total: number | null;
    delta: number | null;
    previousRank: number | null;
  }>>({});
  const [myTradeStats, setMyTradeStats] = useState<MyTradeStatsResponse | null>(null);
  const [myTradeStatsLoading, setMyTradeStatsLoading] = useState(false);
  const [myPnlWindow, setMyPnlWindow] = useState<'1D' | '7D' | '30D' | 'ALL'>('30D');
  
  // Copy wallet address state
  const [walletCopied, setWalletCopied] = useState(false);
  
  // Live market data for trade cards
  const [liveMarketData, setLiveMarketData] = useState<Map<string, { 
    price: number; 
    score?: string;
    closed?: boolean;
    resolved?: boolean;
    gameStartTime?: string;
    eventStatus?: string;
    endDateIso?: string;
    liveStatus?: 'live' | 'scheduled' | 'final' | 'unknown';
    espnUrl?: string;
    eventSlug?: string;
    marketAvatarUrl?: string;
    tags?: unknown;
    homeTeam?: string | null;
    awayTeam?: string | null;
  }>>(new Map());

  useEffect(() => {
    if (!isAdmin) {
      setAutoClose(false);
      return;
    }
    setAutoClose((prev) => (prev ? prev : true));
  }, [isAdmin]);

  const handleTradeExecutionNotification = useCallback((notification: TradeExecutionNotification) => {
    setTradeNotifications((prev) => {
      if (prev.some((item) => item.id === notification.id)) return prev;
      return [notification, ...prev];
    });
  }, []);

  const handleNavigateToTrade = useCallback((notice: TradeExecutionNotification) => {
    const target = document.getElementById(notice.tradeAnchorId);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const mergeTrades = useCallback((existing: Trade[], incoming: Trade[]) => {
    const all = [...incoming, ...existing];
    const seen = new Set<string>();

    const normalizeTradeKey = (trade: Trade) => {
      const marketKey = getMarketKeyForTrade(trade);
      const outcomeKey = normalizeKeyPart(trade.outcome);
      const sideKey = normalizeKeyPart(trade.side);
      const priceKey = Math.round((trade.price || 0) * 1e6);
      const sizeKey = Math.round((trade.size || 0) * 1e6);
      const tsKey = Math.round((trade.timestamp || 0) / 1000);
      return [marketKey, outcomeKey, sideKey, priceKey, sizeKey, tsKey].join('|');
    };

    const deduped: Trade[] = [];
    for (const trade of all) {
      const key = normalizeTradeKey(trade);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(trade);
    }

    deduped.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return deduped;
  }, []);

  const buildExpandedTradeKey = (trade: Trade, index: number) => {
    const parts = [
      trade.conditionId,
      trade.marketSlug,
      trade.market,
      trade.outcome,
      trade.side,
      trade.timestamp ? String(trade.timestamp) : null,
      String(index),
    ]
      .map((value) => value?.toString().trim())
      .filter(Boolean);
    return parts.join('|');
  };

  const toggleTradeExpanded = (tradeKey: string) => {
    setExpandedTradeKeys((prev) => {
      const next = new Set(prev);
      if (next.has(tradeKey)) {
        next.delete(tradeKey);
      } else {
        next.add(tradeKey);
      }
      return next;
    });
  };

  // Unwrap params
  useEffect(() => {
    params.then((p) => setWallet(p.wallet));
  }, [params]);

  // Fetch current user
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      
      if (session?.user) {
        const isMeaningfulError = (err: any) => {
          if (!err || typeof err !== 'object') return !!err;
          if (err.code === 'PGRST116') return false;
          const values = [err.code, err.message, err.details, err.hint, err.status];
          return values.some((value) => {
            if (typeof value === 'string') return value.trim().length > 0;
            return Boolean(value);
          });
        };

        const formatSupabaseError = (err: any) => {
          if (!err || typeof err !== 'object') return err;
          return {
            code: err.code,
            message: err.message,
            details: err.details,
            hint: err.hint,
            status: err.status,
          };
        };

        // Fetch premium status
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_premium, is_admin')
          .eq('id', session.user.id)
          .single();
        
        setIsPremium(profile?.is_premium || profile?.is_admin || false);
        setIsAdmin(profile?.is_admin || false);
        
        // Fetch wallet address
        const { data: walletData } = await supabase
          .from('turnkey_wallets')
          .select('polymarket_account_address, eoa_address')
          .eq('user_id', session.user.id)
          .maybeSingle();
        
        if (walletData) {
          setWalletAddress(walletData.polymarket_account_address || walletData.eoa_address || null);
        }

        try {
          const { data, error } = await supabase
            .from('notification_preferences')
            .select('default_buy_slippage, default_sell_slippage')
            .eq('user_id', session.user.id)
            .maybeSingle();

          if (isMeaningfulError(error)) {
            console.error('Error fetching slippage preferences:', formatSupabaseError(error));
          }

          if (data) {
            setDefaultBuySlippage(data.default_buy_slippage ?? 3);
            setDefaultSellSlippage(data.default_sell_slippage ?? 3);
          }
        } catch (err) {
          if (isMeaningfulError(err)) {
            console.error('Error fetching slippage preferences:', formatSupabaseError(err));
          }
        }
        
        // Fetch copied trades (service-backed to bypass RLS issues)
        try {
          const apiResponse = await fetch(`/api/copied-trades?userId=${session.user.id}`);
          if (apiResponse.ok) {
            const payload = await apiResponse.json();
            const ids = new Set<string>();
            payload?.trades?.forEach(
              (t: { market_id?: string; market_slug?: string; market_title?: string; trader_wallet?: string }) => {
                const walletKey = normalizeKeyPart(t.trader_wallet);
                if (!walletKey) return;
                const marketKeys = [t.market_id, t.market_slug, t.market_title]
                  .map(normalizeKeyPart)
                  .filter(Boolean);
                if (marketKeys.length === 0) return;
                for (const key of new Set(marketKeys)) {
                  ids.add(`${key}-${walletKey}`);
                }
              }
            );
            setCopiedTradeIds(ids);
          }
        } catch (err) {
          console.error('Error fetching copied trades via API:', err);
        }
      }
    };
    
    fetchUser();
  }, []);

  const handleWalletConnect = async (address: string) => {
    if (!user) return;

    try {
      const { data: walletData } = await supabase
        .from('turnkey_wallets')
        .select('polymarket_account_address, eoa_address')
        .eq('user_id', user.id)
        .maybeSingle();

      const connectedWallet =
        walletData?.polymarket_account_address ||
        walletData?.eoa_address ||
        address;

      setWalletAddress(connectedWallet || null);

      try {
        await fetch('/api/polymarket/reset-credentials', {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
        });
      } catch {
        // Non-blocking
      }

      if (connectedWallet) {
        try {
          await fetch('/api/polymarket/l2-credentials', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify({ polymarketAccountAddress: connectedWallet }),
          });
        } catch {
          // Non-blocking
        }
      }
    } catch (err) {
      console.error('Error updating wallet after connection:', err);
      setWalletAddress(address);
    }
  };

  // Fetch trader data
  useEffect(() => {
    if (!wallet) return;

    const loadTraderData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Always fetch all-time stats from Polymarket leaderboard
        const response = await fetch(`/api/trader/${wallet}?timePeriod=all`);

        if (!response.ok) {
          throw new Error('Failed to fetch trader data');
        }

        const data = await response.json();
        setTraderData(data);
      } catch (err: any) {
        console.error('Error fetching trader:', err);
        setError(err.message || 'Failed to load trader data');
      } finally {
        setLoading(false);
      }
    };

    loadTraderData();
  }, [wallet]);

  // Fetch realized PnL daily series
  useEffect(() => {
    if (!wallet) return;

    let cancelled = false;
    const controller = new AbortController();

    const loadRealizedPnl = async () => {
      if (!cancelled) {
        setLoadingRealizedPnl(true);
        setRealizedPnlError(null);
      }
      try {
        const response = await fetch(`/api/trader/${wallet}/realized-pnl`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error('Failed to fetch realized PnL');
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
          if (data?.rankings && typeof data.rankings === 'object') {
            setRankingsByWindow(data.rankings);
          } else {
            setRankingsByWindow({});
          }
        }
      } catch (err: any) {
        if (controller.signal.aborted) return;
        console.error('Error fetching realized PnL:', err);
        if (!cancelled) {
          setRealizedPnlRows([]);
          setRealizedPnlError(err?.message || 'Failed to load realized PnL');
          setRankingsByWindow({});
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
  }, [wallet]);

  useEffect(() => {
    if (!wallet || !user) {
      setMyTradeStats(null);
      setMyTradeStatsLoading(false);
      return;
    }

    let cancelled = false;

    const loadMyTradeStats = async () => {
      setMyTradeStatsLoading(true);
      try {
        const response = await fetch(`/api/trader/${wallet}/my-stats`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('Failed to load my trade stats');
        }
        const data = await response.json();
        if (!cancelled) {
          setMyTradeStats(data);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading my trade stats:', err);
          setMyTradeStats(null);
        }
      } finally {
        if (!cancelled) {
          setMyTradeStatsLoading(false);
        }
      }
    };

    loadMyTradeStats();

    return () => {
      cancelled = true;
    };
  }, [wallet, user]);

  // Check follow status
  useEffect(() => {
    if (!wallet || !user) return;

    const checkFollowStatus = async () => {
      const normalizedWallet = wallet.toLowerCase();
      
      const { data } = await supabase
        .from('follows')
        .select('id')
        .eq('user_id', user.id)
        .eq('trader_wallet', normalizedWallet)
        .single();

      if (data) {
        setFollowing(true);
      }
    };
    
    checkFollowStatus();
  }, [wallet, user]);

  // Fetch trades from blockchain (complete history, no limits!)
  useEffect(() => {
    if (!wallet) return;

    let cancelled = false;

    const formatDate = (timestampMs: number) =>
      new Date(timestampMs).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

    const mergeIntoState = (incoming: Trade[]) => {
      if (incoming.length === 0) return;
      setTrades((prev) => mergeTrades(prev, incoming));
    };

    const extractTokenId = (rawTrade: any): string | undefined => {
      const candidates = [
        rawTrade.token_id,
        rawTrade.tokenId,
        rawTrade.tokenID,
        rawTrade.asset_id,
        rawTrade.assetId,
        rawTrade.asset,
      ];
      for (const candidate of candidates) {
        if (candidate === undefined || candidate === null) continue;
        const value =
          typeof candidate === 'number' ? candidate.toString() : String(candidate).trim();
        if (value) return value;
      }
      return undefined;
    };

    const fetchPolycopyTrades = async () => {
      try {
        const response = await fetch(`/api/trader/${wallet}/copy-trades`, { cache: 'no-store' });
        if (!response.ok) return;

        const payload = await response.json();
        const normalized: Trade[] = (payload?.trades || []).map((trade: any) => {
          const timestampMs = trade.copied_at
            ? Date.parse(trade.copied_at)
            : trade.created_at
              ? Date.parse(trade.created_at)
              : Date.now();

          const priceWhenCopied = Number(trade.price_when_copied ?? trade.current_price ?? 0) || 0;
          const entrySize = Number(trade.entry_size ?? 0) || 0;
          const amountInvested = Number(trade.amount_invested ?? 0) || 0;
          const inferredSize =
            entrySize || (priceWhenCopied > 0 && amountInvested > 0 ? amountInvested / priceWhenCopied : 0);

          let status: 'Open' | 'Trader Closed' | 'Bonded' = 'Open';
          if (trade.market_resolved) {
            status = 'Bonded';
          } else if (trade.trader_still_has_position === false || trade.user_closed_at) {
            status = 'Trader Closed';
          }

          return {
            timestamp: Number.isFinite(timestampMs) ? timestampMs : Date.now(),
            market: trade.market_title || trade.market_slug || trade.market_id || 'Unknown Market',
            side: (trade.side || 'BUY').toUpperCase(),
            outcome: trade.outcome || '',
            size: inferredSize,
            price: priceWhenCopied,
            currentPrice: trade.current_price ?? undefined,
            formattedDate: formatDate(Number.isFinite(timestampMs) ? timestampMs : Date.now()),
            marketSlug: trade.market_slug || undefined,
            conditionId: trade.market_id || undefined,
            tokenId: extractTokenId(trade),
            status,
            marketAvatarUrl:
              trade.market_avatar_url ?? trade.marketAvatarUrl ?? extractMarketAvatarUrl(trade) ?? null,
            source: 'copy',
          };
        });

        if (!cancelled) {
          mergeIntoState(normalized);
        }
      } catch (err) {
        console.error('Error fetching Polycopy trades for trader page:', err);
      }
    };

    const fetchAllTrades = async () => {
      setLoadingTrades(true);

      await fetchPolycopyTrades();

      try {
        console.log('🔗 Fetching complete trade history from blockchain for:', wallet);
        
        // Try blockchain approach first (unlimited history)
        const blockchainResponse = await fetch(`/api/polymarket/trades-blockchain/${wallet}`);
        
        if (blockchainResponse.ok) {
          const blockchainData = await blockchainResponse.json();
          
          if (blockchainData.success && blockchainData.trades) {
            console.log(`✅ Blockchain: Fetched ${blockchainData.trades.length} trades`);
            
            const formattedTrades: Trade[] = blockchainData.trades.map((trade: any) => {
              // Ensure timestamp is in milliseconds
              let timestampMs = trade.timestamp;
              if (timestampMs < 10000000000) {
                timestampMs = timestampMs * 1000;
              }
              
              const tradeDate = new Date(timestampMs);
              const formattedDate = tradeDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              });
              
              // Determine trade status based on market data
              let status: 'Open' | 'Trader Closed' | 'Bonded' = 'Open';
              if (trade.closed === true || trade.is_closed === true) {
                status = 'Trader Closed';
              } else if (trade.resolved === true || trade.is_resolved === true || trade.marketResolved === true) {
                status = 'Bonded';
              }
              
              return {
                timestamp: timestampMs,
                market: trade.title || trade.question || trade.market || trade.marketTitle || 'Unknown Market',
                side: trade.side || 'BUY',
                outcome: trade.outcome || '',
                size: parseFloat(trade.size || 0),
                price: parseFloat(trade.price || 0),
                currentPrice: trade.closedPrice || trade.resolvedPrice || trade.exitPrice ? parseFloat(trade.closedPrice || trade.resolvedPrice || trade.exitPrice) : undefined,
                formattedDate,
                marketSlug: trade.marketSlug || trade.slug || '',
                eventSlug: trade.eventSlug || trade.event_slug || '',
                conditionId: trade.conditionId || trade.condition_id || '',
                tokenId: extractTokenId(trade),
                status: status,
                marketAvatarUrl: trade.marketAvatarUrl ?? extractMarketAvatarUrl(trade) ?? null,
                source: 'onchain',
              };
            });

            formattedTrades.sort((a, b) => b.timestamp - a.timestamp);
            if (!cancelled) {
              setTrades((prev) => mergeTrades(prev, formattedTrades));
            }
            if (!cancelled) setLoadingTrades(false);
            return;
          }
        }
        
        // Fallback to data-api if blockchain fails
        console.log('⚠️ Blockchain fetch failed, falling back to data-api (100 trades max)');
        const fallbackResponse = await fetch(
          `https://data-api.polymarket.com/trades?user=${wallet}&limit=100`,
          { cache: 'no-store' }
        );
        
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          
          const formattedTrades: Trade[] = fallbackData.map((trade: any) => {
            let timestampMs = trade.timestamp;
            if (timestampMs < 10000000000) {
              timestampMs = timestampMs * 1000;
            }
            
            const tradeDate = new Date(timestampMs);
            const formattedDate = tradeDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            });
            
            // Determine trade status based on market data
            let status: 'Open' | 'Trader Closed' | 'Bonded' = 'Open';
            if (trade.closed === true || trade.is_closed === true) {
              status = 'Trader Closed';
            } else if (trade.resolved === true || trade.is_resolved === true || trade.marketResolved === true) {
              status = 'Bonded';
            }
            
            return {
              timestamp: timestampMs,
              market: trade.title || trade.question || trade.market?.title || trade.marketTitle || 'Unknown Market',
              side: trade.side || 'BUY',
              outcome: trade.outcome || '',
              size: parseFloat(trade.size || 0),
              price: parseFloat(trade.price || 0),
              currentPrice: trade.currentPrice || trade.closedPrice || trade.resolvedPrice || trade.exitPrice ? parseFloat(trade.currentPrice || trade.closedPrice || trade.resolvedPrice || trade.exitPrice) : undefined,
              formattedDate,
              marketSlug: trade.slug || trade.marketSlug || trade.market?.slug || '',
              eventSlug: trade.eventSlug || trade.event_slug || '',
              conditionId: trade.conditionId || trade.condition_id || '',
              tokenId: extractTokenId(trade),
              status: status,
              marketAvatarUrl: extractMarketAvatarUrl(trade) ?? null,
              source: 'api',
            };
          });

          formattedTrades.sort((a, b) => b.timestamp - a.timestamp);
          if (!cancelled) {
            setTrades((prev) => mergeTrades(prev, formattedTrades));
          }
        }
      } catch (err) {
        console.error('❌ Error fetching trades:', err);
        if (!cancelled) {
          setTrades([]);
        }
      } finally {
        if (!cancelled) setLoadingTrades(false);
      }
    };

    fetchAllTrades();
    return () => {
      cancelled = true;
    };
  }, [wallet, mergeTrades]);

  // Fetch live market data for trades (prices, scores, and resolution status)
  // Using progressive loading - updates state as data comes in
  useEffect(() => {
    if (trades.length === 0) return;

    const fetchLiveMarketData = async () => {
      // Only fetch data for the trades we're currently displaying
      const displayedTrades = trades.slice(0, tradesToShow);
      
      console.log(`📊 Fetching live data for ${displayedTrades.length} trades...`);
      
      // Convert trades to the format expected by getESPNScoresForTrades
      const tradesForESPN = displayedTrades.map(trade => ({
        market: {
          conditionId: trade.conditionId,
          title: trade.market,
          category: trade.category,
          slug: trade.marketSlug,
          eventSlug: trade.eventSlug,
          tags: undefined,
        },
        trade: {
          outcome: trade.outcome,
        },
      }));

      // Immediately start fetching prices for all trades in parallel
      const pricePromises = displayedTrades.map(async (trade) => {
        if (!trade.conditionId) return;

        try {
          // Fetch market data to check resolution status and get price
          const response = await fetch(`/api/polymarket/price?conditionId=${trade.conditionId}`);
          if (response.ok) {
            const priceData = await response.json();
            
            if (priceData.success && priceData.market) {
              const {
                outcomes,
                outcomePrices,
                closed,
                resolved,
                gameStartTime,
                eventStatus,
                score,
                homeTeam,
                awayTeam,
                endDateIso,
                marketAvatarUrl,
                espnUrl: cachedEspnUrl,
                eventSlug: resolvedEventSlug,
                tags,
                cryptoSymbol,
                cryptoPriceUsd,
              } = priceData.market;

              const inferredStartDate = extractDateFromTitle(trade.market);
              const effectiveGameStartTime = pickBestStartTime(
                gameStartTime ?? undefined,
                inferredStartDate
              );

              const { scoreDisplay: fallbackScoreDisplay } = buildScoreDisplay({
                trade,
                outcomes,
                liveScore: score,
                homeTeam,
                awayTeam,
                gameStartTime: effectiveGameStartTime,
              });
              let resolvedScoreDisplay = fallbackScoreDisplay;
              if (cryptoSymbol && typeof cryptoPriceUsd === 'number') {
                const formatter = new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  maximumFractionDigits: 2,
                });
                resolvedScoreDisplay = `${cryptoSymbol} ${formatter.format(cryptoPriceUsd)}`;
              }

              const fallbackEspnUrl = getFallbackEspnUrl({
                title: trade.market,
                category: trade.category,
                slug: trade.marketSlug,
                eventSlug: trade.eventSlug,
                tags,
                dateHint: effectiveGameStartTime || endDateIso || undefined,
              });
              
              // Check if market is resolved
              const isResolved = typeof resolved === 'boolean' ? resolved : closed === true;
              
              // Find the price for this specific outcome
              const outcomeIndex = findOutcomeIndex(outcomes, trade.outcome);
              const currentPrice = (outcomeIndex !== -1 && outcomePrices && outcomePrices[outcomeIndex]) 
                ? Number(outcomePrices[outcomeIndex])
                : trade.price;

              // Update state immediately with price data (without score yet)
                  setLiveMarketData(prev => {
                    const next = new Map(prev);
                    const existing = next.get(trade.conditionId!);
                    next.set(trade.conditionId!, {
                      price: currentPrice,
                      closed: closed,
                      resolved: isResolved,
                      score: resolvedScoreDisplay ?? existing?.score,
                      liveStatus: existing?.liveStatus,
                      gameStartTime: pickBestStartTime(
                        existing?.gameStartTime,
                        effectiveGameStartTime
                      ),
                      eventStatus: eventStatus || existing?.eventStatus,
                      endDateIso: endDateIso || existing?.endDateIso,
                      espnUrl: existing?.espnUrl ?? cachedEspnUrl ?? fallbackEspnUrl,
                      eventSlug: resolvedEventSlug || existing?.eventSlug,
                      marketAvatarUrl: marketAvatarUrl || existing?.marketAvatarUrl,
                      tags: tags ?? existing?.tags,
                      homeTeam: typeof homeTeam === 'string' ? homeTeam : null,
                      awayTeam: typeof awayTeam === 'string' ? awayTeam : null,
                    });
                    return next;
                  });

              return {
                trade,
                outcomes,
                currentPrice,
                closed,
                isResolved,
                gameStartTime: effectiveGameStartTime,
                eventStatus,
                score,
                homeTeam,
                awayTeam,
                endDateIso,
                eventSlug: resolvedEventSlug,
                marketAvatarUrl,
                tags,
              };
            }
          }
        } catch (error) {
          console.error(`Failed to fetch market data for ${trade.conditionId}:`, error);
        }
        return null;
      });

      // Wait for all price fetches to complete
      const priceResults = await Promise.all(pricePromises);

      const dateHintsByMarketKey: Record<string, string | number | null | undefined> = {};
      priceResults.forEach((result) => {
        if (!result?.trade.conditionId) return;
        const fallbackDate = result.endDateIso || result.gameStartTime;
        if (fallbackDate) {
          dateHintsByMarketKey[result.trade.conditionId] = fallbackDate;
        }
      });

      const teamHintsByMarketKey: Record<string, { homeTeam?: string; awayTeam?: string }> = {};
      priceResults.forEach((result) => {
        if (!result?.trade.conditionId) return;
        const home = result.homeTeam?.trim();
        const away = result.awayTeam?.trim();
        if (home || away) {
          teamHintsByMarketKey[result.trade.conditionId] = {
            homeTeam: home || undefined,
            awayTeam: away || undefined,
          };
        }
      });

      const dateHints = priceResults
        .flatMap((result) => [result?.gameStartTime, result?.endDateIso])
        .filter(
          (value): value is string | number =>
            value !== undefined && value !== null && value !== ''
        );

      console.log('🏈 Fetching sports scores in background...');
      const eventSlugByConditionId = new Map<string, string>();
      const tagsByConditionId = new Map<string, unknown>();
      priceResults.forEach((result) => {
        if (result?.trade.conditionId && result?.eventSlug) {
          eventSlugByConditionId.set(result.trade.conditionId, result.eventSlug);
        }
        if (result?.trade.conditionId && result.tags !== undefined) {
          tagsByConditionId.set(result.trade.conditionId, result.tags);
        }
      });

      const tradesForESPNResolved = tradesForESPN.map((trade) => {
        const conditionId = trade.market?.conditionId;
        const resolvedEventSlug =
          (conditionId ? eventSlugByConditionId.get(conditionId) : undefined) ||
          trade.market?.eventSlug;
        const resolvedTags =
          (conditionId ? tagsByConditionId.get(conditionId) : undefined) ?? trade.market?.tags;
        const shouldUpdate =
          (resolvedEventSlug && resolvedEventSlug !== trade.market?.eventSlug) ||
          (resolvedTags !== undefined && resolvedTags !== trade.market?.tags);
        if (!shouldUpdate) return trade;
        return {
          ...trade,
          market: {
            ...trade.market,
            eventSlug: resolvedEventSlug || trade.market?.eventSlug,
            tags: resolvedTags ?? trade.market?.tags,
          },
        };
      });

      const espnScoresPromise = getESPNScoresForTrades(tradesForESPNResolved as any, {
        dateHints,
        dateHintsByMarketKey,
        teamHintsByMarketKey,
      });

      // Now wait for ESPN scores and update trades with scores
      try {
        const espnScores = await espnScoresPromise;
        console.log(`✅ Got sports scores for ${espnScores.size} markets`);

        // Update trades with scores
        priceResults.forEach(result => {
          if (!result) return;
          const {
            trade,
            outcomes,
            currentPrice,
            closed,
            isResolved,
            gameStartTime,
            eventStatus,
            score: liveScore,
            homeTeam,
            awayTeam,
            endDateIso,
            marketAvatarUrl,
          } = result;

          const espnScore = espnScores.get(trade.conditionId!);
          const fallbackEspnUrl = getFallbackEspnUrl({
            title: trade.market,
            category: trade.category,
            slug: trade.marketSlug,
            eventSlug: trade.eventSlug,
            tags: result.tags,
            dateHint: espnScore?.startTime || result.gameStartTime || result.endDateIso || undefined,
          });
          const { scoreDisplay, liveStatus } = buildScoreDisplay({
            trade,
            outcomes,
            liveScore,
            homeTeam,
            awayTeam,
            gameStartTime,
            espnScore: espnScore ?? null,
          });

          if (espnScore || scoreDisplay) {
            setLiveMarketData(prev => {
              const next = new Map(prev);
              const existing = next.get(trade.conditionId!);
              const resolvedStartTime = pickBestStartTime(
                existing?.gameStartTime ?? gameStartTime,
                espnScore?.startTime
              );
              next.set(trade.conditionId!, {
                price: currentPrice,
                closed,
                resolved: isResolved,
                score: scoreDisplay ?? existing?.score,
                liveStatus: liveStatus ?? existing?.liveStatus,
                gameStartTime: resolvedStartTime,
                eventStatus: existing?.eventStatus ?? eventStatus,
                endDateIso: existing?.endDateIso ?? endDateIso,
                espnUrl: espnScore?.gameUrl ?? existing?.espnUrl ?? fallbackEspnUrl,
                eventSlug: existing?.eventSlug ?? result.eventSlug,
                marketAvatarUrl: existing?.marketAvatarUrl ?? marketAvatarUrl,
                tags: existing?.tags ?? result.tags,
                homeTeam: existing?.homeTeam ?? result.homeTeam ?? null,
                awayTeam: existing?.awayTeam ?? result.awayTeam ?? null,
              });
              return next;
            });
          }

          if (
            trade.conditionId &&
            espnScore?.gameUrl &&
            !espnCacheUpdatedRef.current.has(trade.conditionId)
          ) {
            espnCacheUpdatedRef.current.add(trade.conditionId);
            fetch('/api/markets/espn', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                conditionId: trade.conditionId,
                espnUrl: espnScore.gameUrl,
                espnGameId: espnScore.gameId,
              }),
            }).catch(() => undefined);
          }
        });
      } catch (error) {
        console.error('Failed to fetch ESPN scores:', error);
      }
    };

    fetchLiveMarketData();
  }, [trades, tradesToShow]);

  // Process trades for performance metrics
  useEffect(() => {
    if (trades.length === 0 || !traderData) {
      setPositionSizeBuckets([]);
      setCategoryDistribution([]);
      return;
    }

    console.log('📊 Processing performance metrics for position sizing');

    // Calculate Position Size Distribution
    const positionSizes = trades.map(trade => trade.size * trade.price);
    
    // Define buckets based on the data
    const buckets = [
      { min: 0, max: 10, label: '0-9' },
      { min: 10, max: 50, label: '10-49' },
      { min: 50, max: 100, label: '50-99' },
      { min: 100, max: 250, label: '100-249' },
      { min: 250, max: 499, label: '250-499' },
      { min: 499, max: Infinity, label: '499+' },
    ];
    
    const bucketCounts = buckets.map(bucket => ({
      range: bucket.label,
      count: positionSizes.filter(size => size >= bucket.min && size < bucket.max).length,
      percentage: 0
    }));
    
    // Calculate percentages
    const totalTradesForBuckets = trades.length;
    bucketCounts.forEach(bucket => {
      bucket.percentage = (bucket.count / totalTradesForBuckets) * 100;
    });
    
    console.log('✅ Position size buckets:', bucketCounts);

    setPositionSizeBuckets(bucketCounts);

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

    trades.forEach(trade => {
      // Categorize based on market title keywords with comprehensive patterns
      const title = trade.market.toLowerCase();
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
    const totalTradesForCategories = trades.length;
    const categoryData: CategoryDistribution[] = Object.entries(categoryMap)
      .map(([category, count]) => ({
        category,
        count,
        percentage: (count / totalTradesForCategories) * 100,
        color: categoryColors[category] || '#64748b'
      }))
      .sort((a, b) => b.count - a.count);

    setCategoryDistribution(categoryData);
  }, [trades, traderData]);

  // Toggle follow
  const handleFollowToggle = async () => {
    if (!user) {
      triggerLoggedOut('session_missing');
      router.push('/login');
      return;
    }

    setFollowLoading(true);

    try {
      const normalizedWallet = wallet.toLowerCase();
      
      if (following) {
        await supabase
          .from('follows')
          .delete()
          .eq('user_id', user.id)
          .eq('trader_wallet', normalizedWallet);

        setFollowing(false);
      } else {
        await supabase
          .from('follows')
          .insert({ user_id: user.id, trader_wallet: normalizedWallet });
        
        setFollowing(true);
      }
      
      // Refetch trader data to update follower count
      const response = await fetch(`/api/trader/${wallet}`);
      if (response.ok) {
        const data = await response.json();
        setTraderData(prev => prev ? { ...prev, followerCount: data.followerCount } : prev);
      }
    } catch (err: any) {
      console.error('Error toggling follow:', err);
    } finally {
      setFollowLoading(false);
    }
  };

  const handleMarkAsCopied = async (
    trade: Trade,
    entryPrice: number,
    amountInvested?: number
  ) => {
    if (!user) {
      triggerLoggedOut('session_missing');
      router.push('/login');
      return;
    }

    try {
      const marketId = trade.conditionId || trade.marketSlug || trade.market;
      const marketAvatarUrl =
        (trade.conditionId ? liveMarketData.get(trade.conditionId)?.marketAvatarUrl : undefined) ||
        trade.marketAvatarUrl ||
        null;

      const response = await fetch('/api/copied-trades', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          traderWallet: wallet,
          traderUsername: traderData?.displayName || wallet.slice(0, 8),
          marketId,
          marketTitle: trade.market,
          marketSlug: trade.marketSlug || trade.eventSlug || null,
          outcome: trade.outcome.toUpperCase(),
          priceWhenCopied: entryPrice,
          amountInvested: amountInvested || null,
          marketAvatarUrl,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('Error copying trade:', result);
        throw new Error(result.error || 'Failed to save copied trade');
      }

      const tradeKey = buildCopiedTradeKey(marketId, wallet);
      if (tradeKey) {
        setCopiedTradeIds((prev) => {
          const next = new Set(prev);
          next.add(tradeKey);
          return next;
        });
      }
    } catch (err: any) {
      console.error('Error saving copied trade:', err);
      alert(err.message || 'Failed to save copied trade');
    }
  };

  // Check if trade is copied
  const isTradeCopied = (trade: Trade): boolean => {
    const tradeKey = buildCopiedTradeKey(getMarketKeyForTrade(trade), wallet);
    return tradeKey ? copiedTradeIds.has(tradeKey) : false;
  };

  // Handle quick copy for premium users
  const handleQuickCopy = async (trade: Trade) => {
    // Check if wallet is connected
    if (!walletAddress) {
      setShowWalletConnectModal(true);
      return;
    }
    
    setIsSubmitting(true);
    
    // Simulate trade execution
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    // Mark as copied
    const tradeKey = buildCopiedTradeKey(getMarketKeyForTrade(trade), wallet);
    if (tradeKey) {
      setCopiedTradeIds(prev => {
        const next = new Set(prev);
        next.add(tradeKey);
        return next;
      });
    }
    
    setIsSubmitting(false);
    setExpandedTradeKeys(new Set());
    setUsdAmount('');
  };

  const handleManualCopyToggle = (index: number, url: string | null) => {
    const nextIndex = manualCopyTradeIndex === index ? null : index;
    setManualCopyTradeIndex(nextIndex);
    if (nextIndex === index && url && typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
    setManualUsdAmount('');
  };

  const handleManualCopyCta = (url: string | null) => {
    if (!url || typeof window === 'undefined') return;
    window.open(url, '_blank');
  };

  // Calculate contracts for premium quick copy
  const calculateContracts = (usdInput: string, price: number) => {
    const amount = Number.parseFloat(usdInput);
    if (isNaN(amount) || amount <= 0 || price <= 0) return 0;
    return Math.floor(amount / price);
  };

  // Get Polymarket URL
  const getPolymarketUrl = (trade: Trade): string => {
    if (trade.eventSlug) {
      return `https://polymarket.com/event/${trade.eventSlug}`;
    }
    if (trade.marketSlug) {
      return `https://polymarket.com/event/${trade.marketSlug}`;
    }
    return `https://polymarket.com/search?q=${encodeURIComponent(trade.market)}`;
  };

  // Format helpers
  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(1)}K`;
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

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

  const formatRelativeTime = (timestampMs: number | null | undefined) => {
    if (!timestampMs || !Number.isFinite(timestampMs)) return '—';
    const now = Date.now();
    const diffSeconds = Math.max(0, Math.round((now - timestampMs) / 1000));
    if (diffSeconds < 60) return 'Just now';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return new Date(timestampMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatAverageDaily = (amount: number) => {
    const abs = Math.abs(amount);
    const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
    return formatSignedCurrency(amount, 2);
  };

  const toDateObj = (dateStr: string) => new Date(`${dateStr}T00:00:00Z`);

  const formatPercentage = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return `${num > 0 ? '+' : ''}${num.toFixed(1)}%`;
  };

  const formatShare = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '—';
    if (!Number.isFinite(value)) return '—';
    return `${value.toFixed(1)}%`;
  };

  const pnlWindowLabel = useMemo(
    () => pnlWindowOptions.find((option) => option.key === pnlWindow)?.label ?? '30 Days',
    [pnlWindow]
  );

  const realizedWindowRows = useMemo(() => {
    if (realizedPnlRows.length === 0) return [];
    const option = pnlWindowOptions.find((entry) => entry.key === pnlWindow) ?? pnlWindowOptions[3];
    const lastIndex = realizedPnlRows.length - 1;
    let anchorDate = toDateObj(realizedPnlRows[lastIndex].date);
    const todayStr = new Date().toISOString().slice(0, 10);
    if (realizedPnlRows[lastIndex].date === todayStr && lastIndex > 0) {
      anchorDate = toDateObj(realizedPnlRows[lastIndex - 1].date);
    }

    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (option.key === 'ALL') {
      startDate = null;
      endDate = null;
    } else if (option.days !== null) {
      const start = new Date(Date.UTC(
        anchorDate.getUTCFullYear(),
        anchorDate.getUTCMonth(),
        anchorDate.getUTCDate()
      ));
      start.setUTCDate(start.getUTCDate() - (option.days - 1));
      startDate = start;
      endDate = anchorDate;
    }

    return realizedPnlRows
      .filter((row) => {
        const day = toDateObj(row.date);
        if (startDate && day < startDate) return false;
        if (endDate && day > endDate) return false;
        return true;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [realizedPnlRows, pnlWindow]);

  const realizedChartSeries = useMemo(() => {
    let running = 0;
    const base = realizedWindowRows.map((row) => {
      running += row.realized_pnl;
      return {
        date: row.date,
        dailyPnl: row.realized_pnl,
        cumulativePnl: running,
      };
    });
    return base;
  }, [realizedWindowRows]);

  const realizedSummary = useMemo(() => {
    const totalPnl = realizedWindowRows.reduce((acc, row) => acc + (row.realized_pnl || 0), 0);
    const avgDaily = realizedWindowRows.length > 0 ? totalPnl / realizedWindowRows.length : 0;
    const daysUp = realizedWindowRows.filter((row) => row.realized_pnl > 0).length;
    const daysDown = realizedWindowRows.filter((row) => row.realized_pnl < 0).length;
    const daysActive = realizedWindowRows.filter((row) => row.realized_pnl !== 0).length;
    return { totalPnl, avgDaily, daysUp, daysDown, daysActive };
  }, [realizedWindowRows]);

  const rankInfo = useMemo(() => {
    return rankingsByWindow[pnlWindow] ?? { rank: null, total: null, delta: null, previousRank: null };
  }, [rankingsByWindow, pnlWindow]);

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

  const getAvatarColor = (address: string) => {
    let hash = 0;
    for (let i = 0; i < address.length; i++) {
      hash = address.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 65%, 50%)`;
  };

  // Compute PnL/ROI/WinRate from full trade history (mark-to-market with live prices)
  useEffect(() => {
    if (trades.length === 0) {
      setComputedStats(null);
      return;
    }

    type Position = {
      size: number;
      avgCost: number;
      realized: number;
      buyNotional: number;
      sellCount: number;
      winSells: number;
      sampleTrade: Trade | null;
    };

    const positions = new Map<string, Position>();

    const priceForTrade = (trade: Trade) => {
      const live = trade.conditionId ? liveMarketData.get(trade.conditionId) : undefined;
      if (live && typeof live.price === 'number') return live.price;
      return trade.currentPrice ?? null;
    };

    const keyFor = (t: Trade) => `${t.conditionId || t.market}-${t.outcome}`;

    trades.forEach((trade) => {
      const key = keyFor(trade);
      const existing = positions.get(key) ?? {
        size: 0,
        avgCost: 0,
        realized: 0,
        buyNotional: 0,
        sellCount: 0,
        winSells: 0,
        sampleTrade: null,
      };

      if (trade.side === 'BUY') {
        const totalCost = existing.avgCost * existing.size + trade.price * trade.size;
        const newSize = existing.size + trade.size;
        existing.size = newSize;
        existing.avgCost = newSize > 0 ? totalCost / newSize : 0;
        existing.buyNotional += trade.size * trade.price;
      } else {
        const sellQty = trade.size;
        const realized = (trade.price - existing.avgCost) * sellQty;
        existing.realized += realized;
        existing.size -= sellQty;
        existing.sellCount += 1;
        if (realized > 0) existing.winSells += 1;
      }

      if (!existing.sampleTrade) existing.sampleTrade = trade;
      positions.set(key, existing);
    });

    let realizedPnl = 0;
    let volume = 0;
    let totalPositions = 0;
    let winningPositions = 0;
    
    positions.forEach((p, key) => {
      realizedPnl += p.realized;
      volume += p.buyNotional;
      
      const sample = p.sampleTrade || trades.find((t) => keyFor(t) === key);
      if (!sample) return;

      // Only count positions we can actually score
      let isWinner = false;
      let isScorable = false;

      // For closed positions (size = 0), check realized profit
      if (Math.abs(p.size) < 1e-9) {
        isScorable = true;
        isWinner = p.realized > 0;
      } else {
        // For open positions, use live price if available
        const currentPrice = priceForTrade(sample);
        if (currentPrice !== null && Number.isFinite(currentPrice)) {
          isScorable = true;
          const unrealizedPnl = (currentPrice - p.avgCost) * p.size;
          isWinner = unrealizedPnl > 0;
        }
      }

      if (isScorable) {
        totalPositions += 1;
        if (isWinner) winningPositions += 1;
      }
    });

    let unrealizedPnl = 0;
    positions.forEach((p, key) => {
      if (Math.abs(p.size) < 1e-9) return;
      const sample = p.sampleTrade || trades.find((t) => keyFor(t) === key);
      if (!sample) return;
      const currentPrice = priceForTrade(sample);
      if (currentPrice === null) return;
      unrealizedPnl += (currentPrice - p.avgCost) * p.size;
    });

    const totalPnl = realizedPnl + unrealizedPnl;
    const roi = volume > 0 ? (totalPnl / volume) * 100 : 0;
    // Win rate: percentage of scorable positions (closed or priced open) with positive ROI
    const winRate = totalPositions > 0 ? (winningPositions / totalPositions) * 100 : null;

    console.log('🧮 Computed stats from trades:', {
      tradesCount: trades.length,
      totalPnl: totalPnl.toFixed(2),
      volume: volume.toFixed(2),
      roi: roi.toFixed(1) + '%',
      winRate: winRate !== null ? winRate.toFixed(1) + '%' : 'N/A (no scorable positions)',
      totalPositions,
      winningPositions,
      note: 'Win rate = % of scorable positions (closed or priced open) with positive ROI'
    });

    setComputedStats({
      totalPnl,
      realizedPnl,
      unrealizedPnl,
      volume,
      roi,
      winRate,
    });
  }, [trades, liveMarketData]);

  const tradeStats = useMemo(() => {
    const windowDays = 30;
    const windowMs = windowDays * 24 * 60 * 60 * 1000;
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const activityTrades = trades.filter((trade) => trade.source !== 'copy');
    const validTrades = activityTrades.filter((trade) => Number.isFinite(trade.timestamp));
    const lastTradeTs = validTrades.length > 0
      ? Math.max(...validTrades.map((trade) => trade.timestamp))
      : null;

    const recentTrades = validTrades.filter((trade) => now - trade.timestamp <= windowMs);

    const activeDays = new Set(
      recentTrades.map((trade) => new Date(trade.timestamp).toISOString().slice(0, 10))
    ).size;

    const tradesLast24h = validTrades.filter((trade) => now - trade.timestamp <= dayMs).length;
    const isLimited = validTrades.length >= 100 && validTrades.every((trade) => trade.source === 'api');
    const oldestTradeTs = validTrades.length > 0
      ? Math.min(...validTrades.map((trade) => trade.timestamp))
      : null;
    const tradesLast24hCapped = Boolean(
      isLimited && oldestTradeTs !== null && now - oldestTradeTs <= dayMs
    );

    const buyNotionals = validTrades
      .filter((trade) => trade.side === 'BUY')
      .map((trade) => (trade.price || 0) * (trade.size || 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    const avgTradeSize =
      buyNotionals.length > 0
        ? buyNotionals.reduce((sum, value) => sum + value, 0) / buyNotionals.length
        : null;

    const positions = new Map<string, {
      size: number;
      buyNotional: number;
      sellNotional: number;
      firstTimestamp: number;
      lastTimestamp: number;
      sampleTrade: Trade;
    }>();

    const keyFor = (trade: Trade) => `${trade.conditionId || trade.market}-${trade.outcome}`;

    validTrades.forEach((trade) => {
      const key = keyFor(trade);
      const existing = positions.get(key) ?? {
        size: 0,
        buyNotional: 0,
        sellNotional: 0,
        firstTimestamp: trade.timestamp,
        lastTimestamp: trade.timestamp,
        sampleTrade: trade,
      };

      existing.firstTimestamp = Math.min(existing.firstTimestamp, trade.timestamp);
      existing.lastTimestamp = Math.max(existing.lastTimestamp, trade.timestamp);
      if (!existing.sampleTrade) existing.sampleTrade = trade;

      if (trade.side === 'BUY') {
        existing.size += trade.size;
        existing.buyNotional += trade.size * trade.price;
      } else {
        existing.size -= trade.size;
        existing.sellNotional += trade.size * trade.price;
      }

      positions.set(key, existing);
    });

    const priceForTrade = (trade: Trade) => {
      const live = trade.conditionId ? liveMarketData.get(trade.conditionId) : undefined;
      if (live && typeof live.price === 'number') return live.price;
      return trade.currentPrice ?? trade.price ?? null;
    };

    const positionMetrics = Array.from(positions.values())
      .map((position) => {
        if (position.buyNotional <= 0) return null;
        const currentPrice = priceForTrade(position.sampleTrade);
        const openValue =
          Math.abs(position.size) > 1e-9 && currentPrice !== null
            ? position.size * currentPrice
            : 0;
        if (Math.abs(position.size) > 1e-9 && currentPrice === null) return null;
        const pnl = position.sellNotional + openValue - position.buyNotional;
        const roi = (pnl / position.buyNotional) * 100;
        return { pnl, roi, buyNotional: position.buyNotional };
      })
      .filter(
        (value): value is { pnl: number; roi: number; buyNotional: number } =>
          value !== null && Number.isFinite(value.pnl) && Number.isFinite(value.roi)
      );

    const totalPnl = positionMetrics.reduce((sum, value) => sum + value.pnl, 0);
    const totalBuyNotional = positionMetrics.reduce((sum, value) => sum + value.buyNotional, 0);
    const avgReturnUsd = positionMetrics.length > 0
      ? totalPnl / positionMetrics.length
      : null;
    const avgRoi = positionMetrics.length > 0
      ? (totalBuyNotional > 0 ? (totalPnl / totalBuyNotional) * 100 : null)
      : null;

    const openPositions = Array.from(positions.values())
      .filter((position) => Math.abs(position.size) >= 1e-9).length;

    return {
      lastTradeTs,
      activeDays,
      tradesLast24h,
      tradesLast24hCapped,
      avgTradeSize,
      avgReturnUsd,
      avgRoi,
      openPositions,
    };
  }, [trades, liveMarketData]);

  const lastTradeLabel = formatRelativeTime(tradeStats.lastTradeTs);

  // Filter trades
  const filteredTrades = trades.filter(trade => {
    if (trade.status === 'Open') return true;
    if (!showResolvedTrades) return false;
    return trade.status === 'Trader Closed' || trade.status === 'Bonded';
  });
  const noTradesMessage =
    trades.length === 0
      ? "This trader hasn't made any trades yet"
      : showResolvedTrades
      ? 'No open or resolved trades to display'
      : 'No open trades to display';

  const isOwnProfile = Boolean(
    user &&
      walletAddress &&
      wallet &&
      normalizeKeyPart(walletAddress) === normalizeKeyPart(wallet)
  );
  const hasMyTradeStats = Boolean(myTradeStats && myTradeStats.trader.totalTrades > 0);
  const myDailyPnlSeries = useMemo(() => {
    const series = myTradeStats?.dailyPnl ?? [];
    if (series.length === 0) return [];
    const sorted = [...series].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    if (myPnlWindow === 'ALL') return sorted;
    const days = myPnlWindow === '1D' ? 1 : myPnlWindow === '7D' ? 7 : 30;
    return sorted.slice(Math.max(0, sorted.length - days));
  }, [myTradeStats, myPnlWindow]);
  const myDailyPnlTradesCount = useMemo(
    () => myDailyPnlSeries.reduce((sum, row) => sum + (row.trades ?? 0), 0),
    [myDailyPnlSeries]
  );

  // IMPORTANT: Loading/error guards must come AFTER hooks to avoid changing hook order between renders.
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navigation
          user={user ? { id: user.id, email: user.email || '' } : null}
          isPremium={isPremium}
          walletAddress={walletAddress}
        />
        <div className="flex items-center justify-center pt-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#FDB022] mx-auto mb-4"></div>
            <p className="text-slate-600 text-lg">Loading trader data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !traderData) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navigation
          user={user ? { id: user.id, email: user.email || '' } : null}
          isPremium={isPremium}
          walletAddress={walletAddress}
        />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div className="text-6xl mb-6">😞</div>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Trader Not Found</h2>
            <p className="text-slate-600 text-lg mb-6">
              {error || 'Unable to load trader data'}
            </p>
            <Button onClick={() => router.back()} variant="outline">
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const avatarColor = getAvatarColor(wallet);
  const initials = getTraderAvatarInitials({ displayName: traderData.displayName, wallet });
  // CRITICAL: Prioritize traderData (Polymarket leaderboard) over computedStats (calculated from limited trades)
  // Polymarket has the accurate all-time stats; computedStats is based on max 100 recent trades
  const effectivePnl = traderData.pnl ?? computedStats?.totalPnl ?? 0;
  const effectiveVolume = traderData.volume ?? computedStats?.volume ?? 0;
  const effectiveRoiValue = traderData.roi ?? computedStats?.roi ?? (effectiveVolume > 0 ? (effectivePnl / effectiveVolume) * 100 : 0);
  // Win rate: Calculated from scorable positions (closed or priced open) with positive ROI
  // Show N/A only if we have no scorable positions
  const effectiveWinRate = traderData.winRate ?? (computedStats && computedStats.winRate !== null && computedStats.winRate !== undefined ? computedStats.winRate : null);

  console.log('📊 Trader Profile Stats Priority:', {
    wallet: wallet.substring(0, 8),
    leaderboardPnl: traderData.pnl,
    computedPnl: computedStats?.totalPnl,
    effectivePnl,
    leaderboardRoi: traderData.roi,
    computedRoi: computedStats?.roi,
    effectiveRoiValue,
    source: traderData.pnl ? 'leaderboard' : computedStats ? 'computed' : 'none'
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Navigation 
        user={user ? { id: user.id, email: user.email || '' } : null} 
        isPremium={isPremium} 
        walletAddress={walletAddress} 
      />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <Avatar className="h-16 w-16 border-2 border-white shadow-md flex-shrink-0" style={{ backgroundColor: avatarColor }}>
              {traderData.profileImage && (
                <AvatarImage src={traderData.profileImage} alt={traderData.displayName} />
              )}
              <AvatarFallback className="text-white text-xl font-semibold bg-transparent">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-semibold text-slate-900 mb-1">{traderData.displayName}</h1>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-mono text-slate-500">
                  {wallet.slice(0, 6)}...{wallet.slice(-4)}
                </p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(wallet);
                    setWalletCopied(true);
                    setTimeout(() => setWalletCopied(false), 2000);
                  }}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                  title={walletCopied ? "Copied!" : "Copy wallet address"}
                >
                  {walletCopied ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <a
                  href={`https://polymarket.com/profile/${wallet}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-600"
                  aria-label="Open on Polymarket"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div className="w-full sm:w-auto sm:ml-auto">
              {following ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFollowToggle}
                  disabled={followLoading}
                  className="border-slate-300 text-slate-700 hover:bg-slate-50 gap-1.5 px-3 w-full sm:w-auto justify-center"
                >
                  <Check className="h-3.5 w-3.5" />
                  Following
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleFollowToggle}
                  disabled={followLoading}
                  className="bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-semibold shadow-sm px-4 w-full sm:w-auto justify-center"
                >
                  Follow
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => handleTabSelection('performance')}
            variant="ghost"
            className={cn(
              "px-5 py-2.5 rounded-full font-semibold text-sm transition-all whitespace-nowrap border shadow-sm",
              activeTab === 'performance'
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
            )}
          >
            Performance
          </Button>
          <Button
            onClick={() => handleTabSelection('positions')}
            variant="ghost"
            className={cn(
              "px-5 py-2.5 rounded-full font-semibold text-sm transition-all whitespace-nowrap border shadow-sm",
              activeTab === 'positions'
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
            )}
          >
            Trades
          </Button>
        </div>

        {activeTab === 'performance' && (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-12">
              <Card
                className={`border-slate-200/80 bg-white/90 p-5 ${
                  user && !isOwnProfile ? 'lg:col-span-8' : 'lg:col-span-12'
                }`}
              >
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
                            <p>Shows profit or loss only from positions that are closed or resolved. Polymarket&#39;s profile P&amp;L is account-level and factors in cash balance plus net deposits/withdrawals, so totals can differ.</p>
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
                            realizedSummary.totalPnl > 0
                              ? 'text-emerald-700'
                              : realizedSummary.totalPnl < 0
                                ? 'text-red-600'
                                : 'text-slate-900'
                          )}
                        >
                          {formatSignedCurrency(realizedSummary.totalPnl)}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">{pnlWindowLabel}</p>
                      </div>

                      <div className="rounded-2xl border border-slate-200/70 bg-white p-4 text-center shadow-sm">
                        <p className="text-sm font-semibold text-slate-600">Average per day</p>
                        <p
                          className={cn(
                            'mt-2 text-2xl font-semibold leading-tight sm:text-3xl',
                            realizedSummary.avgDaily > 0
                              ? 'text-emerald-700'
                              : realizedSummary.avgDaily < 0
                                ? 'text-red-600'
                                : 'text-slate-900'
                          )}
                        >
                          {formatAverageDaily(realizedSummary.avgDaily)}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-900/15 bg-slate-50/70 p-4 text-center shadow-md">
                        <p className="text-sm font-semibold text-slate-700">P&amp;L Rank</p>
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
                          <span>{rankInfo.rank ? `#${rankInfo.rank}` : '--'}</span>
                          {rankInfo.rank && rankInfo.delta !== null && rankInfo.delta !== undefined && rankInfo.delta !== 0 && (
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                                rankInfo.delta > 0
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-red-50 text-red-700'
                              )}
                            >
                              {rankInfo.delta > 0 ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              {rankInfo.delta > 0 ? 'Up' : 'Down'} {Math.abs(rankInfo.delta)} from #{rankInfo.rank + rankInfo.delta}
                            </span>
                          )}
                        </div>
                        {rankInfo.rank && rankInfo.delta === 0 && rankInfo.previousRank !== null && (
                          <p className="text-xs text-slate-500">No change vs prior rank</p>
                        )}
                        {rankInfo.rank && rankInfo.delta === null && rankInfo.previousRank === null && (
                          <p className="text-xs text-slate-500">No prior period rank</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-center shadow-sm">
                        <p className="text-sm font-semibold text-slate-600">Days Active</p>
                        <p className="mt-2 text-xl font-semibold leading-tight text-slate-900 sm:text-2xl">{realizedSummary.daysActive}</p>
                      </div>

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
                              <Area
                                type="monotone"
                                dataKey="cumulativePnl"
                                name="Cumulative PnL"
                                stroke="#0f172a"
                                fill="url(#pnlCumulative)"
                                strokeWidth={2.5}
                                dot={false}
                                isAnimationActive
                                animationDuration={1000}
                              />
                            </AreaChart>
                          )}
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No realized P&amp;L data available for this window.</p>
                    )}
                  </div>
                </div>
              </Card>

              {user && !isOwnProfile && (
                <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-slate-900">My Copy Trades</p>
                      <p className="text-xs text-slate-500">Your copy stats for this trader</p>
                    </div>
                  </div>
                  {myTradeStatsLoading ? (
                    <p className="mt-4 text-sm text-slate-500">Loading your trade stats...</p>
                  ) : hasMyTradeStats && myTradeStats ? (
                    <div className="mt-4 space-y-3 text-sm text-slate-600">
                      {/* Top Row: Open Positions | Total P&L */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-200/70 bg-white px-4 py-3 text-center shadow-sm flex flex-col items-center justify-center gap-1">
                          <p className="text-xs font-medium text-slate-500">Open Positions</p>
                          <p className="text-2xl font-semibold leading-tight text-slate-900 tabular-nums">{myTradeStats.trader.openTrades}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200/70 bg-white px-4 py-3 text-center shadow-sm flex flex-col items-center justify-center gap-1">
                          <p className="text-xs font-medium text-slate-500">Total P&amp;L</p>
                          <p
                            className={`text-2xl font-semibold leading-tight tabular-nums ${myTradeStats.trader.totalPnl > 0 ? 'text-emerald-600' : myTradeStats.trader.totalPnl < 0 ? 'text-red-500' : 'text-slate-900'}`}
                          >
                            {formatSignedCurrency(myTradeStats.trader.totalPnl)}
                          </p>
                        </div>
                      </div>

                      {/* Second Row: P&L - Realized | Unrealized (Open) */}
                      <div className="rounded-xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm">
                        <p className="text-xs font-semibold text-slate-600 mb-2">P&amp;L</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-center">
                            <p className="text-xs font-medium text-slate-500 mb-1">Realized</p>
                            <p
                              className={`text-2xl font-semibold leading-tight tabular-nums ${myTradeStats.trader.realizedPnl > 0 ? 'text-emerald-600' : myTradeStats.trader.realizedPnl < 0 ? 'text-red-500' : 'text-slate-900'}`}
                            >
                              {formatSignedCurrency(myTradeStats.trader.realizedPnl)}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs font-medium text-slate-500 mb-1">Unrealized (Open)</p>
                            <p
                              className={`text-2xl font-semibold leading-tight tabular-nums ${myTradeStats.trader.unrealizedPnl > 0 ? 'text-emerald-600' : myTradeStats.trader.unrealizedPnl < 0 ? 'text-red-500' : 'text-slate-900'}`}
                            >
                              {formatSignedCurrency(myTradeStats.trader.unrealizedPnl)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Third Row: Trades | Wins | Losses */}
                      <div className="rounded-xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm">
                        <div className="grid grid-cols-3 gap-4">
                          <div className="text-center">
                            <p className="text-xs font-medium text-slate-500 mb-1">Trades</p>
                            <p className="text-2xl font-semibold leading-tight text-slate-900 tabular-nums">{myTradeStats.trader.totalTrades}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs font-medium text-slate-500 mb-1">Wins</p>
                            <p className="text-2xl font-semibold leading-tight text-emerald-600 tabular-nums">{myTradeStats.trader.winningTrades}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs font-medium text-slate-500 mb-1">Losses</p>
                            <p className="text-2xl font-semibold leading-tight text-red-500 tabular-nums">{myTradeStats.trader.losingTrades}</p>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200/70 bg-white px-3 py-3 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-slate-600">Daily Realized P&amp;L</p>
                            <p className="text-[11px] text-slate-500">{myDailyPnlTradesCount.toLocaleString()} realized trades</p>
                          </div>
                          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 p-1 text-[11px] shadow-sm">
                            {(['1D', '7D', '30D', 'ALL'] as const).map((option) => (
                              <button
                                key={option}
                                onClick={() => setMyPnlWindow(option)}
                                className={cn(
                                  'rounded-full px-2.5 py-1 font-semibold transition',
                                  myPnlWindow === option
                                    ? 'bg-slate-900 text-white'
                                    : 'text-slate-500 hover:text-slate-900'
                                )}
                              >
                                {option === 'ALL' ? 'All' : option}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="mt-2 h-32">
                          {myDailyPnlSeries.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={myDailyPnlSeries} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis
                                  dataKey="date"
                                  tickLine={false}
                                  axisLine={false}
                                  interval="preserveStartEnd"
                                  minTickGap={24}
                                  tick={{ fontSize: 10, fill: '#64748b' }}
                                  tickFormatter={(value) =>
                                    new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      timeZone: 'UTC',
                                    })
                                  }
                                />
                                <YAxis
                                  tickLine={false}
                                  axisLine={false}
                                  width={54}
                                  tick={{ fontSize: 10, fill: '#64748b' }}
                                  tickFormatter={(value) => formatCompactCurrency(value)}
                                  domain={[
                                    (min: number) => Math.min(min, 0),
                                    (max: number) => Math.max(max, 0),
                                  ]}
                                />
                                <RechartsTooltip
                                  contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0' }}
                                  formatter={(value: any) => formatSignedCurrency(Number(value), 2)}
                                  labelFormatter={(label) =>
                                    new Date(`${label}T00:00:00Z`).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                      timeZone: 'UTC',
                                    })
                                  }
                                />
                                <ReferenceLine y={0} stroke="#e2e8f0" />
                                <Bar dataKey="pnl" name="Realized P&amp;L" radius={[6, 6, 6, 6]}>
                                  {myDailyPnlSeries.map((entry, index) => (
                                    <Cell
                                      key={`${entry.date}-${index}`}
                                      fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'}
                                    />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-slate-500">
                              No realized P&amp;L yet.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-slate-200/70 p-4 text-sm text-slate-500">
                      You have not copied {traderData.displayName} yet.
                    </div>
                  )}
                </Card>
              )}
            </div>

            <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900 text-left">Key Stats</h3>
              <div className="mt-2 grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-5 text-center">
                  <p className="text-sm font-semibold text-slate-700">Performance (All Time)</p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                      <p className="text-xs text-slate-500">ROI</p>
                      <p className={cn(
                        'text-lg font-semibold',
                        effectiveRoiValue > 0 ? 'text-emerald-600' : effectiveRoiValue < 0 ? 'text-red-500' : 'text-slate-900'
                      )}>
                        {effectiveVolume > 0 ? formatPercentage(effectiveRoiValue) : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                      <p className="text-xs text-slate-500">Winnings</p>
                      <p className={cn(
                        'text-lg font-semibold',
                        effectivePnl > 0 ? 'text-emerald-600' : effectivePnl < 0 ? 'text-red-500' : 'text-slate-900'
                      )}>
                        {formatCompactCurrency(effectivePnl)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                      <p className="text-xs text-slate-500">Volume</p>
                      <p className="text-lg font-semibold text-slate-900">{formatCurrency(effectiveVolume)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                      <p className="text-xs text-slate-500">Win Rate</p>
                      <p className="text-lg font-semibold text-slate-900">
                        {effectiveWinRate !== null && Number.isFinite(effectiveWinRate) ? `${effectiveWinRate.toFixed(1)}%` : '—'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-5 text-center">
                  <p className="text-sm font-semibold text-slate-700">Recent Trades</p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                      <p className="text-xs text-slate-500">Av Return</p>
                      <p className={cn(
                        'text-lg font-semibold',
                        tradeStats.avgReturnUsd !== null && tradeStats.avgReturnUsd > 0
                          ? 'text-emerald-600'
                          : tradeStats.avgReturnUsd !== null && tradeStats.avgReturnUsd < 0
                            ? 'text-red-600'
                            : 'text-slate-900'
                      )}>
                        {tradeStats.avgReturnUsd !== null
                          ? formatSignedCurrency(tradeStats.avgReturnUsd, 2)
                          : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                      <p className="text-xs text-slate-500">Average ROI</p>
                      <p className={cn(
                        'text-lg font-semibold',
                        tradeStats.avgRoi !== null && tradeStats.avgRoi > 0
                          ? 'text-emerald-600'
                          : tradeStats.avgRoi !== null && tradeStats.avgRoi < 0
                            ? 'text-red-600'
                            : 'text-slate-900'
                      )}>
                        {tradeStats.avgRoi !== null
                          ? `${tradeStats.avgRoi > 0 ? '+' : ''}${tradeStats.avgRoi.toFixed(1)}%`
                          : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                      <p className="text-xs text-slate-500">Open Positions</p>
                      <p className="text-lg font-semibold text-slate-900">{tradeStats.openPositions}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                      <p className="text-xs text-slate-500">Average Trade Size</p>
                      <p className="text-lg font-semibold text-slate-900">
                        {tradeStats.avgTradeSize !== null ? formatCurrency(tradeStats.avgTradeSize) : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                      <p className="text-xs text-slate-500">Last Trade</p>
                      <p className="text-lg font-semibold text-slate-900">{lastTradeLabel}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                      <p className="text-xs text-slate-500">Trades Last 24 Hours</p>
                      <p className="text-lg font-semibold text-slate-900">
                        {tradeStats.tradesLast24hCapped ? `${tradeStats.tradesLast24h}+` : tradeStats.tradesLast24h}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Content */}
        {activeTab === 'positions' && (
          <div className="space-y-4">
            {/* Trades */}
            {loadingTrades ? (
              <div className="w-full md:w-[63%] md:mx-auto">
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-[#FDB022] mx-auto mb-4"></div>
                  <p className="text-slate-500">Loading trades...</p>
                </div>
              </div>
            ) : filteredTrades.length === 0 ? (
              <Card className="p-12 text-center">
                <div className="text-6xl mb-4">📊</div>
                <p className="text-slate-600 text-lg font-medium mb-2">No trades found</p>
                <p className="text-slate-500 text-sm">{noTradesMessage}</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredTrades.slice(0, tradesToShow).map((trade, index) => {
                  const isAlreadyCopied = isTradeCopied(trade);
                  const tradeKey = buildExpandedTradeKey(trade, index);
                  const isExpanded = expandedTradeKeys.has(tradeKey);
                  
                  // Get live market data
                  const liveData = trade.conditionId ? liveMarketData.get(trade.conditionId) : undefined;
                  const polymarketUrl = getPolymarketUrl({
                    ...trade,
                    eventSlug: liveData?.eventSlug || trade.eventSlug,
                  });
                  const currentPrice = liveData?.price || trade.currentPrice || trade.price;
                  const liveScore = liveData?.score;
                  const isClosed = liveData?.closed || false;
                  const isResolved = liveData?.resolved || false;
                  const marketIsOpen = isResolved ? false : (liveData?.closed === undefined ? undefined : !liveData.closed);
                  const manualAmountValue = Number.parseFloat(manualUsdAmount);
                  const manualAmountValid = !Number.isNaN(manualAmountValue) && manualAmountValue > 0;
                  const manualDisplayPrice = currentPrice ?? trade.price ?? 0;
                  const manualPriceChange =
                    trade.price && trade.price > 0
                      ? ((manualDisplayPrice - trade.price) / trade.price) * 100
                      : null;
                  const manualPriceChangeColor =
                    manualPriceChange === null
                      ? 'text-slate-400'
                      : manualPriceChange >= 0
                        ? 'text-emerald-600'
                        : 'text-red-600';
                  const manualPriceChangeLabel =
                    manualPriceChange === null
                      ? '--'
                      : `${manualPriceChange >= 0 ? '+' : ''}${manualPriceChange.toFixed(2)}% from entry`;
                  const manualContractsEstimate =
                    manualAmountValid && manualDisplayPrice > 0
                      ? calculateContracts(manualUsdAmount, manualDisplayPrice)
                      : 0;
                  
                  // Calculate ROI
                  let roi: number | null = null;
                  const entryPrice = trade.price;
                  
                  if ((entryPrice && entryPrice !== 0) && (currentPrice !== undefined && currentPrice !== null)) {
                    roi = ((currentPrice - entryPrice) / entryPrice) * 100;
                  }
                  
                  // Determine trade status based on live data
                  let tradeStatus: 'Open' | 'Trader Closed' | 'Bonded' = 'Open';
                  if (isResolved) {
                    tradeStatus = 'Bonded';
                  } else if (isClosed) {
                    tradeStatus = 'Trader Closed';
                  }
                  
                  // Format timestamp
                  const tradeDate = new Date(trade.timestamp);
                  const now = new Date();
                  const diffMs = now.getTime() - tradeDate.getTime();
                  const diffMins = Math.floor(diffMs / 60000);
                  const diffHours = Math.floor(diffMs / 3600000);
                  const diffDays = Math.floor(diffMs / 86400000);
                  
                  let formattedTimestamp = '';
                  if (diffMins < 60) {
                    formattedTimestamp = `${diffMins}m ago`;
                  } else if (diffHours < 24) {
                    formattedTimestamp = `${diffHours}h ago`;
                  } else if (diffDays < 7) {
                    formattedTimestamp = `${diffDays}d ago`;
                  } else {
                    formattedTimestamp = tradeDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  }
                  
                  // Extract market avatar URL
                  const marketAvatar =
                    liveData?.marketAvatarUrl ||
                    trade.marketAvatarUrl ||
                    extractMarketAvatarUrl({
                      market: trade.market,
                      slug: trade.marketSlug,
                      eventSlug: trade.eventSlug,
                    });

                  return (
                    <div className="w-full md:w-[63%] md:mx-auto" key={`${trade.timestamp}-${index}`}>
                      {isPremium ? (
                        <TradeCard
                          tradeAnchorId={`trade-card-${wallet}-${trade.timestamp}-${index}`}
                          onExecutionNotification={handleTradeExecutionNotification}
                          trader={{
                            name: traderData.displayName,
                            avatar: undefined,
                            address: wallet,
                            id: wallet,
                            roi: effectiveRoiValue,
                          }}
                          market={trade.market}
                          marketAvatar={marketAvatar || undefined}
                          position={trade.outcome}
                          action={trade.side === 'BUY' ? 'Buy' : 'Sell'}
                          price={trade.price}
                          size={trade.size}
                          total={trade.price * trade.size}
                          timestamp={formattedTimestamp}
                          onCopyTrade={() => {
                            if (polymarketUrl) {
                              window.open(polymarketUrl, '_blank');
                            }
                          }}
                          onMarkAsCopied={(entryPrice, amountInvested) =>
                            handleMarkAsCopied(trade, entryPrice, amountInvested)
                          }
                          onAdvancedCopy={() => {
                            if (polymarketUrl) {
                              window.open(polymarketUrl, '_blank');
                            }
                          }}
                          isPremium={isPremium}
                          isAdmin={isAdmin}
                          isExpanded={isExpanded}
                          onToggleExpand={() => toggleTradeExpanded(tradeKey)}
                          isCopied={isAlreadyCopied}
                          conditionId={trade.conditionId}
                          tokenId={trade.tokenId}
                          marketSlug={trade.marketSlug}
                          currentMarketPrice={currentPrice}
                          marketIsOpen={marketIsOpen}
                          liveScore={liveScore}
                          eventStartTime={liveData?.gameStartTime}
                          eventEndTime={liveData?.endDateIso}
                          eventStatus={liveData?.eventStatus}
                          liveStatus={liveData?.liveStatus}
                          category={trade.category}
                          polymarketUrl={polymarketUrl}
                          espnUrl={liveData?.espnUrl}
                          defaultBuySlippage={defaultBuySlippage}
                          defaultSellSlippage={defaultSellSlippage}
                          walletAddress={walletAddress}
                          manualTradingEnabled={manualModeEnabled}
                          onSwitchToManualTrading={enableManualMode}
                          onOpenConnectWallet={() => setShowConnectWalletModal(true)}
                        />
                      ) : (
                        <Card className="p-6">
                          <div className="flex items-start justify-between gap-4 mb-4">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-slate-900 mb-2 leading-snug">{trade.market}</h3>
                              <div className="flex items-center gap-2 text-sm text-slate-500">
                                <span>{trade.formattedDate}</span>
                                <span>•</span>
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    'font-semibold text-xs',
                                    trade.outcome.toLowerCase() === 'yes'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-red-50 text-red-700 border-red-200'
                                  )}
                                >
                                  {trade.outcome}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {tradeStatus !== 'Open' && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] font-semibold bg-rose-50 text-rose-700 border-rose-200"
                                >
                                  {tradeStatus === 'Bonded' ? 'Resolved' : tradeStatus}
                                </Badge>
                              )}
                              {!isAlreadyCopied && (
                                <button
                                  onClick={() => toggleTradeExpanded(tradeKey)}
                                  className="text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                  {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                                </button>
                              )}
                            </div>
                          </div>

                      {/* Stats Box */}
                      <div className="bg-slate-50 rounded-lg p-4 mb-4">
                        <div className="grid grid-cols-4 gap-4 text-center">
                          <div>
                            <div className="text-xs text-slate-500 mb-1">Entry</div>
                            <div className="text-sm font-semibold text-slate-900">${trade.price.toFixed(2)}</div>
                          </div>
                          <div className="border-l border-slate-200">
                            <div className="text-xs text-slate-500 mb-1">Size</div>
                            <div className="text-sm font-semibold text-slate-900">${trade.size.toFixed(0)}</div>
                          </div>
                          <div className="border-l border-slate-200">
                            <div className="text-xs text-slate-500 mb-1">Total</div>
                            <div className="text-sm font-semibold text-slate-900">
                              ${(trade.price * trade.size).toFixed(0)}
                            </div>
                          </div>
                          <div className="border-l border-slate-200">
                            <div className="text-xs text-slate-500 mb-1">ROI</div>
                            <div className={cn(
                              'text-sm font-semibold',
                              roi === null ? 'text-slate-400' :
                              roi > 0 ? 'text-emerald-600' :
                              roi < 0 ? 'text-red-600' : 'text-slate-500'
                            )}>
                              {roi === null ? '--' : `${roi > 0 ? '+' : ''}${roi.toFixed(1)}%`}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons - Different for Premium vs Free */}
                      {isPremium ? (
                        <>
                          <Button
                            onClick={() => {
                              if (isAlreadyCopied) return;
                              if (trade.status === 'Trader Closed' || trade.status === 'Bonded') return;
                              toggleTradeExpanded(tradeKey);
                            }}
                            disabled={isAlreadyCopied || trade.status === 'Trader Closed' || trade.status === 'Bonded'}
                            className={cn(
                              'w-full font-semibold shadow-sm text-sm',
                              isAlreadyCopied
                                ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                                : 'bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 hover:from-orange-500 hover:via-amber-500 hover:to-yellow-500 text-slate-900'
                            )}
                            size="lg"
                          >
                            {isAlreadyCopied ? (
                              <>
                                <Check className="w-4 h-4 mr-2" />
                                Trade Copied
                              </>
                            ) : trade.status === 'Trader Closed' || trade.status === 'Bonded' ? (
                              'Market Closed'
                            ) : (
                              'Copy Trade'
                            )}
                          </Button>

                          {/* Premium: Expanded Quick Copy Interface */}
                          {isExpanded && !isAlreadyCopied && (
                            <div className="mt-4 p-4 bg-slate-50 rounded-lg space-y-4">
                              <h4 className="text-sm font-semibold text-slate-900">Quick Copy</h4>

                              {/* Current Price */}
                              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium text-slate-600">Current Price</span>
                                  <div className="text-right">
                                    <p className="text-base font-semibold text-slate-900">${(currentPrice || trade.price).toFixed(2)}</p>
                                    <p className={`text-xs font-medium ${(currentPrice || 0) >= trade.price ? 'text-emerald-600' : 'text-red-600'}`}>
                                      {(currentPrice || 0) >= trade.price ? '+' : ''}
                                      {(((currentPrice || trade.price) - trade.price) / trade.price * 100).toFixed(2)}% from entry
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Amount Input */}
                              <div className="space-y-2">
                                <label htmlFor={`amount-${index}`} className="text-xs font-medium text-slate-700">
                                  Amount (USD)
                                </label>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                                  <input
                                    id={`amount-${index}`}
                                    type="number"
                                    value={usdAmount}
                                    onChange={(e) => setUsdAmount(e.target.value)}
                                    placeholder="0.00"
                                    disabled={isSubmitting}
                                    className="w-full pl-7 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition-all disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                </div>
                                {usdAmount && Number.parseFloat(usdAmount) > 0 && (
                                  <p className="text-xs text-slate-500">≈ {calculateContracts(usdAmount, currentPrice || trade.price).toLocaleString()} contracts</p>
                                )}
                              </div>

                              {/* Execute Button */}
                              <Button
                                onClick={() => handleQuickCopy(trade)}
                                disabled={!usdAmount || Number.parseFloat(usdAmount) <= 0 || isSubmitting}
                                className="w-full bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 hover:from-orange-500 hover:via-amber-500 hover:to-yellow-500 text-slate-900 font-semibold disabled:opacity-50"
                                size="lg"
                              >
                                {isSubmitting ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Executing Trade...
                                  </>
                                ) : (
                                  'Execute Trade'
                                )}
                              </Button>
                              {/* Auto-close Checkbox */}
                              {isAdmin && (
                                <div className="flex items-start space-x-2.5 p-2.5 bg-white rounded-lg border border-slate-200">
                                  <Checkbox
                                    id={`auto-close-${index}`}
                                    checked={autoClose}
                                    onCheckedChange={(checked) => setAutoClose(!!checked)}
                                    disabled={isSubmitting}
                                    className="mt-0.5"
                                  />
                                  <div className="flex-1">
                                    <label
                                      htmlFor={`auto-close-${index}`}
                                      className="text-xs font-medium text-slate-900 cursor-pointer leading-tight"
                                    >
                                      Auto-close when trader closes
                                    </label>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                      Automatically close your position when {traderData?.displayName || 'trader'} closes theirs
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="space-y-3">
                          {trade.status === 'Trader Closed' || trade.status === 'Bonded' ? (
                            <Button
                              disabled
                              className="w-full bg-slate-300 text-slate-600 font-semibold cursor-not-allowed"
                            >
                              Market Closed
                            </Button>
                          ) : (
                            <>
                              <Button
                                type="button"
                                onClick={() => handleManualCopyToggle(index, polymarketUrl)}
                                className="w-full flex items-center justify-center gap-2 bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-semibold shadow-sm text-sm"
                              >
                                Manual Copy
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                              {manualCopyTradeIndex === index && (
                                <div className="space-y-4 mt-1 p-4 bg-slate-50 rounded-lg border border-slate-200">
                                  <h4 className="text-sm font-semibold text-slate-900">
                                    Manual Copy
                                  </h4>
                                  <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-medium text-slate-600">Current Price</span>
                                      <div className="text-right">
                                        <p className="text-base font-semibold text-slate-900">
                                          ${manualDisplayPrice.toFixed(2)}
                                        </p>
                                        <p className={`text-xs font-medium ${manualPriceChangeColor}`}>
                                          {manualPriceChangeLabel}
                                        </p>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                    <label htmlFor={`manual-amount-${index}`} className="text-xs font-medium text-slate-700">
                                      Amount (USD)
                                    </label>
                                    <div className="relative">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                                      <input
                                        id={`manual-amount-${index}`}
                                        type="number"
                                        inputMode="decimal"
                                        step="0.01"
                                        value={manualUsdAmount}
                                        onChange={(e) => setManualUsdAmount(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full pl-7 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      />
                                    </div>
                                    {manualAmountValid && (
                                      <p className="text-xs text-slate-500">
                                        ≈ {manualContractsEstimate.toLocaleString()} contracts
                                      </p>
                                    )}
                                  </div>

                                  <Button
                                    onClick={() => handleManualCopyCta(polymarketUrl)}
                                    disabled={!manualAmountValid}
                                    className="w-full bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 hover:from-orange-500 hover:via-amber-500 hover:to-yellow-500 text-slate-900 font-semibold disabled:opacity-50"
                                    size="lg"
                                  >
                                    Manual Copy
                                  </Button>
                                  <Button
                                    onClick={() => handleMarkAsCopied(trade, trade.price)}
                                    disabled={isAlreadyCopied}
                                    variant="outline"
                                    className={cn(
                                      'w-full font-medium text-sm',
                                      isAlreadyCopied
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                                    )}
                                  >
                                    {isAlreadyCopied ? (
                                      <>
                                        <Check className="h-4 w-4 mr-2" />
                                        Copied
                                      </>
                                    ) : (
                                      'Mark as Copied'
                                    )}
                                  </Button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                        </Card>
                      )}
                    </div>
                  );
                })}
                
                {/* Load More Button */}
                {filteredTrades.length > tradesToShow && (
                  <div className="flex justify-center pt-4">
                    <Button
                      onClick={() => setTradesToShow(prev => prev + 15)}
                      variant="outline"
                      className="border-slate-300 text-slate-700 hover:bg-slate-50"
                    >
                      Load More Trades ({filteredTrades.length - tradesToShow} remaining)
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'performance' && (
          <div className="space-y-6">
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
                        <p>Shows how this trader sizes their positions. Larger positions indicate higher conviction or risk tolerance. Most traders should have a consistent sizing strategy.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full font-medium">Recent Trades</span>
              </div>
              {positionSizeBuckets.length > 0 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={positionSizeBuckets} barSize={36} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="range"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                        tick={{ fontSize: 11, fill: '#475569' }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={52}
                        tickMargin={10}
                        tick={{ fontSize: 11, fill: '#475569' }}
                        allowDecimals={false}
                        tickCount={5}
                      />
                      <RechartsTooltip
                        contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0' }}
                        formatter={(value: any, _name, props: any) => [
                          `${value} ${value === 1 ? 'trade' : 'trades'}`,
                          props?.payload?.range || 'Range',
                        ]}
                      />
                      <Bar dataKey="count" name="Trades" fill="#10b981" radius={[6, 6, 6, 6]} isAnimationActive />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-500">
                  <p>Not enough trade data to display position sizing</p>
                </div>
              )}
            </Card>

            {/* Category Distribution Pie Chart */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-slate-900">Trading Categories</h3>
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full font-medium">Recent Trades</span>
              </div>
              {categoryDistribution.length > 0 ? (
                <div className="flex flex-col md:flex-row gap-8 items-center justify-center max-w-3xl mx-auto">
                  <div className="relative w-64 h-64 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryDistribution}
                          dataKey="count"
                          nameKey="category"
                          innerRadius={60}
                          outerRadius={100}
                          stroke="white"
                          strokeWidth={2}
                          onMouseEnter={(entry) => setHoveredCategory(entry?.category || null)}
                          onMouseLeave={() => setHoveredCategory(null)}
                          isAnimationActive
                        >
                          {categoryDistribution.map((cat) => (
                            <Cell
                              key={cat.category}
                              fill={cat.color}
                              opacity={hoveredCategory && hoveredCategory !== cat.category ? 0.35 : 1}
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0' }}
                          formatter={(value: any, _name, props: any) => [
                            `${value} ${value === 1 ? 'trade' : 'trades'}`,
                            props?.payload?.category || 'Category',
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Legend */}
                  <div className="flex-1 space-y-2">
                    {categoryDistribution.map((cat) => (
                      <div
                        key={cat.category}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                        onMouseEnter={() => setHoveredCategory(cat.category)}
                        onMouseLeave={() => setHoveredCategory(null)}
                        style={{ opacity: hoveredCategory && hoveredCategory !== cat.category ? 0.5 : 1 }}
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

            {/* Top Performing Trades */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-slate-900">Top Performing Trades</h3>
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full font-medium">Recent Trades</span>
              </div>
              <div className="space-y-3">
                {(() => {
                  const positionMap = new Map<string, {
                    market: string;
                    outcome: string;
                    buyNotional: number;
                    sellNotional: number;
                    totalBought: number;
                    size: number;
                    avgCost: number;
                    firstTimestamp: number;
                    lastTimestamp: number;
                    sampleTrade: Trade;
                    marketAvatar?: string;
                    currentPrice?: number | null;
                  }>();

                  const priceFor = (trade: Trade) => {
                    const live = trade.conditionId ? liveMarketData.get(trade.conditionId) : undefined;
                    if (live && typeof live.price === 'number') return live.price;
                    const fallback = trade.currentPrice ?? trade.price;
                    return Number.isFinite(fallback) ? fallback : null;
                  };

                  for (const trade of trades) {
                    if (!trade.price || !trade.size) continue;
                    const key = `${trade.conditionId || trade.market}-${trade.outcome || 'outcome'}`;
                    const existing = positionMap.get(key) ?? {
                      market: trade.market,
                      outcome: trade.outcome,
                      buyNotional: 0,
                      sellNotional: 0,
                      totalBought: 0,
                      size: 0,
                      avgCost: 0,
                      firstTimestamp: trade.timestamp,
                      lastTimestamp: trade.timestamp,
                      sampleTrade: trade,
                      marketAvatar:
                        (trade.conditionId
                          ? liveMarketData.get(trade.conditionId)?.marketAvatarUrl
                          : undefined) ||
                        trade.marketAvatarUrl ||
                        extractMarketAvatarUrl({
                          market: trade.market,
                          slug: trade.marketSlug,
                          eventSlug: trade.eventSlug,
                        }) ||
                        undefined,
                      currentPrice: undefined,
                    };

                    existing.firstTimestamp = Math.min(existing.firstTimestamp, trade.timestamp);
                    existing.lastTimestamp = Math.max(existing.lastTimestamp, trade.timestamp);

                    if (trade.side === 'BUY') {
                      existing.totalBought += trade.size;
                      existing.buyNotional += trade.size * trade.price;
                      existing.size += trade.size;
                      existing.avgCost = existing.totalBought > 0 ? existing.buyNotional / existing.totalBought : 0;
                    } else {
                      const sellQty = trade.size;
                      existing.sellNotional += sellQty * trade.price;
                      existing.size -= sellQty;
                    }

                    if (existing.currentPrice === undefined) {
                      existing.currentPrice = priceFor(trade) ?? undefined;
                    }

                    positionMap.set(key, existing);
                  }

                  const allPositions = Array.from(positionMap.values()).map((position) => {
                    const currentPrice = position.currentPrice ?? priceFor(position.sampleTrade);
                    const openValue =
                      currentPrice !== null && Number.isFinite(currentPrice)
                        ? position.size * currentPrice
                        : 0;
                    const isClosed = Math.abs(position.size) < 1e-9;
                    const amountWon = isClosed ? position.sellNotional : position.sellNotional + openValue;
                    const invested = position.buyNotional;
                    const pnl = amountWon - invested;
                    const roi = invested > 0 ? (pnl / invested) * 100 : 0;

                    return {
                      ...position,
                      currentPrice,
                      invested,
                      amountWon,
                      pnl,
                      roi,
                      isClosed,
                    };
                  });

                  const closedWinners = allPositions
                    .filter((position) => position.isClosed && position.invested > 0 && position.pnl > 0)
                    .sort((a, b) => b.pnl - a.pnl)
                    .slice(0, 5);

                  const fallbackPositions = allPositions
                    .filter((position) => position.invested > 0 && position.currentPrice !== null)
                    .sort((a, b) => b.pnl - a.pnl)
                    .slice(0, 5);

                  const topPositions = closedWinners.length > 0 ? closedWinners : fallbackPositions;
                  const showingOpenPositions = closedWinners.length === 0 && topPositions.length > 0;

                  if (topPositions.length === 0) {
                    return (
                      <div className="text-center py-8">
                        <p className="text-slate-500 mb-2">No trade data available yet</p>
                        <p className="text-sm text-slate-400">
                          Top performing trades will appear here once data is loaded
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {showingOpenPositions && (
                        <p className="px-4 text-xs text-slate-500">
                          Showing open positions (mark-to-market).
                        </p>
                      )}
                      <div className="hidden md:grid grid-cols-4 gap-6 rounded-lg bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                        <span>Market</span>
                        <span>Outcome</span>
                        <span>Amount Invested</span>
                        <span>Amount Won</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {topPositions.map((trade, index) => (
                          <div key={index} className="grid grid-cols-1 gap-5 px-4 py-5 md:grid-cols-4 md:items-center">
                            <div className="flex items-start gap-3">
                              {trade.marketAvatar ? (
                                <img
                                  src={trade.marketAvatar}
                                  alt=""
                                  className="h-10 w-10 rounded-full border border-slate-200 object-cover"
                                />
                              ) : (
                                <div className="h-10 w-10 rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-500 flex items-center justify-center">
                                  {trade.market.slice(0, 1).toUpperCase()}
                                </div>
                              )}
                              <div className="space-y-1">
                                <p className="text-base font-semibold text-slate-900">{trade.market}</p>
                                <p className="text-sm text-slate-500">
                                  {(() => {
                                    const date = new Date(trade.lastTimestamp);
                                    return date.toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric'
                                    });
                                  })()}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-slate-500 md:hidden">Outcome</span>
                              <Badge
                                className={cn(
                                  'w-fit text-sm font-semibold',
                                  trade.outcome?.toLowerCase() === 'yes'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-red-50 text-red-700 border-red-200'
                                )}
                              >
                                {trade.outcome || 'N/A'}
                              </Badge>
                            </div>
                            <div className="space-y-1 text-base text-slate-700">
                              <span className="text-xs text-slate-500 md:hidden">Amount Invested</span>
                              <p className="font-semibold text-slate-900">
                                {formatSignedCurrency(trade.invested, 2)}
                              </p>
                              <p className="text-sm text-slate-500">{trade.totalBought.toFixed(1)} contracts</p>
                            </div>
                            <div className="space-y-1 text-base text-slate-700">
                              <span className="text-xs text-slate-500 md:hidden">Amount Won</span>
                              <p className="font-semibold text-slate-900">
                                {formatSignedCurrency(trade.amountWon, 2)}
                              </p>
                              <p
                                className={cn(
                                  'text-sm font-semibold',
                                  trade.pnl >= 0 ? 'text-emerald-600' : 'text-red-600'
                                )}
                              >
                                {formatSignedCurrency(trade.pnl, 2)} ({trade.roi >= 0 ? '+' : ''}{trade.roi.toFixed(1)}%)
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Wallet Connect Required Modal */}
      {showWalletConnectModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShowWalletConnectModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="flex-shrink-0 w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  Wallet Connection Required
                </h3>
                <p className="text-sm text-slate-600 mb-4">
                  To use auto-copy trading, you need to connect your Polymarket wallet first. This allows us to execute trades on your behalf.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowWalletConnectModal(false);
                      router.push('/profile');
                    }}
                    className="flex-1 px-4 py-2.5 bg-[#FDB022] hover:bg-[#E69E1A] text-slate-900 font-semibold rounded-lg transition-colors"
                  >
                    Connect Wallet
                  </button>
                  <button
                    onClick={() => setShowWalletConnectModal(false)}
                    className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <TradeExecutionNotifications
        notifications={tradeNotifications}
        onNavigate={handleNavigateToTrade}
      />
      <ConnectWalletModal
        open={showConnectWalletModal}
        onOpenChange={setShowConnectWalletModal}
        onConnect={handleWalletConnect}
      />
    </div>
  );
}
