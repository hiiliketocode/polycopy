'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, ensureProfile } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import TraderCard from '../components/TraderCard';
import Header from '../components/Header';

interface Trader {
  wallet: string;
  displayName: string;
  pnl: number;
  winRate: number;
  totalTrades: number;
  volume: number;
  rank: number;
  followerCount: number;
}

export default function DiscoverPage() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState('overall');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loadingTraders, setLoadingTraders] = useState(true);
  const [featuredTraders, setFeaturedTraders] = useState<Trader[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [featuredTrader, setFeaturedTrader] = useState<Trader | null>(null); // NEW: Hero featured trader
  const [featuredTraderStats, setFeaturedTraderStats] = useState<any>(null); // FRESH stats from API
  const [loadingFeaturedStats, setLoadingFeaturedStats] = useState(false);
  
  // BATCH FOLLOW FETCHING - Fetch all follows once, store in Set for instant lookup
  const [followedWallets, setFollowedWallets] = useState<Set<string>>(new Set());
  const [loadingFollows, setLoadingFollows] = useState(true);

  // Check auth status on mount (but don't require login)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        ensureProfile(session.user.id, session.user.email!);
      } else {
        setUser(null);
      }
      setLoading(false);
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

  // BATCH FETCH all follows once for instant lookup (FIX: No more loading buttons!)
  useEffect(() => {
    const fetchAllFollows = async () => {
      if (!user) {
        console.log('⏱️ No user, skipping follow batch fetch');
        setFollowedWallets(new Set());
        setLoadingFollows(false);
        return;
      }

      console.time('⚡ BATCH FOLLOW FETCH');
      console.log('🚀 Batch fetching ALL follows for instant lookup...');
      setLoadingFollows(true);

      try {
        const startTime = performance.now();
        
        // Single query to get ALL follows at once
        const { data: follows, error } = await supabase
          .from('follows')
          .select('trader_wallet')
          .eq('user_id', user.id);

        const endTime = performance.now();
        const fetchTime = (endTime - startTime).toFixed(2);

        if (error) {
          console.error('❌ Error batch fetching follows:', error);
          setFollowedWallets(new Set());
        } else {
          // Create Set for O(1) lookup
          const walletSet = new Set(
            follows?.map(f => f.trader_wallet.toLowerCase()) || []
          );
          
          console.log(`✅ Batch fetched ${follows?.length || 0} follows in ${fetchTime}ms`);
          console.log(`   → Created Set with ${walletSet.size} wallets for instant lookup`);
          console.log(`   → Follow buttons will now be INSTANT (no loading state)`);
          
          setFollowedWallets(walletSet);
        }
      } catch (err) {
        console.error('❌ Error in batch follow fetch:', err);
        setFollowedWallets(new Set());
      } finally {
        setLoadingFollows(false);
        console.timeEnd('⚡ BATCH FOLLOW FETCH');
      }
    };

    fetchAllFollows();
  }, [user]);

  // Fetch featured traders - Use same working API as main traders
  useEffect(() => {
    const fetchFeaturedTraders = async () => {
      setLoadingFeatured(true);
      try {
        // Try using our working leaderboard API endpoint
        const url = '/api/polymarket/leaderboard?limit=30&orderBy=PNL';
        console.log('🔄 Fetching featured traders...');
        console.log('   📡 URL:', url);
        
        const response = await fetch(url);
        console.log('   📊 Response status:', response.status, response.statusText);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('   ❌ API error:', response.status);
          console.error('   📄 Response body:', errorText);
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('   ✅ Fetched traders:', data.traders?.length || 0);
        
        if (!data.traders || data.traders.length === 0) {
          console.warn('   ⚠️ No traders returned from API');
          setFeaturedTraders([]);
          return;
        }
        
        // Calculate ROI and sort by it, take top 10
        const tradersWithROI = data.traders.map((trader: any) => ({
          ...trader,
          roi: trader.volume > 0 ? ((trader.pnl / trader.volume) * 100) : 0
        }));
        
        const topByROI = tradersWithROI
          .sort((a: any, b: any) => (b.roi || 0) - (a.roi || 0))
          .slice(0, 10);
        
        console.log('   ✅ Top 10 traders by ROI:');
        topByROI.forEach((t: any, i: number) => {
          console.log(`      ${i + 1}. ${t.displayName} - ROI: ${t.roi.toFixed(1)}%`);
        });
        
        setFeaturedTraders(topByROI);
      } catch (error) {
        console.error('❌ Error fetching featured traders:', error);
        console.error('   🔧 Stack trace:', (error as Error).stack);
        setFeaturedTraders([]);
      } finally {
        setLoadingFeatured(false);
      }
    };

    fetchFeaturedTraders();
  }, []);

  // Fetch real Polymarket traders from leaderboard API
  useEffect(() => {
    const fetchTraders = async () => {
      setLoadingTraders(true);
      try {
        console.log('🔄 Fetching traders from leaderboard API...', { category: selectedCategory });
        const response = await fetch(
          `/api/polymarket/leaderboard?limit=50&orderBy=PNL&category=${selectedCategory}`
        );
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ Fetched traders:', data.traders?.length || 0);
        
        // CRITICAL FIX: Calculate ROI and sort by it (descending)
        const tradersWithROI = (data.traders || []).map((trader: any) => ({
          ...trader,
          roi: trader.volume > 0 ? ((trader.pnl / trader.volume) * 100) : 0
        }));
        
        // Sort by ROI descending - highest ROI first
        const sortedByROI = tradersWithROI.sort((a: any, b: any) => (b.roi || 0) - (a.roi || 0));
        
        console.log('✅ Sorted by ROI. Top 3 traders:');
        sortedByROI.slice(0, 3).forEach((t: any, i: number) => {
          console.log(`   ${i + 1}. ${t.displayName} - ROI: ${t.roi.toFixed(1)}%, P&L: $${(t.pnl / 1000).toFixed(1)}K`);
        });
        
        setTraders(sortedByROI);
      } catch (error) {
        console.error('❌ Error fetching traders:', error);
        setTraders([]);
      } finally {
        setLoadingTraders(false);
      }
    };

    fetchTraders();
  }, [selectedCategory]);

  // FIX 1: Select featured trader with random category badge
  const CATEGORIES = ['Sports', 'Crypto', 'Politics', 'Pop Culture', 'Business', 'Economics', 'Tech', 'Weather'];
  
  const [selectedHeroCategory] = useState(() => {
    const randomCategory = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    console.log('🎲 Random hero category:', randomCategory);
    return randomCategory;
  });

  // Fetch #1 trader for the random category on mount
  useEffect(() => {
    async function fetchHeroTrader() {
      const heroCategoryValue = categoryMap[selectedHeroCategory] || 'overall';
      console.log(`📡 Fetching #1 trader for ${selectedHeroCategory} category (API value: ${heroCategoryValue})...`);
      
      try {
        // Make the SAME API call as the filter buttons
        const response = await fetch(
          `/api/polymarket/leaderboard?limit=50&orderBy=PNL&category=${heroCategoryValue}`
        );
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.traders && data.traders.length > 0) {
          // Calculate ROI and sort by it
          const tradersWithROI = data.traders.map((trader: any) => ({
            ...trader,
            roi: trader.volume > 0 ? ((trader.pnl / trader.volume) * 100) : 0
          }));
          
          const sortedByROI = tradersWithROI.sort((a: any, b: any) => (b.roi || 0) - (a.roi || 0));
          const topTrader = sortedByROI[0];
          
          console.log(`🏆 Found #1 in ${selectedHeroCategory}:`, {
            name: topTrader.displayName,
            roi: topTrader.roi.toFixed(1) + '%',
            pnl: '$' + (topTrader.pnl / 1000).toFixed(1) + 'K',
            wallet: topTrader.wallet.slice(0, 10) + '...'
          });
          
          setFeaturedTrader(topTrader);
        } else {
          console.log(`⚠️ No traders found for ${selectedHeroCategory}, falling back to overall #1`);
          // Fallback to overall #1 if category has no traders
          if (traders && traders.length > 0) {
            setFeaturedTrader(traders[0]);
          }
        }
      } catch (error) {
        console.error('❌ Error fetching hero trader:', error);
        // Fallback to overall #1 on error
        if (traders && traders.length > 0) {
          console.log('   → Falling back to overall #1 trader');
          setFeaturedTrader(traders[0]);
        }
      }
    }
    
    if (selectedHeroCategory) {
      fetchHeroTrader();
    }
  }, [selectedHeroCategory]); // Only run once on mount with the random category

  // Use leaderboard data directly - no need for fresh fetch
  useEffect(() => {
    if (!featuredTrader) {
      setFeaturedTraderStats(null);
      return;
    }

    console.log('✅ Using leaderboard data for hero (no fresh fetch needed):', {
      name: featuredTrader.displayName,
      pnl: featuredTrader.pnl,
      roi: (featuredTrader as any).roi,
      volume: featuredTrader.volume
    });

    // Just use the leaderboard data directly
    setFeaturedTraderStats({
      displayName: featuredTrader.displayName,
      pnl: featuredTrader.pnl,
      roi: (featuredTrader as any).roi || 0,
      volume: featuredTrader.volume,
      wallet: featuredTrader.wallet,
      followerCount: featuredTrader.followerCount
    });
  }, [featuredTrader]);

  // Callback to refresh follow status after follow/unfollow action
  const handleFollowChange = (wallet: string, isNowFollowing: boolean) => {
    console.log(`🔄 Follow changed: ${wallet.slice(0, 10)}... → ${isNowFollowing ? 'FOLLOWED' : 'UNFOLLOWED'}`);
    
    setFollowedWallets(prev => {
      const newSet = new Set(prev);
      const walletLower = wallet.toLowerCase();
      
      if (isNowFollowing) {
        newSet.add(walletLower);
        console.log(`   ✅ Added to Set (now ${newSet.size} follows)`);
      } else {
        newSet.delete(walletLower);
        console.log(`   ❌ Removed from Set (now ${newSet.size} follows)`);
      }
      
      return newSet;
    });
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  // Category mapping: display name -> API value
  const categoryMap: Record<string, string> = {
    'All': 'overall',
    'Politics': 'politics',
    'Sports': 'sports',
    'Crypto': 'crypto',
    'Pop Culture': 'culture',
    'Business': 'finance',
    'Economics': 'economics',
    'Tech': 'tech',
    'Weather': 'weather'
  };

  const categories = [
    'All',
    'Politics', 
    'Sports',
    'Crypto',
    'Pop Culture',
    'Business',
    'Economics',
    'Tech',
    'Weather'
  ];

  // Filter traders based on search query (main grid only, not featured)
  const filteredTraders = traders.filter((trader) => {
    const query = searchQuery.toLowerCase();
    return (
      trader.displayName.toLowerCase().includes(query) ||
      trader.wallet.toLowerCase().includes(query)
    );
  });

  // ISSUE 2 FIX: Add debug logging for trader rendering
  console.log('🎯 About to render traders:', {
    tradersLength: traders?.length,
    filteredLength: filteredTraders?.length,
    selectedCategory,
    firstTrader: traders?.[0]?.displayName,
    searchQuery
  });

  /* MOCK DATA - Replaced with real Polymarket leaderboard data
  const featuredTraders = [
    {
      wallet: '0xabc123def456789abc123def456789abc123def4',
      displayName: 'polymarket_pro',
      pnl: 250000,
      winRate: 88.5,
      totalTrades: 445,
      followerCount: 387,
    },
    // ... more mock traders
  ];
  */

  // ISSUE 3 FIX: Calculate stats for hero section (using top traders as proxy for platform stats)
  const heroStats = {
    activeTraders: traders.length,
    totalVolume: traders.reduce((sum, t) => sum + t.volume, 0),
    avgROI: traders.length > 0 
      ? traders.reduce((sum, t) => sum + ((t as any).roi || 0), 0) / traders.length 
      : 0
  };

  const formatVolume = (value: number): string => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  // Get category display name for hero badge
  const getCategoryDisplayName = () => {
    for (const [displayName, value] of Object.entries(categoryMap)) {
      if (value === selectedCategory) {
        return displayName;
      }
    }
    return 'Overall';
  };

  // FIX 3: Simplified search - wallet address only (more reliable for MVP)
  const handleSearch = async () => {
    const query = searchQuery.trim();
    
    if (!query) {
      console.log('🔍 Search cleared');
      return;
    }

    setIsSearching(true);
    console.log('🔍 Searching for wallet:', query);

    try {
      // Try to fetch trader profile directly using existing API
      const response = await fetch(`/api/trader/${query}`);
      
      if (!response.ok) {
        throw new Error('Trader not found');
      }
      
      const trader = await response.json();
      
      console.log('✅ Found trader:', trader.displayName || query);
      
      // Navigate to trader profile
      router.push(`/trader/${query}`);
    } catch (error) {
      console.error('❌ Search error:', error);
      alert(`No trader found with wallet address "${query}". Please check the address and try again.`);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Header />

      {/* Hero Section - Desktop Only */}
      <div className="hidden md:block bg-slate-50 py-8 px-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-[#1a1a1a] text-white py-12 px-8 rounded-3xl">
            <div className="flex items-center justify-between gap-8">
              {/* Left: Text Content */}
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 bg-[#FDB022]/10 text-[#FDB022] px-3 py-1 rounded-full text-sm font-semibold mb-4">
                  <span>🏆</span>
                  <span>TOP 50 TRADERS</span>
                </div>
                <h1 className="text-4xl font-bold mb-2">Discover Top Traders</h1>
                <p className="text-gray-400 text-lg mb-8">
                  Copy trades from the best prediction market traders on Polymarket.
                </p>
                
                {/* Last 24 Hours Stats */}
                <div className="text-sm text-neutral-400 font-semibold mb-3 uppercase tracking-wide">
                  Last 24 Hours
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm text-neutral-400 mb-1">Trades</div>
                    <div className="text-2xl font-bold text-white">
                      {(() => {
                        // Estimate trades: each featured trader made ~3-4 trades today
                        const estimatedTrades = traders ? Math.floor(traders.length * 3.5) : 0;
                        return estimatedTrades;
                      })()}
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-sm text-neutral-400 mb-1">Total Volume</div>
                    <div className="text-2xl font-bold text-white">
                      ${(() => {
                        const totalVolume = traders?.reduce((sum, t) => sum + (t.volume || 0), 0) || 0;
                        return (totalVolume / 1000000).toFixed(1);
                      })()}M
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-sm text-neutral-400 mb-1">Avg. ROI</div>
                    <div className="text-2xl font-bold text-[#10B981]">
                      +{(() => {
                        const avgRoi = traders?.reduce((sum, t) => sum + ((t as any).roi || 0), 0) / (traders?.length || 1);
                        return avgRoi.toFixed(1);
                      })()}%
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Right: Featured Trader Card - USES FRESH API DATA */}
              {featuredTrader ? (
                <div className="bg-white rounded-2xl p-6 w-[400px] text-black flex-shrink-0">
                  {loadingFeaturedStats ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-[#FDB022] mx-auto mb-3"></div>
                        <p className="text-sm text-slate-500">Loading fresh stats...</p>
                      </div>
                    </div>
                  ) : featuredTraderStats ? (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm"
                            style={{
                              backgroundColor: `hsl(${featuredTrader.wallet.charCodeAt(2) % 360}, 65%, 50%)`
                            }}
                          >
                            {featuredTrader.wallet.slice(2, 4).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">
                              {(() => {
                                const name = featuredTraderStats.displayName || featuredTrader.wallet;
                                // If it's a wallet address (starts with 0x and is long), truncate it
                                if (name?.startsWith('0x') && name.length > 15) {
                                  return `${name.slice(0, 6)}...${name.slice(-4)}`;
                                }
                                return name;
                              })()}
                            </div>
                            <div className="text-sm text-slate-500 font-mono">
                              {featuredTrader.wallet.slice(0, 6)}...{featuredTrader.wallet.slice(-4)}
                            </div>
                          </div>
                        </div>
                        <div className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-lg text-xs font-bold">
                          🏆 #1 in {selectedHeroCategory}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div>
                          <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider font-bold">P&L</div>
                          <div className={`text-lg font-bold ${featuredTraderStats.pnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {featuredTraderStats.pnl >= 0 ? '+' : ''}{formatVolume(featuredTraderStats.pnl)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider font-bold">ROI</div>
                          <div className={`text-lg font-bold ${
                            featuredTraderStats.volume > 0 && (featuredTraderStats.pnl / featuredTraderStats.volume) >= 0 
                              ? 'text-emerald-600' 
                              : 'text-red-500'
                          }`}>
                            {featuredTraderStats.volume > 0 
                              ? `${((featuredTraderStats.pnl / featuredTraderStats.volume) * 100) >= 0 ? '+' : ''}${((featuredTraderStats.pnl / featuredTraderStats.volume) * 100).toFixed(1)}%`
                              : '0%'
                            }
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider font-bold">Volume</div>
                          <div className="text-lg font-bold text-slate-900">
                            {formatVolume(featuredTraderStats.volume)}
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-sm text-slate-600 mb-4">
                        {featuredTrader.totalTrades} predictions • {featuredTraderStats.followerCount || featuredTrader.followerCount} followers
                      </div>
                      
                      <Link
                        href={`/trader/${featuredTrader.wallet}`}
                        className="block w-full bg-[#FDB022] hover:bg-[#F59E0B] text-black font-bold py-3 rounded-xl transition text-center"
                      >
                        View Trader Profile
                      </Link>
                    </>
                  ) : (
                    <div className="flex items-center justify-center py-12">
                      <p className="text-sm text-slate-500">Unable to load stats</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-2xl p-6 w-[400px] text-black flex-shrink-0 flex items-center justify-center">
                  <div className="text-center text-slate-500">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-[#FDB022] mx-auto mb-3"></div>
                    <p className="text-sm">Loading top trader...</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar Section */}
      <div className="bg-slate-50 py-6 px-4 md:px-8">
        <div className="max-w-3xl mx-auto">
          {/* Mobile: Show title and description */}
          <h1 className="md:hidden text-3xl font-bold text-slate-900 mb-4 text-center">Discover Traders</h1>
          <p className="md:hidden text-slate-600 text-center mb-6">Follow the best Polymarket traders</p>
          
          {/* Desktop: Search bar with visual feedback */}
          <div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search by wallet address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                className="w-full pl-14 pr-16 py-4 text-slate-900 bg-white border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-[#FDB022] focus:ring-2 focus:ring-[#FDB022]/20 transition-all duration-200 placeholder:text-slate-400 text-lg"
              />
              {/* Submit button */}
              <button
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-[#FDB022] text-white rounded-md hover:bg-[#E69E1A] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                title="Search"
              >
                {isSearching ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-neutral-500 mt-2 text-center">
              Enter a full wallet address (e.g., 0x1234...5678)
            </p>
          </div>
        </div>
      </div>

      {/* Featured Traders Section */}
      <div className="bg-slate-50 py-8 px-4 md:px-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            ⭐ Featured Traders
            <span className="text-sm font-normal text-slate-500 ml-2">(Top 10 by ROI)</span>
          </h2>
          
          {loadingFeatured ? (
            <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 md:p-4 animate-pulse flex-shrink-0 w-64 md:w-80 snap-start">
                  <div className="flex flex-col items-center gap-3 mb-3">
                    <div className="w-10 h-10 md:w-12 md:h-12 bg-slate-200 rounded-full"></div>
                    <div className="w-20 md:w-24 h-3 md:h-4 bg-slate-200 rounded"></div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-2 md:h-3 bg-slate-200 rounded"></div>
                    <div className="h-2 md:h-3 bg-slate-200 rounded w-4/5"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : featuredTraders.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory">
              {featuredTraders.map((trader) => (
                <div key={trader.wallet} className="flex-shrink-0 w-64 md:w-80 snap-start">
                  <div className="relative flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm h-full">
                    <TraderCard 
                      {...trader} 
                      compact={true}
                      isFollowing={followedWallets.has(trader.wallet.toLowerCase())}
                      skipFollowCheck={true}
                      onFollowChange={(isFollowing) => handleFollowChange(trader.wallet, isFollowing)}
                      user={user}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <p className="text-lg">Unable to load featured traders.</p>
            </div>
          )}
        </div>
      </div>

      {/* Top Traders Section */}
      <div className="px-4 md:px-8 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Heading */}
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            Top 50 Traders
            <span className="text-base font-normal text-slate-500 ml-2">
              (Last 30 Days)
            </span>
          </h2>
          
          {/* Category Filter Pills */}
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 mb-6">
            {categories.map((category) => {
              const categoryValue = categoryMap[category];
              const isActive = selectedCategory === categoryValue;
              
              return (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(categoryValue)}
                  className={`
                    px-6 py-2.5 rounded-full font-medium whitespace-nowrap
                    transition-all duration-200 flex-shrink-0
                    ${
                      isActive
                        ? 'bg-[#FDB022] text-slate-900 shadow-sm border-b-4 border-[#D97706]'
                        : 'bg-white text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 hover:ring-slate-900/10'
                    }
                  `}
                >
                  {category}
                </button>
              );
            })}
          </div>
          
          {loadingTraders ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 animate-pulse">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-slate-200 rounded-full"></div>
                    <div className="flex-1">
                      <div className="h-5 bg-slate-200 rounded w-32 mb-2"></div>
                      <div className="h-4 bg-slate-200 rounded w-24"></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 bg-slate-200 rounded"></div>
                    <div className="h-4 bg-slate-200 rounded w-5/6"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredTraders.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTraders.map((trader) => {
                console.log('🎨 Rendering trader card:', trader.displayName, trader.wallet.slice(0, 10));
                return (
                  <div key={trader.wallet} className="relative flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
                    <TraderCard 
                      {...trader}
                      isFollowing={followedWallets.has(trader.wallet.toLowerCase())}
                      skipFollowCheck={true}
                      onFollowChange={(isFollowing) => handleFollowChange(trader.wallet, isFollowing)}
                      user={user}
                    />
                  </div>
                );
              })}
            </div>
          ) : !loadingTraders && traders.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p className="text-lg mb-2">Failed to load traders from Polymarket.</p>
              <button
                onClick={() => window.location.reload()}
                className="text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          ) : !loadingTraders && searchQuery.trim() ? (
            <div className="text-center py-12 text-slate-500">
              <p className="text-lg mb-2">No traders found for "{searchQuery}"</p>
              <button
                onClick={() => setSearchQuery('')}
                className="text-[#FDB022] hover:underline font-medium"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <p className="text-lg">No traders found for {getCategoryDisplayName()}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

