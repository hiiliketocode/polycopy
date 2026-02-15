'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, LineChart, AlertCircle, TrendingUp, Target, Brain, CheckCircle2, X } from 'lucide-react';
import { getTraderAvatarInitials } from '@/lib/trader-name';

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

export default function EconomicsPredictionMarketsPage() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/polymarket/leaderboard?limit=10&orderBy=PNL&category=ECONOMICS&timePeriod=month')
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
    <div className="min-h-screen bg-poly-cream">
      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-24">
          <div className="text-center">
            <div className="mb-6 inline-flex items-center gap-2 bg-poly-yellow px-4 py-2 font-sans text-xs font-bold uppercase tracking-widest text-poly-black">
              <LineChart className="h-4 w-4" />
              ECONOMICS_MARKETS
            </div>
            <h1 className="mb-6 font-sans text-4xl font-black uppercase tracking-tight text-poly-black md:text-5xl">
              Economics Prediction Markets
            </h1>
            <p className="mx-auto mb-8 max-w-3xl font-body text-lg leading-relaxed text-muted-foreground">
              Trade inflation, unemployment, GDP, interest rates, and economic indicators on Polymarket. Follow economists and macro traders who profit from economic data.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Link
                href="https://polycopy.app"
                className="inline-flex items-center justify-center gap-2 bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
              >
                FOLLOW ECONOMICS TRADERS <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/v2/discover?category=ECONOMICS"
                className="inline-flex items-center justify-center gap-2 border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
              >
                BROWSE ECONOMICS MARKETS
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-poly-cream">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <div className="mb-12 text-center">
            <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-yellow">POLYMARKET_LEADERBOARD</p>
            <h2 className="mb-4 font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
              Top Economics Traders (Last 30 Days)
            </h2>
          </div>

          {loading ? (
            <div className="py-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin border-4 border-solid border-poly-yellow border-r-transparent"></div>
              <p className="mt-4 font-body text-sm text-muted-foreground">Loading...</p>
            </div>
          ) : traders.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2">
              {traders.map((trader, i) => (
                <Link
                  key={trader.wallet}
                  href={`/v2/trader/${trader.wallet}`}
                  className="group border border-border bg-card p-6 transition-all hover:border-poly-yellow"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center bg-poly-yellow font-sans text-sm font-bold text-poly-black">
                        {getTraderAvatarInitials({ displayName: trader.displayName, wallet: trader.wallet })}
                      </div>
                      <div>
                        <p className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black">
                          {formatDisplayName(trader.displayName)}
                        </p>
                        <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">RANK #{i + 1}</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">ROI</p>
                      <p className={`font-body text-lg font-semibold tabular-nums ${trader.roi && trader.roi > 0 ? 'text-profit-green' : 'text-poly-black'}`}>
                        {trader.roi && trader.roi > 0 ? '+' : ''}{trader.roi?.toFixed(1) || 0}%
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">P&L</p>
                      <p className={`font-body text-lg font-semibold tabular-nums ${trader.pnl > 0 ? 'text-profit-green' : 'text-poly-black'}`}>
                        {formatLargeNumber(trader.pnl)}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">VOLUME</p>
                      <p className="font-body text-lg font-semibold tabular-nums text-poly-black">
                        {formatLargeNumber(trader.volume)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-center font-body text-sm text-muted-foreground">No economics traders found.</p>
          )}

          <div className="mt-8 text-center">
            <Link
              href="/v2/discover?category=ECONOMICS"
              className="inline-flex items-center gap-2 border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
            >
              VIEW ALL ECONOMICS TRADERS <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Why Trade Economics Prediction Markets?
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <LineChart className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Scheduled Data Releases</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                CPI, jobs reports, GDP - economic data comes out on known dates. You can prepare trades in advance and react faster than the market.
              </p>
            </div>
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <TrendingUp className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Clear Metrics</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Will CPI be above 3.5%? Will unemployment drop below 4%? Economics markets resolve to official government data - no ambiguity.
              </p>
            </div>
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <Target className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Follow Macro Experts</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Some traders have deep macro knowledge or access to economic models. Follow them to see their positioning and copy trades you agree with.
              </p>
            </div>
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <Brain className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Long-Term Trends</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Unlike politics or sports, economic markets can run for months. If you have conviction on a macro trend, you can build large positions.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-poly-cream">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Popular Economics Markets on Polymarket
          </h2>
          <div className="space-y-6">
            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Inflation (CPI)</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                Will CPI come in above/below consensus? Will inflation drop to 2% by year-end? Monthly CPI reports create frequent trading opportunities.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it&apos;s popular:</span> CPI is released monthly on a known schedule. Economists publish forecasts you can trade against.
              </p>
            </div>

            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Unemployment & Jobs</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                Will the jobs report beat expectations? Will unemployment stay below 4%? Monthly non-farm payrolls are heavily traded.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it&apos;s popular:</span> Jobs data is a key Fed indicator. Traders watch it closely to predict interest rate moves.
              </p>
            </div>

            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">GDP Growth</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                Will Q4 GDP exceed 2.5%? Will we enter a recession? GDP forecasts are published by major banks and the Atlanta Fed&apos;s GDPNow model.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it&apos;s popular:</span> GDP is a macro headline number. Markets move on GDP surprises.
              </p>
            </div>

            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Federal Reserve Decisions</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                Will the Fed cut rates? How many rate cuts by year-end? Fed decisions drive macro positioning.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it&apos;s popular:</span> Fed futures and economist surveys provide baseline forecasts to trade against.
              </p>
            </div>

            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Recession Odds</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                Will the U.S. enter a recession by end of 2024? Recession markets aggregate macro sentiment and economic forecasts.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it&apos;s popular:</span> Recession calls are high-stakes, with large position sizes and active debate among traders.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Economics Trading Strategies
          </h2>
          <div className="space-y-6">
            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Nowcast Model Analysis</h3>
              <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
                The Atlanta Fed publishes a real-time GDP forecast (GDPNow). If their model says 3.2% but the market is pricing 2.8%, there&apos;s an edge. Track nowcast models for leading indicators.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Example:</span> GDPNow shows upward revisions all week. The market hasn&apos;t moved. Buy the &quot;above consensus&quot; side.
              </p>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Leading Indicator Tracking</h3>
              <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
                Initial jobless claims come out weekly before the monthly jobs report. If claims are trending down, bet on a strong jobs print. Use leading indicators to predict lagging data.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Best for:</span> Traders who monitor weekly economic releases and can connect the dots before monthly data drops.
              </p>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Fed Minutes & Speeches</h3>
              <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
                FOMC minutes and Fed governor speeches hint at policy direction. If the tone is dovish but the market is pricing hawkish, there&apos;s a trade. Read between the lines.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Example:</span> Powell speech emphasizes &quot;data-dependent.&quot; Markets are pricing 0 cuts. Buy rate cuts.
              </p>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Copy Macro Traders</h3>
              <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
                Some Polycopy traders specialize in macro. Follow them to see their economic bets and copy trades you understand and agree with.
              </p>
              <Link
                href="/copy-trading"
                className="inline-flex items-center gap-2 border border-poly-yellow px-4 py-2 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-yellow transition-all hover:bg-poly-yellow hover:text-poly-black"
              >
                LEARN ABOUT COPY TRADING <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-poly-cream">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Tips for Economics Market Traders
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3 border-l-4 border-profit-green bg-profit-green/5 p-5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-profit-green" />
              <div>
                <h3 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Track Economic Calendars</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  CPI, jobs, GDP - all on known schedules. Set reminders so you&apos;re ready when data drops. Speed matters in economics markets.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 border-l-4 border-profit-green bg-profit-green/5 p-5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-profit-green" />
              <div>
                <h3 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Follow Economist Forecasts</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Bloomberg consensus, Fed surveys, bank forecasts - these set the baseline. If the market diverges from consensus, investigate why.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 border-l-4 border-profit-green bg-profit-green/5 p-5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-profit-green" />
              <div>
                <h3 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Understand Revisions</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Economic data gets revised. Initial GDP or jobs numbers often change. Factor in revision risk when trading near thresholds.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 border-l-4 border-loss-red bg-loss-red/5 p-5">
              <X className="mt-0.5 h-5 w-5 flex-shrink-0 text-loss-red" />
              <div>
                <h3 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Don&apos;t Overtrade Data Noise</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  One weak jobs report doesn&apos;t mean recession. Look for sustained trends, not single data points.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Common Mistakes in Economics Markets
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-4 border-l-4 border-loss-red bg-card p-6">
              <AlertCircle className="mt-1 h-5 w-5 flex-shrink-0 text-loss-red" />
              <div>
                <h3 className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Trading Based on &quot;Feeling&quot;</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  &quot;The economy feels weak, so I&apos;ll bet on recession.&quot; That&apos;s not analysis. Use data and models, not gut feelings.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 border-l-4 border-loss-red bg-card p-6">
              <AlertCircle className="mt-1 h-5 w-5 flex-shrink-0 text-loss-red" />
              <div>
                <h3 className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Ignoring Base Rates</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  &quot;This time is different!&quot; Maybe. But economists have predicted 9 of the last 5 recessions. Check historical accuracy before betting on extremes.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 border-l-4 border-loss-red bg-card p-6">
              <AlertCircle className="mt-1 h-5 w-5 flex-shrink-0 text-loss-red" />
              <div>
                <h3 className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Overweighting One Indicator</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  One inverted yield curve doesn&apos;t confirm recession. Look at multiple indicators (jobs, consumer spending, PMIs) before making big bets.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-poly-black">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center md:py-20">
          <h2 className="mb-6 font-sans text-3xl font-black uppercase tracking-tight text-white md:text-4xl">
            READY TO TRADE ECONOMICS MARKETS?
          </h2>
          <p className="mx-auto mb-4 max-w-xl font-body text-base leading-relaxed text-white/60">
            Follow macro experts, see their strategies live, and start copying profitable plays.
          </p>
          <p className="mb-8 font-body text-sm text-white/40">
            Interested in other markets?{' '}
            <Link href="/polymarket-market-categories" className="font-semibold text-poly-yellow transition-colors hover:text-white">
              Explore all categories
            </Link>.
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="https://polycopy.app"
              className="inline-flex items-center justify-center gap-2 bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-white"
            >
              GET STARTED FREE <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/polymarket-trading-strategies"
              className="inline-flex items-center justify-center gap-2 border border-white px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-white transition-all hover:border-poly-yellow hover:bg-poly-yellow hover:text-poly-black"
            >
              VIEW ALL STRATEGIES
            </Link>
          </div>
          <p className="mt-6 font-body text-xs text-white/30">
            Free to browse economics traders. No credit card required.
          </p>
        </div>
      </section>

      <section className="border-t border-border bg-poly-paper py-8">
        <div className="mx-auto max-w-4xl px-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <p className="font-body text-xs leading-relaxed text-muted-foreground">
              <span className="font-sans font-bold uppercase tracking-wider">Not Financial Advice:</span> Economics prediction market trading involves risk. Past economic outcomes do not guarantee future results. Only trade with funds you can afford to lose.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
