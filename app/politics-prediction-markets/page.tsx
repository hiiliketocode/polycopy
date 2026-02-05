'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ArrowRight, TrendingUp, Vote, Target, AlertCircle, CheckCircle2, Users, Brain, X } from 'lucide-react';
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
  if (absNum >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  else if (absNum >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  else return `$${num.toFixed(0)}`;
}

function formatDisplayName(name: string | null | undefined, wallet?: string): string {
  const candidate = (name ?? '').trim();
  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(candidate);
  if (!candidate || isAddress) return 'Trader';
  return candidate;
}

export default function PoliticsPredictionMarketsPage() {
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
        const response = await fetch('/api/polymarket/leaderboard?limit=10&orderBy=PNL&category=POLITICS&timePeriod=month');
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
      <section className="bg-gradient-to-b from-slate-50 to-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-16 md:py-24">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-800 px-4 py-2 rounded-full text-sm font-semibold mb-6">
              <Vote className="w-4 h-4" />
              Politics Markets
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
              Politics Prediction Markets
            </h1>
            <p className="text-xl text-slate-600 mb-8 leading-relaxed max-w-3xl mx-auto">
              Trade elections, policy outcomes, and political events on Polymarket. Follow expert politics traders and copy their strategies.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="https://polycopy.app">
                <Button size="lg" className="bg-polycopy-yellow hover:bg-polycopy-yellow/90 text-slate-900 font-semibold text-base px-8 h-12">
                  Follow Politics Traders
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/discover?category=POLITICS">
                <Button size="lg" variant="outline" className="font-semibold text-base px-8 h-12">
                  Browse Politics Markets
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 text-center">
              Top Politics Traders (Last 30 Days)
            </h2>
            <p className="text-lg text-slate-600 text-center max-w-2xl mx-auto">
              Follow the traders who consistently profit from political markets.
            </p>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-polycopy-yellow border-r-transparent"></div>
              <p className="mt-4 text-slate-600">Loading top politics traders...</p>
            </div>
          ) : traders.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-6">
              {traders.map((trader, index) => (
                <Link key={trader.wallet} href={`/trader/${trader.wallet}`} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12 border-2 border-white shadow-sm">
                        {trader.profileImage && <AvatarImage src={trader.profileImage} alt={trader.displayName} />}
                        <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold">
                          {getTraderAvatarInitials({ displayName: trader.displayName, wallet: trader.wallet })}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold text-slate-900">{formatDisplayName(trader.displayName, trader.wallet)}</p>
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
                      <p className="text-lg font-semibold text-slate-900">{formatLargeNumber(trader.volume)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <p>No politics traders found. Check back soon!</p>
            </div>
          )}

          <div className="mt-8 text-center">
            <Link href="/discover?category=POLITICS">
              <Button variant="outline" size="lg" className="font-semibold">
                View All Politics Traders
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Why Trade Politics Markets?
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Most Accurate Election Forecasts</h3>
              <p className="text-slate-700 leading-relaxed">
                Prediction markets historically outperform polls and pundits. Markets aggregate diverse information and update in real-time as news breaks.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Profit from Political Knowledge</h3>
              <p className="text-slate-700 leading-relaxed">
                If you follow politics closely and can spot mispriced markets, you can profit while others are still debating on Twitter.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Hedge Real-World Risk</h3>
              <p className="text-slate-700 leading-relaxed">
                Business affected by policy outcomes? Hedge your risk by trading political markets tied to regulation, taxes, or spending.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Trade Beyond Presidential Elections</h3>
              <p className="text-slate-700 leading-relaxed">
                Senate races, gubernatorial elections, ballot measures, cabinet appointments, policy passage - there's a market for everything.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Popular Politics Markets on Polymarket
          </h2>
          <div className="space-y-6">
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Presidential Elections</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Who will win the presidency? Electoral college outcomes, swing state results, primary winners.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Highest volume markets. Polls, fundraising data, and historical precedent provide baseline forecasts.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Congressional Races</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Senate control, House control, specific competitive races. Lower-profile races can be mispriced.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Less media attention = more opportunities for informed traders who track local races.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Policy & Legislation</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Will a bill pass? Will the Fed raise rates? Will the Supreme Court overturn a ruling? Policy markets resolve based on official actions.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Congressional vote counts and procedural rules make outcomes more predictable than elections.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Cabinet & Appointments</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Who will be nominated? Will the Senate confirm? Political appointments create short-term trading opportunities.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Insider reports and political betting markets provide early signals before official announcements.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">International Politics</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                UK elections, French elections, EU referendums, leadership changes in major democracies.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Global traders bring diverse perspectives, creating opportunities for those with local knowledge.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Political Trading Strategies
          </h2>
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border-l-4 border-blue-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Poll Aggregation & Weighting</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                Not all polls are created equal. Weight by pollster quality, sample size, and recency. If you can aggregate better than the market, you'll spot mispricing.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Example:</strong> Five A+ polls show candidate leading by 4 points. Market is at 50/50. Buy the leader.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-purple-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Debate & Event-Based Trading</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                Markets move after debates, scandal drops, primary results, and major speeches. Fast traders who watch events live can profit before the broader market adjusts.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Best for:</strong> Traders who can watch political events in real-time and react quickly to major shifts.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-emerald-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">State-by-State Electoral Analysis</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                Build your own electoral college model. Sometimes the national market is correct but specific swing state markets are mispriced. Arbitrage the difference.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Example:</strong> Pennsylvania market shows Dem at 60%. National market shows Dem at 45%. One of these is wrong.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-amber-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Copy Politics Experts</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                Some Polycopy traders specialize in politics and have built sophisticated forecasting models. Follow them to see their positioning.
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

      <section className="py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Tips for Politics Market Traders
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Track High-Quality Polls</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  Focus on A+ and A-rated pollsters. Ignore partisan polls and low-quality surveys. Quality over quantity.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Understand Electoral Mechanics</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  Electoral college, Senate confirmations, filibuster rules - procedural details matter. Know how the system works.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Watch Early & Absentee Voting Data</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  Early vote numbers provide clues before election day. If one party is overperforming historical norms, markets may not have adjusted yet.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-amber-50 border-l-4 border-amber-500 p-5 rounded-r-lg">
              <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Don't Trade Your Political Bias</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  You want your candidate to win. The market doesn't care. Trade objectively or lose money.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Common Mistakes in Politics Markets
          </h2>
          <div className="space-y-4">
            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Trading Based on Twitter Sentiment</h3>
                  <p className="text-slate-700 leading-relaxed">
                    "Everyone on Twitter is talking about X, so they'll definitely win!" Twitter is not representative. Use polls and data, not social media vibes.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Overweighting Single Polls</h3>
                  <p className="text-slate-700 leading-relaxed">
                    One poll shows a 10-point swing. You trade it immediately. But it's an outlier. Wait for confirmation from other high-quality polls.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Ignoring Base Rates</h3>
                  <p className="text-slate-700 leading-relaxed">
                    "This time is different!" Maybe. But incumbents usually have an advantage. Generic ballot polls are predictive. Don't bet against history without strong evidence.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Betting on Chaos</h3>
                  <p className="text-slate-700 leading-relaxed">
                    "Something crazy could happen!" Yes, but low-probability events are low-probability for a reason. Don't bet on long-shot scenarios just because they'd be interesting.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-gradient-to-b from-slate-50 to-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
            Start Trading Politics Markets
          </h2>
          <p className="text-xl text-slate-600 mb-4 leading-relaxed">
            Follow expert politics traders and copy their strategies in real-time.
          </p>
          <p className="text-lg text-slate-600 mb-8 leading-relaxed">
            Interested in other markets? <Link href="/polymarket-market-categories" className="text-polycopy-yellow hover:underline font-semibold">Explore all categories</Link>.
          </p>
          <Link href="https://polycopy.app">
            <Button size="lg" className="bg-polycopy-yellow hover:bg-polycopy-yellow/90 text-slate-900 font-semibold text-base px-8 h-12">
              Get Started Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      <section className="py-8 bg-slate-100 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-600 leading-relaxed">
              <strong>Not Financial Advice:</strong> Political prediction market trading involves risk. Past performance does not guarantee future results. Only trade with funds you can afford to lose.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
