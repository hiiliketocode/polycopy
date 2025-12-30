'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowDown, Copy, Check, ArrowUpRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Header from '@/app/components/Header';
import type { User } from '@supabase/supabase-js';
import { extractMarketAvatarUrl } from '@/lib/marketAvatar';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';


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
  const [inputMode, setInputMode] = useState<'usd' | 'contracts'>('usd');
  const [usdInput, setUsdInput] = useState('');
  const [contractsInput, setContractsInput] = useState('');
  const [slippageOption, setSlippageOption] = useState<number | 'custom'>(1);
  const [customSlippage, setCustomSlippage] = useState('');
  const [availableCashValue, setAvailableCashValue] = useState<string | null>(null);
  const [availableCashLoading, setAvailableCashLoading] = useState(false);
  const [availableCashError, setAvailableCashError] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    if (!isOpen || !trade) return;

    let cancelled = false;
    const controller = new AbortController();

    setInputMode('usd');
    setUsdInput('');
    setContractsInput('');
    setSlippageOption(1);
    setCustomSlippage('');
    setAvatarFailed(false);
    setAvailableCashValue(null);
    setAvailableCashError(null);
    setAvailableCashLoading(true);

    fetch('/api/polymarket/balance', {
      signal: controller.signal,
      credentials: 'include',
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(response.statusText || 'Failed to load available cash');
        }
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        const formatted = data.balanceFormatted
          ? data.balanceFormatted.replace(/\s*USDC$/i, '')
          : null;
        setAvailableCashValue(formatted ?? null);
      })
      .catch((error) => {
        if (cancelled || error.name === 'AbortError') return;
        setAvailableCashError(error.message || 'unavailable');
      })
      .finally(() => {
        if (cancelled) return;
        setAvailableCashLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isOpen, trade?.timestamp]);

  useEffect(() => {
    if (!isOpen) {
      setAvailableCashValue(null);
      setAvailableCashError(null);
      setAvailableCashLoading(false);
    }
  }, [isOpen]);

  if (!isOpen || !trade) return null;

  const pricePerContract = trade.price;
  const parsedUsd = parseFloat(usdInput);
  const parsedContracts = parseFloat(contractsInput);
  const usdValid = Number.isFinite(parsedUsd) && parsedUsd >= 0;
  const contractsValid = Number.isFinite(parsedContracts) && parsedContracts >= 0;
  const hasPrice = pricePerContract > 0;

  const derivedUsd =
    inputMode === 'usd'
      ? usdValid
        ? parsedUsd
        : null
      : contractsValid && hasPrice
        ? parsedContracts * pricePerContract
        : null;

  const derivedContracts =
    inputMode === 'contracts'
      ? contractsValid
        ? parsedContracts
        : null
      : usdValid && hasPrice
        ? parsedUsd / pricePerContract
        : null;

  const conversionHint =
    inputMode === 'usd'
      ? derivedContracts
        ? `${formatCurrency(derivedUsd ?? parsedUsd)} ≈ ${formatContractsValue(derivedContracts)} contracts`
        : '—'
      : derivedUsd
        ? `${formatContractsValue(derivedContracts ?? parsedContracts)} ≈ ${formatCurrency(derivedUsd)}`
        : '—';

  const canSubmit = typeof derivedUsd === 'number' && derivedUsd > 0;
  const livePrice = trade.currentPrice ?? trade.price;
  const livePriceLabel = livePrice !== undefined && livePrice !== null ? formatCurrency(livePrice) : '—';
  const liveContractsLabel = derivedContracts !== null
    ? formatContractsValue(derivedContracts)
    : formatContractsValue(trade.size);
  const directionDisplay = trade.side
    ? `${trade.side[0].toUpperCase()}${trade.side.slice(1).toLowerCase()}`
    : 'Buy';
  const outcomeDisplay = trade.outcome
    ? `${trade.outcome[0].toUpperCase()}${trade.outcome.slice(1).toLowerCase()}`
    : '—';
  const timestampLabel = formatAbsoluteTimestamp(trade.timestamp);
  const relativeLabel = formatRelativeTimestamp(trade.timestamp);
  const filledPriceLabel = formatCurrency(trade.price);
  const contractsLabel = formatContractsValue(trade.size);
  const totalCostLabel = formatCurrency(trade.price * trade.size);
  const payoutLabel = formatCurrency(trade.size);
  const statusIsOpen = trade.status === 'Open';
  const statusLabel = statusIsOpen ? 'Market Open' : 'Market Closed';
  const statusClasses = statusIsOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600';
  const availableCashLabel = availableCashLoading ? 'Loading...' : (availableCashValue ?? '—');

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleModeToggle = (mode: 'usd' | 'contracts') => {
    if (mode === inputMode) return;
    if (mode === 'contracts' && usdValid && hasPrice) {
      setContractsInput((parsedUsd / pricePerContract).toFixed(4));
    }
    if (mode === 'usd' && contractsValid && hasPrice) {
      setUsdInput((parsedContracts * pricePerContract).toFixed(2));
    }
    setInputMode(mode);
  };

  const handleSubmit = () => {
    if (!canSubmit || derivedUsd === null) return;
    onConfirm(trade.price, derivedUsd);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60"
      onClick={handleBackdropClick}
    >
      <div className="flex min-h-full w-full items-start justify-center px-4 py-8 sm:items-center">
        <div
          className="w-full max-w-3xl"
          role="dialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-2xl">
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900">Trade You're Copying</p>
                  <p className="text-xs text-slate-500">
                    This is the original trade you’re about to copy.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusClasses}`}>
                    {statusLabel}
                  </span>
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-slate-400 hover:text-slate-600"
                    aria-label="Close copy trade"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="relative h-12 w-12 overflow-hidden rounded-full bg-slate-100">
                  {trade.marketAvatarUrl && !avatarFailed ? (
                    <img
                      src={trade.marketAvatarUrl}
                      alt={`${trade.market} avatar`}
                      className="h-full w-full object-cover"
                      onError={() => setAvatarFailed(true)}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-400">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7h16M4 12h16M4 17h16" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-slate-900 break-words">{trade.market}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                    {[
                      ['Direction', directionDisplay],
                      ['Outcome', outcomeDisplay],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold tracking-wide text-slate-400">{label}</span>
                        <span className="rounded-full bg-slate-900 px-3 py-0.5 text-xs font-semibold text-white">
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="flex min-w-[520px] items-center gap-6 text-xs text-slate-500">
                  {[
                    ['Filled Price', filledPriceLabel],
                    ['Contracts', contractsLabel],
                    ['Total Cost', totalCostLabel],
                    ['Payout If Wins', payoutLabel],
                  ].map(([label, value]) => (
                    <div key={label} className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold tracking-wide text-slate-400">
                        {label}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500">
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold tracking-wide text-slate-400">Timestamp</span>
                  <span className="text-sm text-slate-900">{timestampLabel}</span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-[10px] font-semibold tracking-wide text-slate-400">Time Since Filled</span>
                  <span className="text-sm text-slate-900">{relativeLabel}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-100 bg-slate-50">
                <ArrowDown className="h-5 w-5 text-slate-400" />
              </div>
            </div>

            <div className="space-y-5 pt-2">
              <div className="flex items-start justify-between">
                <p className="text-lg font-semibold text-slate-900">Your Order</p>
                <div className="text-right">
                  <p className="text-[10px] font-semibold tracking-wide text-slate-400">Cash Available</p>
                  <p className="text-sm font-semibold text-slate-900">{availableCashLabel}</p>
                </div>
              </div>
              {availableCashError && (
                <p className="text-xs text-rose-500">{availableCashError}</p>
              )}

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex gap-2 rounded-full bg-white/80 p-1">
                  <button
                    type="button"
                    onClick={() => handleModeToggle('usd')}
                    className={`flex-1 rounded-2xl px-3 py-1.5 text-sm font-semibold transition ${
                      inputMode === 'usd'
                        ? 'bg-slate-900 text-white shadow'
                        : 'text-slate-500'
                    }`}
                  >
                    usd
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeToggle('contracts')}
                    className={`flex-1 rounded-2xl px-3 py-1.5 text-sm font-semibold transition ${
                      inputMode === 'contracts'
                        ? 'bg-slate-900 text-white shadow'
                        : 'text-slate-500'
                    }`}
                  >
                    contracts
                  </button>
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={inputMode === 'usd' ? usdInput : contractsInput}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (inputMode === 'usd') {
                      setUsdInput(value);
                    } else {
                      setContractsInput(value);
                    }
                  }}
                  placeholder={inputMode === 'usd' ? '0.00' : '0.00'}
                  className="w-full rounded-2xl border border-slate-200 bg-white py-5 px-5 text-3xl font-semibold text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FDB022]"
                />
                <p className="text-sm text-slate-500">{conversionHint}</p>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-end gap-2">
                  <span className="text-[10px] font-semibold tracking-wide text-slate-400">live price</span>
                  <span className="text-sm font-semibold text-slate-900">{livePriceLabel}</span>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-[10px] font-semibold tracking-wide text-slate-400">contracts</span>
                  <span className="text-sm font-semibold text-slate-900">{liveContractsLabel}</span>
                </div>
              </div>

              <div className="space-y-2 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  {[...SLIPPAGE_PRESETS].map((percent) => (
                    <button
                      type="button"
                      key={percent}
                      onClick={() => setSlippageOption(percent)}
                      className={`rounded-full px-3 py-1 font-semibold transition ${
                        slippageOption === percent
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-600'
                      }`}
                    >
                      {percent}%
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSlippageOption('custom')}
                    className={`rounded-full px-3 py-1 font-semibold transition ${
                      slippageOption === 'custom'
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-600'
                      }`}
                  >
                    Custom
                  </button>
                  {slippageOption === 'custom' && (
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={customSlippage}
                      onChange={(event) => setCustomSlippage(event.target.value)}
                      placeholder="0.5"
                      className="w-20 rounded-2xl border border-slate-200 bg-white px-3 py-1 text-sm text-slate-900"
                    />
                  )}
                </div>
              </div>

              <div className="text-xs text-slate-500">
                Order behavior · <span className="text-slate-900">immediate or cancel</span>
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || isSubmitting}
                className="w-full rounded-2xl bg-[#FDB022] py-3 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-[#E69E1A] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? 'Sending…' : 'send order'}
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
  marketAvatarUrl?: string;
}

function formatCurrency(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function formatContractsValue(value: number | null | undefined, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function formatAbsoluteTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  const dateLabel = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeLabel = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${dateLabel} · ${timeLabel}`;
}

function formatRelativeTimestamp(timestamp: number) {
  if (!timestamp) {
    return '—';
  }
  const diff = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diff < 60) {
    return 'just now';
  }
  const minutes = Math.floor(diff / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const SLIPPAGE_PRESETS = [0, 1, 3, 5];

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
  const [loadingTrades, setLoadingTrades] = useState(true); // Start as true to show loading state initially
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
      try {
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
      } catch (error) {
        console.error('Error in checkFollowStatus:', error);
      } finally {
        // Always set loading to false, even if there's an error
        setCheckingFollow(false);
      }
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
            timestamp: timestampMs, // Use converted milliseconds timestamp
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
            marketAvatarUrl: extractMarketAvatarUrl(trade) ?? undefined,
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
  }, [wallet, openMarketIds]); // Fetch trades immediately when wallet loads

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

  // Format percentage with sign
  const formatPercentage = (value: number) => {
    return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
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
    <div className="min-h-screen bg-slate-50 pt-4 md:pt-0 pb-20 md:pb-8">
      <Header />

      {/* Profile Header Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 sm:py-6 space-y-4 sm:space-y-6">
        <Card className="bg-white border-slate-200 p-4 sm:p-8">
          {/* Profile Header with Avatar, Name, and Follow Button */}
          <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-5">
            <Avatar className="h-16 w-16 sm:h-20 sm:w-20 border-2 border-white shadow-md flex-shrink-0">
              <AvatarFallback 
                className="text-slate-900 text-xl font-semibold"
                style={{ backgroundColor: avatarColor }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">{displayName}</h1>
              <p className="text-xs sm:text-sm font-mono text-slate-500 mb-2 sm:mb-3">{abbreviateWallet(wallet)}</p>

              <a
                href={`https://polymarket.com/profile/${wallet}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden md:inline-flex items-center gap-1 text-sm text-slate-600 hover:text-yellow-600 transition-colors"
              >
                View on Polymarket
                <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>

            {/* Follow Button */}
            <div className="flex-shrink-0">
              {following ? (
                <button
                  onClick={handleFollowToggle}
                  disabled={followLoading || checkingFollow}
                  className="border border-slate-300 text-slate-700 hover:bg-slate-50 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Following</span>
                </button>
              ) : (
                <button
                  onClick={handleFollowToggle}
                  disabled={followLoading || checkingFollow}
                  className="bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-semibold shadow-sm px-4 py-2 rounded-md text-sm"
                >
                  Follow
                </button>
              )}
            </div>
          </div>

          {/* Stats Grid - Desktop: 4 column grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
            {/* Desktop Stat Cards */}
            <div className="text-center p-2 sm:p-4 bg-slate-50 rounded-lg">
              <div className="text-xs font-medium text-slate-500 mb-1">ROI</div>
              <div className={`text-lg sm:text-2xl font-bold ${
                roi !== '--' && parseFloat(String(roi)) > 0 ? 'text-emerald-600' : 
                roi !== '--' && parseFloat(String(roi)) < 0 ? 'text-red-500' : 'text-slate-900'
              }`}>
                {roi !== '--' ? `${formatPercentage(parseFloat(String(roi)))}` : '--'}
              </div>
            </div>
            <div className="text-center p-2 sm:p-4 bg-slate-50 rounded-lg">
              <div className="text-xs font-medium text-slate-500 mb-1">Profit</div>
              <div className={`text-lg sm:text-2xl font-bold ${
                traderData.pnl > 0 ? 'text-emerald-600' : traderData.pnl < 0 ? 'text-red-500' : 'text-slate-900'
              }`}>
                {formatPnL(traderData.pnl)}
              </div>
            </div>
            <div className="text-center p-2 sm:p-4 bg-slate-50 rounded-lg">
              <div className="text-xs font-medium text-slate-500 mb-1">Win Rate</div>
              <div className="text-lg sm:text-2xl font-bold text-slate-900">
                {winRate !== '--' ? `${winRate}%` : '--'}
              </div>
            </div>
            <div className="text-center p-2 sm:p-4 bg-slate-50 rounded-lg">
              <div className="text-xs font-medium text-slate-500 mb-1">Volume</div>
              <div className="text-lg sm:text-2xl font-bold text-slate-900">
                {formatVolume(traderData.volume)}
              </div>
            </div>
          </div>



          {/* View on Polymarket Link */}
          <a
            href={`https://polymarket.com/profile/${wallet}`}
            target="_blank"
            rel="noopener noreferrer"
            className="md:hidden flex items-center justify-center gap-1 text-sm text-slate-600 hover:text-yellow-600 transition-colors pt-4 mt-4 border-t border-slate-200"
          >
            View on Polymarket
            <ArrowUpRight className="h-3 w-3" />
          </a>
          
          {/* Stats availability explanation */}
          {(traderData.pnl === null || traderData.pnl === undefined || !leaderboardData) && (
            <p className="text-xs text-slate-500 mt-3 text-center md:text-left">
              ℹ️ Stats unavailable - This trader is not on Polymarket's leaderboard
            </p>
          )}
        </Card>
      </div>

      {/* Trade History Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
        <h3 className="text-xl font-bold text-slate-900">
          Positions {trades.length > 0 && <span className="text-slate-400 font-normal">({trades.length})</span>}
        </h3>
        
        {loadingTrades ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-[#FDB022] mx-auto mb-4"></div>
            <p className="text-slate-500">Loading trades...</p>
          </div>
        ) : trades.length === 0 ? (
          <Card className="bg-white border-slate-200 p-12 text-center">
            <div className="text-6xl mb-4">📊</div>
            <p className="text-slate-600 text-lg font-medium mb-2">
              No trade history found
            </p>
            <p className="text-slate-500 text-sm">
              This trader hasn't made any trades yet
            </p>
          </Card>
        ) : (
          <>
            {/* Desktop: Table View */}
            <Card className="hidden md:block bg-white border-slate-200 overflow-hidden">
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
                                  hour12: true,
                                  timeZoneName: 'short'
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
            </Card>

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
                  <Card key={`${trade.timestamp}-${index}`} className="bg-white border-slate-200 p-5">
                    {/* Header: Date + Status + Outcome Badge */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <span className="text-sm text-slate-500">{trade.formattedDate}</span>
                          <span className="text-xs text-slate-400">
                            {new Date(trade.timestamp).toLocaleTimeString('en-US', { 
                              hour: 'numeric', 
                              minute: '2-digit',
                              hour12: true,
                              timeZoneName: 'short'
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
                  </Card>
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
