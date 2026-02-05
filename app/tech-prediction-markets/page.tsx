'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ArrowRight, Laptop, AlertCircle, TrendingUp, Target, Brain, CheckCircle2, X } from 'lucide-react';
import { getTraderAvatarInitials } from '@/lib/trader-name';
import { Navigation } from '@/components/polycopy/navigation';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

interface Trader {
  wallet: string;
  displayName: string;
  pnl: number;
  volume: number;
  roi?: number;
  profileImage?: string | null;
}

function formatLargeNumber(num: number): string {
  const absNum = Math.abs(num);
  if (absNum >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  else if (absNum >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

function formatDisplayName(name: string | null | undefined): string {
  const candidate = (name ?? '').trim();
  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(candidate);
  if (!candidate || isAddress) return 'Trader';
  return candidate;
}

export default function TechPredictionMarketsPage() {
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

    fetch('/api/polymarket/leaderboard?limit=10&orderBy=PNL&category=TECH&timePeriod=month')
      .then(res => res.json())
      .then(data => {
        const tradersWithROI = (data.traders || []).map((t: Trader) => ({
          ...t,
          roi: t.volume > 0 ? ((t.pnl / t.volume) * 100) : 0
        }));
        setTraders(tradersWithROI);
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
        <div className="max-w-4xl mx-auto px-4 py-16 md:py-24 text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-100 text-indigo-800 px-4 py-2 rounded-full text-sm font-semibold mb-6">
            <Laptop className="w-4 h-4" />
            Tech Markets
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">Tech Prediction Markets</h1>
          <p className="text-xl text-slate-600 mb-8 leading-relaxed max-w-3xl mx-auto">
            Trade AI breakthroughs, product launches, startup acquisitions, tech policy, and Silicon Valley events on Polymarket. Follow tech insiders who profit from industry moves.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="https://polycopy.app">
              <Button size="lg" className="bg-polycopy-yellow hover:bg-polycopy-yellow/90 text-slate-900 font-semibold px-8 h-12">
                Follow Tech Traders <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/discover?category=TECH">
              <Button size="lg" variant="outline" className="font-semibold px-8 h-12">Browse Tech Markets</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">Top Tech Traders (Last 30 Days)</h2>
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-polycopy-yellow border-r-transparent"></div>
              <p className="mt-4 text-slate-600">Loading...</p>
            </div>
          ) : traders.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-6">
              {traders.map((trader, i) => (
                <Link key={trader.wallet} href={`/trader/${trader.wallet}`} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Avatar className="h-12 w-12 border-2 border-white shadow-sm">
                      {trader.profileImage && <AvatarImage src={trader.profileImage} alt={trader.displayName} />}
                      <AvatarFallback className="bg-indigo-100 text-indigo-700 font-semibold">
                        {getTraderAvatarInitials({ displayName: trader.displayName, wallet: trader.wallet })}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-slate-900">{formatDisplayName(trader.displayName)}</p>
                      <p className="text-sm text-slate-500">Rank #{i + 1}</p>
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
                      <p className={`text-lg font-semibold ${trader.pnl > 0 ? 'text-emerald-600' : 'text-slate-900'}`}>{formatLargeNumber(trader.pnl)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Volume</p>
                      <p className="text-lg font-semibold text-slate-900">{formatLargeNumber(trader.volume)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : <p className="text-center text-slate-500">No tech traders found.</p>}
          
          <div className="mt-8 text-center">
            <Link href="/discover?category=TECH">
              <Button variant="outline" size="lg" className="font-semibold">
                View All Tech Traders
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Why Trade Tech Prediction Markets?</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                <Laptop className="w-5 h-5 text-indigo-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Fast-Moving Industry</h3>
              <p className="text-slate-700 leading-relaxed">
                AI launches, startup pivots, policy shifts - tech moves fast. If you follow the industry, you can spot trends before the market catches up.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Public Announcements</h3>
              <p className="text-slate-700 leading-relaxed">
                Product launches, earnings, keynotes - tech companies announce everything publicly. Follow the right sources and you'll see moves coming.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                <Target className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Follow Industry Insiders</h3>
              <p className="text-slate-700 leading-relaxed">
                Some traders work in tech or have deep expertise. Follow them to see how they're positioning and copy trades you understand.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                <Brain className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">High-Impact Events</h3>
              <p className="text-slate-700 leading-relaxed">
                GPT-5 release, Apple product announcements, antitrust rulings - tech markets resolve around events that dominate headlines.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Popular Tech Markets on Polymarket</h2>
          <div className="space-y-6">
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">AI Model Releases</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Will OpenAI release GPT-5 by Q4? Will Google's next model beat GPT-4? AI launches are heavily traded, with clear resolution dates.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> AI development timelines leak via researchers, papers, and corporate earnings calls.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Big Tech Earnings & Guidance</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Will Apple beat revenue estimates? Will Meta raise guidance? Earnings markets track Wall Street expectations.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Analyst consensus provides a baseline. Options markets and sell-side research offer clues.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Product Launches (Apple, Tesla, etc.)</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Will Apple announce a new product at WWDC? Will Tesla launch FSD nationwide? Product rumors circulate for months before announcements.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Leaks from supply chains, patent filings, and insider reports provide early signals.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Antitrust & Regulation</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Will Google be broken up? Will TikTok be banned? Regulatory outcomes have major implications for Big Tech valuations.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Court filings and congressional hearings provide updates on regulatory timelines.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Startup Acquisitions</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Will Microsoft acquire this AI startup? Will the deal close? M&A markets in tech move on insider reports and deal announcements.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Tech M&A often leaks before official press releases, creating trading opportunities.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Tech Trading Strategies</h2>
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border-l-4 border-emerald-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Developer Community Signals</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                Track GitHub commits, API docs, beta releases. If OpenAI's API docs update with GPT-5 references, a launch is coming. Developer signals often leak before official announcements.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Example:</strong> GPT-5 API documentation appears. The "GPT-5 by Q4" market is at 40%. Buy before the market adjusts.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-blue-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Supply Chain Tracking</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                Monitor manufacturing reports, component orders, shipping data. If Apple's suppliers report increased orders, a product launch is likely. Supply chains move before announcements.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Best for:</strong> Traders who follow tech supply chain news from Taiwan, China, and major component suppliers.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-purple-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Conference & Earnings Call Analysis</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                Listen to CEO tone on earnings calls. Are they confident about product timelines? Do they hedge on launch dates? Subtle language shifts predict delays or accelerations.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Example:</strong> Tim Cook says "we're excited about what's coming." Product launch odds should increase.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-amber-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Copy Tech Insiders</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                Some Polycopy traders work in tech or have specialized knowledge of AI, semiconductors, or enterprise software. Follow them to see their bets.
              </p>
              <Link href="/copy-trading">
                <Button variant="outline" size="sm" className="text-polycopy-yellow border-polycopy-yellow hover:bg-polycopy-yellow/10">
                  Learn About Copy Trading <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Tips for Tech Market Traders</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Follow Tech Twitter & Substacks</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  Tech news breaks first on Twitter. Follow insiders, journalists, and researchers who tweet leaks before press releases.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Track Patent Filings</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  Apple, Google, and other Big Tech file patents months before product launches. Patent filings often reveal what's coming.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Monitor Developer Betas</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  Beta releases hint at launch timelines. If iOS 18 beta 5 drops in August, the public release is coming in September.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-amber-50 border-l-4 border-amber-500 p-5 rounded-r-lg">
              <X className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Don't Trust Every Rumor</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  "I saw a leak on Reddit..." is not research. Verify tech rumors with established journalists and sources before trading.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Common Mistakes in Tech Markets</h2>
          <div className="space-y-4">
            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Overvaluing Hype Cycles</h3>
                  <p className="text-slate-700 leading-relaxed">
                    "Everyone's talking about this AI launch, so it must happen!" Hype doesn't equal certainty. Trade timelines and fundamentals, not excitement.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Ignoring Regulatory Risk</h3>
                  <p className="text-slate-700 leading-relaxed">
                    "This product will definitely launch." Not if regulators block it. Factor in antitrust, privacy rules, and policy risk.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Assuming "Elon Time" Is Real Time</h3>
                  <p className="text-slate-700 leading-relaxed">
                    Some CEOs are notoriously optimistic with timelines. If Elon says "by year-end," factor in historical delays before betting yes.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-gradient-to-b from-slate-50 to-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">Ready to Trade Tech Markets?</h2>
          <p className="text-xl text-slate-600 mb-4 leading-relaxed">
            Follow tech experts, see their strategies live, and start copying profitable plays.
          </p>
          <p className="text-lg text-slate-600 mb-8 leading-relaxed">
            Interested in other markets? <Link href="/polymarket-market-categories" className="text-polycopy-yellow hover:underline font-semibold">Explore all categories</Link>.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="https://polycopy.app">
              <Button size="lg" className="bg-polycopy-yellow hover:bg-polycopy-yellow/90 text-slate-900 font-semibold px-8 h-12">
                Get Started Free <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/polymarket-trading-strategies">
              <Button size="lg" variant="outline" className="font-semibold px-8 h-12">
                View All Strategies
              </Button>
            </Link>
          </div>
          <p className="text-sm text-slate-500 mt-6">
            Free to browse tech traders. No credit card required.
          </p>
        </div>
      </section>

      <section className="py-8 bg-slate-100 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-600 leading-relaxed">
              <strong>Not Financial Advice:</strong> Tech prediction market trading involves risk. Past technology outcomes do not guarantee future results. Only trade with funds you can afford to lose.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
