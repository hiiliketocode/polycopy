"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Brain,
  Target,
  TrendingUp,
  BarChart3,
  Users,
  Zap,
  Shield,
  Bot,
  ChevronRight,
} from "lucide-react";
import { TopNav } from "@/components/polycopy-v2/top-nav";
import { V2Footer } from "@/components/polycopy-v2/footer";

interface BucketResult {
  label: string;
  min: number;
  max: number;
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  unitRoiPct: number;
  unitPnlSum: number;
  avgPerTrade: number;
  profitFactor: number;
}

interface SignalsData {
  meta: {
    title: string;
    uniqueTrades: number;
    uniqueTradesWithMl?: number;
    scope: string;
    generatedAt: string | null;
  };
  byMlScore: BucketResult[];
  byWinRate: BucketResult[];
  byConviction: BucketResult[];
  byTraderRoi: BucketResult[];
  byTradeCount: BucketResult[];
}

function PerformanceTable({
  title,
  rows,
  emptyMessage,
}: {
  title: string;
  rows: BucketResult[];
  emptyMessage?: string;
}) {
  if (!rows?.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="mb-4 font-sans text-lg font-bold text-foreground">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">
          {emptyMessage ?? "No data yet. Run: npx tsx scripts/signals-backtest.ts --out public/data/signals-backtest-results.json"}
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/40 px-4 py-3">
        <h3 className="font-sans text-sm font-bold uppercase tracking-wide text-foreground">
          {title}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="px-4 py-2 text-left font-semibold text-foreground">
                Bucket
              </th>
              <th className="px-4 py-2 text-right font-semibold text-foreground">
                Trades
              </th>
              <th className="px-4 py-2 text-right font-semibold text-foreground">
                WR
              </th>
              <th className="px-4 py-2 text-right font-semibold text-foreground">
                Unit ROI%
              </th>
              <th className="px-4 py-2 text-right font-semibold text-foreground">
                PF
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2 font-medium text-foreground">{r.label}</td>
                <td className="px-4 py-2 text-right tabular-nums text-foreground">
                  {r.trades.toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-foreground">
                  {r.winRatePct.toFixed(1)}%
                </td>
                <td
                  className={`px-4 py-2 text-right tabular-nums ${
                    r.unitRoiPct >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {r.unitRoiPct >= 0 ? "+" : ""}
                  {r.unitRoiPct.toFixed(1)}%
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                  {r.profitFactor >= 999 ? "∞" : r.profitFactor.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PolycopySignalsPage() {
  const [data, setData] = useState<SignalsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/data/signals-backtest-results.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-4xl px-4 pb-24 pt-8 md:pt-12">
        {/* Hero */}
        <section className="mb-16 text-center">
          <h1 className="font-sans text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Polycopy Signals
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Trader intelligence that gives you edge—backtested on top Polymarket
            traders and built into every signal we show.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/v2/discover"
              className="inline-flex items-center gap-2 rounded-lg bg-poly-yellow px-5 py-2.5 font-sans text-sm font-bold uppercase tracking-widest text-poly-black hover:bg-poly-black hover:text-poly-yellow"
            >
              Discover Traders
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              href="/v2/bots"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 font-sans text-sm font-bold uppercase tracking-widest text-foreground hover:bg-accent"
            >
              Copy Bots
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* How we classify traders */}
        <section className="mb-16">
          <h2 className="mb-6 font-sans text-2xl font-bold text-foreground">
            How We Classify Traders & Build Intelligence
          </h2>
          <div className="space-y-4 text-muted-foreground">
            <p className="text-base leading-relaxed">
              We don’t treat every trader the same. Our system classifies traders
              and their trades using precision data built around{" "}
              <strong className="text-foreground">bet type</strong>,{" "}
              <strong className="text-foreground">market type</strong>, and{" "}
              <strong className="text-foreground">bet size</strong>—so we know
              who performs best in which situations.
            </p>
            <p className="text-base leading-relaxed">
              Our intelligence is backtested on{" "}
              <strong className="text-foreground">59M+ trades</strong> from the
              top traders in Polymarket history. That means every signal we show
              you is grounded in real performance data, not guesswork.
            </p>
          </div>
        </section>

        {/* The indicators */}
        <section className="mb-16">
          <h2 className="mb-8 font-sans text-2xl font-bold text-foreground">
            The Five Signals We Use (and Prove)
          </h2>
          <p className="mb-10 text-muted-foreground">
            Below: performance by signal bucket for top 100 traders (last 30d
            PnL). Each trade counted once; metrics = win rate and unit ROI (as if
            you risked 1 unit per trade). No bot sizing—pure signal value.
          </p>

          {loading ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
              Loading backtest results…
            </div>
          ) : (
            <div className="space-y-12">
              {/* 1. ML Score */}
              <div>
                <div className="mb-4 flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Brain className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-sans text-xl font-bold text-foreground">
                      1. ML Score
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Our model’s predicted win probability (0–100%) for this
                      trade, using 41 features (trader history, market type,
                      conviction, trends). Higher score = model thinks the bet
                      is more likely to win.
                    </p>
                  </div>
                </div>
                <PerformanceTable
                  title="Performance by ML score (top 100 traders)"
                  rows={data?.byMlScore ?? []}
                />
              </div>

              {/* 2. Experience (trade count) */}
              <div>
                <div className="mb-4 flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <BarChart3 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-sans text-xl font-bold text-foreground">
                      2. Experience (Trade Count)
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      How many resolved trades the trader had at the time of
                      this bet. More history = more reliable stats. We often
                      filter for 30+ or 100+ resolved trades to avoid noise.
                    </p>
                  </div>
                </div>
                <PerformanceTable
                  title="Performance by trader resolved count"
                  rows={data?.byTradeCount ?? []}
                />
              </div>

              {/* 3. WR */}
              <div>
                <div className="mb-4 flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Target className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-sans text-xl font-bold text-foreground">
                      3. Win Rate (WR)
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      The trader’s historical win rate (lifetime or recent
                      window). Higher WR = they’re right more often. We combine
                      this with price and edge to find value.
                    </p>
                  </div>
                </div>
                <PerformanceTable
                  title="Performance by trader win rate"
                  rows={data?.byWinRate ?? []}
                />
              </div>

              {/* 4. Avg ROI */}
              <div>
                <div className="mb-4 flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <TrendingUp className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-sans text-xl font-bold text-foreground">
                      4. Average ROI
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      The trader’s average return on resolved trades. Positive
                      ROI = they make money on average. We use this to spot
                      traders who don’t just win often but win big when they do.
                    </p>
                  </div>
                </div>
                <PerformanceTable
                  title="Performance by trader ROI band"
                  rows={data?.byTraderRoi ?? []}
                />
              </div>

              {/* 5. Conviction */}
              <div>
                <div className="mb-4 flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Zap className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-sans text-xl font-bold text-foreground">
                      5. Conviction
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      How big this bet is vs the trader’s usual size (e.g. 2x =
                      they’re betting twice their average). High conviction often
                      means they have strong information or confidence.
                    </p>
                  </div>
                </div>
                <PerformanceTable
                  title="Performance by conviction (trade size vs usual)"
                  rows={data?.byConviction ?? []}
                />
              </div>
            </div>
          )}

          {data?.meta?.generatedAt && (
            <p className="mt-6 text-xs text-muted-foreground">
              Backtest data: {data.meta.uniqueTrades?.toLocaleString()} unique
              trades (top 100 traders). Generated:{" "}
              {new Date(data.meta.generatedAt).toLocaleString()}.
            </p>
          )}
        </section>

        {/* How these help users */}
        <section className="mb-16 rounded-2xl border border-border bg-card p-8">
          <h2 className="mb-6 font-sans text-2xl font-bold text-foreground">
            How These Signals Help You Make Better Trades
          </h2>
          <ul className="space-y-4 text-muted-foreground">
            <li className="flex gap-3">
              <Shield className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">Manual trading:</strong> On
                every trade card we show ML score, WR, conviction, and more. Use
                them to decide which trades to follow or skip—focus on high ML +
                high conviction + proven WR when you want quality over quantity.
              </span>
            </li>
            <li className="flex gap-3">
              <Target className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">Filter smarter:</strong> Our
                backtests show which bands actually perform. So you can set your
                own mental thresholds (e.g. “only copy when ML ≥ 60% and
                conviction ≥ 2x”) and align with what the data says works.
              </span>
            </li>
            <li className="flex gap-3">
              <Users className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">Pick better traders:</strong>{" "}
                Experience (trade count), WR, and ROI help you spot who’s
                reliable. Combine with ML and conviction to find traders whose
                best bets are worth copying.
              </span>
            </li>
          </ul>
        </section>

        {/* How they support bot strategies */}
        <section className="mb-16">
          <h2 className="mb-6 font-sans text-2xl font-bold text-foreground">
            How Signals Power Our Copy Bots
          </h2>
          <p className="mb-6 text-muted-foreground">
            Every Polycopy bot strategy uses these same signals as filters and
            sizing inputs. We don’t guess—we gate on ML score, minimum WR,
            minimum trade count, conviction, and edge so only high-quality
            setups get copied.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 font-sans font-bold text-foreground">
                <Bot className="h-5 w-5 text-primary" />
                ML-gated bots
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Only take trades when the model’s score is above a threshold
                (e.g. 55% or 60%). Cuts low-confidence bets and improves
                win rate in backtests.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 font-sans font-bold text-foreground">
                <Zap className="h-5 w-5 text-primary" />
                Conviction & WR
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Many bots require minimum conviction (e.g. 1.5x or 2x) and
                minimum trader win rate so we only copy when the trader is
                putting real size and has a proven record.
              </p>
            </div>
          </div>
          <div className="mt-6 text-center">
            <Link
              href="/v2/bots"
              className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-widest text-primary hover:underline"
            >
              Explore bot strategies
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
      <V2Footer />
    </div>
  );
}
