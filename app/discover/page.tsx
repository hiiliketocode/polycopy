'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, ensureProfile } from '@/lib/supabase';
import { resolveFeatureTier } from '@/lib/feature-tier';
import type { User } from '@supabase/supabase-js';
import { Navigation } from '@/components/polycopy/navigation';
import { TraderDiscoveryCard } from '@/components/polycopy/trader-discovery-card';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

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
}

export default function DiscoverPage() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState('overall');
  const [user, setUser] = useState<User | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loadingTraders, setLoadingTraders] = useState(true);
  const [featuredTraders, setFeaturedTraders] = useState<Trader[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [sortPeriod, setSortPeriod] = useState<"30d" | "7d" | "all">("30d");
  
  // BATCH FOLLOW FETCHING
  const [followedWallets, setFollowedWallets] = useState<Set<string>>(new Set());
  const [loadingFollows, setLoadingFollows] = useState(true);

  // Check auth status
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        ensureProfile(session.user.id, session.user.email!);
        
        // Check premium status
        supabase
          .from('profiles')
          .select('is_premium')
          .eq('id', session.user.id)
          .single()
          .then(({ data }) => {
            setIsPremium(data?.is_premium || false);
          });
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

  // BATCH FETCH all follows
  useEffect(() => {
    const fetchAllFollows = async () => {
      if (!user) {
        setFollowedWallets(new Set());
        setLoadingFollows(false);
        return;
      }

      setLoadingFollows(true);
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
        setLoadingFollows(false);
      }
    };

    fetchAllFollows();
  }, [user]);

  // Fetch featured traders
  useEffect(() => {
    const fetchFeaturedTraders = async () => {
      setLoadingFeatured(true);
      try {
        const url = '/api/polymarket/leaderboard?limit=30&orderBy=PNL&timePeriod=month';
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.traders || data.traders.length === 0) {
          setFeaturedTraders([]);
          return;
        }
        
        // Calculate ROI and sort
        const tradersWithROI = data.traders.map((trader: any) => ({
          ...trader,
          roi: trader.volume > 0 ? ((trader.pnl / trader.volume) * 100) : 0
        }));
        
        const topByROI = tradersWithROI
          .sort((a: any, b: any) => (b.roi || 0) - (a.roi || 0))
          .slice(0, 10);
        
        setFeaturedTraders(topByROI);
      } catch (error) {
        console.error('Error fetching featured traders:', error);
        setFeaturedTraders([]);
      } finally {
        setLoadingFeatured(false);
      }
    };

    fetchFeaturedTraders();
  }, []);

  // Fetch traders by category
  useEffect(() => {
    const fetchTraders = async () => {
      setLoadingTraders(true);
      try {
        const response = await fetch(
          `/api/polymarket/leaderboard?limit=50&orderBy=PNL&category=${selectedCategory}&timePeriod=month`
        );
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        const tradersWithROI = (data.traders || []).map((trader: any) => ({
          ...trader,
          roi: trader.volume > 0 ? ((trader.pnl / trader.volume) * 100) : 0
        }));
        
        const sortedByROI = tradersWithROI.sort((a: any, b: any) => (b.roi || 0) - (a.roi || 0));
        
        setTraders(sortedByROI);
      } catch (error) {
        console.error('Error fetching traders:', error);
        setTraders([]);
      } finally {
        setLoadingTraders(false);
      }
    };

    fetchTraders();
  }, [selectedCategory]);

  // Follow change handler
  const handleFollowChange = (wallet: string, isNowFollowing: boolean) => {
    setFollowedWallets(prev => {
      const newSet = new Set(prev);
      const walletLower = wallet.toLowerCase();
      
      if (isNowFollowing) {
        newSet.add(walletLower);
      } else {
        newSet.delete(walletLower);
      }
      
      return newSet;
    });
  };

  // Category mapping
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

  const sortOptions: Array<{ value: "30d" | "7d" | "all"; label: string }> = [
    { value: "30d", label: "30 Days" },
    { value: "7d", label: "7 Days" },
    { value: "all", label: "All Time" },
  ];

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
      
      const trader = await response.json();
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

  // Filter traders by search
  const filteredTraders = traders.filter((trader) => {
    const query = searchQuery.toLowerCase();
    return (
      trader.displayName.toLowerCase().includes(query) ||
      trader.wallet.toLowerCase().includes(query)
    );
  });

  return (
    <>
      <Navigation user={user ? { id: user.id, email: user.email || '' } : null} isPremium={isPremium} />
      
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white md:pt-0 pb-20 md:pb-8">
        {/* Hero Section */}
        <div className="bg-gradient-to-b from-slate-50 to-white">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 pb-3 sm:pt-10 sm:pb-5">
            <div className="text-center max-w-3xl mx-auto mb-6 sm:mb-8">
              <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold text-slate-900 mb-2 sm:mb-4 tracking-tight">
                Discover Top Traders
              </h1>
              <p className="text-sm sm:text-lg text-slate-600 mb-4 sm:mb-6">
                Follow the best prediction market traders on Polymarket
              </p>
            </div>

            {/* Search Bar */}
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
              Enter the wallet address from a trader's Polymarket profile (e.g., 0x1234...5678)
            </p>
          </div>
        </div>

        {/* Featured Traders Section */}
        <div className="border-b border-slate-100 bg-white">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-7">
            <div className="mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                Featured Traders
                <span className="text-sm font-normal text-slate-500 ml-2">(Top 10 by ROI)</span>
              </h2>
            </div>

            {loadingFeatured ? (
              <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 animate-pulse flex-shrink-0 w-64 md:w-80 snap-start">
                    <div className="flex flex-col items-center gap-3 mb-3">
                      <div className="w-16 h-16 bg-slate-200 rounded-full"></div>
                      <div className="w-24 h-4 bg-slate-200 rounded"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : featuredTraders.length > 0 ? (
              <>
                {/* Mobile horizontal scroll */}
                <div className="sm:hidden overflow-x-auto -mx-3 px-3 pb-4">
                  <div className="flex gap-3" style={{ width: "max-content" }}>
                    {featuredTraders.map((trader) => (
                      <div
                        key={trader.wallet}
                        className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-lg transition-shadow"
                        style={{ width: "280px" }}
                      >
                        <Link href={`/trader/${trader.wallet}`} className="block">
                          <div className="flex items-center gap-3 mb-5">
                            <Avatar className="h-14 w-14 border-2 border-white shadow-sm">
                              <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-yellow-500 text-slate-900 font-medium text-base">
                                {trader.displayName.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-slate-900 text-base truncate">{trader.displayName}</h3>
                              <p className="text-xs text-slate-500 font-mono truncate">
                                {trader.wallet.slice(0, 6)}...{trader.wallet.slice(-4)}
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 mb-5">
                            <div>
                              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">
                                ROI
                              </span>
                              <span className={`text-lg font-bold ${(trader.roi || 0) > 0 ? "text-emerald-600" : "text-red-500"}`}>
                                {(trader.roi || 0) > 0 ? "+" : ""}
                                {(trader.roi || 0).toFixed(1)}%
                              </span>
                            </div>

                            <div>
                              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">
                                P&L
                              </span>
                              <span className={`text-lg font-bold ${trader.pnl > 0 ? "text-emerald-600" : "text-red-500"}`}>
                                ${(trader.pnl / 1000).toFixed(1)}K
                              </span>
                            </div>

                            <div>
                              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">
                                Win Rate
                              </span>
                              <span className="text-lg font-bold text-slate-900">{trader.winRate || 0}%</span>
                            </div>

                            <div>
                              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">
                                Volume
                              </span>
                              <span className="text-lg font-bold text-slate-900">
                                ${(trader.volume / 1000).toFixed(0)}K
                              </span>
                            </div>
                          </div>
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Desktop grid */}
                <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-4">
                  {featuredTraders.map((trader) => (
                    <div
                      key={trader.wallet}
                      className="bg-white border border-slate-200 rounded-xl p-6 hover:shadow-lg transition-shadow"
                    >
                      <Link href={`/trader/${trader.wallet}`} className="block">
                        <div className="flex items-center gap-4 mb-6">
                          <Avatar className="h-16 w-16 border-2 border-white shadow-sm">
                            <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-yellow-500 text-slate-900 font-medium text-lg">
                              {trader.displayName.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-slate-900 text-lg truncate">{trader.displayName}</h3>
                            <p className="text-sm text-slate-500 font-mono truncate">
                              {trader.wallet.slice(0, 6)}...{trader.wallet.slice(-4)}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-6">
                          <div>
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">ROI</span>
                            <span className={`text-xl font-bold ${(trader.roi || 0) > 0 ? "text-emerald-600" : "text-red-500"}`}>
                              {(trader.roi || 0) > 0 ? "+" : ""}
                              {(trader.roi || 0).toFixed(1)}%
                            </span>
                          </div>

                          <div>
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">P&L</span>
                            <span className={`text-xl font-bold ${trader.pnl > 0 ? "text-emerald-600" : "text-red-500"}`}>
                              ${(trader.pnl / 1000).toFixed(1)}K
                            </span>
                          </div>

                          <div>
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">
                              Win Rate
                            </span>
                            <span className="text-xl font-bold text-slate-900">{trader.winRate || 0}%</span>
                          </div>

                          <div>
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">
                              Volume
                            </span>
                            <span className="text-xl font-bold text-slate-900">
                              ${(trader.volume / 1000).toFixed(0)}K
                            </span>
                          </div>
                        </div>
                      </Link>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-slate-500">
                <p className="text-lg">Unable to load featured traders.</p>
              </div>
            )}
          </div>
        </div>

        {/* Top 50 Traders Section */}
        <div className="bg-slate-50">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-8 sm:py-14">
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Top 50 Traders by ROI
                  <span className="text-base font-normal text-slate-500 ml-2">(Last 30 Days)</span>
                </h2>

                <div className="flex gap-2 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
                  {sortOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setSortPeriod(option.value)}
                      className={`px-4 py-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                        sortPeriod === option.value
                          ? "bg-slate-900 text-white shadow-sm"
                          : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {categories.map((category) => {
                  const categoryValue = categoryMap[category];
                  const isActive = selectedCategory === categoryValue;
                  
                  return (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(categoryValue)}
                      className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-full font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
                        isActive
                          ? "bg-[#FDB022] text-slate-900 shadow-sm"
                          : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                      }`}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
            </div>

            {loadingTraders ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 animate-pulse">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-slate-200 rounded-full"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-5 bg-slate-200 rounded w-32"></div>
                        <div className="h-4 bg-slate-200 rounded w-24"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredTraders.length > 0 ? (
              <div className="space-y-3">
                {filteredTraders.map((trader, index) => (
                  <div key={trader.wallet} className="flex items-start sm:items-center gap-2 sm:gap-4">
                    <div className="flex-shrink-0 w-6 sm:w-8 text-center pt-4 sm:pt-0">
                      <span className="text-base sm:text-lg font-bold text-slate-400">{index + 1}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <TraderDiscoveryCard 
                        trader={{
                          id: trader.wallet,
                          name: trader.displayName,
                          handle: `${trader.wallet.slice(0, 6)}...${trader.wallet.slice(-4)}`,
                          avatar: '',
                          roi: trader.roi || 0,
                          profit: trader.pnl,
                          volume: trader.volume,
                          winRate: trader.winRate || 0,
                          isFollowing: followedWallets.has(trader.wallet.toLowerCase()),
                        }}
                        onFollowToggle={(traderId, isFollowing) => {
                          handleFollowChange(traderId, isFollowing);
                          
                          // Update Supabase
                          if (user) {
                            if (isFollowing) {
                              supabase.from('follows').insert({
                                user_id: user.id,
                                trader_wallet: traderId
                              });
                            } else {
                              supabase.from('follows').delete()
                                .eq('user_id', user.id)
                                .eq('trader_wallet', traderId);
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500">
                <p className="text-lg">No traders found</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
