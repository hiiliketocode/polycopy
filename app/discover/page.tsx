'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
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
  const [selectedCategory, setSelectedCategory] = useState('overall');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loadingTraders, setLoadingTraders] = useState(true);
  const [featuredTraders, setFeaturedTraders] = useState<Trader[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
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
        setTraders(data.traders || []);
      } catch (error) {
        console.error('❌ Error fetching traders:', error);
        setTraders([]);
      } finally {
        setLoadingTraders(false);
      }
    };

    fetchTraders();
  }, [selectedCategory]);

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

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Header />

      {/* Search Bar Section */}
      <div className="bg-slate-50 py-6 px-4 md:px-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold text-slate-900 mb-4 text-center">Discover Traders</h1>
          <p className="text-slate-600 text-center mb-6">Follow the best Polymarket traders</p>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <span className="text-2xl">🔍</span>
            </div>
            <input
              type="text"
              placeholder="Search any Polymarket wallet or username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-14 pr-4 py-4 text-slate-900 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F59E0B] transition-all duration-200 placeholder:text-slate-400"
            />
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

      {/* Category Filter Pills */}
      <div className="bg-slate-50 px-4 md:px-8 pb-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
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
        </div>
      </div>

      {/* Top Traders Section */}
      <div className="px-4 md:px-8 py-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">
            Top Traders
            {!loadingTraders && filteredTraders.length > 0 && (
              <span className="text-base font-normal text-slate-500 ml-2">
                ({filteredTraders.length} total)
              </span>
            )}
          </h2>
          
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
              {filteredTraders.map((trader) => (
                <div key={trader.wallet} className="relative flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
                  <TraderCard 
                    {...trader}
                    isFollowing={followedWallets.has(trader.wallet.toLowerCase())}
                    skipFollowCheck={true}
                    onFollowChange={(isFollowing) => handleFollowChange(trader.wallet, isFollowing)}
                    user={user}
                  />
                </div>
              ))}
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
          ) : null}
        </div>
      </div>
    </div>
  );
}

