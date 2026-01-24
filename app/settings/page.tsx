'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import {
  Bell,
  BellOff,
  BookOpen,
  Crown,
  HelpCircle,
  Settings,
} from 'lucide-react';
import { supabase, ensureProfile } from '@/lib/supabase';
import { resolveFeatureTier, tierHasPremiumAccess } from '@/lib/feature-tier';
import { Navigation } from '@/components/polycopy/navigation';
import { UpgradeModal } from '@/components/polycopy/upgrade-modal';
import { CancelSubscriptionModal } from '@/components/polycopy/cancel-subscription-modal';
import { triggerLoggedOut } from '@/lib/auth/logout-events';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const SLIPPAGE_PRESETS = [0, 1, 3, 5];

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);

  const featureTier = resolveFeatureTier(Boolean(user), profile);
  const hasPremiumAccess = tierHasPremiumAccess(featureTier);
  const walletAddress = profile?.trading_wallet_address || null;

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showCancelSubscriptionModal, setShowCancelSubscriptionModal] = useState(false);

  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [disconnectingWallet, setDisconnectingWallet] = useState(false);
  const [showDisconnectSuccess, setShowDisconnectSuccess] = useState(false);

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [loadingNotificationPrefs, setLoadingNotificationPrefs] = useState(false);
  const [defaultBuySlippage, setDefaultBuySlippage] = useState<number>(3);
  const [defaultSellSlippage, setDefaultSellSlippage] = useState<number>(3);
  const [buySlippageSelection, setBuySlippageSelection] = useState<string>('3');
  const [sellSlippageSelection, setSellSlippageSelection] = useState<string>('3');
  const [customBuySlippage, setCustomBuySlippage] = useState<string>('');
  const [customSellSlippage, setCustomSellSlippage] = useState<string>('');

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const hasLoadedNotificationPrefsRef = useRef(false);

  const truncateAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    await fetch('/api/auth/admin-logout', { method: 'POST' });
    triggerLoggedOut('signed_out');
    router.push('/login');
  };

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
        await ensureProfile(session.user.id, session.user.email!);
      } catch (err) {
        console.error('Auth error:', err);
        triggerLoggedOut('auth_error');
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        triggerLoggedOut('signed_out');
        router.push('/login');
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileImageUrl(null);
      setIsPremium(false);
      return;
    }

    let mounted = true;

    const fetchProfile = async () => {
      try {
        const [profileRes, walletRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('is_premium, is_admin, profile_image_url')
            .eq('id', user.id)
            .single(),
          supabase
            .from('turnkey_wallets')
            .select('polymarket_account_address, eoa_address')
            .eq('user_id', user.id)
            .maybeSingle(),
        ]);

        if (!mounted) return;

        if (profileRes.error) {
          console.error('Error fetching profile:', profileRes.error);
          setIsPremium(false);
          setProfileImageUrl(null);
          return;
        }

        setIsPremium(Boolean(profileRes.data?.is_premium || profileRes.data?.is_admin));
        setProfileImageUrl(profileRes.data?.profile_image_url || null);
        setProfile({
          ...profileRes.data,
          trading_wallet_address: walletRes.data?.polymarket_account_address || walletRes.data?.eoa_address || null,
        });
      } catch (err) {
        console.error('Error fetching profile data:', err);
      }
    };

    fetchProfile();

    return () => {
      mounted = false;
    };
  }, [user]);

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
          .maybeSingle();

        const isMeaningfulError = (err: any) => {
          if (!err || typeof err !== 'object') return !!err;
          const values = [err.code, err.message, err.details, err.hint];
          return values.some((v) => {
            if (typeof v === 'string') return v.trim().length > 0;
            return Boolean(v);
          });
        };

        if (isMeaningfulError(error)) {
          console.error('Error fetching notification preferences:', error);
        }

        if (data) {
          setNotificationsEnabled(data.trader_closes_position || false);
          setDefaultBuySlippage(data.default_buy_slippage ?? 3);
          setDefaultSellSlippage(data.default_sell_slippage ?? 3);
        }
      } catch (err: any) {
        const hasMeaningfulError = err && (err.code || err.message || err.details || err.hint);
        if (hasMeaningfulError) {
          console.error('Error fetching notification preferences:', err);
        }
      } finally {
        setLoadingNotificationPrefs(false);
      }
    };

    fetchNotificationPrefs();
  }, [user]);

  useEffect(() => {
    const nextSelection = SLIPPAGE_PRESETS.includes(defaultBuySlippage)
      ? String(defaultBuySlippage)
      : 'custom';
    setBuySlippageSelection(nextSelection);
    if (nextSelection === 'custom') {
      setCustomBuySlippage(defaultBuySlippage.toString());
    }
  }, [defaultBuySlippage]);

  useEffect(() => {
    const nextSelection = SLIPPAGE_PRESETS.includes(defaultSellSlippage)
      ? String(defaultSellSlippage)
      : 'custom';
    setSellSlippageSelection(nextSelection);
    if (nextSelection === 'custom') {
      setCustomSellSlippage(defaultSellSlippage.toString());
    }
  }, [defaultSellSlippage]);

  const handleToggleNotifications = async () => {
    if (!user) return;

    const newValue = !notificationsEnabled;
    setNotificationsEnabled(newValue);

    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert(
          {
            user_id: user.id,
            trader_closes_position: newValue,
            market_resolves: newValue,
          },
          { onConflict: 'user_id' }
        );

      if (error) throw error;

      setToastMessage(`Notifications ${newValue ? 'enabled' : 'disabled'}`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error('Error updating notification preferences:', err);
      setNotificationsEnabled(!newValue);
    }
  };

  const handleUpdateSlippage = async (type: 'buy' | 'sell', value: number) => {
    if (!user) return;

    const validatedValue = Math.max(0, Math.min(100, value));
    const prevBuy = defaultBuySlippage;
    const prevSell = defaultSellSlippage;

    if (type === 'buy') {
      setDefaultBuySlippage(validatedValue);
    } else {
      setDefaultSellSlippage(validatedValue);
    }

    const payload = {
      userId: user.id,
      default_buy_slippage: type === 'buy' ? validatedValue : defaultBuySlippage,
      default_sell_slippage: type === 'sell' ? validatedValue : defaultSellSlippage,
    };

    const applyUpdatedState = (next: any) => {
      if (typeof next?.default_buy_slippage === 'number') {
        setDefaultBuySlippage(next.default_buy_slippage);
      }
      if (typeof next?.default_sell_slippage === 'number') {
        setDefaultSellSlippage(next.default_sell_slippage);
      }
    };

    try {
      const response = await fetch('/api/notification-preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw payload?.error || payload?.dev_info || new Error('Failed to update slippage');
      }

      const updated = await response.json();
      applyUpdatedState(updated);

      setToastMessage(`Default ${type} slippage updated to ${validatedValue}%`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
      return;
    } catch (err) {
      try {
        const { data, error } = await supabase
          .from('notification_preferences')
          .upsert(
            {
              user_id: user.id,
              default_buy_slippage: payload.default_buy_slippage,
              default_sell_slippage: payload.default_sell_slippage,
            },
            { onConflict: 'user_id' }
          )
          .select()
          .maybeSingle();

        if (error) throw error;

        applyUpdatedState(data);
        setToastMessage(`Default ${type} slippage updated to ${validatedValue}%`);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 2000);
        return;
      } catch (fallbackErr) {
        console.error('Slippage update failed via API and fallback:', {
          api_error: err,
          fallback_error: fallbackErr,
        });
      }
    }

    setDefaultBuySlippage(prevBuy);
    setDefaultSellSlippage(prevSell);
  };

  const handleWalletDisconnect = async () => {
    if (!user || !walletAddress) return;

    setDisconnectingWallet(true);

    try {
      const { error } = await supabase
        .from('turnkey_wallets')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      setProfile({ ...profile, trading_wallet_address: null });
      setShowDisconnectModal(false);
      setShowDisconnectSuccess(true);
    } catch (err) {
      console.error('Error disconnecting wallet:', err);
    } finally {
      setDisconnectingWallet(false);
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

      {/* Mobile top nav banner (logo only, no page title) */}
      <div className="md:hidden sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="px-4 py-3">
          <Image
            src="/logos/polycopy-logo-primary.svg"
            alt="Polycopy"
            width={120}
            height={32}
            className="h-7 w-auto"
          />
        </div>
      </div>

      <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pt-2 md:pt-0 pb-20 md:pb-8">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 space-y-8">
          <header className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Settings</p>
            <h1 className="text-3xl md:text-4xl font-semibold text-slate-900">Account</h1>
            <p className="text-slate-600">
              Manage notifications, trading defaults, and membership in one place.
            </p>
          </header>

          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-6">
              <Card className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Notifications</h2>
                    <p className="text-sm text-slate-500">
                      Get a heads-up when traders close positions.
                    </p>
                  </div>
                  <Button
                    onClick={handleToggleNotifications}
                    disabled={loadingNotificationPrefs}
                    variant={notificationsEnabled ? 'default' : 'outline'}
                    size="sm"
                  >
                    {notificationsEnabled ? 'Enabled' : 'Disabled'}
                  </Button>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  {notificationsEnabled ? (
                    <Bell className="h-5 w-5 text-slate-700" />
                  ) : (
                    <BellOff className="h-5 w-5 text-slate-400" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-slate-900">Email updates</p>
                    <p className="text-xs text-slate-500">Alerts for closes and resolved markets.</p>
                  </div>
                </div>
              </Card>

              <Card className="p-6 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Trading Defaults</h2>
                  <p className="text-sm text-slate-500">
                    Tune your default slippage for faster fills.
                  </p>
                </div>

                {hasPremiumAccess ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-900">Buy Orders</p>
                        <span className="text-xs text-slate-600">{defaultBuySlippage}%</span>
                      </div>
                      <RadioGroup
                        value={buySlippageSelection}
                        onValueChange={(value) => {
                          setBuySlippageSelection(value);
                          if (value === 'custom') return;
                          const parsed = Number(value);
                          if (Number.isFinite(parsed)) {
                            handleUpdateSlippage('buy', parsed);
                          }
                        }}
                        className="mt-3 flex flex-wrap gap-4"
                      >
                        {SLIPPAGE_PRESETS.map((value) => (
                          <div key={value} className="flex items-center space-x-2">
                            <RadioGroupItem value={String(value)} id={`buy-slippage-${value}`} className="h-4 w-4" />
                            <Label htmlFor={`buy-slippage-${value}`} className="text-sm font-medium text-slate-700 cursor-pointer">
                              {value}%
                            </Label>
                          </div>
                        ))}
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="custom" id="buy-slippage-custom" className="h-4 w-4" />
                          <Label htmlFor="buy-slippage-custom" className="text-sm font-medium text-slate-700 cursor-pointer">
                            Custom
                          </Label>
                        </div>
                      </RadioGroup>
                      {buySlippageSelection === 'custom' && (
                        <div className="mt-3">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={customBuySlippage}
                            onChange={(e) => {
                              const nextValue = e.target.value;
                              setCustomBuySlippage(nextValue);
                              setBuySlippageSelection('custom');
                              const parsed = Number(nextValue);
                              if (Number.isFinite(parsed)) {
                                handleUpdateSlippage('buy', parsed);
                              }
                            }}
                            className="w-28 text-sm"
                            placeholder="0.5"
                          />
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-900">Sell Orders</p>
                        <span className="text-xs text-slate-600">{defaultSellSlippage}%</span>
                      </div>
                      <RadioGroup
                        value={sellSlippageSelection}
                        onValueChange={(value) => {
                          setSellSlippageSelection(value);
                          if (value === 'custom') return;
                          const parsed = Number(value);
                          if (Number.isFinite(parsed)) {
                            handleUpdateSlippage('sell', parsed);
                          }
                        }}
                        className="mt-3 flex flex-wrap gap-4"
                      >
                        {SLIPPAGE_PRESETS.map((value) => (
                          <div key={value} className="flex items-center space-x-2">
                            <RadioGroupItem value={String(value)} id={`sell-slippage-${value}`} className="h-4 w-4" />
                            <Label htmlFor={`sell-slippage-${value}`} className="text-sm font-medium text-slate-700 cursor-pointer">
                              {value}%
                            </Label>
                          </div>
                        ))}
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="custom" id="sell-slippage-custom" className="h-4 w-4" />
                          <Label htmlFor="sell-slippage-custom" className="text-sm font-medium text-slate-700 cursor-pointer">
                            Custom
                          </Label>
                        </div>
                      </RadioGroup>
                      {sellSlippageSelection === 'custom' && (
                        <div className="mt-3">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={customSellSlippage}
                            onChange={(e) => {
                              const nextValue = e.target.value;
                              setCustomSellSlippage(nextValue);
                              setSellSlippageSelection('custom');
                              const parsed = Number(nextValue);
                              if (Number.isFinite(parsed)) {
                                handleUpdateSlippage('sell', parsed);
                              }
                            }}
                            className="w-28 text-sm"
                            placeholder="0.5"
                          />
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      Higher slippage increases fill rate but may result in worse prices.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-600 mb-3">
                      Upgrade to Premium to customize trading defaults and unlock real-time copy trading.
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
              </Card>

              <Card className="p-6 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Membership & Wallet</h2>
                  <p className="text-sm text-slate-500">
                    Keep your subscription and wallet details in sync.
                  </p>
                </div>

                {hasPremiumAccess ? (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Crown className="h-5 w-5 text-yellow-600" />
                      <p className="font-semibold text-yellow-900">Premium Member</p>
                    </div>
                    <p className="text-sm text-yellow-700">
                      You have access to all premium features including Real Copy trading.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-600 mb-3">
                      Ready to unlock automated trading? Premium gives you the full toolkit.
                    </p>
                    <Button
                      onClick={() => setShowUpgradeModal(true)}
                      className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                    >
                      <Crown className="mr-2 h-4 w-4" />
                      Get Premium
                    </Button>
                  </div>
                )}

                <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Wallet connection</p>
                      <p className="text-sm text-slate-600">
                        {walletAddress ? `Connected to ${truncateAddress(walletAddress)}` : 'No wallet connected yet.'}
                      </p>
                    </div>
                    {walletAddress ? (
                      <Button
                        onClick={() => setShowDisconnectModal(true)}
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-50"
                      >
                        Remove wallet
                      </Button>
                    ) : (
                      <Button asChild variant="outline">
                        <Link href="/profile/connect-wallet">Connect wallet</Link>
                      </Button>
                    )}
                  </div>
                </div>

                {hasPremiumAccess && (
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-sm text-slate-600 mb-3">
                      Need to cancel your subscription? You will keep access until the end of your billing period.
                    </p>
                    <Button
                      onClick={() => setShowCancelSubscriptionModal(true)}
                      variant="outline"
                      className="border-red-300 text-red-700 hover:bg-red-50"
                    >
                      Cancel Subscription
                    </Button>
                  </div>
                )}
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-slate-900/10 flex items-center justify-center">
                    <Settings className="h-5 w-5 text-slate-700" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Signed in as</p>
                    <p className="text-base font-semibold text-slate-900">{user?.email || 'User'}</p>
                  </div>
                </div>
                <div className="grid gap-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Membership</span>
                    <Badge className={hasPremiumAccess ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}>
                      {hasPremiumAccess ? 'Premium' : 'Free'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Wallet</span>
                    <span className="font-mono text-xs text-slate-700">
                      {walletAddress ? truncateAddress(walletAddress) : 'Not connected'}
                    </span>
                  </div>
                </div>
                <Button
                  onClick={handleSignOut}
                  variant="outline"
                  className="w-full border-red-200 text-red-700 hover:bg-red-50"
                >
                  Sign out
                </Button>
              </Card>

              <Card className="p-6 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Help & Guides</h2>
                  <p className="text-sm text-slate-500">
                    Quick answers and setup steps when you need them.
                  </p>
                </div>
                <div className="space-y-3">
                  <Link
                    href="/faq"
                    className="group flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <HelpCircle className="h-5 w-5 text-slate-500 group-hover:text-slate-900" />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">FAQ</p>
                        <p className="text-xs text-slate-500">Short answers to common questions.</p>
                      </div>
                    </div>
                    <span className="text-slate-400 group-hover:text-slate-600">{'->'}</span>
                  </Link>
                  <Link
                    href="/trading-setup"
                    className="group flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <BookOpen className="h-5 w-5 text-slate-500 group-hover:text-slate-900" />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">How to set up</p>
                        <p className="text-xs text-slate-500">Step-by-step trading setup guide.</p>
                      </div>
                    </div>
                    <span className="text-slate-400 group-hover:text-slate-600">{'->'}</span>
                  </Link>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <UpgradeModal open={showUpgradeModal} onOpenChange={setShowUpgradeModal} />
      <CancelSubscriptionModal
        open={showCancelSubscriptionModal}
        onOpenChange={setShowCancelSubscriptionModal}
        onConfirmCancel={async () => {
          const response = await fetch('/api/stripe/cancel-subscription', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            },
          });

          const data = await response.json();

          if (response.ok) {
            const accessUntil = new Date(data.current_period_end * 1000).toLocaleDateString();
            alert(`Your subscription has been canceled. You'll keep Premium access until ${accessUntil}.`);
            window.location.reload();
          } else {
            throw new Error(data.error || 'Failed to cancel subscription');
          }
        }}
      />

      <Dialog open={showDisconnectModal} onOpenChange={setShowDisconnectModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-red-600">Remove wallet?</DialogTitle>
            <DialogDescription className="text-slate-600 mt-2">
              This will remove your connected Polymarket wallet from Polycopy. You will need to reconnect it to use Real Copy trading features.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-red-900 mb-2">Warning:</p>
              <ul className="text-sm text-red-800 space-y-1 list-disc list-inside">
                <li>You will lose access to automated trade execution</li>
                <li>Your private key will be removed from secure storage</li>
                <li>This action cannot be undone</li>
              </ul>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDisconnectModal(false);
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleWalletDisconnect}
                disabled={disconnectingWallet}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                {disconnectingWallet ? 'Removing...' : 'Remove wallet'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDisconnectSuccess} onOpenChange={setShowDisconnectSuccess}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-900">Wallet removed</DialogTitle>
            <DialogDescription className="text-slate-600 mt-2">
              Your Polymarket wallet is no longer connected. You can reconnect anytime to use Real Copy trading.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowDisconnectSuccess(false)}>
              Done
            </Button>
            <Button asChild className="flex-1">
              <Link href="/profile/connect-wallet">Reconnect wallet</Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
