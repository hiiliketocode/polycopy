'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, ensureProfile } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import Header from '../components/Header';
import ImportWalletModal from '@/components/ImportWalletModal';
import PrivyWrapper from '@/components/PrivyWrapper';

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
  
  // Premium and trading wallet state
  const [profile, setProfile] = useState<any>(null);
  const [showWalletSetup, setShowWalletSetup] = useState(false);
  const [disconnectingWallet, setDisconnectingWallet] = useState(false);
  
  // Display name state
  const [displayName, setDisplayName] = useState<string>('You');

  // Copied trades state
  const [copiedTrades, setCopiedTrades] = useState<CopiedTrade[]>([]);
  const [loadingCopiedTrades, setLoadingCopiedTrades] = useState(true);
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [tradeFilter, setTradeFilter] = useState<'all' | 'open' | 'closed' | 'resolved'>('all');
  const [hasAutoRefreshed, setHasAutoRefreshed] = useState(false); // Track if we've done initial auto-refresh
  
  // Edit trade modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [tradeToEdit, setTradeToEdit] = useState<CopiedTrade | null>(null);
  
  // Toast state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  
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

  // Fetch user stats and wallet (only once on mount)
  useEffect(() => {
    if (!user || hasLoadedStatsRef.current) return;
    hasLoadedStatsRef.current = true;

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

        // Fetch premium status and trading wallet from profile
        const { data: profileData, error: profileError} = await supabase
          .from('profiles')
          .select('is_premium, trading_wallet_address, premium_since')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
        } else {
          setProfile(profileData);
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
  // Only fetch once on mount to prevent re-fetching when switching tabs
  useEffect(() => {
    if (!user || hasLoadedTradesRef.current) return;
    hasLoadedTradesRef.current = true;
    
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
          setLoadingCopiedTrades(false);
          return;
        }
        
        console.log('📊 Loaded', trades?.length || 0, 'copied trades from database');
        
        // Recalculate ROI for user-closed trades (fixes old wrong ROIs saved before skip logic)
        const tradesWithCorrectRoi = trades.map(trade => {
          if (trade.user_closed_at && trade.user_exit_price && trade.price_when_copied) {
            const correctRoi = ((trade.user_exit_price - trade.price_when_copied) / trade.price_when_copied) * 100;
            
            // Only log and update if ROI is different
            if (Math.abs(correctRoi - (trade.roi || 0)) > 0.1) {
              console.log(`🔧 Recalculated ROI for user-closed trade: ${trade.market_title?.substring(0, 30)}`, {
                entry: trade.price_when_copied,
                exit: trade.user_exit_price,
                oldRoi: trade.roi,
                newRoi: parseFloat(correctRoi.toFixed(2))
              });
            }
            
            return { ...trade, roi: parseFloat(correctRoi.toFixed(2)) };
          }
          return trade;
        });
        
        // Auto-refresh status for ALL trades (database status may be stale)
        // The status API will determine if market is resolved or trader exited
        console.log('🔄 Auto-refreshing status for', tradesWithCorrectRoi?.length || 0, 'trades...');
        
        if (tradesWithCorrectRoi && tradesWithCorrectRoi.length > 0) {
          // Refresh status for ALL trades in parallel
          const tradesWithFreshStatus = await Promise.all(
            tradesWithCorrectRoi.map(async (trade) => {
              // Skip user-closed trades - their status and ROI are locked
              if (trade.user_closed_at) {
                console.log(`⏭️ Skipping status refresh for user-closed trade: ${trade.market_title?.substring(0, 30)} (locked at user_exit_price: ${trade.user_exit_price})`);
                return trade; // Return unchanged
              }
              
              try {
                // Call status API to get fresh status
                const statusRes = await fetch(`/api/copied-trades/${trade.id}/status?userId=${user.id}`);
                if (statusRes.ok) {
                  const statusData = await statusRes.json();
                  
                  // Log the status change
                  console.log(`📊 Trade ${trade.id} status refreshed:`, {
                    market: trade.market_title?.substring(0, 40),
                    oldStatus: {
                      traderHasPosition: trade.trader_still_has_position,
                      marketResolved: trade.market_resolved
                    },
                    newStatus: {
                      traderHasPosition: statusData.traderStillHasPosition,
                      marketResolved: statusData.marketResolved
                    },
                    currentPrice: statusData.currentPrice,
                    roi: statusData.roi
                  });
                  
                  // Merge fresh status data with database trade
                  return {
                    ...trade,
                    trader_still_has_position: statusData.traderStillHasPosition ?? trade.trader_still_has_position,
                    trader_closed_at: statusData.traderClosedAt ?? trade.trader_closed_at,
                    market_resolved: statusData.marketResolved ?? trade.market_resolved,
                    current_price: statusData.currentPrice ?? trade.current_price,
                    roi: statusData.roi ?? trade.roi,
                    resolved_outcome: statusData.resolvedOutcome ?? trade.resolved_outcome
                  };
                } else {
                  console.warn(`⚠️ Failed to refresh status for trade ${trade.id}:`, statusRes.status);
                }
              } catch (e) {
                console.error('❌ Failed to refresh status for trade:', trade.id, e);
              }
              return trade;
            })
          );
          
          console.log('✅ Status refresh complete for all trades');
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

  // Fetch notification preferences when user is available (only once on mount)
  useEffect(() => {
    if (!user || hasLoadedNotificationPrefsRef.current) return;
    hasLoadedNotificationPrefsRef.current = true;
    
    const fetchNotificationPrefs = async () => {
      try {
        const response = await fetch(`/api/notification-preferences?userId=${user.id}`, { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          setNotificationsEnabled(data.email_notifications_enabled ?? true);
        } else {
          console.warn('⚠️ Could not fetch notification preferences:', response.status);
          // Default to enabled if API fails
          setNotificationsEnabled(true);
        }
      } catch (err) {
        console.error('Error fetching notification preferences:', err);
        // Default to enabled if API fails
        setNotificationsEnabled(true);
      }
    };

    fetchNotificationPrefs();
  }, [user]);

  // Helper function to fetch current price from Polymarket via our proxy API (avoids CORS)
  const fetchCurrentPriceFromPolymarket = async (trade: CopiedTrade): Promise<{ currentPrice: number | null; roi: number | null }> => {
    try {
      console.log(`[Price] Fetching price for: "${trade.market_title?.substring(0, 40)}..."`);
      
      // Build query params for our proxy API
      const params = new URLSearchParams();
      if (trade.market_id) {
        if (trade.market_id.startsWith('0x')) {
          params.set('conditionId', trade.market_id);
        } else {
          params.set('slug', trade.market_id);
        }
      }
      if (trade.market_title) {
        params.set('title', trade.market_title);
      }
      
      // Call our proxy API (server-side, no CORS issues)
      const response = await fetch(`/api/polymarket/price?${params.toString()}`);
      const data = await response.json();
      
      if (!data.success || !data.market) {
        console.log(`[Price] Market not found for: "${trade.market_title?.substring(0, 30)}..."`);
        return { currentPrice: null, roi: null };
      }
      
      const market = data.market;
      console.log(`[Price] Found market: "${market.question?.substring(0, 40)}..."`);
      console.log(`[Price] Outcomes: ${JSON.stringify(market.outcomes)}, Prices: ${JSON.stringify(market.outcomePrices)}`);
      
      const prices = market.outcomePrices;
      const outcomes = market.outcomes;
      
      if (!prices || !Array.isArray(prices) || prices.length < 2) {
        console.log(`[Price] Invalid prices array`);
        return { currentPrice: null, roi: null };
      }
      
      const outcomeUpper = trade.outcome?.toUpperCase();
      let currentPrice: number | null = null;
      
      // Standard YES/NO markets
      if (outcomeUpper === 'YES') {
        currentPrice = parseFloat(prices[0]);
        console.log(`[Price] YES → ${currentPrice}`);
      } else if (outcomeUpper === 'NO') {
        currentPrice = parseFloat(prices[1]);
        console.log(`[Price] NO → ${currentPrice}`);
      } else if (outcomes && Array.isArray(outcomes)) {
        // Custom outcomes - find by name (case-insensitive)
        const outcomeIndex = outcomes.findIndex(
          (o: string) => o?.toUpperCase() === outcomeUpper
        );
        console.log(`[Price] Custom outcome "${outcomeUpper}" → index ${outcomeIndex}`);
        if (outcomeIndex >= 0 && outcomeIndex < prices.length) {
          currentPrice = parseFloat(prices[outcomeIndex]);
        }
      }
      
      // Calculate ROI
      let roi: number | null = null;
      if (trade.price_when_copied) {
        const entryPrice = trade.price_when_copied;
        
        // Use user's exit price if they manually closed the trade
        // Otherwise use current market price
        const exitPrice = trade.user_exit_price ?? currentPrice;
        
        if (entryPrice > 0 && exitPrice !== null) {
          roi = ((exitPrice - entryPrice) / entryPrice) * 100;
          roi = parseFloat(roi.toFixed(2));
        }
        
        // Debug logging for user-closed trades
        if (trade.user_closed_at) {
          console.log('💰 User-Closed Trade ROI:', {
            market: trade.market_title?.substring(0, 30),
            entryPrice,
            userExitPrice: trade.user_exit_price,
            currentPrice,
            exitPriceUsed: exitPrice,
            calculation: `((${exitPrice} - ${entryPrice}) / ${entryPrice}) * 100`,
            roi
          });
        }
      }
      
      console.log(`[Price] ✓ Final: price=${currentPrice}, exitPrice=${trade.user_exit_price ?? currentPrice}, roi=${roi}%`);
      return { currentPrice, roi };
      
    } catch (err) {
      console.error('[Price] Error fetching price:', err);
      return { currentPrice: null, roi: null };
    }
  };

  // Auto-refresh trade status once when trades are first loaded (to get current prices)
  useEffect(() => {
    // Only auto-refresh once: when trades finish loading and we have some
    if (hasAutoRefreshed || loadingCopiedTrades || copiedTrades.length === 0 || !user) {
      return;
    }
    
    console.log('🔄 Auto-refreshing prices for', copiedTrades.length, 'trades...');
    setHasAutoRefreshed(true); // Mark as done FIRST to prevent re-triggering
    
    // Auto-refresh prices via our proxy API (avoids CORS)
    const autoRefreshPrices = async () => {
      setRefreshingStatus(true);
      const updatedTrades: CopiedTrade[] = [];
      let successCount = 0;
      
      // Use the trades from this render cycle
      const tradesToRefresh = [...copiedTrades];
      
      for (const trade of tradesToRefresh) {
        // Skip price refresh for user-closed trades - their ROI is locked
        if (trade.user_closed_at) {
          console.log(`⏭️ Skipping user-closed trade: ${trade.market_title?.substring(0, 30)} (user_exit_price: ${trade.user_exit_price})`);
          updatedTrades.push(trade);
          continue;
        }
        
        const { currentPrice, roi } = await fetchCurrentPriceFromPolymarket(trade);
        if (currentPrice !== null) {
          successCount++;
        }
        updatedTrades.push({
          ...trade,
          current_price: currentPrice ?? trade.current_price,
          roi: roi ?? trade.roi,
        });
      }
      
      setCopiedTrades(updatedTrades);
      setRefreshingStatus(false);
      console.log(`✅ Auto-refresh complete: ${successCount}/${tradesToRefresh.length} prices found`);
    };
    
    autoRefreshPrices();
  }, [hasAutoRefreshed, loadingCopiedTrades, copiedTrades, user]);


  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
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
        
        // Skip price refresh for user-closed trades - their ROI is locked
        if (trade.user_closed_at) {
          console.log(`⏭️ Skipping user-closed trade: ${trade.market_title?.substring(0, 30)} (user_exit_price: ${trade.user_exit_price})`);
          updatedTrades.push(trade);
          continue;
        }
        
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
    if (trade.user_closed_at) {
      return { label: 'You Closed', color: 'text-purple-600', bg: 'bg-purple-50' };
    }
    if (!trade.trader_still_has_position) {
      return { label: 'Trader Closed', color: 'text-red-600', bg: 'bg-red-50' };
    }
    return { label: 'Open', color: 'text-green-600', bg: 'bg-green-50' };
  };
  
  // Status tooltip state
  const [showStatusTooltip, setShowStatusTooltip] = useState(false);
  
  // Delete trade state
  const [deletingTradeId, setDeletingTradeId] = useState<string | null>(null);
  
  // Mark as Closed state
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [tradeToClose, setTradeToClose] = useState<CopiedTrade | null>(null);
  const [exitPriceCents, setExitPriceCents] = useState('');
  
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

  // Handle edit trade
  const handleEditTrade = async (updatedEntryPrice: number, updatedAmountInvested?: number) => {
    if (!tradeToEdit || !user) return;

    try {
      // Update in Supabase
      const { error } = await supabase
        .from('copied_trades')
        .update({
          price_when_copied: updatedEntryPrice,
          amount_invested: updatedAmountInvested || null,
        })
        .eq('id', tradeToEdit.id)
        .eq('user_id', user.id);  // Security: only update if it's their trade

      if (error) {
        throw new Error(error.message || 'Failed to update trade');
      }

      // Recalculate ROI if there's a current price
      let newRoi = tradeToEdit.roi;
      if (tradeToEdit.user_closed_at && tradeToEdit.user_exit_price) {
        // User-closed trade: recalculate ROI with new entry price
        newRoi = ((tradeToEdit.user_exit_price - updatedEntryPrice) / updatedEntryPrice) * 100;
      } else if (tradeToEdit.current_price !== null && tradeToEdit.current_price !== undefined) {
        // Open trade: recalculate ROI with new entry price
        newRoi = ((tradeToEdit.current_price - updatedEntryPrice) / updatedEntryPrice) * 100;
      }

      // Update local state
      setCopiedTrades(prev => 
        prev.map(t => 
          t.id === tradeToEdit.id 
            ? { ...t, price_when_copied: updatedEntryPrice, amount_invested: updatedAmountInvested || null, roi: newRoi }
            : t
        )
      );

      // Show success toast
      showToastMessage('Trade updated successfully', 'success');
      
      // Close modal
      setShowEditModal(false);
      setTradeToEdit(null);
      
    } catch (err: any) {
      console.error('Error updating trade:', err);
      showToastMessage(err.message || 'Failed to update trade', 'error');
    }
  };

  // Mark trade as closed handler
  const handleMarkAsClosed = async () => {
    if (!tradeToClose || !exitPriceCents || !user) return;
    
    const exitPrice = parseFloat(exitPriceCents) / 100; // Convert cents to decimal
    const entryPrice = tradeToClose.price_when_copied;
    const finalRoi = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : null;
    
    // Debug logging
    console.log('💰 Mark as Closed - ROI Calculation:', {
      exitPriceCents,
      exitPriceDecimal: exitPrice,
      entryPrice,
      calculation: `((${exitPrice} - ${entryPrice}) / ${entryPrice}) * 100`,
      finalRoi,
      finalRoiRounded: finalRoi ? parseFloat(finalRoi.toFixed(2)) : null
    });
    
    try {
      const { error } = await supabase
        .from('copied_trades')
        .update({
          user_closed_at: new Date().toISOString(),
          user_exit_price: exitPrice,
          current_price: exitPrice,
          roi: finalRoi ? parseFloat(finalRoi.toFixed(2)) : null,
        })
        .eq('id', tradeToClose.id)
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      // Update local state
      setCopiedTrades(trades => trades.map(t => 
        t.id === tradeToClose.id 
          ? { 
              ...t, 
              user_closed_at: new Date().toISOString(), 
              user_exit_price: exitPrice, 
              current_price: exitPrice, 
              roi: finalRoi 
            }
          : t
      ));
      
      setShowCloseModal(false);
      setTradeToClose(null);
      setExitPriceCents('');
      showToastMessage('Trade marked as closed', 'success');
    } catch (err: any) {
      console.error('Error marking trade as closed:', err);
      showToastMessage('Failed to update trade', 'error');
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
        return trade.trader_still_has_position && !trade.market_resolved && !trade.user_closed_at;
      case 'closed':
        return (!trade.trader_still_has_position || trade.user_closed_at) && !trade.market_resolved;
      case 'resolved':
        return trade.market_resolved;
      default:
        return true;
    }
  });


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
    <PrivyWrapper>
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
                <h1 className="text-xl font-bold text-slate-900 mb-2">{displayName}</h1>
                
                {/* Stats Section Header */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Performance</span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">Lifetime</span>
                </div>
                
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
                        (() => {
                          const tradesWithData = copiedTrades.filter(t => 
                            t.roi !== null && t.roi !== undefined && t.amount_invested
                          );
                          if (tradesWithData.length === 0) return 'text-slate-400';
                          
                          // Calculate total P&L and total investment (same as trader profile ROI)
                          const totalInvestment = tradesWithData.reduce((sum, t) => sum + (t.amount_invested || 0), 0);
                          
                          if (totalInvestment === 0) return 'text-slate-400';
                          
                          // Calculate total P&L: for each trade, P&L = (ROI / 100) × investment
                          const totalPnL = tradesWithData.reduce((sum, t) => {
                            const pnl = ((t.roi || 0) / 100) * (t.amount_invested || 0);
                            return sum + pnl;
                          }, 0);
                          
                          // ROI = (Total P&L / Total Investment) × 100
                          const roi = (totalPnL / totalInvestment) * 100;
                          
                          return roi >= 0 ? 'text-emerald-600' : 'text-red-600';
                        })()
                      }`}>
                        {copiedTrades.length === 0 ? '--' : 
                          (() => {
                            const tradesWithData = copiedTrades.filter(t => 
                              t.roi !== null && t.roi !== undefined && t.amount_invested
                            );
                            if (tradesWithData.length === 0) return '--';
                            
                            // Calculate total P&L and total investment (same as trader profile ROI)
                            const totalInvestment = tradesWithData.reduce((sum, t) => sum + (t.amount_invested || 0), 0);
                            
                            if (totalInvestment === 0) return '--';
                            
                            // Calculate total P&L: for each trade, P&L = (ROI / 100) × investment
                            const totalPnL = tradesWithData.reduce((sum, t) => {
                              const pnl = ((t.roi || 0) / 100) * (t.amount_invested || 0);
                              return sum + pnl;
                            }, 0);
                            
                            // ROI = (Total P&L / Total Investment) × 100
                            const roi = (totalPnL / totalInvestment) * 100;
                            
                            return `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`;
                          })()
                        }
                      </span>
                      <span className="text-slate-500 ml-1">ROI</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Polymarket Wallet Section - Only show for premium users */}
        {profile?.is_premium && (
          <div className="mb-6">
            <h2 className="text-label text-slate-400 mb-4">POLYMARKET WALLET</h2>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-start gap-4">
                {/* Wallet Icon */}
                <div className="w-12 h-12 rounded-full bg-[#FDB022]/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-[#FDB022]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-slate-900 mb-1">
                    Polymarket Wallet
                  </h3>
                  <p className="text-sm text-slate-600 mb-4">
                    {profile?.trading_wallet_address 
                      ? 'Your wallet is connected and ready to copy trades'
                      : 'Import your Polymarket wallet to automatically copy trades'
                    }
                  </p>

                  {profile?.trading_wallet_address ? (
                    <>
                      {/* Connected Wallet Display */}
                      <div className="bg-slate-50 rounded-lg p-4 mb-4">
                        <div className="flex items-center gap-2 mb-1">
                          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-sm font-medium text-slate-700">Wallet Connected</span>
                        </div>
                        <p className="font-mono text-sm text-slate-900 break-all">
                          {profile.trading_wallet_address}
                        </p>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          onClick={() => setShowWalletSetup(true)}
                          className="px-4 py-2 border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 transition-colors text-sm"
                        >
                          Re-import Wallet
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm('Are you sure you want to disconnect your wallet? You will need to import it again to copy trades.')) {
                              return;
                            }
                            
                            setDisconnectingWallet(true);
                            try {
                              const { data: { session } } = await supabase.auth.getSession();
                              
                              if (!session?.access_token) {
                                throw new Error('Not authenticated');
                              }

                              const response = await fetch('/api/wallet/disconnect', {
                                method: 'POST',
                                headers: {
                                  'Authorization': `Bearer ${session.access_token}`
                                }
                              });

                              const data = await response.json();

                              if (!response.ok) {
                                throw new Error(data.error || 'Failed to disconnect wallet');
                              }

                              showToastMessage('Wallet disconnected successfully', 'success');
                              window.location.reload();
                            } catch (error: any) {
                              console.error('Disconnect error:', error);
                              showToastMessage(error.message || 'Failed to disconnect wallet', 'error');
                            } finally {
                              setDisconnectingWallet(false);
                            }
                          }}
                          disabled={disconnectingWallet}
                          className="px-4 py-2 border border-red-300 rounded-lg font-medium text-red-700 hover:bg-red-50 transition-colors text-sm disabled:opacity-50"
                        >
                          {disconnectingWallet ? 'Disconnecting...' : 'Disconnect Wallet'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Not Connected - Import Button */}
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                        <p className="text-sm text-blue-800">
                          💡 <strong>How it works:</strong> Import your Polymarket wallet private key. 
                          We'll securely encrypt and store it to execute trades on your behalf when you copy a trader.
                        </p>
                      </div>
                      
                      <button
                        onClick={() => setShowWalletSetup(true)}
                        className="px-6 py-3 bg-[#FDB022] hover:bg-[#E69E1A] text-black rounded-lg font-semibold transition-colors text-sm"
                      >
                        Import Wallet
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

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
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Outcome</th>
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
                            {/* OUTCOME */}
                            <td className="px-4 py-3">
                              <span className={`text-sm font-semibold ${
                                trade.outcome?.toUpperCase() === 'YES' ? 'text-green-600' :
                                trade.outcome?.toUpperCase() === 'NO' ? 'text-red-600' :
                                'text-slate-700'
                              }`}>
                                {trade.outcome || '--'}
                              </span>
                            </td>
                            {/* TRADER */}
                            <td className="px-4 py-3">
                            <Link
                              href={`/trader/${trade.trader_wallet}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-sm text-[#FDB022] hover:underline"
                            >
                              {trade.trader_username 
                                ? (trade.trader_username.length > 15 
                                    ? `${trade.trader_username.slice(0, 6)}...${trade.trader_username.slice(-4)}` 
                                    : trade.trader_username)
                                : `${trade.trader_wallet.slice(0, 6)}...${trade.trader_wallet.slice(-4)}`
                              }
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
                              <td colSpan={6} className="px-4 pb-4 bg-slate-50 border-t border-slate-100">
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
                                      <p className="text-xs text-slate-500 mb-1">
                                        {trade.user_closed_at ? "Closed Price" : "Current Price"}
                                      </p>
                                      <p className="text-sm font-semibold text-slate-900">
                                        {trade.user_closed_at 
                                          ? (trade.user_exit_price !== null && trade.user_exit_price !== undefined
                                              ? `${Math.round(trade.user_exit_price * 100)}¢`
                                              : '--')
                                          : (trade.current_price !== null && trade.current_price !== undefined
                                              ? `${Math.round(trade.current_price * 100)}¢`
                                              : '--')
                                        }
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
                                      href={
                                        trade.market_slug 
                                          ? `https://polymarket.com/event/${trade.market_slug}`
                                          : `https://polymarket.com/search?q=${encodeURIComponent(trade.market_title)}`
                                      }
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-[#FDB022] hover:underline font-medium"
                                    >
                                      View on Polymarket ↗
                                    </a>
                                    <div className="flex items-center gap-3">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setTradeToEdit(trade);
                                          setShowEditModal(true);
                                        }}
                                        className="text-xs text-slate-600 hover:text-slate-900 font-medium"
                                      >
                                        Edit
                                      </button>
                                      {!trade.market_resolved && !trade.user_closed_at && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setTradeToClose(trade);
                                            setShowCloseModal(true);
                                          }}
                                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                        >
                                          Mark as Closed
                                        </button>
                                      )}
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
                            trade.outcome?.toUpperCase() === 'YES' ? 'text-green-600' :
                            trade.outcome?.toUpperCase() === 'NO' ? 'text-red-600' :
                            'text-slate-700'
                          }`}>
                            {trade.outcome || '--'}
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
                                <p className="text-xs text-slate-500">
                                  {trade.user_closed_at ? "Closed Price" : "Current Price"}
                                </p>
                                <p className="text-sm font-semibold text-slate-900">
                                  {trade.user_closed_at 
                                    ? (trade.user_exit_price !== null && trade.user_exit_price !== undefined
                                        ? `${Math.round(trade.user_exit_price * 100)}¢`
                                        : '--')
                                    : (trade.current_price !== null && trade.current_price !== undefined
                                        ? `${Math.round(trade.current_price * 100)}¢`
                                        : '--')
                                  }
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
                                href={
                                  trade.market_slug 
                                    ? `https://polymarket.com/event/${trade.market_slug}`
                                    : `https://polymarket.com/search?q=${encodeURIComponent(trade.market_title)}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-[#FDB022] hover:underline font-medium"
                              >
                                View on Polymarket ↗
                              </a>
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTradeToEdit(trade);
                                    setShowEditModal(true);
                                  }}
                                  className="text-xs text-slate-600 hover:text-slate-900 font-medium"
                                >
                                  Edit
                                </button>
                                {!trade.market_resolved && !trade.user_closed_at && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setTradeToClose(trade);
                                      setShowCloseModal(true);
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                  >
                                    Mark as Closed
                                  </button>
                                )}
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

          {/* Polymarket Wallet - Only show for premium users */}
          {profile?.is_premium && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-4">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  {/* Wallet icon */}
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </div>
                  
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">Import Polymarket Wallet</p>
                    <p className="text-small text-slate-500">
                      {profile?.trading_wallet_address 
                        ? `Connected: ${profile.trading_wallet_address.slice(0, 6)}...${profile.trading_wallet_address.slice(-4)}`
                        : 'Connect your wallet to copy trades automatically'
                      }
                    </p>
                  </div>
                </div>

                {/* Import/Re-import Button */}
                <button
                  onClick={() => setShowWalletSetup(true)}
                  className="px-4 py-2 bg-[#FDB022] hover:bg-[#E69E1A] text-black rounded-lg font-medium transition-colors text-sm whitespace-nowrap"
                >
                  {profile?.trading_wallet_address ? 'Re-import' : 'Import Wallet'}
                </button>
              </div>
            </div>
          )}
          
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

      {/* Mark as Closed Modal */}
      {showCloseModal && tradeToClose && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Mark Trade as Closed</h3>
            <p className="text-sm text-slate-600 mb-4">
              Enter the price you sold at to calculate your final ROI.
            </p>
            
            <div className="mb-4">
              <p className="text-sm text-slate-500 mb-1">Market: {tradeToClose.market_title}</p>
              <p className="text-sm text-slate-500 mb-3">Entry Price: {Math.round(tradeToClose.price_when_copied * 100)}¢</p>
              
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Exit Price (in cents)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={exitPriceCents}
                  onChange={(e) => setExitPriceCents(e.target.value)}
                  placeholder="e.g. 65"
                  className="flex-1 px-4 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FDB022] focus:border-[#FDB022]"
                />
                <span className="text-slate-500">¢</span>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCloseModal(false);
                  setTradeToClose(null);
                  setExitPriceCents('');
                }}
                className="flex-1 bg-slate-100 text-slate-700 py-2 px-4 rounded-lg font-semibold hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkAsClosed}
                disabled={!exitPriceCents}
                className="flex-1 bg-[#FDB022] text-black py-2 px-4 rounded-lg font-semibold hover:bg-[#E69E1A] disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Trade Modal */}
      {showEditModal && tradeToEdit && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Edit Copied Trade</h3>
            <p className="text-sm text-slate-600 mb-4">
              Update your entry price and investment amount.
            </p>
            
            <div className="mb-4">
              <p className="text-sm text-slate-500 mb-1">Market: {tradeToEdit.market_title}</p>
              <p className="text-sm text-slate-500 mb-3">Outcome: {tradeToEdit.outcome}</p>
              
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Entry Price <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-slate-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="0.99"
                  defaultValue={tradeToEdit.price_when_copied}
                  id="edit-entry-price"
                  placeholder="0.58"
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FDB022] focus:border-transparent"
                />
              </div>
              
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Amount Invested (optional)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={tradeToEdit.amount_invested || ''}
                  id="edit-amount-invested"
                  placeholder="0.00"
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FDB022] focus:border-transparent"
                />
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setTradeToEdit(null);
                }}
                className="flex-1 bg-slate-100 text-slate-700 py-2.5 px-4 rounded-lg font-semibold hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const entryPriceInput = document.getElementById('edit-entry-price') as HTMLInputElement;
                  const amountInput = document.getElementById('edit-amount-invested') as HTMLInputElement;
                  
                  const entryPrice = parseFloat(entryPriceInput.value);
                  const amount = amountInput.value ? parseFloat(amountInput.value) : undefined;
                  
                  if (!entryPrice || entryPrice <= 0 || entryPrice >= 1) {
                    alert('Please enter a valid entry price between $0.01 and $0.99');
                    return;
                  }
                  
                  handleEditTrade(entryPrice, amount);
                }}
                className="flex-1 bg-[#FDB022] text-white py-2.5 px-4 rounded-lg font-semibold hover:bg-[#E69E1A] transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

        {/* Import Wallet Modal */}
        <ImportWalletModal
          isOpen={showWalletSetup}
          onClose={() => setShowWalletSetup(false)}
          onSuccess={(address, walletId) => {
            // Wallet is already saved by the API endpoint
            // Privy stores the private key securely on their infrastructure
            // We only store: walletId (reference) and address (public info)
            console.log('Wallet imported successfully:', { address, walletId });
            setShowWalletSetup(false);
            showToastMessage('Wallet imported successfully!', 'success');
            // Refresh profile data to show new wallet
            window.location.reload();
          }}
        />
      </div>
    </PrivyWrapper>
  );
}
