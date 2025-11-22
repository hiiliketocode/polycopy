'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface TraderCardProps {
  wallet: string;
  displayName: string;
  pnl: number;
  volume: number;
  followerCount?: number; // Number of followers on Polycopy
  isFollowing?: boolean; // Pre-computed follow status
  skipFollowCheck?: boolean; // Skip the DB check if we already know
  onFollowChange?: (isFollowing: boolean) => void; // Callback with new follow status
  compact?: boolean; // Compact mode for Featured Traders
  user?: any; // User object to check if logged in
}

export default function TraderCard({
  wallet,
  displayName,
  pnl,
  volume,
  followerCount = 0,
  isFollowing: initialIsFollowing,
  skipFollowCheck = false,
  onFollowChange,
  compact = false,
  user = null,
}: TraderCardProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [following, setFollowing] = useState(initialIsFollowing || false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingFollow, setCheckingFollow] = useState(!skipFollowCheck);

  // Check if user follows this trader on mount (only if not skipped)
  useEffect(() => {
    if (skipFollowCheck) {
      // Use the provided isFollowing value
      setFollowing(initialIsFollowing || false);
      setCheckingFollow(false);
      return;
    }

    const checkFollowStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setFollowing(false);
          setCheckingFollow(false);
          return;
        }

        // Check if follow relationship exists
        const { data, error } = await supabase
          .from('follows')
          .select('*')
          .eq('user_id', user.id)
          .eq('trader_wallet', wallet)
          .single();

        if (error && error.code !== 'PGRST116') {
          // PGRST116 is "no rows returned" - not an error
          console.error('Error checking follow status:', error);
        }

        setFollowing(!!data);
      } catch (err) {
        console.error('Error checking follow status:', err);
      } finally {
        setCheckingFollow(false);
      }
    };

    checkFollowStatus();
  }, [wallet, skipFollowCheck, initialIsFollowing]);

  // Generate consistent color from wallet address
  const getAvatarColor = (address: string) => {
    let hash = 0;
    for (let i = 0; i < address.length; i++) {
      hash = address.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 65%, 50%)`;
  };

  // Abbreviate wallet address
  const abbreviateWallet = (address: string) => {
    if (address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Truncate display name intelligently
  const truncateName = (name: string, maxLength: number = 20): string => {
    // If it's a wallet address (starts with 0x and is long)
    if (name.startsWith('0x') && name.length > 20) {
      return `${name.slice(0, 6)}...${name.slice(-4)}`;
    }
    
    // If it's a regular name that's too long
    if (name.length > maxLength) {
      return `${name.slice(0, maxLength)}...`;
    }
    
    return name;
  };

  // Format P&L with sign and currency
  const formatPnL = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    
    // Compact mode for preventing overflow on mobile
    if (compact && Math.abs(value) >= 1000) {
      return `${sign}$${(value / 1000).toFixed(1)}k`;
    }
    
    return `${sign}$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // Calculate ROI
  const roi = volume > 0 ? ((pnl / volume) * 100) : 0;
  const roiFormatted = roi.toFixed(1);

  // Format volume with M/K abbreviations
  const formatVolume = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    } else {
      return `$${value.toFixed(0)}`;
    }
  };

  // Copy wallet to clipboard
  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent link navigation
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(wallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Toggle follow status
  const handleFollowToggle = async (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent link navigation
    e.stopPropagation();
    setError('');
    
    // If not logged in, redirect to login
    if (!user) {
      router.push('/login');
      return;
    }
    
    setLoading(true);

    try {
      // User is logged in, proceed with follow/unfollow

      if (following) {
        // Unfollow: DELETE from follows table
        const { error: deleteError } = await supabase
          .from('follows')
          .delete()
          .eq('user_id', user.id)
          .eq('trader_wallet', wallet);

        if (deleteError) {
          throw deleteError;
        }

        setFollowing(false);
        
        // Notify parent component with new follow status
        if (onFollowChange) {
          onFollowChange(false); // Now unfollowing
        }
      } else {
        // Follow: INSERT into follows table
        const { error: insertError } = await supabase
          .from('follows')
          .insert({
            user_id: user.id,
            trader_wallet: wallet,
          });

        if (insertError) {
          throw insertError;
        }

        setFollowing(true);
        
        // Notify parent component with new follow status
        if (onFollowChange) {
          onFollowChange(true); // Now following
        }
      }
    } catch (err: any) {
      console.error('Error toggling follow:', err);
      setError(err.message || 'Failed to update follow status');
      // Show error for 3 seconds
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const avatarColor = getAvatarColor(wallet);
  const initials = wallet.slice(2, 4).toUpperCase();

  // Store trader data in sessionStorage before navigation for instant profile load
  const handleCardClick = () => {
    const traderData = {
      wallet,
      displayName,
      pnl,
      volume,
      roi,
      roiFormatted,
      followerCount,
    };
    sessionStorage.setItem(`trader-${wallet}`, JSON.stringify(traderData));
  };

  return (
    <Link 
      href={`/trader/${wallet}`}
      onClick={handleCardClick}
      className={`block ${compact ? 'p-3 md:p-4' : 'p-6'} group`}
    >
      {compact ? (
        // Compact mode - original layout for Featured Traders
        <>
          {/* Top Section: Avatar and Name */}
          <div className="flex items-start mb-3 gap-2 md:gap-4">
            {/* Avatar */}
            <div
              className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center text-white font-bold text-base md:text-lg flex-shrink-0"
              style={{ backgroundColor: avatarColor }}
            >
              {initials}
            </div>

            {/* Name and Wallet */}
            <div className="flex-1 min-w-0">
              <h3 
                className="text-base md:text-xl font-bold text-slate-900 mb-1 truncate group-hover:text-slate-700 transition-colors"
                title={displayName}
              >
                {truncateName(displayName)}
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs md:text-sm text-slate-500 font-mono">
                  {abbreviateWallet(wallet)}
                </span>
                <button
                  onClick={handleCopy}
                  className="text-slate-400 hover:text-slate-900 transition-colors"
                  title="Copy wallet address"
                >
                  {copied ? '✓' : '📋'}
                </button>
              </div>
            </div>
          </div>

          {/* Stats Section */}
          <div className="space-y-1.5 md:space-y-2 mb-2 md:mb-3 py-2 md:py-3 border-t border-b border-slate-100">
            <div className="flex justify-between items-center">
              <span className="text-[9px] md:text-[10px] text-slate-400 uppercase tracking-wider font-bold">P&L</span>
              <span className={`text-sm md:text-lg font-bold ${pnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {formatPnL(pnl)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[9px] md:text-[10px] text-slate-400 uppercase tracking-wider font-bold">ROI</span>
              <span className={`text-sm md:text-lg font-bold ${roi >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {roiFormatted}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[9px] md:text-[10px] text-slate-400 uppercase tracking-wider font-bold">VOLUME</span>
              <span className="text-sm md:text-lg font-bold text-slate-900">
                {formatVolume(volume)}
              </span>
            </div>
          </div>

          {/* Follower Count */}
          <div className="text-center mb-3 md:mb-5">
            <span className="text-xs md:text-sm text-slate-500">
              👥 {followerCount.toLocaleString()} {followerCount === 1 ? 'follower' : 'followers'}
            </span>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 text-center">
              {error}
            </div>
          )}

          {/* Follow Button */}
          <button
            onClick={handleFollowToggle}
            disabled={loading || checkingFollow}
            className={`w-full font-bold rounded-xl shadow-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed py-2 px-3 text-sm md:py-3 md:px-4 md:text-base ${
              following
                ? 'bg-slate-200 text-slate-700 hover:bg-slate-300 border-b-4 border-slate-400 active:border-b-0 active:translate-y-1'
                : 'bg-[#FDB022] hover:bg-[#F59E0B] text-slate-900 border-b-4 border-[#D97706] active:border-b-0 active:translate-y-1'
            }`}
          >
            {checkingFollow ? (
              'Loading...'
            ) : loading ? (
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
                {following ? 'Unfollowing...' : 'Following...'}
              </span>
            ) : !user ? (
              'Sign in to Follow'
            ) : following ? (
              '✓ Following'
            ) : (
              '+ Follow'
            )}
          </button>
        </>
      ) : (
        // Full mode - Polymarket-style layout for Discover page
        <>
          {/* Top Row: Avatar + Name + Follow Button */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              {/* Avatar with ring */}
              <div
                className="h-12 w-12 rounded-full ring-2 ring-white shadow-sm flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                style={{ backgroundColor: avatarColor }}
              >
                {initials}
              </div>
              <div>
                <h3 
                  className="font-bold text-slate-900 group-hover:text-slate-700 transition-colors"
                  title={displayName}
                >
                  {truncateName(displayName, 25)}
                </h3>
                <span className="text-xs font-medium text-slate-500">
                  {followerCount.toLocaleString()} {followerCount === 1 ? 'copier' : 'copiers'}
                </span>
              </div>
            </div>
            
            {/* Follow Button - Polymarket style */}
            <button
              onClick={handleFollowToggle}
              disabled={loading || checkingFollow}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                following
                  ? 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                  : 'border border-[#FDB022] text-slate-900 hover:bg-yellow-50'
              }`}
            >
              {checkingFollow ? (
                'Loading...'
              ) : loading ? (
                <span className="flex items-center gap-1">
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
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
                  {following ? 'Unfollowing' : 'Following'}
                </span>
              ) : !user ? (
                'Sign in'
              ) : following ? (
                '✓ Following'
              ) : (
                '+ Follow'
              )}
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 text-center">
              {error}
            </div>
          )}

          {/* Stats Grid - 3 columns like Polymarket */}
          <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
            {/* P&L */}
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">P&L</span>
              <span className={`text-sm font-bold ${pnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {formatPnL(pnl)}
              </span>
            </div>
            
            {/* ROI */}
            <div className="flex flex-col text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">ROI</span>
              <span className={`text-sm font-bold ${roi >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {roiFormatted}%
              </span>
            </div>
            
            {/* Volume */}
            <div className="flex flex-col text-right">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">VOLUME</span>
              <span className="text-sm font-bold text-slate-900">
                {formatVolume(volume)}
              </span>
            </div>
          </div>
        </>
      )}
    </Link>
  );
}

