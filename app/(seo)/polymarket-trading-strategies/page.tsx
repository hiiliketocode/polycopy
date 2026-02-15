'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  TrendingUp,
  Target,
  Zap,
  BarChart3,
  Shield,
  CheckCircle2,
  Calendar,
  LineChart,
  Eye,
  Users,
  AlertCircle,
  ChevronDown,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';

export default function TradingStrategiesPage() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const faqs = [
    {
      question: "What's the most profitable Polymarket strategy?",
      answer: "There's no single 'best' strategy - it depends on your knowledge and time commitment. Event-based trading (betting on outcomes you deeply understand) tends to be most profitable for beginners. Momentum trading works well for active traders. Arbitrage requires speed but has lower risk. Most successful traders combine multiple strategies."
    },
    {
      question: "How much capital do I need for each strategy?",
      answer: "Event-based and momentum strategies can start with $50-100. Arbitrage needs slightly more ($200-500) to make spreads worthwhile. Portfolio strategies work at any scale but benefit from $500+ to diversify properly. Start small with any strategy and scale up as you prove it works for you."
    },
    {
      question: "Can I combine multiple strategies?",
      answer: "Yes, and you should! Most successful traders use event-based trading for high-conviction bets, momentum trading for quick opportunities, and portfolio diversification for stability. Don't put all eggs in one strategy basket."
    },
    {
      question: "How long does it take to be profitable?",
      answer: "Most traders see results within 2-4 weeks if they stick to one strategy and track performance. Expect some losing trades while learning - focus on overall win rate and ROI over time, not individual trade outcomes. Give yourself 20-30 trades before judging if a strategy works for you."
    },
    {
      question: "What's the biggest mistake traders make with strategies?",
      answer: "Switching strategies too quickly. Pick one, commit to it for 20+ trades, track results. If it's not working after that sample size, then adjust. Most traders give up on strategies too early, before they've learned the nuances."
    }
  ];

  return (
    <main className="min-h-screen bg-poly-cream">
      {/* Hero Section */}
      <section className="border-b border-border bg-poly-paper pt-20 pb-16 md:pt-32 md:pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <div className="mb-6 inline-flex items-center gap-2 bg-poly-yellow px-4 py-2 font-sans text-xs font-bold uppercase tracking-widest text-poly-black">
              <Target className="w-4 h-4" />
              <span>Proven strategies</span>
            </div>

            <h1 className="font-sans text-4xl font-black uppercase tracking-tight text-poly-black leading-tight mb-6 sm:text-5xl md:text-6xl">
              Polymarket Trading{' '}
              <span className="text-poly-yellow">Strategies</span>
            </h1>

            <p className="font-body text-xl leading-relaxed text-muted-foreground mb-8">
              Learn the betting strategies top Polymarket traders actually use.<br className="hidden sm:inline" />
              From momentum trading to event-based betting to risk management.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/v2/top-traders"
                className="inline-flex items-center justify-center bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
              >
                See Top Traders
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
              <Link
                href="/v2/login?mode=signup"
                className="inline-flex items-center justify-center border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
              >
                Start Free
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Strategy Overview */}
      <section className="border-b border-border bg-poly-cream py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans text-3xl font-black uppercase tracking-tight text-poly-black mb-4 md:text-4xl">
              6 Prediction Market Betting Strategies
            </h2>
            <p className="font-body text-xl leading-relaxed text-muted-foreground">
              Choose betting strategies based on your knowledge and time commitment
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Calendar,
                title: "Event-Based Trading",
                description: "Bet on outcomes you deeply understand. Best for beginners.",
                difficulty: "Beginner",
                timeCommit: "Low",
                capital: "$50+",
                anchor: "event-based"
              },
              {
                icon: Zap,
                title: "Momentum Trading",
                description: "Follow price movements and market sentiment. Fast-paced.",
                difficulty: "Intermediate",
                timeCommit: "High",
                capital: "$100+",
                anchor: "momentum"
              },
              {
                icon: LineChart,
                title: "Arbitrage",
                description: "Exploit price differences between markets. Lower risk.",
                difficulty: "Intermediate",
                timeCommit: "Medium",
                capital: "$200+",
                anchor: "arbitrage"
              },
              {
                icon: BarChart3,
                title: "Portfolio Strategy",
                description: "Diversify across multiple markets. Stability over speed.",
                difficulty: "Beginner",
                timeCommit: "Low",
                capital: "$500+",
                anchor: "portfolio"
              },
              {
                icon: Target,
                title: "Contrarian Trading",
                description: "Bet against the crowd when odds are wrong. Advanced.",
                difficulty: "Advanced",
                timeCommit: "Medium",
                capital: "$100+",
                anchor: "contrarian"
              },
              {
                icon: Users,
                title: "Copy Trading",
                description: "Follow successful traders and copy their moves. Learn by doing.",
                difficulty: "Beginner",
                timeCommit: "Low",
                capital: "$50+",
                anchor: "copy-trading"
              }
            ].map((strategy, index) => {
              const Icon = strategy.icon;
              return (
                <div
                  key={index}
                  className="border border-border bg-card p-6 transition-all hover:border-poly-yellow cursor-pointer group"
                  onClick={() => {
                    document.getElementById(strategy.anchor)?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                    <Icon className="h-5 w-5 text-poly-yellow" />
                  </div>
                  <h3 className="font-sans text-xl font-black uppercase tracking-tight text-poly-black mb-2 group-hover:text-poly-yellow transition-colors">{strategy.title}</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">{strategy.description}</p>
                  <div className="space-y-2 font-body text-xs mb-4">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Difficulty:</span>
                      <span className="font-medium text-poly-black">{strategy.difficulty}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Time:</span>
                      <span className="font-medium text-poly-black">{strategy.timeCommit}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Min. Capital:</span>
                      <span className="font-medium text-poly-black">{strategy.capital}</span>
                    </div>
                  </div>
                  <div className="inline-flex items-center justify-center w-full border border-poly-black px-4 py-2 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all group-hover:border-poly-yellow group-hover:text-poly-yellow">
                    Learn More
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Detailed Strategies */}
      <section className="border-b border-border bg-poly-paper py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans text-3xl font-black uppercase tracking-tight text-poly-black mb-4 md:text-4xl">
              Strategy Deep Dives
            </h2>
          </div>

          <div className="space-y-8">
            {/* Event-Based */}
            <div className="border border-border bg-card p-8 transition-all hover:border-poly-yellow" id="event-based">
              <div className="flex items-start gap-4 mb-6">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-border">
                  <Calendar className="h-5 w-5 text-poly-yellow" />
                </div>
                <div className="flex-1">
                  <h3 className="font-sans text-2xl font-black uppercase tracking-tight text-poly-black mb-2">Event-Based Trading</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">Best for beginners. Bet on outcomes in areas where you have deep knowledge.</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-3">How It Works:</h4>
                  <ul className="space-y-2 font-body text-sm leading-relaxed text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-profit-green mt-0.5 flex-shrink-0" />
                      <span>Pick markets you understand (NBA if you follow basketball, elections if you follow politics)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-profit-green mt-0.5 flex-shrink-0" />
                      <span>Do your own research on the event</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-profit-green mt-0.5 flex-shrink-0" />
                      <span>Bet when you have conviction the market is wrong</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-profit-green mt-0.5 flex-shrink-0" />
                      <span>Hold until event resolves</span>
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-3">Best For:</h4>
                  <ul className="space-y-2 font-body text-sm leading-relaxed text-muted-foreground">
                    <li>• Domain experts (sports fans, political junkies, crypto natives)</li>
                    <li>• Patient traders who can wait for events to resolve</li>
                    <li>• Those who prefer fewer, higher-conviction bets</li>
                  </ul>
                  <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-2 mt-4">Example:</h4>
                  <p className="font-body text-sm text-muted-foreground italic">You follow NBA closely. Market has Lakers winning at 40% but you know their star player is injured. You bet No at favorable odds.</p>
                </div>
              </div>
            </div>

            {/* Momentum */}
            <div className="border border-border bg-card p-8 transition-all hover:border-poly-yellow" id="momentum">
              <div className="flex items-start gap-4 mb-6">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-border">
                  <Zap className="h-5 w-5 text-poly-yellow" />
                </div>
                <div className="flex-1">
                  <h3 className="font-sans text-2xl font-black uppercase tracking-tight text-poly-black mb-2">Momentum Trading</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">Follow price movements. Get in when momentum is strong, get out quickly.</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-3">How It Works:</h4>
                  <ul className="space-y-2 font-body text-sm leading-relaxed text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-profit-green mt-0.5 flex-shrink-0" />
                      <span>Watch for rapid price changes (5-10% moves in hours)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-profit-green mt-0.5 flex-shrink-0" />
                      <span>Enter positions during strong trends</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-profit-green mt-0.5 flex-shrink-0" />
                      <span>Set profit targets (10-20% gains)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-profit-green mt-0.5 flex-shrink-0" />
                      <span>Exit quickly when momentum stalls</span>
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-3">Best For:</h4>
                  <ul className="space-y-2 font-body text-sm leading-relaxed text-muted-foreground">
                    <li>• Active traders who check markets multiple times daily</li>
                    <li>• Those comfortable with faster-paced trading</li>
                    <li>• Traders following top performers who use this strategy</li>
                  </ul>
                  <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-2 mt-4">Example:</h4>
                  <p className="font-body text-sm text-muted-foreground italic">Breaking news moves a market from 50% to 65% rapidly. You enter at 67%, ride momentum to 75%, exit with quick profit.</p>
                </div>
              </div>
            </div>

            {/* Arbitrage */}
            <div className="border border-border bg-card p-8 transition-all hover:border-poly-yellow" id="arbitrage">
              <div className="flex items-start gap-4 mb-6">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-border">
                  <LineChart className="h-5 w-5 text-poly-yellow" />
                </div>
                <div className="flex-1">
                  <h3 className="font-sans text-2xl font-black uppercase tracking-tight text-poly-black mb-2">Arbitrage</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">Exploit price differences. Lower risk, requires speed and capital.</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-3">How It Works:</h4>
                  <ul className="space-y-2 font-body text-sm leading-relaxed text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-profit-green mt-0.5 flex-shrink-0" />
                      <span>Find same event on multiple platforms with different odds</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-profit-green mt-0.5 flex-shrink-0" />
                      <span>Buy low on one platform, sell high on another</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-profit-green mt-0.5 flex-shrink-0" />
                      <span>Lock in guaranteed profit regardless of outcome</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-profit-green mt-0.5 flex-shrink-0" />
                      <span>Act fast before spreads disappear</span>
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-3">Best For:</h4>
                  <ul className="space-y-2 font-body text-sm leading-relaxed text-muted-foreground">
                    <li>• Traders with capital across multiple platforms</li>
                    <li>• Those who want lower-risk, smaller but consistent gains</li>
                    <li>• Technical traders comfortable with quick execution</li>
                  </ul>
                  <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-2 mt-4">Example:</h4>
                  <p className="font-body text-sm text-muted-foreground italic">Same event priced at 60¢ Yes on Polymarket, 45¢ No on another platform. Buy both sides for 105¢ total, guaranteed 100¢ payout = 5% profit.</p>
                </div>
              </div>
            </div>

            {/* Portfolio */}
            <div className="border border-border bg-card p-8 transition-all hover:border-poly-yellow" id="portfolio">
              <div className="flex items-start gap-4 mb-6">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-border">
                  <BarChart3 className="h-5 w-5 text-poly-yellow" />
                </div>
                <div className="flex-1">
                  <h3 className="font-sans text-2xl font-black uppercase tracking-tight text-poly-black mb-2">Portfolio Strategy</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">Diversify across many markets for stability and consistent returns.</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-3">How It Works:</h4>
                  <ul className="space-y-2 font-body text-sm leading-relaxed text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-profit-green mt-0.5 flex-shrink-0" />
                      <span>Spread capital across 10-20 different markets</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-profit-green mt-0.5 flex-shrink-0" />
                      <span>Mix categories (sports, politics, crypto, etc.)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-profit-green mt-0.5 flex-shrink-0" />
                      <span>Rebalance monthly based on performance</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-profit-green mt-0.5 flex-shrink-0" />
                      <span>Focus on long-term ROI, not individual trades</span>
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-3">Best For:</h4>
                  <ul className="space-y-2 font-body text-sm leading-relaxed text-muted-foreground">
                    <li>• Traders with larger bankrolls ($500+)</li>
                    <li>• Those who want stability over quick gains</li>
                    <li>• Part-time traders who can&apos;t watch markets constantly</li>
                  </ul>
                  <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-2 mt-4">Example:</h4>
                  <p className="font-body text-sm text-muted-foreground italic">Allocate $50 each to 20 different markets. If 15 win and 5 lose, your portfolio gains 10-15% overall even though some individual trades failed.</p>
                </div>
              </div>
            </div>

            {/* Contrarian */}
            <div className="border border-border bg-card p-8 transition-all hover:border-poly-yellow" id="contrarian">
              <div className="flex items-start gap-4 mb-6">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-border">
                  <Target className="h-5 w-5 text-poly-yellow" />
                </div>
                <div className="flex-1">
                  <h3 className="font-sans text-2xl font-black uppercase tracking-tight text-poly-black mb-2">Contrarian Trading</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">Bet against the crowd when market sentiment is clearly wrong. Advanced.</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-3">How It Works:</h4>
                  <ul className="space-y-2 font-body text-sm leading-relaxed text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-profit-green mt-0.5 flex-shrink-0" />
                      <span>Identify markets where crowd is clearly emotional/wrong</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-profit-green mt-0.5 flex-shrink-0" />
                      <span>Bet opposite direction when odds are mispriced</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-profit-green mt-0.5 flex-shrink-0" />
                      <span>Requires strong conviction and patience</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-profit-green mt-0.5 flex-shrink-0" />
                      <span>Often means going against popular narratives</span>
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-3">Best For:</h4>
                  <ul className="space-y-2 font-body text-sm leading-relaxed text-muted-foreground">
                    <li>• Experienced traders with strong market knowledge</li>
                    <li>• Those comfortable being wrong and managing drawdowns</li>
                    <li>• Independent thinkers who do deep research</li>
                  </ul>
                  <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-2 mt-4">Example:</h4>
                  <p className="font-body text-sm text-muted-foreground italic">Everyone thinks Team A will dominate, pushing odds to 85%. But you notice key injuries and bet No at 15¢ - great value if you&apos;re right about mispric ing.</p>
                </div>
              </div>
            </div>

            {/* Copy Trading */}
            <div className="border-2 border-poly-yellow bg-card p-8 transition-all hover:border-poly-yellow" id="copy-trading">
              <div className="flex items-start gap-4 mb-6">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-border bg-poly-yellow">
                  <Users className="h-5 w-5 text-poly-black" />
                </div>
                <div className="flex-1">
                  <h3 className="font-sans text-2xl font-black uppercase tracking-tight text-poly-black mb-2">Copy Trading (via Polycopy)</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">Follow successful traders and learn by watching their strategies in action.</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-3">How It Works:</h4>
                  <ul className="space-y-2 font-body text-sm leading-relaxed text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-poly-yellow mt-0.5 flex-shrink-0" />
                      <span>Follow top traders who use strategies that fit your style</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-poly-yellow mt-0.5 flex-shrink-0" />
                      <span>See their trades in real-time in your curated feed</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-poly-yellow mt-0.5 flex-shrink-0" />
                      <span>Pick which trades to copy (curation over automation)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-poly-yellow mt-0.5 flex-shrink-0" />
                      <span>Learn patterns and develop your own edge over time</span>
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-3">Best For:</h4>
                  <ul className="space-y-2 font-body text-sm leading-relaxed text-muted-foreground">
                    <li>• Beginners who want to learn from successful traders</li>
                    <li>• Anyone wanting to see strategies in action</li>
                    <li>• Traders who value curated opportunities over manual research</li>
                  </ul>
                  <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-2 mt-4">Why Polycopy:</h4>
                  <p className="font-body text-sm text-muted-foreground">The only platform that lets you follow and copy top Polymarket traders. See what successful traders do in real-time, learn their patterns, copy what makes sense to you.</p>
                  <div className="mt-4">
                    <Link
                      href="/v2/login?mode=signup"
                      className="inline-flex items-center justify-center bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
                    >
                      Start Copy Trading Free
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Risk Management */}
            <div className="border border-border bg-card p-8 border-l-4 border-l-loss-red">
              <div className="flex items-start gap-4 mb-6">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-border">
                  <Shield className="h-5 w-5 text-loss-red" />
                </div>
                <div className="flex-1">
                  <h3 className="font-sans text-2xl font-black uppercase tracking-tight text-poly-black mb-2">Risk Management (Critical for All Strategies)</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">No strategy works without proper risk control.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="border border-border bg-poly-paper p-4">
                  <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-poly-yellow" />
                    Position Sizing Rule
                  </h4>
                  <p className="font-body text-sm text-muted-foreground">Never put more than 2-5% of your total bankroll on a single trade. If you have $1,000, max bet is $20-50 per trade. This protects you from one bad trade wiping you out.</p>
                </div>

                <div className="border border-border bg-poly-paper p-4">
                  <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-poly-yellow" />
                    Stop-Loss Mental Model
                  </h4>
                  <p className="font-body text-sm text-muted-foreground">Before entering any trade, decide: &quot;At what point am I wrong?&quot; If you buy Yes at 60¢, maybe you exit if it drops to 50¢. Don&apos;t hold losers hoping they recover.</p>
                </div>

                <div className="border border-border bg-poly-paper p-4">
                  <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-poly-yellow" />
                    Diversification
                  </h4>
                  <p className="font-body text-sm text-muted-foreground">Don&apos;t put all capital in one market type. Spread across sports, politics, crypto, etc. If one category has a bad week, others might compensate.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How to Choose Your Strategy */}
      <section className="border-b border-border bg-poly-cream py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans text-3xl font-black uppercase tracking-tight text-poly-black mb-4 md:text-4xl">
              Which Strategy Should You Choose?
            </h2>
            <p className="font-body text-xl leading-relaxed text-muted-foreground">
              Match strategy to your situation
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <h3 className="font-sans text-lg font-black uppercase tracking-tight text-poly-black mb-4">If You&apos;re New:</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">Start with Event-Based Trading in categories you know. Make 10-20 trades. Learn the basics. Then explore other strategies.</p>
              <p className="font-body text-xs text-muted-foreground italic">Recommended: Event-Based + Portfolio Diversification</p>
            </div>

            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <h3 className="font-sans text-lg font-black uppercase tracking-tight text-poly-black mb-4">If You&apos;re Active:</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">Use Momentum Trading + follow top traders on Polycopy. Check feed multiple times daily. Execute quick trades.</p>
              <p className="font-body text-xs text-muted-foreground italic">Recommended: Momentum + Copy Trading</p>
            </div>

            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <h3 className="font-sans text-lg font-black uppercase tracking-tight text-poly-black mb-4">If You Want Stability:</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">Focus on Portfolio Strategy. Diversify across 10-15 markets. Hold longer. Accept slower but steadier returns.</p>
              <p className="font-body text-xs text-muted-foreground italic">Recommended: Portfolio + Event-Based</p>
            </div>
          </div>
        </div>
      </section>

      {/* Copy Trading Integration */}
      <section className="border-b border-border bg-poly-paper py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="mb-6 inline-flex items-center gap-2 bg-poly-yellow px-4 py-2 font-sans text-xs font-bold uppercase tracking-widest text-poly-black">
              <Sparkles className="w-4 h-4" />
              <span>Learn faster with Polycopy</span>
            </div>
            <h2 className="font-sans text-3xl font-black uppercase tracking-tight text-poly-black mb-4 md:text-4xl">
              See These Strategies in Action
            </h2>
            <p className="font-body text-xl leading-relaxed text-muted-foreground max-w-2xl mx-auto">
              The fastest way to learn? Follow top traders who excel at each strategy and watch how they execute in real-time.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <Eye className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="font-sans text-lg font-black uppercase tracking-tight text-poly-black mb-2">Watch Strategies Live</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                See momentum traders execute fast trades. Watch event-based traders hold positions. Learn by observation before risking your own capital.
              </p>
            </div>

            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <Target className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="font-sans text-lg font-black uppercase tracking-tight text-poly-black mb-2">Copy What Works</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Start by copying traders who use strategies that match your style. Test the strategy with real trades before committing larger capital.
              </p>
            </div>

            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <TrendingUp className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="font-sans text-lg font-black uppercase tracking-tight text-poly-black mb-2">Build Your Own Edge</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Over time, internalize patterns and develop your own approach. Copy trading is training wheels for building long-term market sense.
              </p>
            </div>
          </div>

          <div className="border-2 border-poly-yellow bg-card p-8">
            <div className="max-w-3xl mx-auto text-center">
              <h3 className="font-sans text-2xl font-black uppercase tracking-tight text-poly-black mb-4">
                Follow 500K+ Traders on Polycopy
              </h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground mb-6">
                Filter traders by strategy type. Follow event-based traders for sports. Follow momentum traders for quick opportunities. Follow portfolio strategists for stability. See all their trades in one curated feed.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/v2/login?mode=signup"
                  className="inline-flex items-center justify-center bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
                >
                  Start Free
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
                <Link
                  href="/v2/top-traders"
                  className="inline-flex items-center justify-center border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
                >
                  Browse Top Traders
                </Link>
              </div>
              <p className="font-body text-sm text-muted-foreground mt-4">
                No credit card required • Follow unlimited traders • See all strategies
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section - Learn Strategies */}
      <section className="border-b border-border bg-poly-cream py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="mb-6 inline-flex items-center gap-2 bg-poly-yellow px-4 py-2 font-sans text-xs font-bold uppercase tracking-widest text-poly-black">
              <Sparkles className="w-4 h-4" />
              <span>Fast-track learning</span>
            </div>
            <h2 className="font-sans text-3xl font-black uppercase tracking-tight text-poly-black mb-4 md:text-4xl">
              Learn Strategies by Copying the Best
            </h2>
            <p className="font-body text-xl leading-relaxed text-muted-foreground max-w-2xl mx-auto">
              The fastest way to learn these strategies? Watch top traders execute them in real-time on Polycopy.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <Eye className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="font-sans text-lg font-black uppercase tracking-tight text-poly-black mb-2">See Strategies in Action</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Filter traders by strategy. Watch how momentum traders operate vs. event-based traders. Learn by observation.
              </p>
            </div>

            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <Target className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="font-sans text-lg font-black uppercase tracking-tight text-poly-black mb-2">Copy What Works</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Start by copying traders who use strategies that fit your style. See which trades work for you.
              </p>
            </div>

            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <TrendingUp className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="font-sans text-lg font-black uppercase tracking-tight text-poly-black mb-2">Develop Your Own Edge</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Over time, you&apos;ll internalize patterns and develop your own approach. Copy trading is training wheels.
              </p>
              <p className="font-body text-xs text-muted-foreground mt-2">
                <Link href="/v2/polymarket-vs-other-platforms" className="text-poly-yellow transition-colors hover:text-poly-black">Compare platforms</Link> | <Link href="/v2/pricing" className="text-poly-yellow transition-colors hover:text-poly-black">See pricing</Link>
              </p>
            </div>
          </div>

          <div className="text-center">
            <Link
              href="/v2/top-traders"
              className="inline-flex items-center justify-center bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
            >
              Find Traders by Strategy
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ Section - Strategy Questions */}
      <section className="border-b border-border bg-poly-paper py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans text-3xl font-black uppercase tracking-tight text-poly-black mb-4 md:text-4xl">
              Strategy Questions
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="border border-border bg-card transition-all hover:border-poly-yellow cursor-pointer"
                onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
              >
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-sans text-lg font-black uppercase tracking-tight text-poly-black pr-4">{faq.question}</h3>
                    <ChevronDown
                      className={`h-5 w-5 text-muted-foreground flex-shrink-0 transition-transform ${
                        openFaqIndex === index ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                  {openFaqIndex === index && (
                    <p className="mt-4 font-body text-sm leading-relaxed text-muted-foreground">
                      {faq.answer}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="bg-poly-black py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-sans text-3xl font-black uppercase tracking-tight text-white mb-6 md:text-5xl">
            Ready to Put Strategy Into Action?
          </h2>
          <p className="font-body text-xl leading-relaxed text-white/80 mb-8">
            Follow top traders, see their strategies live, start applying what you learned.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/v2/login?mode=signup"
              className="inline-flex items-center justify-center bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-white hover:text-poly-black"
            >
              Start Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
            <Link
              href="/v2/top-traders"
              className="inline-flex items-center justify-center border border-white px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-white transition-all hover:border-poly-yellow hover:bg-poly-yellow hover:text-poly-black"
            >
              Browse Traders
            </Link>
          </div>
          <p className="mt-6 font-body text-sm text-white/60">
            500K+ traders • Multiple strategies represented • Learn by watching
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="border-t border-border bg-poly-paper py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="border-l-4 border-poly-yellow bg-poly-cream p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black mb-2">Not Financial Advice</h4>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  The strategies and information on this page are for educational purposes only and do not constitute financial advice. Trading prediction markets involves risk, and past performance does not guarantee future results. You should do your own research and consult with a financial advisor before making any investment decisions. All trading decisions are your own responsibility.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
