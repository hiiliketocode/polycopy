'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { resolveFeatureTier, tierHasPremiumAccess, type FeatureTier } from '@/lib/feature-tier';
import { extractMarketAvatarUrl } from '@/lib/marketAvatar';
import type { User } from '@supabase/supabase-js';
import { Navigation } from '@/components/polycopy/navigation';
import { SignupBanner } from '@/components/polycopy/signup-banner';
import { TradeCard } from '@/components/polycopy/trade-card';
import { EmptyState } from '@/components/polycopy/empty-state';
import { Button } from '@/components/ui/button';
import { RefreshCw, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { getESPNScoresForTrades, teamsMatch } from '@/lib/espn/scores';
import { abbreviateTeamName } from '@/lib/utils/team-abbreviations';

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
  };
  trade: {
    side: 'BUY' | 'SELL';
    outcome: string;
    size: number;
    price: number;
    timestamp: number;
    tradeId?: string;
  };
}

type FilterTab = "all" | "buys" | "sells";
type Category = "all" | "politics" | "sports" | "crypto" | "culture" | "finance" | "economics" | "tech" | "weather";

const normalizeKeyPart = (value?: string | null) => value?.trim().toLowerCase() || '';
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

export default function FeedPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userTier, setUserTier] = useState<FeatureTier>('anon');
  const [isPremium, setIsPremium] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [activeCategory, setActiveCategory] = useState<Category>('all');
  
  // Data state
  const [allTrades, setAllTrades] = useState<FeedTrade[]>([]);
  const [displayedTradesCount, setDisplayedTradesCount] = useState(35);
  const [followingCount, setFollowingCount] = useState(0);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFeedFetchAt, setLastFeedFetchAt] = useState<number | null>(null);
  const [latestTradeTimestamp, setLatestTradeTimestamp] = useState<number | null>(null);
  
  // Stats
  const [todayVolume, setTodayVolume] = useState(0);
  const [todaysTradeCount, setTodaysTradeCount] = useState(0);
  
  // Copied trades state
  const [copiedTradeIds, setCopiedTradeIds] = useState<Set<string>>(new Set());
  const [loadingCopiedTrades, setLoadingCopiedTrades] = useState(false);
  
  // Live market data (prices, scores, and game metadata)
  const [liveMarketData, setLiveMarketData] = useState<Map<string, { 
    outcomes?: string[];
    outcomePrices?: number[];
    score?: string;
    gameStartTime?: string;
    eventStatus?: string;
    closed?: boolean;
    updatedAt?: number;
  }>>(new Map());

  const [expandedTradeIds, setExpandedTradeIds] = useState<Set<string>>(new Set());
  
  // Manual refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Categories
  const categoryMap: Record<string, string> = {
    'all': 'all',
    'politics': 'politics',
    'sports': 'sports',
    'crypto': 'crypto',
    'culture': 'culture',
    'finance': 'finance',
    'economics': 'economics',
    'tech': 'tech',
    'weather': 'weather'
  };
  
  const categories = [
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

  const filterTabs: { value: FilterTab; label: string }[] = [
    { value: "all", label: "All Trades" },
    { value: "buys", label: "Buys Only" },
    { value: "sells", label: "Sells Only" },
  ];

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
      }
      // Don't update user state on every auth change to prevent unnecessary re-renders
      // The user state is already set above and will persist
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const fetchCopiedTrades = useCallback(async () => {
    if (!user) {
      setCopiedTradeIds(new Set());
      return;
    }

    setLoadingCopiedTrades(true);
    try {
      const apiResponse = await fetch(`/api/copied-trades?userId=${user.id}`);
      if (apiResponse.ok) {
        const payload = await apiResponse.json();
        const copiedIds = new Set<string>();
        payload?.trades?.forEach(
          (t: { market_id?: string; market_slug?: string; market_title?: string; trader_wallet?: string }) => {
            const walletKey = normalizeKeyPart(t.trader_wallet);
            if (!walletKey) return;
            const marketKeys = [t.market_id, t.market_slug, t.market_title]
              .map(normalizeKeyPart)
              .filter(Boolean);
            if (marketKeys.length === 0) return;
            for (const key of new Set(marketKeys)) {
              copiedIds.add(`${key}-${walletKey}`);
            }
          }
        );
        setCopiedTradeIds(copiedIds);
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
      }
    } catch (err) {
      console.error('Error fetching copied trades:', err);
    } finally {
      setLoadingCopiedTrades(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCopiedTrades();
  }, [fetchCopiedTrades]);

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

  // Fetch live market data (prices, scores, and game metadata)
  const fetchLiveMarketData = useCallback(async (trades: FeedTrade[]) => {
    const newLiveData = new Map<string, { 
      outcomes?: string[];
      outcomePrices?: number[];
      score?: string;
      gameStartTime?: string;
      eventStatus?: string;
      closed?: boolean;
      updatedAt?: number;
    }>();
    
    // Group trades by condition ID to avoid duplicate API calls
    const uniqueConditionIds = [...new Set(trades.map(t => t.market.conditionId).filter(Boolean))];
    
    console.log(`📊 Fetching live data for ${uniqueConditionIds.length} markets`);
    
    // **NEW: Fetch ESPN scores for all sports trades first**
    console.log(`🏈 Fetching ESPN scores for sports markets...`);
    const espnScores = await getESPNScoresForTrades(trades);
    console.log(`✅ Got ESPN scores for ${espnScores.size} markets`);
    
    // Fetch prices for each market
    await Promise.all(
      uniqueConditionIds.map(async (conditionId) => {
        if (!conditionId) return;
        
        try {
          // Fetch current price from Polymarket API
          const priceResponse = await fetch(`/api/polymarket/price?conditionId=${conditionId}`);
          if (priceResponse.ok) {
            const priceData = await priceResponse.json();
            
            if (priceData.success && priceData.market) {
              // Get the trade to determine which outcome we need
              const trade = trades.find(t => t.market.conditionId === conditionId);
              if (trade) {
                const { 
                  outcomes, 
                  outcomePrices, 
                  gameStartTime, 
                  eventStatus,
                  score: liveScore,
                  homeTeam,
                  awayTeam,
                  closed 
                } = priceData.market;
                
                console.log(`✅ Got data for ${trade.market.title.slice(0, 40)}... | Status: ${eventStatus} | Score:`, liveScore);
                
                // Convert string prices to numbers
                const numericPrices = outcomePrices?.map((p: string | number) => Number(p)) || [];
                
                // Detect sports markets by checking for "vs." or "vs" in title, or common sports patterns
                const isSportsMarket = trade.market.title.includes(' vs. ') || 
                                      trade.market.title.includes(' vs ') ||
                                      trade.market.title.includes(' @ ') ||
                                      trade.market.category === 'sports' ||
                                      // Detect spread and over/under bets
                                      trade.market.title.match(/\(-?\d+\.?\d*\)/) || // (−9.5) or (+7)
                                      trade.market.title.includes('O/U') ||
                                      trade.market.title.includes('Over') ||
                                      trade.market.title.includes('Under') ||
                                      trade.market.title.includes('Spread') ||
                                      (outcomes?.length === 2 && 
                                       trade.market.title.match(/\w+ (vs\.?|@) \w+/));
                  
                  let scoreDisplay: string | undefined;
                  
                  // **NEW: Check ESPN scores first for sports markets**
                  const espnScore = espnScores.get(conditionId);
                  
                  if (isSportsMarket && outcomes?.length === 2) {
                    // SPORTS MARKETS: Prioritize ESPN scores, then Polymarket data
                    
                    if (espnScore) {
                      // **ESPN DATA AVAILABLE** 🎯
                      if (espnScore.status === 'final') {
                        // Determine correct order: which outcome matches home team vs away team
                        const outcome1MatchesHome = teamsMatch(outcomes[0], espnScore.homeTeamName, espnScore.homeTeamAbbrev);
                        const team1Score = outcome1MatchesHome ? espnScore.homeScore : espnScore.awayScore;
                        const team2Score = outcome1MatchesHome ? espnScore.awayScore : espnScore.homeScore;
                        
                        const team1Abbrev = abbreviateTeamName(outcomes[0] || '');
                        const team2Abbrev = abbreviateTeamName(outcomes[1] || '');
                        scoreDisplay = `🏁 ${team1Abbrev} ${team1Score} - ${team2Score} ${team2Abbrev}`;
                        console.log(`🏁 ESPN Final score: ${scoreDisplay}`);
                      } else if (espnScore.status === 'live') {
                        // Determine correct order: which outcome matches home team vs away team
                        const outcome1MatchesHome = teamsMatch(outcomes[0], espnScore.homeTeamName, espnScore.homeTeamAbbrev);
                        const team1Score = outcome1MatchesHome ? espnScore.homeScore : espnScore.awayScore;
                        const team2Score = outcome1MatchesHome ? espnScore.awayScore : espnScore.homeScore;
                        
                        const team1Abbrev = abbreviateTeamName(outcomes[0] || '');
                        const team2Abbrev = abbreviateTeamName(outcomes[1] || '');

                        let periodContext = '';
                        if (espnScore.displayClock) {
                          // Detect sport and format period accordingly
                          const sportType = trade.market.category || '';
                          let period = espnScore.period || 1; // Default to period 1 if 0 or missing
                          
                          // Fix: ESPN sometimes returns 0 for first period, normalize to 1
                          if (period === 0) period = 1;
                          
                          // Basketball (NBA) - Use Quarters (Q1-Q4)
                          if (sportType.includes('basketball') || trade.market.title.match(/(lakers|celtics|warriors|heat|bucks|nuggets|suns|thunder|mavericks|clippers|76ers|nets|knicks)/i)) {
                            if (period <= 4) {
                              periodContext = `Q${period} `;
                            } else {
                              periodContext = `OT${period - 4} `;
                            }
                          }
                          // Football (NFL) - Use Quarters (Q1-Q4)
                          else if (sportType.includes('football') || trade.market.title.match(/(chiefs|raiders|patriots|cowboys|packers|broncos|chargers|dolphins|bills|jets|ravens|49ers|eagles|steelers)/i)) {
                            if (period <= 4) {
                              periodContext = `Q${period} `;
                            } else {
                              periodContext = `OT `;
                            }
                          }
                          // Hockey (NHL) - Use Periods (P1-P3)
                          else if (sportType.includes('hockey') || trade.market.title.match(/(bruins|canadiens|rangers|penguins|oilers|flames|maple leafs|lightning|avalanche)/i)) {
                            if (period <= 3) {
                              periodContext = `P${period} `;
                            } else {
                              periodContext = `OT `;
                            }
                          }
                          // Baseball (MLB) - Use Innings (I1-I9+)
                          else if (sportType.includes('baseball') || trade.market.title.match(/(yankees|dodgers|red sox|astros|cubs|mets|braves|padres|giants|cardinals)/i)) {
                            periodContext = `I${period} `;
                          }
                          // Default: Just use Q for quarters if sport not detected
                          else if (period > 0) {
                            periodContext = `Q${period} `;
                          }
                        }

                        const clock = espnScore.displayClock ? ` (${periodContext}${espnScore.displayClock})` : '';
                        scoreDisplay = `🟢 ${team1Abbrev} ${team1Score} - ${team2Score} ${team2Abbrev}${clock}`;
                        console.log(`🟢 ESPN Live score: ${scoreDisplay} | Period: ${espnScore.period}`);
                      } else if (espnScore.status === 'scheduled') {
                        // Show game start time
                        const startTime = new Date(espnScore.startTime);
                        const formatter = new Intl.DateTimeFormat('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        });
                        scoreDisplay = `🗓️ ${formatter.format(startTime)}`;
                        console.log(`📅 ESPN Scheduled: ${scoreDisplay}`);
                      }
                    }
                    // Fallback to Polymarket data if no ESPN score
                    else if (liveScore && typeof liveScore === 'object') {
                      // Has live score data from Polymarket
                      const home = liveScore.home ?? liveScore.homeScore ?? 0;
                      const away = liveScore.away ?? liveScore.awayScore ?? 0;
                      scoreDisplay = `${outcomes[0]} ${home} - ${away} ${outcomes[1]}`;
                      console.log(`🏀 Polymarket score: ${scoreDisplay}`);
                    } else if (closed || eventStatus === 'finished' || eventStatus === 'final') {
                      // Game finished
                      scoreDisplay = '🏁 Final';
                    } else if (eventStatus === 'live' || eventStatus === 'in_progress') {
                      // Game in progress but no score data
                      scoreDisplay = '🟢 LIVE';
                    } else if (gameStartTime) {
                      // Check if game has started
                      const startTime = new Date(gameStartTime);
                      const now = new Date();
                      
                      if (now < startTime) {
                        // Game hasn't started - show start time
                        const formatter = new Intl.DateTimeFormat('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        });
                        scoreDisplay = `🗓️ ${formatter.format(startTime)}`;
                        console.log(`📅 Upcoming game: ${scoreDisplay}`);
                      } else {
                        // Time passed, assume live
                        scoreDisplay = '🟢 LIVE';
                      }
                    } else {
                      // No data, fall back to odds
                      const prob1 = (Number(outcomePrices[0]) * 100).toFixed(0);
                      const prob2 = (Number(outcomePrices[1]) * 100).toFixed(0);
                      scoreDisplay = `${outcomes[0]}: ${prob1}% | ${outcomes[1]}: ${prob2}%`;
                    }
                  } else if (outcomes?.length === 2) {
                    // NON-SPORTS BINARY MARKETS: Show odds
                    const prob1 = (Number(outcomePrices[0]) * 100).toFixed(0);
                    const prob2 = (Number(outcomePrices[1]) * 100).toFixed(0);
                    scoreDisplay = `${outcomes[0]}: ${prob1}% | ${outcomes[1]}: ${prob2}%`;
                    console.log(`📊 Binary market: ${scoreDisplay}`);
                  }
                  
                  // Mark market as closed if ESPN says game is final OR if Polymarket says it's closed
                  const isMarketClosed = Boolean(closed) || 
                                        espnScore?.status === 'final' ||
                                        eventStatus === 'finished' || 
                                        eventStatus === 'final';
                  
                  console.log(`🔒 Market closed status for ${trade.market.title.slice(0, 40)}... | closed=${closed} | espnStatus=${espnScore?.status} | eventStatus=${eventStatus} | final isMarketClosed=${isMarketClosed}`);
                  
                  newLiveData.set(conditionId, { 
                    outcomes: outcomes || [],
                    outcomePrices: numericPrices,
                    score: scoreDisplay,
                    gameStartTime: gameStartTime || undefined,
                    eventStatus: eventStatus || undefined,
                    closed: isMarketClosed,
                    updatedAt: Date.now(),
                  });
                }
            }
          } else {
            console.warn(`❌ Price API failed for ${conditionId}: ${priceResponse.status}`);
          }
        } catch (error) {
          console.warn(`Failed to fetch live data for ${conditionId}:`, error);
        }
      })
    );
    
    console.log(`💾 Stored live data for ${newLiveData.size} markets`);
    setLiveMarketData(newLiveData);
  }, []);

  // Fetch feed data
  const fetchFeed = useCallback(async (userOverride?: User) => {
    const currentUser = userOverride || user;
    
    if (!currentUser) {
      return;
    }
    
    setLoadingFeed(true);
    setError(null);

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
          setLoadingFeed(false);
          return;
        }

        setFollowingCount(follows.length);

        // 2. Fetch trades
        const tradePromises = follows.map(async (follow) => {
          const wallet = follow.trader_wallet;
          
          try {
            const response = await fetch(
              `https://data-api.polymarket.com/trades?limit=15&user=${wallet}`
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
                          `https://data-api.polymarket.com/trades?limit=1&user=${wallet}`
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
          setAllTrades([]);
          setLoadingFeed(false);
          return;
        }

        allTradesRaw.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));

        // 4. Format trades
        const formattedTrades: FeedTrade[] = allTradesRaw.map((trade: any) => {
          const wallet = trade._followedWallet || trade.user || trade.wallet || '';
          const walletKey = wallet.toLowerCase();
          const displayName = traderNames[walletKey] || 
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
          return {
            id: `${trade.id || trade.timestamp}-${Math.random()}`,
            trader: {
              wallet: wallet,
              displayName: displayName,
            },
            market: {
              id: marketId,
              conditionId: trade.conditionId || trade.condition_id || '',
              title: trade.market || trade.title || 'Unknown Market',
              slug: trade.market_slug || trade.slug || '',
              eventSlug: trade.eventSlug || trade.event_slug || '',
              category: undefined,
              avatarUrl: extractMarketAvatarUrl(trade) || undefined,
            },
            trade: {
              side: (trade.side || 'BUY').toUpperCase() as 'BUY' | 'SELL',
              outcome: trade.outcome || trade.option || 'YES',
              size: parseFloat(trade.size || trade.amount || 0),
              price: parseFloat(trade.price || 0),
              timestamp: (trade.timestamp || Date.now() / 1000) * 1000,
              tradeId: trade.trade_id || trade.id || trade.tx_hash || trade.transactionHash || '',
            },
          };
        });

        // 5. Categorize trades
        formattedTrades.forEach(trade => {
          const title = trade.market.title.toLowerCase();
          
          if (title.includes('trump') || title.includes('biden') || title.includes('election') || 
              title.includes('senate') || title.includes('congress') || title.includes('president')) {
            trade.market.category = 'politics';
          }
          else if (title.includes('nba') || title.includes('nfl') || title.includes('mlb') || title.includes('nhl') ||
                   title.includes('soccer') || title.includes('football') || title.includes('basketball')) {
            trade.market.category = 'sports';
          }
          else if (title.includes('bitcoin') || title.includes('btc') || title.includes('ethereum') || 
                   title.includes('eth') || title.includes('crypto')) {
            trade.market.category = 'crypto';
          }
          else if (title.includes('stock') || title.includes('economy') || title.includes('inflation')) {
            trade.market.category = 'economics';
          }
          else if (title.includes('ai') || title.includes('tech') || title.includes('apple') || 
                   title.includes('google') || title.includes('microsoft')) {
            trade.market.category = 'tech';
          }
          else if (title.includes('weather') || title.includes('temperature')) {
            trade.market.category = 'weather';
          }
          else if (title.includes('movie') || title.includes('album') || title.includes('celebrity')) {
            trade.market.category = 'culture';
          }
          else if (title.includes('company') || title.includes('ceo') || title.includes('revenue')) {
            trade.market.category = 'finance';
          }
        });

        const latestTimestamp = formattedTrades.length > 0
          ? Math.max(...formattedTrades.map(t => t.trade.timestamp))
          : null;

        setAllTrades(formattedTrades);
        setDisplayedTradesCount(35);
        setLatestTradeTimestamp(latestTimestamp);
        setLastFeedFetchAt(Date.now());
        
        // Fetch live market data for displayed trades
        fetchLiveMarketData(formattedTrades.slice(0, 35));

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
      setLastFeedFetchAt(Date.now());
    } finally {
      setLoadingFeed(false);
    }
  }, [user]);

  // Manual refresh handler
  const handleManualRefresh = async () => {
    if (!user) return;
    
    setIsRefreshing(true);
    
    const sessionKey = `feed-fetched-${user.id}`;
    sessionStorage.removeItem(sessionKey);
    hasFetchedRef.current = false;
    
    await fetchFeed();
    
    hasFetchedRef.current = true;
    sessionStorage.setItem(sessionKey, 'true');
    
    setIsRefreshing(false);
  };

  const hasFetchedRef = useRef(false);
  const hasAttemptedFetchRef = useRef(false);
  const liveRefreshTimeoutRef = useRef<number | null>(null);
  const lastLiveRefreshRef = useRef(0);

  // Fetch feed data ONLY ONCE on initial mount
  useEffect(() => {
    if (hasAttemptedFetchRef.current) {
      return;
    }
    hasAttemptedFetchRef.current = true;

    const attemptFetch = async () => {
      let currentUser = user;
      
      if (!currentUser) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const { data: { user: freshUser } } = await supabase.auth.getUser();
        currentUser = freshUser;
      }

      if (!currentUser) {
        return;
      }

      const sessionKey = `feed-fetched-${currentUser.id}`;
      const alreadyFetched = sessionStorage.getItem(sessionKey);
      
      if (alreadyFetched === 'true' && hasFetchedRef.current) {
        return;
      }
      
      await fetchFeed(currentUser);
      hasFetchedRef.current = true;
      sessionStorage.setItem(sessionKey, 'true');
    };

    attemptFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load more trades
  const handleLoadMore = () => {
    const newCount = displayedTradesCount + 35;
    setDisplayedTradesCount(newCount);
  };

  // Filter trades to only show BUY trades AND by category
  const filteredAllTrades = allTrades.filter(trade => {
    // Only show BUY trades
    if (trade.trade.side !== 'BUY') return false;
    
    if (activeCategory !== 'all') {
      const tradeCategory = trade.market.category?.toLowerCase();
      if (!tradeCategory || tradeCategory !== activeCategory) {
        return false;
      }
    }
    
    return true;
  });
  
  const displayedTrades = filteredAllTrades.slice(0, displayedTradesCount);
  const hasMoreTrades = filteredAllTrades.length > displayedTradesCount;

  const refreshDisplayedMarketData = useCallback(() => {
    if (displayedTrades.length === 0) return;
    const now = Date.now();
    if (now - lastLiveRefreshRef.current < 15000) return;
    lastLiveRefreshRef.current = now;
    fetchLiveMarketData(displayedTrades);
  }, [displayedTrades, fetchLiveMarketData]);

  useEffect(() => {
    refreshDisplayedMarketData();
  }, [refreshDisplayedMarketData]);

  useEffect(() => {
    const handleScroll = () => {
      if (liveRefreshTimeoutRef.current) {
        window.clearTimeout(liveRefreshTimeoutRef.current);
      }
      liveRefreshTimeoutRef.current = window.setTimeout(() => {
        refreshDisplayedMarketData();
      }, 250);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (liveRefreshTimeoutRef.current) {
        window.clearTimeout(liveRefreshTimeoutRef.current);
      }
    };
  }, [refreshDisplayedMarketData]);

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
          marketAvatarUrl: trade.market.avatarUrl || null,
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

  // Loading state
  if (loading) {
    return (
      <>
        <Navigation 
        user={user ? { id: user.id, email: user.email || '' } : null} 
        isPremium={isPremium}
        walletAddress={walletAddress}
        profileImageUrl={profileImageUrl}
      />
        <SignupBanner isLoggedIn={!!user} />
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
      <SignupBanner isLoggedIn={!!user} />
      
      <div className="min-h-screen bg-slate-50 pt-4 md:pt-0 pb-20 md:pb-8">
        {/* Page Header */}
        <div className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
          <div className="max-w-[800px] mx-auto px-4 md:px-6 pb-3 md:py-8">
            {/* Title Row */}
            <div className="flex items-start justify-between mb-3 md:mb-4">
              <div>
                <h1 className="text-xl md:text-3xl font-bold text-slate-900 mb-0.5 md:mb-1">Activity Feed</h1>
                <p className="text-xs md:text-base text-slate-500">Recent trades from traders you follow</p>
              </div>
              <Button
                onClick={handleManualRefresh}
                disabled={isRefreshing || loadingFeed}
                variant="outline"
                size="icon"
                className="border-slate-300 text-slate-700 hover:bg-slate-50 bg-transparent flex-shrink-0 transition-all"
              >
                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </Button>
            </div>

            {(lastFeedFetchAt || latestTradeTimestamp) && (
              <div className="mb-2 text-xs text-slate-500">
                {lastFeedFetchAt ? `Last updated ${getRelativeTime(lastFeedFetchAt)}` : 'Last updated: —'}
                {latestTradeTimestamp ? ` • Latest trade ${getRelativeTime(latestTradeTimestamp)}` : ''}
              </div>
            )}

            {/* Category Pills */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 md:pb-2">
              {categories.map((category) => (
                <button
                  key={category.value}
                  onClick={() => setActiveCategory(category.value)}
                  className={cn(
                    "px-4 py-2 rounded-full font-medium text-sm whitespace-nowrap transition-all flex-shrink-0",
                    activeCategory === category.value
                      ? "bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-900 shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  )}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Feed Content */}
        <div className="max-w-[800px] mx-auto px-4 md:px-6 py-4 md:py-8">
          {loadingFeed ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 animate-pulse">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-slate-200 rounded-full"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-slate-200 rounded w-1/3 mb-2"></div>
                      <div className="h-4 bg-slate-200 rounded w-3/4 mb-3"></div>
                      <div className="h-3 bg-slate-200 rounded w-1/4"></div>
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
          ) : followingCount === 0 ? (
            <EmptyState
              icon={Activity}
              title="Your feed is empty"
              description="Follow traders on the Discover page to see their activity here"
              actionLabel="Discover Traders"
              onAction={() => router.push('/discover')}
            />
          ) : displayedTrades.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">No trades match your filters</h3>
              <p className="text-slate-600">
                Try selecting a different filter to see more trades.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayedTrades.map((trade) => {
                const liveMarket = liveMarketData.get(trade.market.conditionId || '')
                
                // Find the price for THIS specific trade's outcome
                let currentPrice: number | undefined = undefined;
                if (liveMarket?.outcomes && liveMarket?.outcomePrices) {
                  const outcomeIndex = liveMarket.outcomes.findIndex(
                    (o: string) => o.toUpperCase() === trade.trade.outcome.toUpperCase()
                  );
                  if (outcomeIndex !== -1 && outcomeIndex < liveMarket.outcomePrices.length) {
                    currentPrice = liveMarket.outcomePrices[outcomeIndex];
                  }
                }
                
                const tradeKey = String(trade.id);

                return (
                  <TradeCard
                    key={trade.id}
                    trader={{
                      name: trade.trader.displayName,
                      address: trade.trader.wallet,
                      id: trade.trader.wallet,
                    }}
                    market={trade.market.title}
                    marketAvatar={trade.market.avatarUrl}
                    position={trade.trade.outcome}
                    action={trade.trade.side === 'BUY' ? 'Buy' : 'Sell'}
                    price={trade.trade.price}
                    size={trade.trade.size}
                    total={trade.trade.price * trade.trade.size}
                    timestamp={getRelativeTime(trade.trade.timestamp)}
                    onCopyTrade={() => handleCopyTrade(trade)}
                    onMarkAsCopied={(entryPrice, amountInvested) =>
                      handleMarkAsCopied(trade, entryPrice, amountInvested)
                    }
                    onAdvancedCopy={() => handleRealCopy(trade)}
                    isPremium={tierHasPremiumAccess(userTier)}
                    isExpanded={expandedTradeIds.has(tradeKey)}
                    onToggleExpand={() => toggleTradeExpanded(tradeKey)}
                    isCopied={isTraceCopied(trade)}
                    conditionId={trade.market.conditionId}
                    marketSlug={trade.market.slug}
                    currentMarketPrice={currentPrice}
                    currentMarketUpdatedAt={liveMarket?.updatedAt}
                    marketIsOpen={liveMarket?.closed === undefined ? undefined : !liveMarket.closed}
                    liveScore={liveMarket?.score}
                    category={trade.market.category}
                    polymarketUrl={
                      trade.market.eventSlug 
                        ? `https://polymarket.com/event/${trade.market.eventSlug}`
                        : trade.market.slug 
                        ? `https://polymarket.com/market/${trade.market.slug}`
                        : undefined
                    }
                  />
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

    </>
  );
}
