'use client';

import Link from 'next/link';
import { ArrowRight, TrendingUp, Users, Shield, Brain, AlertCircle, CheckCircle2, DollarSign, Target, BookOpen, X } from 'lucide-react';

export default function PredictionMarketsForBeginnersPage() {
  return (
    <main className="min-h-screen bg-poly-cream">
      {/* Hero Section */}
      <section className="bg-poly-cream border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-16 md:py-24">
          <div className="text-center">
            <h1 className="font-sans font-black uppercase tracking-tight text-poly-black text-4xl md:text-5xl mb-6">
              Prediction Markets for Beginners
            </h1>
            <p className="font-body text-sm leading-relaxed text-muted-foreground text-xl mb-8">
              Never traded prediction markets before? No problem. This guide will teach you everything you need to know to start betting confidently on Polymarket.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/v2/how-to-copy-trade-polymarket"
                className="inline-flex items-center justify-center bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
              >
                Start Copy Trading
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
              <Link
                href="/v2/top-traders"
                className="inline-flex items-center justify-center border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
              >
                Browse Top Traders
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* What Are Prediction Markets */}
      <section className="py-16 md:py-20 bg-poly-paper border-b border-border">
        <div className="max-w-4xl mx-auto px-4">
          <div className="mb-12">
            <h2 className="font-sans font-black uppercase tracking-tight text-poly-black text-3xl md:text-4xl mb-6">
              What Are Prediction Markets?
            </h2>
            <div className="max-w-none">
              <p className="font-body text-sm leading-relaxed text-muted-foreground text-lg mb-6">
                Prediction markets are platforms where you can buy and sell shares based on the outcome of future events. Think of it like betting on sports, but instead of just sports outcomes, you can bet on elections, economics, entertainment, and more - all based on real-world outcomes.
              </p>
              <div className="border-l-4 border-poly-yellow bg-poly-cream p-6 my-8">
                <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-3 flex items-center">
                  <Brain className="w-6 h-6 mr-2 text-poly-yellow" />
                  Example: Election Prediction
                </h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  If there's a market for "Will Candidate A win the election?", you can buy "Yes" shares if you think they'll win, or "No" shares if you think they'll lose. Share prices range from $0.01 to $0.99 and represent the market's collective belief about the probability of that outcome.
                </p>
                <p className="font-body text-sm leading-relaxed text-muted-foreground mt-4">
                  If you buy "Yes" at $0.65 and the candidate wins, each share pays out $1.00. Your profit is $0.35 per share. If they lose, your shares are worth $0.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How They Work */}
      <section className="py-16 md:py-20 bg-poly-cream border-b border-border">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-sans font-black uppercase tracking-tight text-poly-black text-3xl md:text-4xl mb-12 text-center">
            How Prediction Markets Work
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="flex h-10 w-10 items-center justify-center border border-border mb-4 text-profit-green">
                <span className="font-sans text-2xl font-bold">1</span>
              </div>
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-3">Browse Markets</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Find events you understand and have opinions about. Politics, sports, crypto, economics, tech - Polymarket has markets for all major events.
              </p>
            </div>

            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="flex h-10 w-10 items-center justify-center border border-border mb-4 text-poly-yellow">
                <span className="font-sans text-2xl font-bold">2</span>
              </div>
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-3">Buy Shares</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                If you think the market's probability is wrong, buy shares. Pay $0.60 for a "Yes" share? If it resolves Yes, you get $1.00 back.
              </p>
            </div>

            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="flex h-10 w-10 items-center justify-center border border-border mb-4 text-poly-yellow">
                <span className="font-sans text-2xl font-bold">3</span>
              </div>
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-3">Market Resolves</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                When the event concludes, the market resolves. Correct predictions pay $1.00 per share. Incorrect predictions pay $0.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Trade Prediction Markets */}
      <section className="py-16 md:py-20 bg-poly-paper border-b border-border">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-sans font-black uppercase tracking-tight text-poly-black text-3xl md:text-4xl mb-12 text-center">
            Why Trade Prediction Markets?
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-profit-green">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
              <div>
                <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-2">Profit from Your Knowledge</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  If you have insights others don't, you can profit from being right. Your political analysis, sports knowledge, or tech expertise has real value.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow">
                  <Brain className="w-5 h-5" />
                </div>
              </div>
              <div>
                <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-2">Improve Your Thinking</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Trading forces you to quantify your beliefs and think probabilistically. You'll become better at evaluating uncertainty and making predictions.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow">
                  <Shield className="w-5 h-5" />
                </div>
              </div>
              <div>
                <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-2">Hedge Real-World Risks</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Running a business affected by politics? Holding crypto? You can hedge real-world risks by taking positions in related prediction markets.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow">
                  <Target className="w-5 h-5" />
                </div>
              </div>
              <div>
                <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-2">More Transparent Than Traditional Betting</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  On-chain markets with transparent order books. No hidden fees, no black-box odds. You see exactly what the market believes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Platforms */}
      <section className="py-16 md:py-20 bg-poly-cream border-b border-border">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-sans font-black uppercase tracking-tight text-poly-black text-3xl md:text-4xl mb-12 text-center">
            Popular Prediction Market Platforms
          </h2>
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <div className="border-2 border-poly-yellow bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl">Polymarket</h3>
                <span className="bg-poly-yellow px-4 py-2 font-sans text-xs font-bold uppercase tracking-widest text-poly-black">FEATURED</span>
              </div>
              <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
                The largest crypto-based prediction market. Trade on politics, sports, crypto, and more. On-chain, transparent, global access.
              </p>
              <p className="font-body text-sm text-muted-foreground mb-4">
                <strong className="text-poly-black">Best for:</strong> Crypto users, US traders, high-volume markets
              </p>
              <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer" className="text-poly-yellow hover:underline font-semibold text-sm">
                Visit Polymarket →
              </a>
            </div>

            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-4">Kalshi</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
                CFTC-regulated US prediction market. Trade with USD, FDIC-insured accounts, legal for US residents.
              </p>
              <p className="font-body text-sm text-muted-foreground mb-4">
                <strong className="text-poly-black">Best for:</strong> US residents, traditional finance users
              </p>
              <a href="https://kalshi.com" target="_blank" rel="noopener noreferrer" className="text-poly-yellow hover:underline font-semibold text-sm">
                Visit Kalshi →
              </a>
            </div>

            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-4">Manifold</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
                Play-money prediction market. Free to use, great for learning without risk. Community-created markets.
              </p>
              <p className="font-body text-sm text-muted-foreground mb-4">
                <strong className="text-poly-black">Best for:</strong> Beginners, learning, fun/casual trading
              </p>
              <a href="https://manifold.markets" target="_blank" rel="noopener noreferrer" className="text-poly-yellow hover:underline font-semibold text-sm">
                Visit Manifold →
              </a>
            </div>
          </div>
          <p className="text-center font-body text-sm text-muted-foreground">
            This guide focuses on Polymarket, the most popular platform. <Link href="/v2/polymarket-vs-other-platforms" className="text-poly-yellow hover:underline font-medium">Compare all platforms →</Link>
          </p>
        </div>
      </section>

      {/* Getting Started Steps */}
      <section className="py-16 md:py-20 bg-poly-paper border-b border-border">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-sans font-black uppercase tracking-tight text-poly-black text-3xl md:text-4xl mb-12 text-center">
            How to Get Started on Polymarket (5 Steps)
          </h2>
          <div className="space-y-6">
            <div className="border-l-4 border-profit-green bg-card p-6">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-3">
                Step 1: Set Up a Wallet
              </h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Polymarket runs on the Polygon blockchain. You'll need a crypto wallet (MetaMask is popular) and some USDC stablecoin to trade. Don't worry - it's easier than it sounds, and Polymarket has guides.
              </p>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-3">
                Step 2: Start Small
              </h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Your first few trades should be small. Think $5-20 per position. Focus on learning how the platform works and how prices move, not on making huge profits.
              </p>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-3">
                Step 3: Pick Markets You Understand
              </h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Don't trade obscure geopolitical events if you're not a foreign policy expert. Start with categories where you have genuine knowledge - maybe sports if you follow leagues closely, or tech if you work in the industry.
              </p>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-3">
                Step 4: Follow Successful Traders
              </h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
                One of the best ways to learn is by watching profitable traders. Polycopy makes this easy - follow top performers, see their trades in real-time, and understand their reasoning.
              </p>
              <Link
                href="/v2/top-traders"
                className="inline-flex items-center justify-center border border-poly-black px-6 py-2.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
              >
                Browse Top Traders
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-3">
                Step 5: Learn from Every Trade
              </h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Keep a simple log: Why did you make this trade? What was your thesis? What happened? Win or lose, every trade teaches you something about the market and your own judgment.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Common Beginner Mistakes */}
      <section className="py-16 md:py-20 bg-poly-cream border-b border-border">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-sans font-black uppercase tracking-tight text-poly-black text-3xl md:text-4xl mb-12 text-center">
            Common Beginner Mistakes to Avoid
          </h2>
          <div className="space-y-6">
            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow flex-shrink-0">
                  <X className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-2">Trading Markets You Don't Understand</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    Just because a market exists doesn't mean you should trade it. If you can't explain why the current price is wrong, don't trade.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow flex-shrink-0">
                  <X className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-2">Ignoring Base Rates</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    "I have a feeling" isn't a strategy. Before betting against the market, ask: What do I know that thousands of other traders don't? If you can't answer that, reconsider.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow flex-shrink-0">
                  <X className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-2">Overtrading</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    You don't need to have an active position in every market. The best traders are selective. Wait for opportunities where you have a real edge.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow flex-shrink-0">
                  <X className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-2">Letting Emotions Drive Decisions</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    You're rooting for Team A, so you buy "Yes" at $0.90 even though the odds are poor. Bad idea. Trade what you think will happen, not what you want to happen.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow flex-shrink-0">
                  <X className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-2">Not Understanding Timing</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    A market can be "wrong" for months before resolving correctly. Make sure you can afford to have your capital tied up until resolution.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Beginner Strategies */}
      <section className="py-16 md:py-20 bg-poly-paper border-b border-border">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-sans font-black uppercase tracking-tight text-poly-black text-3xl md:text-4xl mb-12 text-center">
            3 Beginner-Friendly Strategies
          </h2>
          <div className="space-y-8">
            <div className="border border-border bg-card p-8 transition-all hover:border-poly-yellow">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-profit-green">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-2xl">Copy Trading</h3>
              </div>
              <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
                The easiest way to start. Follow experienced traders on Polycopy, see their trades as they happen, and decide which ones to copy. You learn while you trade.
              </p>
              <p className="font-body text-sm text-muted-foreground mb-4">
                <strong className="text-poly-black">Best for:</strong> Complete beginners who want to learn from successful traders.
              </p>
              <Link
                href="/v2/copy-trading"
                className="inline-flex items-center justify-center border border-poly-black px-6 py-2.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
              >
                Learn About Copy Trading
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </div>

            <div className="border border-border bg-card p-8 transition-all hover:border-poly-yellow">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow">
                  <BookOpen className="w-5 h-5" />
                </div>
                <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-2xl">Event-Based Trading</h3>
              </div>
              <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
                Trade around scheduled events where you have an information edge. Sports games, earnings reports, political debates - events with clear timelines and outcomes.
              </p>
              <p className="font-body text-sm text-muted-foreground">
                <strong className="text-poly-black">Best for:</strong> Beginners who follow specific domains closely (sports, tech, politics).
              </p>
            </div>

            <div className="border border-border bg-card p-8 transition-all hover:border-poly-yellow">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow">
                  <DollarSign className="w-5 h-5" />
                </div>
                <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-2xl">High-Confidence, Low-Frequency</h3>
              </div>
              <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
                Only trade when you're highly confident the market is mispriced. Maybe that's once a week, or once a month. Quality over quantity.
              </p>
              <p className="font-body text-sm text-muted-foreground">
                <strong className="text-poly-black">Best for:</strong> Beginners with limited time who want to be strategic and selective.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Resources */}
      <section className="py-16 md:py-20 bg-poly-cream border-b border-border">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-sans font-black uppercase tracking-tight text-poly-black text-3xl md:text-4xl mb-12 text-center">
            Keep Learning
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Link href="/v2/polymarket-trading-strategies" className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-2 flex items-center">
                <TrendingUp className="w-5 h-5 mr-2 text-profit-green" />
                Trading Strategies
              </h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Learn 6 proven strategies used by profitable Polymarket traders, from event-based to arbitrage.
              </p>
            </Link>

            <Link href="/v2/top-traders" className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-2 flex items-center">
                <Users className="w-5 h-5 mr-2 text-poly-yellow" />
                Top Traders
              </h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Browse the highest-performing traders on Polymarket and see what they're trading in real-time.
              </p>
            </Link>

            <Link href="/v2/polymarket-vs-other-platforms" className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-2 flex items-center">
                <Shield className="w-5 h-5 mr-2 text-poly-yellow" />
                Platform Comparison
              </h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                See how Polymarket compares to other prediction markets like Kalshi, PredictIt, and Manifold.
              </p>
            </Link>

            <Link href="/v2/how-to-copy-trade-polymarket" className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-2 flex items-center">
                <Target className="w-5 h-5 mr-2 text-poly-yellow" />
                How to Copy Trade
              </h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Step-by-step guide to copying successful traders and learning from their strategies.
              </p>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-20 bg-poly-black text-white border-b border-border">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="font-sans font-black uppercase tracking-tight text-3xl md:text-4xl mb-6">
            Ready to Start Trading?
          </h2>
          <p className="font-body text-xl text-white/80 mb-4 leading-relaxed">
            Follow top traders, see their strategies in action, and start making informed decisions.
          </p>
          <p className="font-body text-lg text-white/80 mb-8 leading-relaxed">
            Not sure which markets to trade? <Link href="/v2/polymarket-market-categories" className="text-poly-yellow hover:underline font-semibold">Explore all market categories</Link> to find topics you know well.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="https://polycopy.app"
              className="inline-flex items-center justify-center bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow border border-poly-yellow"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
            <Link
              href="/v2/pricing"
              className="inline-flex items-center justify-center border border-white px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-white transition-all hover:border-poly-yellow hover:bg-poly-yellow hover:text-poly-black"
            >
              View Pricing
            </Link>
          </div>
          <p className="font-body text-sm text-white/60 mt-6">
            Free to browse. No credit card required to start following traders.
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="bg-poly-paper py-8 border-t border-border">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="font-body text-sm leading-relaxed text-muted-foreground">
              <strong className="text-poly-black">Not Financial Advice:</strong> This guide is for educational purposes only. Prediction market trading involves risk, and you can lose money. Past performance does not guarantee future results. Only trade with money you can afford to lose. Do your own research and consider your personal financial situation before trading.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
