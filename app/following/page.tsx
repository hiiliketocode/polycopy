'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, ensureProfile } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import TraderCard from '../components/TraderCard';

interface Trader {
  wallet: string;
  displayName: string;
  pnl: number;
  volume: number;
  rank: number;
  followerCount: number;
}

export default function FollowingPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [followedTraders, setFollowedTraders] = useState<Trader[]>([]);
  const [fetchingFollows, setFetchingFollows] = useState(false);

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      console.log('🔍 Following page: Checking auth...');
      setLoading(true);

      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          console.log('❌ No user session, redirecting to login');
          router.push('/login');
          return;
        }

        console.log('✅ User authenticated:', session.user.email);
        setUser(session.user);
        await ensureProfile(session.user.id, session.user.email!);
      } catch (err) {
        console.error('❌ Auth error:', err);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        router.push('/login');
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  // Fetch followed traders
  useEffect(() => {
    fetchFollowedTraders();
  }, [user]);

  const fetchFollowedTraders = async () => {
    console.log('═══════════════════════════════════════');
    console.log('🔍 Following page - fetchFollowedTraders called');
    console.log('👤 Current user:', user);
    console.log('📧 User email:', user?.email);
    console.log('🆔 User ID:', user?.id);
    
    if (!user) {
      console.log('❌ No user, skipping follows fetch');
      return;
    }

    console.log('📊 Starting follows fetch...');
    console.log('🔐 Getting fresh session...');
    
    // Get fresh session to ensure we have the right user
    const { data: { session } } = await supabase.auth.getSession();
    console.log('✅ Session user ID:', session?.user?.id);
    console.log('✅ Session user email:', session?.user?.email);
    
    setFetchingFollows(true);

    try {
      // 1. Fetch follows from database
      console.log('📡 Querying follows table...');
      console.log('   Table: follows');
      console.log('   Filter: user_id =', user.id);
      
      const { data: follows, error } = await supabase
        .from('follows')
        .select('trader_wallet')
        .eq('user_id', user.id);

      console.log('📦 Query result:');
      console.log('   Data:', follows);
      console.log('   Error:', error);
      console.log('   Count:', follows?.length || 0);

      if (error) {
        console.error('❌ Error fetching follows:', error);
        console.error('   Code:', error.code);
        console.error('   Message:', error.message);
        console.error('   Details:', error.details);
        setFollowedTraders([]);
        return;
      }

      console.log('✅ Follows fetched successfully:', follows?.length || 0);

      if (!follows || follows.length === 0) {
        console.warn('⚠️ No follows found - showing empty state');
        console.log('═══════════════════════════════════════');
        setFollowedTraders([]);
        return;
      }

      // Get list of followed wallet addresses
      const followedWallets = follows.map(f => f.trader_wallet.toLowerCase());
      console.log('📋 Followed wallets:', followedWallets);

      // 2. Fetch trader names from leaderboard (SAME LOGIC AS FEED PAGE)
      console.log('📡 Fetching trader names from leaderboard...');
      const traderNames: Record<string, string> = {};
      
      try {
        const leaderboardRes = await fetch('/api/polymarket/leaderboard?limit=100&orderBy=PNL');
        if (leaderboardRes.ok) {
          const leaderboardData = await leaderboardRes.json();
          
          // Create a map of wallet → displayName for all followed traders
          for (const follow of follows) {
            const trader = leaderboardData.traders?.find(
              (t: any) => t.wallet.toLowerCase() === follow.trader_wallet.toLowerCase()
            );
            
            if (trader && trader.displayName) {
              traderNames[follow.trader_wallet.toLowerCase()] = trader.displayName;
              console.log(`✅ Found name for ${follow.trader_wallet.slice(0, 8)}...: ${trader.displayName}`);
            }
          }
          
          console.log(`✅ Fetched ${Object.keys(traderNames).length} trader names from leaderboard`);
        }
      } catch (err) {
        console.warn('⚠️ Failed to fetch leaderboard names, will use wallet addresses:', err);
      }

      // 3. Fetch trader data from our API
      console.log('📡 Fetching trader data from our API...');
      
      const traderDataPromises = followedWallets.map(async (wallet) => {
        console.log(`📡 Fetching data for ${wallet.slice(0, 10)}...`);
        
        try {
          const traderRes = await fetch(`/api/trader/${wallet}`);
          if (traderRes.ok) {
            const traderData = await traderRes.json();
            
            // Use leaderboard name if available, otherwise use API name
            const displayName = traderNames[wallet] || traderData.displayName;
            
            console.log(`✅ Found ${wallet.slice(0, 10)}... as ${displayName}`);
            
            return {
              wallet: traderData.wallet,
              displayName: displayName,
              pnl: traderData.pnl,
              volume: traderData.volume,
              rank: 0,
              followerCount: traderData.followerCount || 0,
            };
          } else {
            console.warn(`⚠️ API returned ${traderRes.status} for ${wallet.slice(0, 10)}...`);
          }
        } catch (err) {
          console.warn(`❌ Failed to fetch data for ${wallet}:`, err);
        }

        // Fallback: use leaderboard name or abbreviated wallet address
        const displayName = traderNames[wallet] || `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
        console.log(`⚠️ Using fallback for ${wallet.slice(0, 10)}...: ${displayName}`);
        
        return {
          wallet: wallet,
          displayName: displayName,
          pnl: 0,
          volume: 0,
          rank: 0,
          followerCount: 0,
        };
      });

      const traderData = await Promise.all(traderDataPromises);
      console.log('✅ All trader data fetched:', traderData.length);
      
      const filteredData = traderData.filter(Boolean) as Trader[];
      console.log('✅ Filtered trader data:', filteredData.length);
      console.log('📊 Setting followedTraders state with', filteredData.length, 'traders');
      
      setFollowedTraders(filteredData);
      
      console.log('✅ fetchFollowedTraders complete');
      console.log('═══════════════════════════════════════');
    } catch (err) {
      console.error('❌ Error fetching followed traders:', err);
      console.error('❌ Error stack:', err instanceof Error ? err.stack : 'No stack');
      setFollowedTraders([]);
      console.log('═══════════════════════════════════════');
    } finally {
      console.log('🏁 Setting fetchingFollows to false');
      setFetchingFollows(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  // Render logging
  console.log('═══════════════════════════════════════');
  console.log('🎨 RENDER - Following page state:');
  console.log('   loading:', loading);
  console.log('   fetchingFollows:', fetchingFollows);
  console.log('   user:', user ? user.email : 'null');
  console.log('   followedTraders.length:', followedTraders.length);
  console.log('   followedTraders:', followedTraders);
  console.log('═══════════════════════════════════════');

  // Loading state
  if (loading || fetchingFollows) {
    console.log('🔄 Rendering loading state...');
    return (
      <div className="min-h-screen bg-secondary pb-20">
        {/* Auth Status Bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-2">
          <div className="max-w-6xl mx-auto flex justify-end items-center">
            <span className="text-xs text-gray-400">Loading...</span>
          </div>
        </div>

        {/* Header */}
        <div className="bg-primary p-8 text-center">
          <h1 className="text-4xl font-bold text-tertiary">Following</h1>
        </div>

        {/* Loading Content */}
        <div className="flex items-center justify-center pt-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary mx-auto mb-4"></div>
            <p className="text-tertiary text-lg">Loading followed traders...</p>
          </div>
        </div>
      </div>
    );
  }

  // This shouldn't be reached if auth check works, but just in case
  if (!user) {
    console.log('❌ No user - returning null');
    return null;
  }

  // Empty state - no follows
  if (followedTraders.length === 0) {
    console.log('📭 Rendering empty state (no follows)');
    return (
      <div className="min-h-screen bg-secondary pb-20">
        {/* Auth Status Bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-2">
          <div className="max-w-6xl mx-auto flex justify-end items-center">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">
                Logged in as: <span className="font-medium text-tertiary">{user.email}</span>
              </span>
              <button
                onClick={handleLogout}
                className="text-sm text-gray-600 hover:text-tertiary underline transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="bg-primary p-8 text-center">
          <h1 className="text-4xl font-bold text-tertiary">Following</h1>
          <p className="text-tertiary mt-2">0 traders</p>
        </div>

        {/* Empty State Content */}
        <div className="flex items-center justify-center pt-20 px-4">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-6">👥</div>
            <h2 className="text-2xl font-bold text-tertiary mb-4">
              You're not following anyone yet
            </h2>
            <p className="text-gray-600 mb-8">
              Discover top traders to get started and stay updated on their trades!
            </p>
            <Link
              href="/discover"
              className="inline-block bg-primary text-tertiary px-8 py-4 rounded-xl font-semibold hover:bg-yellow-400 transition-all duration-200 shadow-md hover:shadow-lg"
            >
              Find Traders
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Has followed traders - show them
  console.log('✅ Rendering followed traders grid:', followedTraders.length, 'traders');
  return (
    <div className="min-h-screen bg-secondary pb-20">
      {/* Auth Status Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2">
        <div className="max-w-6xl mx-auto flex justify-end items-center">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">
              Logged in as: <span className="font-medium text-tertiary">{user.email}</span>
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-600 hover:text-tertiary underline transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="bg-primary p-8 text-center">
        <h1 className="text-4xl font-bold text-tertiary">Following</h1>
        <p className="text-tertiary mt-2">
          {followedTraders.length} {followedTraders.length === 1 ? 'trader' : 'traders'} you follow
        </p>
      </div>

      {/* Followed Traders Grid */}
      <div className="px-4 md:px-8 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {followedTraders.map((trader) => (
              <TraderCard
                key={trader.wallet}
                {...trader}
                isFollowing={true}
                skipFollowCheck={true}
                onFollowChange={fetchFollowedTraders}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

