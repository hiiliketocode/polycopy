'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, Vote, Target, AlertCircle, CheckCircle2, Users, TrendingUp } from 'lucide-react';
import { getTraderAvatarInitials } from '@/lib/trader-name';

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
  if (absNum >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

function formatDisplayName(name: string | null | undefined, wallet?: string): string {
  const candidate = (name ?? '').trim();
  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(candidate);
  if (!candidate || isAddress) return 'Trader';
  return candidate;
}

export default function PoliticsPredictionMarketsPage() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    <div className="min-h-screen bg-poly-cream">
      {/* Hero Section */}
      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-24">
          <div className="text-center">
            <div className="mb-6 inline-flex items-center gap-2 bg-poly-yellow px-4 py-2 font-sans text-xs font-bold uppercase tracking-widest text-poly-black">
              <Vote className="h-4 w-4" />
              POLITICS_MARKETS
            </div>
            <h1 className="mb-6 font-sans text-4xl font-black uppercase tracking-tight text-poly-black md:text-5xl">
              Politics Prediction Markets
            </h1>
            <p className="mx-auto mb-8 max-w-3xl font-body text-lg leading-relaxed text-muted-foreground">
              Trade elections, policy outcomes, and political events on Polymarket. Follow expert politics traders and copy their strategies.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Link
                href="/v2/discover"
                className="inline-flex items-center justify-center gap-2 bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
              >
                FOLLOW POLITICS TRADERS <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/v2/discover"
                className="inline-flex items-center justify-center gap-2 border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
              >
                BROWSE POLITICS MARKETS
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Top Politics Traders */}
      <section className="border-b border-border bg-poly-cream">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <div className="mb-12 text-center">
            <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-yellow">POLYMARKET_LEADERBOARD</p>
            <h2 className="mb-4 font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
              Top Politics Traders (Last 30 Days)
            </h2>
            <p className="mx-auto max-w-2xl font-body text-sm leading-relaxed text-muted-foreground">
              Follow the traders who consistently profit from political markets.
            </p>
          </div>

          {loading ? (
            <div className="py-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin border-4 border-solid border-poly-yellow border-r-transparent"></div>
              <p className="mt-4 font-body text-sm text-muted-foreground">Loading top politics traders...</p>
            </div>
          ) : traders.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2">
              {traders.map((trader, index) => (
                <Link
                  key={trader.wallet}
                  href={`/v2/trader/${trader.wallet}`}
                  className="group border border-border bg-card p-6 transition-all hover:border-poly-yellow hover:shadow-md"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center bg-poly-yellow font-sans text-sm font-bold text-poly-black">
                        {getTraderAvatarInitials({ displayName: trader.displayName, wallet: trader.wallet })}
                      </div>
                      <div>
                        <p className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black">
                          {formatDisplayName(trader.displayName, trader.wallet)}
                        </p>
                        <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">RANK #{index + 1}</p>
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
            <div className="py-12 text-center">
              <p className="font-body text-sm text-muted-foreground">No politics traders found. Check back soon!</p>
            </div>
          )}

          <div className="mt-8 text-center">
            <Link
              href="/v2/discover"
              className="inline-flex items-center gap-2 border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
            >
              VIEW ALL POLITICS TRADERS <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Why Trade Politics Markets */}
      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Why Trade Politics Markets?
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <TrendingUp className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Most Accurate Election Forecasts</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Prediction markets historically outperform polls and pundits. Markets aggregate diverse information and update in real-time as news breaks.
              </p>
            </div>
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <Target className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Profit from Political Knowledge</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                If you follow politics closely and can spot mispriced markets, you can profit while others are still debating on Twitter.
              </p>
            </div>
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <AlertCircle className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Hedge Real-World Risk</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Business affected by policy outcomes? Hedge your risk by trading political markets tied to regulation, taxes, or spending.
              </p>
            </div>
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <Users className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Trade Beyond Presidential Elections</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Senate races, gubernatorial elections, ballot measures, cabinet appointments, policy passage - there's a market for everything.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Politics Markets */}
      <section className="border-b border-border bg-poly-cream">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Popular Politics Markets on Polymarket
          </h2>
          <div className="space-y-6">
            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Presidential Elections</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                Who will win the presidency? Electoral college outcomes, swing state results, primary winners.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it's popular:</span> Highest volume markets. Polls, fundraising data, and historical precedent provide baseline forecasts.
              </p>
            </div>

            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Congressional Races</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                Senate control, House control, specific competitive races. Lower-profile races can be mispriced.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it's popular:</span> Less media attention = more opportunities for informed traders who track local races.
              </p>
            </div>

            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Policy & Legislation</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                Will a bill pass? Will the Fed raise rates? Will the Supreme Court overturn a ruling? Policy markets resolve based on official actions.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it's popular:</span> Congressional vote counts and procedural rules make outcomes more predictable than elections.
              </p>
            </div>

            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Cabinet & Appointments</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                Who will be nominated? Will the Senate confirm? Political appointments create short-term trading opportunities.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it's popular:</span> Insider reports and political betting markets provide early signals before official announcements.
              </p>
            </div>

            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">International Politics</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                UK elections, French elections, EU referendums, leadership changes in major democracies.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it's popular:</span> Global traders bring diverse perspectives, creating opportunities for those with local knowledge.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Political Trading Strategies */}
      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Political Trading Strategies
          </h2>
          <div className="space-y-6">
            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Poll Aggregation & Weighting</h3>
              <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
                Not all polls are created equal. Weight by pollster quality, sample size, and recency. If you can aggregate better than the market, you'll spot mispricing.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Example:</span> Five A+ polls show candidate leading by 4 points. Market is at 50/50. Buy the leader.
              </p>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Debate & Event-Based Trading</h3>
              <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
                Markets move after debates, scandal drops, primary results, and major speeches. Fast traders who watch events live can profit before the broader market adjusts.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Best for:</span> Traders who can watch political events in real-time and react quickly to major shifts.
              </p>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">State-by-State Electoral Analysis</h3>
              <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
                Build your own electoral college model. Sometimes the national market is correct but specific swing state markets are mispriced. Arbitrage the difference.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Example:</span> Pennsylvania market shows Dem at 60%. National market shows Dem at 45%. One of these is wrong.
              </p>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Copy Politics Experts</h3>
              <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
                Some Polycopy traders specialize in politics and have built sophisticated forecasting models. Follow them to see their positioning.
              </p>
              <Link
                href="/v2/discover"
                className="inline-flex items-center gap-2 border border-poly-yellow px-4 py-2 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-yellow transition-all hover:bg-poly-yellow hover:text-poly-black"
              >
                LEARN ABOUT COPY TRADING <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Tips for Politics Market Traders */}
      <section className="border-b border-border bg-poly-cream">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Tips for Politics Market Traders
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3 border-l-4 border-profit-green bg-profit-green/5 p-5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-profit-green" />
              <div>
                <h3 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Track High-Quality Polls</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Focus on A+ and A-rated pollsters. Ignore partisan polls and low-quality surveys. Quality over quantity.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 border-l-4 border-profit-green bg-profit-green/5 p-5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-profit-green" />
              <div>
                <h3 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Understand Electoral Mechanics</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Electoral college, Senate confirmations, filibuster rules - procedural details matter. Know how the system works.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 border-l-4 border-profit-green bg-profit-green/5 p-5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-profit-green" />
              <div>
                <h3 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Watch Early & Absentee Voting Data</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Early vote numbers provide clues before election day. If one party is overperforming historical norms, markets may not have adjusted yet.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 border-l-4 border-poly-yellow bg-poly-yellow/5 p-5">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-poly-yellow" />
              <div>
                <h3 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Don't Trade Your Political Bias</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  You want your candidate to win. The market doesn't care. Trade objectively or lose money.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Common Mistakes in Politics Markets */}
      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Common Mistakes in Politics Markets
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-4 border-l-4 border-loss-red bg-card p-6">
              <AlertCircle className="mt-1 h-5 w-5 flex-shrink-0 text-loss-red" />
              <div>
                <h3 className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Trading Based on Twitter Sentiment</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  "Everyone on Twitter is talking about X, so they'll definitely win!" Twitter is not representative. Use polls and data, not social media vibes.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 border-l-4 border-loss-red bg-card p-6">
              <AlertCircle className="mt-1 h-5 w-5 flex-shrink-0 text-loss-red" />
              <div>
                <h3 className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Overweighting Single Polls</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  One poll shows a 10-point swing. You trade it immediately. But it's an outlier. Wait for confirmation from other high-quality polls.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 border-l-4 border-loss-red bg-card p-6">
              <AlertCircle className="mt-1 h-5 w-5 flex-shrink-0 text-loss-red" />
              <div>
                <h3 className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Ignoring Base Rates</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  "This time is different!" Maybe. But incumbents usually have an advantage. Generic ballot polls are predictive. Don't bet against history without strong evidence.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 border-l-4 border-loss-red bg-card p-6">
              <AlertCircle className="mt-1 h-5 w-5 flex-shrink-0 text-loss-red" />
              <div>
                <h3 className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Betting on Chaos</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  "Something crazy could happen!" Yes, but low-probability events are low-probability for a reason. Don't bet on long-shot scenarios just because they'd be interesting.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-poly-black">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center md:py-20">
          <h2 className="mb-6 font-sans text-3xl font-black uppercase tracking-tight text-white md:text-4xl">
            START TRADING POLITICS MARKETS
          </h2>
          <p className="mx-auto mb-4 max-w-xl font-body text-base leading-relaxed text-white/60">
            Follow expert politics traders and copy their strategies in real-time.
          </p>
          <p className="mb-8 font-body text-sm text-white/40">
            Interested in other markets?{' '}
            <Link href="/polymarket-market-categories" className="font-semibold text-poly-yellow transition-colors hover:text-white">
              Explore all categories
            </Link>.
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/login?mode=signup"
              className="inline-flex items-center justify-center gap-2 bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-white"
            >
              GET STARTED FREE <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/v2/discover"
              className="inline-flex items-center justify-center gap-2 border border-white px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-white transition-all hover:border-poly-yellow hover:bg-poly-yellow hover:text-poly-black"
            >
              BROWSE POLITICS TRADERS
            </Link>
          </div>
          <p className="mt-6 font-body text-xs text-white/30">
            Free to browse politics traders. No credit card required.
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="border-t border-border bg-poly-paper py-8">
        <div className="mx-auto max-w-4xl px-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <p className="font-body text-xs leading-relaxed text-muted-foreground">
              <span className="font-sans font-bold uppercase tracking-wider">Not Financial Advice:</span> Political prediction market trading involves risk. Past performance does not guarantee future results. Only trade with funds you can afford to lose.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
