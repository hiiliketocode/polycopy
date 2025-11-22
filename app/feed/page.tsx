'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, ensureProfile } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import Header from '@/app/components/Header';

interface FeedTrade {
  id: string;
  trader: {
    wallet: string;
    displayName: string;
  };
  market: {
    title: string;
    slug: string;
    eventSlug?: string;
    icon?: string;
  };
  trade: {
    side: 'BUY' | 'SELL';
    outcome: string;
    size: number;
    price: number;
    timestamp: number;
    timeAgo: string;
  };
}

// Helper function to convert Unix timestamp to relative time
function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const tradeTime = timestamp * 1000;
  const diffInSeconds = Math.floor((now - tradeTime) / 1000);
  
  if (diffInSeconds < 0) {
    return 'Just now'; // Fallback for future timestamps
  }
  
  if (diffInSeconds < 60) return 'Just now';
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays}d ago`;
  }
  
  return new Date(tradeTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function FeedPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasFollows, setHasFollows] = useState(false);
  const [checkingFollows, setCheckingFollows] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Feed state
  const [trades, setTrades] = useState<FeedTrade[]>([]); // Displayed trades
  const [allTrades, setAllTrades] = useState<FeedTrade[]>([]); // All fetched trades
  const [displayedTrades, setDisplayedTrades] = useState(50); // Number to display - START AT 50
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      console.log('🔐 Starting auth check...');
      
      const { data: { user } } = await supabase.auth.getUser();
      
      console.log('🔐 Auth result:', user ? user.email : 'No user');
      
      if (!user) {
        console.log('❌ No user found, redirecting to login');
        router.push('/login');
        return;
      }
      
      console.log('✅ User authenticated:', user.email);
      setUser(user);
      setLoading(false); // EXIT LOADING HERE!
      console.log('✅ Auth check complete, loading set to false');
    };
    
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('🔄 Auth state changed:', _event);
      if (session?.user) {
        console.log('✅ User logged in:', session.user.email);
        setUser(session.user);
      } else {
        console.log('ℹ️ User logged out');
        setUser(null);
        setHasFollows(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  // Check if user has any follows
  useEffect(() => {
    console.log('🎯 checkFollows useEffect triggered. User:', user ? user.email : 'null');
    
    const checkFollows = async () => {
      console.log('🔧 checkFollows function called');
      
      if (!user) {
        console.log('ℹ️ No user, skipping follow check');
        setHasFollows(false);
        setCheckingFollows(false);
        console.log('✅ Early return - no user');
        return;
      }

      console.log('🔍 Checking follows for user:', user.email, 'User ID:', user.id);
      setCheckingFollows(true);
      setError(null);

      try {
        console.log('📡 About to query follows...');
        
        // Simple, standard Supabase query
        const { data: follows, error: followError } = await supabase
          .from('follows')
          .select('trader_wallet')
          .eq('user_id', user.id);

        console.log('✅ Query completed!');
        console.log('📦 Follows data:', follows);
        console.log('⚠️ Follows error:', followError);
        console.log('🔢 Follows count:', follows?.length || 0);

        if (followError) {
          console.error('❌ Database error:', followError);
          setError('Could not load follows');
          setHasFollows(false);
          console.log('🏁 About to call setCheckingFollows(false) - ERROR PATH');
        } else {
          const hasAnyFollows = follows && follows.length > 0;
          console.log(hasAnyFollows ? `✅ User has ${follows.length} follows` : 'ℹ️ User has no follows');
          setHasFollows(hasAnyFollows);
          console.log('🏁 About to call setCheckingFollows(false) - SUCCESS PATH');
        }
      } catch (err: any) {
        console.error('❌ Unexpected error:', err);
        console.error('❌ Error type:', typeof err);
        console.error('❌ Error message:', err?.message);
        setError('Something went wrong');
        setHasFollows(false);
        console.log('🏁 About to call setCheckingFollows(false) - CATCH PATH');
      } finally {
        console.log('🎬 FINALLY block executing...');
        setCheckingFollows(false);
        console.log('✅ setCheckingFollows(false) called - Follow check complete');
      }
    };

    console.log('🚀 Calling checkFollows()...');
    checkFollows();
    console.log('📞 checkFollows() called (async execution started)');
  }, [user]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const handleCopyTrade = (trade: FeedTrade) => {
    // Construct Polymarket URL using eventSlug (preferred) or slug as fallback
    const url = trade.market.eventSlug 
      ? `https://polymarket.com/event/${trade.market.eventSlug}?utm_source=polycopy`
      : `https://polymarket.com/${trade.market.slug}?utm_source=polycopy`;
    
    console.log('🔗 Opening Polymarket:', url);
    console.log('📊 Trade details:', {
      market: trade.market.title,
      eventSlug: trade.market.eventSlug,
      slug: trade.market.slug,
      outcome: trade.trade.outcome,
      side: trade.trade.side
    });
    
    // Open in new tab
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const loadMoreTrades = () => {
    const nextBatch = displayedTrades + 50; // Load 50 more trades at a time
    console.log(`📄 Loading more trades: showing ${nextBatch} of ${allTrades.length}`);
    setTrades(allTrades.slice(0, nextBatch));
    setDisplayedTrades(nextBatch);
  };

  // Fetch feed when user has follows (client-side)
  useEffect(() => {
    console.log('🔄 Feed useEffect triggered - user:', !!user, 'hasFollows:', hasFollows);
    
    if (!user || !hasFollows) {
      console.log('ℹ️ Skipping feed fetch - user:', !!user, 'hasFollows:', hasFollows);
      return;
    }

    const fetchFeed = async () => {
      console.log('1️⃣ Starting fetchFeed...');
      console.log('📰 Starting client-side feed fetch...');
      console.log('👤 Current user ID:', user.id);
      console.log('📧 Current user email:', user.email);
      setLoadingFeed(true);
      setFeedError(null);

      try {
        // 1. Fetch followed traders from Supabase
        console.log('📡 Fetching follows from Supabase for user:', user.id);
        const { data: follows, error: followsError } = await supabase
          .from('follows')
          .select('trader_wallet')
          .eq('user_id', user.id);

        if (followsError) {
          console.error('❌ Error fetching follows:', followsError);
          throw new Error('Failed to fetch follows');
        }

        if (!follows || follows.length === 0) {
          console.warn('⚠️ No follows found for this user - CLEARING TRADES');
          setTrades([]);
          return;
        }

        console.log(`✅ Found ${follows.length} followed traders`);
        console.log('📋 Followed trader wallets:', follows.map(f => f.trader_wallet));

        // 2. Fetch trader names from leaderboard
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

        // 3. Fetch trades for EACH followed wallet (in parallel)
        console.log('📡 Fetching trades for each followed wallet (in parallel)...');
        
        const TRADES_PER_WALLET = 50; // Fetch 50 most recent trades per wallet
        
        // Fetch trades for all wallets in parallel
        const tradePromises = follows.map(async (follow) => {
          const wallet = follow.trader_wallet;
          console.log(`  → Fetching trades for ${wallet.slice(0, 8)}...`);
          
          try {
            const response = await fetch(
              `https://data-api.polymarket.com/trades?limit=${TRADES_PER_WALLET}&user=${wallet}`
            );
            
            if (!response.ok) {
              console.warn(`  ⚠️ Failed to fetch trades for ${wallet.slice(0, 8)}: ${response.status}`);
              return [];
            }
            
            const walletTrades = await response.json();
            console.log(`  ✅ Fetched ${walletTrades.length} trades for ${wallet.slice(0, 8)}`);
            
            // Add wallet info to each trade for filtering
            return walletTrades.map((trade: any) => ({
              ...trade,
              _followedWallet: wallet.toLowerCase(),
            }));
          } catch (error) {
            console.warn(`  ⚠️ Error fetching trades for ${wallet.slice(0, 8)}:`, error);
            return [];
          }
        });
        
        // Wait for all trade fetches to complete
        const allTradesArrays = await Promise.all(tradePromises);
        const allTradesRaw = allTradesArrays.flat();
        
        console.log(`✅ Total trades fetched from ${follows.length} wallets: ${allTradesRaw.length}`);
        
        if (allTradesRaw.length === 0) {
          console.warn('⚠️ No trades found for any followed traders');
          setTrades([]);
          setAllTrades([]);
          setDisplayedTrades(0);
          return;
        }

        // Sort all trades by timestamp (newest first)
        allTradesRaw.sort((a: any, b: any) => {
          const aTime = a.timestamp || 0;
          const bTime = b.timestamp || 0;
          return bTime - aTime;
        });
        
        console.log(`✅ Sorted ${allTradesRaw.length} trades by timestamp`);
        
        // Get timestamp range
        if (allTradesRaw.length > 0) {
          const newestTimestamp = allTradesRaw[0].timestamp;
          const oldestTimestamp = allTradesRaw[allTradesRaw.length - 1].timestamp;
          const newestDate = new Date(newestTimestamp * 1000);
          const oldestDate = new Date(oldestTimestamp * 1000);
          console.log(`📅 Timestamp range: ${newestDate.toLocaleString()} to ${oldestDate.toLocaleString()}`);
        }

        // 4. Format trades for display
        console.log('🎨 Formatting all', allTradesRaw.length, 'trades...');
        const formattedTrades: FeedTrade[] = allTradesRaw.map((trade: any, index: number) => {
          // Debug first 3 trades timestamps
          if (index < 3) {
            console.log(`🕐 Trade ${index + 1} raw timestamp:`, trade.timestamp, typeof trade.timestamp);
            console.log(`🕐 Trade ${index + 1} date:`, new Date(trade.timestamp * 1000).toString());
          }

          // Use helper function to get relative time
          const timeAgo = getRelativeTime(trade.timestamp);
          
          if (index < 3) {
            console.log(`🕐 Trade ${index + 1} timeAgo:`, timeAgo);
          }

          // Get trader name - prioritize leaderboard data, then try trade data
          // Polymarket API returns proxyWallet field
          const wallet = trade.proxyWallet || trade.trader_address || trade.wallet || trade.user || trade._followedWallet || '';
          
          // First, check if we have the trader's name from the leaderboard
          const leaderboardName = wallet ? traderNames[wallet.toLowerCase()] : null;
          
          // Then check trade data for username
          const tradeName = trade.trader?.name 
            || trade.trader?.userName 
            || trade.trader?.pseudonym 
            || trade.name 
            || trade.userName 
            || trade.pseudonym
            || null;
          
          // Priority: leaderboard name > trade name > abbreviated wallet
          const displayName = leaderboardName 
            || tradeName 
            || (wallet && wallet.length > 10 
                ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
                : wallet || 'Unknown');

          // Get market title from various possible fields
          const marketTitle = trade.title 
            || trade.market?.title 
            || trade.marketTitle 
            || trade.market_title
            || trade.question
            || trade.market?.question
            || trade.market
            || 'Unknown Market';

          return {
            id: trade.id || `${wallet}-${trade.timestamp}`,
            trader: {
              wallet: wallet || 'Unknown',
              displayName: displayName,
            },
            market: {
              title: marketTitle,
              slug: trade.market_slug || trade.market?.slug || trade.slug || '',
              eventSlug: trade.eventSlug || trade.event_slug || trade.market?.eventSlug,
              icon: trade.market_icon || trade.market?.icon,
            },
            trade: {
              side: trade.side || 'BUY',
              outcome: trade.outcome || trade.option || '',
              size: parseFloat(trade.size || trade.amount || 0),
              price: parseFloat(trade.price || 0),
              timestamp: trade.timestamp * 1000,
              timeAgo: timeAgo,
            },
          };
        });

        console.log('✅ Feed data formatted:', {
          tradesCount: formattedTrades.length,
        });
        
        // Final summary
        console.log('═══════════════════════════════════════');
        console.log('📊 FEED FETCH SUMMARY:');
        console.log(`   User follows: ${follows.length} traders`);
        console.log(`   Trades fetched: ${allTradesRaw.length} total`);
        console.log(`   Trades displayed initially: ${Math.min(50, formattedTrades.length)}`);
        console.log(`   Available to load more: ${Math.max(0, formattedTrades.length - 50)}`);
        if (formattedTrades.length === 0) {
          console.warn('⚠️ NO TRADES TO DISPLAY!');
          console.warn('   → No recent trades from followed traders');
          console.warn('   → Try following more active traders');
        }
        console.log('═══════════════════════════════════════');
        
        // Store all trades and display first 50 (pagination)
        console.log(`✅ Fetched ${formattedTrades.length} total trades`);
        console.log('📦 Sample formatted trade:', formattedTrades[0]);
        
        setAllTrades(formattedTrades); // Store all
        setTrades(formattedTrades.slice(0, 50)); // Display first 50
        setDisplayedTrades(50); // Reset pagination to 50
        
      } catch (err: any) {
        console.error('❌ Error fetching feed:', err);
        console.error('❌ Error stack:', err.stack);
        setFeedError(err.message || 'Failed to load feed');
        console.warn('⚠️ ERROR CAUGHT - CLEARING TRADES');
        setTrades([]);
      } finally {
        console.log('🏁 Setting loadingFeed to false');
        setLoadingFeed(false);
        console.log('✅ Feed fetch complete');
      }
    };

    fetchFeed();
  }, [user, hasFollows]);

  // Render logging
  console.log('═══════════════════════════════════════');
  console.log('🎨 RENDER - Current component state:');
  console.log('   loading:', loading);
  console.log('   checkingFollows:', checkingFollows);
  console.log('   hasFollows:', hasFollows);
  console.log('   user:', user ? user.email : 'null');
  console.log('   error:', error);
  console.log('   loadingFeed:', loadingFeed);
  console.log('   feedError:', feedError);
  console.log('   allTrades.length:', allTrades.length);
  console.log('   trades.length (displayed):', trades.length);
  console.log('   displayedTrades:', displayedTrades);
  console.log('   First trade:', trades[0]);
  console.log('═══════════════════════════════════════');
  
  if (loading || checkingFollows) {
    console.log('🔄 Rendering LOADING state');
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
          <h1 className="text-4xl font-bold text-tertiary">Your Feed</h1>
        </div>

        {/* Loading Content */}
        <div className="flex items-center justify-center pt-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary mx-auto mb-4"></div>
            <p className="text-tertiary text-lg">
              {loading ? 'Checking authentication...' : 'Checking follows...'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-secondary pb-20">
        {/* Auth Status Bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-2">
          <div className="max-w-6xl mx-auto flex justify-end items-center">
            <Link
              href="/login"
              className="text-sm text-tertiary hover:text-gray-600 font-medium transition-colors"
            >
              Sign in →
            </Link>
          </div>
        </div>

        {/* Header */}
        <div className="bg-primary p-8 text-center">
          <h1 className="text-4xl font-bold text-tertiary">Your Feed</h1>
        </div>

        {/* Error Content */}
        <div className="flex items-center justify-center pt-20 px-4">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-6">⚠️</div>
            <h2 className="text-2xl font-bold text-tertiary mb-4">
              Something went wrong
            </h2>
            <p className="text-gray-600 mb-8">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-block bg-primary text-tertiary px-8 py-4 rounded-xl font-semibold hover:bg-yellow-400 transition-all duration-200 shadow-md hover:shadow-lg"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Not logged in state
  if (!user) {
    return (
      <div className="min-h-screen bg-secondary pb-20">
        {/* Auth Status Bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-2">
          <div className="max-w-6xl mx-auto flex justify-end items-center">
            <Link
              href="/login"
              className="text-sm text-tertiary hover:text-gray-600 font-medium transition-colors"
            >
              Sign in →
            </Link>
          </div>
        </div>

        {/* Header */}
        <div className="bg-primary p-8 text-center">
          <h1 className="text-4xl font-bold text-tertiary">Your Feed</h1>
        </div>

        {/* Not Logged In Content */}
        <div className="flex items-center justify-center pt-20 px-4">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-6">🔒</div>
            <h2 className="text-2xl font-bold text-tertiary mb-4">
              Log in to see your feed
            </h2>
            <p className="text-gray-600 mb-8">
              Follow top Polymarket traders and see their activity in your personalized feed
            </p>
            <Link
              href="/login"
              className="inline-block bg-primary text-tertiary px-8 py-4 rounded-xl font-semibold hover:bg-yellow-400 transition-all duration-200 shadow-md hover:shadow-lg"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // No follows state
  if (!hasFollows) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20">
        <Header />

        {/* No Follows Content */}
        <div className="flex items-center justify-center pt-20 px-4">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-6">📋</div>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              Your feed is empty
            </h2>
            <p className="text-slate-600 mb-8">
              Follow some traders to see their activity and stay updated on their trades!
            </p>
            <Link
              href="/discover"
              className="inline-block bg-[#FDB022] hover:bg-[#F59E0B] text-slate-900 px-8 py-4 rounded-xl font-bold shadow-sm transition-all duration-200 border-b-4 border-[#D97706] active:border-b-0 active:translate-y-1"
            >
              Find Traders to Follow
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Has follows - show feed placeholder
  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Header />

      {/* Feed Content */}
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
        {loadingFeed ? (
          // Loading state
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 animate-pulse">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-slate-200 rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-slate-200 rounded w-1/3 mb-2"></div>
                    <div className="h-4 bg-slate-200 rounded w-3/4 mb-3"></div>
                    <div className="h-3 bg-slate-200 rounded w-1/4"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : feedError ? (
          // Error state
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Failed to load feed</h3>
            <p className="text-slate-600 mb-6">{feedError}</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-block bg-[#FDB022] hover:bg-[#F59E0B] text-slate-900 px-6 py-3 rounded-xl font-bold shadow-sm transition-all duration-200 border-b-4 border-[#D97706] active:border-b-0 active:translate-y-1"
            >
              Try Again
            </button>
          </div>
        ) : trades.length === 0 ? (
          // Empty state
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">No recent activity</h3>
            <p className="text-slate-600 mb-6">
              No trades yet from the traders you follow. Check back soon or follow more traders!
            </p>
            <Link
              href="/discover"
              className="inline-block bg-[#FDB022] hover:bg-[#F59E0B] text-slate-900 px-6 py-3 rounded-xl font-bold shadow-sm transition-all duration-200 border-b-4 border-[#D97706] active:border-b-0 active:translate-y-1"
            >
              Follow More Traders
            </Link>
          </div>
        ) : (
          // Feed timeline
          <div className="space-y-3">
            {trades.map((trade, index) => (
              <div
                key={`${trade.id}-${trade.trade.timestamp}-${index}`}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
              >
                {/* Header: Who & When */}
                <div className="flex items-center justify-between px-4 pt-3 pb-2">
                  <div className="flex items-center gap-2">
                    {/* Avatar */}
                    <Link href={`/trader/${trade.trader.wallet}`}>
                      <div
                        className="h-8 w-8 rounded-full flex items-center justify-center text-white font-bold text-sm cursor-pointer hover:opacity-80 transition-opacity"
                        style={{
                          backgroundColor: `hsl(${trade.trader.wallet.charCodeAt(2) % 360}, 65%, 50%)`
                        }}
                      >
                        {trade.trader.wallet.slice(2, 4).toUpperCase()}
                      </div>
                    </Link>
                    <div className="flex flex-col">
                      <Link
                        href={`/trader/${trade.trader.wallet}`}
                        className="text-sm font-semibold text-slate-900 hover:text-[#FDB022] transition-colors"
                      >
                        {trade.trader.displayName}
                      </Link>
                      <span className="text-xs text-slate-500">
                        {getRelativeTime(trade.trade.timestamp / 1000)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Market Info "Ticket" with colored left border */}
                <div className={`relative mx-4 mb-3 flex flex-col gap-1 rounded-lg bg-slate-50 p-3 border-l-4 ${
                  ['yes', 'up', 'over'].includes(trade.trade.outcome.toLowerCase())
                    ? 'border-emerald-500'
                    : 'border-red-500'
                }`}>
                  <h3 className="text-sm font-medium text-slate-900 leading-tight">
                    {trade.market.title}
                  </h3>
                  
                  {/* Position Details */}
                  <div className="mt-2 flex items-center gap-3 flex-wrap">
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold ${
                      ['yes', 'up', 'over'].includes(trade.trade.outcome.toLowerCase())
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {trade.trade.outcome.toUpperCase()}
                    </span>
                    <span className="text-xs font-medium text-slate-600">@ ${trade.trade.price.toFixed(2)}</span>
                    <span className="text-xs text-slate-400">
                      Size: ${trade.trade.size.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>

                {/* Footer: Action */}
                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                      {trade.trade.side === 'BUY' ? 'BOUGHT' : 'SOLD'}
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      {trade.trade.side === 'BUY' ? '🟢' : '🔴'} {trade.trade.side}
                    </span>
                  </div>
                  <button
                    onClick={() => handleCopyTrade(trade)}
                    className="flex items-center gap-2 rounded-lg bg-[#FDB022] px-6 py-2 text-sm font-bold text-slate-900 shadow-sm hover:bg-[#F59E0B] active:scale-95 transition-all"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                    </svg>
                    Copy Trade
                  </button>
                </div>
              </div>
            ))}
            
            {/* Load More Button */}
            {displayedTrades < allTrades.length && (
              <div className="flex justify-center pt-6">
                <button
                  onClick={loadMoreTrades}
                  className="bg-[#FDB022] hover:bg-[#F59E0B] text-slate-900 px-8 py-4 rounded-xl font-bold shadow-sm transition-all duration-200 border-b-4 border-[#D97706] active:border-b-0 active:translate-y-1"
                >
                  Load More Trades ({allTrades.length - displayedTrades} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
