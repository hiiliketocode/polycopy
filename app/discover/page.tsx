'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase, ensureProfile } from '@/lib/supabase';
import { triggerLoggedOut } from '@/lib/auth/logout-events';
import type { User } from '@supabase/supabase-js';
import { Navigation } from '@/components/polycopy/navigation';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getTraderAvatarInitials } from '@/lib/trader-name';

interface Trader {
  wallet: string;
  displayName: string;
  pnl: number;
  winRate: number;
  totalTrades: number;
  volume: number;
  rank: number;
  followerCount: number;
  roi?: number;
  profileImage?: string | null;
}

interface TrendingTraderRow {
  trader: Trader;
  weekly: {
    last7: number;
    prev7: number;
  };
  diff: number;
  pctChange: number | null;
}

interface BiggestTrade {
  tradeId: string;
  wallet: string;
  displayName: string | null;
  profileImage: string | null;
  marketTitle: string | null;
  marketSlug: string | null;
  conditionId: string | null;
  outcome: string | null;
  side: string | null;
  price: number | null;
  size: number | null;
  notional: number | null;
  tradeTimestamp: string;
}

// Helper function to format large numbers
function formatLargeNumber(num: number): string {
  const absNum = Math.abs(num);
  
  if (absNum >= 1000000) {
    return `$${(num / 1000000).toFixed(1)}M`;
  } else if (absNum >= 1000) {
    return `$${(num / 1000).toFixed(1)}K`;
  } else {
    return `$${num.toFixed(0)}`;
  }
}

// Helper function to normalize the primary label we show for a trader
function formatDisplayName(name: string | null | undefined, wallet?: string): string {
  const candidate = (name ?? '').trim();
  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(candidate);
  if (!candidate || isAddress) {
    return 'Trader';
  }
  return candidate;
}

function formatSignedLargeNumber(num: number): string {
  const formatted = formatLargeNumber(num);
  return num > 0 ? `+${formatted}` : formatted;
}

function parseNumber(value: any): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMarketTitle(title: string | null, slug: string | null): string {
  const raw = (title || slug || 'Unknown Market').replace(/[-_]/g, ' ').trim();
  if (raw.length <= 26) return raw;
  return `${raw.slice(0, 26)}...`;
}

function formatTimeAgo(timestamp: string | null): string {
  if (!timestamp) return '—';
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return '—';
  const diffMs = Date.now() - parsed;
  if (diffMs < 0) return 'just now';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatPrice(price: number | null): string {
  if (!price || price <= 0) return '—';
  if (price < 0.01 || price > 0.99) return '—';
  return `$${price.toFixed(2)}`;
}

function formatShortDateLabel(dateStr: string | null) {
  if (!dateStr) return 'Unknown date';
  const parsed = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(parsed)) return dateStr;
  return new Date(parsed).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatDateRangeLabel(start: string | null, end: string | null) {
  if (!start || !end) return 'Date range unavailable';
  const startParsed = Date.parse(`${start}T00:00:00Z`);
  const endParsed = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(startParsed) || Number.isNaN(endParsed)) return 'Date range unavailable';
  const startLabel = new Date(startParsed).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const endLabel = new Date(endParsed).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  return `${startLabel} - ${endLabel}`;
}

function computeWindowDays(rows: { date: string; realized_pnl: number }[], window: "30d" | "7d" | "all") {
  if (rows.length === 0) return { daysUp: 0, daysDown: 0 };
  const toDateObj = (dateStr: string) => new Date(`${dateStr}T00:00:00Z`);
  const lastIndex = rows.length - 1;
  let anchorDate = toDateObj(rows[lastIndex].date);
  const todayStr = new Date().toISOString().slice(0, 10);
  if (rows[lastIndex].date === todayStr && lastIndex > 0) {
    anchorDate = toDateObj(rows[lastIndex - 1].date);
  }

  let startDate: Date | null = null;
  if (window !== "all") {
    const days = window === "7d" ? 7 : 30;
    const start = new Date(Date.UTC(
      anchorDate.getUTCFullYear(),
      anchorDate.getUTCMonth(),
      anchorDate.getUTCDate()
    ));
    start.setUTCDate(start.getUTCDate() - (days - 1));
    startDate = start;
  }

  const windowRows = rows.filter((row) => {
    const day = toDateObj(row.date);
    if (startDate && day < startDate) return false;
    return true;
  });

  const daysUp = windowRows.filter((row) => row.realized_pnl > 0).length;
  const daysDown = windowRows.filter((row) => row.realized_pnl < 0).length;
  return { daysUp, daysDown };
}

function getNormalizedCumulativeSeries(rows: { date: string; realized_pnl: number }[], limit = 30) {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => {
    const aTime = new Date(`${a.date}T00:00:00Z`).getTime();
    const bTime = new Date(`${b.date}T00:00:00Z`).getTime();
    return aTime - bTime;
  });
  const trimmed = sorted.slice(-limit);
  if (trimmed.length === 0) return [];

  let cumulative = 0;
  const series: number[] = [];
  for (const row of trimmed) {
    cumulative += row.realized_pnl;
    series.push(cumulative);
  }

  const baseline = series[0] ?? 0;
  return series.map((value) => value - baseline);
}

function normalizeWallet(wallet: string) {
  return wallet.toLowerCase();
}

function computeWeeklyRealized(rows: { date: string; realized_pnl: number }[]) {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => {
    const aTime = new Date(`${a.date}T00:00:00Z`).getTime();
    const bTime = new Date(`${b.date}T00:00:00Z`).getTime();
    return aTime - bTime;
  });

  const toDateObj = (dateStr: string) => new Date(`${dateStr}T00:00:00Z`);
  let anchorDate = toDateObj(sorted[sorted.length - 1].date);
  const todayStr = new Date().toISOString().slice(0, 10);
  if (sorted[sorted.length - 1].date === todayStr && sorted.length > 1) {
    anchorDate = toDateObj(sorted[sorted.length - 2].date);
  }

  const endOfLastWeek = new Date(Date.UTC(
    anchorDate.getUTCFullYear(),
    anchorDate.getUTCMonth(),
    anchorDate.getUTCDate()
  ));
  const startOfLastWeek = new Date(endOfLastWeek);
  startOfLastWeek.setUTCDate(startOfLastWeek.getUTCDate() - 6);

  const endOfPrevWeek = new Date(startOfLastWeek);
  endOfPrevWeek.setUTCDate(endOfPrevWeek.getUTCDate() - 1);
  const startOfPrevWeek = new Date(endOfPrevWeek);
  startOfPrevWeek.setUTCDate(startOfPrevWeek.getUTCDate() - 6);

  const withinRange = (day: Date, start: Date, end: Date) => {
    return day.getTime() >= start.getTime() && day.getTime() <= end.getTime();
  };

  let last7Sum = 0;
  let prev7Sum = 0;

  for (const row of sorted) {
    const day = toDateObj(row.date);
    if (withinRange(day, startOfLastWeek, endOfLastWeek)) {
      last7Sum += row.realized_pnl;
    } else if (withinRange(day, startOfPrevWeek, endOfPrevWeek)) {
      prev7Sum += row.realized_pnl;
    }
  }

  return { last7: last7Sum, prev7: prev7Sum };
}

function computePercentChange(weekly: { last7: number; prev7: number }) {
  if (weekly.prev7 === 0) return null;
  return ((weekly.last7 - weekly.prev7) / Math.abs(weekly.prev7)) * 100;
}

function formatPercentChange(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function PnlSparkline({
  rows,
  limit,
  width = 90,
  height = 32,
}: {
  rows: { date: string; realized_pnl: number }[];
  limit?: number;
  width?: number;
  height?: number;
}) {
  const data = useMemo(() => getNormalizedCumulativeSeries(rows, limit), [rows, limit]);
  if (data.length === 0) {
    return <span className="text-[11px] text-slate-400">—</span>;
  }

  const minValue = Math.min(...data);
  const maxValue = Math.max(...data);
  const range = Math.max(maxValue - minValue, 1);

  const points = data.map((value, index) => {
    const x = data.length === 1 ? width / 2 : (index / (data.length - 1)) * width;
    const y = height - ((value - minValue) / range) * height;
    return { x, y };
  });

  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');

  const netChange = data[data.length - 1];
  const strokeColor =
    netChange > 0 ? '#16a34a' : netChange < 0 ? '#dc2626' : '#94a3b8';

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path
        d={path}
        stroke={strokeColor}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatTradeSize(notional: number | null): string {
  if (!notional) return '—';
  return formatLargeNumber(notional);
}

const TICKER_SELECTION_TARGET = 24;
const MIN_TICKER_NOTIONAL = 10;
const TICKER_UP_RATIO = 2 / 3;

type TickerTradeCandidate = BiggestTrade & {
  timestampMs: number;
  movementMagnitude: number;
  direction: 'up' | 'down' | 'flat';
  entryPrice: number;
};

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getPriceKeyForTrade(trade: BiggestTrade) {
  return trade.conditionId || trade.marketSlug || trade.marketTitle || trade.tradeId;
}

function buildTickerCandidates(trades: BiggestTrade[], marketPrices: Record<string, number>): TickerTradeCandidate[] {
  return trades
    .map((trade) => {
      const notional = trade.notional ?? 0;
      if (notional < MIN_TICKER_NOTIONAL) return null;
      if (!trade.tradeTimestamp) return null;
      const timestampMs = Date.parse(trade.tradeTimestamp);
      if (!Number.isFinite(timestampMs)) return null;
      const entryPrice = trade.price ?? 0;
      if (entryPrice <= 0) return null;
      const priceKey = getPriceKeyForTrade(trade);
      const currentPrice = priceKey ? marketPrices[priceKey] : undefined;
      const movementMagnitude =
        typeof currentPrice === 'number' ? Math.abs(currentPrice - entryPrice) : 0;
      const direction =
        typeof currentPrice === 'number'
          ? currentPrice > entryPrice
            ? 'up'
            : currentPrice < entryPrice
            ? 'down'
            : 'flat'
          : 'flat';
      return {
        ...trade,
        timestampMs,
        movementMagnitude,
        direction,
        entryPrice,
      };
    })
    .filter(Boolean) as TickerTradeCandidate[];
}

function compareCandidates(
  a: TickerTradeCandidate,
  b: TickerTradeCandidate,
  selector: (candidate: TickerTradeCandidate) => number,
  metricName: 'notional' | 'movement' | 'recency'
) {
  const diff = selector(b) - selector(a);
  if (diff !== 0) return diff;
  if (metricName === 'movement') {
    if (a.direction === b.direction) return 0;
    if (a.direction === 'up') return -1;
    if (b.direction === 'up') return 1;
  }
  if (metricName === 'recency') {
    return b.timestampMs - a.timestampMs;
  }
  return 0;
}

function selectTickerTrades(trades: BiggestTrade[], marketPrices: Record<string, number>) {
  const candidates = buildTickerCandidates(trades, marketPrices);
  if (candidates.length === 0) return [];

  const targetCount = Math.min(TICKER_SELECTION_TARGET, candidates.length);
  const metrics = [
    { name: 'notional', selector: (c: TickerTradeCandidate) => c.notional ?? 0 },
    { name: 'movement', selector: (c: TickerTradeCandidate) => c.movementMagnitude },
    { name: 'recency', selector: (c: TickerTradeCandidate) => c.timestampMs },
  ] as const;

  const perMetric = Math.max(1, Math.floor(targetCount / metrics.length));
  const remainder = targetCount - perMetric * metrics.length;

  const selected: TickerTradeCandidate[] = [];
  const selectedIds = new Set<string>();

  for (const metric of metrics) {
    const sorted = [...candidates].sort((a, b) =>
      compareCandidates(a, b, metric.selector, metric.name)
    );
    let added = 0;
    for (const candidate of sorted) {
      if (added >= perMetric) break;
      if (selectedIds.has(candidate.tradeId)) continue;
      selected.push(candidate);
      selectedIds.add(candidate.tradeId);
      added += 1;
    }
  }

  if (remainder > 0) {
    const fallback = [...candidates].sort((a, b) => b.movementMagnitude - a.movementMagnitude);
    for (const candidate of fallback) {
      if (selected.length >= targetCount) break;
      if (selectedIds.has(candidate.tradeId)) continue;
      selected.push(candidate);
      selectedIds.add(candidate.tradeId);
    }
  }

  if (selected.length < targetCount) {
    const fallback = [...candidates].sort((a, b) => b.movementMagnitude - a.movementMagnitude);
    for (const candidate of fallback) {
      if (selected.length >= targetCount) break;
      if (selectedIds.has(candidate.tradeId)) continue;
      selected.push(candidate);
      selectedIds.add(candidate.tradeId);
    }
  }

  const selectionArray = [...selected];
  const selectionSet = new Set(selectionArray.map((candidate) => candidate.tradeId));
  const upTarget = Math.max(1, Math.round(targetCount * TICKER_UP_RATIO));
  const downTarget = Math.max(1, targetCount - upTarget);

  let upCount = selectionArray.filter((candidate) => candidate.direction === 'up').length;
  let downCount = selectionArray.length - upCount;

  const replaceTrade = (oldCandidate: TickerTradeCandidate, newCandidate: TickerTradeCandidate) => {
    const index = selectionArray.findIndex((candidate) => candidate.tradeId === oldCandidate.tradeId);
    if (index >= 0) {
      selectionArray[index] = newCandidate;
      selectionSet.delete(oldCandidate.tradeId);
      selectionSet.add(newCandidate.tradeId);
    }
  };

  if (upCount < upTarget) {
    const needed = upTarget - upCount;
    let remaining = needed;
    const downCandidates = selectionArray
      .filter((candidate) => candidate.direction !== 'up')
      .sort((a, b) => a.movementMagnitude - b.movementMagnitude);
    const availableUp = [...candidates]
      .filter((candidate) => candidate.direction === 'up' && !selectionSet.has(candidate.tradeId))
      .sort((a, b) => b.movementMagnitude - a.movementMagnitude);

    for (const downCandidate of downCandidates) {
      if (remaining <= 0) break;
      const replacement = availableUp.shift();
      if (!replacement) break;
      replaceTrade(downCandidate, replacement);
      upCount += 1;
      downCount -= 1;
      remaining -= 1;
    }
  }

  if (downCount < downTarget) {
    const neededDown = downTarget - downCount;
    let remaining = neededDown;
    const upCandidates = selectionArray
      .filter((candidate) => candidate.direction === 'up')
      .sort((a, b) => a.movementMagnitude - b.movementMagnitude);
    const availableDown = [...candidates]
      .filter((candidate) => candidate.direction !== 'up' && !selectionSet.has(candidate.tradeId))
      .sort((a, b) => b.movementMagnitude - a.movementMagnitude);

    for (const upCandidate of upCandidates) {
      if (remaining <= 0) break;
      const replacement = availableDown.shift();
      if (!replacement) break;
      replaceTrade(upCandidate, replacement);
      upCount -= 1;
      downCount += 1;
      remaining -= 1;
    }
  }

  return shuffleArray(selectionArray).slice(0, targetCount);
}

function DiscoverPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState('OVERALL');
  const [user, setUser] = useState<User | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loadingTraders, setLoadingTraders] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [sortPeriod, setSortPeriod] = useState<"30d" | "7d" | "all">("30d");
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [sortMetric, setSortMetric] = useState<"roi" | "pnl" | "volume">("pnl");
  const [visibleCount, setVisibleCount] = useState(10);
  const [autoLoadEnabled, setAutoLoadEnabled] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [biggestTrades, setBiggestTrades] = useState<BiggestTrade[]>([]);
  const [loadingBiggestTrades, setLoadingBiggestTrades] = useState(true);
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});
  const priceLastFetchedRef = useRef<Record<string, number>>({});
  const [mostActiveFromPublicTrades, setMostActiveFromPublicTrades] = useState<Array<{ wallet: string; displayName: string | null }>>([]);
  const [loadingMostActive, setLoadingMostActive] = useState(true);
  const [tradeCounts, setTradeCounts] = useState<Record<string, { count: number; hasMore: boolean }>>({});
  const [realizedDailyMap, setRealizedDailyMap] = useState<Record<string, { date: string; realized_pnl: number }[]>>({});
  const [yesterdayWinners, setYesterdayWinners] = useState<Array<{ wallet: string; pnl: number; displayName: string | null }>>([]);
  const [followModalTrader, setFollowModalTrader] = useState<{ wallet: string; displayName: string | null } | null>(null);
  
  // BATCH FOLLOW FETCHING
  const [followedWallets, setFollowedWallets] = useState<Set<string>>(new Set());

  // Initialize category from URL on mount
  useEffect(() => {
    const categoryFromUrl = searchParams.get('category');
    if (categoryFromUrl) {
      setSelectedCategory(categoryFromUrl);
    }
  }, [searchParams]);

  // Check auth status
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        ensureProfile(session.user.id, session.user.email!);
        
        // Check premium status and wallet
        Promise.all([
          supabase
            .from('profiles')
            .select('is_premium, profile_image_url')
            .eq('id', session.user.id)
            .single(),
          supabase
            .from('turnkey_wallets')
            .select('polymarket_account_address, eoa_address')
            .eq('user_id', session.user.id)
            .maybeSingle()
        ]).then(([profileRes, walletRes]) => {
          setIsPremium(profileRes.data?.is_premium || false);
          setProfileImageUrl(profileRes.data?.profile_image_url || null);
          setWalletAddress(
            walletRes.data?.polymarket_account_address || 
            walletRes.data?.eoa_address || 
            null
          );
        });
      } else {
        setUser(null);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        ensureProfile(session.user.id, session.user.email!);
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // BATCH FETCH all follows
  useEffect(() => {
    const fetchAllFollows = async () => {
      if (!user) {
        setFollowedWallets(new Set());
        return;
      }
      try {
        const { data: follows, error } = await supabase
          .from('follows')
          .select('trader_wallet')
          .eq('user_id', user.id);

        if (error) {
          console.error('Error batch fetching follows:', error);
          setFollowedWallets(new Set());
        } else {
          const walletSet = new Set(
            follows?.map(f => f.trader_wallet.toLowerCase()) || []
          );
          setFollowedWallets(walletSet);
        }
      } catch (err) {
        console.error('Error in batch follow fetch:', err);
        setFollowedWallets(new Set());
      } finally {
      }
    };

    fetchAllFollows();
  }, [user]);

  // Fetch traders by category and time period
  useEffect(() => {
    const fetchTraders = async () => {
      setLoadingTraders(true);
      try {
        // Map sortPeriod to API timePeriod parameter
        const timePeriodMap = {
          "30d": "month",
          "7d": "week",
          "all": "all"
        };
        const timePeriod = timePeriodMap[sortPeriod];
        
        const response = await fetch(
          `/api/polymarket/leaderboard?limit=50&orderBy=PNL&category=${selectedCategory}&timePeriod=${timePeriod}`
        );
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        const tradersWithROI = (data.traders || []).map((trader: { volume: number; pnl: number }) => ({
          ...trader,
          roi: trader.volume > 0 ? ((trader.pnl / trader.volume) * 100) : 0
        }));
        
        setTraders(tradersWithROI);
      } catch (error) {
        console.error('Error fetching traders:', error);
        setTraders([]);
      } finally {
        setLoadingTraders(false);
      }
    };

    fetchTraders();
  }, [selectedCategory, sortPeriod]);

  // Follow change handler
  const handleFollowChange = async (wallet: string, isNowFollowing: boolean) => {
    if (!user) {
      triggerLoggedOut('session_missing');
      router.push('/login');
      return;
    }

    const walletLower = wallet.toLowerCase();

    try {
      if (isNowFollowing) {
        // Follow: INSERT into follows table
        const { error: insertError } = await supabase
          .from('follows')
          .insert({
            user_id: user.id,
            trader_wallet: walletLower,
          });

        if (insertError) {
          console.error('Error following trader:', insertError);
          return;
        }

        // Update UI state after successful database operation
        setFollowedWallets(prev => {
          const newSet = new Set(prev);
          newSet.add(walletLower);
          return newSet;
        });
      } else {
        // Unfollow: DELETE from follows table
        const { error: deleteError } = await supabase
          .from('follows')
          .delete()
          .eq('user_id', user.id)
          .ilike('trader_wallet', walletLower);

        if (deleteError) {
          console.error('Error unfollowing trader:', deleteError);
          return;
        }

        // Update UI state after successful database operation
        setFollowedWallets(prev => {
          const newSet = new Set(prev);
          newSet.delete(walletLower);
          return newSet;
        });
      }
    } catch (err) {
      console.error('Error toggling follow:', err);
    }
  };

  // Category mapping - Polymarket API expects uppercase category names
  // Note: REAL_ESTATE is commented out because Polymarket's API doesn't properly filter it yet
  const categoryMap: Record<string, string> = {
    'All': 'OVERALL',
    'Politics': 'POLITICS',
    'Sports': 'SPORTS',
    'Crypto': 'CRYPTO',
    'Pop Culture': 'CULTURE',
    'Business': 'FINANCE',
    'Economics': 'ECONOMICS',
    'Tech': 'TECH',
    'Weather': 'WEATHER',
    // 'Real Estate': 'REAL_ESTATE' // Disabled - API returns same results as OVERALL
  };

  const categories = [
    'All',
    'Sports',
    'Politics', 
    'Crypto',
    'Pop Culture',
    'Business',
    'Economics',
    'Tech',
    'Weather',
    // 'Real Estate' // Disabled until Polymarket API properly filters this category
  ];

  const sortOptions: Array<{ value: "30d" | "7d" | "all"; label: string }> = [
    { value: "30d", label: "30 Days" },
    { value: "7d", label: "7 Days" },
    { value: "all", label: "All Time" },
  ];
  const activeSortOptionLabel = sortOptions.find((option) => option.value === sortPeriod)?.label ?? sortOptions[0].label;
  const sortMenuRef = useRef<HTMLDivElement | null>(null);

  const sortMetricOptions: Array<{ value: "roi" | "pnl" | "volume"; label: string }> = [
    { value: "roi", label: "ROI" },
    { value: "pnl", label: "P&L" },
    { value: "volume", label: "Volume" },
  ];

  useEffect(() => {
    if (!isSortMenuOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (!sortMenuRef.current) return;
      const target = event.target as Node | null;
      if (target && !sortMenuRef.current.contains(target)) {
        setIsSortMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isSortMenuOpen]);

  // Search handler
  const handleSearch = async () => {
    const query = searchQuery.trim();
    
    if (!query) {
      return;
    }

    setIsSearching(true);

    try {
      const isWalletAddress = /^0x[a-fA-F0-9]{40}$/.test(query);
      
      if (!isWalletAddress) {
        throw new Error('WALLET_REQUIRED');
      }
      
      const response = await fetch(`/api/trader/${query}`);
      
      if (!response.ok) {
        throw new Error('Trader profile not found for this wallet address.');
      }
      
      router.push(`/trader/${query}`);
    } catch (error) {
      console.error('Search error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage === 'WALLET_REQUIRED') {
        alert(
          `Please enter a wallet address, not a username.\n\n` +
          `How to find a wallet address:\n` +
          `1. Go to the trader's Polymarket profile\n` +
          `2. Look for the wallet address at the top (starts with "0x")\n` +
          `3. Copy and paste it into the search box\n\n` +
          `Example: 0x1234567890abcdef1234567890abcdef12345678`
        );
      } else {
        alert(`No trader found for "${query}". Please check the wallet address and try again.`);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const openFollowModal = (trader: { wallet: string; displayName: string | null }) => {
    setFollowModalTrader(trader);
  };

  const closeFollowModal = () => {
    setFollowModalTrader(null);
  };

  const confirmFollowModal = () => {
    if (followModalTrader) {
      handleFollowChange(followModalTrader.wallet, true);
    }
    closeFollowModal();
  };

  const rankedTraders = useMemo(() => {
    const sorters: Record<"roi" | "pnl" | "volume", (a: Trader, b: Trader) => number> = {
      roi: (a, b) => (b.roi || 0) - (a.roi || 0),
      pnl: (a, b) => b.pnl - a.pnl,
      volume: (a, b) => b.volume - a.volume,
    };
    return [...traders].sort(sorters[sortMetric]);
  }, [traders, sortMetric]);

  // Filter traders by search
  const filteredTraders = rankedTraders.filter((trader) => {
    const query = searchQuery.toLowerCase();
    return (
      trader.displayName.toLowerCase().includes(query) ||
      trader.wallet.toLowerCase().includes(query)
    );
  });

  const visibleTraders = filteredTraders.slice(0, visibleCount);

  const trendingCandidateWallets = useMemo(
    () => rankedTraders.slice(0, 50).map((trader) => trader.wallet), // Increased from 20 to 50 for better coverage
    [rankedTraders]
  );

  const mostCopiedTraders = useMemo(() => {
    return [...traders]
      .sort((a, b) => (b.followerCount || 0) - (a.followerCount || 0))
      .slice(0, 10);
  }, [traders]);

  const mostCopiedCandidateWallets = useMemo(
    () => mostCopiedTraders.map((trader) => trader.wallet),
    [mostCopiedTraders]
  );

  const trendingTraders = useMemo(() => {
    const entries: TrendingTraderRow[] = [];
    let totalChecked = 0;
    let hasDataCount = 0;
    let hasWeeklyCount = 0;
    
    for (const trader of rankedTraders) {
      totalChecked++;
      const walletKey = normalizeWallet(trader.wallet);
      const rows = realizedDailyMap[walletKey];
      if (!rows || rows.length === 0) continue;
      
      hasDataCount++;
      const weekly = computeWeeklyRealized(rows);
      if (!weekly) continue;
      
      hasWeeklyCount++;
      entries.push({
        trader,
        weekly,
        diff: weekly.last7 - weekly.prev7,
        pctChange: computePercentChange(weekly),
      });
    }
    
    console.log(`Trending Traders Debug:
      - Total traders checked: ${totalChecked}
      - Traders with data: ${hasDataCount}
      - Traders with weekly data: ${hasWeeklyCount}
      - Final entries: ${entries.length}
    `);
    
    return entries
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 10);
  }, [rankedTraders, realizedDailyMap]);

  const selectedTickerTrades = useMemo(
    () => selectTickerTrades(biggestTrades, marketPrices),
    [biggestTrades, marketPrices]
  );

  const tickerLoop = useMemo(() => {
    return selectedTickerTrades.length > 0 ? [...selectedTickerTrades, ...selectedTickerTrades] : [];
  }, [selectedTickerTrades]);

  const mostActiveTraders = useMemo(() => {
    // Use data from public trades API instead of filtering leaderboard
    return mostActiveFromPublicTrades.slice(0, 10);
  }, [mostActiveFromPublicTrades]);

  const sortedYesterdayWinners = useMemo(() => {
    return [...yesterdayWinners]
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 10);
  }, [yesterdayWinners]);

  // Fetch most active traders from public trades
  useEffect(() => {
    let cancelled = false;

    const fetchMostActive = async () => {
      setLoadingMostActive(true);
      try {
        const response = await fetch('/api/public-trades/most-active?hours=24&limit=10', {
          cache: 'no-store',
        });
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!cancelled) {
          setMostActiveFromPublicTrades(Array.isArray(data?.traders) ? data.traders : []);
        }
      } catch (error) {
        console.error('Error fetching most active traders:', error);
        if (!cancelled) {
          setMostActiveFromPublicTrades([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingMostActive(false);
        }
      }
    };

    fetchMostActive();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (traders.length === 0) return;
    let cancelled = false;

    // Get top 15 traders by volume to check their activity (reduced from 20 for speed)
    const topTraders = [...traders]
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 15);

    const loadCounts = async () => {
      // Fetch in batches of 5 for better parallelization
      const batchSize = 5;
      
      for (let i = 0; i < topTraders.length; i += batchSize) {
        if (cancelled) break;
        
        const batch = topTraders.slice(i, i + batchSize);
        const batchEntries = await Promise.all(
          batch.map(async (trader) => {
            const normalizedWallet = normalizeWallet(trader.wallet);
            try {
              const response = await fetch(`/api/polymarket/trades-count?wallet=${trader.wallet}&hours=24&limit=300`, {
                cache: 'no-store',
              });
              if (!response.ok) return [normalizedWallet, { count: 0, hasMore: false }] as [string, { count: number; hasMore: boolean }];
              const payload = await response.json();
              return [
                normalizedWallet,
                {
                  count: Number(payload?.count) || 0,
                  hasMore: Boolean(payload?.hasMore),
                },
              ] as [string, { count: number; hasMore: boolean }];
            } catch {
              return [normalizedWallet, { count: 0, hasMore: false }] as [string, { count: number; hasMore: boolean }];
            }
          })
        );
        
        // Update state after each batch for progressive loading
        if (!cancelled) {
          setTradeCounts((prev) => {
            const next = { ...prev };
            for (const [wallet, data] of batchEntries) {
              next[wallet] = data;
            }
            return next;
          });
        }
      }
    };

    loadCounts();

    return () => {
      cancelled = true;
    };
  }, [traders]);

  useEffect(() => {
    let cancelled = false;

    const loadYesterdayWinners = async () => {
      try {
        const response = await fetch('/api/realized-pnl/top?window=1D&limit=10', { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to load');
        const payload = await response.json();
        if (!cancelled) {
          setYesterdayWinners(Array.isArray(payload?.traders) ? payload.traders : []);
        }
      } catch {
        if (!cancelled) setYesterdayWinners([]);
      }
    };

    loadYesterdayWinners();

    return () => {
      cancelled = true;
    };
  }, []);

  const mostConsistentEntries = useMemo(() => {
    return [...traders]
      .map((trader) => ({
        trader,
        daysUp: computeWindowDays(realizedDailyMap[normalizeWallet(trader.wallet)] ?? [], '30d').daysUp,
      }))
      .sort((a, b) => {
        if (b.daysUp !== a.daysUp) return b.daysUp - a.daysUp;
        return (b.trader.winRate || 0) - (a.trader.winRate || 0);
      })
      .slice(0, 10);
  }, [traders, realizedDailyMap]);

  useEffect(() => {
    const walletSet = new Set<string>();
    // Prioritize trending candidates - fetch them first
    trendingCandidateWallets.forEach((wallet) => walletSet.add(normalizeWallet(wallet)));
    
    // Add others
    visibleTraders.forEach((trader) => walletSet.add(normalizeWallet(trader.wallet)));
    mostConsistentEntries.forEach((entry) => walletSet.add(normalizeWallet(entry.trader.wallet)));
    mostCopiedCandidateWallets.forEach((wallet) => walletSet.add(normalizeWallet(wallet)));
    
    const wallets = Array.from(walletSet);

    const walletsToFetch = wallets.filter((wallet) => !(wallet in realizedDailyMap));
    if (walletsToFetch.length === 0) return;

    let cancelled = false;

    const loadRealized = async () => {
      // Split into priority (trending) and non-priority wallets
      const trendingSet = new Set(trendingCandidateWallets.map(w => normalizeWallet(w)));
      const priorityWallets = walletsToFetch.filter(w => trendingSet.has(w));
      const otherWallets = walletsToFetch.filter(w => !trendingSet.has(w));
      
      // Fetch priority wallets in small batches for progressive loading
      const batchSize = 10; // Increased from 5 to 10 for faster loading
      for (let i = 0; i < priorityWallets.length; i += batchSize) {
        if (cancelled) break;
        
        const batch = priorityWallets.slice(i, i + batchSize);
        const entries = await Promise.all(
          batch.map(async (wallet) => {
            const normalizedWallet = wallet.toLowerCase();
            try {
              const response = await fetch(`/api/trader/${wallet}/realized-pnl`, { cache: 'no-store' });
              if (!response.ok) return [normalizedWallet, []] as [string, { date: string; realized_pnl: number }[]];
              const payload = await response.json();
              const rows = Array.isArray(payload?.daily)
                ? payload.daily.map((row: { date: string; realized_pnl: number }) => ({
                    date: row.date,
                    realized_pnl: Number(row.realized_pnl ?? 0),
                  }))
                : [];
              return [normalizedWallet, rows] as [string, { date: string; realized_pnl: number }[]];
            } catch {
              return [normalizedWallet, []] as [string, { date: string; realized_pnl: number }[]];
            }
          })
        );

        if (!cancelled) {
          setRealizedDailyMap((prev) => {
            const next = { ...prev };
            for (const [wallet, rows] of entries) {
              next[wallet] = rows;
            }
            return next;
          });
        }
      }
      
      // Then fetch other wallets
      if (!cancelled && otherWallets.length > 0) {
        const entries = await Promise.all(
          otherWallets.map(async (wallet) => {
            const normalizedWallet = wallet.toLowerCase();
            try {
              const response = await fetch(`/api/trader/${wallet}/realized-pnl`, { cache: 'no-store' });
              if (!response.ok) return [normalizedWallet, []] as [string, { date: string; realized_pnl: number }[]];
              const payload = await response.json();
              const rows = Array.isArray(payload?.daily)
                ? payload.daily.map((row: { date: string; realized_pnl: number }) => ({
                    date: row.date,
                    realized_pnl: Number(row.realized_pnl ?? 0),
                  }))
                : [];
              return [normalizedWallet, rows] as [string, { date: string; realized_pnl: number }[]];
            } catch {
              return [normalizedWallet, []] as [string, { date: string; realized_pnl: number }[]];
            }
          })
        );

        if (!cancelled) {
          setRealizedDailyMap((prev) => {
            const next = { ...prev };
            for (const [wallet, rows] of entries) {
              next[wallet] = rows;
            }
            return next;
          });
        }
      }
    };

    loadRealized();

    return () => {
      cancelled = true;
    };
  }, [visibleTraders, mostConsistentEntries, trendingCandidateWallets, mostCopiedCandidateWallets, realizedDailyMap]);

  useEffect(() => {
    let cancelled = false;
    let interval: NodeJS.Timeout | null = null;

    const fetchBiggestTrades = async () => {
      try {
        const response = await fetch('/api/public-trades/biggest?hours=1&limit=24', {
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        const payload = await response.json();
        if (!cancelled) {
          setBiggestTrades(Array.isArray(payload?.trades) ? payload.trades : []);
        }
      } catch (error) {
        console.error('Error fetching biggest trades:', error);
        if (!cancelled) {
          setBiggestTrades([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingBiggestTrades(false);
        }
      }
    };

    setLoadingBiggestTrades(true);
    fetchBiggestTrades();
    interval = setInterval(fetchBiggestTrades, 60000);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (biggestTrades.length === 0) return;
    let cancelled = false;
    const PRICE_REFRESH_MS = 30 * 60 * 1000;

    const fetchPrices = async () => {
      const updates: Record<string, number> = {};
      const now = Date.now();

      await Promise.all(
        biggestTrades.map(async (trade) => {
          const key = trade.conditionId || trade.marketSlug || trade.marketTitle;
          if (!key) return;
          const lastFetched = priceLastFetchedRef.current[key];
          if (lastFetched && now - lastFetched < PRICE_REFRESH_MS) return;

          const params = new URLSearchParams();
          if (trade.conditionId) params.set('conditionId', trade.conditionId);
          else if (trade.marketSlug) params.set('slug', trade.marketSlug);
          else if (trade.marketTitle) params.set('title', trade.marketTitle);

          try {
            const response = await fetch(`/api/polymarket/price?${params.toString()}`, { cache: 'no-store' });
            if (!response.ok) return;
            const data = await response.json();
            const prices = Array.isArray(data?.market?.outcomePrices) ? data.market.outcomePrices : null;
            const outcomes = Array.isArray(data?.market?.outcomes) ? data.market.outcomes : null;
            if (!prices || !outcomes) return;
            const outcomeIndex = trade.outcome
              ? outcomes.findIndex((outcome: string) => outcome?.toUpperCase() === trade.outcome?.toUpperCase())
              : -1;
            const current = outcomeIndex >= 0 ? Number(prices[outcomeIndex]) : Number(prices[0]);
            if (Number.isFinite(current) && current >= 0.01 && current <= 0.99) {
              updates[key] = current;
              priceLastFetchedRef.current[key] = now;
            }
          } catch (error) {
            console.warn('Failed to fetch market price', error);
          }
        })
      );

      if (!cancelled && Object.keys(updates).length > 0) {
        setMarketPrices((prev) => ({ ...prev, ...updates }));
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, PRICE_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [biggestTrades]);

  useEffect(() => {
    setVisibleCount(10);
    setAutoLoadEnabled(false);
  }, [selectedCategory, sortPeriod, sortMetric, searchQuery]);

  useEffect(() => {
    if (!autoLoadEnabled) {
      return;
    }

    const target = loadMoreRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 10, filteredTraders.length));
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [autoLoadEnabled, filteredTraders.length]);

  return (
    <>
      <Navigation 
        user={user ? { id: user.id, email: user.email || '' } : null} 
        isPremium={isPremium}
        walletAddress={walletAddress}
        profileImageUrl={profileImageUrl}
      />
      
      {/* SEO H1 - Visually hidden but present for search engines */}
      <h1 className="sr-only">Discover Top Polymarket Traders - Copy Trading Leaderboard</h1>
      
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
      <div className="min-h-screen bg-white md:pt-0 pb-20 md:pb-8">
        {/* Trade Ticker */}
        <div className="bg-white border-y border-slate-100">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 mb-2">
              Recent Trades
            </div>
            {!loadingBiggestTrades && tickerLoop.length > 0 ? (
              <div className="relative overflow-hidden rounded-xl border border-slate-200/70 bg-white">
                <div className="discover-ticker-track flex items-center gap-4 py-2.5 px-4">
                  {tickerLoop.map((trade, index) => {
                    const displayName = trade.displayName
                      ? formatDisplayName(trade.displayName, trade.wallet)
                      : formatDisplayName(trade.wallet, trade.wallet);
                    const timeAgo = formatTimeAgo(trade.tradeTimestamp);
                    const marketTitle = formatMarketTitle(trade.marketTitle, trade.marketSlug);
                    const priceKey = trade.conditionId || trade.marketSlug || trade.marketTitle;
                    const currentPrice = priceKey ? marketPrices[priceKey] : undefined;
                    const direction =
                      typeof currentPrice === 'number' && typeof trade.price === 'number'
                        ? currentPrice > trade.price
                          ? 'up'
                          : currentPrice < trade.price
                          ? 'down'
                          : 'flat'
                        : 'flat';
                    const currentPriceStyles =
                      direction === 'up'
                        ? 'bg-emerald-100 text-emerald-700'
                        : direction === 'down'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-[#FFF7E1] text-slate-600';

                    return (
                    <Link
                      key={`${trade.tradeId}-${index}`}
                      href={`/trader/${trade.wallet}?tab=trades`}
                      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm hover:shadow-md transition-shadow min-w-[220px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold text-slate-900 truncate max-w-[180px]">{displayName}</p>
                          <p className="text-[11px] text-slate-400 truncate max-w-[180px]">{marketTitle}</p>
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium">{timeAgo}</span>
                      </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-semibold text-slate-900">
                            {formatTradeSize(trade.notional)}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-slate-600">{formatPrice(trade.price)}</span>
                            <span className="text-[11px] text-slate-400">→</span>
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${currentPriceStyles}`}>
                              {formatPrice(typeof currentPrice === 'number' ? currentPrice : trade.price)}
                            </span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200/70 bg-white px-4 py-3 text-sm text-slate-500">
                {loadingBiggestTrades ? 'Loading biggest trades...' : 'No recent trades in the last hour.'}
              </div>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 pb-4 sm:pt-8 sm:pb-6">
            <div className="max-w-2xl mx-auto relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" aria-hidden="true" />
              <label htmlFor="trader-search" className="sr-only">
                Search for trader by wallet address
              </label>
              <input
                id="trader-search"
                type="text"
                placeholder="Enter wallet address (0x...)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                aria-describedby="search-instructions"
                className="w-full h-12 pl-12 pr-24 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent shadow-sm"
              />
              <button
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                aria-label="Search for trader"
                className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-[#FDB022] text-slate-900 rounded-lg hover:bg-[#E69E1A] disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
              >
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>
            <p id="search-instructions" className="text-xs text-slate-500 mt-2 text-center">
              Enter the wallet address from a trader&apos;s Polymarket profile (e.g., 0x1234...5678)
            </p>
          </div>
        </div>


        {/* Trending Traders Section */}
        <div className="bg-white">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <div>
              <h3 className="text-lg font-semibold text-slate-900">Trending Traders</h3>
              <p className="text-xs text-slate-500">Most improved by realized PnL week-over-week</p>
              </div>
            </div>

          {trendingTraders.length === 0 && Object.keys(realizedDailyMap).length < 30 ? (
            <div className="overflow-x-auto" role="status" aria-live="polite" aria-label="Loading trending traders">
              <div className="flex gap-4 pb-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="min-w-[220px] flex-shrink-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm animate-pulse"
                    style={{ minHeight: '240px' }}
                    aria-hidden="true"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="h-10 w-10 bg-[#FFF6DA] rounded-full"></div>
                        <div className="h-4 bg-[#FFF6DA] rounded w-24"></div>
                      </div>
                      <div className="h-4 bg-[#FFF6DA] rounded w-8"></div>
                    </div>
                    <div className="mt-4 h-6 bg-[#FFF6DA] rounded w-20 mx-auto"></div>
                    <div className="mt-4 h-16 bg-[#FFF6DA] rounded"></div>
                    <div className="mt-4 h-8 bg-[#FFF6DA] rounded"></div>
                    <div className="mt-4 h-10 bg-[#FFF6DA] rounded-full"></div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-3 text-center">
                Loading trader performance data... ({Object.keys(realizedDailyMap).length}/50)
              </p>
            </div>
          ) : trendingTraders.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="flex gap-4 pb-2">{trendingTraders.slice(0, 10).map((entry, index) => {
                    const trader = entry.trader;
                    const rows = realizedDailyMap[normalizeWallet(trader.wallet)] || [];
                    const isFollowing = followedWallets.has(trader.wallet.toLowerCase());
                    const changeColor =
                      entry.pctChange !== null
                        ? entry.pctChange > 0
                          ? "text-emerald-600"
                          : entry.pctChange < 0
                          ? "text-rose-500"
                          : "text-slate-900"
                        : "text-slate-400";

                    return (
                    <div
                      key={trader.wallet}
                      className="group min-w-[220px] flex-shrink-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-lg cursor-pointer"
                      style={{ minHeight: '240px' }}
                      onClick={() => router.push(`/trader/${trader.wallet}?tab=trades`)}
                      role="link"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          router.push(`/trader/${trader.wallet}?tab=trades`)
                        }
                      }}
                    >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10 border-2 border-white bg-white shadow-sm flex-shrink-0">
                              {trader.profileImage ? (
                                <AvatarImage src={trader.profileImage} alt={trader.displayName} />
                              ) : null}
                              <AvatarFallback className="bg-white text-slate-700 font-semibold text-sm">
                                {getTraderAvatarInitials({ displayName: trader.displayName, wallet: trader.wallet })}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 max-w-[140px]">
                              <p className="text-sm font-semibold text-slate-900 truncate">
                                {formatDisplayName(trader.displayName, trader.wallet)}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs text-slate-400 font-medium">#{index + 1}</span>
                        </div>

                        <div className="mt-2 text-center">
                          <span className={`text-sm font-semibold ${changeColor}`}>
                            {formatPercentChange(entry.pctChange)}
                          </span>
                        </div>

                        <div className="mt-3 flex justify-center">
                          <div className="w-full max-w-[220px] rounded-2xl border border-slate-200 px-4 py-3 text-center text-sm text-slate-500">
                            <p className="text-[11px] tracking-[0.3em] text-slate-400 mb-1">Last 7 Days</p>
                            <p className="text-base font-semibold text-slate-900">
                              {formatSignedLargeNumber(entry.weekly.last7)}
                            </p>
                          </div>
                        </div>

                        <div className="relative mt-3 flex h-12 items-center justify-center">
                          <div className="absolute inset-x-0 top-1/2 border-t border-slate-200/70" />
                          <div className="relative z-10">
                            <PnlSparkline rows={rows} limit={14} width={180} />
                          </div>
                        </div>

                        <button
                          onClick={(event) => {
                            event.stopPropagation()
                            handleFollowChange(trader.wallet, !isFollowing)
                          }}
                          className="mt-4 w-full rounded-full bg-[#FDB022] px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-[#e6a71a]"
                          aria-label={isFollowing ? 'Following' : 'Follow'}
                        >
                          {isFollowing ? (
                            <Check className="h-4 w-4 mx-auto" aria-hidden />
                          ) : (
                            'Follow'
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <p>No trending traders available</p>
            </div>
          )}
          </div>
        </div>

        {/* Top Traders Section */}
        <div className="bg-white">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-8 sm:py-14">
            <div className="mb-6">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                    Top Traders by
                  </h2>
                <div ref={sortMenuRef} className="relative inline-block text-left">
                  <button
                    type="button"
                    onClick={() => setIsSortMenuOpen((prev) => !prev)}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xl font-bold text-emerald-600 shadow-sm transition hover:border-slate-300"
                    aria-haspopup="true"
                    aria-expanded={isSortMenuOpen}
                  >
                    <span className="mt-0.5">{sortMetricOptions.find((option) => option.value === sortMetric)?.label || "ROI"}</span>
                    <ChevronDown className="h-5 w-5 text-emerald-600" />
                  </button>
                  <div
                    className={`absolute right-0 z-10 mt-2 w-40 rounded-2xl border border-slate-200 bg-white text-sm shadow-lg transition-all ${
                      isSortMenuOpen
                        ? "opacity-100 translate-y-0"
                        : "pointer-events-none opacity-0 translate-y-1"
                    }`}
                  >
                    {sortMetricOptions.map((option) => {
                      const isActive = sortMetric === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setSortMetric(option.value);
                            setIsSortMenuOpen(false);
                          }}
                          className={`w-full px-4 py-2 text-left font-semibold transition ${
                            isActive
                              ? "bg-[#FFF6DA] text-emerald-600"
                              : "text-slate-600 hover:bg-[#FFF6DA]"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" role="group" aria-label="Category filter">
                  {categories.map((category) => {
                    const categoryValue = categoryMap[category];
                    const isActive = selectedCategory === categoryValue;
                    
                    return (
                      <button
                        key={category}
                        onClick={() => {
                          setSelectedCategory(categoryValue);
                          // Update URL with category parameter
                          const newUrl = new URL(window.location.href);
                          newUrl.searchParams.set('category', categoryValue);
                          window.history.pushState({}, '', newUrl.toString());
                        }}
                        aria-pressed={isActive}
                        aria-label={`Filter by ${category}`}
                        className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-full font-medium text-xs sm:text-sm transition-all whitespace-nowrap flex-shrink-0 ${
                            isActive
                              ? "bg-[#FDB022] text-slate-900 shadow-sm"
                              : "bg-white text-slate-600 hover:bg-[#FFF6DA] border border-slate-200"
                        }`}
                      >
                        {category}
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>

            {loadingTraders ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 animate-pulse">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-[#FFF6DA] rounded-full"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-5 bg-[#FFF6DA] rounded w-32"></div>
                        <div className="h-4 bg-[#FFF6DA] rounded w-24"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredTraders.length > 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="px-5 py-3 sm:px-5 sm:py-4 border-b border-slate-100">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">Showing {activeSortOptionLabel}</p>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {sortOptions.map((option) => {
                        const isActive = sortPeriod === option.value;
                        return (
                          <button
                            key={option.value}
                            onClick={() => setSortPeriod(option.value)}
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
                              isActive
                                ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="hidden sm:grid grid-cols-[70px_minmax(220px,1fr)_120px_120px_140px_120px_200px] items-center px-5 py-3 text-xs font-semibold text-slate-500 border-b border-slate-200">
                  <span className="tracking-[0.08em] text-center">Rank</span>
                  <span className="tracking-[0.08em] text-center">Trader</span>
                  <span className="tracking-[0.08em] text-center">ROI</span>
                  <span className="tracking-[0.08em] text-center">P&amp;L</span>
                  <span className="tracking-[0.08em] text-center">Trend</span>
                  <span className="tracking-[0.08em] text-center">Volume</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {visibleTraders.map((trader, index) => {
                    const isFollowing = followedWallets.has(trader.wallet.toLowerCase());

                    return (
                      <div
                        key={trader.wallet}
                        className="grid grid-cols-[70px_minmax(220px,1fr)_120px_120px_140px_120px_200px] items-center px-4 sm:px-5 py-1.5 sm:py-2 text-sm"
                      >
                        <div className="text-center text-base font-semibold text-slate-400">{index + 1}</div>
                        <Link href={`/trader/${trader.wallet}`} className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-9 w-9 border-2 border-white shadow-sm flex-shrink-0">
                            {trader.profileImage ? (
                              <AvatarImage src={trader.profileImage} alt={trader.displayName} />
                            ) : null}
                            <AvatarFallback className="bg-white text-slate-700 font-semibold text-xs">
                              {getTraderAvatarInitials({ displayName: trader.displayName, wallet: trader.wallet })}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              {formatDisplayName(trader.displayName, trader.wallet)}
                            </p>
                          </div>
                        </Link>
                        <div className={`text-center font-semibold tabular-nums ${trader.roi && trader.roi > 0 ? "text-emerald-600" : trader.roi && trader.roi < 0 ? "text-red-500" : "text-slate-900"}`}>
                          {trader.roi && trader.roi > 0 ? "+" : ""}{trader.roi?.toFixed(1) || 0}%
                        </div>
                        <div className={`text-center font-semibold tabular-nums ${trader.pnl > 0 ? "text-emerald-600" : trader.pnl < 0 ? "text-red-500" : "text-slate-900"}`}>
                          {formatLargeNumber(trader.pnl)}
                        </div>
                          <div className="flex justify-center">
                            <PnlSparkline rows={realizedDailyMap[normalizeWallet(trader.wallet)] ?? []} />
                          </div>
                        <div className="text-center font-semibold tabular-nums text-slate-900">
                          {formatLargeNumber(trader.volume)}
                        </div>
                        <div className="flex justify-end">
                          <button
                            onClick={() => handleFollowChange(trader.wallet, !isFollowing)}
                            className="bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-semibold shadow-sm px-4 h-8 text-xs rounded-full"
                            aria-label={isFollowing ? 'Following' : 'Follow'}
                          >
                            {isFollowing ? (
                              <Check className="h-3.5 w-3.5 mx-auto" aria-hidden />
                            ) : (
                              'Follow'
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {filteredTraders.length > visibleTraders.length && (
                  <>
                    <div className="border-t border-slate-100">
                      <div className="flex justify-center px-4 sm:px-5 py-4">
                        <button
                          onClick={() => {
                            setVisibleCount((prev) => Math.min(prev + 10, filteredTraders.length));
                            setAutoLoadEnabled(true);
                          }}
                          className="h-9 w-28 rounded-md border border-slate-200 bg-white text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:bg-[#FFF6DA]"
                        >
                          View More
                        </button>
                      </div>
                    </div>
                    <div ref={loadMoreRef} className="h-px w-full" />
                  </>
                )}
                {visibleCount > 10 && (
                  <div className="px-4 sm:px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
                    <button
                      onClick={() => setVisibleCount(10)}
                      className="w-full sm:w-auto px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-[#FFF6DA] transition-all"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500">
                <p className="text-lg">No traders found</p>
              </div>
            )}
          </div>
        </div>

        {/* Insights Section */}
        <div className="bg-white">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-8 sm:py-12">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="px-4 py-3 border-b border-slate-100">
                  <h3 className="text-base font-semibold text-slate-900">Most Consistent</h3>
                  <p className="text-xs text-slate-500">Days up in last 30</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {mostConsistentEntries.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-slate-500">No traders yet</div>
                  ) : (
                    mostConsistentEntries.map((entry, index) => {
                      const trader = entry.trader;
                      const daysUp = entry.daysUp;
                      const isFollowing = followedWallets.has(trader.wallet.toLowerCase());

                      return (
                        <div
                          key={trader.wallet}
                          role="button"
                          tabIndex={0}
                          onClick={() => openFollowModal({ wallet: trader.wallet, displayName: trader.displayName })}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              openFollowModal({ wallet: trader.wallet, displayName: trader.displayName });
                            }
                          }}
                          className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition hover:bg-[#FFF6DA]"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="text-sm font-semibold text-slate-400 flex-shrink-0">{index + 1}</span>
                            <div className="min-w-0 flex-1">
                              <Link href={`/trader/${trader.wallet}`}>
                                <p className="text-sm font-semibold text-slate-900 truncate">
                                  {formatDisplayName(trader.displayName, trader.wallet)}
                                </p>
                              </Link>
                            </div>
                          </div>
                          <span className="text-sm font-semibold text-emerald-600 tabular-nums flex-shrink-0">{daysUp}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="px-4 py-3 border-b border-slate-100">
                  <h3 className="text-base font-semibold text-slate-900">Yesterday&apos;s Biggest Winners</h3>
                  <p className="text-xs text-slate-500">By realized gain</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {sortedYesterdayWinners.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-slate-500">No winners yet</div>
                  ) : (
                    sortedYesterdayWinners.map((trader, index) => {
                      const name = trader.displayName || trader.wallet;
                      const pnlColor = trader.pnl > 0 ? 'text-emerald-600' : trader.pnl < 0 ? 'text-rose-500' : 'text-slate-600';
                      return (
                        <div
                          key={trader.wallet}
                          role="button"
                          tabIndex={0}
                          onClick={() => openFollowModal({ wallet: trader.wallet, displayName: trader.displayName })}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              openFollowModal({ wallet: trader.wallet, displayName: trader.displayName });
                            }
                          }}
                          className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition hover:bg-[#FFF6DA]"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="text-sm font-semibold text-slate-400 flex-shrink-0">{index + 1}</span>
                            <div className="min-w-0 flex-1">
                              <Link href={`/trader/${trader.wallet}`}>
                                <p className="text-sm font-semibold text-slate-900 truncate">
                                  {formatDisplayName(name, trader.wallet)}
                                </p>
                              </Link>
                            </div>
                          </div>
                          <span className={`text-sm font-semibold tabular-nums flex-shrink-0 ${pnlColor}`}>
                            {formatLargeNumber(trader.pnl)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="px-4 py-3 border-b border-slate-100">
                  <h3 className="text-base font-semibold text-slate-900">Most Active</h3>
                  <p className="text-xs text-slate-500">Trades in the last 24 hours</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {loadingMostActive ? (
                    <div className="px-4 py-8 text-center">
                      <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-[#FDB022] border-r-transparent"></div>
                      <p className="mt-2 text-xs text-slate-500">Loading activity...</p>
                    </div>
                  ) : mostActiveTraders.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-slate-500">No active traders yet</div>
                  ) : (
                    mostActiveTraders.map((trader, index) => {
                      return (
                        <div
                          key={trader.wallet}
                          role="button"
                          tabIndex={0}
                          onClick={() => openFollowModal({ wallet: trader.wallet, displayName: trader.displayName })}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              openFollowModal({ wallet: trader.wallet, displayName: trader.displayName });
                            }
                          }}
                          className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition hover:bg-[#FFF6DA]"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="text-sm font-semibold text-slate-400 flex-shrink-0">{index + 1}</span>
                            <div className="min-w-0 flex-1">
                              <Link href={`/trader/${trader.wallet}`}>
                                <p className="text-sm font-semibold text-slate-900 truncate">
                                  {formatDisplayName(trader.displayName, trader.wallet)}
                                </p>
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="px-4 py-3 border-b border-slate-100">
                  <h3 className="text-base font-semibold text-slate-900">Most Copied Traders</h3>
                  <p className="text-xs text-slate-500">Ranked by popularity</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {mostCopiedTraders.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-slate-500">No copied traders found</div>
                  ) : (
                    mostCopiedTraders.map((trader, index) => {
                      return (
                        <div
                          key={trader.wallet}
                          role="button"
                          tabIndex={0}
                          onClick={() => openFollowModal({ wallet: trader.wallet, displayName: trader.displayName })}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              openFollowModal({ wallet: trader.wallet, displayName: trader.displayName });
                            }
                          }}
                          className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition hover:bg-[#FFF6DA]"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="text-sm font-semibold text-slate-400 flex-shrink-0">{index + 1}</span>
                            <div className="min-w-0 flex-1">
                              <Link href={`/trader/${trader.wallet}`}>
                                <p className="text-sm font-semibold text-slate-900 truncate">
                                  {formatDisplayName(trader.displayName, trader.wallet)}
                                </p>
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        {followModalTrader && (
          <div 
            className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4 py-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="follow-modal-title"
            aria-describedby="follow-modal-description"
          >
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between">
                <div>
                  <p id="follow-modal-title" className="text-sm font-semibold text-slate-900">
                    Follow {formatDisplayName(followModalTrader.displayName || followModalTrader.wallet, followModalTrader.wallet)}
                  </p>
                  <p id="follow-modal-description" className="text-xs text-slate-500">
                    Confirm to follow the trader and mirror their stats from the discovery tables.
                  </p>
                </div>
                <button
                  onClick={closeFollowModal}
                  className="text-xl font-semibold text-slate-400 transition hover:text-slate-600"
                  aria-label="Close follow modal"
                >
                  ×
                </button>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={closeFollowModal}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-[#FFF6DA]"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmFollowModal}
                  className="rounded-full bg-[#FDB022] px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-[#e6a71a]"
                >
                  Follow
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#FDB022] mx-auto mb-4"></div>
          <p className="text-slate-600 text-lg">Loading...</p>
        </div>
      </div>
    }>
      <DiscoverPageContent />
    </Suspense>
  );
}
