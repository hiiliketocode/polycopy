'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, ensureProfile } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import Header from '../components/Header';

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

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      console.log('🔍 Checking profile auth...');
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

  // Fetch user stats and wallet
  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      console.log('📊 Fetching user stats...');
      setLoadingStats(true);

      try {
        // Count how many traders user is following
        const { count, error } = await supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        if (error) {
          console.error('❌ Error fetching following count:', error);
        } else {
          console.log('✅ Following count:', count);
          setFollowingCount(count || 0);
        }

        // Fetch wallet address and username from profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('wallet_address, polymarket_username')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('❌ Error fetching profile:', profileError);
        } else {
          if (profile?.wallet_address) {
            console.log('✅ Wallet connected:', profile.wallet_address);
            setWalletAddress(profile.wallet_address);
          }
          if (profile?.polymarket_username) {
            console.log('✅ Username connected:', profile.polymarket_username);
            setPolymarketUsername(profile.polymarket_username);
          }
        }
      } catch (err) {
        console.error('❌ Exception fetching stats:', err);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchStats();
  }, [user]);

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
        console.log('🔍 Fetching username for wallet:', walletAddress);
        const response = await fetch('/api/polymarket/leaderboard?limit=100&orderBy=PNL');
        
        if (response.ok) {
          const leaderboardData = await response.json();
          
          // Find this wallet in the leaderboard
          const trader = leaderboardData.traders?.find(
            (t: any) => t.wallet.toLowerCase() === walletAddress.toLowerCase()
          );
          
          if (trader && trader.displayName) {
            // Found username in leaderboard
            console.log('✅ Found username:', trader.displayName);
            setDisplayName(trader.displayName);
            return;
          }
        }
        
        // Not found in leaderboard - show shortened wallet
        const shortened = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
        console.log('⚠️ Not in leaderboard, showing shortened wallet:', shortened);
        setDisplayName(shortened);
      } catch (err) {
        console.error('❌ Error fetching username:', err);
        // Fallback to shortened wallet
        const shortened = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
        setDisplayName(shortened);
      }
    };

    updateDisplayName();
  }, [walletAddress]);

  const handleLogout = async () => {
    try {
      console.log('🚪 Logging out...');
      await supabase.auth.signOut();
      router.push('/');
    } catch (error) {
      console.error('❌ Error logging out:', error);
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
      console.log('💾 Saving wallet address...');

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

      console.log('✅ Wallet saved successfully');
      setWalletAddress(walletInput.trim().toLowerCase());
      setPolymarketUsername(null);
      setShowWalletModal(false);
      setWalletInput('');
    } catch (err: any) {
      console.error('❌ Error saving wallet:', err);
      setConnectionError(err.message || 'Failed to save wallet address');
    } finally {
      setSavingConnection(false);
    }
  };

  const handleDisconnectWallet = async () => {
    if (!confirm('Are you sure you want to disconnect your Polymarket account?')) {
      return;
    }

    setSavingConnection(true);

    try {
      console.log('🔌 Disconnecting...');

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

      console.log('✅ Disconnected successfully');
      setWalletAddress(null);
      setPolymarketUsername(null);
    } catch (err: any) {
      console.error('❌ Error disconnecting:', err);
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
        {/* Desktop Title */}
        <h1 className="hidden md:block text-h1 mb-6">Your Profile</h1>
        
        {/* Mobile Header Section */}
        <div className="md:hidden mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              {/* Large Avatar - Mobile */}
              <div className="w-20 h-20 bg-[#FDB022] rounded-full flex items-center justify-center text-[#0F0F0F] font-bold text-3xl shadow-sm">
                {displayName[0].toUpperCase()}
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900">{displayName}</p>
                {walletAddress && (
                  <p className="text-sm text-slate-500 font-mono">{abbreviateWallet(walletAddress)}</p>
                )}
                <p className="text-xs text-slate-500 mt-1">0 followers</p>
              </div>
            </div>
            {/* Settings Gear - Mobile */}
            <button 
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              onClick={() => {/* Add settings handler */}}
            >
              <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Desktop Profile Card */}
        <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
            <div className="w-16 h-16 bg-[#FDB022] rounded-full flex items-center justify-center text-[#0F0F0F] font-bold text-2xl shadow-sm">
              {displayName[0].toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="text-xl font-bold text-slate-900">{displayName}</p>
              <p className="text-sm text-slate-500">Polycopy Member</p>
            </div>
          </div>

          {/* Desktop Wallet Connection */}
          {walletAddress ? (
            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-semibold text-emerald-700">
                    {polymarketUsername ? `@${polymarketUsername}` : 'Polymarket Connected'}
                  </span>
                </div>
                <button
                  onClick={handleDisconnectWallet}
                  disabled={savingConnection}
                  className="text-xs text-emerald-600 hover:text-emerald-800 underline font-medium"
                >
                  Disconnect
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-emerald-700">
                <span className="font-mono">{abbreviateWallet(walletAddress)}</span>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(walletAddress);
                    } catch (err) {
                      console.error('Failed to copy:', err);
                    }
                  }}
                  className="hover:text-emerald-900"
                  title="Copy full address"
                >
                  📋
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleConnectWallet}
              className="btn btn-primary w-full"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="ml-2">Connect Polymarket Account</span>
            </button>
          )}
        </div>

        {/* Mobile Wallet Connection Card */}
        <div className="md:hidden mb-6">
          {walletAddress ? (
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-slate-900">Polymarket Connected</div>
                  <div className="text-sm text-slate-500 font-mono">{abbreviateWallet(walletAddress)}</div>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(walletAddress);
                    } catch (err) {
                      console.error('Failed to copy:', err);
                    }
                  }}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleConnectWallet}
              className="btn btn-primary w-full"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="ml-2">Connect Polymarket Account</span>
            </button>
          )}
        </div>

        {/* Your Stats Section */}
        <div className="mb-6">
          <h2 className="text-label text-slate-400 mb-4">YOUR STATS</h2>
          {loadingStats ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-100 animate-pulse p-6 rounded-2xl h-32"></div>
              <div className="bg-slate-100 animate-pulse p-6 rounded-2xl h-32"></div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {/* Following Card */}
              <Link
                href="/discover"
                className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md hover:border-[#FDB022] transition-all"
              >
                <div className="stat-label mb-2">FOLLOWING</div>
                <div className="stat-value mb-2">{followingCount}</div>
                <div className="text-small text-slate-500">Traders you're copying</div>
              </Link>
              
              {/* Followers Card */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                <div className="stat-label mb-2">FOLLOWERS</div>
                <div className="text-3xl font-bold text-slate-400 mb-2">0</div>
                <div className="text-small text-slate-500">People copying you</div>
              </div>
            </div>
          )}
        </div>

        {/* Your Performance Section */}
        {walletAddress && (
          <div className="mb-6">
            <h2 className="text-label text-slate-400 mb-4">YOUR PERFORMANCE</h2>
            
            {/* Coming Soon Card */}
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl p-6 md:p-8 border border-slate-200 shadow-sm">
              <div className="text-center mb-6">
                <div className="text-4xl mb-3">📊</div>
                <h3 className="text-h3 text-slate-700 mb-2">Coming Soon</h3>
                <p className="text-body text-slate-500">Your trading stats will appear here soon</p>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center opacity-50">
                  <div className="text-2xl font-bold text-slate-400">--</div>
                  <div className="stat-label text-slate-500 mt-2">P&L</div>
                </div>
                <div className="text-center opacity-50">
                  <div className="text-2xl font-bold text-slate-400">--</div>
                  <div className="stat-label text-slate-500 mt-2">ROI</div>
                </div>
                <div className="text-center opacity-50">
                  <div className="text-2xl font-bold text-slate-400">--</div>
                  <div className="stat-label text-slate-500 mt-2">VOLUME</div>
                </div>
                <div className="text-center opacity-50">
                  <div className="text-2xl font-bold text-slate-400">--</div>
                  <div className="stat-label text-slate-500 mt-2">PREDICTIONS</div>
                </div>
              </div>
              
              <div className="text-center pt-4 border-t border-slate-300">
                <p className="text-small text-slate-400">
                  💡 We're working on bringing you detailed trading stats
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Settings Section */}
        <div className="mb-6">
          <h2 className="text-label text-slate-400 mb-4">SETTINGS</h2>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Contact Us / Help & Support */}
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
    </div>
  );
}
