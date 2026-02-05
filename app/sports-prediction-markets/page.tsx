'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ArrowRight, TrendingUp, Trophy, Target, AlertCircle, CheckCircle2, Users } from 'lucide-react';
import { getTraderAvatarInitials } from '@/lib/trader-name';
import { Navigation } from '@/components/polycopy/navigation';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

interface Trader {
  wallet: string;
  displayName: string;
  pnl: number;
  winRate: number;
  totalTrades: number;
  volume: number;
  rank: number;
  followerCount: number;
  roi?: number;
  profileImage?: string | null;
}

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

function formatDisplayName(name: string | null | undefined, wallet?: string): string {
  const candidate = (name ?? '').trim();
  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(candidate);
  if (!candidate || isAddress) {
    return 'Trader';
  }
  return candidate;
}

export default function SportsPredictionMarketsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        Promise.all([
          supabase.from('profiles').select('is_premium, profile_image_url').eq('id', session.user.id).single(),
          supabase.from('turnkey_wallets').select('polymarket_account_address, eoa_address').eq('user_id', session.user.id).maybeSingle()
        ]).then(([profileRes, walletRes]) => {
          setIsPremium(profileRes.data?.is_premium || false);
          setProfileImageUrl(profileRes.data?.profile_image_url || null);
          setWalletAddress(walletRes.data?.polymarket_account_address || walletRes.data?.eoa_address || null);
        });
      }
    });

    const fetchTraders = async () => {
      try {
        const response = await fetch(
          '/api/polymarket/leaderboard?limit=10&orderBy=PNL&category=SPORTS&timePeriod=month'
        );
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        const tradersWithROI = (data.traders || []).map((trader: Trader) => ({
          ...trader,
          roi: trader.volume > 0 ? ((trader.pnl / trader.volume) * 100) : 0
        }));
        setTraders(tradersWithROI);
      } catch (error) {
        console.error('Error fetching traders:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTraders();
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
      <section className="bg-gradient-to-b from-slate-50 to-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-16 md:py-24">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 px-4 py-2 rounded-full text-sm font-semibold mb-6">
              <Trophy className="w-4 h-4" />
              Sports Markets
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
              Sports Prediction Markets
            </h1>
            <p className="text-xl text-slate-600 mb-8 leading-relaxed max-w-3xl mx-auto">
              Trade NFL, NBA, soccer, and more on Polymarket. Follow top sports traders, see their strategies in real-time, and copy profitable plays.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="https://polycopy.app">
                <Button size="lg" className="bg-polycopy-yellow hover:bg-polycopy-yellow/90 text-slate-900 font-semibold text-base px-8 h-12">
                  Follow Sports Traders
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/discover?category=SPORTS">
                <Button size="lg" variant="outline" className="font-semibold text-base px-8 h-12">
                  Browse Sports Markets
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Top Sports Traders */}
      <section className="py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 text-center">
              Top Sports Traders (Last 30 Days)
            </h2>
            <p className="text-lg text-slate-600 text-center max-w-2xl mx-auto">
              These traders consistently profit from sports markets. See their strategies and follow them.
            </p>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-polycopy-yellow border-r-transparent"></div>
              <p className="mt-4 text-slate-600">Loading top sports traders...</p>
            </div>
          ) : traders.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-6">
              {traders.map((trader, index) => (
                <Link
                  key={trader.wallet}
                  href={`/trader/${trader.wallet}`}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-6"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12 border-2 border-white shadow-sm">
                        {trader.profileImage ? (
                          <AvatarImage src={trader.profileImage} alt={trader.displayName} />
                        ) : null}
                        <AvatarFallback className="bg-emerald-100 text-emerald-700 font-semibold">
                          {getTraderAvatarInitials({ displayName: trader.displayName, wallet: trader.wallet })}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold text-slate-900">
                          {formatDisplayName(trader.displayName, trader.wallet)}
                        </p>
                        <p className="text-sm text-slate-500">Rank #{index + 1}</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">ROI</p>
                      <p className={`text-lg font-semibold ${trader.roi && trader.roi > 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {trader.roi && trader.roi > 0 ? '+' : ''}{trader.roi?.toFixed(1) || 0}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">P&L</p>
                      <p className={`text-lg font-semibold ${trader.pnl > 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {formatLargeNumber(trader.pnl)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Volume</p>
                      <p className="text-lg font-semibold text-slate-900">
                        {formatLargeNumber(trader.volume)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <p>No sports traders found. Check back soon!</p>
            </div>
          )}

          <div className="mt-8 text-center">
            <Link href="/discover?category=SPORTS">
              <Button variant="outline" size="lg" className="font-semibold">
                View All Sports Traders
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Why Trade Sports Markets */}
      <section className="py-16 md:py-20 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Why Trade Sports Prediction Markets?
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                <Target className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Profit from Sports Knowledge</h3>
              <p className="text-slate-700 leading-relaxed">
                If you follow leagues closely, you can spot mispriced markets before the broader market catches up. Your knowledge has value.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Better Odds Than Sportsbooks</h3>
              <p className="text-slate-700 leading-relaxed">
                Prediction markets often have better odds than traditional sportsbooks, with no vig or hidden fees. You see exactly what the market believes.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                <Users className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Trade Unconventional Props</h3>
              <p className="text-slate-700 leading-relaxed">
                Polymarket has markets for player awards, coaching changes, team records, and obscure props that sportsbooks don't offer.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                <Trophy className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Follow Expert Traders</h3>
              <p className="text-slate-700 leading-relaxed">
                See what experienced sports traders are doing in real-time. Learn from their strategies and copy profitable plays.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Sports Markets */}
      <section className="py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Popular Sports Markets on Polymarket
          </h2>
          <div className="space-y-6">
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">NFL</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Super Bowl winner, playoff outcomes, MVP awards, team win totals, coaching changes.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Best for:</strong> Traders who follow NFL closely and can analyze team performance, injuries, and matchups.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">NBA</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Championship winner, conference champions, MVP, player trades, team records.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Best for:</strong> Basketball fans who track stats, injuries, and front-office moves.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Soccer / Football</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                World Cup, Premier League, Champions League, player transfers, tournament outcomes.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Best for:</strong> Global soccer fans with knowledge of European leagues and international tournaments.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Other Sports</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                MLB, NHL, NCAA, golf majors, tennis Grand Slams, Olympics, F1, boxing, MMA.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Best for:</strong> Specialists with deep knowledge in these leagues.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Sports Trading Strategies */}
      <section className="py-16 md:py-20 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Winning Sports Trading Strategies
          </h2>
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border-l-4 border-emerald-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Injury-Based Trading</h3>
              <p className="text-slate-700 leading-relaxed">
                When a key player gets injured, the market takes time to adjust. Fast traders who catch the news early can profit before the odds shift.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-blue-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Early Season Overreactions</h3>
              <p className="text-slate-700 leading-relaxed">
                Markets overreact to small sample sizes. A team starts 0-2? Their championship odds tank. Smart traders fade the noise and buy low on quality teams with slow starts.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-purple-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Playoff Hedging</h3>
              <p className="text-slate-700 leading-relaxed">
                Bought a team to win the championship at long odds? As they advance through the playoffs, hedge by shorting them or buying their opponents. Lock in profit regardless of outcome.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-amber-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Copy Expert Sports Traders</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                The easiest strategy: follow profitable sports traders on Polycopy and copy their plays. You gain exposure while learning their strategies.
              </p>
              <Link href="/copy-trading">
                <Button variant="outline" size="sm" className="text-polycopy-yellow border-polycopy-yellow hover:bg-polycopy-yellow/10">
                  Learn About Copy Trading
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Tips for Sports Traders */}
      <section className="py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Tips for Sports Traders
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Specialize in 1-2 Leagues</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  Don't try to trade every sport. Focus on leagues you genuinely follow. Depth beats breadth.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Follow Breaking News</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  Injuries, trades, coaching changes - the market is slow to react. Set up alerts so you're among the first to know.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Don't Bet on Your Favorite Team</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  Bias kills profitability. Trade what you think will happen, not what you hope will happen.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-amber-50 border-l-4 border-amber-500 p-5 rounded-r-lg">
              <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Be Wary of Longshots</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  A 100-to-1 underdog isn't free money just because the odds are long. Markets are usually efficient. If something looks too good to be true, it probably is.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Common Mistakes */}
      <section className="py-16 md:py-20 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Common Mistakes in Sports Markets
          </h2>
          <div className="space-y-4">
            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Betting with Your Heart, Not Your Head</h3>
                  <p className="text-slate-700 leading-relaxed">
                    "My team is due for a win!" No. Markets don't care about narratives or fandom. Trade objectively or lose money.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Overreacting to Small Samples</h3>
                  <p className="text-slate-700 leading-relaxed">
                    A team starts 0-3 and you write them off for the season. But it's only 3 games. Don't overweight noise.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Ignoring Injury Reports</h3>
                  <p className="text-slate-700 leading-relaxed">
                    A star player is questionable for tonight's game. You don't check the injury report and bet anyway. Bad process = bad results.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Chasing Losses</h3>
                  <p className="text-slate-700 leading-relaxed">
                    You lose a bet and immediately double down to "win it back." This is how you blow up your account. Stick to your strategy.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-20 bg-gradient-to-b from-slate-50 to-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
            Ready to Trade Sports Markets?
          </h2>
          <p className="text-xl text-slate-600 mb-4 leading-relaxed">
            Follow top sports traders, see their strategies live, and start copying profitable plays.
          </p>
          <p className="text-lg text-slate-600 mb-8 leading-relaxed">
            Interested in other markets? <Link href="/polymarket-market-categories" className="text-polycopy-yellow hover:underline font-semibold">Explore all categories</Link>.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="https://polycopy.app">
              <Button size="lg" className="bg-polycopy-yellow hover:bg-polycopy-yellow/90 text-slate-900 font-semibold text-base px-8 h-12">
                Get Started Free
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/top-traders">
              <Button size="lg" variant="outline" className="font-semibold text-base px-8 h-12">
                Browse All Traders
              </Button>
            </Link>
          </div>
          <p className="text-sm text-slate-500 mt-6">
            Free to browse sports traders. No credit card required.
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="py-8 bg-slate-100 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-600 leading-relaxed">
              <strong>Not Financial Advice:</strong> Sports prediction market trading involves risk. Past performance does not guarantee future results. Only trade with funds you can afford to lose.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
