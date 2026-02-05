'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ArrowRight, Cloud, AlertCircle, TrendingUp, Target, Brain, CheckCircle2, X } from 'lucide-react';
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

export default function WeatherPredictionMarketsPage() {
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

    fetch('/api/polymarket/leaderboard?limit=10&orderBy=PNL&category=WEATHER&timePeriod=month')
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
          <div className="inline-flex items-center gap-2 bg-sky-100 text-sky-800 px-4 py-2 rounded-full text-sm font-semibold mb-6">
            <Cloud className="w-4 h-4" />
            Weather Markets
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">Weather Prediction Markets</h1>
          <p className="text-xl text-slate-600 mb-8 leading-relaxed max-w-3xl mx-auto">
            Trade temperature records, hurricanes, snowfall, heat waves, and extreme weather events on Polymarket. Follow meteorology experts who profit from weather outcomes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="https://polycopy.app">
              <Button size="lg" className="bg-polycopy-yellow hover:bg-polycopy-yellow/90 text-slate-900 font-semibold px-8 h-12">
                Follow Weather Traders <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/discover?category=WEATHER">
              <Button size="lg" variant="outline" className="font-semibold px-8 h-12">Browse Weather Markets</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">Top Weather Traders (Last 30 Days)</h2>
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
                      <AvatarFallback className="bg-sky-100 text-sky-700 font-semibold">
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
          ) : <p className="text-center text-slate-500">No weather traders found.</p>}
          
          <div className="mt-8 text-center">
            <Link href="/discover?category=WEATHER">
              <Button variant="outline" size="lg" className="font-semibold">
                View All Weather Traders
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Why Trade Weather Prediction Markets?</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-sky-100 rounded-full flex items-center justify-center mb-4">
                <Cloud className="w-5 h-5 text-sky-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Objective Data</h3>
              <p className="text-slate-700 leading-relaxed">
                Temperature, rainfall, snowfall - weather markets resolve to official NOAA/NWS data. No ambiguity, just numbers.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Multiple Forecasts Available</h3>
              <p className="text-slate-700 leading-relaxed">
                NOAA, European models, private forecasters - you can compare multiple sources. If they all agree but the market hasn't moved, there's an edge.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                <Target className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Follow Meteorology Experts</h3>
              <p className="text-slate-700 leading-relaxed">
                Some traders have meteorology backgrounds or analyze weather models full-time. Follow them to see their forecasts in action.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                <Brain className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Seasonal Patterns</h3>
              <p className="text-slate-700 leading-relaxed">
                El Niño, La Niña, historical trends - weather follows patterns. If you understand climatology, you can spot mispriced markets.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Popular Weather Markets on Polymarket</h2>
          <div className="space-y-6">
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Temperature Records</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Will NYC hit 100°F this summer? Will this be the hottest year on record? Temperature markets resolve to official weather service data.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Temperature data is public, verifiable, and tracked daily by NOAA and local weather stations.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Hurricane Season</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                How many named storms this season? Will a Category 5 make landfall? NOAA publishes forecasts you can trade against.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Hurricane forecasts improve throughout the season, creating trading opportunities as models update.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Snowfall Totals</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Will NYC get more than 30" of snow this winter? Will this storm drop 12+ inches? Snowfall markets resolve to official measurements.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Winter storms are heavily forecast, and snowfall totals are precisely measured and reported.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Extreme Weather Events</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Will there be a heat wave in July? Will flooding occur? Will a wildfire season be "above normal"? Extreme events create high-volume markets.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> Climate agencies publish seasonal outlooks that predict extreme weather probabilities.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">El Niño / La Niña</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                Will we be in El Niño by winter? ENSO conditions affect global weather patterns and create predictable climate trends.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Why it's popular:</strong> NOAA publishes ENSO forecasts months in advance, creating long-term trading opportunities.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Weather Trading Strategies</h2>
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border-l-4 border-emerald-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Model Ensemble Analysis</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                Compare GFS, European (ECMWF), Canadian, and other models. If 80% of models agree on an outcome but the market is at 50%, there's an edge. Track model consensus.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Example:</strong> 4 of 5 major models predict NYC will hit 100°F. The market is at 40%. Buy before it adjusts.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-blue-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Climatology & Base Rates</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                Check historical weather data. If NYC has hit 100°F only 3 times in 50 years, betting "yes" at 70% is bad odds. Use climatology to spot overpriced markets.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Best for:</strong> Traders who research historical weather patterns and understand base rate probabilities.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-purple-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">NOAA Outlook Reports</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                NOAA publishes seasonal outlooks (temperature, precipitation, hurricane forecasts). If the market hasn't priced in the official forecast, trade it.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Example:</strong> NOAA predicts an "above-average" hurricane season. The market is still at 45%. Buy before the public catches up.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-amber-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Copy Weather Experts</h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                Some Polycopy traders specialize in weather. Follow them to see their forecast-based trades and copy the ones you understand.
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
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Tips for Weather Market Traders</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Follow NOAA & NWS Updates</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  Official weather services update forecasts regularly. Set alerts so you see major forecast changes before markets adjust.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Check Multiple Forecast Models</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  Don't rely on a single model. Compare GFS, ECMWF, and ensemble forecasts to understand consensus confidence.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Understand Forecast Uncertainty</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  Weather forecasts get less accurate the further out you go. A 10-day forecast is much less reliable than a 3-day forecast.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-amber-50 border-l-4 border-amber-500 p-5 rounded-r-lg">
              <X className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Don't Bet Against Climatology Without Reason</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  If something has only happened 5% of the time historically, you need a strong reason to bet it'll happen this year.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">Common Mistakes in Weather Markets</h2>
          <div className="space-y-4">
            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Overreacting to Single Model Runs</h3>
                  <p className="text-slate-700 leading-relaxed">
                    One model shows a snowstorm, so you bet big. But other models disagree. Wait for consensus before trading extremes.
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
                    "It feels hot, so we'll break the record." Check historical data. If it's only happened twice in 100 years, the odds are low.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Trading Too Far Out</h3>
                  <p className="text-slate-700 leading-relaxed">
                    Betting on specific temperatures 30 days out is guessing. Forecasts are unreliable beyond 7-10 days. Trade closer to resolution.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-gradient-to-b from-slate-50 to-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">Ready to Trade Weather Markets?</h2>
          <p className="text-xl text-slate-600 mb-4 leading-relaxed">
            Follow meteorology experts, see their strategies live, and start copying profitable plays.
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
            Free to browse weather traders. No credit card required.
          </p>
        </div>
      </section>

      <section className="py-8 bg-slate-100 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-600 leading-relaxed">
              <strong>Not Financial Advice:</strong> Weather prediction market trading involves risk. Past weather patterns do not guarantee future outcomes. Only trade with funds you can afford to lose.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
