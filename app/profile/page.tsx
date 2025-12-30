'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase, ensureProfile } from '@/lib/supabase';
import { resolveFeatureTier, tierHasPremiumAccess } from '@/lib/feature-tier';
import type { User } from '@supabase/supabase-js';
import { Navigation } from '@/components/polycopy/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { UpgradeModal } from '@/components/polycopy/upgrade-modal';
import { ConnectWalletModal } from '@/components/polycopy/connect-wallet-modal';
import { MarkTradeClosed } from '@/components/polycopy/mark-trade-closed';
import { EditCopiedTrade } from '@/components/polycopy/edit-copied-trade';
import {
  TrendingUp,
  Percent,
  DollarSign,
  Crown,
  Wallet,
  Copy,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Edit2,
  X,
  Bell,
  BellOff,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Types for copied trades
interface CopiedTrade {
  id: string;
  trader_wallet: string;
  trader_username: string | null;
  market_id: string;
  market_title: string;
  market_slug: string | null;
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
  user_closed_at: string | null;
  user_exit_price: number | null;
  resolved_outcome?: string | null;
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

function formatCompactNumber(value: number) {
  const absValue = Math.abs(value);
  if (absValue >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (absValue >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export default function ProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [followingCount, setFollowingCount] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);
  
  // Premium and trading wallet state
  const [profile, setProfile] = useState<any>(null);
  const [showWalletSetup, setShowWalletSetup] = useState(false);
  const [disconnectingWallet, setDisconnectingWallet] = useState(false);
  const featureTier = resolveFeatureTier(Boolean(user), profile);
  const hasPremiumAccess = tierHasPremiumAccess(featureTier);
  
  // Copied trades state
  const [copiedTrades, setCopiedTrades] = useState<CopiedTrade[]>([]);
  const [loadingCopiedTrades, setLoadingCopiedTrades] = useState(true);
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [tradeFilter, setTradeFilter] = useState<'all' | 'open' | 'closed' | 'resolved'>('all');
  
  // Edit/Close trade modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [tradeToEdit, setTradeToEdit] = useState<CopiedTrade | null>(null);
  
  // Toast state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // UI state - Check for tab query parameter
  const tabParam = searchParams?.get('tab');
  const initialTab = (tabParam === 'settings' || tabParam === 'performance') ? tabParam : 'copied-trades';
  const [activeTab, setActiveTab] = useState<'copied-trades' | 'performance' | 'settings'>(initialTab as any);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  
  // Notification preferences state
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [loadingNotificationPrefs, setLoadingNotificationPrefs] = useState(false);
  
  // Refs to prevent re-fetching on tab focus
  const hasLoadedStatsRef = useRef(false);
  const hasLoadedTradesRef = useRef(false);
  const hasLoadedNotificationPrefsRef = useRef(false);

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
        console.error('Auth error:', err);
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
    if (!user || hasLoadedStatsRef.current) return;
    hasLoadedStatsRef.current = true;

    const fetchStats = async () => {
      setLoadingStats(true);

      try {
        const { count, error } = await supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        if (error) {
          console.error('Error fetching following count:', error);
        } else {
          setFollowingCount(count || 0);
        }

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('is_premium, is_admin, trading_wallet_address, premium_since')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
        } else {
          setProfile(profileData);
          setIsPremium(profileData?.is_premium || false);
        }
      } catch (err) {
        console.error('Error fetching stats:', err);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchStats();
  }, [user]);

  // Fetch copied trades with auto-refresh status
  useEffect(() => {
    if (!user || hasLoadedTradesRef.current) return;
    hasLoadedTradesRef.current = true;
    
    const fetchCopiedTrades = async () => {
      setLoadingCopiedTrades(true);
      try {
        const { data: trades, error } = await supabase
          .from('copied_trades')
          .select('*')
          .eq('user_id', user.id)
          .order('copied_at', { ascending: false });
        
        if (error) {
          console.error('Error fetching copied trades:', error);
          setCopiedTrades([]);
          setLoadingCopiedTrades(false);
          return;
        }
        
        // Recalculate ROI for user-closed trades
        const tradesWithCorrectRoi = (trades || []).map(trade => {
          if (trade.user_closed_at && trade.user_exit_price && trade.price_when_copied) {
            const correctRoi = ((trade.user_exit_price - trade.price_when_copied) / trade.price_when_copied) * 100;
            return { ...trade, roi: parseFloat(correctRoi.toFixed(2)) };
          }
          return trade;
        });
        
        // Auto-refresh status for open trades
        if (tradesWithCorrectRoi && tradesWithCorrectRoi.length > 0) {
          const tradesWithFreshStatus = await Promise.all(
            tradesWithCorrectRoi.map(async (trade) => {
              if (trade.user_closed_at) {
                return trade;
              }
              
              try {
                const statusRes = await fetch(`/api/copied-trades/${trade.id}/status?userId=${user.id}`);
                if (statusRes.ok) {
                  const statusData = await statusRes.json();
                  
                  return {
                    ...trade,
                    trader_still_has_position: statusData.traderStillHasPosition ?? trade.trader_still_has_position,
                    trader_closed_at: statusData.traderClosedAt ?? trade.trader_closed_at,
                    market_resolved: statusData.marketResolved ?? trade.market_resolved,
                    current_price: statusData.currentPrice ?? trade.current_price,
                    roi: statusData.roi ?? trade.roi,
                    resolved_outcome: statusData.resolvedOutcome ?? trade.resolved_outcome
                  };
                }
              } catch (e) {
                console.error('Failed to refresh status for trade:', trade.id, e);
              }
              return trade;
            })
          );
          
          setCopiedTrades(tradesWithFreshStatus);
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

  // Fetch notification preferences
  useEffect(() => {
    if (!user || hasLoadedNotificationPrefsRef.current) return;
    hasLoadedNotificationPrefsRef.current = true;
    
    const fetchNotificationPrefs = async () => {
      setLoadingNotificationPrefs(true);
      try {
        const { data, error } = await supabase
          .from('notification_preferences')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(); // Use maybeSingle() instead of single() to avoid error when no row exists
        
        if (error) {
          console.error('Error fetching notification preferences:', error);
        } else if (data) {
          setNotificationsEnabled(data.trader_closes_position || false);
        }
        // If no data and no error, user has no preferences yet - that's fine, use default
      } catch (err) {
        console.error('Error fetching notification preferences:', err);
      } finally {
        setLoadingNotificationPrefs(false);
      }
    };

    fetchNotificationPrefs();
  }, [user]);

  // Calculate stats
  const calculateStats = () => {
    const openTrades = copiedTrades.filter(t => !t.user_closed_at && !t.market_resolved);
    const closedTrades = copiedTrades.filter(t => t.user_closed_at || t.market_resolved);
    
    const totalPnl = closedTrades.reduce((sum, trade) => {
      if (trade.roi !== null && trade.amount_invested) {
        return sum + (trade.amount_invested * (trade.roi / 100));
      }
      return sum;
    }, 0);
    
    const totalVolume = copiedTrades.reduce((sum, trade) => {
      return sum + (trade.amount_invested || 0);
    }, 0);
    
    const avgRoi = closedTrades.length > 0
      ? closedTrades.reduce((sum, trade) => sum + (trade.roi || 0), 0) / closedTrades.length
      : 0;
    
    const winningTrades = closedTrades.filter(t => (t.roi || 0) > 0).length;
    const winRate = closedTrades.length > 0 ? (winningTrades / closedTrades.length) * 100 : 0;
    
    return {
      totalPnl,
      roi: avgRoi,
      totalVolume,
      winRate: Math.round(winRate),
    };
  };

  const userStats = calculateStats();

  // Filter trades
  const filteredTrades = copiedTrades.filter(trade => {
    if (tradeFilter === 'all') return true;
    if (tradeFilter === 'open') return !trade.user_closed_at && !trade.market_resolved;
    if (tradeFilter === 'closed') return Boolean(trade.user_closed_at);
    if (tradeFilter === 'resolved') return Boolean(trade.market_resolved);
    return true;
  });

  // Manual refresh status
  const handleManualRefresh = async () => {
    if (!user) return;
    
    setRefreshingStatus(true);
    
    try {
      const tradesWithFreshStatus = await Promise.all(
        copiedTrades.map(async (trade) => {
          if (trade.user_closed_at) {
            return trade;
          }
          
          try {
            const statusRes = await fetch(`/api/copied-trades/${trade.id}/status?userId=${user.id}`);
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              
              return {
                ...trade,
                trader_still_has_position: statusData.traderStillHasPosition ?? trade.trader_still_has_position,
                trader_closed_at: statusData.traderClosedAt ?? trade.trader_closed_at,
                market_resolved: statusData.marketResolved ?? trade.market_resolved,
                current_price: statusData.currentPrice ?? trade.current_price,
                roi: statusData.roi ?? trade.roi,
                resolved_outcome: statusData.resolvedOutcome ?? trade.resolved_outcome
              };
            }
          } catch (e) {
            console.error('Failed to refresh status for trade:', trade.id, e);
          }
          return trade;
        })
      );
      
      setCopiedTrades(tradesWithFreshStatus);
      setToastMessage('Positions refreshed!');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error('Error refreshing status:', err);
    } finally {
      setRefreshingStatus(false);
    }
  };

  // Wallet handlers
  const handleWalletConnect = async (address: string) => {
    // This would integrate with your Turnkey wallet connection
    console.log('Connecting wallet:', address);
    setIsConnectModalOpen(false);
  };

  const handleWalletDisconnect = async () => {
    if (!user || !profile?.trading_wallet_address) return;
    
    setDisconnectingWallet(true);
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ trading_wallet_address: null })
        .eq('id', user.id);
      
      if (error) throw error;
      
      setProfile({ ...profile, trading_wallet_address: null });
      setToastMessage('Wallet disconnected');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error('Error disconnecting wallet:', err);
    } finally {
      setDisconnectingWallet(false);
    }
  };

  // Edit trade handler
  const handleEditTrade = async (entryPrice: number, amountInvested: number | null) => {
    if (!user || !tradeToEdit) return;
    
    try {
      const { error } = await supabase
        .from('copied_trades')
        .update({
          price_when_copied: entryPrice,
          amount_invested: amountInvested,
        })
        .eq('id', tradeToEdit.id)
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      // Update local state
      setCopiedTrades(trades =>
        trades.map(t =>
          t.id === tradeToEdit.id
            ? { ...t, price_when_copied: entryPrice, amount_invested: amountInvested }
            : t
        )
      );
      
      setShowEditModal(false);
      setTradeToEdit(null);
      setToastMessage('Trade updated!');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error('Error updating trade:', err);
    }
  };

  // Close trade handler
  const handleCloseTrade = async (exitPrice: number) => {
    if (!user || !tradeToEdit) return;
    
    try {
      const roi = ((exitPrice - tradeToEdit.price_when_copied) / tradeToEdit.price_when_copied) * 100;
      
      const { error } = await supabase
        .from('copied_trades')
        .update({
          user_closed_at: new Date().toISOString(),
          user_exit_price: exitPrice,
          roi: parseFloat(roi.toFixed(2)),
        })
        .eq('id', tradeToEdit.id)
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      // Update local state
      setCopiedTrades(trades =>
        trades.map(t =>
          t.id === tradeToEdit.id
            ? {
                ...t,
                user_closed_at: new Date().toISOString(),
                user_exit_price: exitPrice,
                roi: parseFloat(roi.toFixed(2)),
              }
            : t
        )
      );
      
      setShowCloseModal(false);
      setTradeToEdit(null);
      setToastMessage('Position closed!');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error('Error closing trade:', err);
    }
  };

  // Unmark trade as closed
  const handleUnmarkClosed = async (trade: CopiedTrade) => {
    if (!user) return;
    
    if (!confirm('Are you sure you want to reopen this trade? This will clear your exit price and ROI.')) {
      return;
    }
    
    try {
      const { error } = await supabase
        .from('copied_trades')
        .update({
          user_closed_at: null,
          user_exit_price: null,
        })
        .eq('id', trade.id)
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      // Update local state
      setCopiedTrades(trades =>
        trades.map(t =>
          t.id === trade.id
            ? {
                ...t,
                user_closed_at: null,
                user_exit_price: null,
              }
            : t
        )
      );
      
      setToastMessage('Trade reopened!');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error('Error unmarking trade:', err);
    }
  };

  // Delete trade
  const handleDeleteTrade = async (trade: CopiedTrade) => {
    if (!user) return;
    
    if (!confirm('Are you sure you want to delete this copied trade? This action cannot be undone.')) {
      return;
    }
    
    try {
      const { error } = await supabase
        .from('copied_trades')
        .delete()
        .eq('id', trade.id)
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      // Remove from local state
      setCopiedTrades(trades => trades.filter(t => t.id !== trade.id));
      
      setToastMessage('Trade deleted!');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error('Error deleting trade:', err);
    }
  };

  // Notification toggle
  const handleToggleNotifications = async () => {
    if (!user) return;
    
    const newValue = !notificationsEnabled;
    setNotificationsEnabled(newValue);
    
    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: user.id,
          trader_closes_position: newValue,
          market_resolves: newValue,
        });
      
      if (error) throw error;
      
      setToastMessage(`Notifications ${newValue ? 'enabled' : 'disabled'}`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error('Error updating notification preferences:', err);
      setNotificationsEnabled(!newValue);
    }
  };

  // Loading state
  if (loading) {
    return (
      <>
        <Navigation user={user ? { id: user.id, email: user.email || '' } : null} isPremium={isPremium} />
        <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#FDB022] mx-auto mb-4"></div>
            <p className="text-slate-600 text-lg">Loading...</p>
          </div>
        </div>
      </>
    );
  }

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <>
      <Navigation user={user ? { id: user.id, email: user.email || '' } : null} isPremium={isPremium} />
      
      <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pt-4 md:pt-0 pb-20 md:pb-8">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 space-y-6 py-8">
          {/* Mobile-only Upgrade to Premium button */}
          {!isPremium && (
            <div className="lg:hidden">
              <Button
                onClick={() => setShowUpgradeModal(true)}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold shadow-md hover:shadow-lg transition-all"
              >
                <Crown className="mr-2 h-4 w-4" />
                Upgrade to Premium
              </Button>
            </div>
          )}

          {/* User Profile Card */}
          <Card className="bg-white border-slate-200 p-4 sm:p-8">
            <div className="flex flex-col lg:flex-row lg:items-start gap-6">
              {/* Left side - Profile info */}
              <div className="flex flex-col items-center lg:flex-row lg:items-start gap-4 flex-1">
                <Avatar className="h-20 w-20 bg-gradient-to-br from-yellow-400 to-orange-500">
                  <AvatarFallback className="text-2xl font-bold text-white bg-transparent">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 text-center lg:text-left">
                  <h2 className="text-2xl font-bold text-slate-900 mb-1">{user?.email || 'You'}</h2>
                  <div className="flex items-center gap-2 text-sm text-slate-600 justify-center lg:justify-start">
                    <span>Following {followingCount} traders</span>
                  </div>

                  {profile?.trading_wallet_address && (
                    <div className="flex items-center gap-2 flex-wrap mt-3 justify-center lg:justify-start">
                      <code className="text-sm font-mono text-slate-600 bg-slate-50 px-3 py-1 rounded-lg border border-slate-200">
                        {truncateAddress(profile.trading_wallet_address)}
                      </code>
                      <Button
                        onClick={() => navigator.clipboard.writeText(profile.trading_wallet_address)}
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-slate-500 hover:text-slate-900"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={handleWalletDisconnect}
                        disabled={disconnectingWallet}
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-red-500 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  {!profile?.trading_wallet_address && hasPremiumAccess && (
                    <Button
                      onClick={() => setIsConnectModalOpen(true)}
                      className="mt-3 bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-semibold"
                      size="sm"
                    >
                      <Wallet className="mr-2 h-4 w-4" />
                      Connect Wallet
                    </Button>
                  )}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4 md:gap-6 lg:min-w-[400px]">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp className="h-4 w-4 text-slate-500" />
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total P&L</p>
                  </div>
                  <p
                    className={cn(
                      "text-xl sm:text-2xl font-bold",
                      userStats.totalPnl >= 0 ? "text-emerald-600" : "text-red-600"
                    )}
                  >
                    {userStats.totalPnl >= 0 ? "+" : ""}
                    {formatCompactNumber(userStats.totalPnl)}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Percent className="h-4 w-4 text-slate-500" />
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">ROI</p>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-emerald-600">
                    {userStats.roi >= 0 ? '+' : ''}{userStats.roi.toFixed(1)}%
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <DollarSign className="h-4 w-4 text-slate-500" />
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Volume</p>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-slate-900">
                    {formatCompactNumber(userStats.totalVolume)}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp className="h-4 w-4 text-slate-500" />
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Win Rate</p>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-slate-900">{userStats.winRate}%</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-slate-200">
            <button
              onClick={() => setActiveTab('copied-trades')}
              className={cn(
                "px-4 py-2 font-medium text-sm transition-colors border-b-2",
                activeTab === 'copied-trades'
                  ? "border-[#FDB022] text-slate-900"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              )}
            >
              Copied Trades
            </button>
            <button
              onClick={() => setActiveTab('performance')}
              className={cn(
                "px-4 py-2 font-medium text-sm transition-colors border-b-2",
                activeTab === 'performance'
                  ? "border-[#FDB022] text-slate-900"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              )}
            >
              Performance
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={cn(
                "px-4 py-2 font-medium text-sm transition-colors border-b-2",
                activeTab === 'settings'
                  ? "border-[#FDB022] text-slate-900"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              )}
            >
              Settings
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'copied-trades' && (
            <div className="space-y-4">
              {/* Filter and Refresh */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2">
                  {(['all', 'open', 'closed', 'resolved'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setTradeFilter(filter)}
                      className={cn(
                        "px-4 py-2 rounded-lg font-medium text-sm transition-all",
                        tradeFilter === filter
                          ? "bg-slate-900 text-white"
                          : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      {filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </button>
                  ))}
                </div>
                <Button
                  onClick={handleManualRefresh}
                  disabled={refreshingStatus}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <RefreshCw className={cn("h-4 w-4", refreshingStatus && "animate-spin")} />
                  Refresh Status
                </Button>
              </div>

              {/* Trades List */}
              {loadingCopiedTrades ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="p-6 animate-pulse">
                      <div className="h-4 bg-slate-200 rounded w-3/4 mb-3"></div>
                      <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                    </Card>
                  ))}
                </div>
              ) : filteredTrades.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-slate-600">No copied trades yet.</p>
                  <Link href="/discover">
                    <Button className="mt-4 bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900">
                      Discover Traders
                    </Button>
                  </Link>
                </Card>
              ) : (
                <div className="space-y-3">
                  {filteredTrades.map((trade) => (
                    <Card key={trade.id} className="p-4 sm:p-6">
                      <div className="space-y-4">
                        {/* Trade Header */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <Link
                              href={`/trader/${trade.trader_wallet}`}
                              className="text-sm text-slate-600 hover:text-slate-900 font-medium"
                            >
                              {trade.trader_username || `${trade.trader_wallet.slice(0, 6)}...${trade.trader_wallet.slice(-4)}`}
                            </Link>
                            <h3 className="font-medium text-slate-900 mt-1">{trade.market_title}</h3>
                            <p className="text-xs text-slate-500 mt-1">{formatRelativeTime(trade.copied_at)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              className={cn(
                                "font-semibold",
                                trade.outcome === 'YES'
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-red-50 text-red-700 border-red-200"
                              )}
                            >
                              {trade.outcome}
                            </Badge>
                            <button
                              onClick={() => setExpandedTradeId(expandedTradeId === trade.id ? null : trade.id)}
                              className="text-slate-400 hover:text-slate-600"
                            >
                              {expandedTradeId === trade.id ? (
                                <ChevronUp className="h-5 w-5" />
                              ) : (
                                <ChevronDown className="h-5 w-5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 rounded-lg p-3">
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Entry</p>
                            <p className="font-semibold text-slate-900">${trade.price_when_copied.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Current</p>
                            <p className="font-semibold text-slate-900">
                              ${trade.current_price?.toFixed(2) || trade.price_when_copied.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Amount</p>
                            <p className="font-semibold text-slate-900">
                              ${trade.amount_invested?.toFixed(0) || '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 mb-1">ROI</p>
                            <p className={cn(
                              "font-semibold",
                              (trade.roi || 0) >= 0 ? "text-emerald-600" : "text-red-600"
                            )}>
                              {(trade.roi || 0) >= 0 ? '+' : ''}{(trade.roi || 0).toFixed(1)}%
                            </p>
                          </div>
                        </div>

                        {/* Status Badges */}
                        <div className="flex flex-wrap gap-2">
                          {trade.market_resolved && (
                            <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                              Market Resolved: {trade.resolved_outcome || 'Unknown'}
                            </Badge>
                          )}
                          {trade.user_closed_at && (
                            <Badge variant="secondary" className="bg-gray-50 text-gray-700 border-gray-200">
                              You Closed
                            </Badge>
                          )}
                          {!trade.trader_still_has_position && !trade.market_resolved && !trade.user_closed_at && (
                            <Badge variant="secondary" className="bg-orange-50 text-orange-700 border-orange-200">
                              Trader Exited
                            </Badge>
                          )}
                        </div>

                        {/* Expanded Actions */}
                        {expandedTradeId === trade.id && (
                          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200">
                            {/* Open trades: Edit, Close, Delete */}
                            {!trade.user_closed_at && !trade.market_resolved && (
                              <>
                                <Button
                                  onClick={() => {
                                    setTradeToEdit(trade);
                                    setShowEditModal(true);
                                  }}
                                  variant="outline"
                                  size="sm"
                                  className="gap-2"
                                >
                                  <Edit2 className="h-4 w-4" />
                                  Edit
                                </Button>
                                <Button
                                  onClick={() => {
                                    setTradeToEdit(trade);
                                    setShowCloseModal(true);
                                  }}
                                  variant="outline"
                                  size="sm"
                                  className="gap-2"
                                >
                                  <X className="h-4 w-4" />
                                  Close Position
                                </Button>
                              </>
                            )}
                            
                            {/* Closed trades: Edit, Unmark as Closed, Delete */}
                            {trade.user_closed_at && (
                              <>
                                <Button
                                  onClick={() => {
                                    setTradeToEdit(trade);
                                    setShowEditModal(true);
                                  }}
                                  variant="outline"
                                  size="sm"
                                  className="gap-2"
                                >
                                  <Edit2 className="h-4 w-4" />
                                  Edit
                                </Button>
                                <Button
                                  onClick={() => handleUnmarkClosed(trade)}
                                  variant="outline"
                                  size="sm"
                                  className="gap-2"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                  Unmark as Closed
                                </Button>
                              </>
                            )}
                            
                            {/* Delete button always available */}
                            <Button
                              onClick={() => handleDeleteTrade(trade)}
                              variant="outline"
                              size="sm"
                              className="gap-2 text-red-600 hover:text-red-700 hover:border-red-300"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'performance' && (
            <div className="space-y-6">
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Performance Over Time</h3>
                <div className="h-64 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-200">
                  <p className="text-slate-500">ROI Chart - Coming Soon</p>
                </div>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Monthly Performance</h3>
                  <div className="h-48 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-200">
                    <p className="text-slate-500">Monthly P&L Chart - Coming Soon</p>
                  </div>
                </Card>

                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Category Breakdown</h3>
                  <div className="h-48 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-200">
                    <p className="text-slate-500">Category Distribution - Coming Soon</p>
                  </div>
                </Card>
              </div>

              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Top Performing Trades</h3>
                <div className="space-y-3">
                  {copiedTrades
                    .filter(t => t.user_closed_at || t.market_resolved)
                    .sort((a, b) => (b.roi || 0) - (a.roi || 0))
                    .slice(0, 5)
                    .map((trade) => (
                      <div key={trade.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 truncate">{trade.market_title}</p>
                          <p className="text-sm text-slate-500">{formatRelativeTime(trade.copied_at)}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge
                            className={cn(
                              "font-semibold",
                              trade.outcome === 'YES'
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-red-50 text-red-700 border-red-200"
                            )}
                          >
                            {trade.outcome}
                          </Badge>
                          <p className={cn(
                            "font-bold text-lg",
                            (trade.roi || 0) >= 0 ? "text-emerald-600" : "text-red-600"
                          )}>
                            {(trade.roi || 0) >= 0 ? '+' : ''}{(trade.roi || 0).toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    ))}
                  {copiedTrades.filter(t => t.user_closed_at || t.market_resolved).length === 0 && (
                    <p className="text-center py-8 text-slate-500">
                      No closed trades yet. Close some positions to see your top performers!
                    </p>
                  )}
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'settings' && (
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Notifications</h3>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-3">
                    {notificationsEnabled ? (
                      <Bell className="h-5 w-5 text-slate-600" />
                    ) : (
                      <BellOff className="h-5 w-5 text-slate-400" />
                    )}
                    <div>
                      <p className="font-medium text-slate-900">Email Notifications</p>
                      <p className="text-sm text-slate-500">Get notified when traders close positions</p>
                    </div>
                  </div>
                  <Button
                    onClick={handleToggleNotifications}
                    disabled={loadingNotificationPrefs}
                    variant={notificationsEnabled ? "default" : "outline"}
                    size="sm"
                  >
                    {notificationsEnabled ? 'Enabled' : 'Disabled'}
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Premium</h3>
                {isPremium ? (
                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Crown className="h-5 w-5 text-yellow-600" />
                      <p className="font-semibold text-yellow-900">Premium Member</p>
                    </div>
                    <p className="text-sm text-yellow-700">
                      You have access to all premium features including Real Copy trading.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-sm text-slate-600 mb-3">
                      Upgrade to Premium to unlock Real Copy trading and advanced features.
                    </p>
                    <Button
                      onClick={() => setShowUpgradeModal(true)}
                      className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                    >
                      <Crown className="mr-2 h-4 w-4" />
                      Upgrade to Premium
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Modals */}
      <UpgradeModal open={showUpgradeModal} onOpenChange={setShowUpgradeModal} />
      <ConnectWalletModal
        open={isConnectModalOpen}
        onOpenChange={setIsConnectModalOpen}
        onConnect={handleWalletConnect}
      />
      <EditCopiedTrade
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setTradeToEdit(null);
        }}
        trade={tradeToEdit ? {
          id: tradeToEdit.id,
          market: tradeToEdit.market_title,
          position: tradeToEdit.outcome as "YES" | "NO",
          entryPrice: tradeToEdit.price_when_copied,
          amount: tradeToEdit.amount_invested || 0,
        } : null}
        onSave={handleEditTrade}
      />
      <MarkTradeClosed
        isOpen={showCloseModal}
        onClose={() => {
          setShowCloseModal(false);
          setTradeToEdit(null);
        }}
        trade={tradeToEdit ? {
          id: tradeToEdit.id,
          market: tradeToEdit.market_title,
          position: tradeToEdit.outcome as "YES" | "NO",
          entryPrice: tradeToEdit.price_when_copied,
          currentPrice: tradeToEdit.current_price || tradeToEdit.price_when_copied,
        } : null}
        onConfirm={handleCloseTrade}
      />

      {/* Toast */}
      {showToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg">
            {toastMessage}
          </div>
        </div>
      )}
    </>
  );
}
