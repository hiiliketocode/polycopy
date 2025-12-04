'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, ensureProfile } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import Header from '../components/Header';

// Types for copied trades
interface CopiedTrade {
  id: string;
  trader_wallet: string;
  trader_username: string | null;
  market_id: string;
  market_title: string;
  outcome: string;
  price_when_copied: number;
  amount_invested: number | null;
  copied_at: string;
  trader_still_has_position: boolean;
  trader_closed_at: string | null;
  current_price: number | null;
  market_resolved: boolean;
  market_resolved_at: string | null;
  roi: number | null;
}

// Helper: Format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays} days ago`;
  if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [followingCount, setFollowingCount] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);
  
  // Wallet state
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [polymarketUsername, setPolymarketUsername] = useState<string | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletInput, setWalletInput] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [savingConnection, setSavingConnection] = useState(false);
  
  // Display name state
  const [displayName, setDisplayName] = useState<string>('You');

  // Copied trades state
  const [copiedTrades, setCopiedTrades] = useState<CopiedTrade[]>([]);
  const [loadingCopiedTrades, setLoadingCopiedTrades] = useState(true);
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [tradeFilter, setTradeFilter] = useState<'all' | 'open' | 'closed' | 'resolved'>('all');
  const [hasAutoRefreshed, setHasAutoRefreshed] = useState(false); // Track if we've done initial auto-refresh
  
  // Toast state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  
  // Notification preferences state
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [loadingNotificationPrefs, setLoadingNotificationPrefs] = useState(false);

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      setLoading(true);

      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          router.push('/login');
          return;
        }

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

  // Fetch user stats and wallet
  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      setLoadingStats(true);

      try {
        // Count how many traders user is following
        const { count, error } = await supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        if (error) {
          console.error('Error fetching following count:', error);
        } else {
          setFollowingCount(count || 0);
        }

        // Fetch wallet address and username from profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('wallet_address, polymarket_username')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
        } else {
          if (profile?.wallet_address) {
            setWalletAddress(profile.wallet_address);
          }
          if (profile?.polymarket_username) {
            setPolymarketUsername(profile.polymarket_username);
          }
        }
      } catch (err) {
        console.error('Error fetching stats:', err);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchStats();
  }, [user]);

  // Fetch copied trades when user is available - using direct Supabase (like follow)
  useEffect(() => {
    if (!user) return;
    
    const fetchCopiedTrades = async () => {
      setLoadingCopiedTrades(true);
      try {
        // Direct Supabase query - same pattern as follow/unfollow
        const { data: trades, error } = await supabase
          .from('copied_trades')
          .select('*')
          .eq('user_id', user.id)
          .order('copied_at', { ascending: false });
        
        if (error) {
          console.error('Error fetching copied trades:', error);
          setCopiedTrades([]);
        } else {
          setCopiedTrades(trades || []);
        }
      } catch (err) {
        console.error('Error fetching copied trades:', err);
        setCopiedTrades([]);
      } finally {
        setLoadingCopiedTrades(false);
      }
    };

    fetchCopiedTrades();
  }, [user]);

  // Fetch notification preferences when user is available
  useEffect(() => {
    if (!user) return;
    
    const fetchNotificationPrefs = async () => {
      try {
        const response = await fetch(`/api/notification-preferences?userId=${user.id}`, { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          setNotificationsEnabled(data.email_notifications_enabled ?? true);
        }
      } catch (err) {
        console.error('Error fetching notification preferences:', err);
      }
    };

    fetchNotificationPrefs();
  }, [user]);

  // Helper function to fetch current price from Polymarket (client-side, no auth needed)
  const fetchCurrentPriceFromPolymarket = async (trade: CopiedTrade): Promise<{ currentPrice: number | null; roi: number | null }> => {
    try {
      let markets: any[] | null = null;
      
      // Try 1: Use condition_id if it starts with 0x
      if (trade.market_id && trade.market_id.startsWith('0x')) {
        const gammaUrl = `https://gamma-api.polymarket.com/markets?condition_id=${trade.market_id}`;
        const response = await fetch(gammaUrl, { cache: 'no-store' });
        
        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            markets = data;
          }
        }
      }
      
      // Try 2: Search by slug if condition_id didn't work
      if (!markets && trade.market_id && !trade.market_id.startsWith('0x')) {
        const gammaUrl = `https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(trade.market_id)}`;
        const response = await fetch(gammaUrl, { cache: 'no-store' });
        
        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            markets = data;
          }
        }
      }
      
      // Try 3: If market_id looks like a slug that didn't work, try as a partial slug match
      // (Sometimes slugs get modified or there are slight differences)
      if (!markets && trade.market_id && !trade.market_id.startsWith('0x')) {
        // Try fetching all recent markets and match by title
        try {
          const gammaUrl = `https://gamma-api.polymarket.com/markets?closed=false&limit=50`;
          const response = await fetch(gammaUrl, { cache: 'no-store' });
          
          if (response.ok) {
            const data = await response.json();
            if (data && data.length > 0) {
              // Find by title match (case-insensitive)
              const titleLower = trade.market_title?.toLowerCase() || '';
              const match = data.find((m: any) => 
                m.question?.toLowerCase() === titleLower ||
                m.question?.toLowerCase().includes(titleLower.substring(0, 30))
              );
              if (match) {
                markets = [match];
              }
            }
          }
        } catch {
          // Ignore text search failures
        }
      }
      
      // Parse the market data and extract price
      if (markets && markets.length > 0) {
        const market = markets[0];
        let prices = market.outcomePrices;
        let outcomes = market.outcomes;
        
        // Parse if string
        if (typeof prices === 'string') {
          try { prices = JSON.parse(prices); } catch { prices = null; }
        }
        if (typeof outcomes === 'string') {
          try { outcomes = JSON.parse(outcomes); } catch { outcomes = null; }
        }
        
        if (prices && Array.isArray(prices) && prices.length >= 2) {
          const outcomeUpper = trade.outcome?.toUpperCase();
          let currentPrice: number | null = null;
          
          // Standard YES/NO markets
          if (outcomeUpper === 'YES') {
            currentPrice = parseFloat(prices[0]);
          } else if (outcomeUpper === 'NO') {
            currentPrice = parseFloat(prices[1]);
          } else if (outcomes && Array.isArray(outcomes)) {
            // Custom outcomes - find by name (case-insensitive)
            const outcomeIndex = outcomes.findIndex(
              (o: string) => o?.toUpperCase() === outcomeUpper
            );
            if (outcomeIndex >= 0 && outcomeIndex < prices.length) {
              currentPrice = parseFloat(prices[outcomeIndex]);
            }
          }
          
          // Calculate ROI
          let roi: number | null = null;
          if (currentPrice !== null && trade.price_when_copied) {
            const entryPrice = trade.price_when_copied;
            if (entryPrice > 0) {
              roi = ((currentPrice - entryPrice) / entryPrice) * 100;
              roi = parseFloat(roi.toFixed(2));
            }
          }
          
          return { currentPrice, roi };
        }
      }
    } catch (err) {
      console.error('Error fetching price from Polymarket:', err);
    }
    
    return { currentPrice: null, roi: null };
  };

  // Auto-refresh trade status once when trades are first loaded (to get current prices)
  useEffect(() => {
    // Only auto-refresh if:
    // 1. We haven't already auto-refreshed
    // 2. Trades have finished loading
    // 3. We have trades to refresh
    // 4. User is logged in
    // 5. We're not currently refreshing
    if (!hasAutoRefreshed && !loadingCopiedTrades && copiedTrades.length > 0 && user && !refreshingStatus) {
      console.log('🔄 Auto-refreshing trade prices from Polymarket for', copiedTrades.length, 'trades...');
      // Debug: Log what market_ids we're working with
      copiedTrades.forEach((t, i) => {
        console.log(`  Trade ${i + 1}: market_id="${t.market_id}" (${t.market_id?.startsWith('0x') ? 'conditionId' : 'slug/title'})`);
      });
      setHasAutoRefreshed(true); // Mark as done to prevent re-triggering
      
      // Auto-refresh prices directly from Polymarket (bypasses auth issues)
      const autoRefreshPrices = async () => {
        setRefreshingStatus(true);
        const updatedTrades: CopiedTrade[] = [];
        let successCount = 0;
        
        for (const trade of copiedTrades) {
          const { currentPrice, roi } = await fetchCurrentPriceFromPolymarket(trade);
          if (currentPrice !== null) {
            successCount++;
            console.log(`  ✓ Found price for "${trade.market_title?.substring(0, 30)}...": ${currentPrice}`);
          }
          updatedTrades.push({
            ...trade,
            current_price: currentPrice ?? trade.current_price,
            roi: roi ?? trade.roi,
          });
        }
        
        setCopiedTrades(updatedTrades);
        setRefreshingStatus(false);
        console.log(`✅ Auto-refresh complete: ${successCount}/${copiedTrades.length} prices found`);
      };
      
      autoRefreshPrices();
    }
  }, [hasAutoRefreshed, loadingCopiedTrades, copiedTrades.length, user, refreshingStatus]);

  // Update display name based on wallet connection
  useEffect(() => {
    const updateDisplayName = async () => {
      if (!walletAddress) {
        // No wallet connected - show "You"
        setDisplayName('You');
        return;
      }

      // Wallet connected - try to find username from leaderboard
      try {
        const response = await fetch('/api/polymarket/leaderboard?limit=100&orderBy=PNL');
        
        if (response.ok) {
          const leaderboardData = await response.json();
          
          // Find this wallet in the leaderboard
          const trader = leaderboardData.traders?.find(
            (t: any) => t.wallet.toLowerCase() === walletAddress.toLowerCase()
          );
          
          if (trader && trader.displayName) {
            // Found username in leaderboard
            setDisplayName(trader.displayName);
            return;
          }
        }
        
        // Not found in leaderboard - show shortened wallet
        const shortened = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
        setDisplayName(shortened);
      } catch (err) {
        console.error('Error fetching username:', err);
        // Fallback to shortened wallet
        const shortened = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
        setDisplayName(shortened);
      }
    };

    updateDisplayName();
  }, [walletAddress]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  // Validate Ethereum address format
  const isValidEthereumAddress = (address: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  };

  // Abbreviate wallet address
  const abbreviateWallet = (address: string): string => {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleConnectWallet = () => {
    setWalletInput('');
    setConnectionError('');
    setShowWalletModal(true);
  };

  // Toggle email notifications
  const handleToggleNotifications = async () => {
    if (!user || loadingNotificationPrefs) return;
    
    const newValue = !notificationsEnabled;
    setNotificationsEnabled(newValue);
    setLoadingNotificationPrefs(true);
    
    try {
      const response = await fetch('/api/notification-preferences', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          email_notifications_enabled: newValue
        })
      });
      
      if (response.ok) {
        setToastMessage(newValue ? 'Email notifications enabled' : 'Email notifications disabled');
        setToastType('success');
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      } else {
        // Revert on error
        setNotificationsEnabled(!newValue);
        setToastMessage('Failed to update notification preferences');
        setToastType('error');
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      }
    } catch (err) {
      console.error('Error updating notification preferences:', err);
      setNotificationsEnabled(!newValue);
      setToastMessage('Failed to update notification preferences');
      setToastType('error');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } finally {
      setLoadingNotificationPrefs(false);
    }
  };

  const handleConnect = async () => {
    setConnectionError('');

    // Validate input
    if (!walletInput.trim()) {
      setConnectionError('Please enter a wallet address');
      return;
    }

    if (!isValidEthereumAddress(walletInput.trim())) {
      setConnectionError('Invalid Ethereum address. Must start with 0x and be 42 characters long.');
      return;
    }

    setSavingConnection(true);

    try {
      // Save to profiles table
      const { error } = await supabase
        .from('profiles')
        .update({ 
          wallet_address: walletInput.trim().toLowerCase(),
          polymarket_username: null
        })
        .eq('id', user!.id);

      if (error) {
        throw error;
      }

      setWalletAddress(walletInput.trim().toLowerCase());
      setPolymarketUsername(null);
      setShowWalletModal(false);
      setWalletInput('');
    } catch (err: any) {
      console.error('Error saving wallet:', err);
      setConnectionError(err.message || 'Failed to save wallet address');
    } finally {
      setSavingConnection(false);
    }
  };

  // Show toast helper
  const showToastMessage = (message: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  // Refresh status for all copied trades - fetches directly from Polymarket (no auth needed)
  const handleRefreshStatus = async () => {
    if (refreshingStatus || copiedTrades.length === 0 || !user) return;
    
    setRefreshingStatus(true);
    let successCount = 0;
    let errorCount = 0;
    
    try {
      // Refresh prices directly from Polymarket (bypasses auth issues)
      const updatedTrades: CopiedTrade[] = [];
      
      for (let i = 0; i < copiedTrades.length; i++) {
        const trade = copiedTrades[i];
        
        try {
          const { currentPrice, roi } = await fetchCurrentPriceFromPolymarket(trade);
          
          if (currentPrice !== null) {
            successCount++;
            updatedTrades.push({
              ...trade,
              current_price: currentPrice,
              roi: roi,
            });
          } else {
            errorCount++;
            updatedTrades.push(trade); // Keep original trade data
          }
        } catch (err: any) {
          console.error('❌ Price fetch error:', err.message);
          errorCount++;
          updatedTrades.push(trade); // Keep original trade data
        }
      }
      
      // Update state with new data
      setCopiedTrades(updatedTrades);
      
      // Show success/error toast
      if (errorCount === 0) {
        showToastMessage(`${successCount} trade${successCount !== 1 ? 's' : ''} updated!`, 'success');
      } else if (successCount > 0) {
        showToastMessage(`${successCount} updated, ${errorCount} could not find prices`, 'error');
      } else {
        showToastMessage('Could not fetch prices - markets may be resolved', 'error');
      }
    } catch (err: any) {
      console.error('❌ Error in refresh:', err);
      showToastMessage('Failed to refresh prices: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setRefreshingStatus(false);
    }
  };

  // Get trade status display
  const getTradeStatus = (trade: CopiedTrade) => {
    if (trade.market_resolved) {
      return { label: 'Resolved', color: 'text-blue-600', bg: 'bg-blue-50' };
    }
    if (!trade.trader_still_has_position) {
      return { label: 'Closed', color: 'text-red-600', bg: 'bg-red-50' };
    }
    return { label: 'Open', color: 'text-green-600', bg: 'bg-green-50' };
  };
  
  // Status tooltip state
  const [showStatusTooltip, setShowStatusTooltip] = useState(false);
  
  // Delete trade state
  const [deletingTradeId, setDeletingTradeId] = useState<string | null>(null);
  
  // Delete trade handler - using direct Supabase (like follow/unfollow)
  const handleDeleteTrade = async (tradeId: string) => {
    if (!user) return;
    
    if (!confirm('Are you sure you want to delete this copied trade? This cannot be undone.')) {
      return;
    }
    
    setDeletingTradeId(tradeId);
    
    try {
      // Direct Supabase delete - same pattern as unfollow
      const { error } = await supabase
        .from('copied_trades')
        .delete()
        .eq('id', tradeId)
        .eq('user_id', user.id);  // Security: only delete if it's their trade
      
      if (error) {
        throw new Error(error.message || 'Failed to delete trade');
      }
      
      // Remove from local state
      setCopiedTrades(prev => prev.filter(t => t.id !== tradeId));
      setExpandedTradeId(null);
      
      // Show success toast
      showToastMessage('Trade deleted successfully', 'success');
      
    } catch (err: any) {
      console.error('Error deleting trade:', err);
      showToastMessage(err.message || 'Failed to delete trade', 'error');
    } finally {
      setDeletingTradeId(null);
    }
  };

  // Truncate text
  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  // Filter copied trades
  const filteredCopiedTrades = copiedTrades.filter((trade) => {
    switch (tradeFilter) {
      case 'open':
        return trade.trader_still_has_position && !trade.market_resolved;
      case 'closed':
        return !trade.trader_still_has_position && !trade.market_resolved;
      case 'resolved':
        return trade.market_resolved;
      default:
        return true;
    }
  });

  const handleDisconnectWallet = async () => {
    if (!confirm('Are you sure you want to disconnect your Polymarket account?')) {
      return;
    }

    setSavingConnection(true);

    try {
      // Remove both wallet and username from profiles table
      const { error } = await supabase
        .from('profiles')
        .update({ 
          wallet_address: null,
          polymarket_username: null
        })
        .eq('id', user!.id);

      if (error) {
        throw error;
      }

      setWalletAddress(null);
      setPolymarketUsername(null);
    } catch (err: any) {
      console.error('Error disconnecting:', err);
      alert('Failed to disconnect: ' + (err.message || 'Unknown error'));
    } finally {
      setSavingConnection(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-secondary pb-20 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary mx-auto mb-4"></div>
          <p className="text-tertiary text-lg">Loading profile...</p>
        </div>
      </div>
    );
  }

  // This shouldn't be reached if auth check works, but just in case
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Header />

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-8">
        {/* Profile Hero Section - Single Compact Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            {/* Left Side - Profile Info + Stats */}
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="w-16 h-16 md:w-14 md:h-14 bg-[#FDB022] rounded-full flex items-center justify-center text-[#0F0F0F] font-bold text-2xl md:text-xl shadow-sm flex-shrink-0">
                {displayName[0].toUpperCase()}
              </div>
              <div>
                {/* Username */}
                <h1 className="text-xl font-bold text-slate-900 mb-3">{displayName}</h1>
                
                {/* Stats Row */}
                {loadingStats ? (
                  <div className="flex items-center gap-6">
                    <div className="h-4 w-16 bg-slate-100 animate-pulse rounded"></div>
                    <div className="h-4 w-20 bg-slate-100 animate-pulse rounded"></div>
                    <div className="h-4 w-16 bg-slate-100 animate-pulse rounded"></div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    <Link href="/discover" className="hover:text-[#FDB022] transition-colors">
                      <span className="font-semibold text-slate-900">{followingCount}</span>
                      <span className="text-slate-500 ml-1">Following</span>
                    </Link>
                    <div>
                      <span className="font-semibold text-slate-900">{copiedTrades.length}</span>
                      <span className="text-slate-500 ml-1">Trades Copied</span>
                    </div>
                    <div>
                      <span className={`font-semibold ${
                        copiedTrades.length === 0 ? 'text-slate-400' :
                        (copiedTrades.filter(t => t.roi !== null).reduce((sum, t) => sum + (t.roi || 0), 0) / 
                         Math.max(copiedTrades.filter(t => t.roi !== null).length, 1)) >= 0 
                          ? 'text-emerald-600' : 'text-red-600'
                      }`}>
                        {copiedTrades.length === 0 ? '--' : 
                          `${(copiedTrades.filter(t => t.roi !== null).reduce((sum, t) => sum + (t.roi || 0), 0) / 
                            Math.max(copiedTrades.filter(t => t.roi !== null).length, 1)).toFixed(1)}%`
                        }
                      </span>
                      <span className="text-slate-500 ml-1">Avg. ROI</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Side - Wallet Connection (Compact) */}
            <div className="flex-shrink-0">
              {walletAddress ? (
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-emerald-700">{abbreviateWallet(walletAddress)}</span>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(walletAddress);
                        } catch (err) {
                          console.error('Failed to copy:', err);
                        }
                      }}
                      className="text-emerald-600 hover:text-emerald-800 transition-colors"
                      title="Copy full address"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                  <button
                    onClick={handleDisconnectWallet}
                    disabled={savingConnection}
                    className="text-xs text-emerald-600 hover:text-emerald-800 font-medium ml-1"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleConnectWallet}
                  className="flex items-center gap-2 bg-[#FDB022] hover:bg-[#E69E1A] text-black font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Connect Polymarket
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Copied Trades Section */}
        <div className="mb-6">
          {/* Header Row - with Refresh button on mobile */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-label text-slate-400">
              COPIED TRADES {!loadingCopiedTrades && `(${filteredCopiedTrades.length})`}
            </h2>
            {/* Refresh Status Button - Mobile only */}
            {!loadingCopiedTrades && copiedTrades.length > 0 && (
              <button
                onClick={handleRefreshStatus}
                disabled={refreshingStatus}
                className="md:hidden text-sm text-[#FDB022] hover:text-[#E69E1A] font-medium flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
              >
                <svg 
                  className={`w-4 h-4 ${refreshingStatus ? 'animate-spin' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {refreshingStatus ? 'Refreshing...' : 'Refresh'}
              </button>
            )}
          </div>

          {/* Filter Tabs Row */}
          {!loadingCopiedTrades && copiedTrades.length > 0 && (
            <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
              <button
                onClick={() => setTradeFilter('all')}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  tradeFilter === 'all'
                    ? 'bg-[#FDB022] text-black'
                    : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300'
                }`}
              >
                All Trades
              </button>
              <button
                onClick={() => setTradeFilter('open')}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  tradeFilter === 'open'
                    ? 'bg-[#FDB022] text-black'
                    : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300'
                }`}
              >
                Open
              </button>
              <button
                onClick={() => setTradeFilter('closed')}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  tradeFilter === 'closed'
                    ? 'bg-[#FDB022] text-black'
                    : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300'
                }`}
              >
                Closed
              </button>
              <button
                onClick={() => setTradeFilter('resolved')}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  tradeFilter === 'resolved'
                    ? 'bg-[#FDB022] text-black'
                    : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300'
                }`}
              >
                Resolved
              </button>
              
              {/* Refresh Status Button - Desktop only */}
              <button
                onClick={handleRefreshStatus}
                disabled={refreshingStatus}
                className="hidden md:flex ml-auto text-sm text-[#FDB022] hover:text-[#E69E1A] font-medium items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
              >
                <svg 
                  className={`w-4 h-4 ${refreshingStatus ? 'animate-spin' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {refreshingStatus ? 'Refreshing...' : 'Refresh Status'}
              </button>
            </div>
          )}

          {loadingCopiedTrades ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-slate-200 rounded w-1/3"></div>
                <div className="h-12 bg-slate-100 rounded"></div>
                <div className="h-12 bg-slate-100 rounded"></div>
              </div>
            </div>
          ) : copiedTrades.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
              <div className="text-5xl mb-4">📋</div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">No copied trades yet</h3>
              <p className="text-slate-500 mb-6">
                You haven't copied any trades yet. Visit the Feed to start copying from top traders!
              </p>
              <Link
                href="/feed"
                className="inline-block bg-[#FDB022] hover:bg-[#E69E1A] text-black font-semibold py-2.5 px-6 rounded-lg transition-colors"
              >
                Go to Feed
              </Link>
            </div>
          ) : filteredCopiedTrades.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
              <div className="text-5xl mb-4">🔍</div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                No {tradeFilter} trades
              </h3>
              <p className="text-slate-500">
                Try selecting a different filter to see more trades.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Market</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Trader</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">
                        <div className="relative inline-flex items-center gap-1">
                          Status
                          <button
                            onMouseEnter={() => setShowStatusTooltip(true)}
                            onMouseLeave={() => setShowStatusTooltip(false)}
                            className="text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                          {showStatusTooltip && (
                            <div className="absolute left-0 top-full mt-2 z-50 w-64 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-lg normal-case tracking-normal font-normal">
                              <p className="font-medium mb-2">Position Status</p>
                              <ul className="space-y-1.5">
                                <li className="flex items-center gap-2">
                                  <span className="text-green-400 font-medium">Open</span>
                                  <span className="text-slate-300">— Trader still holds position</span>
                                </li>
                                <li className="flex items-center gap-2">
                                  <span className="text-red-400 font-medium">Closed</span>
                                  <span className="text-slate-300">— Trader exited position</span>
                                </li>
                                <li className="flex items-center gap-2">
                                  <span className="text-blue-400 font-medium">Resolved</span>
                                  <span className="text-slate-300">— Market has ended</span>
                                </li>
                              </ul>
                              <div className="absolute -top-1.5 left-4 w-3 h-3 bg-slate-800 rotate-45"></div>
                            </div>
                          )}
                        </div>
                      </th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">ROI</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Copied</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCopiedTrades.map((trade) => {
                      const status = getTradeStatus(trade);
                      const isExpanded = expandedTradeId === trade.id;
                      
                      return (
                        <React.Fragment key={trade.id}>
                          {/* Main Row */}
                          <tr 
                            className="hover:bg-slate-50 transition-colors cursor-pointer"
                            onClick={() => setExpandedTradeId(isExpanded ? null : trade.id)}
                          >
                            {/* MARKET */}
                            <td className="px-4 py-3 max-w-[200px]">
                              <p className="text-sm font-medium text-slate-900 truncate">
                                {truncateText(trade.market_title, 40)}
                              </p>
                            </td>
                            {/* TRADER */}
                            <td className="px-4 py-3">
                              <Link
                                href={`/trader/${trade.trader_wallet}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-sm text-[#FDB022] hover:underline"
                              >
                                {trade.trader_username || `${trade.trader_wallet.slice(0, 6)}...${trade.trader_wallet.slice(-4)}`}
                              </Link>
                            </td>
                            {/* STATUS */}
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${status.color} ${status.bg}`}>
                                {status.label}
                              </span>
                            </td>
                            {/* ROI */}
                            <td className="px-4 py-3 text-right">
                              <span className={`text-sm font-semibold ${
                                trade.roi === null ? 'text-slate-400' :
                                trade.roi > 0 ? 'text-green-600' :
                                trade.roi < 0 ? 'text-red-600' : 'text-slate-500'
                              }`}>
                                {trade.roi === null ? '--' : `${trade.roi > 0 ? '+' : ''}${trade.roi.toFixed(1)}%`}
                              </span>
                            </td>
                            {/* COPIED */}
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-sm text-slate-500">
                                  {formatRelativeTime(trade.copied_at)}
                                </span>
                                <svg 
                                  className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                                  fill="none" 
                                  stroke="currentColor" 
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
                            </td>
                          </tr>
                          
                          {/* Expanded Details Row */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={5} className="px-4 pb-4 bg-slate-50 border-t border-slate-100">
                                <div className="pt-4">
                                  <p className="text-sm text-slate-700 mb-4">{trade.market_title}</p>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                    <div>
                                      <p className="text-xs text-slate-500 mb-1">Entry Price</p>
                                      <p className="text-sm font-semibold text-slate-900">
                                        {trade.price_when_copied !== null && trade.price_when_copied !== undefined
                                          ? `${Math.round(trade.price_when_copied * 100)}¢`
                                          : '--'}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-slate-500 mb-1">Current Price</p>
                                      <p className="text-sm font-semibold text-slate-900">
                                        {trade.current_price !== null && trade.current_price !== undefined
                                          ? `${Math.round(trade.current_price * 100)}¢`
                                          : '--'}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-slate-500 mb-1">Outcome</p>
                                      <p className={`text-sm font-semibold ${trade.outcome === 'YES' ? 'text-green-600' : 'text-red-600'}`}>
                                        {trade.outcome}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-slate-500 mb-1">Amount Invested</p>
                                      <p className="text-sm font-semibold text-slate-900">
                                        {trade.amount_invested !== null ? `$${trade.amount_invested.toFixed(2)}` : '--'}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <a
                                      href={`https://polymarket.com/search?q=${encodeURIComponent(trade.market_title)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-[#FDB022] hover:underline font-medium"
                                    >
                                      View on Polymarket ↗
                                    </a>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteTrade(trade.id);
                                      }}
                                      disabled={deletingTradeId === trade.id}
                                      className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                                    >
                                      {deletingTradeId === trade.id ? 'Deleting...' : 'Delete Trade'}
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {filteredCopiedTrades.map((trade) => {
                  const status = getTradeStatus(trade);
                  const isExpanded = expandedTradeId === trade.id;
                  
                  return (
                    <div key={trade.id}>
                      <button
                        onClick={() => setExpandedTradeId(isExpanded ? null : trade.id)}
                        className="w-full text-left p-4 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <p className="text-sm font-medium text-slate-900 flex-1 pr-2">
                            {truncateText(trade.market_title, 60)}
                          </p>
                          <svg 
                            className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium ${status.color} ${status.bg}`}>
                            {status.label}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className={`font-semibold ${
                            trade.roi === null ? 'text-slate-400' :
                            trade.roi > 0 ? 'text-green-600' :
                            trade.roi < 0 ? 'text-red-600' : 'text-slate-500'
                          }`}>
                            {trade.roi === null ? '--' : `${trade.roi > 0 ? '+' : ''}${trade.roi.toFixed(1)}%`}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-500">{formatRelativeTime(trade.copied_at)}</span>
                        </div>
                      </button>
                      
                      {/* Expanded Details - Mobile */}
                      {isExpanded && (
                        <div className="px-4 pb-4 bg-slate-50 border-t border-slate-100">
                          <div className="pt-4 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <p className="text-xs text-slate-500">Entry Price</p>
                                <p className="text-sm font-semibold text-slate-900">
                                  {trade.price_when_copied !== null && trade.price_when_copied !== undefined
                                    ? `${Math.round(trade.price_when_copied * 100)}¢`
                                    : '--'}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500">Current Price</p>
                                <p className="text-sm font-semibold text-slate-900">
                                  {trade.current_price !== null && trade.current_price !== undefined
                                    ? `${Math.round(trade.current_price * 100)}¢`
                                    : '--'}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500">Outcome</p>
                                <p className={`text-sm font-semibold ${trade.outcome === 'YES' ? 'text-green-600' : 'text-red-600'}`}>
                                  {trade.outcome}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500">Amount Invested</p>
                                <p className="text-sm font-semibold text-slate-900">
                                  {trade.amount_invested !== null ? `$${trade.amount_invested.toFixed(2)}` : '--'}
                                </p>
                              </div>
                            </div>
                            <div className="pt-2 flex items-center justify-between">
                              <a
                                href={`https://polymarket.com/search?q=${encodeURIComponent(trade.market_title)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-[#FDB022] hover:underline font-medium"
                              >
                                View on Polymarket ↗
                              </a>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTrade(trade.id);
                                }}
                                disabled={deletingTradeId === trade.id}
                                className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                              >
                                {deletingTradeId === trade.id ? 'Deleting...' : 'Delete Trade'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Settings Section */}
        <div className="mb-6">
          <h2 className="text-label text-slate-400 mb-4">SETTINGS</h2>
          
          {/* Email Notifications */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-4">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                {/* Bell icon */}
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                
                <div>
                  <p className="font-semibold text-slate-900">Email Notifications</p>
                  <p className="text-small text-slate-500">Get notified when traders close positions or markets resolve</p>
                </div>
              </div>
              
              {/* Toggle Switch */}
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={notificationsEnabled}
                  onChange={handleToggleNotifications}
                  disabled={loadingNotificationPrefs}
                  className="sr-only peer"
                />
                <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-yellow-300/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#FDB022] ${loadingNotificationPrefs ? 'opacity-50' : ''}`}></div>
              </label>
            </div>
          </div>
          
          {/* Help & Support */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <a
              href="https://twitter.com/polycopyapp"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                {/* Twitter/X icon */}
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-[#FDB022]/10 transition-colors">
                  <svg className="w-5 h-5 text-slate-600 group-hover:text-[#FDB022] transition-colors" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </div>
                
                <div>
                  <p className="font-semibold text-slate-900">Help & Support</p>
                  <p className="text-small text-slate-500">Get help on X @polycopyapp</p>
                </div>
              </div>
              
              {/* External link icon */}
              <svg className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="w-full bg-red-50 hover:bg-red-100 text-red-600 py-4 px-6 rounded-2xl font-bold transition-all duration-200 border border-red-200 shadow-sm"
        >
          Sign Out
        </button>
      </div>

      {/* Connection Modal */}
      {showWalletModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 md:p-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-tertiary">Connect Polymarket Account</h3>
              <button
                onClick={() => {
                  setShowWalletModal(false);
                  setConnectionError('');
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors text-2xl"
              >
                ×
              </button>
            </div>

            {/* Instructions */}
            <div className="mb-6">
              <p className="text-gray-600 text-sm mb-4">
                Enter your Polymarket wallet address to connect your account.
              </p>
              
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                <p className="text-sm font-semibold text-blue-900 mb-2">
                  💡 <strong>Where to find your wallet address:</strong>
                </p>
                <ol className="text-xs text-blue-800 space-y-1 ml-4 list-decimal">
                  <li>Go to <a href="https://polymarket.com/profile" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-900">polymarket.com/profile</a></li>
                  <li>Click "Copy address" next to your username</li>
                  <li>Paste it below</li>
                </ol>
              </div>

              <label htmlFor="wallet-input" className="block text-sm font-medium text-gray-700 mb-2">
                Wallet Address
              </label>
              <input
                id="wallet-input"
                type="text"
                value={walletInput}
                onChange={(e) => {
                  setWalletInput(e.target.value);
                  setConnectionError('');
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && walletInput.trim()) {
                    handleConnect();
                  }
                }}
                placeholder="0x..."
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all font-mono text-sm"
              />
              
              {connectionError && (
                <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                  <span>⚠️</span>
                  {connectionError}
                </p>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowWalletModal(false);
                  setConnectionError('');
                }}
                className="flex-1 bg-gray-100 text-gray-700 py-3 px-6 rounded-xl font-semibold hover:bg-gray-200 transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleConnect}
                disabled={savingConnection}
                className="flex-1 bg-primary text-tertiary py-3 px-6 rounded-xl font-semibold hover:bg-yellow-400 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingConnection ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Connecting...
                  </span>
                ) : (
                  'Connect'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${
            toastType === 'success' 
              ? 'bg-neutral-900 text-white' 
              : 'bg-red-600 text-white'
          }`}>
            {toastType === 'success' ? (
              <svg className="w-5 h-5 text-[#10B981]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
