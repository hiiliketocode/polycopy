'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bot, TrendingUp, Shield, Zap, Users, BarChart3, CheckCircle2, XCircle, ArrowRight, Sparkles, Activity } from 'lucide-react';
import { Navigation } from '@/components/polycopy/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

interface LiveBot {
  id: string;
  name: string;
  description: string;
  roi: number;
  winRate: number;
  totalTrades: number;
  volume: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  isFree: boolean;
  isActive: boolean;
}

function formatVolume(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

const FREE_BOT_NAMES = ['Steady Eddie', 'Balanced Play', 'Full Send'];

function deriveRiskLevel(wallet: any): 'LOW' | 'MEDIUM' | 'HIGH' {
  const name = (wallet.display_name || '').toLowerCase();
  const desc = (wallet.description || '').toLowerCase();
  if (name.includes('conservative') || name.includes('steady') || name.includes('safe') ||
    name.includes('favorite') || name.includes('heavy fav') || name.includes('arbitrage') ||
    desc.includes('conservative') || desc.includes('low risk')) return 'LOW';
  if (name.includes('aggressive') || name.includes('full send') || name.includes('storm') ||
    name.includes('contrarian') || name.includes('underdog') ||
    desc.includes('high-risk') || desc.includes('aggressive') || desc.includes('contrarian')) return 'HIGH';
  return 'MEDIUM';
}

export default function PolymarketTradingBotsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [liveBots, setLiveBots] = useState<LiveBot[]>([]);
  const [botsLoading, setBotsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      
      if (session?.user) {
        supabase
          .from('profiles')
          .select('tier, trading_wallet_address, profile_image')
          .eq('id', session.user.id)
          .single()
          .then(({ data }) => {
            if (data) {
              setIsPremium(data.tier === 'premium');
              setWalletAddress(data.trading_wallet_address);
              setProfileImageUrl(data.profile_image);
            }
          });
      }
    });
  }, []);

  useEffect(() => {
    const fetchBots = async () => {
      try {
        const res = await fetch('/api/ft/wallets/public', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success || !data.wallets) return;
        const bots: LiveBot[] = data.wallets
          .filter((w: any) => w.total_trades > 0)
          .sort((a: any, b: any) => {
            const aRoi = a.starting_balance > 0 ? ((a.current_balance - a.starting_balance) / a.starting_balance) * 100 : 0;
            const bRoi = b.starting_balance > 0 ? ((b.current_balance - b.starting_balance) / b.starting_balance) * 100 : 0;
            return bRoi - aRoi;
          })
          .slice(0, 8)
          .map((w: any) => ({
            id: w.wallet_id,
            name: (w.display_name || w.wallet_id).toUpperCase(),
            description: w.description || 'AI-powered copy trading strategy',
            roi: w.starting_balance > 0 ? ((w.current_balance - w.starting_balance) / w.starting_balance) * 100 : 0,
            winRate: (w.won + w.lost) > 0 ? (w.won / (w.won + w.lost)) * 100 : 0,
            totalTrades: w.total_trades || 0,
            volume: w.avg_trade_size ? formatVolume((w.avg_trade_size || 0) * (w.total_trades || 0)) : `${w.total_trades} trades`,
            riskLevel: deriveRiskLevel(w),
            isFree: FREE_BOT_NAMES.some(n => w.display_name?.includes(n)),
            isActive: w.is_active || false,
          }));
        setLiveBots(bots);
      } catch {
        // Silently fail — section just won't render
      } finally {
        setBotsLoading(false);
      }
    };
    fetchBots();
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Navigation 
        user={user ? { id: user.id, email: user.email || '' } : null}
        isPremium={isPremium}
        walletAddress={walletAddress}
        profileImageUrl={profileImageUrl}
      />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4 py-16 md:py-24">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-indigo-500/10 px-4 py-2 backdrop-blur-sm">
            <Bot className="h-4 w-4 text-indigo-400" />
            <span className="text-sm font-medium text-indigo-300">Automated Trading Strategies</span>
          </div>
          
          <h1 className="mb-6 font-sans text-4xl font-bold leading-tight text-white md:text-6xl">
            Polymarket Trading Bots
          </h1>
          
          <p className="mb-8 text-lg leading-relaxed text-slate-300 md:text-xl">
            Automated trading strategies that analyze markets and execute trades 24/7. Follow proven bots from conservative to aggressive, or let AI find the highest-signal opportunities.
          </p>
          
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button asChild size="lg" className="bg-[#FDB022] text-slate-900 hover:bg-[#E69E1A] font-semibold">
              <Link href="/v2/bots">
                Browse All Bots
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10">
              <Link href="/pricing">View Pricing</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* What Are Polymarket Bots */}
      <section className="bg-white px-4 py-16 md:py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-3xl font-bold text-slate-900 md:text-4xl">
            What Are Polymarket Trading Bots?
          </h2>
          
          <div className="prose prose-lg max-w-none text-slate-700">
            <p>
              Polymarket trading bots are automated wallets that execute specific trading strategies on Polymarket. Instead of manually analyzing markets and placing trades, bots follow predefined rules to:
            </p>
            
            <ul className="space-y-3">
              <li><strong>Analyze markets 24/7</strong> - Bots monitor Polymarket continuously, identifying opportunities even when you're offline</li>
              <li><strong>Execute strategies automatically</strong> - From conservative favorites to aggressive underdogs, each bot follows a distinct approach</li>
              <li><strong>Manage risk systematically</strong> - Position sizing, stop losses, and portfolio rules are built into each strategy</li>
              <li><strong>Learn from real traders</strong> - Track bot performance and understand what strategies work in different market conditions</li>
            </ul>
            
            <p>
              Unlike traditional copy trading where you follow human traders, bots provide <strong>consistent, emotion-free execution</strong> of proven strategies.
            </p>
          </div>
        </div>
      </section>

      {/* Free Bots */}
      <section className="bg-slate-50 px-4 py-16 md:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <Badge className="mb-4 bg-green-100 text-green-700 hover:bg-green-100">Free Tier Available</Badge>
            <h2 className="mb-4 text-3xl font-bold text-slate-900 md:text-4xl">
              Polymarket Trading Bot Strategies
            </h2>
            <p className="text-lg text-slate-600">
              Bots at different risk levels to match your style. Free tier includes access to one bot — premium unlocks the full lineup.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Steady Eddie */}
            <Card className="border-2 border-slate-200 p-6 hover:border-slate-300 transition-colors">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Steady Eddie</h3>
                <Badge variant="outline" className="border-green-300 bg-green-50 text-green-700">Low Risk</Badge>
              </div>
              <p className="mb-4 text-sm text-slate-600">
                Conservative strategy targeting heavy favorites (75%+ probability). Focuses on high-conviction, low-risk markets with steady returns.
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Strategy</span>
                  <span className="font-medium text-slate-900">Heavy Favorites</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Risk Level</span>
                  <span className="font-medium text-green-600">Low</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Best For</span>
                  <span className="font-medium text-slate-900">Beginners</span>
                </div>
              </div>
            </Card>

            {/* Balanced Play */}
            <Card className="border-2 border-indigo-200 bg-indigo-50/30 p-6 hover:border-indigo-300 transition-colors">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Balanced Play</h3>
                <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">Medium Risk</Badge>
              </div>
              <p className="mb-4 text-sm text-slate-600">
                Balanced approach combining momentum and value. Targets 55-70% probability markets with good risk/reward ratios.
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Strategy</span>
                  <span className="font-medium text-slate-900">Momentum + Value</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Risk Level</span>
                  <span className="font-medium text-blue-600">Medium</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Best For</span>
                  <span className="font-medium text-slate-900">Most Users</span>
                </div>
              </div>
            </Card>

            {/* Full Send */}
            <Card className="border-2 border-slate-200 p-6 hover:border-slate-300 transition-colors">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Full Send</h3>
                <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">High Risk</Badge>
              </div>
              <p className="mb-4 text-sm text-slate-600">
                Aggressive contrarian strategy targeting underdogs and mispriced markets. Higher risk, higher potential reward.
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Strategy</span>
                  <span className="font-medium text-slate-900">Contrarian</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Risk Level</span>
                  <span className="font-medium text-red-600">High</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Best For</span>
                  <span className="font-medium text-slate-900">Experienced</span>
                </div>
              </div>
            </Card>
          </div>

          <div className="mt-8 text-center">
            <Button asChild size="lg" className="bg-slate-900 text-white hover:bg-slate-800">
              <Link href="/v2/bots">
                View Live Bot Performance
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Live Bot Performance Preview */}
      <section className="bg-slate-900 px-4 py-16 md:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-green-500/10 px-4 py-2">
              <Activity className="h-4 w-4 text-green-400" />
              <span className="text-sm font-medium text-green-400">Live Performance Data</span>
            </div>
            <h2 className="mb-4 text-3xl font-bold text-white md:text-4xl">
              Bot Performance Dashboard
            </h2>
            <p className="text-lg text-slate-400">
              Real-time stats from our active trading bots on Polymarket.
            </p>
          </div>

          {botsLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-lg border border-slate-700 bg-slate-800 p-6">
                  <div className="mb-4 h-4 w-24 rounded bg-slate-700" />
                  <div className="mb-6 h-3 w-32 rounded bg-slate-700" />
                  <div className="space-y-3">
                    <div className="h-3 w-full rounded bg-slate-700" />
                    <div className="h-3 w-full rounded bg-slate-700" />
                    <div className="h-3 w-full rounded bg-slate-700" />
                  </div>
                </div>
              ))}
            </div>
          ) : liveBots.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {liveBots.map((bot) => {
                const isPositive = bot.roi >= 0;
                const riskColors = {
                  LOW: { border: 'border-green-500/30', bg: 'bg-green-500/10', text: 'text-green-400', label: 'LOW RISK' },
                  MEDIUM: { border: 'border-blue-500/30', bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'MODERATE' },
                  HIGH: { border: 'border-red-500/30', bg: 'bg-red-500/10', text: 'text-red-400', label: 'HIGH RISK' },
                };
                const risk = riskColors[bot.riskLevel];
                return (
                  <Link
                    key={bot.id}
                    href={`/v2/bots/${bot.id}`}
                    className={`group rounded-lg border ${risk.border} bg-slate-800/50 p-6 transition-all hover:border-indigo-500/50 hover:bg-slate-800`}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-500/20">
                          <Bot className="h-4 w-4 text-indigo-400" />
                        </div>
                        {bot.isFree ? (
                          <Badge className="bg-green-500/20 text-green-400 text-[10px] hover:bg-green-500/20">FREE</Badge>
                        ) : (
                          <Badge className="bg-indigo-500/20 text-indigo-400 text-[10px] hover:bg-indigo-500/20">PREMIUM</Badge>
                        )}
                      </div>
                      {bot.isActive && (
                        <span className="flex items-center gap-1.5 text-[10px] font-medium text-green-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                          LIVE
                        </span>
                      )}
                    </div>

                    <h3 className="mb-1 text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
                      {bot.name}
                    </h3>
                    <p className="mb-4 text-xs text-slate-500 line-clamp-1">{bot.description}</p>

                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between border-b border-slate-700/50 pb-2">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">ROI</span>
                        <span className={`text-sm font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                          {isPositive ? '+' : ''}{bot.roi.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-b border-slate-700/50 pb-2">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Win Rate</span>
                        <span className="text-sm font-bold text-white">{bot.winRate.toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-slate-700/50 pb-2">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Trades</span>
                        <span className="text-sm font-bold text-white">{bot.totalTrades.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-medium uppercase tracking-wider ${risk.text}`}>{risk.label}</span>
                        <span className="text-xs text-slate-500">{bot.volume}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : null}

          <div className="mt-10 text-center">
            <Button asChild size="lg" className="bg-indigo-600 text-white hover:bg-indigo-700 font-semibold">
              <Link href="/v2/bots">
                View All Bots & Full Analytics
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* How Bots Work */}
      <section className="bg-white px-4 py-16 md:py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-slate-900 md:text-4xl">
            How Polymarket Bots Work
          </h2>

          <div className="space-y-8">
            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
                <Bot className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <h3 className="mb-2 text-xl font-semibold text-slate-900">1. Strategy Selection</h3>
                <p className="text-slate-600">
                  Each bot follows a specific trading strategy (conservative favorites, balanced momentum, aggressive contrarian, or ML-powered). Choose the bot that matches your risk tolerance and goals.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-purple-100">
                <BarChart3 className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <h3 className="mb-2 text-xl font-semibold text-slate-900">2. Market Analysis</h3>
                <p className="text-slate-600">
                  Bots continuously analyze Polymarket markets looking for opportunities that match their strategy. They evaluate probability, liquidity, timing, and market conditions.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-green-100">
                <Zap className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h3 className="mb-2 text-xl font-semibold text-slate-900">3. Automated Execution</h3>
                <p className="text-slate-600">
                  When the bot identifies a trade that meets its criteria, it automatically places the order on Polymarket. Position sizing, risk management, and timing are handled systematically.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                <TrendingUp className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <h3 className="mb-2 text-xl font-semibold text-slate-900">4. Performance Tracking</h3>
                <p className="text-slate-600">
                  Monitor bot performance in real-time with live P&L, ROI, win rate, and trade history. See exactly what's working and adjust your follow list accordingly.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Premium ML Bots */}
      <section className="bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-900 px-4 py-16 text-white md:py-20">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <Badge className="mb-4 bg-indigo-500 text-white hover:bg-indigo-500">Premium</Badge>
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              ML-Powered Trading Bots
            </h2>
            <p className="text-lg text-indigo-200">
              Advanced machine learning bots that analyze 500K+ traders and identify high-probability opportunities across all categories.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-indigo-400/20 bg-white/10 backdrop-blur-sm p-6">
              <div className="mb-4 flex items-center gap-3">
                <Sparkles className="h-6 w-6 text-indigo-300" />
                <h3 className="text-xl font-bold">Category Specialists</h3>
              </div>
              <p className="text-sm text-indigo-100">
                ML bots trained on specific categories (Sports, Politics, Crypto) that understand domain-specific patterns and opportunities.
              </p>
            </Card>

            <Card className="border-indigo-400/20 bg-white/10 backdrop-blur-sm p-6">
              <div className="mb-4 flex items-center gap-3">
                <Users className="h-6 w-6 text-purple-300" />
                <h3 className="text-xl font-bold">Multi-Trader Analysis</h3>
              </div>
              <p className="text-sm text-indigo-100">
                Bots that aggregate signals from multiple top traders to identify consensus opportunities with higher confidence.
              </p>
            </Card>

            <Card className="border-indigo-400/20 bg-white/10 backdrop-blur-sm p-6">
              <div className="mb-4 flex items-center gap-3">
                <Shield className="h-6 w-6 text-green-300" />
                <h3 className="text-xl font-bold">Risk-Adjusted</h3>
              </div>
              <p className="text-sm text-indigo-100">
                Advanced position sizing and portfolio management based on market volatility and historical performance.
              </p>
            </Card>

            <Card className="border-indigo-400/20 bg-white/10 backdrop-blur-sm p-6">
              <div className="mb-4 flex items-center gap-3">
                <BarChart3 className="h-6 w-6 text-amber-300" />
                <h3 className="text-xl font-bold">Performance Optimized</h3>
              </div>
              <p className="text-sm text-indigo-100">
                ML models trained on historical data to maximize Sharpe ratio and minimize drawdowns.
              </p>
            </Card>
          </div>

          <div className="mt-8 text-center">
            <Button asChild size="lg" className="bg-[#FDB022] text-slate-900 hover:bg-[#E69E1A] font-semibold">
              <Link href="/pricing">
                Unlock Premium Bots - $20/mo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Bots vs Manual */}
      <section className="bg-white px-4 py-16 md:py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-slate-900 md:text-4xl">
            Bots vs Manual Copy Trading
          </h2>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Feature</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Trading Bots</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Manual Copy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="px-6 py-4 text-sm text-slate-600">Execution</td>
                  <td className="px-6 py-4"><CheckCircle2 className="h-5 w-5 text-green-600" /></td>
                  <td className="px-6 py-4"><XCircle className="h-5 w-5 text-slate-300" /></td>
                </tr>
                <tr className="bg-slate-50">
                  <td className="px-6 py-4 text-sm text-slate-600">24/7 Monitoring</td>
                  <td className="px-6 py-4"><CheckCircle2 className="h-5 w-5 text-green-600" /></td>
                  <td className="px-6 py-4"><XCircle className="h-5 w-5 text-slate-300" /></td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-slate-600">Emotional Discipline</td>
                  <td className="px-6 py-4"><CheckCircle2 className="h-5 w-5 text-green-600" /></td>
                  <td className="px-6 py-4"><XCircle className="h-5 w-5 text-slate-300" /></td>
                </tr>
                <tr className="bg-slate-50">
                  <td className="px-6 py-4 text-sm text-slate-600">Learning Value</td>
                  <td className="px-6 py-4"><span className="text-sm text-slate-600">Medium</span></td>
                  <td className="px-6 py-4"><CheckCircle2 className="h-5 w-5 text-green-600" /></td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-slate-600">Control</td>
                  <td className="px-6 py-4"><span className="text-sm text-slate-600">Low</span></td>
                  <td className="px-6 py-4"><CheckCircle2 className="h-5 w-5 text-green-600" /></td>
                </tr>
                <tr className="bg-slate-50">
                  <td className="px-6 py-4 text-sm text-slate-600">Time Required</td>
                  <td className="px-6 py-4"><span className="text-sm text-green-600 font-medium">5 min/week</span></td>
                  <td className="px-6 py-4"><span className="text-sm text-slate-600">1-2 hrs/day</span></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-8 rounded-xl bg-blue-50 border border-blue-200 p-6">
            <div className="flex gap-4">
              <div className="shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                  <Sparkles className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-lg font-semibold text-slate-900">Use Both Approaches</h3>
                <p className="text-sm text-slate-700">
                  Many successful traders use bots for consistent strategy execution while manually copying specific high-conviction trades from the <Link href="/high-signal-polymarket-trades" className="font-medium text-blue-600 hover:text-blue-700">high-signal feed</Link>. <Link href="/copy-trading" className="font-medium text-blue-600 hover:text-blue-700">Learn more about manual copy trading →</Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bot Categories */}
      <section className="bg-slate-50 px-4 py-16 md:py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-slate-900 md:text-4xl">
            Bot Categories
          </h2>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-6">
              <h3 className="mb-3 text-xl font-bold text-slate-900">Sports Bots</h3>
              <p className="mb-4 text-sm text-slate-600">
                Specialized in NFL, NBA, MLB, soccer, and other sports markets. Analyze team stats, injury reports, and betting patterns.
              </p>
              <Link href="/sports-prediction-markets" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                Learn about sports trading →
              </Link>
            </Card>

            <Card className="p-6">
              <h3 className="mb-3 text-xl font-bold text-slate-900">Politics Bots</h3>
              <p className="mb-4 text-sm text-slate-600">
                Focus on elections, policy outcomes, and political events. Track polling data, news sentiment, and historical trends.
              </p>
              <Link href="/politics-prediction-markets" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                Learn about politics trading →
              </Link>
            </Card>

            <Card className="p-6">
              <h3 className="mb-3 text-xl font-bold text-slate-900">Crypto Bots</h3>
              <p className="mb-4 text-sm text-slate-600">
                Trade Bitcoin, Ethereum, and altcoin markets. Monitor on-chain data, whale movements, and technical indicators.
              </p>
              <Link href="/crypto-prediction-markets" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                Learn about crypto trading →
              </Link>
            </Card>

            <Card className="p-6">
              <h3 className="mb-3 text-xl font-bold text-slate-900">All-Category Bots</h3>
              <p className="mb-4 text-sm text-slate-600">
                Diversified bots that trade across all categories, identifying opportunities wherever edge exists.
              </p>
              <Link href="/polymarket-market-categories" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                View all categories →
              </Link>
            </Card>
          </div>
        </div>
      </section>

      {/* Why Use Bots */}
      <section className="bg-white px-4 py-16 md:py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-slate-900 md:text-4xl">
            Why Use Polymarket Bots?
          </h2>

          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="mb-3 text-xl font-semibold text-slate-900">Emotion-Free Trading</h3>
              <p className="text-slate-600">
                Bots follow their strategy without fear, greed, or FOMO. They don't chase pumps, panic sell, or overtrade.
              </p>
            </div>

            <div>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
                <Zap className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="mb-3 text-xl font-semibold text-slate-900">Speed & Efficiency</h3>
              <p className="text-slate-600">
                Bots can monitor hundreds of markets simultaneously and execute trades instantly when opportunities arise—24/7, without breaks.
              </p>
            </div>

            <div>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
                <BarChart3 className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="mb-3 text-xl font-semibold text-slate-900">Systematic Risk Management</h3>
              <p className="text-slate-600">
                Position sizing, stop losses, and portfolio rules are consistently applied. No exceptions, no "just this once" decisions.
              </p>
            </div>

            <div>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-amber-100">
                <TrendingUp className="h-6 w-6 text-amber-600" />
              </div>
              <h3 className="mb-3 text-xl font-semibold text-slate-900">Time Savings</h3>
              <p className="text-slate-600">
                Set it and forget it. Check performance weekly instead of monitoring markets hourly. Perfect for busy traders.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Getting Started */}
      <section className="bg-slate-50 px-4 py-16 md:py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-slate-900 md:text-4xl">
            Getting Started with Bots
          </h2>

          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600">
                  1
                </div>
                <div>
                  <h3 className="mb-2 text-lg font-semibold text-slate-900">Create Free Account</h3>
                  <p className="text-sm text-slate-600">
                    Sign up at <Link href="/" className="font-medium text-indigo-600 hover:text-indigo-700">polycopy.app</Link> — no credit card required. Free tier includes access to one bot, premium unlocks all bots.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600">
                  2
                </div>
                <div>
                  <h3 className="mb-2 text-lg font-semibold text-slate-900">Browse Bot Performance</h3>
                  <p className="text-sm text-slate-600">
                    Review real-time performance metrics for each bot. Check P&L, ROI, win rate, trade history, and risk level.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600">
                  3
                </div>
                <div>
                  <h3 className="mb-2 text-lg font-semibold text-slate-900">Follow Bots You Like</h3>
                  <p className="text-sm text-slate-600">
                    Select bots that match your risk tolerance. Follow multiple bots with different strategies for diversification.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600">
                  4
                </div>
                <div>
                  <h3 className="mb-2 text-lg font-semibold text-slate-900">See Bot Trades in Your Feed</h3>
                  <p className="text-sm text-slate-600">
                    Bot trades appear in your feed alongside human trader moves. Copy them manually or upgrade to premium for automatic copying.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600">
                  5
                </div>
                <div>
                  <h3 className="mb-2 text-lg font-semibold text-slate-900">Monitor & Adjust</h3>
                  <p className="text-sm text-slate-600">
                    Track which bots perform well for your goals. Unfollow underperformers, add new bots, adjust your strategy over time.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white px-4 py-16 md:py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-slate-900 md:text-4xl">
            Frequently Asked Questions
          </h2>

          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="what-are-bots" className="rounded-lg border border-slate-200 px-6">
              <AccordionTrigger className="text-left font-semibold text-slate-900 hover:no-underline">
                What are Polymarket trading bots?
              </AccordionTrigger>
              <AccordionContent className="text-slate-600">
                Polymarket trading bots are automated wallets that execute specific trading strategies on Polymarket. Each bot follows predefined rules (like targeting heavy favorites or contrarian plays) and places trades automatically when opportunities match their criteria. You can follow bot trades just like you follow human traders on Polycopy.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="are-bots-free" className="rounded-lg border border-slate-200 px-6">
              <AccordionTrigger className="text-left font-semibold text-slate-900 hover:no-underline">
                Are there free Polymarket bots?
              </AccordionTrigger>
              <AccordionContent className="text-slate-600">
                Yes! Polycopy&apos;s free tier includes access to one trading bot so you can try bot-powered trading at no cost. Premium users ($20/mo) unlock the full lineup of bots across all risk levels and strategies, including advanced ML-powered bots with multi-trader analysis and category specialization.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="how-do-bots-work" className="rounded-lg border border-slate-200 px-6">
              <AccordionTrigger className="text-left font-semibold text-slate-900 hover:no-underline">
                How do Polymarket bots make trading decisions?
              </AccordionTrigger>
              <AccordionContent className="text-slate-600">
                Each bot follows a specific strategy: <strong>Steady Eddie</strong> targets heavy favorites (75%+ probability), <strong>Balanced Play</strong> uses momentum and value indicators for 55-70% markets, and <strong>Full Send</strong> takes contrarian positions on underdogs. Premium ML bots use machine learning to analyze historical data, trader patterns, and market conditions. All bots have systematic position sizing and risk management built in.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="bots-vs-traders" className="rounded-lg border border-slate-200 px-6">
              <AccordionTrigger className="text-left font-semibold text-slate-900 hover:no-underline">
                Should I follow bots or human traders?
              </AccordionTrigger>
              <AccordionContent className="text-slate-600">
                <strong>Both!</strong> Bots provide consistent, emotion-free execution of proven strategies. Human traders offer market insights, timing, and adaptability. Many users follow a mix: bots for systematic strategies and top human traders for high-conviction plays. Diversification across both reduces risk.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="are-bots-profitable" className="rounded-lg border border-slate-200 px-6">
              <AccordionTrigger className="text-left font-semibold text-slate-900 hover:no-underline">
                Are Polymarket bots profitable?
              </AccordionTrigger>
              <AccordionContent className="text-slate-600">
                Bot performance varies by strategy and market conditions. Polycopy shows real-time P&L, ROI, win rate, and trade history for every bot so you can make informed decisions. Conservative bots typically have lower returns but more consistent performance. Aggressive bots have higher variance. <strong>Past performance doesn't guarantee future results.</strong> All trading involves risk.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="how-to-start" className="rounded-lg border border-slate-200 px-6">
              <AccordionTrigger className="text-left font-semibold text-slate-900 hover:no-underline">
                How do I start using Polymarket bots?
              </AccordionTrigger>
              <AccordionContent className="text-slate-600">
                1) Create a free account at polycopy.app (no credit card), 2) Go to the <Link href="/v2/bots" className="font-medium text-indigo-600">Bots page</Link> and review performance, 3) Follow bots that match your risk tolerance, 4) See bot trades in your feed, 5) Copy trades manually or upgrade to Premium for automatic copying. Start with one conservative bot to understand how they work.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="bot-risks" className="rounded-lg border border-slate-200 px-6">
              <AccordionTrigger className="text-left font-semibold text-slate-900 hover:no-underline">
                What are the risks of using trading bots?
              </AccordionTrigger>
              <AccordionContent className="text-slate-600">
                <strong>All trading involves risk of loss.</strong> Bots can lose money, especially in volatile or unpredictable market conditions. They follow systematic strategies but cannot adapt to unprecedented events like humans can. Risks include: strategy underperformance, market volatility, technical issues, and overtrading. Always start with small position sizes and only risk capital you can afford to lose. Diversify across multiple bots and strategies.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="premium-bots" className="rounded-lg border border-slate-200 px-6">
              <AccordionTrigger className="text-left font-semibold text-slate-900 hover:no-underline">
                What's different about Premium ML bots?
              </AccordionTrigger>
              <AccordionContent className="text-slate-600">
                Premium ML bots use machine learning trained on 500K+ trader histories and millions of historical trades. They identify patterns humans miss, adapt to changing market conditions, and combine signals from multiple top traders. Premium bots include category specialists (sports-only, politics-only, etc.) and multi-strategy bots that optimize for risk-adjusted returns. They typically have higher Sharpe ratios and better drawdown management than simple rule-based bots.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-br from-indigo-600 to-purple-600 px-4 py-16 text-white md:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-6 text-3xl font-bold md:text-4xl">
            Ready to Try Polymarket Bots?
          </h2>
          <p className="mb-8 text-lg text-indigo-100">
            Try a bot for free. No credit card required.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button asChild size="lg" className="bg-[#FDB022] text-slate-900 hover:bg-[#E69E1A] font-semibold">
              <Link href="/v2/bots">
                View Live Bots
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20">
              <Link href="/how-to-copy-trade-polymarket">Learn How It Works</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="bg-amber-50 border-t border-amber-200 px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex gap-4">
            <div className="shrink-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
                <span className="text-lg">⚠️</span>
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-amber-900">
                Important Disclaimer
              </h3>
              <p className="text-sm leading-relaxed text-amber-900">
                <strong>This is not financial advice.</strong> Polycopy is a tool for tracking and copying trades. All trading involves risk of loss. Past performance of bots or traders does not guarantee future results. Bot strategies may underperform or lose money, especially during market volatility or unprecedented events. Only trade with capital you can afford to lose. Polycopy is not responsible for trading losses. Users are responsible for their own trading decisions.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
