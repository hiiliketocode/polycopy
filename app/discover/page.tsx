'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase, ensureProfile } from '@/lib/supabase';
import { triggerLoggedOut } from '@/lib/auth/logout-events';
import type { User } from '@supabase/supabase-js';
import { Navigation } from '@/components/polycopy/navigation';
import { SignupBanner } from '@/components/polycopy/signup-banner';
import { ChevronDown, Search } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  AreaChart,
  Area,
  ReferenceLine,
  Cell,
} from 'recharts';
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

function formatSignedCurrency(amount: number, decimals = 2) {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(amount));
  if (amount > 0) return `+${formatted}`;
  if (amount < 0) return `-${formatted}`;
  return formatted;
}

function formatCompactCurrency(amount: number) {
  const abs = Math.abs(amount);
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
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
  const [sortMetric, setSortMetric] = useState<"roi" | "pnl" | "volume">("roi");
  const [visibleCount, setVisibleCount] = useState(10);
  const [autoLoadEnabled, setAutoLoadEnabled] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [biggestTrades, setBiggestTrades] = useState<BiggestTrade[]>([]);
  const [loadingBiggestTrades, setLoadingBiggestTrades] = useState(true);
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});
  const priceLastFetchedRef = useRef<Record<string, number>>({});
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
          .eq('trader_wallet', walletLower);

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
  const categoryMap: Record<string, string> = {
    'All': 'OVERALL',
    'Politics': 'POLITICS',
    'Sports': 'SPORTS',
    'Crypto': 'CRYPTO',
    'Pop Culture': 'CULTURE',
    'Business': 'FINANCE',
    'Economics': 'ECONOMICS',
    'Tech': 'TECH',
    'Weather': 'WEATHER'
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
    'Weather'
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
    () => rankedTraders.slice(0, 20).map((trader) => trader.wallet),
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
    for (const trader of rankedTraders) {
      const walletKey = normalizeWallet(trader.wallet);
      const rows = realizedDailyMap[walletKey];
      if (!rows || rows.length === 0) continue;
      const weekly = computeWeeklyRealized(rows);
      if (!weekly) continue;
      entries.push({
        trader,
        weekly,
        diff: weekly.last7 - weekly.prev7,
        pctChange: computePercentChange(weekly),
      });
    }
    return entries
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 6);
  }, [rankedTraders, realizedDailyMap]);

  const selectedTickerTrades = useMemo(
    () => selectTickerTrades(biggestTrades, marketPrices),
    [biggestTrades, marketPrices]
  );

  const tickerLoop = useMemo(() => {
    return selectedTickerTrades.length > 0 ? [...selectedTickerTrades, ...selectedTickerTrades] : [];
  }, [selectedTickerTrades]);

  const mostActiveTraders = useMemo(() => {
    const getCount = (trader: Trader) => {
      const normalizedWallet = normalizeWallet(trader.wallet);
      return tradeCounts[normalizedWallet]?.count ?? trader.totalTrades ?? 0;
    };
    return [...traders]
      .sort((a, b) => getCount(b) - getCount(a))
      .slice(0, 10);
  }, [traders, tradeCounts]);

  const sortedYesterdayWinners = useMemo(() => {
    return [...yesterdayWinners]
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 10);
  }, [yesterdayWinners]);

  useEffect(() => {
    if (mostActiveTraders.length === 0) return;
    let cancelled = false;

    const loadCounts = async () => {
        const entries = await Promise.all(
          mostActiveTraders.map(async (trader) => {
            const normalizedWallet = normalizeWallet(trader.wallet);
            try {
              const response = await fetch(`/api/polymarket/trades-count?wallet=${trader.wallet}&hours=24&limit=200`, {
                cache: 'no-store',
              });
              if (!response.ok) return [normalizedWallet, { count: 0, hasMore: false }] as const;
              const payload = await response.json();
              return [
                normalizedWallet,
                {
                  count: Number(payload?.count) || 0,
                  hasMore: Boolean(payload?.hasMore),
                },
              ] as const;
            } catch {
              return [normalizedWallet, { count: 0, hasMore: false }] as const;
            }
          })
        );

      if (!cancelled) {
        setTradeCounts((prev) => {
          const next = { ...prev };
          for (const [wallet, data] of entries) {
            next[wallet] = data;
          }
          return next;
        });
      }
    };

    loadCounts();

    return () => {
      cancelled = true;
    };
  }, [mostActiveTraders]);

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
      <SignupBanner isLoggedIn={!!user} />
      
      {/* Logo Header for Non-Logged-In Users */}
      {!user && (
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
            <div className="flex items-center justify-center">
              <Image
                src="/logos/polycopy-logo-primary.png"
                alt="Polycopy"
                width={150}
                height={48}
                className="h-10 sm:h-12 w-auto"
              />
            </div>
          </div>
        </div>
      )}
      
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white md:pt-0 pb-20 md:pb-8">
        {/* Search Bar */}
        <div className="bg-gradient-to-b from-slate-50 to-white">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 pb-4 sm:pt-8 sm:pb-6">
            <div className="max-w-2xl mx-auto relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
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
                className="w-full h-12 pl-12 pr-24 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent shadow-sm"
              />
              <button
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-[#FDB022] text-slate-900 rounded-lg hover:bg-[#E69E1A] disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
              >
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center">
              Enter the wallet address from a trader&apos;s Polymarket profile (e.g., 0x1234...5678)
            </p>
          </div>
        </div>

        {/* Trade Ticker */}
        <div className="bg-white border-y border-slate-100">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 mb-2">
              Recent Trades
            </div>
            {!loadingBiggestTrades && tickerLoop.length > 0 ? (
              <div className="relative overflow-hidden rounded-xl border border-slate-200/70 bg-slate-50">
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
                        : 'bg-slate-200 text-slate-600';

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
              <div className="rounded-xl border border-slate-200/70 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                {loadingBiggestTrades ? 'Loading biggest trades...' : 'No recent trades in the last hour.'}
              </div>
            )}
          </div>
        </div>

        {/* Top Traders Section */}
        {followModalTrader && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4 py-6">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Follow {formatDisplayName(followModalTrader.displayName || followModalTrader.wallet, followModalTrader.wallet)}
                  </p>
                  <p className="text-xs text-slate-500">
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
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
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
