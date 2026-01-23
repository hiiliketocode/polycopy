/**
 * TEST VERSION - Trader Profile Page
 * 
 * This is a test/development version of the trader profile page.
 * Access at: /test/trader/[wallet]
 * 
 * Production version remains at: /trader/[wallet]
 * 
 * Use this page to develop new features without affecting production.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Check, ArrowUpRight, ChevronDown, ChevronUp, Loader2, Info, ExternalLink, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { triggerLoggedOut } from '@/lib/auth/logout-events';
import { Navigation } from '@/components/polycopy/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TradeCard } from '@/components/polycopy/trade-card';
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

interface RealizedPnlSummary {
  label: string;
  days: number | null;
  pnl: number;
  returnPct: number | null;
  cumulative: number | null;
  windowStart: string | null;
  windowEnd: string | null;
}

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
  const [activeTab, setActiveTab] = useState<'positions' | 'performance'>('positions');
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
  const [hoveredBucket, setHoveredBucket] = useState<{ range: string; count: number; percentage: number; x: number; y: number } | null>(null);
  const [computedStats, setComputedStats] = useState<TraderComputedStats | null>(null);
  const [realizedPnlRows, setRealizedPnlRows] = useState<RealizedPnlRow[]>([]);
  const [realizedPnlSummaries, setRealizedPnlSummaries] = useState<RealizedPnlSummary[]>([]);
  const [loadingRealizedPnl, setLoadingRealizedPnl] = useState(false);
  const [realizedPnlError, setRealizedPnlError] = useState<string | null>(null);
  const [selectedPnlLabel, setSelectedPnlLabel] = useState<string>('90D');
  const [rangeMode, setRangeMode] = useState<'preset' | 'custom'>('preset');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [realizedVolume, setRealizedVolume] = useState<number | null>(null);
  const [chartMode, setChartMode] = useState<'return' | 'pnl'>('return');
  
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

  // Fetch realized PnL (Dome, realized-only)
  useEffect(() => {
    if (!wallet) return;

    const loadRealizedPnl = async () => {
      setLoadingRealizedPnl(true);
      setRealizedPnlError(null);
      try {
        const response = await fetch(`/api/trader/${wallet}/realized-pnl`);
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
              .filter((r: RealizedPnlRow) => r.date && Number.isFinite(r.realized_pnl))
              .sort((a: RealizedPnlRow, b: RealizedPnlRow) => new Date(a.date).getTime() - new Date(b.date).getTime())
          : [];
        setRealizedPnlRows(daily);
        setRealizedPnlSummaries(Array.isArray(data?.summaries) ? data.summaries : []);
        setRealizedVolume(typeof data?.volume === 'number' ? data.volume : null);
      } catch (err: any) {
        console.error('Error fetching realized PnL:', err);
        setRealizedPnlRows([]);
        setRealizedPnlSummaries([]);
        setRealizedPnlError(err?.message || 'Failed to load realized PnL');
      } finally {
        setLoadingRealizedPnl(false);
      }
    };

    loadRealizedPnl();
  }, [wallet]);

  // Default selection for realized PnL once summaries load
  useEffect(() => {
    if (realizedPnlSummaries.length === 0) return;
    const preferred = realizedPnlSummaries.find((s) => s.label === '90D')
      || realizedPnlSummaries.find((s) => s.label === '30D')
      || realizedPnlSummaries[0];
    setSelectedPnlLabel(preferred.label);
    setRangeMode('preset');
  }, [realizedPnlSummaries]);

  const filteredChartRows = (() => {
    if (realizedPnlRows.length === 0) return [];

    const now = new Date();
    const summaryMap = new Map(realizedPnlSummaries.map((s) => [s.label, s]));
    const activeSummary = summaryMap.get(selectedPnlLabel) ?? realizedPnlSummaries[0];
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    const presetDays: Record<string, number | null> = {
      '1D': 1,
      '7D': 7,
      '30D': 30,
      '90D': 90,
      '1Y': 365,
      'ALL': null,
    };

    if (rangeMode === 'custom' && customStart && customEnd) {
      startDate = toDateObj(customStart);
      endDate = toDateObj(customEnd);
    } else if (rangeMode === 'preset' && activeSummary?.windowStart && activeSummary?.windowEnd) {
      startDate = toDateObj(activeSummary.windowStart);
      endDate = toDateObj(activeSummary.windowEnd);
    } else {
      const days = presetDays[selectedPnlLabel] ?? null;
      if (days === null) {
        startDate = null;
      } else {
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        start.setUTCDate(start.getUTCDate() - (days - 1));
        startDate = start;
      }
      endDate = null;
    }

    let windowRows = realizedPnlRows.filter((r) => {
      const d = toDateObj(r.date);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });

    // Fallback: if no rows matched (e.g., range too narrow), show the latest 120 entries
    if (windowRows.length === 0) {
      windowRows = realizedPnlRows.slice(-120);
    }

    // Ensure ascending by date for running totals and chart stability
    windowRows = [...windowRows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const series: {
      date: string;
      dailyPnl: number;
      cumulativePnl: number;
      dailyReturnPct: number | null;
      cumulativeReturnPct: number | null;
    }[] = [];

    let running = 0;
    for (const row of windowRows) {
      const daily = Number(row.realized_pnl ?? 0);
      if (!Number.isFinite(daily)) continue;
      running += daily;
      const dailyReturn =
        realizedVolume && realizedVolume !== 0 ? (daily / realizedVolume) * 100 : null;
      const cumulativeReturn =
        realizedVolume && realizedVolume !== 0 ? (running / realizedVolume) * 100 : null;
      series.push({
        date: row.date,
        dailyPnl: daily,
        cumulativePnl: running,
        dailyReturnPct: dailyReturn,
        cumulativeReturnPct: cumulativeReturn,
      });
    }

    if (series.length === 0 && realizedPnlSummaries.length > 0) {
      const summaryMap = new Map(realizedPnlSummaries.map((s) => [s.label, s]));
      const active = summaryMap.get(selectedPnlLabel) ?? realizedPnlSummaries[0];
      const date = active?.windowEnd || active?.windowStart || new Date().toISOString().slice(0, 10);
      series.push({
        date,
        dailyPnl: active?.pnl ?? 0,
        cumulativePnl: active?.pnl ?? 0,
        dailyReturnPct: active?.returnPct ?? null,
        cumulativeReturnPct: active?.returnPct ?? null,
      });
    }

    return series;
  })();

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
              const resolvedEspnUrl = cachedEspnUrl || fallbackEspnUrl;
              
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
                  espnUrl: existing?.espnUrl ?? resolvedEspnUrl,
                  eventSlug: resolvedEventSlug || existing?.eventSlug,
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
                closed: closed,
                resolved: isResolved,
                score: scoreDisplay ?? existing?.score,
                liveStatus: liveStatus ?? existing?.liveStatus,
                gameStartTime: resolvedStartTime,
                eventStatus: existing?.eventStatus ?? eventStatus,
                endDateIso: existing?.endDateIso ?? endDateIso,
                espnUrl: espnScore?.gameUrl ?? existing?.espnUrl ?? fallbackEspnUrl,
                eventSlug: existing?.eventSlug ?? result.eventSlug,
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

  const formatSignedCurrency = (amount: number) => {
    const base = formatCurrency(Math.abs(amount));
    if (amount > 0) return `+${base}`;
    if (amount < 0) return `-${base}`;
    return base;
  };

  const formatPercentage = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return `${num > 0 ? '+' : ''}${num.toFixed(1)}%`;
  };

  const formatSignedPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
    const num = Number(value);
    return `${num > 0 ? '+' : ''}${num.toFixed(1)}%`;
  };

  function toDateObj(dateStr: string) {
    return new Date(`${dateStr}T00:00:00Z`);
  }

  const formatCompactNumber = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toFixed(0);
  };

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
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Profile Header */}
        <Card className="bg-white border-slate-200 p-8">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6 mb-5">
            <Avatar className="h-20 w-20 border-2 border-white shadow-md flex-shrink-0" style={{ backgroundColor: avatarColor }}>
              {traderData.profileImage && (
                <AvatarImage src={traderData.profileImage} alt={traderData.displayName} />
              )}
              <AvatarFallback className="text-white text-xl font-semibold bg-transparent">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-slate-900 mb-1">{traderData.displayName}</h1>
              <div className="flex items-center gap-2 mb-3">
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
              </div>

              <a
                href={`https://polymarket.com/profile/${wallet}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-yellow-600 transition-colors"
              >
                View on Polymarket
                <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>

            {/* Follow Button */}
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

          {/* Header with Data Source Disclaimer */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Performance Stats</h3>
            <p className="text-xs text-slate-500">
              Performance stats from <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Polymarket</a>'s official leaderboard (all-time). 
              Win rate uses the leaderboard when available, otherwise recent trades.
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 text-center shadow-sm min-w-0">
              <div className="text-sm font-semibold text-slate-600 mb-1 flex items-center justify-center gap-1">
                ROI
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-xs font-semibold text-slate-500 cursor-help">
                        ?
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>All-time return on investment from the Polymarket leaderboard.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className={`text-2xl font-semibold ${effectiveRoiValue > 0 ? 'text-emerald-600' : effectiveRoiValue < 0 ? 'text-red-500' : 'text-slate-900'}`}>
                {effectiveVolume > 0 ? formatPercentage(effectiveRoiValue) : 'N/A'}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 text-center shadow-sm min-w-0">
              <div className="text-sm font-semibold text-slate-600 mb-1 flex items-center justify-center gap-1">
                Lifetime Realized P&amp;L
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-xs font-semibold text-slate-500 cursor-help">
                        ?
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>All-time realized profit/loss from the Polymarket leaderboard.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className={`text-2xl font-semibold ${effectivePnl > 0 ? 'text-emerald-600' : effectivePnl < 0 ? 'text-red-500' : 'text-slate-900'}`}>
                {effectivePnl >= 0 ? '+' : ''}{formatCurrency(effectivePnl)}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 text-center shadow-sm min-w-0">
              <div className="text-sm font-semibold text-slate-600 mb-1 flex items-center justify-center gap-1">
                Win Rate
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-xs font-semibold text-slate-500 cursor-help">
                        ?
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>From Polymarket leaderboard when available, otherwise estimated from recent trades.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="text-2xl font-semibold text-slate-900">
                {effectiveWinRate !== null && Number.isFinite(effectiveWinRate) ? `${effectiveWinRate.toFixed(1)}%` : 'N/A'}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 text-center shadow-sm min-w-0">
              <div className="text-sm font-semibold text-slate-600 mb-1 flex items-center justify-center gap-1">
                Volume
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-xs font-semibold text-slate-500 cursor-help">
                        ?
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Total trading volume across all markets on Polymarket.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="text-2xl font-semibold text-slate-900">{formatCurrency(effectiveVolume)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 text-center shadow-sm min-w-0">
              <div className="text-sm font-semibold text-slate-600 mb-1 flex items-center justify-center gap-1">
                Best Position
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-xs font-semibold text-slate-500 cursor-help">
                        ?
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Largest position size from the recent trade sample.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="text-2xl font-semibold text-slate-900">
                {(() => {
                  if (trades.length === 0) return '$0';
                  const maxNotional = Math.max(...trades.map(t => (t.size || 0) * (t.price || 0)));
                  return formatCurrency(maxNotional);
                })()}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 text-center shadow-sm min-w-0">
              <div className="text-sm font-semibold text-slate-600 mb-1 flex items-center justify-center gap-1">
                Total Trades
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-xs font-semibold text-slate-500 cursor-help">
                        ?
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Count of trades in the recent sample (up to 100).</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="text-2xl font-semibold text-slate-900">
                {(() => {
                  const count = trades.length;
                  return count === 100 ? '100+' : count;
                })()}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 text-center shadow-sm min-w-0">
              <div className="text-sm font-semibold text-slate-600 mb-1 flex items-center justify-center gap-1">
                Net P&amp;L / Trade
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-xs font-semibold text-slate-500 cursor-help">
                        ?
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Lifetime realized P&amp;L divided by trades in the sample.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className={`text-2xl font-semibold ${effectivePnl > 0 ? 'text-emerald-600' : effectivePnl < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                {(() => {
                  const avgPnL = trades.length > 0 ? effectivePnl / trades.length : 0;
                  return `${avgPnL > 0 ? '+' : ''}${formatCurrency(avgPnL)}`;
                })()}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 text-center shadow-sm min-w-0">
              <div className="text-sm font-semibold text-slate-600 mb-1 flex items-center justify-center gap-1">
                Open Positions
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-xs font-semibold text-slate-500 cursor-help">
                        ?
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Open positions within the current trade sample.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="text-2xl font-semibold text-slate-900">
                {trades.filter(t => t.status === 'Open').length}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 text-center shadow-sm min-w-0">
              <div className="text-sm font-semibold text-slate-600 mb-1 flex items-center justify-center gap-1">
                Avg P&amp;L / Trade
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-xs font-semibold text-slate-500 cursor-help">
                        ?
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Average realized P&amp;L per trade in the recent sample.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className={`text-2xl font-semibold ${effectivePnl > 0 ? 'text-emerald-600' : effectivePnl < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                {(() => {
                  const avgPnL = trades.length > 0 ? effectivePnl / trades.length : 0;
                  return `${avgPnL > 0 ? '+' : ''}${formatCurrency(avgPnL)}`;
                })()}
              </div>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <Button
            onClick={() => handleTabSelection('positions')}
            variant="ghost"
            className={cn(
              "flex-1 px-3 py-3 rounded-md font-medium text-sm transition-all whitespace-nowrap",
              activeTab === 'positions'
                ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                : "bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-300"
            )}
          >
            Trades
          </Button>
          <Button
            onClick={() => handleTabSelection('performance')}
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
        </div>

        {/* Content */}
        {activeTab === 'positions' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Checkbox
                id="show-resolved-trades"
                checked={showResolvedTrades}
                onCheckedChange={(value) => setShowResolvedTrades(value === true)}
              />
              <Label htmlFor="show-resolved-trades" className="text-sm font-medium text-slate-600">
                Show closed / lost / redeemed
              </Label>
            </div>

            {/* Trades */}
            {loadingTrades ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-[#FDB022] mx-auto mb-4"></div>
                <p className="text-slate-500">Loading trades...</p>
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
                  const marketAvatar = extractMarketAvatarUrl({
                    market: trade.market,
                    slug: trade.marketSlug,
                    eventSlug: trade.eventSlug,
                  });

                  return isPremium ? (
                    <TradeCard
                      key={`${trade.timestamp}-${index}`}
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
                    <Card key={`${trade.timestamp}-${index}`} className="p-6">
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
            {/* Realized PnL (Dome) */}
            <Card className="p-6">
              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Realized PnL</h3>
                    <p className="text-sm text-slate-500">
                      Realized-only from Dome. Pick a preset or custom range.
                    </p>
                  </div>
                  {loadingRealizedPnl && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
                </div>

                {realizedPnlError && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                    {realizedPnlError}
                  </div>
                )}

                {realizedPnlSummaries.length > 0 ? (
                  <>
                  <div className="flex flex-wrap gap-2 items-center">
                    {realizedPnlSummaries.map((summary) => {
                      const isActive = rangeMode === 'preset' && summary.label === selectedPnlLabel
                      return (
                        <button
                            key={summary.label}
                            onClick={() => {
                              setRangeMode('preset')
                              setSelectedPnlLabel(summary.label)
                            }}
                            className={`px-3 py-2 rounded-full text-sm font-medium border transition ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {summary.label}
                          </button>
                        )
                      })}
                      <div className="flex items-center gap-2 ml-auto">
                        <span className="text-xs text-slate-500">Custom</span>
                        <input
                          type="date"
                          value={customStart}
                          onChange={(e) => {
                            setRangeMode('custom')
                            setCustomStart(e.target.value)
                          }}
                            className="border border-slate-200 rounded-md px-2 py-1 text-sm text-slate-700"
                            max={customEnd || undefined}
                          />
                        <span className="text-xs text-slate-500">→</span>
                        <input
                          type="date"
                          value={customEnd}
                          onChange={(e) => {
                            setRangeMode('custom')
                            setCustomEnd(e.target.value)
                          }}
                            className="border border-slate-200 rounded-md px-2 py-1 text-sm text-slate-700"
                            min={customStart || undefined}
                          />
                      </div>
                    </div>

                    {(() => {
                      const summaryMap = new Map(realizedPnlSummaries.map((s) => [s.label, s]))
                      const preset = summaryMap.get(selectedPnlLabel) ?? realizedPnlSummaries[0]
                      const windowRows = (() => {
                        if (rangeMode === 'custom') {
                          if (!customStart || !customEnd) return []
                          const start = toDateObj(customStart)
                          const end = toDateObj(customEnd)
                          return realizedPnlRows.filter((r) => {
                            const d = toDateObj(r.date)
                            return d >= start && d <= end
                          })
                        }
                        if (rangeMode === 'preset') {
                          if (preset.windowStart && preset.windowEnd) {
                            const start = toDateObj(preset.windowStart)
                            const end = toDateObj(preset.windowEnd)
                            return realizedPnlRows.filter((r) => {
                              const d = toDateObj(r.date)
                              return d >= start && d <= end
                            })
                          }
                          const presetDays: Record<string, number | null> = {
                            '1D': 1,
                            '7D': 7,
                            '30D': 30,
                            '90D': 90,
                            '1Y': 365,
                            'ALL': null,
                          }
                          const days = presetDays[preset.label] ?? null
                          if (days === null) return realizedPnlRows
                          const now = new Date()
                          const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
                          start.setUTCDate(start.getUTCDate() - (days - 1))
                          return realizedPnlRows.filter((r) => toDateObj(r.date) >= start)
                        }
                        return realizedPnlRows
                      })()

                      const gainLoss = windowRows.reduce((acc, r) => acc + (r.realized_pnl || 0), 0)
                      const daysUp = windowRows.filter((r) => r.realized_pnl > 0).length
                      const daysDown = windowRows.filter((r) => r.realized_pnl < 0).length
                      const flatDays = windowRows.filter((r) => r.realized_pnl === 0).length
                      const activeDays = daysUp + daysDown
                      const nonActiveDays = flatDays
                      const returnPct =
                        rangeMode === 'preset' && summaryMap.has(selectedPnlLabel)
                          ? summaryMap.get(selectedPnlLabel)?.returnPct ?? null
                          : null

                      const cumulativeAllTime =
                        realizedPnlRows.length > 0
                          ? realizedPnlRows[realizedPnlRows.length - 1].pnl_to_date
                          : null

                      const effectiveWindowLabel =
                        rangeMode === 'custom' && customStart && customEnd
                          ? `${customStart} → ${customEnd}`
                          : preset?.label

                      return (
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                          <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                              <p className="text-xs font-semibold text-slate-500 tracking-wide">Gain / Loss</p>
                              <p
                                className={`text-3xl font-bold mt-2 ${
                                  gainLoss > 0 ? 'text-emerald-600' : gainLoss < 0 ? 'text-red-600' : 'text-slate-900'
                                }`}
                              >
                                {formatSignedCurrency(gainLoss)}
                              </p>
                              <p className="text-xs text-slate-500 mt-1">{effectiveWindowLabel}</p>
                            </div>

                            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                              <p className="text-xs font-semibold text-slate-500 tracking-wide">Return %</p>
                              <p className="text-3xl font-bold mt-2 text-slate-900">
                                {formatSignedPercent(returnPct)}
                              </p>
                              <p className="text-xs text-slate-500 mt-1">Based on total volume when available</p>
                            </div>

                            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                              <p className="text-xs font-semibold text-slate-500 tracking-wide">Days Up</p>
                              <p className="text-3xl font-bold mt-2 text-emerald-600">{daysUp}</p>
                              <p className="text-xs text-slate-500 mt-1">Realized PnL {'>'} 0</p>
                            </div>

                            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                              <p className="text-xs font-semibold text-slate-500 tracking-wide">Days Down</p>
                              <p className="text-3xl font-bold mt-2 text-red-600">{daysDown}</p>
                              <p className="text-xs text-slate-500 mt-1">Realized PnL {'<'} 0</p>
                            </div>

                            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                              <p className="text-xs font-semibold text-slate-500 tracking-wide">Active Days</p>
                              <p className="text-3xl font-bold mt-2 text-slate-900">{activeDays}</p>
                              <p className="text-xs text-slate-500 mt-1">Days with realized PnL ≠ 0</p>
                            </div>

                            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                              <p className="text-xs font-semibold text-slate-500 tracking-wide">Non-Active Days</p>
                              <p className="text-3xl font-bold mt-2 text-slate-700">{nonActiveDays}</p>
                              <p className="text-xs text-slate-500 mt-1">Realized PnL = 0</p>
                            </div>
                          </div>

                          <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
                            <p className="text-xs font-semibold text-slate-500 tracking-wide">Cumulative (All Time)</p>
                            <p
                              className={`text-3xl font-bold mt-2 ${
                                (cumulativeAllTime ?? 0) > 0
                                  ? 'text-emerald-600'
                                  : (cumulativeAllTime ?? 0) < 0
                                    ? 'text-red-600'
                                    : 'text-slate-900'
                              }`}
                            >
                              {cumulativeAllTime !== null
                                ? formatSignedCurrency(cumulativeAllTime)
                                : 'N/A'}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">Does not change with window</p>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Chart */}
                    <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
                      <div className="flex flex-wrap items-center gap-3 mb-4">
                        <div className="text-sm font-semibold text-slate-900">Trend</div>
                        <div className="text-xs text-slate-500">
                          {rangeMode === 'custom' && customStart && customEnd
                            ? `${customStart} → ${customEnd}`
                            : selectedPnlLabel}
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                          {(['return', 'pnl'] as const).map((mode) => (
                            <button
                              key={mode}
                              onClick={() => setChartMode(mode)}
                              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                                chartMode === mode
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              {mode === 'return' ? 'Return (%)' : 'PnL ($)'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {filteredChartRows.length > 0 ? (
                        <div className="h-72 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            {chartMode === 'pnl' ? (
                              <BarChart data={filteredChartRows} barSize={10} barCategoryGap="20%">
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis
                                  dataKey="date"
                                  tickLine={false}
                                  axisLine={false}
                                  interval="preserveStartEnd"
                                  tickFormatter={(d) =>
                                    new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                    })
                                  }
                                  tickMargin={10}
                                  minTickGap={36}
                                  tick={{ fontSize: 11, fill: '#475569' }}
                                />
                                <YAxis
                                  tickLine={false}
                                  axisLine={false}
                                  width={52}
                                  tickMargin={10}
                                  tick={{ fontSize: 11, fill: '#475569' }}
                                  tickCount={5}
                                  domain={[
                                    (min: number) => Math.min(min, 0),
                                    (max: number) => Math.max(max, 0),
                                  ]}
                                  tickFormatter={(v) => formatCompactNumber(v)}
                                />
                                <RechartsTooltip
                                  contentStyle={{ borderRadius: 10, borderColor: '#e2e8f0' }}
                                  formatter={(value: any) => formatSignedCurrency(value as number)}
                                  labelFormatter={(label) =>
                                    new Date(`${label}T00:00:00Z`).toLocaleDateString('en-US', {
                                      weekday: 'short',
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                    })
                                  }
                                />
                                <ReferenceLine y={0} stroke="#cbd5e1" />
                                <Bar dataKey="dailyPnl" name="Daily PnL" minPointSize={2} radius={[4, 4, 4, 4]}>
                                  {filteredChartRows.map((entry, index) => (
                                    <Cell
                                      key={index}
                                      fill={entry.dailyPnl >= 0 ? '#10b981' : '#ef4444'}
                                      opacity={0.85}
                                    />
                                  ))}
                                </Bar>
                              </BarChart>
                            ) : (
                              <AreaChart data={filteredChartRows}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis
                                  dataKey="date"
                                  tickLine={false}
                                  axisLine={false}
                                  interval="preserveStartEnd"
                                  tickFormatter={(d) =>
                                    new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                    })
                                  }
                                  tickMargin={10}
                                  minTickGap={36}
                                  tick={{ fontSize: 11, fill: '#475569' }}
                                />
                                <YAxis
                                  tickLine={false}
                                  axisLine={false}
                                  width={52}
                                  tickMargin={10}
                                  tick={{ fontSize: 11, fill: '#475569' }}
                                  tickCount={5}
                                  domain={[
                                    (min: number) => Math.min(min, 0),
                                    (max: number) => Math.max(max, 0),
                                  ]}
                                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                                />
                                <RechartsTooltip
                                  contentStyle={{ borderRadius: 10, borderColor: '#e2e8f0' }}
                                  formatter={(value: any) => `${Number(value).toFixed(2)}%`}
                                  labelFormatter={(label) =>
                                    new Date(`${label}T00:00:00Z`).toLocaleDateString('en-US', {
                                      weekday: 'short',
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                    })
                                  }
                                />
                                <ReferenceLine y={0} stroke="#cbd5e1" />
                                <Area
                                  type="monotone"
                                  dataKey="cumulativeReturnPct"
                                  name="Cumulative Return (%)"
                                  stroke="#6366f1"
                                  fill="rgba(99,102,241,0.18)"
                                  strokeWidth={2.5}
                                  dot={false}
                                />
                              </AreaChart>
                            )}
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">Not enough data to render the chart.</p>
                      )}
                    </div>
                  </>
                ) : (
                  !loadingRealizedPnl && (
                    <p className="text-sm text-slate-500">No realized PnL available yet.</p>
                  )
                )}
              </div>
            </Card>


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
                    <BarChart data={positionSizeBuckets} barSize={48} maxBarSize={56}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="range"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 12, fill: '#475569' }}
                        height={36}
                        tickFormatter={(label) => `$${label}`}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: '#475569' }}
                        tickCount={5}
                        allowDecimals={false}
                      />
                      <RechartsTooltip
                        cursor={{ fill: 'rgba(16,185,129,0.08)' }}
                        contentStyle={{ borderRadius: 10, borderColor: '#e2e8f0' }}
                        formatter={(value: any, _name, entry: any) => [
                          `${value} trade${value === 1 ? '' : 's'} (${entry.payload.percentage.toFixed(1)}%)`,
                          'Size',
                        ]}
                        labelFormatter={(label) => `Range: ${label}`}
                      />
                      <Bar dataKey="count" radius={[8, 8, 0, 0]} fill="#10b981" />
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
                <div className="flex flex-col md:flex-row gap-8 items-center">
                  <div className="w-full md:w-1/2 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryDistribution}
                          dataKey="percentage"
                          nameKey="category"
                          cx="50%"
                          cy="50%"
                          outerRadius={110}
                          innerRadius={50}
                          paddingAngle={2}
                        >
                          {categoryDistribution.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(value: any, _name, entry: any) => [
                            `${value.toFixed(1)}% (${entry.payload.count} trades)`,
                            entry.payload.category,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {categoryDistribution.map((cat, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block w-3 h-3 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          ></span>
                          <span className="font-semibold text-slate-900">{cat.category}</span>
                        </div>
                        <div className="text-right text-slate-600">
                          <div className="font-semibold text-slate-900">{cat.percentage.toFixed(1)}%</div>
                          <div className="text-xs">{cat.count} {cat.count === 1 ? 'trade' : 'trades'}</div>
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
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Top Performing Trades</h3>
              <div className="space-y-3">
                {(() => {
                  // Calculate ROI for all trades using live market data
                  const tradesWithROI = trades
                    .map(t => {
                      // Get current price from live market data or fall back to trade's currentPrice
                      const liveData = t.conditionId ? liveMarketData.get(t.conditionId) : undefined;
                      const currentPrice = liveData?.price || t.currentPrice || t.price;
                      
                      return {
                        ...t,
                        currentPrice: currentPrice,
                        roi: ((currentPrice - t.price) / t.price) * 100
                      };
                    })
                    .filter(t => t.price && t.price > 0) // Only trades with valid entry price
                    .sort((a, b) => b.roi - a.roi)
                    .slice(0, 5);

                  if (tradesWithROI.length === 0) {
                    return (
                      <div className="text-center py-8">
                        <p className="text-slate-500 mb-2">No trade data available yet</p>
                        <p className="text-sm text-slate-400">
                          Top performing trades will appear here once data is loaded
                        </p>
                      </div>
                    );
                  }

                  return tradesWithROI.map((trade, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 truncate">{trade.market}</p>
                        <p className="text-sm text-slate-500">
                          {new Date(trade.timestamp).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge
                          className={cn(
                            "font-semibold",
                            trade.outcome?.toLowerCase() === 'yes'
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-red-50 text-red-700 border-red-200"
                          )}
                        >
                          {trade.outcome?.toUpperCase() || 'N/A'}
                        </Badge>
                        <p className={cn(
                          "font-bold text-lg min-w-[4rem] text-right",
                          trade.roi >= 0 ? "text-emerald-600" : "text-red-600"
                        )}>
                          {trade.roi >= 0 ? '+' : ''}{trade.roi.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  ));
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
      <ConnectWalletModal
        open={showConnectWalletModal}
        onOpenChange={setShowConnectWalletModal}
        onConnect={handleWalletConnect}
      />
    </div>
  );
}
