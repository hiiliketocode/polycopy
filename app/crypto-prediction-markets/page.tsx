'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ArrowRight, Bitcoin, AlertCircle, TrendingUp, Target, Brain, CheckCircle2, X } from 'lucide-react';
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

export default function CryptoPredictionMarketsPage() {
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

    fetch('/api/polymarket/leaderboard?limit=10&orderBy=PNL&category=CRYPTO&timePeriod=month')
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
          <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-800 px-4 py-2 rounded-full text-sm font-semibold mb-6">
            <Bitcoin className="w-4 h-4" />
            Crypto Markets
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">Crypto Prediction Markets</h1>
          <p className="text-xl text-slate-600 mb-8 leading-relaxed max-w-3xl mx-auto">
            Trade Bitcoin, Ethereum, altcoins, DeFi, and crypto events on Polymarket. Follow top crypto traders and copy their strategies in real-time.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="https://polycopy.app">
              <Button size="lg" className="bg-polycopy-yellow hover:bg-polycopy-yellow/90 text-slate-900 font-semibold px-8 h-12">
                Follow Crypto Traders <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/discover?category=CRYPTO">
              <Button size="lg" variant="outline" className="font-semibold px-8 h-12">Browse Crypto Markets</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">Top Crypto Traders (Last 30 Days)</h2>
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
                      <AvatarFallback className="bg-orange-100 text-orange-700 font-semibold">
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
          ) : <p className="text-center text-slate-500">No crypto traders found.</p>}
          
          <div className="mt-8 text-center">
            <Link href="/discover?category=CRYPTO">
              <Button variant="outline" size="lg" className="font-semibold">
                View All Crypto Traders
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Why Trade Crypto Prediction Markets?</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center mb-4">
                <Bitcoin className="w-5 h-5 text-orange-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Price Predictions</h3>
              <p className="text-slate-700 leading-relaxed">
                Will Bitcoin hit $100K by year-end? Will ETH reach $5K? Trade your crypto price predictions and profit when you're right. Markets exist for major price milestones across BTC, ETH, and top altcoins.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Crypto Events</h3>
              <p className="text-slate-700 leading-relaxed">
                ETF approvals, regulatory decisions, protocol upgrades, exchange listings, token launches, DeFi exploits, halving events - trade any major crypto catalyst before it happens.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                <Target className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Follow Crypto Experts</h3>
              <p className="text-slate-700 leading-relaxed">
                See what experienced crypto traders are betting on and copy their strategies. Learn from traders who have been profitable across multiple crypto cycles.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                <Brain className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Hedge Crypto Holdings</h3>
              <p className="text-slate-700 leading-relaxed">
                Hold BTC or ETH? Hedge downside risk by trading bearish prediction markets. If prices drop, your prediction market gains offset portfolio losses.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Popular Crypto Markets on Polymarket</h2>
          <div className="space-y-6">
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Bitcoin Price Milestones</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                "Will Bitcoin reach $100K by end of 2026?" "BTC above $80K by Q2?" These markets trade on whether Bitcoin hits specific price targets by certain dates.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Everyone has an opinion on Bitcoin. High liquidity, clear resolution criteria.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Ethereum & Layer 2s</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                ETH price predictions, L2 adoption metrics, merge/upgrade outcomes, staking milestones. Markets cover the entire Ethereum ecosystem.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Ethereum has multiple narratives (DeFi, L2s, staking) creating diverse trading opportunities.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Altcoin Events</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Solana outages, Cardano upgrades, meme coin milestones, token unlocks, major airdrops. If it's a significant altcoin event, there's probably a market.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Altcoins are volatile and news-driven, creating frequent mispricings for informed traders.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Regulatory & ETF Outcomes</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                SEC approvals, spot ETF launches, Gensler decisions, congressional crypto legislation. Regulatory outcomes significantly impact prices.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Regulatory clarity often precedes major price movements. Informed traders profit from correctly predicting regulatory outcomes.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Exchange & Protocol Events</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Major exchange listings (Coinbase, Binance), DeFi protocol exploits, stablecoin depegs, DAO governance outcomes.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> These events move markets quickly. Traders who spot them early can profit significantly.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Crypto Trading Strategies</h2>
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border-l-4 border-emerald-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">News-Based Trading</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                Crypto markets react to news with a lag. Set up alerts for crypto news (SEC announcements, protocol exploits, major partnerships). When breaking news hits, check if related prediction markets have updated. If not, trade before the broader market catches up.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Example:</strong> SEC announces ETF approval. You see it on Twitter 30 seconds before the market moves. Buy "Yes" on related markets before the spike.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-blue-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">On-Chain Data Edge</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                Track on-chain metrics: whale movements, exchange flows, staking ratios. If on-chain data suggests BTC will hit $100K but the market is pricing it at 40%, that's a trading opportunity.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Best for:</strong> Traders who understand blockchain analytics and can interpret on-chain signals.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-purple-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Regulatory Arbitrage</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                Markets often misprice regulatory outcomes because most traders don't read congressional bills or SEC filings. If you do, you have an edge. Track regulatory timelines and bet accordingly.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Example:</strong> You read the draft bill and realize ETF approval is more likely than the market thinks. Buy "Yes" before the final vote.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-amber-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Copy Experienced Crypto Traders</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                The easiest strategy: follow profitable crypto traders on Polycopy. See their trades in real-time and copy the ones you understand and agree with. You learn while you trade.
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
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Tips for Crypto Market Traders</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Follow Crypto Twitter & Discord</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  Crypto news breaks on Twitter and Discord first. Set up alerts for key accounts (SEC, Vitalik, major exchanges) to catch news before the market reacts.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Understand Market Psychology</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  Crypto markets are emotional. When BTC pumps, prediction markets overvalue bullish outcomes. When it dumps, bearish markets get overpriced. Fade the extremes.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Track Historical Patterns</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  How did similar events resolve in the past? If "BTC to $100K by EOY" markets historically underestimate or overestimate, factor that into your trades.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-amber-50 border-l-4 border-amber-500 p-5 rounded-r-lg">
              <X className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Don't Trade Based on Your Bags</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  You hold SOL, so you buy "Yes" on "Solana to $500" even at 90¢? Bad idea. Trade what you think will happen, not what benefits your portfolio.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Common Mistakes in Crypto Markets</h2>
          <div className="space-y-4">
            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Overestimating Altcoin Odds</h3>
                  <p className="text-slate-700 leading-relaxed">
                    "My favorite L2 will flip Ethereum" is hopium, not analysis. Most altcoins fail. Don't let tribalism cloud your judgment.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Ignoring Macro Conditions</h3>
                  <p className="text-slate-700 leading-relaxed">
                    Crypto doesn't exist in a vacuum. Fed policy, inflation, stock market correlations - macro matters. A "BTC to $150K" bet might be mispriced if you're ignoring the macro backdrop.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Trading Low-Liquidity Altcoin Markets</h3>
                  <p className="text-slate-700 leading-relaxed">
                    Obscure altcoin markets with $500 volume are hard to exit. Stick to BTC, ETH, and major altcoins where liquidity ensures you can get in and out at reasonable prices.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-gradient-to-b from-slate-50 to-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">Ready to Trade Crypto Markets?</h2>
          <p className="text-xl text-slate-600 mb-4 leading-relaxed">
            Follow expert crypto traders, see their strategies live, and start copying profitable plays.
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
            Free to browse crypto traders. No credit card required.
          </p>
        </div>
      </section>

      <section className="py-8 bg-slate-100 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-600 leading-relaxed">
              <strong>Not Financial Advice:</strong> Crypto prediction market trading involves significant risk. Cryptocurrency is volatile and past performance does not guarantee future results. Only trade with funds you can afford to lose.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
