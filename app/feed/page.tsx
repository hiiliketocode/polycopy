'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { getOrRefreshSession } from '@/lib/auth/session';
import { resolveFeatureTier, tierHasPremiumAccess, type FeatureTier } from '@/lib/feature-tier';
import { extractMarketAvatarUrl } from '@/lib/marketAvatar';
import { triggerLoggedOut } from '@/lib/auth/logout-events';
import type { User } from '@supabase/supabase-js';
import { Navigation } from '@/components/polycopy/navigation';
import { TradeCard } from '@/components/polycopy/trade-card';
import { TradeExecutionNotifications, type TradeExecutionNotification } from '@/components/polycopy/trade-execution-notifications';
import { ConnectWalletModal } from '@/components/polycopy/connect-wallet-modal';
import { EmptyState } from '@/components/polycopy/empty-state';
import ClosePositionModal from '@/components/orders/ClosePositionModal';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, Activity, Filter, Check, Search, ChevronDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getESPNScoresForTrades, getScoreDisplaySides, getFallbackEspnUrl } from '@/lib/espn/scores';
import { useManualTradingMode } from '@/hooks/use-manual-trading-mode';
import type { PositionSummary } from '@/lib/orders/position';
import type { OrderRow } from '@/lib/orders/types';
import {
  BadgeState,
  MarketCategoryType,
  ResolvedGameTime,
  ScoreValue,
  deriveBadgeState,
  resolveMarketCategoryType,
} from '@/lib/badge-state';
import {
  normalizeEventStatus,
  statusLooksFinal,
  statusLooksLive,
  statusLooksScheduled,
} from '@/lib/market-status';

// Types
export interface FeedTrade {
  id: string;
  trader: {
    wallet: string;
    displayName: string;
  };
  market: {
    id?: string;
    conditionId?: string;
    title: string;
    slug: string;
    eventSlug?: string;
    category?: string;
    avatarUrl?: string;
    tags?: unknown;
    marketCategoryType?: MarketCategoryType;
  };
  trade: {
    side: 'BUY' | 'SELL';
    outcome: string;
    size: number;
    price: number;
    timestamp: number;
    tradeId?: string;
    tokenId?: string;
  };
  fireReasons?: string[];
  fireScore?: number;
  fireWinRate?: number | null;
  fireRoi?: number | null;
  fireConviction?: number | null;
}

type PositionTradeSummary = {
  side: 'BUY' | 'SELL';
  outcome: string;
  size: number | null;
  price: number | null;
  amountUsd: number | null;
  timestamp: number | null;
};

type FetchFeedOptions = {
  userOverride?: User;
  merge?: boolean;
  preserveDisplayCount?: boolean;
  preserveScroll?: boolean;
  silent?: boolean;
};

type Category = "all" | "politics" | "sports" | "crypto" | "culture" | "finance" | "economics" | "tech" | "weather";
type FilterStatus = "all" | "live";
type ResolvingWindow = "any" | "hour" | "today" | "tomorrow" | "week";
type TradingStrategy = "multiple" | "hedging" | "selling";

type FilterState = {
  category: Category;
  status: FilterStatus;
  positionsOnly: boolean;
  tradeSizeMin: number;
  tradingStrategies: TradingStrategy[];
  resolvingWindow: ResolvingWindow;
  priceMinCents: number;
  priceMaxCents: number;
  traderIds: string[];
};

type ScoreSources = {
  gamma?: ScoreValue | null;
  espn?: ScoreValue | null;
  websocket?: ScoreValue | null;
};

type LiveMarketDatum = {
  outcomes?: string[];
  outcomePrices?: number[];
  scores?: ScoreSources;
  scoreText?: string | null;
  gameStartTime?: string | null;
  gammaStartTime?: string | null;
  eventStatus?: string | null;
  resolved?: boolean;
  endDateIso?: string | null;
  completedTime?: string | null;
  liveStatus?: 'live' | 'scheduled' | 'final' | 'unknown';
  liveStatusSource?: 'gamma' | 'espn' | 'websocket' | 'derived' | null;
  espnStatus?: 'scheduled' | 'live' | 'final' | null;
  espnUrl?: string;
  eventSlug?: string;
  marketAvatarUrl?: string;
  tags?: unknown;
  homeTeam?: string | null;
  awayTeam?: string | null;
  gameTimeInfo?: string | null; // e.g., "Q4 5:30" or "Halftime"
  updatedAt?: number;
  marketCategory?: MarketCategoryType;
  websocketLive?: boolean;
  websocketEnded?: boolean;
};

const FILTERS_STORAGE_KEY = 'feed-filters-v1';
const PINNED_TRADES_STORAGE_KEY = 'feed-pins-v1';
const PINNED_TRADE_EXPIRY_MS = 24 * 60 * 60 * 1000;
const getPinnedStorageKey = (userId?: string) =>
  userId ? `${PINNED_TRADES_STORAGE_KEY}-${userId}` : PINNED_TRADES_STORAGE_KEY;

const CATEGORY_OPTIONS = [
  { value: "all" as Category, label: "All" },
  { value: "politics" as Category, label: "Politics" },
  { value: "sports" as Category, label: "Sports" },
  { value: "crypto" as Category, label: "Crypto" },
  { value: "culture" as Category, label: "Pop Culture" },
  { value: "finance" as Category, label: "Business" },
  { value: "economics" as Category, label: "Economics" },
  { value: "tech" as Category, label: "Tech" },
  { value: "weather" as Category, label: "Weather" },
];

const STATUS_OPTIONS = [
  { value: "all" as FilterStatus, label: "All" },
  { value: "live" as FilterStatus, label: "Live Games Only" },
];

const TRADE_SIZE_OPTIONS = [
  { value: 0, label: 'Any size' },
  { value: 100, label: '$100+' },
  { value: 500, label: '$500+' },
  { value: 1000, label: '$1,000+' },
];

const TRADING_STRATEGY_OPTIONS = [
  { value: 'multiple' as TradingStrategy, label: 'Multiple Positions' },
  { value: 'hedging' as TradingStrategy, label: 'Hedgeing' },
  { value: 'selling' as TradingStrategy, label: 'Selling' },
];

const RESOLVING_OPTIONS = [
  { value: 'any' as ResolvingWindow, label: 'Any time' },
  { value: 'hour' as ResolvingWindow, label: 'Next hour' },
  { value: 'today' as ResolvingWindow, label: 'Today' },
  { value: 'tomorrow' as ResolvingWindow, label: 'Tomorrow' },
  { value: 'week' as ResolvingWindow, label: 'This week' },
];

const PRICE_RANGE = { min: 0, max: 100 };
const PRICE_PRESET_OPTIONS = [
  { label: 'Any', min: PRICE_RANGE.min, max: PRICE_RANGE.max },
  { label: '0-25¢', min: 0, max: 25 },
  { label: '25-50¢', min: 25, max: 50 },
  { label: '50-75¢', min: 50, max: 75 },
  { label: '90¢+', min: 90, max: PRICE_RANGE.max },
];

// How often to refresh copied-trade snapshots when the "Your positions" filter is active
const COPIED_TRADES_REFRESH_MS = 20_000;

const defaultFilters: FilterState = {
  category: "all",
  status: "all",
  positionsOnly: false,
  tradeSizeMin: 0,
  tradingStrategies: [],
  resolvingWindow: "any",
  priceMinCents: PRICE_RANGE.min,
  priceMaxCents: PRICE_RANGE.max,
  traderIds: [],
};

type FeedMode = 'all' | 'fire';

type TraderStatsSnapshot = {
  globalWinRate: number | null;
  globalRoiPct?: number | null;
  avgBetSizeUsd: number | null;
  d30_avg_trade_size_usd?: number | null;
  profiles: Array<{
    final_niche?: string | null;
    bet_structure?: string | null;
    price_bracket?: string | null;
    win_rate?: number | null;
    d30_win_rate?: number | null;
    roi_pct?: number | null;
    d30_roi_pct?: number | null;
    d30_count?: number | null;
    trade_count?: number | null;
  }>;
};

const FIRE_TOP_TRADERS_LIMIT = 100;
const FIRE_TRADES_PER_TRADER = 10;
// Updated thresholds based on data analysis:
// - Lowered win rate from 0.65 to 0.55 to capture more quality traders
// - Lowered ROI from 0.25 to 0.15 to show more positive trades
// - Lowered conviction from 5 to 2.5 since avgBetSizeUsd is often missing
// These thresholds balance showing enough trades while maintaining quality
const FIRE_WIN_RATE_THRESHOLD = 0.55;
const FIRE_ROI_THRESHOLD = 0.15;
const FIRE_CONVICTION_MULTIPLIER_THRESHOLD = 2.5;

const LOW_BALANCE_TOOLTIP =
  'Quick trades use your Polymarket USDC balance. Add funds before retrying this order.';
const VISIBLE_REFRESH_INTERVAL_MS = 1000;
const SCROLL_STOP_DEBOUNCE_MS = 200;

const CATEGORY_VALUES = new Set(CATEGORY_OPTIONS.map((option) => option.value));
const STATUS_VALUES = new Set(STATUS_OPTIONS.map((option) => option.value));
const TRADING_STRATEGY_VALUES = new Set(TRADING_STRATEGY_OPTIONS.map((option) => option.value));
const RESOLVING_VALUES = new Set(RESOLVING_OPTIONS.map((option) => option.value));

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const normalizeFilters = (value: Partial<FilterState> | null): FilterState => {
  const fallback = { ...defaultFilters, traderIds: [] };
  if (!value || typeof value !== 'object') return fallback;

  const category = CATEGORY_VALUES.has(value.category as Category)
    ? (value.category as Category)
    : fallback.category;
  const status = STATUS_VALUES.has(value.status as FilterStatus)
    ? (value.status as FilterStatus)
    : fallback.status;
  const positionsOnly =
    typeof value.positionsOnly === 'boolean' ? value.positionsOnly : fallback.positionsOnly;
  const tradeSizeMin =
    typeof value.tradeSizeMin === 'number' && value.tradeSizeMin >= 0
      ? value.tradeSizeMin
      : fallback.tradeSizeMin;
  const rawStrategies = Array.isArray(value.tradingStrategies)
    ? value.tradingStrategies
    : [];
  const tradingStrategies = Array.from(
    new Set(
      rawStrategies
        .map((strategy) => String(strategy).toLowerCase())
        .filter((strategy): strategy is TradingStrategy =>
          TRADING_STRATEGY_VALUES.has(strategy as TradingStrategy)
        )
    )
  );
  const resolvingWindow = RESOLVING_VALUES.has(value.resolvingWindow as ResolvingWindow)
    ? (value.resolvingWindow as ResolvingWindow)
    : fallback.resolvingWindow;
  const minCents =
    typeof value.priceMinCents === 'number'
      ? clampNumber(value.priceMinCents, PRICE_RANGE.min, PRICE_RANGE.max)
      : fallback.priceMinCents;
  const maxCents =
    typeof value.priceMaxCents === 'number'
      ? clampNumber(value.priceMaxCents, PRICE_RANGE.min, PRICE_RANGE.max)
      : fallback.priceMaxCents;
  const normalizedMin = Math.min(minCents, maxCents);
  const normalizedMax = Math.max(minCents, maxCents);
  const traderIds = Array.isArray(value.traderIds)
    ? Array.from(
        new Set(
          value.traderIds
            .map((id) => String(id).toLowerCase())
            .filter(Boolean)
        )
      )
    : [];

  return {
    category,
    status,
    positionsOnly,
    tradeSizeMin,
    tradingStrategies,
    resolvingWindow,
    priceMinCents: normalizedMin,
    priceMaxCents: normalizedMax,
    traderIds,
  };
};

const normalizeKeyPart = (value?: string | null) => value?.trim().toLowerCase() || '';
const toNumber = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const normalizeIdPart = (value?: string | number | null) => {
  if (value === null || value === undefined) return '';
  const normalized = normalizeKeyPart(String(value));
  if (!normalized) return '';
  return normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
};
const buildFeedTradeId = ({
  wallet,
  tradeId,
  timestamp,
  side,
  outcome,
  size,
  price,
  marketId,
}: {
  wallet?: string;
  tradeId?: string | number | null;
  timestamp?: number | null;
  side?: string;
  outcome?: string;
  size?: number | null;
  price?: number | null;
  marketId?: string | null;
}) => {
  const walletPart = normalizeIdPart(wallet) || 'unknown';
  const tradeIdPart = normalizeIdPart(tradeId);
  if (tradeIdPart) {
    return `${walletPart}-${tradeIdPart}`;
  }
  const sizePart = Number.isFinite(size ?? NaN) ? Number(size).toFixed(6) : size;
  const pricePart = Number.isFinite(price ?? NaN) ? Number(price).toFixed(6) : price;
  const fallbackParts = [
    walletPart,
    normalizeIdPart(marketId),
    normalizeIdPart(timestamp),
    normalizeIdPart(side),
    normalizeIdPart(outcome),
    normalizeIdPart(sizePart),
    normalizeIdPart(pricePart),
  ].filter(Boolean);
  return fallbackParts.join('-') || `trade-${Date.now()}`;
};
const buildCopiedTradeKey = (marketKey?: string | null, traderWallet?: string | null) => {
  const market = normalizeKeyPart(marketKey);
  const wallet = normalizeKeyPart(traderWallet);
  if (!market || !wallet) return '';
  return `${market}-${wallet}`;
};
const getMarketKeyForTrade = (trade: FeedTrade) =>
  normalizeKeyPart(
    trade.market.conditionId ||
      trade.market.slug ||
      trade.market.title ||
      trade.market.id ||
      null
  );
const getMarketKeyVariantsForTrade = (trade: FeedTrade) => {
  const keys = [
    trade.market.conditionId,
    trade.market.slug,
    trade.market.title,
    trade.market.id,
  ]
    .map(normalizeKeyPart)
    .filter(Boolean);
  return Array.from(new Set(keys));
};
const buildPinnedTradeKey = (trade: FeedTrade) => {
  const market = normalizeKeyPart(getMarketKeyForTrade(trade));
  const wallet = normalizeKeyPart(trade.trader.wallet);
  const outcome = normalizeKeyPart(trade.trade.outcome);
  const tradeId = normalizeKeyPart(trade.trade.tradeId) || String(trade.trade.timestamp);
  if (!market || !wallet || !tradeId) return '';
  return `${market}-${wallet}-${outcome}-${tradeId}`;
};

const normalizeScoreValue = (value: unknown): ScoreValue | null => {
  if (!value) return null;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const homeRaw = record.home ?? record.homeScore ?? record.home_score;
    const awayRaw = record.away ?? record.awayScore ?? record.away_score;
    const home = Number.isFinite(Number(homeRaw)) ? Number(homeRaw) : null;
    const away = Number.isFinite(Number(awayRaw)) ? Number(awayRaw) : null;
    if (home !== null || away !== null) return { home, away };
  }
  if (typeof value === 'string') {
    const match = value.match(/(\d+)\s*-\s*(\d+)/);
    if (match) {
      const home = Number(match[1]);
      const away = Number(match[2]);
      if (Number.isFinite(home) || Number.isFinite(away)) {
        return { home: Number.isFinite(home) ? home : null, away: Number.isFinite(away) ? away : null };
      }
    }
  }
  return null;
};

const mergeScores = (existing?: ScoreSources, incoming?: ScoreSources): ScoreSources => ({
  gamma: incoming?.gamma ?? existing?.gamma,
  espn: incoming?.espn ?? existing?.espn,
  websocket: incoming?.websocket ?? existing?.websocket,
});

const logBadgeEvent = (event: string, payload: Record<string, unknown>) => {
  console.log(`[badge:${event}]`, payload);
};

type EspnScore = Awaited<ReturnType<typeof getESPNScoresForTrades>> extends Map<string, infer V>
  ? V
  : never;

const buildEspnScoreDisplay = (trade: FeedTrade, espnScore: EspnScore) => {
  const scoreValue: ScoreValue = {
    home: Number.isFinite(espnScore.homeScore) ? Number(espnScore.homeScore) : null,
    away: Number.isFinite(espnScore.awayScore) ? Number(espnScore.awayScore) : null,
  };
  const { team1Label, team1Score, team2Label, team2Score } = getScoreDisplaySides(
    trade.market.title,
    espnScore
  );

  if (espnScore.status === 'final') {
    return {
      scoreDisplay: `${team1Label} ${team1Score} - ${team2Score} ${team2Label}`,
      espnStatus: espnScore.status,
      scoreValue,
      gameTimeInfo: null,
    };
  }

  if (espnScore.status === 'live') {
    let periodContext = '';
    if (espnScore.displayClock) {
      const sportType = trade.market.category || '';
      let period = espnScore.period || 1;
      if (period === 0) period = 1;

      if (
        sportType.includes('basketball') ||
        trade.market.title.match(
          /(lakers|celtics|warriors|heat|bucks|nuggets|suns|thunder|mavericks|clippers|76ers|nets|knicks)/i
        )
      ) {
        if (period <= 4) {
          periodContext = `Q${period} `;
        } else {
          periodContext = `OT${period - 4} `;
        }
      } else if (
        sportType.includes('football') ||
        trade.market.title.match(
          /(chiefs|raiders|patriots|cowboys|packers|broncos|chargers|dolphins|bills|jets|ravens|49ers|eagles|steelers)/i
        )
      ) {
        if (period <= 4) {
          periodContext = `Q${period} `;
        } else {
          periodContext = `OT `;
        }
      } else if (
        sportType.includes('hockey') ||
        trade.market.title.match(
          /(bruins|canadiens|rangers|penguins|oilers|flames|maple leafs|lightning|avalanche)/i
        )
      ) {
        if (period <= 3) {
          periodContext = `P${period} `;
        } else {
          periodContext = `OT `;
        }
      } else if (
        sportType.includes('baseball') ||
        trade.market.title.match(
          /(yankees|dodgers|red sox|astros|cubs|mets|braves|padres|giants|cardinals)/i
        )
      ) {
        periodContext = `I${period} `;
      } else if (period > 0) {
        periodContext = `Q${period} `;
      }
    }

    let clock = '';
    let gameTimeInfo: string | null = null;
    if (espnScore.displayClock) {
      clock = ` (${periodContext}${espnScore.displayClock})`;
      gameTimeInfo = `${periodContext}${espnScore.displayClock}`.trim();
    } else if (espnScore.statusDetail && !/\d+\s*-\s*\d+/.test(espnScore.statusDetail)) {
      clock = ` (${espnScore.statusDetail})`;
      gameTimeInfo = espnScore.statusDetail;
    }
    return {
      scoreDisplay: `${team1Label} ${team1Score} - ${team2Score} ${team2Label}${clock}`,
      espnStatus: espnScore.status,
      scoreValue,
      gameTimeInfo,
    };
  }

  return { scoreDisplay: undefined, espnStatus: espnScore.status, scoreValue, gameTimeInfo: null };
};

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

function normalizeOutcomeValue(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

const normalizeWinRateValue = (raw: unknown): number | null => {
  if (raw === null || raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (value > 1.01) return value / 100;
  if (value < 0) return null;
  return value;
};

const deriveCategoryFromTrade = (trade: any): string | undefined => {
  const candidates = [
    trade.category,
    trade.market_category,
    trade.marketCategory,
    trade.market?.category,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().toLowerCase();
    }
  }
  return undefined;
};

const convictionMultiplierForTrade = (
  trade: any,
  stats?: TraderStatsSnapshot | null
): number | null => {
  const size = Number(trade.size ?? trade.amount ?? 0);
  const price = Number(trade.price ?? 0);
  if (!Number.isFinite(size) || !Number.isFinite(price)) return null;
  const tradeValue = size * price;
  
  // Prefer 30-day average (more recent, less inflated)
  // Fallback to lifetime average
  const avgBetSize = stats?.d30_avg_trade_size_usd ?? stats?.avgBetSizeUsd ?? null;
  
  if (!avgBetSize || !Number.isFinite(avgBetSize) || avgBetSize <= 0) return null;
  
  // Safety cap: don't let average be more than 5x current trade
  // This prevents inflated averages from making conviction appear artificially low
  const MAX_REASONABLE_MULTIPLIER = 5.0;
  const cappedAvgBetSize = avgBetSize > tradeValue * MAX_REASONABLE_MULTIPLIER
    ? tradeValue * MAX_REASONABLE_MULTIPLIER
    : avgBetSize;
  
  return tradeValue / cappedAvgBetSize;
};

const winRateForTradeType = (
  stats: TraderStatsSnapshot | undefined,
  category?: string
): number | null => {
  if (!stats) return null;
  const normalizedCategory = category?.toLowerCase() ?? '';

  if (stats.profiles && stats.profiles.length > 0 && normalizedCategory) {
    const matchingProfile = stats.profiles.find((profile) => {
      const niche = (profile.final_niche || '').toLowerCase();
      if (!niche) return false;
      if (niche === normalizedCategory) return true;
      return niche.includes(normalizedCategory);
    });

    const profileWinRate =
      normalizeWinRateValue(matchingProfile?.d30_win_rate) ??
      normalizeWinRateValue(matchingProfile?.win_rate);
    if (profileWinRate !== null) {
      return profileWinRate;
    }
  }

  const globalWinRate = normalizeWinRateValue(stats.globalWinRate);
  return globalWinRate;
};

const roiForTradeType = (
  stats: TraderStatsSnapshot | undefined,
  category?: string
): number | null => {
  if (!stats) return null;
  const normalizedCategory = category?.toLowerCase() ?? '';
  if (stats.profiles && stats.profiles.length > 0 && normalizedCategory) {
    const match = stats.profiles.find((profile) => {
      const niche = (profile.final_niche || '').toLowerCase();
      if (!niche) return false;
      if (niche === normalizedCategory) return true;
      return niche.includes(normalizedCategory);
    });
    const roi =
      match?.d30_roi_pct ??
      match?.roi_pct ??
      null;
    if (roi !== null && roi !== undefined && Number.isFinite(Number(roi))) {
      return Number(roi);
    }
  }
  if (stats.globalRoiPct !== null && stats.globalRoiPct !== undefined && Number.isFinite(Number(stats.globalRoiPct))) {
    return Number(stats.globalRoiPct);
  }
  return null;
};

export default function FeedPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userTier, setUserTier] = useState<FeatureTier>('anon');
  const [isPremium, setIsPremium] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [showConnectWalletModal, setShowConnectWalletModal] = useState(false);
  const [defaultBuySlippage, setDefaultBuySlippage] = useState(3);
  const [defaultSellSlippage, setDefaultSellSlippage] = useState(3);
  const [feedMode, setFeedMode] = useState<FeedMode>(() => {
    const path = typeof pathname === 'string' ? pathname : '';
    return path.includes('/fire-feed') ? 'fire' : 'all';
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(defaultFilters);
  const [draftFilters, setDraftFilters] = useState<FilterState>(defaultFilters);
  const [traderSearch, setTraderSearch] = useState('');
  const [showAllTraders, setShowAllTraders] = useState(false);
  const filtersPanelRef = useRef<HTMLDivElement | null>(null);
  const feedListRef = useRef<HTMLDivElement | null>(null);
  
  // Data state
  const [allTrades, setAllTrades] = useState<FeedTrade[]>([]);
  const allTradesRef = useRef<FeedTrade[]>([]);
  const [displayedTradesCount, setDisplayedTradesCount] = useState(35);
  const [followingCount, setFollowingCount] = useState(0);
  const [fireTraderCount, setFireTraderCount] = useState(0);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [initialFeedCheckComplete, setInitialFeedCheckComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFeedFetchAt, setLastFeedFetchAt] = useState<number | null>(null);
  const [latestTradeTimestamp, setLatestTradeTimestamp] = useState<number | null>(null);
  const initialFeedCheckCompleteRef = useRef(false);
  const markInitialFeedCheckComplete = useCallback(() => {
    if (initialFeedCheckCompleteRef.current) return;
    initialFeedCheckCompleteRef.current = true;
    setInitialFeedCheckComplete(true);
  }, []);

  // Stats
  const [todayVolume, setTodayVolume] = useState(0);
  const [todaysTradeCount, setTodaysTradeCount] = useState(0);
  
  // Copied trades state
  const [copiedTradeIds, setCopiedTradeIds] = useState<Set<string>>(new Set());
  const [userPositionTradesByMarket, setUserPositionTradesByMarket] = useState<
    Map<string, PositionTradeSummary[]>
  >(new Map());
  const [loadingCopiedTrades, setLoadingCopiedTrades] = useState(false);
  const [pinnedTradeIds, setPinnedTradeIds] = useState<Set<string>>(new Set());
  const [positions, setPositions] = useState<PositionSummary[]>([]);
  const [closeTarget, setCloseTarget] = useState<{
    order: OrderRow;
    position: PositionSummary;
  } | null>(null);
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeOrderId, setCloseOrderId] = useState<string | null>(null);
  const [closeSubmittedAt, setCloseSubmittedAt] = useState<string | null>(null);
  const [showSellToast, setShowSellToast] = useState(false);
  const [sellToastMessage, setSellToastMessage] = useState('');
  const { manualModeEnabled, enableManualMode } = useManualTradingMode(
    isPremium,
    Boolean(walletAddress)
  );
  const [isDocumentVisible, setIsDocumentVisible] = useState(true);
  const [isWindowFocused, setIsWindowFocused] = useState(true);
  
  // Live market data (prices, scores, and game metadata)
  const [liveMarketData, setLiveMarketData] = useState<Map<string, LiveMarketDatum>>(new Map());

  const [expandedTradeIds, setExpandedTradeIds] = useState<Set<string>>(new Set());
  
  // Manual refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tradeNotifications, setTradeNotifications] = useState<TradeExecutionNotification[]>([]);
  const [portfolioValue, setPortfolioValue] = useState<number | null>(null);
  const [cashBalance, setCashBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const hasPremiumAccess = tierHasPremiumAccess(userTier);
  const canExecuteTrades = hasPremiumAccess && Boolean(walletAddress);
  const showLowBalanceCallout =
    hasPremiumAccess &&
    Boolean(walletAddress) &&
    !loadingBalance &&
    typeof cashBalance === 'number' &&
    cashBalance < 1;
  const sellToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingFeedRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const espnCacheUpdatedRef = useRef(new Set<string>());
  const badgeStateCacheRef = useRef<Map<string, BadgeState>>(new Map());
  const gameTimeCacheRef = useRef<Map<string, ResolvedGameTime>>(new Map());
  const missingTimeLoggedRef = useRef<Set<string>>(new Set());
  const fireStatsCacheRef = useRef<Map<string, TraderStatsSnapshot>>(new Map());
  const attemptedModesRef = useRef<Set<FeedMode>>(new Set());
  const fetchedModesRef = useRef<Set<FeedMode>>(new Set());

  const triggerSellToast = useCallback((message: string) => {
    setSellToastMessage(message);
    setShowSellToast(true);
    if (sellToastTimerRef.current) {
      clearTimeout(sellToastTimerRef.current);
    }
    sellToastTimerRef.current = setTimeout(() => setShowSellToast(false), 4000);
  }, []);

  // Toggle back-to-top visibility after user scrolls down a bit
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 400);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    allTradesRef.current = allTrades;
  }, [allTrades]);

  useEffect(() => {
    loadingFeedRef.current = loadingFeed;
  }, [loadingFeed]);

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  const traderFilters = useMemo(() => {
    const map = new Map<string, string>();
    allTrades.forEach((trade) => {
      const wallet = trade.trader.wallet?.toLowerCase();
      if (!wallet) return;
      if (!map.has(wallet)) {
        map.set(wallet, trade.trader.displayName);
      }
    });
    return Array.from(map.entries())
      .map(([wallet, name]) => ({ wallet, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allTrades]);

  const traderMarketTrades = useMemo(() => {
    const map = new Map<string, PositionTradeSummary[]>();
    allTrades.forEach((trade) => {
      const marketKey = getMarketKeyForTrade(trade);
      const wallet = normalizeKeyPart(trade.trader.wallet);
      if (!marketKey || !wallet) return;
      const key = `${wallet}-${marketKey}`;
      const list = map.get(key) ?? [];
      const size = toNumber(trade.trade.size);
      const price = toNumber(trade.trade.price);
      const amountUsd =
        size !== null && price !== null ? Number((size * price).toFixed(4)) : null;
      list.push({
        side: trade.trade.side,
        outcome: trade.trade.outcome,
        size,
        price,
        amountUsd,
        timestamp: toNumber(trade.trade.timestamp),
      });
      map.set(key, list);
    });
    map.forEach((trades) => {
      trades.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    });
    return map;
  }, [allTrades]);

  const captureScrollAnchor = useCallback(() => {
    if (typeof window === 'undefined' || window.scrollY < 80) return null;
    const container = feedListRef.current;
    if (!container) return null;
    const items = Array.from(container.querySelectorAll<HTMLElement>('[data-trade-id]'));
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      if (rect.bottom > 0) {
        const tradeId = item.dataset.tradeId || '';
        if (!tradeId) return null;
        return { tradeId, top: rect.top };
      }
    }
    return null;
  }, []);

  const restoreScrollAnchor = useCallback((anchor: { tradeId: string; top: number } | null) => {
    if (!anchor || typeof window === 'undefined') return;
    requestAnimationFrame(() => {
      const container = feedListRef.current;
      if (!container) return;
      const escaped =
        typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
          ? CSS.escape(anchor.tradeId)
          : anchor.tradeId.replace(/"/g, '\\"');
      const target = container.querySelector<HTMLElement>(`[data-trade-id="${escaped}"]`);
      if (!target) return;
      const nextTop = target.getBoundingClientRect().top;
      const delta = nextTop - anchor.top;
      if (Math.abs(delta) < 1) return;
      window.scrollBy({ top: delta, behavior: 'auto' });
    });
  }, []);

  const traderLabelMap = useMemo(
    () => new Map(traderFilters.map((trader) => [trader.wallet, trader.name])),
    [traderFilters]
  );

  const filteredTraderOptions = useMemo(() => {
    const query = traderSearch.trim().toLowerCase();
    if (!query) return traderFilters;
    return traderFilters.filter((trader) =>
      trader.name.toLowerCase().includes(query) || trader.wallet.includes(query)
    );
  }, [traderFilters, traderSearch]);

  const visibleTraderOptions = useMemo(
    () => (showAllTraders ? filteredTraderOptions : filteredTraderOptions.slice(0, 8)),
    [filteredTraderOptions, showAllTraders]
  );

  const appliedTraderSet = useMemo(
    () => new Set(appliedFilters.traderIds),
    [appliedFilters.traderIds]
  );

  const draftTraderSet = useMemo(
    () => new Set(draftFilters.traderIds),
    [draftFilters.traderIds]
  );

  const countActiveFilters = useCallback((filters: FilterState) => {
    let count = 0;
    if (filters.category !== 'all') count += 1;
    if (filters.status !== 'all') count += 1;
    if (filters.positionsOnly) count += 1;
    if (filters.tradeSizeMin > 0) count += 1;
    if (filters.traderIds.length > 0) count += 1;
    if (filters.tradingStrategies.length > 0) count += 1;
    if (filters.resolvingWindow !== 'any') count += 1;
    if (filters.priceMinCents > PRICE_RANGE.min || filters.priceMaxCents < PRICE_RANGE.max) count += 1;
    return count;
  }, []);

  const activeFiltersCount = useMemo(
    () => countActiveFilters(appliedFilters),
    [appliedFilters, countActiveFilters]
  );
  const hasDraftFilters = useMemo(
    () => countActiveFilters(draftFilters) > 0,
    [draftFilters, countActiveFilters]
  );
  const sourceTraderCount = feedMode === 'fire' ? fireTraderCount : followingCount;

  const formatPriceCents = (value: number) => `${value}¢`;
  const formatTradeSize = (value: number) => `$${value.toLocaleString('en-US')}+`;
  const formatWallet = (wallet: string) =>
    wallet.length > 10 ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : wallet;
  const filterTabBase = "rounded-full px-2.5 py-1 text-[11px] font-medium transition-all whitespace-nowrap";
  const filterTabActive = "bg-slate-900 text-white shadow-sm";
  const filterTabInactive = "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50";
  const modeTabBase = "rounded-full px-3 py-1.5 text-sm font-semibold transition border";
  const modeTabActive = "bg-slate-900 text-white border-slate-900 shadow-sm";
  const modeTabInactive = "bg-white text-slate-700 border-slate-200 hover:bg-slate-50";
  const togglePillBase =
    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition";
  const togglePillActive = "border-emerald-200 bg-emerald-50 text-emerald-700";
  const togglePillInactive = "border-slate-200 bg-white text-slate-600 hover:border-slate-300";
  const categoryPillBase = "rounded-full px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap";
  const categoryPillActive = "bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-900 shadow-sm";
  const categoryPillInactive = "bg-slate-100 text-slate-700 hover:bg-slate-200";

  const buildDefaultFilters = useCallback(
    () => ({ ...defaultFilters, traderIds: [] }),
    []
  );

  const updateAppliedFilters = useCallback(
    (updater: (previous: FilterState) => FilterState) => {
      setAppliedFilters((previous) => {
        const next = updater(previous);
        if (!filtersOpen) {
          setDraftFilters(next);
        }
        return next;
      });
    },
    [filtersOpen]
  );

  const openFilters = useCallback(() => {
    setDraftFilters(appliedFilters);
    setTraderSearch('');
    setShowAllTraders(false);
    setShowMoreFilters(false);
    setFiltersOpen(true);
  }, [appliedFilters]);

  const closeFilters = useCallback(() => {
    setDraftFilters(appliedFilters);
    setShowMoreFilters(false);
    setFiltersOpen(false);
  }, [appliedFilters]);

  const clearDraftFilters = useCallback(() => {
    setDraftFilters(buildDefaultFilters());
  }, [buildDefaultFilters]);

  const toggleDraftTrader = useCallback((wallet: string) => {
    setDraftFilters((prev) => {
      const next = new Set(prev.traderIds);
      if (next.has(wallet)) {
        next.delete(wallet);
      } else {
        next.add(wallet);
      }
      return { ...prev, traderIds: Array.from(next) };
    });
  }, []);

  const updateDraftPriceRange = useCallback((minCents: number, maxCents: number) => {
    const normalizedMin = clampNumber(Math.min(minCents, maxCents), PRICE_RANGE.min, PRICE_RANGE.max);
    const normalizedMax = clampNumber(Math.max(minCents, maxCents), PRICE_RANGE.min, PRICE_RANGE.max);
    setDraftFilters((prev) => ({
      ...prev,
      priceMinCents: normalizedMin,
      priceMaxCents: normalizedMax,
    }));
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(FILTERS_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<FilterState>;
      const nextFilters = normalizeFilters(parsed);
      setAppliedFilters(nextFilters);
      setDraftFilters(nextFilters);
    } catch {
      // Ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(appliedFilters));
    } catch {
      // Ignore storage errors
    }
  }, [appliedFilters]);

  useEffect(() => {
    if (!user) return;
    try {
      const stored = localStorage.getItem(getPinnedStorageKey(user.id));
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return;
      setPinnedTradeIds(new Set(parsed.map((value) => String(value)).filter(Boolean)));
    } catch {
      // Ignore storage errors
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    try {
      localStorage.setItem(
        getPinnedStorageKey(user.id),
        JSON.stringify(Array.from(pinnedTradeIds))
      );
    } catch {
      // Ignore storage errors
    }
  }, [pinnedTradeIds, user]);

  useEffect(() => {
    if (!filtersOpen) {
      setDraftFilters(appliedFilters);
    }
  }, [appliedFilters, filtersOpen]);

  useEffect(() => {
    if (!filtersOpen) return;
    updateAppliedFilters(() => draftFilters);
  }, [draftFilters, filtersOpen, updateAppliedFilters]);

  useEffect(() => {
    if (!filtersOpen) return;
    filtersPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [filtersOpen]);

  useEffect(() => {
    if (!filtersOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeFilters();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeFilters, filtersOpen]);

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

  const resolveCategoryForTrade = useCallback(
    (trade: FeedTrade, liveData?: LiveMarketDatum) => {
      const marketKey =
        getMarketKeyForTrade(trade) || trade.market.id || trade.market.slug || trade.market.title;
      return (
        liveData?.marketCategory ??
        trade.market.marketCategoryType ??
        resolveMarketCategoryType({
          marketKey,
          title: trade.market.title,
          category: trade.market.category,
          tags: liveData?.tags ?? trade.market.tags,
          outcomes: liveData?.outcomes,
          gameStartTime: liveData?.gameStartTime ?? liveData?.gammaStartTime,
        })
      );
    },
    []
  );

  const deriveBadgeStateForTrade = useCallback(
    (trade: FeedTrade): BadgeState => {
      const marketKey =
        getMarketKeyForTrade(trade) || trade.market.id || trade.market.slug || trade.market.title;
      const liveData = marketKey ? liveMarketData.get(marketKey) : undefined;
      const categoryType = resolveCategoryForTrade(trade, liveData);
      const previousState = marketKey ? badgeStateCacheRef.current.get(marketKey) ?? null : null;
      const cachedGameTime = marketKey ? gameTimeCacheRef.current.get(marketKey) ?? null : null;

      const badgeResult = deriveBadgeState({
        marketKey,
        title: trade.market.title,
        category: trade.market.category,
        tags: liveData?.tags ?? trade.market.tags,
        outcomes: liveData?.outcomes,
        categoryType,
        gammaStartTime: liveData?.gammaStartTime ?? liveData?.gameStartTime,
        marketStartTime: liveData?.gameStartTime,
        endDateIso: liveData?.endDateIso,
        completedTime: liveData?.completedTime,
        gammaStatus: liveData?.eventStatus,
        gammaResolved: liveData?.resolved,
        websocketLive: liveData?.websocketLive,
        websocketEnded: liveData?.websocketEnded,
        scoreSources: liveData?.scores,
        previousState,
        cachedGameTime,
        now: Date.now(),
      });

      if (marketKey) {
        badgeStateCacheRef.current.set(marketKey, badgeResult.state);
        gameTimeCacheRef.current.set(marketKey, badgeResult.resolvedGameTime);

        if (!previousState) {
          logBadgeEvent('badge_state_initial', {
            market_id: marketKey,
            title: trade.market.title,
            category: categoryType,
            source: badgeResult.state.source,
            state: badgeResult.state.type,
          });
        } else if (badgeResult.upgraded) {
          logBadgeEvent('badge_state_upgrade', {
            market_id: marketKey,
            title: trade.market.title,
            category: categoryType,
            from: previousState.type,
            to: badgeResult.state.type,
            source: badgeResult.state.source,
          });
        } else if (badgeResult.illegalDowngrade) {
          logBadgeEvent('illegal_state_attempt', {
            market_id: marketKey,
            title: trade.market.title,
            category: categoryType,
            attempted: badgeResult.state.type,
            kept: previousState?.type,
            source: badgeResult.state.source,
          });
        }

        if (badgeResult.timeMissing && !missingTimeLoggedRef.current.has(marketKey)) {
          missingTimeLoggedRef.current.add(marketKey);
          logBadgeEvent('time_missing', {
            market_id: marketKey,
            title: trade.market.title,
            category: categoryType,
            source: badgeResult.resolvedGameTime.source,
          });
        }
      }

      return badgeResult.state;
    },
    [liveMarketData, resolveCategoryForTrade]
  );

  const isLiveMarket = useCallback(
    (trade: FeedTrade) => {
      const badgeState = deriveBadgeStateForTrade(trade);
      return badgeState.type === 'live';
    },
    [deriveBadgeStateForTrade]
  );

  const matchesResolvingWindow = useCallback(
    (trade: FeedTrade) => {
      const { resolvingWindow } = appliedFilters;
      if (resolvingWindow === 'any') return true;
      const marketKey = getMarketKeyForTrade(trade);
      const liveData = marketKey ? liveMarketData.get(marketKey) : undefined;
      if (!liveData?.endDateIso || liveData.resolved) return false;
      const endTime = new Date(liveData.endDateIso);
      if (Number.isNaN(endTime.getTime())) return false;
      const now = new Date();
      if (endTime.getTime() < now.getTime()) return false;

      if (resolvingWindow === 'hour') {
        return endTime.getTime() <= now.getTime() + 60 * 60 * 1000;
      }

      const endOfToday = new Date(now);
      endOfToday.setHours(23, 59, 59, 999);

      if (resolvingWindow === 'today') {
        return endTime.getTime() <= endOfToday.getTime();
      }

      const startOfTomorrow = new Date(now);
      startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
      startOfTomorrow.setHours(0, 0, 0, 0);
      const endOfTomorrow = new Date(startOfTomorrow);
      endOfTomorrow.setHours(23, 59, 59, 999);

      if (resolvingWindow === 'tomorrow') {
        return endTime.getTime() >= startOfTomorrow.getTime() && endTime.getTime() <= endOfTomorrow.getTime();
      }

      const endOfWeek = new Date(now);
      const day = endOfWeek.getDay();
      const daysUntilEnd = (7 - day) % 7;
      endOfWeek.setDate(endOfWeek.getDate() + daysUntilEnd);
      endOfWeek.setHours(23, 59, 59, 999);

      return endTime.getTime() <= endOfWeek.getTime();
    },
    [appliedFilters.resolvingWindow, liveMarketData]
  );

  const getCurrentOutcomePrice = useCallback(
    (trade: FeedTrade) => {
      const marketKey = getMarketKeyForTrade(trade);
      const liveData = marketKey ? liveMarketData.get(marketKey) : undefined;
      if (!liveData?.outcomes || !liveData?.outcomePrices) return undefined;
      const outcomeIndex = liveData.outcomes.findIndex(
        (o: string) => o.toUpperCase() === trade.trade.outcome.toUpperCase()
      );
      if (outcomeIndex === -1 || outcomeIndex >= liveData.outcomePrices.length) return undefined;
      return liveData.outcomePrices[outcomeIndex];
    },
    [liveMarketData]
  );

  const getResolvedTimestamp = useCallback(
    (trade: FeedTrade) => {
      const marketKey = getMarketKeyForTrade(trade);
      const liveData = marketKey ? liveMarketData.get(marketKey) : undefined;
      if (!liveData) return null;
      const normalizedStatus = normalizeEventStatus(liveData.eventStatus);
      const isResolved =
        typeof liveData.resolved === 'boolean'
          ? liveData.resolved
          : liveData.liveStatus === 'final' || statusLooksFinal(normalizedStatus);
      if (!isResolved) return null;
      if (liveData.endDateIso) {
        const parsed = Date.parse(liveData.endDateIso);
        if (!Number.isNaN(parsed)) return parsed;
      }
      if (typeof liveData.updatedAt === 'number') return liveData.updatedAt;
      return null;
    },
    [liveMarketData]
  );

  const togglePinnedTrade = useCallback((trade: FeedTrade) => {
    const key = buildPinnedTradeKey(trade);
    if (!key) return;
    setPinnedTradeIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const refreshPositions = useCallback(async (): Promise<PositionSummary[] | null> => {
    try {
      const response = await fetch('/api/polymarket/positions', { cache: 'no-store' });
      if (!response.ok) return null;
      const data = await response.json();
      const nextPositions = data.positions || [];
      setPositions(nextPositions);
      return nextPositions;
    } catch (err) {
      console.error('Error refreshing positions:', err);
      return null;
    }
  }, []);

  const findPositionMatch = useCallback(
    (positionsList: PositionSummary[], trade: FeedTrade): PositionSummary | null => {
      const marketId = trade.market.conditionId || trade.market.id || null;
      const normalizedMarketId = marketId?.trim().toLowerCase();
      if (!normalizedMarketId) return null;
      const candidates = positionsList.filter(
        (pos) => pos.marketId?.trim().toLowerCase() === normalizedMarketId
      );
      if (candidates.length === 0) return null;
      const normalizedOutcome = normalizeOutcomeValue(trade.trade.outcome);
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
    async (trade: FeedTrade): Promise<PositionSummary | null> => {
      const cached = findPositionMatch(positions, trade);
      if (cached) return cached;
      const fresh = await refreshPositions();
      if (!fresh) return null;
      return findPositionMatch(fresh, trade);
    },
    [findPositionMatch, positions, refreshPositions]
  );

  const buildSyntheticOrder = useCallback(
    (
      trade: FeedTrade,
      position: PositionSummary,
      marketAvatarUrl?: string | null
    ): OrderRow => {
      const marketKey = getMarketKeyForTrade(trade);
      const liveData = marketKey ? liveMarketData.get(marketKey) : undefined;
      const currentPrice = getCurrentOutcomePrice(trade) ?? trade.trade.price ?? null;
      const marketId = trade.market.conditionId || trade.market.id || position.marketId || '';
      const marketTitle = trade.market.title || 'Market';
      const marketSlug = trade.market.slug || null;
      const marketImageUrl =
        marketAvatarUrl ??
        liveData?.marketAvatarUrl ??
        trade.market.avatarUrl ??
        null;
      const outcome = trade.trade.outcome || position.outcome || null;
      const side = position.side ?? 'BUY';
      const activity = side === 'SELL' ? 'sold' : 'bought';
      const activityLabel = side === 'SELL' ? 'Sold' : 'Bought';
      const createdAt = Number.isFinite(trade.trade.timestamp)
        ? new Date(trade.trade.timestamp).toISOString()
        : new Date().toISOString();
      const entryPrice = position.avgEntryPrice ?? trade.trade.price ?? null;
      const hasCurrentPrice =
        typeof currentPrice === 'number' && Number.isFinite(currentPrice);
      const marketIsOpen =
        typeof liveData?.resolved === 'boolean'
          ? !liveData.resolved
          : hasCurrentPrice
            ? currentPrice > 0.01 && currentPrice < 0.99
            : null;

      return {
        orderId: `feed-${trade.id}`,
        status: 'filled',
        activity,
        activityLabel,
        activityIcon: activity,
        marketId: marketId || '',
        marketTitle,
        marketImageUrl,
        marketIsOpen,
        marketResolved: liveData?.resolved ?? null,
        marketSlug,
        traderId: trade.trader.wallet || 'unknown',
        traderWallet: trade.trader.wallet ?? null,
        traderName: trade.trader.displayName || 'Trader',
        traderAvatarUrl: null,
        copiedTraderId: null,
        copiedTraderWallet: trade.trader.wallet ?? null,
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
    [getCurrentOutcomePrice, liveMarketData]
  );

  const handleConfirmClose = useCallback(
    async ({
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
      if (!closeTarget) {
        setCloseError('No position selected to close');
        return;
      }

      const positionSide = closeTarget.position.side;
      const sideForClose: 'BUY' | 'SELL' = positionSide === 'SELL' ? 'BUY' : 'SELL';

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
          side: sideForClose,
          orderType,
          confirm: true,
          isClosingFullPosition,
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
        } catch {
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
        setCloseOrderId(data?.orderId ?? null);
        setCloseSubmittedAt(data?.submittedAt ?? null);
        await refreshPositions();
        triggerSellToast(`Sell order placed (${slippagePercent.toFixed(1)}% slippage).`);
      } catch (err: any) {
        console.error('Close position error:', err);
        setCloseError(err?.message || 'Failed to close position');
      } finally {
        setCloseSubmitting(false);
      }
    },
    [closeTarget, refreshPositions, triggerSellToast]
  );

  const handleSellTrade = useCallback(
    async (trade: FeedTrade, marketAvatarUrl?: string | null) => {
      if (!canExecuteTrades) {
        setShowConnectWalletModal(true);
        triggerSellToast('Connect your Polymarket wallet to sell positions.');
        return;
      }

      const position = await resolvePositionForTrade(trade);
      if (!position) {
        triggerSellToast('Unable to locate an open position to sell. Please refresh and try again.');
        return;
      }

      const order = buildSyntheticOrder(trade, position, marketAvatarUrl);
      setCloseTarget({ order, position });
      setCloseError(null);
      setCloseOrderId(null);
      setCloseSubmittedAt(null);
    },
    [
      buildSyntheticOrder,
      canExecuteTrades,
      resolvePositionForTrade,
      triggerSellToast,
    ]
  );

  // Auth check
  useEffect(() => {
    let isMounted = true;
    const checkAuth = async () => {
      setLoading(true);
      
      // Check if we're coming from auth callback - give cookies time to be set
      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const isFromAuthCallback = urlParams?.has('_auth_callback');
      
      if (isFromAuthCallback && urlParams) {
        // Remove the query param from URL
        urlParams.delete('_auth_callback');
        const newUrl = window.location.pathname + (urlParams.toString() ? `?${urlParams.toString()}` : '');
        window.history.replaceState({}, '', newUrl);
        // Wait a bit for cookies to be available
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Timeout safeguard - ensure loading is cleared after 10 seconds
      const timeoutId = setTimeout(() => {
        if (isMounted) {
          console.warn('Auth check timeout - clearing loading state');
          setLoading(false);
        }
      }, 10000);
      
      try {
        const { session } = await getOrRefreshSession();
        
        if (!isMounted) return;
        
        // Validate session is actually valid
        if (!session?.user) {
          // Don't redirect if we're already on login page or in auth callback
          const currentPath = window.location.pathname;
          if (currentPath !== '/login' && !currentPath.startsWith('/auth/')) {
            triggerLoggedOut('session_missing');
            // Clear loading immediately before redirect
            setLoading(false);
            router.push('/login');
          } else {
            setLoading(false);
          }
          return;
        }

        // Only check expiration if we have an expires_at value
        // Some sessions might not have this set
        if (session.expires_at && session.expires_at * 1000 < Date.now() - 60000) {
          // Session expired (with 1 minute buffer)
          const currentPath = window.location.pathname;
          if (currentPath !== '/login' && !currentPath.startsWith('/auth/')) {
            triggerLoggedOut('session_missing');
            setLoading(false);
            router.push('/login');
          } else {
            setLoading(false);
          }
          return;
        }
        
        setUser(session.user);
      } catch (err) {
        if (!isMounted) return;
        console.error('Auth error:', err);
        const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
        if (currentPath !== '/login' && !currentPath.startsWith('/auth/')) {
          triggerLoggedOut('auth_error');
          // Clear loading immediately before redirect
          setLoading(false);
          router.push('/login');
        } else {
          setLoading(false);
        }
      } finally {
        if (isMounted) {
          clearTimeout(timeoutId);
          setLoading(false);
        }
      }
    };
    
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      if (!session?.user) {
        const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
        if (currentPath !== '/login' && !currentPath.startsWith('/auth/')) {
          triggerLoggedOut('signed_out');
          router.push('/login');
        }
      }
      // Don't update user state on every auth change to prevent unnecessary re-renders
      // The user state is already set above and will persist
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

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
    const hasStructuredDetails = (payload: any) => {
      if (!payload || typeof payload !== 'object') return Boolean(payload);
      return Object.values(payload).some((value) => {
        if (typeof value === 'string') {
          return value.trim().length > 0;
        }
        return Boolean(value);
      });
    };

    const applySlippageDefaults = (prefs?: { default_buy_slippage?: any; default_sell_slippage?: any }) => {
      if (!isMounted) return;
      const normalize = (value: any) => {
        const numericValue = typeof value === 'string' ? parseFloat(value) : value;
        return Number.isFinite(numericValue) ? Number(numericValue) : 3;
      };
      setDefaultBuySlippage(normalize(prefs?.default_buy_slippage));
      setDefaultSellSlippage(normalize(prefs?.default_sell_slippage));
    };

    const isEmptyPostgrestError = (err: any) => {
      if (!err || typeof err !== 'object') return false;
      return Object.values(err).every((value) => {
        if (value === null || value === undefined) return true;
        if (typeof value === 'string') return value.trim().length === 0;
        return false;
      });
    };

    const fetchSlippageDefaults = async () => {
      try {
        const apiResponse = await fetch(`/api/notification-preferences?userId=${user.id}`);
        if (apiResponse.ok) {
          const prefs = await apiResponse.json();
          applySlippageDefaults(prefs);
          return;
        }
      } catch (apiError) {
        if (isMeaningfulError(apiError)) {
          const payload = formatSupabaseError(apiError);
          if (hasStructuredDetails(payload)) {
            console.error('Error fetching slippage preferences via API:', payload);
          }
        }
      }

      try {
        const { data, error, status } = await supabase
          .from('notification_preferences')
          .select('default_buy_slippage, default_sell_slippage')
          .eq('user_id', user.id)
          .maybeSingle();

        const missingPreferences =
          (!data && !error) ||
          error?.code === 'PGRST116' ||
          status === 406 ||
          isEmptyPostgrestError(error);

        if (missingPreferences) {
          applySlippageDefaults();
          return;
        }

        if (isMeaningfulError(error)) {
          const payload = formatSupabaseError(error);
          if (hasStructuredDetails(payload)) {
            console.error('Error fetching slippage preferences:', payload);
          }
        }

        if (data) {
          applySlippageDefaults(data);
        }
      } catch (err) {
        if (isMeaningfulError(err)) {
          const payload = formatSupabaseError(err);
          if (hasStructuredDetails(payload)) {
            console.error('Error fetching slippage preferences:', payload);
          }
        }
      }
    };

    fetchSlippageDefaults();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const fetchCopiedTrades = useCallback(async () => {
    if (!user) {
      setCopiedTradeIds(new Set());
      setUserPositionTradesByMarket(new Map());
      return;
    }

    setLoadingCopiedTrades(true);
    try {
      const apiResponse = await fetch(`/api/copied-trades?userId=${user.id}`);
      if (apiResponse.ok) {
        const payload = await apiResponse.json();
        const copiedIds = new Set<string>();
        const userMarketTrades = new Map<string, PositionTradeSummary[]>();
        payload?.trades?.forEach(
          (t: {
            market_id?: string;
            market_slug?: string;
            market_title?: string;
            trader_wallet?: string;
            outcome?: string;
            price_when_copied?: number | string | null;
            amount_invested?: number | string | null;
            entry_size?: number | string | null;
            copied_at?: string | null;
            user_closed_at?: string | null;
            market_resolved?: boolean | null;
            side?: string | null;
          }) => {
            const walletKey = normalizeKeyPart(t.trader_wallet);
            if (walletKey) {
              const marketKeys = [t.market_id, t.market_slug, t.market_title]
                .map(normalizeKeyPart)
                .filter(Boolean);
              if (marketKeys.length > 0) {
                for (const key of new Set(marketKeys)) {
                  copiedIds.add(`${key}-${walletKey}`);
                }
              }
            }

            const isOpen = !t.user_closed_at && !t.market_resolved;
            if (!isOpen) return;

            const marketKeys = [t.market_id, t.market_slug, t.market_title]
              .map(normalizeKeyPart)
              .filter(Boolean);
            if (marketKeys.length === 0) return;

            const price = toNumber(t.price_when_copied);
            const entrySize = toNumber(t.entry_size);
            const amountUsd = toNumber(t.amount_invested);
            const size =
              entrySize !== null
                ? entrySize
                : amountUsd !== null && price !== null && price > 0
                  ? Number((amountUsd / price).toFixed(4))
                  : null;
            const timestamp = t.copied_at ? new Date(t.copied_at).getTime() : null;
            const safeTimestamp = Number.isFinite(timestamp ?? NaN) ? timestamp : null;
            const side =
              String(t.side || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
            const tradeSummary: PositionTradeSummary = {
              side,
              outcome: t.outcome || '',
              size,
              price,
              amountUsd:
                amountUsd !== null
                  ? amountUsd
                  : size !== null && price !== null
                    ? Number((size * price).toFixed(4))
                    : null,
              timestamp: safeTimestamp,
            };

            for (const key of new Set(marketKeys)) {
              const list = userMarketTrades.get(key) ?? [];
              list.push(tradeSummary);
              userMarketTrades.set(key, list);
            }
          }
        );
        userMarketTrades.forEach((trades) => {
          trades.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
        });
        setCopiedTradeIds(copiedIds);
        setUserPositionTradesByMarket(userMarketTrades);
        return;
      }

      console.warn('Falling back to direct Supabase query for copied trades');
      const { data: trades, error } = await supabase
        .from('orders')
        .select('market_id, copied_trader_wallet, market_slug, copied_market_title')
        .eq('copy_user_id', user.id);

      if (error) {
        console.error('Error fetching copied trades:', error);
      } else {
        const copiedIds = new Set<string>();
        trades?.forEach((t: { market_id?: string; copied_trader_wallet?: string; market_slug?: string; copied_market_title?: string }) => {
          const walletKey = normalizeKeyPart(t.copied_trader_wallet);
          if (!walletKey) return;
          const marketKeys = [t.market_id, t.market_slug, t.copied_market_title]
            .map(normalizeKeyPart)
            .filter(Boolean);
          if (marketKeys.length === 0) return;
          for (const key of new Set(marketKeys)) {
            copiedIds.add(`${key}-${walletKey}`);
          }
        });
        setCopiedTradeIds(copiedIds);
        setUserPositionTradesByMarket(new Map());
      }
    } catch (err) {
      console.error('Error fetching copied trades:', err);
      setUserPositionTradesByMarket(new Map());
    } finally {
      setLoadingCopiedTrades(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCopiedTrades();
  }, [fetchCopiedTrades]);

  // Keep the "Your positions" filter in sync with fresh copied trades
  useEffect(() => {
    if (!user || !appliedFilters.positionsOnly) return;

    let cancelled = false;

    const refresh = async () => {
      if (cancelled) return;
      try {
        await fetchCopiedTrades();
      } catch (err) {
        console.warn('Failed to refresh copied trades for positions-only filter:', err);
      }
    };

    // Refresh immediately when the filter is active, then poll
    refresh();
    const intervalId = window.setInterval(refresh, COPIED_TRADES_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [appliedFilters.positionsOnly, fetchCopiedTrades, user]);

  // When we get a live trade execution update, refresh positions so filters/badges stay current
  useEffect(() => {
    if (tradeNotifications.length === 0) return;
    fetchCopiedTrades();
  }, [fetchCopiedTrades, tradeNotifications]);

  useEffect(() => {
    if (!hasPremiumAccess || !walletAddress || !user) {
      setPortfolioValue(null);
      setCashBalance(null);
      setLoadingBalance(false);
      return;
    }

    let mounted = true;

    const fetchBalance = async () => {
      setLoadingBalance(true);
      try {
        if (!walletAddress?.trim()) return;
        const response = await fetch(`/api/polymarket/wallet/${walletAddress}`);
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        if (!mounted) return;
        setCashBalance(data.cashBalance || 0);
        setPortfolioValue(data.portfolioValue || 0);
      } catch {
        // Non-blocking: balance is optional on the feed header.
      } finally {
        if (mounted) {
          setLoadingBalance(false);
        }
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [hasPremiumAccess, walletAddress, user]);

  // Fetch feature tier and wallet
  useEffect(() => {
    if (!user) {
      setUserTier('anon');
      setIsPremium(false);
      setWalletAddress(null);
      setProfileImageUrl(null);
      return;
    }

    setUserTier('registered');

    let cancelled = false;

    const fetchProfileAndWallet = async () => {
      try {
        const [profileRes, walletRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('is_premium, is_admin, profile_image_url')
            .eq('id', user.id)
            .single(),
          supabase
            .from('turnkey_wallets')
            .select('polymarket_account_address, eoa_address')
            .eq('user_id', user.id)
            .maybeSingle()
        ]);

        if (profileRes.error) {
          console.error('Error fetching profile:', profileRes.error);
          if (!cancelled) {
            setUserTier(resolveFeatureTier(true, null));
            setIsPremium(false);
            setProfileImageUrl(null);
          }
          return;
        }

        if (!cancelled) {
          setUserTier(resolveFeatureTier(true, profileRes.data));
          setIsPremium(profileRes.data?.is_premium || false);
          setProfileImageUrl(profileRes.data?.profile_image_url || null);
          setWalletAddress(
            walletRes.data?.polymarket_account_address || 
            walletRes.data?.eoa_address || 
            null
          );
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
        if (!cancelled) {
          setUserTier('registered');
          setIsPremium(false);
          setWalletAddress(null);
          setProfileImageUrl(null);
        }
      }
    };

    fetchProfileAndWallet();

    return () => {
      cancelled = true;
    };
  }, [user]);

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

  const normalizeTeamAbbrev = (value?: string | null) => {
    if (!value) return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^[A-Z]{2,4}$/.test(trimmed)) return trimmed;
    if (trimmed.length <= 4) return trimmed.toUpperCase();
    return '';
  };

  const pickOutcomeTeams = (outcomes?: string[] | null) => {
    if (!outcomes || outcomes.length === 0) return [];
    const filtered = outcomes.filter(outcome => !/^(draw|tie)$/i.test(outcome.trim()));
    if (filtered.length >= 2) return filtered.slice(0, 2);
    return outcomes.slice(0, 2);
  };

  const resolveLiveStatus = (payload: {
    eventStatus?: string | null;
    resolved?: boolean;
    websocketLive?: boolean;
    websocketEnded?: boolean;
  }) => {
    const normalized = normalizeEventStatus(payload.eventStatus);
    if (payload.resolved || statusLooksFinal(normalized) || payload.websocketEnded) return 'final';
    if (payload.websocketLive && !statusLooksScheduled(normalized)) return 'live';
    if (statusLooksScheduled(normalized)) return 'scheduled';
    return 'scheduled';
  };

  // Fetch live market data (prices, scores, and game metadata)
  const fetchLiveMarketData = useCallback(async (trades: FeedTrade[]) => {
    const newLiveData = new Map<string, LiveMarketDatum>();
    
    // Group trades by market key to avoid duplicate API calls
    const tradeByMarketKey = new Map<string, FeedTrade>();
    trades.forEach((trade) => {
      const marketKey = getMarketKeyForTrade(trade);
      if (!marketKey || tradeByMarketKey.has(marketKey)) return;
      tradeByMarketKey.set(marketKey, trade);
    });
    
    console.log(`📊 Fetching live data for ${tradeByMarketKey.size} markets`);

    // Fetch prices for each market
    await Promise.all(
      Array.from(tradeByMarketKey.entries()).map(async ([marketKey, trade]) => {
        if (!marketKey) return;
      try {
        const params = new URLSearchParams();
        if (trade.market.conditionId) params.set('conditionId', trade.market.conditionId);
        if (trade.market.slug) params.set('slug', trade.market.slug);
        if (trade.market.title) params.set('title', trade.market.title);

          // Fetch current price from Polymarket API
          const priceResponse = await fetch(`/api/polymarket/price?${params.toString()}`);
          if (priceResponse.ok) {
            const priceData = await priceResponse.json();
            
            if (priceData.success && priceData.market) {
              if (trade) {
                  const { 
                  outcomes, 
                  outcomePrices, 
                  gameStartTime, 
                  eventStatus,
                  score: liveScore,
                  homeTeam,
                  awayTeam,
                  closed,
                  resolved,
                  endDateIso,
                  marketAvatarUrl,
                  espnUrl: cachedEspnUrl,
                  eventSlug: resolvedEventSlug,
                  tags,
                  cryptoSymbol,
                  cryptoPriceUsd,
                } = priceData.market;
                const isCryptoMarket = Boolean(cryptoSymbol);
                const startHintForCategory = isCryptoMarket ? null : gameStartTime ?? null;
                const resolvedCategoryType = resolveMarketCategoryType({
                  marketKey,
                  title: trade.market.title,
                  category: trade.market.category,
                  tags: tags ?? trade.market.tags,
                  outcomes: outcomes ?? null,
                  gameStartTime: startHintForCategory,
                });

                const normalizedEventStatus = normalizeEventStatus(eventStatus);
                
                console.log(`✅ Got data for ${trade.market.title.slice(0, 40)}... | Status: ${eventStatus} | Score:`, liveScore);
                
                // Convert string prices to numbers
                const numericPrices = outcomePrices?.map((p: string | number) => Number(p)) || [];
                
                // Detect sports markets by checking for "vs." or "vs" in title, or common sports patterns
                  const isScoreableSports = resolvedCategoryType === 'SPORTS_SCOREABLE';
                  const isNonSports = resolvedCategoryType === 'NON_SPORTS';

                  let scoreDisplay: string | undefined;
                  let espnStatus: 'scheduled' | 'live' | 'final' | null = null;
                  const effectiveGameStartTime = gameStartTime ?? null;
                  
                  // Debug: Log if gameStartTime is missing for sports markets
                  if (resolvedCategoryType === 'NON_SPORTS' && (tags && Array.isArray(tags) && tags.some((t: any) => 
                    typeof t === 'string' && ['Sports', 'NFL', 'NBA', 'MLB', 'NHL', 'Soccer', 'Serie A'].some(sport => 
                      t.toLowerCase().includes(sport.toLowerCase())
                    )
                  ))) {
                    console.warn('[Feed] Sports market detected but gameStartTime is missing:', {
                      title: trade.market.title,
                      conditionId: trade.market.conditionId,
                      gameStartTime,
                      tags,
                    });
                  }
                  
                  const gammaScore = normalizeScoreValue(liveScore);

                  if (isScoreableSports) {
                    if (liveScore && typeof liveScore === 'object') {
                      const homeScoreRaw = (liveScore as any).home ?? (liveScore as any).homeScore ?? (liveScore as any).home_score ?? 0;
                      const awayScoreRaw = (liveScore as any).away ?? (liveScore as any).awayScore ?? (liveScore as any).away_score ?? 0;
                      const homeScore = Number.isFinite(Number(homeScoreRaw)) ? Number(homeScoreRaw) : 0;
                      const awayScore = Number.isFinite(Number(awayScoreRaw)) ? Number(awayScoreRaw) : 0;
                      const fallbackTeams = pickOutcomeTeams(outcomes);
                      const homeTeamName = typeof homeTeam === 'string' ? homeTeam : fallbackTeams[0] || '';
                      const awayTeamName = typeof awayTeam === 'string' ? awayTeam : fallbackTeams[1] || '';
                      const derivedScore = {
                        gameId: trade.market.conditionId ?? trade.market.id ?? trade.market.slug ?? '',
                        homeScore,
                        awayScore,
                        homeTeamName,
                        awayTeamName,
                        homeTeamAbbrev: normalizeTeamAbbrev(homeTeamName),
                        awayTeamAbbrev: normalizeTeamAbbrev(awayTeamName),
                        status: 'live' as const,
                        startTime: effectiveGameStartTime || '',
                        displayClock: undefined,
                        period: undefined,
                      };
                      const { team1Label, team1Score, team2Label, team2Score } = getScoreDisplaySides(
                        trade.market.title,
                        derivedScore
                      );
                      scoreDisplay = `${team1Label} ${team1Score} - ${team2Score} ${team2Label}`;
                      console.log(`🏀 Polymarket score: ${scoreDisplay}`);
                    } else if (typeof liveScore === 'string' && liveScore.trim()) {
                      scoreDisplay = liveScore.trim();
                      console.log(`🏀 Polymarket score string: ${scoreDisplay}`);
                    }
                  } else if (isNonSports && cryptoSymbol && typeof cryptoPriceUsd === 'number') {
                    const formatter = new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: 'USD',
                      maximumFractionDigits: 2,
                    });
                    scoreDisplay = `${cryptoSymbol} ${formatter.format(cryptoPriceUsd)}`;
                    console.log(`💱 Crypto market: ${scoreDisplay}`);
                  } else if (isNonSports && outcomes?.length === 2) {
                    const prob1 = (Number(outcomePrices[0]) * 100).toFixed(0);
                    const prob2 = (Number(outcomePrices[1]) * 100).toFixed(0);
                    scoreDisplay = `${outcomes[0]}: ${prob1}% | ${outcomes[1]}: ${prob2}%`;
                    console.log(`📊 Binary market: ${scoreDisplay}`);
                  }
                  
                  const priceSamples = numericPrices.filter(Number.isFinite);
                  const maxPrice = priceSamples.length > 0 ? Math.max(...priceSamples) : null;
                  const minPrice = priceSamples.length > 0 ? Math.min(...priceSamples) : null;
                  
                  // Market is resolved ONLY if:
                  // 1. API explicitly says it's resolved, OR
                  // 2. Market is closed AND prices are at extremes (>=99.5%/<=0.5%)
                  // This prevents false positives from heavy favorites (e.g., 99%/1% markets that are still live)
                  const isMarketResolved =
                    typeof resolved === 'boolean' && resolved === true
                      ? true
                      : closed === true && maxPrice !== null && minPrice !== null && maxPrice >= 0.995 && minPrice <= 0.005;

                  console.log(
                    `🔒 Market resolved status for ${trade.market.title.slice(0, 40)}... | closed=${closed} | apiResolved=${resolved} | max=${maxPrice} | min=${minPrice} | resolved=${isMarketResolved}`
                  );
                  
                  // Determine live status for use in websocket flags
                  const liveStatus = resolveLiveStatus({
                    eventStatus,
                    resolved: isMarketResolved,
                    websocketLive: false,
                    websocketEnded: false,
                  });
                  const websocketLiveFlag =
                    resolvedCategoryType === 'SPORTS_SCOREABLE' &&
                    (statusLooksLive(normalizedEventStatus) || liveStatus === 'live');
                  const websocketEndedFlag =
                    resolvedCategoryType === 'SPORTS_SCOREABLE' &&
                    (statusLooksFinal(normalizedEventStatus) || resolved === true || liveStatus === 'final');


                  const fallbackEspnUrl =
                    !cachedEspnUrl &&
                    resolvedCategoryType === 'SPORTS_SCOREABLE' &&
                    (effectiveGameStartTime || endDateIso)
                      ? getFallbackEspnUrl({
                          title: trade.market.title,
                          category: trade.market.category,
                          slug: trade.market.slug,
                          eventSlug: resolvedEventSlug || trade.market.eventSlug,
                          tags,
                          dateHint: effectiveGameStartTime || endDateIso || undefined,
                        })
                      : undefined;
                  
                  // Extract game time info from eventStatus if available (e.g., "Q4 5:30", "Halftime")
                  let extractedGameTimeInfo: string | null = null;
                  if (eventStatus && typeof eventStatus === 'string') {
                    // Try to extract period/clock info from status (e.g., "Q4 5:30", "Halftime", "2nd Half")
                    const statusLower = eventStatus.toLowerCase();
                    // Check for common patterns
                    if (statusLower.includes('halftime') || statusLower.includes('half time')) {
                      extractedGameTimeInfo = 'Halftime';
                    } else if (statusLower.includes('quarter') || statusLower.match(/q[1-4]/i)) {
                      const quarterMatch = eventStatus.match(/q([1-4])/i);
                      const timeMatch = eventStatus.match(/(\d+:\d+)/);
                      if (quarterMatch && timeMatch) {
                        extractedGameTimeInfo = `Q${quarterMatch[1]} ${timeMatch[1]}`;
                      } else if (quarterMatch) {
                        extractedGameTimeInfo = `Q${quarterMatch[1]}`;
                      }
                    } else if (statusLower.includes('period') || statusLower.match(/p[1-3]/i)) {
                      const periodMatch = eventStatus.match(/p([1-3])/i);
                      const timeMatch = eventStatus.match(/(\d+:\d+)/);
                      if (periodMatch && timeMatch) {
                        extractedGameTimeInfo = `P${periodMatch[1]} ${timeMatch[1]}`;
                      } else if (periodMatch) {
                        extractedGameTimeInfo = `P${periodMatch[1]}`;
                      }
                    } else if (statusLower.includes('inning') || statusLower.match(/i[1-9]/i)) {
                      const inningMatch = eventStatus.match(/i([1-9]\d*)/i);
                      if (inningMatch) {
                        extractedGameTimeInfo = `I${inningMatch[1]}`;
                      }
                    }
                  }
                  
                  newLiveData.set(marketKey, { 
                    outcomes: outcomes || [],
                    outcomePrices: numericPrices,
                    scores: mergeScores(undefined, { gamma: gammaScore }),
                    scoreText: scoreDisplay ?? (typeof liveScore === 'string' ? liveScore.trim() : null),
                    gameStartTime: effectiveGameStartTime || undefined,
                    gammaStartTime: gameStartTime || undefined,
                    eventStatus: eventStatus || undefined,
                    resolved: isMarketResolved,
                    endDateIso: endDateIso || undefined,
                    completedTime: (priceData.market as any)?.completedTime || undefined,
                    liveStatus,
                    liveStatusSource: liveStatus === 'final' ? 'gamma' : 'gamma',
                    espnStatus,
                    // ESPN URL is injected later once the ESPN fetch completes
                    espnUrl: cachedEspnUrl || fallbackEspnUrl || undefined,
                    eventSlug: resolvedEventSlug || trade.market.eventSlug || undefined,
                    marketAvatarUrl: marketAvatarUrl || trade.market.avatarUrl,
                    tags: tags ?? trade.market.tags,
                    homeTeam: typeof homeTeam === 'string' ? homeTeam : null,
                    awayTeam: typeof awayTeam === 'string' ? awayTeam : null,
                    gameTimeInfo: extractedGameTimeInfo || undefined,
                    updatedAt: Date.now(),
                    marketCategory: resolvedCategoryType,
                    websocketLive: websocketLiveFlag,
                    websocketEnded: websocketEndedFlag,
                  });
                }
            }
          } else {
            console.warn(`❌ Price API failed for ${trade.market.title}: ${priceResponse.status}`);
          }
        } catch (error) {
          console.warn(`Failed to fetch live data for ${trade.market.title}:`, error);
        }
      })
    );
    
    console.log(`💾 Stored live data for ${newLiveData.size} markets`);
    setLiveMarketData((prev) => {
      const merged = new Map(prev);
      newLiveData.forEach((value, key) => {
        const existing = merged.get(key);
        const mergedScores = mergeScores(existing?.scores, value.scores);
        const shouldPreserveLiveStatus =
          (existing?.liveStatus === 'live' || existing?.liveStatus === 'final') &&
          (value.liveStatus === 'scheduled' ||
            value.liveStatus === 'unknown' ||
            !value.liveStatus);
        merged.set(key, {
          ...existing,
          ...value,
          scores: mergedScores,
          scoreText: value.scoreText ?? existing?.scoreText ?? null,
          liveStatus: shouldPreserveLiveStatus
            ? existing?.liveStatus
            : value.liveStatus ?? existing?.liveStatus ?? 'scheduled',
          liveStatusSource: value.liveStatusSource ?? existing?.liveStatusSource ?? null,
          gameStartTime: existing?.gameStartTime ?? value.gameStartTime,
          gammaStartTime: existing?.gammaStartTime ?? value.gammaStartTime,
          eventStatus: value.eventStatus ?? existing?.eventStatus,
          resolved: value.resolved ?? existing?.resolved,
          endDateIso: value.endDateIso ?? existing?.endDateIso,
          espnUrl: value.espnUrl || existing?.espnUrl,
          espnStatus: value.espnStatus ?? existing?.espnStatus ?? null,
          eventSlug: value.eventSlug || existing?.eventSlug,
          marketAvatarUrl: value.marketAvatarUrl || existing?.marketAvatarUrl,
          tags: value.tags ?? existing?.tags,
          homeTeam: value.homeTeam ?? existing?.homeTeam,
          awayTeam: value.awayTeam ?? existing?.awayTeam,
          marketCategory: value.marketCategory ?? existing?.marketCategory,
        });
      });
      return merged;
    });

    const dateHintsByMarketKey: Record<string, string | number | null | undefined> = {};
    tradeByMarketKey.forEach((trade, marketKey) => {
      const liveData = newLiveData.get(marketKey);
      if (liveData?.marketCategory !== 'SPORTS_SCOREABLE') return;
      const fallbackDate = liveData?.endDateIso || liveData?.gameStartTime;
      const espnKey = trade.market.conditionId || trade.market.id || trade.market.title;
      if (espnKey && fallbackDate) {
        dateHintsByMarketKey[espnKey] = fallbackDate;
      }
    });

    const teamHintsByMarketKey: Record<string, { homeTeam?: string; awayTeam?: string }> = {};
    tradeByMarketKey.forEach((trade, marketKey) => {
      const liveData = newLiveData.get(marketKey);
      if (liveData?.marketCategory !== 'SPORTS_SCOREABLE') return;
      const espnKey = trade.market.conditionId || trade.market.id || trade.market.title;
      const homeTeamName = liveData?.homeTeam?.trim();
      const awayTeamName = liveData?.awayTeam?.trim();
      if (espnKey && (homeTeamName || awayTeamName)) {
        teamHintsByMarketKey[espnKey] = {
          homeTeam: homeTeamName || undefined,
          awayTeam: awayTeamName || undefined,
        };
      }
    });

    const dateHints = Array.from(newLiveData.values())
      .filter((value) => value.marketCategory === 'SPORTS_SCOREABLE')
      .flatMap((value) => [value.gameStartTime, value.endDateIso])
      .filter(
        (value): value is string =>
          typeof value === 'string' && value !== ''
      );

    const espnEligibleTrades = trades.filter((trade) => {
      const marketKey = getMarketKeyForTrade(trade);
      const liveData = marketKey ? newLiveData.get(marketKey) : undefined;
      if (liveData?.marketCategory !== 'SPORTS_SCOREABLE') return false;
      const dateHint = liveData?.gameStartTime || liveData?.endDateIso;
      return Boolean(dateHint);
    });

    console.log(`🏈 Fetching sports scores for ${espnEligibleTrades.length} sports markets...`);
    const espnTrades = espnEligibleTrades.map((trade) => {
      const marketKey = getMarketKeyForTrade(trade);
      const liveData = marketKey ? newLiveData.get(marketKey) : undefined;
      const resolvedEventSlug = liveData?.eventSlug || trade.market.eventSlug;
      const resolvedTags = liveData?.tags ?? trade.market.tags;
      const shouldUpdate =
        (resolvedEventSlug && resolvedEventSlug !== trade.market.eventSlug) ||
        (resolvedTags !== undefined && resolvedTags !== trade.market.tags);
      if (!shouldUpdate) return trade;
      return {
        ...trade,
        market: {
          ...trade.market,
          eventSlug: resolvedEventSlug || trade.market.eventSlug,
          tags: resolvedTags ?? trade.market.tags,
        },
      };
    });

    if (espnTrades.length === 0) return;

    let espnScores: Map<string, any> = new Map();
    try {
      espnScores = await getESPNScoresForTrades(espnTrades, {
        dateHints,
        dateHintsByMarketKey,
        teamHintsByMarketKey,
      });
    } catch (error) {
      console.warn('Failed to fetch ESPN scores:', error);
      espnScores = new Map();
    }
    console.log(`✅ Got sports scores for ${espnScores.size} markets`);
    if (espnScores.size === 0) return;

    setLiveMarketData((prev) => {
      const merged = new Map(prev);
      espnEligibleTrades.forEach((trade) => {
        const marketKey = getMarketKeyForTrade(trade);
        if (!marketKey) return;
        const liveData = merged.get(marketKey);
        if (!liveData || liveData.marketCategory !== 'SPORTS_SCOREABLE') return;
        const espnScoreKey = trade.market.conditionId || trade.market.id || trade.market.title;
        const espnScore = espnScoreKey ? espnScores.get(espnScoreKey) : undefined;
        if (!espnScore) return;

        const { scoreDisplay, espnStatus, scoreValue, gameTimeInfo } = buildEspnScoreDisplay(trade, espnScore);
        const fallbackEspnUrl = getFallbackEspnUrl({
          title: trade.market.title,
          category: trade.market.category,
          slug: trade.market.slug,
          eventSlug: trade.market.eventSlug,
          tags: trade.market.tags ?? liveData.tags,
          dateHint: espnScore.startTime || liveData.gameStartTime || liveData.endDateIso || undefined,
        });
        const resolvedGameStartTime = liveData.gameStartTime ?? espnScore.startTime ?? null;

        merged.set(marketKey, {
          ...liveData,
          scores: mergeScores(liveData.scores, { espn: scoreValue }),
          scoreText: scoreDisplay ?? liveData.scoreText ?? null,
          liveStatus: liveData.liveStatus,
          liveStatusSource: liveData.liveStatusSource ?? 'gamma',
          gameStartTime: resolvedGameStartTime ?? undefined,
          espnUrl: espnScore.gameUrl || liveData.espnUrl || fallbackEspnUrl,
          homeTeam: liveData.homeTeam ?? espnScore.homeTeamName ?? null,
          awayTeam: liveData.awayTeam ?? espnScore.awayTeamName ?? null,
          // Prioritize ESPN gameTimeInfo (most accurate), fallback to existing or extracted
          gameTimeInfo: gameTimeInfo ?? liveData.gameTimeInfo ?? null,
          espnStatus,
          updatedAt: Date.now(),
        });

        const cacheKey = trade.market.conditionId || null;
        if (
          cacheKey &&
          espnScore.gameUrl &&
          !espnCacheUpdatedRef.current.has(cacheKey)
        ) {
          espnCacheUpdatedRef.current.add(cacheKey);
          fetch('/api/markets/espn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conditionId: cacheKey,
              espnUrl: espnScore.gameUrl,
              espnGameId: espnScore.gameId,
            }),
          }).catch(() => undefined);
        }
      });
      return merged;
    });
  }, []);

  const processTrades = useCallback(
    async ({
      rawTrades,
      traderNames,
      merge = false,
      preserveDisplayCount = false,
      preserveScroll = false,
      scrollAnchor = null,
      mode = 'all',
    }: {
      rawTrades: any[];
      traderNames: Record<string, string>;
      merge?: boolean;
      preserveDisplayCount?: boolean;
      preserveScroll?: boolean;
      scrollAnchor?: ReturnType<typeof captureScrollAnchor> | null;
      mode?: FeedMode;
    }) => {
      if (!rawTrades || rawTrades.length === 0) {
        if (!merge) {
          setAllTrades([]);
          setDisplayedTradesCount(35);
        }
        setLastFeedFetchAt(Date.now());
        return;
      }

      const extractTokenId = (rawTrade: any): string | undefined => {
        const candidates = [
          rawTrade.asset,
          rawTrade.asset_id,
          rawTrade.assetId,
          rawTrade.token_id,
          rawTrade.tokenId,
          rawTrade.tokenID,
        ];
        for (const candidate of candidates) {
          if (candidate === undefined || candidate === null) continue;
          const value =
            typeof candidate === 'number' ? candidate.toString() : String(candidate).trim();
          if (value) return value;
        }
        return undefined;
      };

      const normalizedCategory = (value?: string | null) =>
        value ? value.trim().toLowerCase() : undefined;
      const getMarketTitle = (rawTrade: any) => {
        const candidates = [
          rawTrade.title,
          rawTrade.market_title,
          rawTrade.marketTitle,
          rawTrade.question,
          rawTrade.market,
        ];
        for (const candidate of candidates) {
          if (typeof candidate === 'string' && candidate.trim()) {
            return candidate;
          }
        }
        return 'Unknown Market';
      };

      // STEP 1: Extract all conditionIds from trades BEFORE formatting
      console.log('[Feed] STEP 1: Extracting conditionIds from trades', {
        totalTrades: rawTrades.length,
        sampleTrade: rawTrades[0] ? {
          conditionId: rawTrades[0].conditionId,
          condition_id: rawTrades[0].condition_id,
          hasConditionId: !!(rawTrades[0].conditionId || rawTrades[0].condition_id),
        } : null,
      });
      
      const conditionIds = rawTrades
        .map((t: any) => t.conditionId || t.condition_id)
        .filter((id: any): id is string => !!id && typeof id === 'string' && id.startsWith('0x'));
      
      const uniqueConditionIds = Array.from(new Set(conditionIds));
      
      console.log('[Feed] STEP 1 RESULT:', {
        extractedConditionIds: conditionIds.length,
        uniqueConditionIds: uniqueConditionIds.length,
        sampleIds: uniqueConditionIds.slice(0, 3),
      });
      
      // STEP 2: Batch fetch ALL market data from database (tags, market_subtype, bet_structure, etc.)
      // Use single query with timeout to avoid blocking
      const marketDataMap = new Map<string, any>();
      const missingConditionIds: string[] = [];
      
      if (uniqueConditionIds.length > 0) {
        try {
          // Single query for all markets with timeout (Supabase supports up to 1000 items in .in())
          const queryPromise = supabase
            .from('markets')
            .select('condition_id, tags, market_subtype, bet_structure, market_type, title, raw_dome')
            .in('condition_id', uniqueConditionIds.slice(0, 1000)); // Limit to 1000 for safety
          
          const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => 
            setTimeout(() => resolve({ data: null, error: { message: 'Timeout' } }), 5000)
          );
          
          console.log('[Feed] STEP 2: Querying markets table', {
            queryingCount: uniqueConditionIds.length,
            sampleConditionIds: uniqueConditionIds.slice(0, 3),
          });
          
          const { data: markets, error } = await Promise.race([queryPromise, timeoutPromise]);
          
          console.log('[Feed] STEP 2 RESULT: Markets query completed', {
            hasError: !!error,
            errorMessage: error?.message,
            marketsReturned: markets?.length || 0,
            isArray: Array.isArray(markets),
            sampleMarket: markets && markets[0] ? {
              condition_id: markets[0].condition_id,
              hasTags: !!markets[0].tags,
              tagsType: typeof markets[0].tags,
              tagsIsArray: Array.isArray(markets[0].tags),
              tagsLength: Array.isArray(markets[0].tags) ? markets[0].tags.length : 0,
              tagsSample: Array.isArray(markets[0].tags) ? markets[0].tags.slice(0, 3) : markets[0].tags,
              hasRawDome: !!markets[0].raw_dome,
              market_subtype: markets[0].market_subtype,
            } : null,
          });
          
          if (!error && markets && Array.isArray(markets)) {
            const foundIds = new Set<string>();
            // Helper to normalize tags (same as in Step 3)
            const normalizeTagsForMap = (source: any): string[] => {
              if (!source) return [];
              if (Array.isArray(source)) {
                return source
                  .map((t: any) => {
                    if (typeof t === 'object' && t !== null) {
                      return t.name || t.tag || t.value || String(t);
                    }
                    return String(t);
                  })
                  .map((t: string) => t.trim().toLowerCase())
                  .filter((t: string) => t.length > 0 && t !== 'null' && t !== 'undefined');
              }
              if (typeof source === 'string' && source.trim()) {
                try {
                  const parsed = JSON.parse(source);
                  return normalizeTagsForMap(parsed);
                } catch {
                  const trimmed = source.trim().toLowerCase();
                  return trimmed.length > 0 ? [trimmed] : [];
                }
              }
              return [];
            };
            
            markets.forEach((market) => {
              if (market.condition_id) {
                foundIds.add(market.condition_id);
                let tags: string[] | null = null;
                
                // Extract and normalize tags from tags column
                if (Array.isArray(market.tags) && market.tags.length > 0) {
                  const normalized = normalizeTagsForMap(market.tags);
                  if (normalized.length > 0) {
                    tags = normalized;
                    console.log(`[Feed] Extracted and normalized tags for ${market.condition_id}:`, tags);
                  }
                }
                
                // Fallback to raw_dome if tags missing
                if ((!tags || tags.length === 0) && market.raw_dome) {
                  try {
                    const rawDome = typeof market.raw_dome === 'string' ? JSON.parse(market.raw_dome) : market.raw_dome;
                    if (rawDome?.tags) {
                      const normalized = normalizeTagsForMap(rawDome.tags);
                      if (normalized.length > 0) {
                        tags = normalized;
                        console.log(`[Feed] Extracted tags from raw_dome for ${market.condition_id}:`, tags);
                      }
                    }
                  } catch (err) {
                    console.warn(`[Feed] Failed to parse raw_dome for ${market.condition_id}:`, err);
                  }
                }
                
                marketDataMap.set(market.condition_id, {
                  tags: tags && tags.length > 0 ? tags : null, // Store normalized lowercase tags
                  market_subtype: market.market_subtype || null,
                  bet_structure: market.bet_structure || null,
                  market_type: market.market_type || null,
                  title: market.title || null,
                });
                
                if (!tags || tags.length === 0) {
                  console.warn(`[Feed] ⚠️ Market ${market.condition_id} has no tags after extraction`);
                }
              }
            });
            
            // Track missing markets (not in DB or missing tags)
            uniqueConditionIds.forEach((id) => {
              if (!foundIds.has(id)) {
                missingConditionIds.push(id);
                console.log(`[Feed] Market ${id} not found in DB`);
              } else if (!marketDataMap.get(id)?.tags) {
                missingConditionIds.push(id);
                console.log(`[Feed] Market ${id} found but has no tags`);
              }
            });
            
            console.log(`[Feed] STEP 2 SUMMARY: Batch fetched ${marketDataMap.size} markets, ${missingConditionIds.length} missing`);
            console.log('[Feed] Markets with tags:', Array.from(marketDataMap.entries())
              .filter(([_, data]) => data.tags && data.tags.length > 0)
              .map(([id, data]) => ({ conditionId: id, tagsCount: data.tags?.length || 0, tags: data.tags }))
              .slice(0, 3)
            );
          } else {
            // If query failed or timed out, mark all as missing but continue
            console.warn('[Feed] Market fetch failed or timed out, continuing without market data');
            uniqueConditionIds.forEach((id) => missingConditionIds.push(id));
          }
        } catch (err) {
          console.error('[Feed] Error batch fetching market data:', err);
          // Mark all as missing but continue - trades will show without tags
          uniqueConditionIds.forEach((id) => missingConditionIds.push(id));
        }
      }
      
      // STEP 2.5: Ensure missing markets exist in DB (NON-BLOCKING - happens in background)
      // This uses /api/markets/ensure which handles DOME/CLOB API fetch and semantic mapping classification
      // Don't wait for this - show trades immediately, tags will be available on next load
      if (missingConditionIds.length > 0) {
        console.log(`[Feed] ${missingConditionIds.length} markets missing - ensuring in background (non-blocking)`);
        
        // Fire-and-forget: ensure markets in background without blocking trade display
        // Trades will show immediately, tags will be available on next page load or refresh
        Promise.allSettled(
          missingConditionIds.slice(0, 20).map(async (conditionId) => {
            try {
              // Use /api/markets/ensure which:
              // 1. Fetches from CLOB/DOME API
              // 2. Extracts tags
              // 3. Uses semantic_mapping to classify (niche, bet_structure, market_type)
              // 4. Saves to DB
              const ensureResponse = await fetch(`/api/markets/ensure?conditionId=${conditionId}`, {
                cache: 'no-store',
                signal: AbortSignal.timeout(8000), // 8s timeout per market
              });
              
              if (ensureResponse.ok) {
                const ensureData = await ensureResponse.json();
                if (ensureData?.found && ensureData?.market) {
                  console.log(`[Feed] ✅ Ensured market ${conditionId} in background`);
                }
              }
            } catch (err: any) {
              // Silently fail - non-blocking
              if (err?.name !== 'AbortError') {
                console.warn(`[Feed] Background ensure failed for ${conditionId}`);
              }
            }
          })
        ).then(() => {
          console.log(`[Feed] Background ensure completed for ${Math.min(missingConditionIds.length, 20)} markets`);
        });
      }

      // STEP 3: Format trades with market data from database (tags guaranteed to be available)
      const formattedTrades: FeedTrade[] = rawTrades.map((trade: any) => {
        const wallet = trade._followedWallet || trade.user || trade.wallet || '';
        const walletKey = wallet.toLowerCase();
        const displayName =
          traderNames[walletKey] ||
          (wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : 'Unknown');

        const marketId =
          trade.conditionId ||
          trade.condition_id ||
          trade.market_slug ||
          trade.slug ||
          trade.asset_id ||
          trade.market ||
          trade.title ||
          '';
        const conditionId = trade.conditionId || trade.condition_id || '';
        const side = (trade.side || 'BUY').toUpperCase() as 'BUY' | 'SELL';
        const outcome = trade.outcome || trade.option || 'YES';
        const size = parseFloat(trade.size || trade.amount || 0);
        const price = parseFloat(trade.price || 0);
        const timestamp = (trade.timestamp || Date.now() / 1000) * 1000;
        const rawTradeId =
          trade.trade_id || trade.id || trade.tx_hash || trade.transactionHash || '';
        const tradeId = rawTradeId ? String(rawTradeId) : undefined;
        const feedTradeId = buildFeedTradeId({
          wallet,
          tradeId,
          timestamp,
          side,
          outcome,
          size,
          price,
          marketId,
        });
        const marketTitle = getMarketTitle(trade);
        
        // Get market data from batch-fetched map (preferred) or extract from trade
        const dbMarketData = conditionId ? marketDataMap.get(conditionId) : null;
        
        // DEBUG: Log market data lookup
        if (!dbMarketData && conditionId) {
          console.warn(`[Feed] STEP 3: No market data found for conditionId ${conditionId}`);
        } else if (dbMarketData) {
          console.log(`[Feed] STEP 3: Found market data for ${conditionId}:`, {
            hasTags: !!dbMarketData.tags,
            tagsType: typeof dbMarketData.tags,
            tagsIsArray: Array.isArray(dbMarketData.tags),
            tagsValue: dbMarketData.tags,
            market_subtype: dbMarketData.market_subtype,
            bet_structure: dbMarketData.bet_structure,
          });
        }
        
        // Helper function to normalize tags from various sources
        const normalizeTags = (source: any): string[] => {
          if (!source) return [];
          
          // Handle arrays
          if (Array.isArray(source)) {
            return source
              .map((t: any) => {
                if (typeof t === 'object' && t !== null) {
                  return t.name || t.tag || t.value || String(t);
                }
                return String(t);
              })
              .map((t: string) => t.trim().toLowerCase())
              .filter((t: string) => t.length > 0 && t !== 'null' && t !== 'undefined');
          }
          
          // Handle strings (could be JSON)
          if (typeof source === 'string' && source.trim()) {
            try {
              const parsed = JSON.parse(source);
              return normalizeTags(parsed);
            } catch {
              const trimmed = source.trim().toLowerCase();
              return trimmed.length > 0 ? [trimmed] : [];
            }
          }
          
          // Handle objects
          if (typeof source === 'object' && source !== null) {
            if (source.tags && Array.isArray(source.tags)) {
              return normalizeTags(source.tags);
            }
            if (source.data && Array.isArray(source.data)) {
              return normalizeTags(source.data);
            }
          }
          
          return [];
        };
        
        // Extract tags: ONLY from market data (DB or ensure API)
        // Every market has tags - if missing, market needs to be ensured
        let tags: string[] | null = null;
        
        if (dbMarketData?.tags) {
          const normalized = normalizeTags(dbMarketData.tags);
          console.log(`[Feed] STEP 3: Normalized tags for ${conditionId}:`, {
            original: dbMarketData.tags,
            normalized,
            normalizedLength: normalized.length,
          });
          if (normalized.length > 0) {
            tags = normalized;
          }
        }
        
        // If no tags found, log warning - market should have been ensured above
        if (!tags || tags.length === 0) {
          console.warn(`[Feed] ⚠️ STEP 3: No tags found for market ${conditionId}`, {
            hasDbMarketData: !!dbMarketData,
            dbMarketDataTags: dbMarketData?.tags,
            conditionId,
            marketTitle,
          });
        } else {
          console.log(`[Feed] ✅ STEP 3: Tags extracted for ${conditionId}:`, tags);
        }
        
        const formattedTrade: FeedTrade = {
          id: feedTradeId,
          trader: {
            wallet: wallet,
            displayName: displayName,
          },
          market: {
            id: marketId,
            conditionId,
            title: marketTitle,
            slug: trade.market_slug || trade.slug || '',
            eventSlug: trade.eventSlug || trade.event_slug || '',
            category: normalizedCategory(
              trade.category || trade.market_category || trade.marketCategory || trade.market?.category
            ),
            avatarUrl: extractMarketAvatarUrl(trade) || undefined,
            tags: (tags && Array.isArray(tags) && tags.length > 0) ? tags : undefined,
          },
          trade: {
            side,
            outcome,
            size,
            price,
            timestamp,
            tradeId,
            tokenId: extractTokenId(trade),
          },
          fireReasons: Array.isArray((trade as any)._fireReasons)
            ? (trade as any)._fireReasons
            : undefined,
          fireScore: Number.isFinite((trade as any)._fireScore)
            ? Number((trade as any)._fireScore)
            : undefined,
          fireWinRate: (trade as any)._fireWinRate !== undefined ? (trade as any)._fireWinRate : null,
          fireRoi: (trade as any)._fireRoi !== undefined ? (trade as any)._fireRoi : null,
          fireConviction: (trade as any)._fireConviction !== undefined ? (trade as any)._fireConviction : null,
        };
        formattedTrade.market.marketCategoryType = resolveMarketCategoryType({
          marketKey: marketId || formattedTrade.market.slug || marketTitle,
          title: marketTitle,
          category: formattedTrade.market.category,
          tags: formattedTrade.market.tags,
          outcomes: undefined,
        });
        return formattedTrade;
      });
      
      // DEBUG: Log sample of formatted trades to verify tags
      console.log('[Feed] STEP 3 COMPLETE: Formatted trades sample', {
        totalFormatted: formattedTrades.length,
        sampleTrades: formattedTrades.slice(0, 3).map(t => ({
          conditionId: t.market.conditionId,
          hasTags: !!t.market.tags,
          tagsType: typeof t.market.tags,
          tagsIsArray: Array.isArray(t.market.tags),
          tagsLength: Array.isArray(t.market.tags) ? t.market.tags.length : 0,
          tags: t.market.tags,
          title: t.market.title,
        })),
        tradesWithTags: formattedTrades.filter(t => t.market.tags && Array.isArray(t.market.tags) && t.market.tags.length > 0).length,
        tradesWithoutTags: formattedTrades.filter(t => !t.market.tags || !Array.isArray(t.market.tags) || t.market.tags.length === 0).length,
      });
      
      const uniqueFormattedTrades: FeedTrade[] = [];
      const seenTradeIds = new Set<string>();
      for (const trade of formattedTrades) {
        if (seenTradeIds.has(trade.id)) continue;
        seenTradeIds.add(trade.id);
        uniqueFormattedTrades.push(trade);
      }

      const isSportsTitle = (title: string) => {
        const text = title.toLowerCase();
        if (
          text.includes('vs.') ||
          text.includes(' vs ') ||
          text.includes(' v ') ||
          text.includes(' at ') ||
          text.includes('@')
        ) {
          return true;
        }
        return [
          'nfl',
          'nba',
          'wnba',
          'mlb',
          'nhl',
          'ncaa',
          'soccer',
          'tennis',
          'golf',
          'mma',
          'ufc',
          'boxing',
          'football',
          'basketball',
          'baseball',
          'hockey',
          'pga',
          'lpga',
          'atp',
          'wta',
          'wimbledon',
          'roland garros',
          'australian open',
          'us open',
          'liga mx',
          'ligamx',
          'f1',
          'formula 1',
          'world cup',
          'champions league',
          'premier league',
          'premiership',
          'epl',
          'super bowl',
        ].some((term) => text.includes(term));
      };

      uniqueFormattedTrades.forEach((trade) => {
        if (trade.market.category) return;
        const title = trade.market.title.toLowerCase();

        if (
          title.includes('trump') ||
          title.includes('biden') ||
          title.includes('election') ||
          title.includes('senate') ||
          title.includes('congress') ||
          title.includes('president')
        ) {
          trade.market.category = 'politics';
        } else if (isSportsTitle(title)) {
          trade.market.category = 'sports';
        } else if (
          title.includes('bitcoin') ||
          title.includes('btc') ||
          title.includes('ethereum') ||
          title.includes('eth') ||
          title.includes('crypto')
        ) {
          trade.market.category = 'crypto';
        } else if (title.includes('stock') || title.includes('economy') || title.includes('inflation')) {
          trade.market.category = 'economics';
        } else if (
          title.includes('ai') ||
          title.includes('tech') ||
          title.includes('apple') ||
          title.includes('google') ||
          title.includes('microsoft')
        ) {
          trade.market.category = 'tech';
        } else if (title.includes('weather') || title.includes('temperature')) {
          trade.market.category = 'weather';
        } else if (title.includes('movie') || title.includes('album') || title.includes('celebrity')) {
          trade.market.category = 'culture';
        } else if (title.includes('company') || title.includes('ceo') || title.includes('revenue')) {
          trade.market.category = 'finance';
        }
      });

      // Market data already fetched in batch above - tags should be available
      // Log summary of tag availability for debugging
      const tradesWithTags = uniqueFormattedTrades.filter(
        (t) => t.market.tags && Array.isArray(t.market.tags) && t.market.tags.length > 0
      );
      const tradesWithoutTags = uniqueFormattedTrades.length - tradesWithTags.length;
      console.log(`[Feed] Processed ${uniqueFormattedTrades.length} trades: ${tradesWithTags.length} with tags, ${tradesWithoutTags} without tags`);
      
      // Log sample of trades without tags for debugging
      if (tradesWithoutTags > 0 && tradesWithoutTags <= 5) {
        const sample = uniqueFormattedTrades
          .filter((t) => !t.market.tags || !Array.isArray(t.market.tags) || t.market.tags.length === 0)
          .slice(0, 3)
          .map((t) => ({ conditionId: t.market.conditionId, title: t.market.title }));
        console.log('[Feed] Sample trades without tags:', sample);
      }

      const latestTimestamp =
        uniqueFormattedTrades.length > 0
          ? Math.max(...uniqueFormattedTrades.map((t) => t.trade.timestamp))
          : null;

      if (mode === 'fire') {
        uniqueFormattedTrades.sort((a, b) => {
          const scoreA = a.fireScore ?? 0;
          const scoreB = b.fireScore ?? 0;
          if (scoreA !== scoreB) return scoreB - scoreA;
          return (b.trade.timestamp || 0) - (a.trade.timestamp || 0);
        });
      }

      const existingTrades = allTradesRef.current;
      const existingIds = new Set(existingTrades.map((trade) => trade.id));
      const newTrades = merge
        ? uniqueFormattedTrades.filter((trade) => !existingIds.has(trade.id))
        : uniqueFormattedTrades;
      const nextTrades = merge ? [...newTrades, ...existingTrades] : uniqueFormattedTrades;

      if (merge && preserveDisplayCount && newTrades.length > 0) {
        setDisplayedTradesCount((prev) => prev + newTrades.length);
      } else if (!merge) {
        setDisplayedTradesCount(35);
      }

      setAllTrades(nextTrades);

      if (merge) {
        if (latestTimestamp !== null) {
          setLatestTradeTimestamp((prev) => {
            if (!prev) return latestTimestamp;
            return Math.max(prev, latestTimestamp);
          });
        }
      } else {
        setLatestTradeTimestamp(latestTimestamp);
      }
      setLastFeedFetchAt(Date.now());

        if (merge) {
          if (newTrades.length > 0) {
            fetchLiveMarketData(newTrades);
          }
        } else {
          fetchLiveMarketData(nextTrades.slice(0, 35));
        }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTimestamp = today.getTime();

      const tradesForStats = merge ? nextTrades : uniqueFormattedTrades;
      const todaysTrades = tradesForStats.filter((t) => {
        const tradeDate = new Date(t.trade.timestamp);
        tradeDate.setHours(0, 0, 0, 0);
        return tradeDate.getTime() === todayTimestamp;
      });

      const volumeToday = todaysTrades.reduce((sum, t) => sum + t.trade.price * t.trade.size, 0);
      setTodayVolume(volumeToday);
      setTodaysTradeCount(todaysTrades.length);

      if (merge && preserveScroll && newTrades.length > 0 && scrollAnchor) {
        restoreScrollAnchor(scrollAnchor);
      }
    },
    [fetchLiveMarketData, restoreScrollAnchor]
  );

  // Fetch feed data
  const fetchFeed = useCallback(async (options: FetchFeedOptions = {}) => {
    const {
      userOverride,
      merge = false,
      preserveDisplayCount = false,
      preserveScroll = false,
      silent = false,
    } = options;
    const currentUser = userOverride || user;

    if (!currentUser) {
      return;
    }

    const shouldSetLoading = !silent;
    const scrollAnchor = preserveScroll ? captureScrollAnchor() : null;

    if (shouldSetLoading) {
      setLoadingFeed(true);
      setError(null);
    }

    try {
        // 1. Fetch followed traders
        const { data: follows, error: followsError } = await supabase
          .from('follows')
          .select('trader_wallet')
          .eq('user_id', currentUser.id);

        if (followsError) throw new Error('Failed to fetch follows');
        if (!follows || follows.length === 0) {
          setAllTrades([]);
          setFollowingCount(0);
          setLastFeedFetchAt(Date.now());
          return;
        }

        setFollowingCount(follows.length);

        // 2. Fetch trades
        const tradePromises = follows.map(async (follow) => {
          const wallet = follow.trader_wallet;
          
          try {
            const response = await fetch(
              `https://data-api.polymarket.com/trades?limit=15&user=${wallet}`,
              { cache: 'no-store' }
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
        
        // 3. Fetch trader names in parallel
        const traderNames: Record<string, string> = {};
        const namePromise = (async () => {
          try {
            const leaderboardRes = await fetch('/api/polymarket/leaderboard?limit=100&orderBy=PNL&timePeriod=all');
            if (leaderboardRes.ok) {
              const leaderboardData = await leaderboardRes.json();
              
              for (const follow of follows) {
                const walletKey = follow.trader_wallet.toLowerCase();
                const trader = leaderboardData.traders?.find(
                  (t: any) => t.wallet.toLowerCase() === walletKey
                );
                if (trader?.displayName) {
                  traderNames[walletKey] = trader.displayName;
                }
              }
            }

            const walletsNeedingNames = follows
              .filter(f => !traderNames[f.trader_wallet.toLowerCase()])
              .map(f => f.trader_wallet.toLowerCase());
            
            if (walletsNeedingNames.length > 0) {
              const batchSize = 10;
              const batches = [];
              
              for (let i = 0; i < walletsNeedingNames.length; i += batchSize) {
                const batch = walletsNeedingNames.slice(i, i + batchSize);
                batches.push(
                  Promise.allSettled(
                    batch.map(async (wallet) => {
                      try {
                        const res = await fetch(
                          `https://data-api.polymarket.com/trades?limit=1&user=${wallet}`,
                          { cache: 'no-store' }
                        );
                        if (res.ok) {
                          const trades = await res.json();
                          if (Array.isArray(trades) && trades.length > 0) {
                            const name = trades[0].name || trades[0].userName;
                            if (name) {
                              traderNames[wallet] = name;
                            }
                          }
                        }
                      } catch (err) {
                        // Silent fail
                      }
                    })
                  )
                );
              }
              
              await Promise.all(batches);
            }
          } catch (err) {
            console.error('Failed to fetch trader names:', err);
          }
        })();
        
        const [allTradesArrays] = await Promise.all([
          Promise.all(tradePromises),
          namePromise
        ]);
        
        const allTradesRaw = allTradesArrays.flat();
        
        if (allTradesRaw.length === 0) {
          if (!merge) {
            setAllTrades([]);
          }
          setLastFeedFetchAt(Date.now());
          return;
        }

        allTradesRaw.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));

        await processTrades({
          rawTrades: allTradesRaw,
          traderNames,
          merge,
          preserveDisplayCount,
          preserveScroll,
          scrollAnchor,
          mode: 'all',
        });

    } catch (err: any) {
      console.error('Error fetching feed:', err);
      if (!silent) {
        setError(err.message || 'Failed to load feed');
        setLastFeedFetchAt(Date.now());
      }
    } finally {
      if (shouldSetLoading) {
        setLoadingFeed(false);
      }
      markInitialFeedCheckComplete();
    }
  }, [captureScrollAnchor, user, processTrades, markInitialFeedCheckComplete]);

  const fetchFireFeed = useCallback(
    async (options: FetchFeedOptions = {}) => {
      const {
        userOverride,
        merge = false,
        preserveDisplayCount = false,
        preserveScroll = false,
        silent = false,
      } = options;

      const currentUser = userOverride || user;
      if (!currentUser) {
        return;
      }

      if (userTier !== 'admin') {
        if (!silent) {
          setError('The 🔥 feed is only available to admins.');
        }
        markInitialFeedCheckComplete();
        return;
      }

      const shouldSetLoading = !silent;
      const scrollAnchor = preserveScroll ? captureScrollAnchor() : null;

      if (shouldSetLoading) {
        setLoadingFeed(true);
        setError(null);
      }

      try {
        // Use optimized API endpoint that fetches everything from Supabase in parallel
        const fireFeedRes = await fetch('/api/fire-feed', { cache: 'no-store' });
        if (!fireFeedRes.ok) {
          const errorText = await fireFeedRes.text().catch(() => 'Unknown error');
          let errorMessage = 'Failed to fetch FIRE feed';
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || errorMessage;
          } catch {
            errorMessage = `${errorMessage}: ${fireFeedRes.status} ${errorText.slice(0, 200)}`;
          }
          throw new Error(errorMessage);
        }
        const fireFeedData = await fireFeedRes.json();
        
        const allTradesRaw: any[] = Array.isArray(fireFeedData?.trades) ? fireFeedData.trades : [];
        const traderNames: Record<string, string> = fireFeedData?.traders || {};
        
        // Cache stats for future use
        if (fireFeedData?.stats) {
          Object.entries(fireFeedData.stats).forEach(([wallet, stats]: [string, any]) => {
            fireStatsCacheRef.current.set(wallet.toLowerCase(), stats);
          });
        }

        setFireTraderCount(Object.keys(traderNames).length);

        if (allTradesRaw.length === 0) {
          if (!merge) {
            setAllTrades([]);
          }
          setLastFeedFetchAt(Date.now());
          return;
        }

        // Trades are already filtered and sorted by the API
        await processTrades({
          rawTrades: allTradesRaw,
          traderNames,
          merge,
          preserveDisplayCount,
          preserveScroll,
          scrollAnchor,
          mode: 'fire',
        });
      } catch (err: any) {
        console.error('Error fetching fire feed:', err);
        if (!silent) {
          setError(err.message || 'Failed to load 🔥 feed');
          setLastFeedFetchAt(Date.now());
        }
      } finally {
        if (shouldSetLoading) {
          setLoadingFeed(false);
        }
        markInitialFeedCheckComplete();
      }
    },
    [user, userTier, captureScrollAnchor, processTrades, markInitialFeedCheckComplete]
  );

  const fetchCurrentFeed = useCallback(
    (options: FetchFeedOptions = {}) => {
      if (feedMode === 'fire') {
        return fetchFireFeed(options);
      }
      return fetchFeed(options);
    },
    [feedMode, fetchFeed, fetchFireFeed]
  );

  // Manual refresh handler
  const handleManualRefresh = async () => {
    if (!user) return;
    
    setIsRefreshing(true);
    
    const sessionKey = `feed-${feedMode}-fetched-${user.id}`;
    sessionStorage.removeItem(sessionKey);
    fetchedModesRef.current.delete(feedMode);
    
    await fetchCurrentFeed({ userOverride: user });
    
    fetchedModesRef.current.add(feedMode);
    sessionStorage.setItem(sessionKey, 'true');
    
    setIsRefreshing(false);
  };

  const lastLiveRefreshRef = useRef(0);
  const liveIdleIntervalRef = useRef<number | null>(null);
  const scrollStopTimeoutRef = useRef<number | null>(null);

  // Fetch feed data when user is available
  useEffect(() => {
    if (!user || loading) {
      return;
    }

    const attemptFetch = async () => {
      if (!user) return;

      const sessionKey = `feed-${feedMode}-fetched-${user.id}`;
      const alreadyFetched = sessionStorage.getItem(sessionKey);
      const hasFetched = fetchedModesRef.current.has(feedMode);

      if (alreadyFetched === 'true' && hasFetched) {
        markInitialFeedCheckComplete();
        return;
      }

      attemptedModesRef.current.add(feedMode);

      try {
        await fetchCurrentFeed({ userOverride: user });
        fetchedModesRef.current.add(feedMode);
        sessionStorage.setItem(sessionKey, 'true');
      } catch (err) {
        console.error('Feed fetch error:', err);
        markInitialFeedCheckComplete();
      }
    };

    attemptFetch();
  }, [user, loading, feedMode, fetchCurrentFeed, markInitialFeedCheckComplete]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleVisibilityChange = () => {
      setIsDocumentVisible(document.visibilityState === 'visible');
    };
    handleVisibilityChange();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleFocus = () => setIsWindowFocused(true);
    const handleBlur = () => setIsWindowFocused(false);
    setIsWindowFocused(document.hasFocus());
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    setError(null);
    setDisplayedTradesCount(35);
    setLatestTradeTimestamp(null);
    setLastFeedFetchAt(null);
    setAllTrades([]);
  }, [feedMode]);

  useEffect(() => {
    if (feedMode === 'fire' && userTier !== 'admin') {
      setFeedMode('all');
    }
  }, [feedMode, userTier]);

  useEffect(() => {
    const path = typeof pathname === 'string' ? pathname : '';
    if (path.includes('/fire-feed')) {
      setFeedMode('fire');
    } else {
      setFeedMode('all');
    }
  }, [pathname]);

  // Load more trades
  const handleLoadMore = () => {
    const newCount = displayedTradesCount + 35;
    setDisplayedTradesCount(newCount);
  };

  // Filter trades based on strategy and category
  const filteredAllTrades = useMemo(() => allTrades.filter(trade => {
    if (appliedFilters.tradingStrategies.length > 0) {
      const marketKey = getMarketKeyForTrade(trade);
      const wallet = normalizeKeyPart(trade.trader.wallet);
      if (!marketKey || !wallet) return false;
      const key = `${wallet}-${marketKey}`;
      const trades = traderMarketTrades.get(key) ?? [];
      const matchesSelling = appliedFilters.tradingStrategies.includes('selling')
        ? trade.trade.side === 'SELL'
        : false;
      const matchesMultiple = appliedFilters.tradingStrategies.includes('multiple')
        ? trades.length >= 2
        : false;
      const matchesHedging = appliedFilters.tradingStrategies.includes('hedging')
        ? (() => {
            const outcomes = new Set(
              trades
                .map((entry) => normalizeOutcomeValue(entry.outcome))
                .filter((outcome): outcome is string => Boolean(outcome))
            );
            return outcomes.size >= 2;
          })()
        : false;
      if (!matchesSelling && !matchesMultiple && !matchesHedging) return false;
    }

    if (appliedFilters.category !== 'all') {
      const tradeCategory = trade.market.category?.toLowerCase();
      if (!tradeCategory || tradeCategory !== appliedFilters.category) {
        return false;
      }
    }

    if (appliedFilters.tradeSizeMin > 0) {
      const totalValue = trade.trade.price * trade.trade.size;
      if (!Number.isFinite(totalValue) || totalValue < appliedFilters.tradeSizeMin) {
        return false;
      }
    }

    if (appliedFilters.status === 'live' && !isLiveMarket(trade)) {
      return false;
    }

    if (appliedFilters.positionsOnly) {
      const marketKeys = getMarketKeyVariantsForTrade(trade);
      const hasPosition = marketKeys.some((key) => userPositionTradesByMarket.has(key));
      if (!hasPosition) {
        return false;
      }
    }

    if (appliedFilters.resolvingWindow !== 'any' && !matchesResolvingWindow(trade)) {
      return false;
    }

    if (appliedFilters.priceMinCents > PRICE_RANGE.min || appliedFilters.priceMaxCents < PRICE_RANGE.max) {
      const livePrice = getCurrentOutcomePrice(trade);
      const priceValue = Number.isFinite(livePrice) ? livePrice : trade.trade.price;
      if (!Number.isFinite(priceValue) || priceValue === undefined || priceValue === null) return false;
      const priceCents = Math.round(Number(priceValue) * 100);
      if (priceCents < appliedFilters.priceMinCents || priceCents > appliedFilters.priceMaxCents) {
        return false;
      }
    }

    if (appliedFilters.traderIds.length > 0) {
      const wallet = trade.trader.wallet?.toLowerCase() || '';
      if (!appliedTraderSet.has(wallet)) {
        return false;
      }
    }
    
    if (feedMode === 'fire') {
      const marketKey = getMarketKeyForTrade(trade);
      if (marketKey) {
        const liveData = liveMarketData.get(marketKey);
        if (liveData?.resolved === true || liveData?.liveStatus === 'final') {
          return false;
        }
      }
    }

    return true;
  }), [
    allTrades,
    appliedFilters,
    appliedTraderSet,
    isLiveMarket,
    matchesResolvingWindow,
    getCurrentOutcomePrice,
    traderMarketTrades,
    userPositionTradesByMarket,
    feedMode,
    liveMarketData,
  ]);

  useEffect(() => {
    if (pinnedTradeIds.size === 0) return;
    const now = Date.now();
    const next = new Set(pinnedTradeIds);
    allTrades.forEach((trade) => {
      const key = buildPinnedTradeKey(trade);
      if (!key || !next.has(key)) return;
      const resolvedAt = getResolvedTimestamp(trade);
      if (resolvedAt && now - resolvedAt > PINNED_TRADE_EXPIRY_MS) {
        next.delete(key);
      }
    });
    if (next.size !== pinnedTradeIds.size) {
      setPinnedTradeIds(next);
    }
  }, [allTrades, getResolvedTimestamp, pinnedTradeIds]);
  
  const { pinnedTrades, unpinnedTrades } = useMemo(() => {
    const pinned: FeedTrade[] = [];
    const unpinned: FeedTrade[] = [];
    filteredAllTrades.forEach((trade) => {
      const key = buildPinnedTradeKey(trade);
      if (key && pinnedTradeIds.has(key)) {
        pinned.push(trade);
      } else {
        unpinned.push(trade);
      }
    });
    return { pinnedTrades: pinned, unpinnedTrades: unpinned };
  }, [filteredAllTrades, pinnedTradeIds]);

  const displayedTrades = useMemo(() => {
    const remaining = Math.max(displayedTradesCount - pinnedTrades.length, 0);
    return [...pinnedTrades, ...unpinnedTrades.slice(0, remaining)];
  }, [displayedTradesCount, pinnedTrades, unpinnedTrades]);

  const getVisibleTrades = useCallback((): FeedTrade[] => {
    if (typeof window === 'undefined') return [];
    const container = feedListRef.current;
    if (!container) return [];

    const buffer = 120;
    const viewportHeight = window.innerHeight || 0;
    const visibleIds = new Set(
      Array.from(container.querySelectorAll<HTMLElement>('[data-trade-id]'))
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.bottom >= -buffer && rect.top <= viewportHeight + buffer;
        })
        .map((el) => el.getAttribute('data-trade-id'))
        .filter((id): id is string => Boolean(id))
    );

    if (visibleIds.size === 0) return [];
    return displayedTrades.filter((trade) => visibleIds.has(String(trade.id)));
  }, [displayedTrades]);

  const hasMoreTrades =
    unpinnedTrades.length > Math.max(displayedTradesCount - pinnedTrades.length, 0);

  const needsMarketData = useMemo(
    () =>
      appliedFilters.status !== 'all' ||
      appliedFilters.resolvingWindow !== 'any' ||
      appliedFilters.priceMinCents > PRICE_RANGE.min ||
      appliedFilters.priceMaxCents < PRICE_RANGE.max,
    [
      appliedFilters.status,
      appliedFilters.resolvingWindow,
      appliedFilters.priceMinCents,
      appliedFilters.priceMaxCents,
    ]
  );

  const isInitialFeedLoading = !initialFeedCheckComplete;

  useEffect(() => {
    if (!needsMarketData || allTrades.length === 0) return;
    fetchLiveMarketData(allTrades);
  }, [needsMarketData, allTrades, fetchLiveMarketData]);

  const refreshDisplayedMarketData = useCallback(
    (options?: { force?: boolean; trades?: FeedTrade[] }) => {
      const { force = false, trades } = options ?? {};
      if (!isDocumentVisible || !isWindowFocused) return;
      const targets = trades && trades.length > 0 ? trades : displayedTrades;
      if (targets.length === 0) return;
      const now = Date.now();
      const refreshWindowMs = 15000;
      const tradesNeedingRefresh = force
        ? targets
        : targets.filter((trade) => {
            const marketKey = getMarketKeyForTrade(trade);
            if (!marketKey) return false;
            const liveData = liveMarketData.get(marketKey);
            if (!liveData?.updatedAt) return true;
            return now - liveData.updatedAt > refreshWindowMs;
          });

      if (tradesNeedingRefresh.length === 0) return;

      if (!force) {
        const hasMissingData = tradesNeedingRefresh.some((trade) => {
          const marketKey = getMarketKeyForTrade(trade);
          if (!marketKey) return false;
          const liveData = liveMarketData.get(marketKey);
          return !liveData?.updatedAt;
        });

        if (!hasMissingData && now - lastLiveRefreshRef.current < refreshWindowMs) {
          return;
        }
      }

      lastLiveRefreshRef.current = now;
      fetchLiveMarketData(tradesNeedingRefresh);
    },
    [displayedTrades, fetchLiveMarketData, isDocumentVisible, isWindowFocused, liveMarketData]
  );

  const stopLiveIdleRefresh = useCallback(() => {
    if (liveIdleIntervalRef.current) {
      window.clearInterval(liveIdleIntervalRef.current);
      liveIdleIntervalRef.current = null;
    }
  }, []);

  const refreshVisibleMarkets = useCallback(() => {
    const visibleTrades = getVisibleTrades();
    if (visibleTrades.length === 0) return;
    refreshDisplayedMarketData({ force: true, trades: visibleTrades });
  }, [getVisibleTrades, refreshDisplayedMarketData]);

  const startLiveIdleRefresh = useCallback(() => {
    stopLiveIdleRefresh();
    if (!isDocumentVisible || !isWindowFocused) return;
    refreshVisibleMarkets();
    liveIdleIntervalRef.current = window.setInterval(() => {
      refreshVisibleMarkets();
    }, VISIBLE_REFRESH_INTERVAL_MS);
  }, [isDocumentVisible, isWindowFocused, refreshVisibleMarkets, stopLiveIdleRefresh]);

  useEffect(() => {
    refreshDisplayedMarketData();
  }, [refreshDisplayedMarketData]);

  useEffect(() => {
    startLiveIdleRefresh();

    const handleScroll = () => {
      stopLiveIdleRefresh();
      if (scrollStopTimeoutRef.current) {
        window.clearTimeout(scrollStopTimeoutRef.current);
      }
      scrollStopTimeoutRef.current = window.setTimeout(() => {
        startLiveIdleRefresh();
      }, SCROLL_STOP_DEBOUNCE_MS);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      stopLiveIdleRefresh();
      if (scrollStopTimeoutRef.current) {
        window.clearTimeout(scrollStopTimeoutRef.current);
      }
    };
  }, [startLiveIdleRefresh, stopLiveIdleRefresh]);

  // Real-time polling for expanded trade cards (Priority 2 enhancement)
  useEffect(() => {
    if (expandedTradeIds.size === 0) return;

    console.log(`🔄 Starting real-time polling for ${expandedTradeIds.size} expanded trades`);

    // Get trades that are currently expanded
    const expandedTrades = displayedTrades.filter(trade => {
      const tradeKey = buildCopiedTradeKey(
        getMarketKeyForTrade(trade),
        trade.trader.wallet
      );
      return tradeKey && expandedTradeIds.has(tradeKey);
    });

    if (expandedTrades.length === 0) return;

    // Fetch immediately
    fetchLiveMarketData(expandedTrades);

    // Then poll every 1 second for real-time updates
    const intervalId = setInterval(() => {
      console.log(`📡 Polling ${expandedTrades.length} expanded markets`);
      fetchLiveMarketData(expandedTrades);
    }, 1000);

    return () => {
      console.log(`⏹️ Stopped real-time polling for expanded trades`);
      clearInterval(intervalId);
    };
  }, [expandedTradeIds, displayedTrades, fetchLiveMarketData]);

  // Copy trade handler
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

  const handleMarkAsCopied = async (
    trade: FeedTrade,
    entryPrice: number,
    amountInvested?: number
  ) => {
    if (!user) {
      triggerLoggedOut('session_missing');
      router.push('/login');
      return;
    }

    try {
      let traderProfileImage: string | null = null;
      try {
        console.log('🖼️ Fetching trader profile image for wallet:', trade.trader.wallet);
        const leaderboardResponse = await fetch(
          `https://data-api.polymarket.com/v1/leaderboard?timePeriod=all&orderBy=VOL&limit=1&offset=0&category=overall&user=${trade.trader.wallet}`
        );
        if (leaderboardResponse.ok) {
          const leaderboardData = await leaderboardResponse.json();
          if (Array.isArray(leaderboardData) && leaderboardData.length > 0) {
            traderProfileImage = leaderboardData[0].profileImage || null;
            console.log('✅ Found trader profile image:', traderProfileImage ? 'yes' : 'no');
          }
        }
      } catch (err) {
        console.warn('⚠️ Failed to fetch trader profile image:', err);
      }

      const marketId =
        trade.market.conditionId ||
        trade.market.slug ||
        trade.market.title;
      const marketKey = getMarketKeyForTrade(trade);
      const marketAvatarUrl =
        trade.market.avatarUrl ||
        (marketKey ? liveMarketData.get(marketKey)?.marketAvatarUrl : undefined) ||
        null;
      const response = await fetch('/api/copied-trades', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          traderWallet: trade.trader.wallet,
          traderUsername: trade.trader.displayName,
          marketId,
          marketTitle: trade.market.title,
          marketSlug: trade.market.slug || null,
          outcome: trade.trade.outcome.toUpperCase(),
          priceWhenCopied: entryPrice,
          amountInvested: amountInvested || null,
          traderProfileImage,
          marketAvatarUrl,
          tokenId: trade.trade.tokenId || null,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        console.error('Copy trade API error:', payload);
        throw new Error(payload.error || 'Failed to save copied trade');
      }

      const tradeKey = buildCopiedTradeKey(marketId, trade.trader.wallet);
      if (tradeKey) {
        setCopiedTradeIds((prev) => {
          const next = new Set(prev);
          next.add(tradeKey);
          return next;
        });
      }

      await fetchCopiedTrades();
    } catch (err: any) {
      console.error('Error saving copied trade:', err);
      alert(err.message || 'Failed to save copied trade');
    }
  };

  const handleRealCopy = (trade: FeedTrade) => {
    const params = new URLSearchParams();
    params.set('prefill', '1');
    if (trade.trade.tradeId) params.set('tradeId', trade.trade.tradeId);
    if (trade.market.conditionId) params.set('conditionId', trade.market.conditionId);
    if (trade.market.slug) params.set('marketSlug', trade.market.slug);
    if (trade.market.eventSlug) params.set('eventSlug', trade.market.eventSlug);
    if (trade.market.title) params.set('marketTitle', trade.market.title);
    if (trade.trade.outcome) params.set('outcome', trade.trade.outcome);
    if (trade.trade.side) params.set('side', trade.trade.side);
    if (Number.isFinite(trade.trade.price)) params.set('price', String(trade.trade.price));
    if (Number.isFinite(trade.trade.size)) params.set('size', String(trade.trade.size));
    if (Number.isFinite(trade.trade.timestamp)) params.set('timestamp', String(trade.trade.timestamp));
    if (trade.trader.displayName) params.set('traderName', trade.trader.displayName);
    if (trade.trader.wallet) params.set('traderWallet', trade.trader.wallet);

    router.push(`/trade-execute?${params.toString()}`);
  };

  // Check if a trade is copied
  const isTraceCopied = (trade: FeedTrade): boolean => {
    const tradeKey = buildCopiedTradeKey(
      getMarketKeyForTrade(trade),
      trade.trader.wallet
    );
    return tradeKey ? copiedTradeIds.has(tradeKey) : false;
  };

  const toggleTradeExpanded = (tradeId: string) => {
    setExpandedTradeIds((prev) => {
      const next = new Set(prev);
      if (next.has(tradeId)) {
        next.delete(tradeId);
      } else {
        next.add(tradeId);
      }
      return next;
    });
  };

  const draftCategoryLabel =
    CATEGORY_OPTIONS.find((option) => option.value === draftFilters.category)?.label ?? 'All';
  const draftTradeSizeLabel =
    TRADE_SIZE_OPTIONS.find((option) => option.value === draftFilters.tradeSizeMin)?.label ??
    (draftFilters.tradeSizeMin > 0 ? formatTradeSize(draftFilters.tradeSizeMin) : 'Any');
  const draftTradingStrategyLabel = (() => {
    if (draftFilters.tradingStrategies.length === 0) return 'All';
    if (draftFilters.tradingStrategies.length === 1) {
      return (
        TRADING_STRATEGY_OPTIONS.find(
          (option) => option.value === draftFilters.tradingStrategies[0]
        )?.label ?? 'All'
      );
    }
    return `${draftFilters.tradingStrategies.length} selected`;
  })();
  const draftResolvingLabel =
    RESOLVING_OPTIONS.find((option) => option.value === draftFilters.resolvingWindow)?.label ?? 'Any';
  const draftPriceLabel = (() => {
    const min = draftFilters.priceMinCents;
    const max = draftFilters.priceMaxCents;
    if (min <= PRICE_RANGE.min && max >= PRICE_RANGE.max) return 'Any';
    if (min > PRICE_RANGE.min && max < PRICE_RANGE.max) {
      return `${formatPriceCents(min)}-${formatPriceCents(max)}`;
    }
    if (min > PRICE_RANGE.min) return `${formatPriceCents(min)}+`;
    return `Up to ${formatPriceCents(max)}`;
  })();
  const draftTradersLabel = draftFilters.traderIds.length > 0
    ? `${draftFilters.traderIds.length} selected`
    : 'Any';

  const filterPanel = (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex-1 px-4 py-3">
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-900">Category</span>
              <span className="text-xs font-medium text-slate-500">{draftCategoryLabel}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((category) => (
                <button
                  key={category.value}
                  onClick={() =>
                    setDraftFilters((prev) => ({ ...prev, category: category.value }))
                  }
                  aria-pressed={draftFilters.category === category.value}
                  className={cn(
                    categoryPillBase,
                    draftFilters.category === category.value
                      ? categoryPillActive
                      : categoryPillInactive
                  )}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setDraftFilters((prev) => ({
                  ...prev,
                  status: prev.status === 'live' ? 'all' : 'live',
                }))
              }
              aria-pressed={draftFilters.status === 'live'}
              className={cn(
                togglePillBase,
                draftFilters.status === 'live' ? togglePillActive : togglePillInactive
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-2 w-2 rounded-full",
                  draftFilters.status === 'live' ? "bg-emerald-500" : "bg-slate-300"
                )}
              />
              Live Games Only
            </button>
            <button
              type="button"
              onClick={() =>
                setDraftFilters((prev) => ({
                  ...prev,
                  positionsOnly: !prev.positionsOnly,
                }))
              }
              aria-pressed={draftFilters.positionsOnly}
              className={cn(
                togglePillBase,
                draftFilters.positionsOnly ? togglePillActive : togglePillInactive
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-2 w-2 rounded-full",
                  draftFilters.positionsOnly ? "bg-emerald-500" : "bg-slate-300"
                )}
              />
              My Positions Only
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-900">Trade Size</span>
              <span className="text-xs font-medium text-slate-500">{draftTradeSizeLabel}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {TRADE_SIZE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() =>
                    setDraftFilters((prev) => ({
                      ...prev,
                      tradeSizeMin: option.value,
                    }))
                  }
                  aria-pressed={draftFilters.tradeSizeMin === option.value}
                  className={cn(
                    filterTabBase,
                    draftFilters.tradeSizeMin === option.value
                      ? filterTabActive
                      : filterTabInactive
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowMoreFilters((prev) => !prev)}
            aria-expanded={showMoreFilters}
            aria-controls="more-filters"
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <span>{showMoreFilters ? 'Less Filters' : 'More Filters'}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                showMoreFilters && "rotate-180"
              )}
            />
          </button>

          {showMoreFilters && (
            <div id="more-filters" className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-900">Market Resolves</span>
                  <span className="text-xs font-medium text-slate-500">{draftResolvingLabel}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {RESOLVING_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() =>
                        setDraftFilters((prev) => ({
                          ...prev,
                          resolvingWindow: option.value,
                        }))
                      }
                      aria-pressed={draftFilters.resolvingWindow === option.value}
                      className={cn(
                        filterTabBase,
                        draftFilters.resolvingWindow === option.value
                          ? filterTabActive
                          : filterTabInactive
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-900">Trading Strategy</span>
                  <span className="text-xs font-medium text-slate-500">
                    {draftTradingStrategyLabel}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <button
                    onClick={() =>
                      setDraftFilters((prev) => ({
                        ...prev,
                        tradingStrategies: [],
                      }))
                    }
                    aria-pressed={draftFilters.tradingStrategies.length === 0}
                    className={cn(
                      filterTabBase,
                      draftFilters.tradingStrategies.length === 0
                        ? filterTabActive
                        : filterTabInactive
                    )}
                  >
                    All
                  </button>
                  {TRADING_STRATEGY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() =>
                        setDraftFilters((prev) => ({
                          ...prev,
                          tradingStrategies: prev.tradingStrategies.includes(option.value)
                            ? prev.tradingStrategies.filter((value) => value !== option.value)
                            : [...prev.tradingStrategies, option.value],
                        }))
                      }
                      aria-pressed={draftFilters.tradingStrategies.includes(option.value)}
                      className={cn(
                        filterTabBase,
                        draftFilters.tradingStrategies.includes(option.value)
                          ? filterTabActive
                          : filterTabInactive
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-900">Current Price</span>
                  <span className="text-xs font-medium text-slate-500">{draftPriceLabel}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {PRICE_PRESET_OPTIONS.map((preset) => {
                    const isActive =
                      draftFilters.priceMinCents === preset.min &&
                      draftFilters.priceMaxCents === preset.max;
                    return (
                      <button
                        key={preset.label}
                        onClick={() => updateDraftPriceRange(preset.min, preset.max)}
                        aria-pressed={isActive}
                        className={cn(filterTabBase, isActive ? filterTabActive : filterTabInactive)}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 lg:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-900">Traders</span>
                    <span className="text-xs font-medium text-slate-500">{draftTradersLabel}</span>
                  </div>
                  {draftFilters.traderIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDraftFilters((prev) => ({ ...prev, traderIds: [] }))
                      }
                      className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={traderSearch}
                    onChange={(event) => {
                      setTraderSearch(event.target.value);
                      setShowAllTraders(false);
                    }}
                    placeholder="Search followed traders"
                    className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {visibleTraderOptions.map((trader) => {
                    const isSelected = draftTraderSet.has(trader.wallet);
                    const displayName = trader.name || formatWallet(trader.wallet);
                    return (
                      <button
                        key={trader.wallet}
                        type="button"
                        onClick={() => toggleDraftTrader(trader.wallet)}
                        aria-pressed={isSelected}
                        className={cn(
                          "flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left transition",
                          isSelected
                            ? "border-slate-900/15 bg-slate-100 text-slate-900"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                            {displayName.charAt(0).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-900">
                              {displayName}
                            </span>
                            <span className="block truncate text-[11px] text-slate-500">
                              {formatWallet(trader.wallet)}
                            </span>
                          </span>
                        </span>
                        {isSelected && <Check className="h-4 w-4 text-slate-900" />}
                      </button>
                    );
                  })}
                </div>
                {filteredTraderOptions.length === 0 && (
                  <p className="mt-2 text-sm text-slate-500">No traders match your search.</p>
                )}
                {filteredTraderOptions.length > 8 && (
                  <button
                    type="button"
                    onClick={() => setShowAllTraders((prev) => !prev)}
                    className="mt-2 text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                  >
                    {showAllTraders
                      ? 'Show less'
                      : `Show more (${filteredTraderOptions.length - 8})`}
                  </button>
                )}
              </div>
            </div>
          )}
          {hasDraftFilters && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={clearDraftFilters}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Clear All
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );

  // Loading state - but allow content to show if auth is taking too long
  // This prevents infinite hanging when there are auth issues
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        console.warn('Loading timeout - allowing content to render');
        setLoadingTimeout(true);
      }
    }, 8000); // 8 second timeout
    return () => clearTimeout(timeout);
  }, [loading]);

  if (loading && !loadingTimeout) {
    return (
      <>
        <Navigation 
        user={user ? { id: user.id, email: user.email || '' } : null} 
        isPremium={isPremium}
        walletAddress={walletAddress}
        profileImageUrl={profileImageUrl}
      />
        <div className="min-h-screen bg-slate-50 pb-24 w-full max-w-full overflow-x-hidden flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#FDB022] mx-auto mb-4"></div>
            <p className="text-slate-600 text-lg">Loading...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navigation 
        user={user ? { id: user.id, email: user.email || '' } : null} 
        isPremium={isPremium}
        walletAddress={walletAddress}
        profileImageUrl={profileImageUrl}
      />

      <div className="min-h-screen bg-slate-50 md:pt-0 pb-36 md:pb-8 overflow-x-hidden">
        {/* Page Header */}
        {/* Mobile header - logo only */}
        <div className="md:hidden sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200">
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

        {/* Desktop + Mobile filter/refresh section */}
        <div className="sticky top-[57px] md:top-0 z-10 bg-white/95 backdrop-blur-sm md:bg-slate-50 md:border-0">
          <div className="max-w-[1200px] mx-auto px-4 md:px-6 pb-2 md:py-3">
            <div className="w-full md:w-[63%] md:mx-auto">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              {hasPremiumAccess && walletAddress && (
                <a
                  href="https://polymarket.com/portfolio"
                  target="_blank"
                  rel="noreferrer"
                  className="md:hidden flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm mt-2"
                >
                  <span className="text-[11px] font-semibold leading-tight text-slate-600">
                    <span className="block">Polymarket</span>
                    <span className="block">Account</span>
                  </span>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-[11px] font-semibold text-slate-900">Portfolio</div>
                      <div className="text-xs font-medium text-emerald-600">
                        {loadingBalance
                          ? '...'
                          : portfolioValue !== null
                          ? `$${portfolioValue.toFixed(2)}`
                          : '$0.00'}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-900">
                        <span>Cash</span>
                        {showLowBalanceCallout && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-[10px] font-bold text-rose-600"
                                  aria-label="Low cash balance"
                                >
                                  !
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[220px]">
                                <p>{LOW_BALANCE_TOOLTIP}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <div className="text-xs font-medium text-slate-600">
                        {loadingBalance ? '...' : cashBalance !== null ? `$${cashBalance.toFixed(2)}` : '$0.00'}
                      </div>
                    </div>
                  </div>
                </a>
              )}
              <div className="flex flex-col gap-2 md:flex-1 mt-2 md:mt-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {userTier === 'admin' && (
                      <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-1 py-1 shadow-sm">
                        {(['all', 'fire'] as FeedMode[])
                          .filter((mode) => mode === 'fire' ? userTier === 'admin' : true)
                          .map((mode) => {
                            const isActive = feedMode === mode;
                            return (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => {
                                  if (feedMode !== mode) {
                                    setFeedMode(mode);
                                  }
                                }}
                                aria-pressed={isActive}
                                className={cn(
                                  modeTabBase,
                                  isActive ? modeTabActive : modeTabInactive
                                )}
                                title={mode === 'fire' ? 'Admin-only curated feed' : 'Followed traders'}
                              >
                                {mode === 'fire' ? '🔥' : 'All'}
                              </button>
                            );
                          })}
                      </div>
                    )}
                    <Button
                      onClick={filtersOpen ? closeFilters : openFilters}
                      variant="outline"
                      size="sm"
                      className="border-slate-300 text-slate-700 hover:bg-slate-50 bg-white flex items-center gap-2"
                      aria-label="Open filters"
                    >
                      <Filter className="h-4 w-4" />
                      <span className="text-sm font-semibold">
                        Filter{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}
                      </span>
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleManualRefresh}
                      disabled={isRefreshing || loadingFeed}
                      variant="outline"
                      size="icon"
                      className="border-slate-300 text-slate-700 hover:bg-slate-50 bg-transparent flex-shrink-0 transition-all"
                      aria-label="Refresh feed"
                    >
                      <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                    </Button>
                    {lastFeedFetchAt && (
                      <span className="text-xs text-slate-500">
                        {`Last updated ${getRelativeTime(lastFeedFetchAt)}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>

        <div className="max-w-[1200px] mx-auto px-4 md:px-6 pt-2 pb-4 md:pt-4 md:pb-6">
          <div className="space-y-5">
            <div className="min-w-0 space-y-4">
              <div className="md:w-[63%] md:mx-auto">
                {filtersOpen && (
                  <div ref={filtersPanelRef} aria-label="Filters">
                    {filterPanel}
                  </div>
                )}
              </div>

              {/* Feed Content */}
              {isInitialFeedLoading ? (
                <div className="w-full md:w-[63%] md:mx-auto">
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center space-y-2">
                    <RefreshCw
                      className="mx-auto h-10 w-10 text-slate-400 animate-spin"
                      aria-hidden="true"
                    />
                    <p className="text-lg font-semibold text-slate-900">Loading trades…</p>
                    <p className="text-sm text-slate-500">
                      Hang tight while we pull in the latest activity for your feed.
                    </p>
                  </div>
                </div>
              ) : loadingFeed ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="w-full md:w-[63%] md:mx-auto">
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 animate-pulse">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-slate-200 rounded-full"></div>
                          <div className="flex-1">
                            <div className="h-4 bg-slate-200 rounded w-1/3 mb-2"></div>
                            <div className="h-4 bg-slate-200 rounded w-3/4 mb-3"></div>
                            <div className="h-3 bg-slate-200 rounded w-1/4"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
                  <div className="text-6xl mb-4">⚠️</div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Failed to load feed</h3>
                  <p className="text-slate-600 mb-6">{error}</p>
                  <Button
                    onClick={() => window.location.reload()}
                    className="bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-semibold"
                  >
                    Try Again
                  </Button>
                </div>
              ) : sourceTraderCount === 0 ? (
                feedMode === 'fire' ? (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
                    <div className="text-6xl mb-4">🔥</div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2">No 🔥 traders yet</h3>
                    <p className="text-slate-600">
                      We couldn't find top-ROI traders with strong conviction right now. Check back soon.
                    </p>
                  </div>
                ) : (
                  <EmptyState
                    icon={Activity}
                    title="Your feed is empty"
                    description="Follow traders on the Discover page to see their activity here"
                  />
                )
              ) : displayedTrades.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
                  <div className="text-6xl mb-4">{feedMode === 'fire' ? '🔥' : '🔍'}</div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">
                    {feedMode === 'fire' ? 'No trades meet the 🔥 criteria' : 'No trades match your filters'}
                  </h3>
                  <p className="text-slate-600">
                    {feedMode === 'fire'
                      ? 'We filter for high-conviction or high-win-rate moves from top 30-day ROI traders.'
                      : 'Try selecting a different filter to see more trades.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4" ref={feedListRef}>
                  {displayedTrades.map((trade) => {
                    const marketKey = getMarketKeyForTrade(trade);
                    const marketKeyVariants = getMarketKeyVariantsForTrade(trade);
                    const liveMarket = marketKey ? liveMarketData.get(marketKey) : undefined
                    const currentPrice = getCurrentOutcomePrice(trade);
                    const traderKey = normalizeKeyPart(trade.trader.wallet);
                    const traderMarketKey =
                      marketKey && traderKey ? `${traderKey}-${marketKey}` : null;
                    const traderTrades = traderMarketKey
                      ? traderMarketTrades.get(traderMarketKey) ?? []
                      : [];
                    const traderHasExistingPosition = traderTrades.length > 0;
                    const traderPositionBadge = traderHasExistingPosition
                      ? {
                          label: 'Trader Position',
                          variant: 'trader' as const,
                          trades: traderTrades,
                        }
                      : undefined;

                    let userTrades: PositionTradeSummary[] = [];
                    for (const key of marketKeyVariants) {
                      const trades = userPositionTradesByMarket.get(key);
                      if (trades && trades.length > 0) {
                        userTrades = trades;
                        break;
                      }
                    }
                    const userPositionBadge =
                      userTrades.length > 0
                        ? {
                            label: 'Your Position',
                            variant: 'user' as const,
                            trades: userTrades,
                          }
                        : undefined;
                    
                    // Create a unique key by combining multiple fields to prevent duplicate keys
                    // This ensures uniqueness even if buildFeedTradeId creates duplicate IDs
                    const uniqueKey = `${trade.id}-${trade.trader.wallet}-${trade.trade.timestamp}-${trade.trade.side}-${trade.trade.outcome}`;
                    const tradeKey = uniqueKey;
                    const tradeAnchorId = `trade-card-${trade.id}`;
                    const pinKey = buildPinnedTradeKey(trade);
                    const isPinned = pinKey ? pinnedTradeIds.has(pinKey) : false;
                    const marketAvatar =
                      liveMarket?.marketAvatarUrl || trade.market.avatarUrl || null;
                    const badgeState = deriveBadgeStateForTrade(trade);
                    const marketCategoryType = resolveCategoryForTrade(trade, liveMarket);

                    return (
                      <div
                        className="w-full md:w-[63%] md:mx-auto"
                        key={tradeKey}
                        data-trade-id={trade.id}
                      >
                        <TradeCard
                          tradeAnchorId={tradeAnchorId}
                          onExecutionNotification={handleTradeExecutionNotification}
                          trader={{
                            name: trade.trader.displayName,
                            address: trade.trader.wallet,
                            id: trade.trader.wallet,
                          }}
                          market={trade.market.title}
                          marketAvatar={marketAvatar ?? undefined}
                          position={trade.trade.outcome}
                          action={trade.trade.side === 'BUY' ? 'Buy' : 'Sell'}
                          price={trade.trade.price}
                          size={trade.trade.size}
                          total={trade.trade.price * trade.trade.size}
                          timestamp={getRelativeTime(trade.trade.timestamp)}
                          tradeTimestamp={trade.trade.timestamp}
                          onCopyTrade={() => handleCopyTrade(trade)}
                          onMarkAsCopied={(entryPrice, amountInvested) =>
                            handleMarkAsCopied(trade, entryPrice, amountInvested)
                          }
                          onAdvancedCopy={() => handleRealCopy(trade)}
                          isPremium={tierHasPremiumAccess(userTier)}
                          isAdmin={userTier === 'admin'}
                          isExpanded={expandedTradeIds.has(tradeKey)}
                          onToggleExpand={() => toggleTradeExpanded(tradeKey)}
                          isCopied={isTraceCopied(trade)}
                          conditionId={trade.market.conditionId}
                          tokenId={trade.trade.tokenId}
                          marketSlug={trade.market.slug}
                          currentMarketPrice={currentPrice}
                          currentMarketUpdatedAt={liveMarket?.updatedAt}
                          marketIsOpen={liveMarket?.resolved === undefined ? undefined : !liveMarket.resolved}
                          category={marketCategoryType}
                          liveScore={liveMarket?.scoreText ?? undefined}
                          eventStartTime={liveMarket?.gameStartTime ?? undefined}
                          eventEndTime={liveMarket?.endDateIso ?? undefined}
                          eventStatus={liveMarket?.eventStatus ?? undefined}
                          liveStatus={liveMarket?.liveStatus}
                          polymarketUrl={
                            (liveMarket?.eventSlug || trade.market.eventSlug)
                              ? `https://polymarket.com/event/${liveMarket?.eventSlug || trade.market.eventSlug}`
                              : trade.market.slug 
                              ? `https://polymarket.com/market/${trade.market.slug}`
                              : undefined
                          }
                          espnUrl={liveMarket?.espnUrl}
                          defaultBuySlippage={defaultBuySlippage}
                          defaultSellSlippage={defaultSellSlippage}
                          walletAddress={walletAddress}
                          manualTradingEnabled={manualModeEnabled}
                          onSwitchToManualTrading={enableManualMode}
                          onOpenConnectWallet={() => setShowConnectWalletModal(true)}
                          isPinned={isPinned}
                          onTogglePin={pinKey ? () => togglePinnedTrade(trade) : undefined}
                          traderPositionBadge={traderPositionBadge}
                          userPositionBadge={userPositionBadge}
                          onSellPosition={() => handleSellTrade(trade, marketAvatar)}
                          fireReasons={trade.fireReasons}
                          fireScore={trade.fireScore}
                          fireWinRate={trade.fireWinRate}
                          fireRoi={trade.fireRoi}
                          fireConviction={trade.fireConviction}
                          tags={(() => {
                            const tagsToPass = Array.isArray(trade.market.tags) && trade.market.tags.length > 0 ? trade.market.tags : null;
                            if (!tagsToPass && trade.market.conditionId) {
                              console.warn(`[Feed] STEP 6: Passing null tags to TradeCard for ${trade.market.conditionId}`, {
                                conditionId: trade.market.conditionId,
                                hasTags: !!trade.market.tags,
                                tagsType: typeof trade.market.tags,
                                tagsIsArray: Array.isArray(trade.market.tags),
                                tagsValue: trade.market.tags,
                              });
                            } else if (tagsToPass) {
                              console.log(`[Feed] ✅ STEP 6: Passing tags to TradeCard for ${trade.market.conditionId}:`, tagsToPass);
                            }
                            return tagsToPass;
                          })()}
                        />
                      </div>
                    )
                  })}
                  
                  {/* Load More Button */}
                  {hasMoreTrades && (
                    <div className="flex justify-center pt-4">
                      <Button
                        onClick={handleLoadMore}
                        variant="outline"
                        className="bg-white hover:bg-slate-50 text-slate-900 font-semibold py-3 px-8 border-2 border-slate-200"
                      >
                        Load More Trades
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {showBackToTop && (
        <div
          className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,_0px)+80px)] md:bottom-6 z-40 pointer-events-none"
        >
          <div className="max-w-[1200px] mx-auto px-4 md:px-6">
            <div className="md:w-[63%] md:mx-auto flex justify-end">
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                aria-label="Back to top"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
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
      {closeTarget && (
        <ClosePositionModal
          target={closeTarget}
          isSubmitting={closeSubmitting}
          submitError={closeError}
          onClose={() => {
            setCloseTarget(null);
            setCloseError(null);
            setCloseOrderId(null);
            setCloseSubmittedAt(null);
          }}
          onSubmit={handleConfirmClose}
          orderId={closeOrderId}
          submittedAt={closeSubmittedAt}
        />
      )}
      {showSellToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg">
            {sellToastMessage}
          </div>
        </div>
      )}
    </>
  );
}
