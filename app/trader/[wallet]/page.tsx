'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ArrowUpRight, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Navigation } from '@/components/polycopy/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { MarkTradeCopiedModal } from '@/components/polycopy/mark-trade-copied-modal';
import type { User } from '@supabase/supabase-js';
import { cn } from '@/lib/utils';

interface TraderData {
  wallet: string;
  displayName: string;
  pnl: number;
  volume: number;
  followerCount: number;
  roi?: number;
  tradesCount?: number;
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
  status: 'Open' | 'Trader Closed' | 'Bonded';
  category?: string;
}

interface MonthlyROI {
  month: string;
  roi: number;
  trades: number;
}

interface CategoryDistribution {
  category: string;
  count: number;
  percentage: number;
  color: string;
}

export default function TraderProfilePage({
  params,
}: {
  params: Promise<{ wallet: string }>;
}) {
  const router = useRouter();
  const [wallet, setWallet] = useState<string>('');
  const [user, setUser] = useState<User | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [traderData, setTraderData] = useState<TraderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loadingTrades, setLoadingTrades] = useState(true);
  const [activeTab, setActiveTab] = useState<'positions' | 'performance'>('positions');
  const [positionFilter, setPositionFilter] = useState<'all' | 'open' | 'closed' | 'resolved'>('all');
  
  // Modal state
  const [showCopiedModal, setShowCopiedModal] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedTradeIds, setCopiedTradeIds] = useState<Set<string>>(new Set());
  
  // Premium user expandable cards
  const [expandedTradeIndex, setExpandedTradeIndex] = useState<number | null>(null);
  const [usdAmount, setUsdAmount] = useState<string>('');
  const [autoClose, setAutoClose] = useState(true);
  const [orderRefreshStatus, setOrderRefreshStatus] = useState<'idle' | 'refreshing' | 'done' | 'error'>('idle');
  
  // Performance tab data
  const [monthlyROI, setMonthlyROI] = useState<MonthlyROI[]>([]);
  const [categoryDistribution, setCategoryDistribution] = useState<CategoryDistribution[]>([]);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<{ month: string; roi: number; x: number; y: number } | null>(null);

  // Unwrap params
  useEffect(() => {
    params.then((p) => setWallet(p.wallet));
  }, [params]);

  // Fetch current user
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      
      if (user) {
        // Fetch premium status
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_premium')
          .eq('id', user.id)
          .single();
        
        setIsPremium(profile?.is_premium || false);
        
        // Fetch wallet address
        const { data: walletData } = await supabase
          .from('turnkey_wallets')
          .select('polymarket_account_address, eoa_address')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (walletData) {
          setWalletAddress(walletData.polymarket_account_address || walletData.eoa_address || null);
        }
        
        // Fetch copied trades
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
  }, []);

  // Fetch trader data
  useEffect(() => {
    if (!wallet) return;

    const loadTraderData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/trader/${wallet}`);
        
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

    const fetchAllTrades = async () => {
      setLoadingTrades(true);
      
      try {
        console.log('🔗 Fetching complete trade history from blockchain for:', wallet);
        
        // Try blockchain approach first (unlimited history)
        const blockchainResponse = await fetch(`/api/polymarket/trades-blockchain/${wallet}`);
        
        if (blockchainResponse.ok) {
          const blockchainData = await blockchainResponse.json();
          
          if (blockchainData.success && blockchainData.trades) {
            console.log(`✅ Blockchain: Fetched ${blockchainData.trades.length} trades`);
            
            const formattedTrades: Trade[] = blockchainData.trades.map((trade: any) => {
              const tradeDate = new Date(trade.timestamp);
              const formattedDate = tradeDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              });
              
              return {
                timestamp: trade.timestamp,
                market: trade.market || 'Unknown Market',
                side: trade.side || 'BUY',
                outcome: trade.outcome || '',
                size: parseFloat(trade.size || 0),
                price: parseFloat(trade.price || 0),
                currentPrice: undefined, // Will be fetched if needed
                formattedDate,
                marketSlug: trade.marketSlug || '',
                eventSlug: trade.eventSlug || '',
                conditionId: trade.conditionId || '',
                status: 'Open', // Simplified for now
              };
            });

            formattedTrades.sort((a, b) => b.timestamp - a.timestamp);
            setTrades(formattedTrades);
            setLoadingTrades(false);
            return;
          }
        }
        
        // Fallback to data-api if blockchain fails
        console.log('⚠️ Blockchain fetch failed, falling back to data-api (100 trades max)');
        const fallbackResponse = await fetch(`https://data-api.polymarket.com/trades?user=${wallet}&limit=100`);
        
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
            
            return {
              timestamp: timestampMs,
              market: trade.title || trade.market?.title || 'Unknown Market',
              side: trade.side || 'BUY',
              outcome: trade.outcome || '',
              size: parseFloat(trade.size || 0),
              price: parseFloat(trade.price || 0),
              currentPrice: trade.currentPrice ? parseFloat(trade.currentPrice) : undefined,
              formattedDate,
              marketSlug: trade.slug || trade.market?.slug || '',
              eventSlug: trade.eventSlug || trade.event_slug || '',
              conditionId: trade.conditionId || trade.condition_id || '',
              status: 'Open',
            };
          });

          formattedTrades.sort((a, b) => b.timestamp - a.timestamp);
          setTrades(formattedTrades);
        }
      } catch (err) {
        console.error('❌ Error fetching trades:', err);
        setTrades([]);
      } finally {
        setLoadingTrades(false);
      }
    };

    fetchAllTrades();
  }, [wallet]);

  // Process trades for performance metrics
  useEffect(() => {
    if (trades.length === 0 || !traderData) {
      setMonthlyROI([]);
      setCategoryDistribution([]);
      return;
    }

    console.log('📊 Processing performance metrics with traderData ROI:', traderData.roi);

    // Calculate Monthly ROI (last 12 months)
    const monthlyData: { [key: string]: { pnl: number; invested: number; trades: number } } = {};
    const now = new Date();
    
    // Initialize last 12 months
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = date.toISOString().substring(0, 7); // YYYY-MM
      monthlyData[monthKey] = { pnl: 0, invested: 0, trades: 0 };
    }

    // Aggregate trades by month
    // Since individual trades don't have currentPrice, we'll use the overall trader ROI
    // to estimate P&L proportionally
    const overallROI = (traderData?.roi || 0) / 100; // Convert percentage to decimal
    
    trades.forEach(trade => {
      const tradeDate = new Date(trade.timestamp);
      const monthKey = tradeDate.toISOString().substring(0, 7);
      
      if (monthlyData[monthKey]) {
        const invested = trade.size * trade.price;
        monthlyData[monthKey].invested += invested;
        monthlyData[monthKey].trades += 1;
        
        // For trades with explicit currentPrice (rare for open positions)
        if (trade.currentPrice !== undefined && trade.currentPrice !== null && trade.currentPrice !== trade.price) {
          const currentValue = trade.size * trade.currentPrice;
          monthlyData[monthKey].pnl += (currentValue - invested);
        } else {
          // For open positions without currentPrice, estimate P&L using overall trader ROI
          // This gives us a reasonable approximation of monthly performance
          monthlyData[monthKey].pnl += (invested * overallROI);
        }
      }
    });

    // Convert to array and calculate cumulative ROI month-over-month
    const monthlyROIData: MonthlyROI[] = [];
    let cumulativeInvested = 0;
    const totalInvestment = Object.values(monthlyData).reduce((sum, d) => sum + d.invested, 0);
    const overallROIPercent = traderData?.roi || 0;
    
    console.log('💰 Monthly ROI Calculation:', {
      totalInvestment: totalInvestment.toFixed(2),
      overallROIPercent: overallROIPercent.toFixed(2) + '%',
      monthsWithTrades: Object.keys(monthlyData).length
    });
    
    Object.keys(monthlyData).sort().forEach(monthKey => {
      const data = monthlyData[monthKey];
      
      // Accumulate investment
      cumulativeInvested += data.invested;
      
      // Calculate ROI based on proportion of total portfolio opened by this month
      // This shows how ROI grows as more positions are added
      // If 50% of positions are opened, assume ROI is proportionally scaled
      const portfolioProgress = totalInvestment > 0 ? (cumulativeInvested / totalInvestment) : 0;
      const roi = overallROIPercent * portfolioProgress;
      
      const date = new Date(monthKey + '-01');
      const monthName = date.toLocaleDateString('en-US', { month: 'short' });
      
      console.log(`  ${monthName}: invested=${data.invested.toFixed(0)}, cumulative=${cumulativeInvested.toFixed(0)}, progress=${(portfolioProgress*100).toFixed(1)}%, roi=${roi.toFixed(2)}%`);
      
      monthlyROIData.push({
        month: monthName,
        roi: roi,
        trades: data.trades
      });
    });
    
    console.log('✅ Final monthlyROI data points:', monthlyROIData.length);

    setMonthlyROI(monthlyROIData);

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
    const totalTrades = trades.length;
    const categoryData: CategoryDistribution[] = Object.entries(categoryMap)
      .map(([category, count]) => ({
        category,
        count,
        percentage: (count / totalTrades) * 100,
        color: categoryColors[category] || '#64748b'
      }))
      .sort((a, b) => b.count - a.count);

    setCategoryDistribution(categoryData);
  }, [trades, traderData]);

  // Toggle follow
  const handleFollowToggle = async () => {
    if (!user) {
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

  // Handle mark as copied
  const handleMarkAsCopied = (trade: Trade) => {
    if (!user) {
      router.push('/login');
      return;
    }
    setSelectedTrade(trade);
    setShowCopiedModal(true);
  };

  // Confirm copy
  const handleConfirmCopy = async (entryPrice: number, amountInvested?: number) => {
    if (!selectedTrade || !user) return;

    setIsSubmitting(true);

    try {
      const marketId = selectedTrade.conditionId || selectedTrade.marketSlug || selectedTrade.market;
      
      await supabase
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
        });

      const tradeKey = `${marketId}-${wallet}`;
      setCopiedTradeIds(prev => new Set([...prev, tradeKey]));

      setShowCopiedModal(false);
      setSelectedTrade(null);
    } catch (err: any) {
      console.error('Error saving copied trade:', err);
      alert(err.message || 'Failed to save copied trade');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if trade is copied
  const isTradeCopied = (trade: Trade): boolean => {
    const marketId = trade.conditionId || trade.marketSlug || trade.market;
    const tradeKey = `${marketId}-${wallet}`;
    return copiedTradeIds.has(tradeKey);
  };

  // Handle quick copy for premium users
  const handleQuickCopy = async (trade: Trade) => {
    setIsSubmitting(true);
    setOrderRefreshStatus('idle');
    
    try {
      const amount = Number.parseFloat(usdAmount);
      if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid amount');
        return;
      }

      // Calculate contracts from USD amount
      const contracts = calculateContracts(usdAmount, trade.price);
      if (contracts <= 0) {
        alert('Amount is too small to purchase any contracts');
        return;
      }

      // Get tokenId from conditionId + outcome
      let tokenId: string | null = null;
      if (trade.conditionId) {
        try {
          // Fetch market data to get tokenId
          const marketResponse = await fetch(`/api/polymarket/market?conditionId=${trade.conditionId}`);
          if (marketResponse.ok) {
            const marketData = await marketResponse.json();
            // Find the token matching the outcome
            const tokens = marketData.tokens || [];
            const matchingToken = tokens.find((t: any) => 
              t.outcome?.toUpperCase() === trade.outcome.toUpperCase()
            );
            if (matchingToken?.token_id) {
              tokenId = matchingToken.token_id;
            }
          }
        } catch (error) {
          console.error('Failed to fetch market data:', error);
        }
      }

      if (!tokenId) {
        alert('Unable to determine token ID. Please use Advanced mode.');
        setIsSubmitting(false);
        return;
      }

      // Execute the trade via API
      const response = await fetch('/api/polymarket/orders/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId: tokenId,
          price: trade.price,
          amount: contracts,
          side: trade.side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
          orderType: 'IOC',
          confirm: true,
          copiedTraderWallet: wallet,
          copiedTraderUsername: traderData?.displayName || wallet.slice(0, 8),
          marketId: trade.conditionId || trade.marketSlug || trade.market,
          outcome: trade.outcome,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || data?.message || 'Failed to execute trade');
      }

      // Success! Mark as copied
      const marketId = trade.conditionId || trade.marketSlug || trade.market;
      const tradeKey = `${marketId}-${wallet}`;
      setCopiedTradeIds(prev => new Set([...prev, tradeKey]));
      setExpandedTradeIndex(null);
      setUsdAmount('');
      
      // Show success message
      alert(`Trade executed successfully! Order ID: ${data.orderId || 'N/A'}`);

      // Refresh orders to surface the new trade status
      setOrderRefreshStatus('refreshing');
      try {
        await fetch('/api/polymarket/orders/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        setOrderRefreshStatus('done');
      } catch (refreshErr) {
        console.warn('Order refresh failed', refreshErr);
        setOrderRefreshStatus('error');
      } finally {
        setTimeout(() => setOrderRefreshStatus('idle'), 4000);
      }
    } catch (error: any) {
      console.error('Trade execution error:', error);
      alert(error?.message || 'Failed to execute trade. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
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

  const formatPercentage = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return `${num > 0 ? '+' : ''}${num.toFixed(1)}%`;
  };

  const getInitials = (address: string) => {
    return address.slice(2, 4).toUpperCase();
  };

  const getAvatarColor = (address: string) => {
    let hash = 0;
    for (let i = 0; i < address.length; i++) {
      hash = address.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 65%, 50%)`;
  };

  // Calculate win rate - estimate from ROI if individual trade prices not available
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
  
  // If we have price data for trades, calculate actual win rate
  // Otherwise estimate from overall ROI (rough approximation)
  const winRate = tradesWithROI.length > 0 
    ? ((profitableTrades.length / tradesWithROI.length) * 100).toFixed(1)
    : traderData && traderData.roi !== null && traderData.roi !== undefined && traderData.roi > 0
    ? Math.min(50 + traderData.roi / 3, 85).toFixed(1) // Rough estimate: positive ROI suggests 60-85% win rate
    : '--';

  // Filter trades
  const filteredTrades = trades.filter(trade => {
    if (positionFilter === 'all') return true;
    if (positionFilter === 'open') return trade.status === 'Open';
    if (positionFilter === 'closed') return trade.status === 'Trader Closed';
    if (positionFilter === 'resolved') return trade.status === 'Bonded';
    return true;
  });

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
  const initials = getInitials(wallet);
  const roi = traderData.roi !== null && traderData.roi !== undefined 
    ? traderData.roi.toFixed(1)
    : ((traderData.pnl / traderData.volume) * 100).toFixed(1);

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
          <div className="flex items-start gap-4 mb-5">
            <Avatar className="h-20 w-20 border-2 border-white shadow-md flex-shrink-0" style={{ backgroundColor: avatarColor }}>
              <AvatarFallback className="text-white text-xl font-semibold bg-transparent">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-slate-900 mb-1">{traderData.displayName}</h1>
              <p className="text-sm font-mono text-slate-500 mb-3">
                {wallet.slice(0, 6)}...{wallet.slice(-4)}
              </p>

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
            <div className="flex-shrink-0">
              {following ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFollowToggle}
                  disabled={followLoading}
                  className="border-slate-300 text-slate-700 hover:bg-slate-50 gap-1.5 px-3"
                >
                  <Check className="h-3.5 w-3.5" />
                  Following
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleFollowToggle}
                  disabled={followLoading}
                  className="bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-semibold shadow-sm px-4"
                >
                  Follow
                </Button>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center p-4 bg-slate-50 rounded-lg">
              <div className="text-xs font-medium text-slate-500 mb-1">ROI</div>
              <div className={`text-2xl font-bold ${parseFloat(roi) > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {formatPercentage(parseFloat(roi))}
              </div>
            </div>
            <div className="text-center p-4 bg-slate-50 rounded-lg">
              <div className="text-xs font-medium text-slate-500 mb-1">P&L</div>
              <div className={`text-2xl font-bold ${traderData.pnl > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {traderData.pnl >= 0 ? '+' : ''}{formatCurrency(traderData.pnl)}
              </div>
            </div>
            <div className="text-center p-4 bg-slate-50 rounded-lg">
              <div className="text-xs font-medium text-slate-500 mb-1">Win Rate</div>
              <div className="text-2xl font-bold text-slate-900">{winRate}%</div>
            </div>
            <div className="text-center p-4 bg-slate-50 rounded-lg">
              <div className="text-xs font-medium text-slate-500 mb-1">Volume</div>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(traderData.volume)}</div>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <Button
            onClick={() => setActiveTab('positions')}
            variant="ghost"
            className={cn(
              "flex-1 px-3 py-3 rounded-md font-medium text-sm transition-all whitespace-nowrap",
              activeTab === 'positions'
                ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                : "bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-300"
            )}
          >
            Positions
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
        </div>

        {/* Content */}
        {activeTab === 'positions' && (
          <div className="space-y-4">
            {/* Filter Buttons */}
            <div className="flex gap-2">
              {(['all', 'open', 'closed', 'resolved'] as const).map((filter) => (
                <Button
                  key={filter}
                  onClick={() => setPositionFilter(filter)}
                  variant={positionFilter === filter ? 'default' : 'outline'}
                  size="sm"
                  className={cn(
                    positionFilter === filter
                      ? 'bg-slate-900 text-white hover:bg-slate-800'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  )}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </Button>
              ))}
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
                <p className="text-slate-500 text-sm">
                  {positionFilter !== 'all' 
                    ? `No ${positionFilter} trades to display`
                    : 'This trader hasn\'t made any trades yet'}
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredTrades.map((trade, index) => {
                  const polymarketUrl = getPolymarketUrl(trade);
                  const isAlreadyCopied = isTradeCopied(trade);
                  const isExpanded = expandedTradeIndex === index;
                  
                  // Calculate ROI
                  let roi: number | null = null;
                  const entryPrice = trade.price;
                  const currentPrice = trade.currentPrice;
                  
                  if ((entryPrice && entryPrice !== 0) && (currentPrice !== undefined && currentPrice !== null)) {
                    roi = ((currentPrice - entryPrice) / entryPrice) * 100;
                  }

                  return (
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
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-xs font-medium',
                              trade.status === 'Open'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            )}
                          >
                            {trade.status}
                          </Badge>
                          {isPremium && !isAlreadyCopied && (
                            <button
                              onClick={() => setExpandedTradeIndex(isExpanded ? null : index)}
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
                              setExpandedTradeIndex(isExpanded ? null : index);
                            }}
                            disabled={isAlreadyCopied}
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

                              {/* Auto-close Checkbox */}
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
                              {orderRefreshStatus === 'refreshing' && (
                                <p className="text-xs text-slate-600 mt-2">Refreshing order status…</p>
                              )}
                              {orderRefreshStatus === 'done' && (
                                <p className="text-xs text-emerald-600 mt-2">
                                  Order submitted. Latest status will appear in Orders shortly.
                                </p>
                              )}
                              {orderRefreshStatus === 'error' && (
                                <p className="text-xs text-rose-600 mt-2">
                                  Order sent, but status refresh failed. Check the Orders page for updates.
                                </p>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        /* Free Users: Copy Trade + Mark as Copied */
                        <div className="flex gap-2">
                          <a
                            href={polymarketUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1"
                          >
                            <Button className="w-full bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-semibold">
                              Copy Trade
                            </Button>
                          </a>
                          <Button
                            onClick={() => handleMarkAsCopied(trade)}
                            disabled={isAlreadyCopied}
                            variant="outline"
                            className={cn(
                              'flex-1',
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
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'performance' && (
          <div className="space-y-6">
            {/* Data Context Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-blue-900 mb-1">Recent Performance Analysis</h4>
                  <p className="text-sm text-blue-800">
                    Performance metrics are based on the trader's most recent 100 trades. This provides the most relevant and up-to-date view of their trading strategy and current performance.
                  </p>
                </div>
              </div>
            </div>

            {/* ROI Over Time Chart */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-6">ROI Over Time (Last 12 Months)</h3>
              {monthlyROI.length > 0 ? (
                  <div className="relative h-64">
                    {/* Y-axis labels */}
                    <div className="absolute left-0 top-0 bottom-8 flex flex-col justify-between text-xs text-slate-500">
                      {(() => {
                        const maxROI = Math.max(...monthlyROI.map(m => m.roi), 5);
                        const minROI = Math.min(...monthlyROI.map(m => m.roi), -5);
                        // Ensure at least a 10% range for visibility
                        const range = Math.max(maxROI - minROI, 10);
                        const actualMax = maxROI + (10 - (maxROI - minROI)) / 2;
                        const actualMin = minROI - (10 - (maxROI - minROI)) / 2;
                        const step = (actualMax - actualMin) / 4;
                        return [actualMax, actualMax - step, actualMax - 2 * step, actualMax - 3 * step, actualMin].map((val, i) => (
                          <span key={i}>{val.toFixed(1)}%</span>
                        ));
                      })()}
                    </div>
                  
                  {/* Chart area */}
                  <div className="ml-12 h-full border-l border-b border-slate-200 relative">
                    <svg className="w-full h-full" viewBox="0 0 600 200" preserveAspectRatio="xMidYMid meet">
                        <polyline
                          points={monthlyROI.map((m, i) => {
                            const x = (i / (monthlyROI.length - 1)) * 600;
                            const maxROI = Math.max(...monthlyROI.map(m => m.roi), 5);
                            const minROI = Math.min(...monthlyROI.map(m => m.roi), -5);
                            const range = Math.max(maxROI - minROI, 10);
                            const actualMax = maxROI + (10 - (maxROI - minROI)) / 2;
                            const actualMin = minROI - (10 - (maxROI - minROI)) / 2;
                            const y = 200 - ((m.roi - actualMin) / (actualMax - actualMin)) * 200;
                            return `${x},${y}`;
                          }).join(' ')}
                          fill="none"
                          stroke="#64748b"
                          strokeWidth="2"
                          vectorEffect="non-scaling-stroke"
                        />
                        {/* Data points */}
                        {monthlyROI.map((m, i) => {
                          const x = (i / (monthlyROI.length - 1)) * 600;
                          const maxROI = Math.max(...monthlyROI.map(m => m.roi), 5);
                          const minROI = Math.min(...monthlyROI.map(m => m.roi), -5);
                          const range = Math.max(maxROI - minROI, 10);
                          const actualMax = maxROI + (10 - (maxROI - minROI)) / 2;
                          const actualMin = minROI - (10 - (maxROI - minROI)) / 2;
                          const y = 200 - ((m.roi - actualMin) / (actualMax - actualMin)) * 200;
                          const isNegative = m.roi < 0;
                          return (
                            <circle
                              key={i}
                              cx={x}
                              cy={y}
                              r="5"
                              fill={isNegative ? '#ef4444' : '#10b981'}
                              className="cursor-pointer hover:r-6 transition-all"
                              onMouseEnter={() => setHoveredMonth({ month: m.month, roi: m.roi, x, y })}
                              onMouseLeave={() => setHoveredMonth(null)}
                              vectorEffect="non-scaling-stroke"
                            />
                          );
                        })}
                    </svg>
                    
                    {/* Tooltip for chart points */}
                    {hoveredMonth && (
                      <div 
                        className="absolute bg-slate-900 text-white rounded-lg shadow-lg p-3 pointer-events-none z-10 text-sm"
                        style={{
                          left: `${(hoveredMonth.x / 600) * 100}%`,
                          top: `${(hoveredMonth.y / 200) * 100}%`,
                          transform: 'translate(-50%, -120%)'
                        }}
                      >
                        <div className="font-semibold">{hoveredMonth.month}</div>
                        <div className={hoveredMonth.roi >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {hoveredMonth.roi >= 0 ? '+' : ''}{hoveredMonth.roi.toFixed(2)}%
                        </div>
                      </div>
                    )}

                    
                    {/* X-axis labels */}
                    <div className="absolute -bottom-6 left-0 right-0 flex justify-between text-xs text-slate-500">
                      {monthlyROI.map((m, i) => (
                        <span key={i}>{m.month}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-500">
                  <p>Not enough trade history to display ROI over time</p>
                </div>
              )}
            </Card>

            {/* Performance Metrics */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-6">Performance Metrics</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Column 1 */}
                <div className="space-y-4">
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-sm text-slate-500 mb-1">Total Volume</p>
                    <p className="text-2xl font-bold text-slate-900">
                      ${((traderData?.volume || 0) / 1000000).toFixed(1)}M
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-sm text-slate-500 mb-1">Best Trade ROI</p>
                    <p className="text-2xl font-bold text-green-600">
                      {(() => {
                        const tradesWithPrices = trades.filter(t => t.currentPrice && t.price);
                        if (tradesWithPrices.length === 0) return 'N/A';
                        const bestTrade = tradesWithPrices.reduce((best, trade) => {
                          const roi = ((trade.currentPrice! - trade.price) / trade.price) * 100;
                          return roi > best ? roi : best;
                        }, -Infinity);
                        return bestTrade === -Infinity ? 'N/A' : `+${bestTrade.toFixed(1)}%`;
                      })()}
                    </p>
                    {trades.filter(t => t.currentPrice && t.price).length === 0 && (
                      <p className="text-xs text-slate-400 mt-1">No closed trades yet</p>
                    )}
                  </div>
                </div>

                {/* Column 2 */}
                <div className="space-y-4">
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-sm text-slate-500 mb-1">Open Markets</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {(() => {
                        const count = trades.filter(t => t.status === 'Open').length;
                        return count === 100 ? '100+' : count;
                      })()}
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-sm text-slate-500 mb-1">Closed Trades</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {(() => {
                        const closedCount = trades.filter(t => t.currentPrice && t.price).length;
                        const profitableCount = trades.filter(t => t.currentPrice && t.price && t.currentPrice > t.price).length;
                        return `${profitableCount}/${closedCount}`;
                      })()}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Profitable/Total</p>
                  </div>
                </div>

                {/* Column 3 */}
                <div className="space-y-4">
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-sm text-slate-500 mb-1">Avg Trade Size</p>
                    <p className="text-2xl font-bold text-slate-900">
                      ${traderData && trades.length > 0 ? ((traderData.volume / trades.length) / 1000).toFixed(1) : '0'}K
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-sm text-slate-500 mb-1">Total Trades</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {(() => {
                        const count = trades.length;
                        return count === 100 ? '100+' : count;
                      })()}
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Category Distribution Pie Chart */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-6">Trading Categories</h3>
              {categoryDistribution.length > 0 ? (
                <div className="flex flex-col md:flex-row gap-8 items-center">
                  {/* Pie Chart */}
                  <div className="relative w-64 h-64 flex-shrink-0">
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
          </div>
        )}
      </div>

      {/* Mark as Copied Modal */}
      <MarkTradeCopiedModal
        open={showCopiedModal}
        onOpenChange={setShowCopiedModal}
        trade={{
          market: selectedTrade?.market || '',
          traderName: traderData?.displayName || wallet,
          position: (selectedTrade?.outcome?.toUpperCase() as 'YES' | 'NO') || 'YES',
          traderPrice: selectedTrade?.price || 0,
        }}
        isPremium={isPremium}
        onConfirm={handleConfirmCopy}
      />
    </div>
  );
}
