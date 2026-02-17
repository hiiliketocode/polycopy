'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Flame, TrendingUp, Brain, Target, BarChart3, ArrowRight, Zap, Shield, Users, Eye, AlertTriangle } from 'lucide-react';
import { Navigation } from '@/components/polycopy/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

export default function HighSignalPolymarketTradesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        supabase
          .from('profiles')
          .select('tier, trading_wallet_address, profile_image')
          .eq('id', session.user.id)
          .single()
          .then(({ data }) => {
            if (data) {
              setIsPremium(data.tier === 'premium');
              setWalletAddress(data.trading_wallet_address);
              setProfileImageUrl(data.profile_image);
            }
          });
      }
    });
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Navigation 
        user={user ? { id: user.id, email: user.email || '' } : null}
        isPremium={isPremium}
        walletAddress={walletAddress}
        profileImageUrl={profileImageUrl}
      />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-orange-600 via-red-600 to-orange-700 px-4 py-16 md:py-24">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 backdrop-blur-sm">
            <Flame className="h-4 w-4 text-orange-200" />
            <span className="text-sm font-medium text-orange-100">AI-Powered Trade Scoring</span>
          </div>

          <h1 className="mb-6 font-sans text-4xl font-bold leading-tight text-white md:text-6xl">
            High-Signal Polymarket Trades
          </h1>

          <p className="mb-8 text-lg leading-relaxed text-orange-100 md:text-xl">
            Our AI scores every trade from 500K+ Polymarket traders based on edge, conviction, trader skill, and market timing. Only the highest-confidence opportunities make the cut.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button asChild size="lg" className="bg-white text-orange-700 hover:bg-orange-50 font-semibold">
              <Link href="/v2/feed">
                See Live Signals
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10">
              <Link href="/pricing">View Pricing</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* What Are High-Signal Trades */}
      <section className="bg-white px-4 py-16 md:py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-3xl font-bold text-slate-900 md:text-4xl">
            What Are High-Signal Trades?
          </h2>

          <div className="prose prose-lg max-w-none text-slate-700">
            <p>
              Not all trades are created equal. Out of thousands of daily Polymarket trades, only a small percentage represent truly high-confidence opportunities. Polycopy's AI scoring system evaluates every trade and surfaces only those with the strongest combination of:
            </p>

            <ul className="space-y-3">
              <li><strong>Price edge</strong> - The trade is priced favorably relative to the expected outcome</li>
              <li><strong>Trader conviction</strong> - The trader is putting meaningful capital behind the position</li>
              <li><strong>Trader track record</strong> - The trader has a proven history of profitable trades</li>
              <li><strong>Market timing</strong> - The trade is well-timed relative to upcoming events or market movements</li>
            </ul>

            <p>
              The result is a curated feed of <strong>the most promising trades happening on Polymarket right now</strong>, filtered from noise and ranked by signal strength.
            </p>
          </div>
        </div>
      </section>

      {/* How Scoring Works */}
      <section className="bg-slate-50 px-4 py-16 md:py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-slate-900 md:text-4xl">
            How the AI Scoring System Works
          </h2>

          <div className="mb-12 grid gap-6 md:grid-cols-2">
            <Card className="p-6 border-2 border-orange-200 bg-orange-50/30">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100">
                  <Target className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Edge Analysis</h3>
                  <Badge variant="outline" className="text-xs">50% Weight</Badge>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                Does this trade have a price advantage? The AI compares the trader's entry price against the current market to determine whether the trade has a real edge.
              </p>
            </Card>

            <Card className="p-6 border-2 border-purple-200 bg-purple-50/30">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
                  <Zap className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Conviction</h3>
                  <Badge variant="outline" className="text-xs">25% Weight</Badge>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                How much is the trader putting behind this trade? Higher conviction relative to portfolio size signals stronger confidence in the outcome.
              </p>
            </Card>

            <Card className="p-6 border-2 border-blue-200 bg-blue-50/30">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
                  <Brain className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Trader Skill</h3>
                  <Badge variant="outline" className="text-xs">15% Weight</Badge>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                What's the trader's historical performance? The system evaluates ROI, win rate, consistency, and resolved trade count to measure skill.
              </p>
            </Card>

            <Card className="p-6 border-2 border-green-200 bg-green-50/30">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
                  <BarChart3 className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Market Context</h3>
                  <Badge variant="outline" className="text-xs">10% Weight</Badge>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                Is the timing right? The system considers market liquidity, time to resolution, and recent price movements.
              </p>
            </Card>
          </div>

          {/* Score Scale */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="mb-6 text-center text-xl font-bold text-slate-900">Signal Score Scale (0-100)</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-4 rounded-lg bg-green-50 border border-green-200 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-green-600 text-white font-bold text-sm">75+</div>
                <div>
                  <span className="font-bold text-green-700">Strong Buy</span>
                  <p className="text-sm text-slate-600">Exceptional edge, high conviction, top-tier trader. Rare - only the best trades earn this.</p>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-lg bg-emerald-50 border border-emerald-200 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white font-bold text-sm">60+</div>
                <div>
                  <span className="font-bold text-emerald-700">Buy</span>
                  <p className="text-sm text-slate-600">Good edge with solid conviction. Consistent with proven trader behavior.</p>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-lg bg-slate-50 border border-slate-200 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-400 text-white font-bold text-sm">45+</div>
                <div>
                  <span className="font-bold text-slate-700">Neutral</span>
                  <p className="text-sm text-slate-600">Mixed signals. Some positives but not enough conviction to recommend. Filtered out.</p>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-lg bg-red-50 border border-red-200 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-red-500 text-white font-bold text-sm">&lt;45</div>
                <div>
                  <span className="font-bold text-red-700">Avoid / Toxic</span>
                  <p className="text-sm text-slate-600">Negative edge, low conviction, or poor trader history. Automatically filtered out.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What You See */}
      <section className="bg-white px-4 py-16 md:py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-slate-900 md:text-4xl">
            What You See for Each Signal
          </h2>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100">
                <TrendingUp className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <h3 className="mb-1 font-semibold text-slate-900">Score & Recommendation</h3>
                <p className="text-sm text-slate-600">Clear 0-100 score with Buy/Strong Buy label so you can quickly assess signal strength.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="mb-1 font-semibold text-slate-900">Trader Profile</h3>
                <p className="text-sm text-slate-600">Who made the trade, their P&L, win rate, and expertise category. Link to full profile.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100">
                <Eye className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h3 className="mb-1 font-semibold text-slate-900">Market Details</h3>
                <p className="text-sm text-slate-600">Which market, entry price, current price, and live odds. Full context for your decision.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100">
                <Brain className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h3 className="mb-1 font-semibold text-slate-900">Score Breakdown</h3>
                <p className="text-sm text-slate-600">See exactly why the trade scored high: which factors contributed most to the signal.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="bg-slate-50 px-4 py-16 md:py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-slate-900 md:text-4xl">
            How Traders Use Signals
          </h2>

          <div className="space-y-8">
            <Card className="p-6">
              <h3 className="mb-3 text-xl font-bold text-slate-900">Market Discovery</h3>
              <p className="text-slate-600">
                With hundreds of active markets on Polymarket, finding the right opportunities is half the battle. The signal feed surfaces markets where skilled traders are putting real money behind their analysis. Instead of browsing every market, check the signal feed for where the smart money is flowing.
              </p>
            </Card>

            <Card className="p-6">
              <h3 className="mb-3 text-xl font-bold text-slate-900">Idea Validation</h3>
              <p className="text-slate-600">
                Already have a thesis? Check if top traders agree. When a trade you're considering also shows up as a high-signal opportunity, it adds confidence. Conversely, if no skilled traders are taking the other side of your bet, that's worth noting too.
              </p>
            </Card>

            <Card className="p-6">
              <h3 className="mb-3 text-xl font-bold text-slate-900">Time Savings</h3>
              <p className="text-slate-600">
                Stop spending hours scanning markets and analyzing trader activity. The AI does this 24/7 and surfaces only trades that meet the threshold. Check the feed once or twice a day and you'll catch the best opportunities without the screen time.
              </p>
            </Card>

            <Card className="p-6">
              <h3 className="mb-3 text-xl font-bold text-slate-900">Learning Tool</h3>
              <p className="text-slate-600">
                Study what makes a trade high-signal. Over time, you'll start recognizing the patterns yourself: which price levels represent edge, what conviction looks like, and how timing affects outcomes. The signals feed is a masterclass in prediction market analysis.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-white px-4 py-16 md:py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-slate-900 md:text-4xl">
            Signal Access
          </h2>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-2 border-slate-200 p-6">
              <Badge className="mb-4 bg-green-100 text-green-700 hover:bg-green-100">Free</Badge>
              <h3 className="mb-3 text-2xl font-bold text-slate-900">Followed Trader Signals</h3>
              <p className="mb-6 text-slate-600">
                See AI-scored trades from traders you follow in your personalized feed.
              </p>
              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  Signal scores on followed trader trades
                </li>
                <li className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  Buy/Strong Buy recommendations
                </li>
                <li className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  Score breakdowns
                </li>
                <li className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  Manual trade copying
                </li>
              </ul>
              <Button asChild className="mt-6 w-full" variant="outline">
                <Link href="/login">Get Started Free</Link>
              </Button>
            </Card>

            <Card className="border-2 border-indigo-300 bg-indigo-50/30 p-6">
              <Badge className="mb-4 bg-indigo-100 text-indigo-700 hover:bg-indigo-100">Premium - $20/mo</Badge>
              <h3 className="mb-3 text-2xl font-bold text-slate-900">Full Signal Feed</h3>
              <p className="mb-6 text-slate-600">
                Access the complete high-signal feed scanning all 500K+ traders across every category.
              </p>
              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-orange-500" />
                  Full high-signal feed (all traders)
                </li>
                <li className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-orange-500" />
                  Real-time scoring across all markets
                </li>
                <li className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-orange-500" />
                  One-click trade execution
                </li>
                <li className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-orange-500" />
                  Category filtering
                </li>
                <li className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-orange-500" />
                  Auto-close when trader exits
                </li>
              </ul>
              <Button asChild className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 text-white">
                <Link href="/pricing">Unlock Premium</Link>
              </Button>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-slate-50 px-4 py-16 md:py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-slate-900 md:text-4xl">
            Frequently Asked Questions
          </h2>

          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="what-are-signals" className="rounded-lg border border-slate-200 bg-white px-6">
              <AccordionTrigger className="text-left font-semibold text-slate-900 hover:no-underline">
                What are high-signal trades?
              </AccordionTrigger>
              <AccordionContent className="text-slate-600">
                High-signal trades are Polymarket positions that our AI scoring system identifies as having strong conviction, favorable pricing, skilled trader backing, and good market timing. Each trade is scored 0-100, and only Buy (60+) and Strong Buy (75+) trades make it to the feed. Neutral, Avoid, and Toxic trades are automatically filtered out.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="how-accurate" className="rounded-lg border border-slate-200 bg-white px-6">
              <AccordionTrigger className="text-left font-semibold text-slate-900 hover:no-underline">
                How accurate are the AI signals?
              </AccordionTrigger>
              <AccordionContent className="text-slate-600">
                The scoring system is designed to filter noise, not predict outcomes. High-signal trades have a statistically better risk/reward profile than random trades, but <strong>no system can guarantee profits</strong>. Higher scores indicate stronger conviction and better positioning, not certainty. Use signals as one input in your decision-making process.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="different-from-feed" className="rounded-lg border border-slate-200 bg-white px-6">
              <AccordionTrigger className="text-left font-semibold text-slate-900 hover:no-underline">
                How is this different from the regular feed?
              </AccordionTrigger>
              <AccordionContent className="text-slate-600">
                Your regular feed shows all trades from traders you follow. The high-signal feed is a <strong>curated subset</strong> that only surfaces the highest-scoring trades from across the entire Polymarket ecosystem (not just traders you follow). It scans 500K+ traders and uses AI to find the best opportunities you might otherwise miss.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="signals-vs-bots" className="rounded-lg border border-slate-200 bg-white px-6">
              <AccordionTrigger className="text-left font-semibold text-slate-900 hover:no-underline">
                Signals vs Bots - what should I use?
              </AccordionTrigger>
              <AccordionContent className="text-slate-600">
                <strong>Use both!</strong> Signals help you find and manually select individual high-confidence trades. <Link href="/polymarket-trading-bots" className="font-medium text-indigo-600">Trading bots</Link> automatically execute entire strategies. Signals are for traders who want full control over each decision. Bots are for traders who want consistent, automated execution. Many users follow bots while also cherry-picking individual signals.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="how-often" className="rounded-lg border border-slate-200 bg-white px-6">
              <AccordionTrigger className="text-left font-semibold text-slate-900 hover:no-underline">
                How often are new signals surfaced?
              </AccordionTrigger>
              <AccordionContent className="text-slate-600">
                The system continuously scans Polymarket in real-time. New high-signal trades appear throughout the day, with volume peaking during active market hours and before major events (elections, sports games, etc.). The feed auto-refreshes every 30 seconds for premium users.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="can-i-copy" className="rounded-lg border border-slate-200 bg-white px-6">
              <AccordionTrigger className="text-left font-semibold text-slate-900 hover:no-underline">
                Can I copy high-signal trades directly?
              </AccordionTrigger>
              <AccordionContent className="text-slate-600">
                Yes! Free users can manually copy any trade they see. Premium users ($20/mo) can copy with one click directly through Polycopy, without navigating to Polymarket. Premium also includes auto-close functionality: when the original trader exits, your position closes too.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-br from-orange-600 to-red-600 px-4 py-16 text-white md:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-6 text-3xl font-bold md:text-4xl">
            Stop Guessing. Start Using Data.
          </h2>
          <p className="mb-8 text-lg text-orange-100">
            Let AI scan 500K+ traders and surface only the highest-conviction trades for you.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button asChild size="lg" className="bg-white text-orange-700 hover:bg-orange-50 font-semibold">
              <Link href="/v2/feed">
                See Live Signals
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20">
              <Link href="/polymarket-trading-bots">Explore Trading Bots</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="bg-amber-50 border-t border-amber-200 px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex gap-4">
            <div className="shrink-0">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-amber-900">
                Important Disclaimer
              </h3>
              <p className="text-sm leading-relaxed text-amber-900">
                <strong>This is not financial advice.</strong> AI signal scores are informational tools, not guarantees of profitability. High-signal trades have better risk/reward profiles than average, but all trading involves risk of loss. Past performance of the scoring system, traders, or bots does not guarantee future results. The scoring system may produce false positives or fail to account for unprecedented market events. Only trade with capital you can afford to lose. Polycopy is not responsible for trading losses. Users are solely responsible for their own trading decisions.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
