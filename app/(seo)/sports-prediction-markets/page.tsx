'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, TrendingUp, Trophy, Target, AlertCircle, CheckCircle2, Users } from 'lucide-react';
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

function formatDisplayName(name: string | null | undefined): string {
  const candidate = (name ?? '').trim();
  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(candidate);
  if (!candidate || isAddress) return 'Trader';
  return candidate;
}

export default function SportsPredictionMarketsPage() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTraders = async () => {
      try {
        const response = await fetch('/api/polymarket/leaderboard?limit=10&orderBy=PNL&category=SPORTS&timePeriod=month');
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
              <Trophy className="h-4 w-4" />
              SPORTS_MARKETS
            </div>
            <h1 className="mb-6 font-sans text-4xl font-black uppercase tracking-tight text-poly-black md:text-5xl">
              Sports Prediction Markets
            </h1>
            <p className="mx-auto mb-8 max-w-3xl font-body text-lg leading-relaxed text-muted-foreground">
              Trade NFL, NBA, soccer, and more on Polymarket. Follow top sports traders, see their strategies in real-time, and copy profitable plays.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Link
                href="/v2/discover"
                className="inline-flex items-center justify-center gap-2 bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
              >
                FOLLOW SPORTS TRADERS <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/v2/discover"
                className="inline-flex items-center justify-center gap-2 border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
              >
                BROWSE SPORTS MARKETS
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Top Sports Traders */}
      <section className="border-b border-border bg-poly-cream">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <div className="mb-12 text-center">
            <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-yellow">POLYMARKET_LEADERBOARD</p>
            <h2 className="mb-4 font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
              Top Sports Traders (Last 30 Days)
            </h2>
            <p className="mx-auto max-w-2xl font-body text-sm leading-relaxed text-muted-foreground">
              These traders consistently profit from sports markets. See their strategies and follow them.
            </p>
          </div>

          {loading ? (
            <div className="py-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin border-4 border-solid border-poly-yellow border-r-transparent"></div>
              <p className="mt-4 font-body text-sm text-muted-foreground">Loading top sports traders...</p>
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
                          {formatDisplayName(trader.displayName)}
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
              <p className="font-body text-sm text-muted-foreground">No sports traders found. Check back soon!</p>
            </div>
          )}

          <div className="mt-8 text-center">
            <Link
              href="/v2/discover"
              className="inline-flex items-center gap-2 border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
            >
              VIEW ALL SPORTS TRADERS <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Why Trade Sports Markets */}
      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Why Trade Sports Prediction Markets?
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {[
              { icon: Target, title: "PROFIT FROM SPORTS KNOWLEDGE", desc: "If you follow leagues closely, you can spot mispriced markets before the broader market catches up. Your knowledge has value." },
              { icon: TrendingUp, title: "BETTER ODDS THAN SPORTSBOOKS", desc: "Prediction markets often have better odds than traditional sportsbooks, with no vig or hidden fees. You see exactly what the market believes." },
              { icon: Users, title: "TRADE UNCONVENTIONAL PROPS", desc: "Polymarket has markets for player awards, coaching changes, team records, and obscure props that sportsbooks don't offer." },
              { icon: Trophy, title: "FOLLOW EXPERT TRADERS", desc: "See what experienced sports traders are doing in real-time. Learn from their strategies and copy profitable plays." },
            ].map((item) => (
              <div key={item.title} className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
                <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                  <item.icon className="h-5 w-5 text-poly-yellow" />
                </div>
                <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">{item.title}</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Popular Sports Markets */}
      <section className="border-b border-border bg-poly-cream">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Popular Sports Markets on Polymarket
          </h2>
          <div className="space-y-6">
            {[
              { title: "NFL", desc: "Super Bowl winner, playoff outcomes, MVP awards, team win totals, coaching changes.", best: "Traders who follow NFL closely and can analyze team performance, injuries, and matchups." },
              { title: "NBA", desc: "Championship winner, conference champions, MVP, player trades, team records.", best: "Basketball fans who track stats, injuries, and front-office moves." },
              { title: "SOCCER / FOOTBALL", desc: "World Cup, Premier League, Champions League, player transfers, tournament outcomes.", best: "Global soccer fans with knowledge of European leagues and international tournaments." },
              { title: "OTHER SPORTS", desc: "MLB, NHL, NCAA, golf majors, tennis Grand Slams, Olympics, F1, boxing, MMA.", best: "Specialists with deep knowledge in these leagues." },
            ].map((item) => (
              <div key={item.title} className="border border-border bg-poly-paper p-6">
                <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">{item.title}</h3>
                <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                <p className="font-body text-xs text-muted-foreground">
                  <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Best for:</span> {item.best}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sports Trading Strategies */}
      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Winning Sports Trading Strategies
          </h2>
          <div className="space-y-6">
            {[
              { title: "INJURY-BASED TRADING", desc: "When a key player gets injured, the market takes time to adjust. Fast traders who catch the news early can profit before the odds shift." },
              { title: "EARLY SEASON OVERREACTIONS", desc: "Markets overreact to small sample sizes. A team starts 0-2? Their championship odds tank. Smart traders fade the noise and buy low on quality teams with slow starts." },
              { title: "PLAYOFF HEDGING", desc: "Bought a team to win the championship at long odds? As they advance through the playoffs, hedge by shorting them or buying their opponents. Lock in profit regardless of outcome." },
              { title: "COPY EXPERT SPORTS TRADERS", desc: "The easiest strategy: follow profitable sports traders on Polycopy and copy their plays. You gain exposure while learning their strategies.", hasLink: true },
            ].map((item) => (
              <div key={item.title} className="border-l-4 border-poly-yellow bg-card p-6">
                <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">{item.title}</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                {item.hasLink && (
                  <Link
                    href="/copy-trading"
                    className="mt-4 inline-flex items-center gap-2 border border-poly-yellow px-4 py-2 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-yellow transition-all hover:bg-poly-yellow hover:text-poly-black"
                  >
                    LEARN ABOUT COPY TRADING <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tips for Sports Traders */}
      <section className="border-b border-border bg-poly-cream">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Tips for Sports Traders
          </h2>
          <div className="space-y-4">
            {[
              { title: "SPECIALIZE IN 1-2 LEAGUES", desc: "Don't try to trade every sport. Focus on leagues you genuinely follow. Depth beats breadth.", type: "tip" },
              { title: "FOLLOW BREAKING NEWS", desc: "Injuries, trades, coaching changes - the market is slow to react. Set up alerts so you're among the first to know.", type: "tip" },
              { title: "DON'T BET ON YOUR FAVORITE TEAM", desc: "Bias kills profitability. Trade what you think will happen, not what you hope will happen.", type: "tip" },
              { title: "BE WARY OF LONGSHOTS", desc: "A 100-to-1 underdog isn't free money just because the odds are long. Markets are usually efficient. If something looks too good to be true, it probably is.", type: "warn" },
            ].map((item) => (
              <div key={item.title} className={`flex items-start gap-3 border-l-4 p-5 ${item.type === 'warn' ? 'border-poly-yellow bg-poly-yellow/5' : 'border-profit-green bg-profit-green/5'}`}>
                {item.type === 'warn' ? (
                  <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-poly-yellow" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-profit-green" />
                )}
                <div>
                  <h3 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">{item.title}</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Common Mistakes */}
      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Common Mistakes in Sports Markets
          </h2>
          <div className="space-y-4">
            {[
              { title: "BETTING WITH YOUR HEART, NOT YOUR HEAD", desc: '"My team is due for a win!" No. Markets don\'t care about narratives or fandom. Trade objectively or lose money.' },
              { title: "OVERREACTING TO SMALL SAMPLES", desc: "A team starts 0-3 and you write them off for the season. But it's only 3 games. Don't overweight noise." },
              { title: "IGNORING INJURY REPORTS", desc: "A star player is questionable for tonight's game. You don't check the injury report and bet anyway. Bad process = bad results." },
              { title: "CHASING LOSSES", desc: 'You lose a bet and immediately double down to "win it back." This is how you blow up your account. Stick to your strategy.' },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-4 border-l-4 border-loss-red bg-card p-6">
                <AlertCircle className="mt-1 h-5 w-5 flex-shrink-0 text-loss-red" />
                <div>
                  <h3 className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">{item.title}</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-poly-black">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center md:py-20">
          <h2 className="mb-6 font-sans text-3xl font-black uppercase tracking-tight text-white md:text-4xl">
            READY TO TRADE SPORTS MARKETS?
          </h2>
          <p className="mx-auto mb-4 max-w-xl font-body text-base leading-relaxed text-white/60">
            Follow top sports traders, see their strategies live, and start copying profitable plays.
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
              href="/top-traders"
              className="inline-flex items-center justify-center gap-2 border border-white px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-white transition-all hover:border-poly-yellow hover:bg-poly-yellow hover:text-poly-black"
            >
              BROWSE ALL TRADERS
            </Link>
          </div>
          <p className="mt-6 font-body text-xs text-white/30">
            Free to browse sports traders. No credit card required.
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="border-t border-border bg-poly-paper py-8">
        <div className="mx-auto max-w-4xl px-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <p className="font-body text-xs leading-relaxed text-muted-foreground">
              <span className="font-sans font-bold uppercase tracking-wider">Not Financial Advice:</span> Sports prediction market trading involves risk. Past performance does not guarantee future results. Only trade with funds you can afford to lose.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
