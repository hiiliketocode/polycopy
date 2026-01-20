'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import { Navigation } from '@/components/polycopy/navigation';
import { TraderDiscoveryCard } from '@/components/polycopy/trader-discovery-card';
import { Card } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { triggerLoggedOut } from '@/lib/auth/logout-events';

interface Trader {
  wallet: string;
  displayName: string;
  pnl: number;
  winRate: number;
  totalTrades: number;
  volume: number;
  roi: number;
  profileImage?: string | null;
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

// Helper function to truncate wallet addresses that are used as display names
function formatDisplayName(name: string, wallet: string): string {
  // Check if the display name is actually a wallet address (starts with 0x and is long)
  if (name.startsWith('0x') && name.length > 20) {
    return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
  }
  return name;
}

function FollowingPageContent() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loadingTraders, setLoadingTraders] = useState(true);
  const [followedWallets, setFollowedWallets] = useState<Set<string>>(new Set());
  const [expectedTraderCount, setExpectedTraderCount] = useState(0);

  // Check auth status and redirect if not logged in
  useEffect(() => {
    const checkAuth = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.user) {
          triggerLoggedOut('session_missing');
          router.push('/login');
          return;
        }
        
        setUser(session.user);
        
        // Fetch user profile and wallet
        const [profileRes, walletRes] = await Promise.all([
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
        ]);
        
        setIsPremium(profileRes.data?.is_premium || false);
        setProfileImageUrl(profileRes.data?.profile_image_url || null);
        setWalletAddress(
          walletRes.data?.polymarket_account_address || 
          walletRes.data?.eoa_address || 
          null
        );
      } catch (err) {
        console.error('Auth error:', err);
        triggerLoggedOut('auth_error');
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // Fetch followed traders
  useEffect(() => {
    if (!user) return;

    const fetchFollowedTraders = async () => {
      setLoadingTraders(true);
      
      try {
        // Fetch all followed wallets
        const { data: follows, error } = await supabase
          .from('follows')
          .select('trader_wallet')
          .eq('user_id', user.id);

        if (error) throw error;

        if (!follows || follows.length === 0) {
          setTraders([]);
          setFollowedWallets(new Set());
          setLoadingTraders(false);
          return;
        }

        const wallets = follows.map(f => f.trader_wallet);
        setFollowedWallets(new Set(wallets.map(w => w.toLowerCase())));
        setExpectedTraderCount(wallets.length);

        // Show loading state immediately
        setLoadingTraders(false);
        setTraders([]); // Start with empty array

        // Fetch all traders in parallel for faster loading
        const traderPromises = wallets.map(async (wallet) => {
          try {
            const response = await fetch(`/api/trader/${wallet}`, {
              next: { revalidate: 60 }
            });
            
            if (!response.ok) {
              console.warn(`Failed to fetch data for trader ${wallet}`);
              return null;
            }
            
            const data = await response.json();
            const traderData: Trader = {
              wallet: wallet,
              displayName: data.displayName || wallet,
              pnl: data.pnl || 0,
              winRate: data.winRate || 0,
              totalTrades: data.totalTrades || 0,
              volume: data.volume || 0,
              roi: data.volume > 0 ? ((data.pnl / data.volume) * 100) : 0,
              profileImage: data.profileImage || null,
            };
            
            return traderData;
          } catch (err) {
            console.warn(`Error fetching trader ${wallet}:`, err);
            return null;
          }
        });

        // Wait for all traders to load in parallel
        const results = await Promise.allSettled(traderPromises);
        const loadedTraders = results
          .filter((result): result is PromiseFulfilledResult<Trader> => 
            result.status === 'fulfilled' && result.value !== null
          )
          .map(result => result.value);

        // Remove duplicates by wallet address (case-insensitive)
        const uniqueTraders = Array.from(
          new Map(loadedTraders.map(t => [t.wallet.toLowerCase(), t])).values()
        );

        // Sort by PNL descending
        uniqueTraders.sort((a, b) => b.pnl - a.pnl);
        
        setTraders(uniqueTraders);
      } catch (err) {
        console.error('Error fetching followed traders:', err);
        setTraders([]);
        setLoadingTraders(false);
      }
    };

    fetchFollowedTraders();
  }, [user]);

  const handleFollowChange = async (wallet: string, nowFollowing: boolean) => {
    if (!user) return;

    try {
      if (!nowFollowing) {
        // Unfollowed - remove from local state
        setFollowedWallets(prev => {
          const next = new Set(prev);
          next.delete(wallet.toLowerCase());
          return next;
        });
        setTraders(prev => prev.filter(t => t.wallet.toLowerCase() !== wallet.toLowerCase()));
      }
    } catch (err) {
      console.error('Error updating follow state:', err);
    }
  };

  if (loading) {
    return (
      <>
        <Navigation 
          user={user ? { id: user.id, email: user.email || '' } : null} 
          isPremium={isPremium}
          walletAddress={walletAddress}
          profileImageUrl={profileImageUrl}
        />
        <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 flex items-center justify-center">
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
      
      <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pt-4 md:pt-0 pb-20 md:pb-8">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 space-y-6 py-8">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Link 
              href="/profile"
              className="flex items-center justify-center w-10 h-10 rounded-full bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-slate-600" />
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Following</h1>
              <p className="text-sm text-slate-500 mt-1">
                {traders.length} {traders.length === 1 ? 'trader' : 'traders'} • All-time performance
              </p>
            </div>
          </div>

          {/* Traders List */}
          {loadingTraders ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Card key={i} className="p-6 animate-pulse">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-slate-200 rounded-full"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-5 bg-slate-200 rounded w-32"></div>
                      <div className="h-4 bg-slate-200 rounded w-24"></div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : expectedTraderCount === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-slate-600 mb-2">You're not following any traders yet.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {/* Show loaded traders */}
              {traders.map((trader, index) => (
                <div key={trader.wallet} className="flex items-start sm:items-center gap-2 sm:gap-4">
                  <div className="flex-shrink-0 w-6 sm:w-8 text-center pt-4 sm:pt-0">
                    <span className="text-base sm:text-lg font-bold text-slate-400">{index + 1}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                      <TraderDiscoveryCard 
                      trader={{
                        id: trader.wallet,
                        name: formatDisplayName(trader.displayName, trader.wallet),
                        handle: `${trader.wallet.slice(0, 6)}...${trader.wallet.slice(-4)}`,
                        avatar: trader.profileImage || '',
                        wallet: trader.wallet,
                        roi: trader.roi || 0,
                        profit: trader.pnl,
                        volume: trader.volume,
                        winRate: trader.winRate || 0,
                        isFollowing: true,
                      }}
                      onFollowToggle={handleFollowChange}
                    />
                  </div>
                </div>
              ))}
              
              {/* Show skeleton loaders for traders still loading */}
              {traders.length < expectedTraderCount && (
                <>
                  {Array.from({ length: expectedTraderCount - traders.length }).map((_, i) => (
                    <Card key={`loading-${i}`} className="p-6 animate-pulse">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-slate-200 rounded-full"></div>
                        <div className="flex-1 space-y-2">
                          <div className="h-5 bg-slate-200 rounded w-32"></div>
                          <div className="h-4 bg-slate-200 rounded w-24"></div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function FollowingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#FDB022] mx-auto mb-4"></div>
          <p className="text-slate-600 text-lg">Loading...</p>
        </div>
      </div>
    }>
      <FollowingPageContent />
    </Suspense>
  );
}
