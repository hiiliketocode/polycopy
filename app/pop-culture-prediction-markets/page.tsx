'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ArrowRight, Sparkles, AlertCircle, TrendingUp, Target, Brain, CheckCircle2, X } from 'lucide-react';
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

export default function PopCulturePredictionMarketsPage() {
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

    fetch('/api/polymarket/leaderboard?limit=10&orderBy=PNL&category=POP_CULTURE&timePeriod=month')
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
          <div className="inline-flex items-center gap-2 bg-pink-100 text-pink-800 px-4 py-2 rounded-full text-sm font-semibold mb-6">
            <Sparkles className="w-4 h-4" />
            Pop Culture Markets
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">Pop Culture Prediction Markets</h1>
          <p className="text-xl text-slate-600 mb-8 leading-relaxed max-w-3xl mx-auto">
            Trade Oscars, Grammys, celebrity events, TV shows, movies, and viral trends on Polymarket. Follow pop culture experts who profit from entertainment outcomes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="https://polycopy.app">
              <Button size="lg" className="bg-polycopy-yellow hover:bg-polycopy-yellow/90 text-slate-900 font-semibold px-8 h-12">
                Follow Pop Culture Traders <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/discover?category=POP_CULTURE">
              <Button size="lg" variant="outline" className="font-semibold px-8 h-12">Browse Pop Culture Markets</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">Top Pop Culture Traders (Last 30 Days)</h2>
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
                      <AvatarFallback className="bg-pink-100 text-pink-700 font-semibold">
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
          ) : <p className="text-center text-slate-500">No pop culture traders found.</p>}
          
          <div className="mt-8 text-center">
            <Link href="/discover?category=POP_CULTURE">
              <Button variant="outline" size="lg" className="font-semibold">
                View All Pop Culture Traders
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Why Trade Pop Culture Prediction Markets?</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center mb-4">
                <Sparkles className="w-5 h-5 text-pink-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Awards Season Edge</h3>
              <p className="text-slate-700 leading-relaxed">
                Oscars, Emmys, Grammys - awards shows create predictable trading patterns. If you follow entertainment closely, you can spot mispriced nominees before the ceremony.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Celebrity Events</h3>
              <p className="text-slate-700 leading-relaxed">
                Breakups, pregnancies, feuds, controversies - if it's tabloid-worthy, there's probably a market. Pop culture moves fast, creating frequent trading opportunities.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <Target className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Follow Entertainment Insiders</h3>
              <p className="text-slate-700 leading-relaxed">
                Some traders have deep knowledge of film/TV/music industries. Follow them to see their insights and copy trades you agree with.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                <Brain className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Fun & Accessible</h3>
              <p className="text-slate-700 leading-relaxed">
                Pop culture markets are easier to understand than crypto or economics. If you follow entertainment, you already have the knowledge to trade profitably.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Popular Pop Culture Markets on Polymarket</h2>
          <div className="space-y-6">
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Awards Shows (Oscars, Emmys, Grammys)</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                "Will Oppenheimer win Best Picture?" "Will Taylor Swift win Album of the Year?" Markets exist for every major category at every major awards show.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Clear resolution date, predictable voting patterns, opportunities for informed bettors.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Box Office & Streaming</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Will Barbie gross $1B worldwide? Will Netflix's new show hit #1? Movie release strategies and streaming metrics create trading opportunities.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Box office data is public and trackable, making it easier to predict outcomes.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Celebrity Relationships & Drama</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                A-list breakups, celebrity pregnancies, feuds going public. If TMZ cares, there's probably a market.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> High engagement, frequent updates, opportunities for quick profits.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">TV Show Outcomes</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Reality show winners (Survivor, Bachelor), season renewals/cancellations, finale cliffhangers.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Dedicated fanbases analyze every episode, creating informed markets.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Music Releases & Chart Performance</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Will Drake drop a surprise album? Will the new Taylor single debut at #1? Chart predictions and release dates.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Streaming data is transparent, making outcomes more predictable for informed traders.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Pop Culture Trading Strategies</h2>
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border-l-4 border-emerald-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Awards Voting Analysis</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                Awards voters follow patterns. Study past voting trends (e.g., "Academy loves historical dramas"), analyze guild nominations (SAG often predicts Oscars), track buzz from film festivals. If the market hasn't priced in guild wins, there's an edge.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Example:</strong> A film wins at Golden Globes + SAG. Historically, this predicts Oscar success. If the Oscar market is still at 40%, buy.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-blue-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Early Box Office Data</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                Thursday night previews and Friday morning numbers come out before weekend totals. If early data suggests a film will overperform, the market might not have adjusted yet.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Best for:</strong> Traders who monitor box office tracking sites and can act fast on Friday mornings.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-purple-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Social Media Sentiment</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                Track Twitter/Instagram engagement, Google Trends, TikTok virality. If a celebrity/show is trending hard but the market hasn't moved, there's a trading opportunity.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Example:</strong> A Taylor Swift surprise announcement trends on Twitter. Related markets haven't spiked yet. Buy before the broader market catches up.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-amber-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Copy Entertainment Insiders</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                Some Polycopy traders have insider knowledge of Hollywood/music. Follow them to see their trades and copy the ones you understand and agree with.
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
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Tips for Pop Culture Market Traders</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Follow Industry Trades</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  Variety, Hollywood Reporter, Deadline break news first. Set up alerts so you see announcements before they move markets.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Track Award Precursors</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  Critics Choice, SAG, Golden Globes predict Oscars. Winners at early shows often become favorites. Buy early before odds shorten.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Understand Voting Bodies</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  Academy voters skew older. Grammy voters favor commercial success. Knowing voter demographics helps predict outcomes.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-amber-50 border-l-4 border-amber-500 p-5 rounded-r-lg">
              <X className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Don't Bet on Your Favorites</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  You love a certain actor/film? That doesn't mean they'll win. Trade what will happen, not what you want to happen.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Common Mistakes in Pop Culture Markets</h2>
          <div className="space-y-4">
            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Overvaluing Fan Favorites</h3>
                  <p className="text-slate-700 leading-relaxed">
                    The internet loves a certain actor, so you bet on them to win. But awards voters ≠ Twitter. Don't confuse online buzz with actual voting patterns.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Ignoring Historical Patterns</h3>
                  <p className="text-slate-700 leading-relaxed">
                    "This year will be different!" Sometimes. But usually, voting bodies follow trends. Study past winners to predict future outcomes.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Trading Celebrity Drama Without Sources</h3>
                  <p className="text-slate-700 leading-relaxed">
                    "I saw a TikTok that said..." is not research. Verify celebrity news with reputable sources before trading.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-gradient-to-b from-slate-50 to-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">Ready to Trade Pop Culture Markets?</h2>
          <p className="text-xl text-slate-600 mb-4 leading-relaxed">
            Follow entertainment insiders, see their strategies live, and start copying profitable plays.
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
            Free to browse pop culture traders. No credit card required.
          </p>
        </div>
      </section>

      <section className="py-8 bg-slate-100 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-600 leading-relaxed">
              <strong>Not Financial Advice:</strong> Pop culture prediction market trading involves risk. Past entertainment outcomes do not guarantee future results. Only trade with funds you can afford to lose.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
