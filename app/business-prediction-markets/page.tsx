'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ArrowRight, Building2, AlertCircle, TrendingUp, Target, Brain, CheckCircle2, X } from 'lucide-react';
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

export default function BusinessPredictionMarketsPage() {
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

    fetch('/api/polymarket/leaderboard?limit=10&orderBy=PNL&category=FINANCE&timePeriod=month')
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
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-800 px-4 py-2 rounded-full text-sm font-semibold mb-6">
            <Building2 className="w-4 h-4" />
            Business & Finance Markets
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">Business & Finance Prediction Markets</h1>
          <p className="text-xl text-slate-600 mb-8 leading-relaxed max-w-3xl mx-auto">
            Trade IPOs, mergers, acquisitions, CEO changes, product launches, corporate events, and financial markets on Polymarket. Follow business and finance experts who profit from these outcomes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="https://polycopy.app">
              <Button size="lg" className="bg-polycopy-yellow hover:bg-polycopy-yellow/90 text-slate-900 font-semibold px-8 h-12">
                Follow Business Traders <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/discover?category=FINANCE">
              <Button size="lg" variant="outline" className="font-semibold px-8 h-12">Browse Business Markets</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">Top Business & Finance Traders (Last 30 Days)</h2>
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
                      <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold">
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
          ) : <p className="text-center text-slate-500">No business traders found.</p>}
          
          <div className="mt-8 text-center">
            <Link href="/discover?category=FINANCE">
              <Button variant="outline" size="lg" className="font-semibold">
                View All Business Traders
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Why Trade Business & Finance Prediction Markets?</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Binary Corporate Events</h3>
              <p className="text-slate-700 leading-relaxed">
                Will this merger get approved? Will the CEO step down? Will the IPO happen by Q4? Clean yes/no outcomes make business markets easier to trade.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Public Information</h3>
              <p className="text-slate-700 leading-relaxed">
                SEC filings, earnings reports, press releases - business data is transparent. If you can read financial news, you can find edges.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                <Target className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Follow Industry Insiders</h3>
              <p className="text-slate-700 leading-relaxed">
                Some traders have deep knowledge of specific industries (tech, pharma, finance). Follow them to see their plays and copy trades you understand.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                <Brain className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Predictable Timelines</h3>
              <p className="text-slate-700 leading-relaxed">
                Earnings dates, merger deadlines, product launch windows - business events have known timelines, making it easier to plan your trades.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Popular Business & Finance Markets on Polymarket</h2>
          <div className="space-y-6">
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">IPOs & Public Listings</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Will Company X go public by end of year? Will the IPO price above/below $50? Markets exist for major listings and SPAC deals.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> IPO timelines are trackable, and S-1 filings provide clear data points.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Mergers & Acquisitions</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Will the acquisition be approved by regulators? Will the deal close by the deadline? M&A events have clear resolutions.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Deal terms are public, regulatory approvals follow precedent, spreads are measurable.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">CEO Changes & Executive Moves</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Will the CEO step down? Will the founder return? Leadership changes create trading opportunities, especially at high-profile companies.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Insider reports often leak before official announcements, creating edges for informed traders.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Product Launches & Releases</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Will Apple release a new product this year? Will Tesla hit production targets? Launch timelines and production metrics are trackable.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Supply chain reports, patent filings, and earnings calls provide early signals.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Bankruptcy & Restructuring</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Will the company file for Chapter 11? Will creditors approve the restructuring plan? Distressed situations create high-volatility markets.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Court filings are public, and restructuring timelines follow predictable legal processes.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Business & Finance Trading Strategies</h2>
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border-l-4 border-emerald-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Regulatory Precedent Analysis</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                FTC/SEC decisions follow patterns. Study how regulators have ruled on similar deals in the past. If the market hasn't priced in historical precedent, there's an edge.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Example:</strong> A proposed merger is similar to 5 past deals that all got approved. If the market is pricing it at 60% approval, buy.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-blue-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Earnings Call Sentiment</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                Listen to CEO tone on earnings calls. Are they confident about hitting guidance? Does leadership sound unstable? Markets might not have priced in subtle signals.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Best for:</strong> Traders who can analyze earnings transcripts and act on qualitative signals before markets adjust.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-purple-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Supply Chain Tracking</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                Monitor production reports, shipping data, factory output. If early data suggests a product launch will be delayed, the market might not have caught up yet.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Example:</strong> A key supplier reports component shortages. The product launch market is still at 70% on-time. Short it.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-amber-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Copy Industry Experts</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                Some Polycopy traders specialize in specific industries (pharma, tech, energy). Follow them to see their trades and copy the ones you understand.
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
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Tips for Business & Finance Market Traders</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Follow Bloomberg & WSJ</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  Business news breaks first on major financial outlets. Set up alerts for companies you're tracking to catch announcements early.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Read SEC Filings</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  S-1s, 8-Ks, 10-Qs - public filings contain material information. If you can read them before markets react, you have an edge.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Study Historical Deals</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  How have similar mergers been treated by regulators? How long did past IPOs take? Historical data predicts future outcomes.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-amber-50 border-l-4 border-amber-500 p-5 rounded-r-lg">
              <X className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Don't Trade Based on Hype</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  "This IPO will be huge!" is not a strategy. Trade fundamentals and timelines, not excitement.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Common Mistakes in Business & Finance Markets</h2>
          <div className="space-y-4">
            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Ignoring Regulatory Risk</h3>
                  <p className="text-slate-700 leading-relaxed">
                    "The deal makes business sense, so it'll definitely close." Not if regulators block it. Always factor in antitrust and regulatory approval odds.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Overweighting Rumors</h3>
                  <p className="text-slate-700 leading-relaxed">
                    "I heard from a friend that..." is not due diligence. Verify business news with official sources before trading.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Assuming "Too Big to Fail"</h3>
                  <p className="text-slate-700 leading-relaxed">
                    "This company is huge, so the deal will definitely happen." Size doesn't guarantee outcomes. Trade the probabilities, not assumptions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-gradient-to-b from-slate-50 to-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">Ready to Trade Business & Finance Markets?</h2>
          <p className="text-xl text-slate-600 mb-4 leading-relaxed">
            Follow industry experts, see their strategies live, and start copying profitable plays.
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
            Free to browse business traders. No credit card required.
          </p>
        </div>
      </section>

      <section className="py-8 bg-slate-100 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-600 leading-relaxed">
              <strong>Not Financial Advice:</strong> Business and finance prediction market trading involves risk. Past outcomes do not guarantee future results. Only trade with funds you can afford to lose.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
