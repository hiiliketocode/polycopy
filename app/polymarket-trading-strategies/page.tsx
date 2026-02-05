'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Navigation } from '@/components/polycopy/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  ArrowRight, 
  TrendingUp,
  Target,
  Zap,
  BarChart3,
  Shield,
  Clock,
  ChevronDown,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  LineChart,
  Eye,
  Users,
  AlertCircle
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
    <>
      <Navigation />
      
      <main className="min-h-screen bg-slate-50">
        {/* Hero Section */}
        <section className="relative bg-gradient-to-b from-white to-slate-50 pt-20 pb-16 md:pt-32 md:pb-24">
          <div className="absolute inset-0 bg-gradient-to-br from-polycopy-yellow/5 via-transparent to-transparent" />
          
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-4xl mx-auto">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-polycopy-yellow/10 border border-polycopy-yellow/20 mb-6">
                <Target className="w-4 h-4 text-polycopy-yellow" />
                <span className="text-sm font-medium text-slate-900">
                  Proven strategies
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 leading-tight mb-6">
                Polymarket Trading{' '}
                <span className="relative inline-block">
                  <span className="relative z-10 text-polycopy-yellow">Strategies</span>
                  <svg className="absolute -bottom-2 left-0 w-full h-3 text-polycopy-yellow/30" viewBox="0 0 200 12" preserveAspectRatio="none">
                    <path d="M0,8 Q50,0 100,8 T200,8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>

              <p className="text-xl text-slate-600 mb-8 leading-relaxed">
                Learn the strategies top Polymarket traders actually use.<br className="hidden sm:inline" />
                From momentum trading to event-based bets to risk management.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/top-traders">
                  <Button size="lg" className="bg-polycopy-yellow text-slate-900 hover:bg-polycopy-yellow-hover font-semibold text-base px-8 h-12 shadow-lg shadow-polycopy-yellow/20">
                    See Top Traders
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/login?mode=signup">
                  <Button size="lg" variant="outline" className="font-semibold text-base px-8 h-12">
                    Start Free
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Strategy Overview */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                6 Prediction Market Trading Strategies
              </h2>
              <p className="text-xl text-slate-600">
                Choose based on your knowledge and time commitment
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
                  color: "green",
                  anchor: "event-based"
                },
                {
                  icon: Zap,
                  title: "Momentum Trading",
                  description: "Follow price movements and market sentiment. Fast-paced.",
                  difficulty: "Intermediate",
                  timeCommit: "High",
                  capital: "$100+",
                  color: "blue",
                  anchor: "momentum"
                },
                {
                  icon: LineChart,
                  title: "Arbitrage",
                  description: "Exploit price differences between markets. Lower risk.",
                  difficulty: "Intermediate",
                  timeCommit: "Medium",
                  capital: "$200+",
                  color: "purple",
                  anchor: "arbitrage"
                },
                {
                  icon: BarChart3,
                  title: "Portfolio Strategy",
                  description: "Diversify across multiple markets. Stability over speed.",
                  difficulty: "Beginner",
                  timeCommit: "Low",
                  capital: "$500+",
                  color: "orange",
                  anchor: "portfolio"
                },
                {
                  icon: Target,
                  title: "Contrarian Trading",
                  description: "Bet against the crowd when odds are wrong. Advanced.",
                  difficulty: "Advanced",
                  timeCommit: "Medium",
                  capital: "$100+",
                  color: "red",
                  anchor: "contrarian"
                },
                {
                  icon: Users,
                  title: "Copy Trading",
                  description: "Follow successful traders and copy their moves. Learn by doing.",
                  difficulty: "Beginner",
                  timeCommit: "Low",
                  capital: "$50+",
                  color: "yellow",
                  anchor: "copy-trading"
                }
              ].map((strategy, index) => {
                const Icon = strategy.icon;
                const colorClasses = {
                  green: 'from-green-400 to-emerald-600',
                  blue: 'from-blue-400 to-blue-600',
                  purple: 'from-purple-400 to-purple-600',
                  orange: 'from-orange-400 to-orange-600',
                  red: 'from-red-400 to-red-600',
                  yellow: 'from-polycopy-yellow to-yellow-600'
                };
                return (
                  <Card key={index} className="p-6 hover:shadow-lg transition-shadow cursor-pointer group" onClick={() => {
                    document.getElementById(strategy.anchor)?.scrollIntoView({ behavior: 'smooth' });
                  }}>
                    <div className={`w-14 h-14 bg-gradient-to-br ${colorClasses[strategy.color as keyof typeof colorClasses]} rounded-full flex items-center justify-center mb-4`}>
                      <Icon className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-polycopy-yellow transition-colors">{strategy.title}</h3>
                    <p className="text-slate-600 text-sm mb-4">{strategy.description}</p>
                    <div className="space-y-2 text-xs mb-4">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Difficulty:</span>
                        <span className="font-medium text-slate-900">{strategy.difficulty}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Time:</span>
                        <span className="font-medium text-slate-900">{strategy.timeCommit}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Min. Capital:</span>
                        <span className="font-medium text-slate-900">{strategy.capital}</span>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full group-hover:border-polycopy-yellow group-hover:text-polycopy-yellow transition-colors">
                      Learn More
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Detailed Strategies - Shortened for space */}
        <section className="py-16 md:py-24 bg-slate-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Strategy Deep Dives
              </h2>
            </div>

            <div className="space-y-8">
              {/* Event-Based */}
              <Card className="p-8" id="event-based">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">Event-Based Trading</h3>
                    <p className="text-slate-600">Best for beginners. Bet on outcomes in areas where you have deep knowledge.</p>
                  </div>
                </div>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3">How It Works:</h4>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Pick markets you understand (NBA if you follow basketball, elections if you follow politics)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Do your own research on the event</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Bet when you have conviction the market is wrong</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Hold until event resolves</span>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3">Best For:</h4>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li>• Domain experts (sports fans, political junkies, crypto natives)</li>
                      <li>• Patient traders who can wait for events to resolve</li>
                      <li>• Those who prefer fewer, higher-conviction bets</li>
                    </ul>
                    <h4 className="font-semibold text-slate-900 mb-2 mt-4">Example:</h4>
                    <p className="text-sm text-slate-700 italic">You follow NBA closely. Market has Lakers winning at 40% but you know their star player is injured. You bet No at favorable odds.</p>
                  </div>
                </div>
              </Card>

              {/* Momentum */}
              <Card className="p-8" id="momentum">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">Momentum Trading</h3>
                    <p className="text-slate-600">Follow price movements. Get in when momentum is strong, get out quickly.</p>
                  </div>
                </div>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3">How It Works:</h4>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <span>Watch for rapid price changes (5-10% moves in hours)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <span>Enter positions during strong trends</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <span>Set profit targets (10-20% gains)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <span>Exit quickly when momentum stalls</span>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3">Best For:</h4>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li>• Active traders who check markets multiple times daily</li>
                      <li>• Those comfortable with faster-paced trading</li>
                      <li>• Traders following top performers who use this strategy</li>
                    </ul>
                    <h4 className="font-semibold text-slate-900 mb-2 mt-4">Example:</h4>
                    <p className="text-sm text-slate-700 italic">Breaking news moves a market from 50% to 65% rapidly. You enter at 67%, ride momentum to 75%, exit with quick profit.</p>
                  </div>
                </div>
              </Card>

              {/* Arbitrage */}
              <Card className="p-8" id="arbitrage">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <LineChart className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">Arbitrage</h3>
                    <p className="text-slate-600">Exploit price differences. Lower risk, requires speed and capital.</p>
                  </div>
                </div>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3">How It Works:</h4>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                        <span>Find same event on multiple platforms with different odds</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                        <span>Buy low on one platform, sell high on another</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                        <span>Lock in guaranteed profit regardless of outcome</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                        <span>Act fast before spreads disappear</span>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3">Best For:</h4>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li>• Traders with capital across multiple platforms</li>
                      <li>• Those who want lower-risk, smaller but consistent gains</li>
                      <li>• Technical traders comfortable with quick execution</li>
                    </ul>
                    <h4 className="font-semibold text-slate-900 mb-2 mt-4">Example:</h4>
                    <p className="text-sm text-slate-700 italic">Same event priced at 60¢ Yes on Polymarket, 45¢ No on another platform. Buy both sides for 105¢ total, guaranteed 100¢ payout = 5% profit.</p>
                  </div>
                </div>
              </Card>

              {/* Portfolio */}
              <Card className="p-8" id="portfolio">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">Portfolio Strategy</h3>
                    <p className="text-slate-600">Diversify across many markets for stability and consistent returns.</p>
                  </div>
                </div>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3">How It Works:</h4>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                        <span>Spread capital across 10-20 different markets</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                        <span>Mix categories (sports, politics, crypto, etc.)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                        <span>Rebalance monthly based on performance</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                        <span>Focus on long-term ROI, not individual trades</span>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3">Best For:</h4>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li>• Traders with larger bankrolls ($500+)</li>
                      <li>• Those who want stability over quick gains</li>
                      <li>• Part-time traders who can't watch markets constantly</li>
                    </ul>
                    <h4 className="font-semibold text-slate-900 mb-2 mt-4">Example:</h4>
                    <p className="text-sm text-slate-700 italic">Allocate $50 each to 20 different markets. If 15 win and 5 lose, your portfolio gains 10-15% overall even though some individual trades failed.</p>
                  </div>
                </div>
              </Card>

              {/* Contrarian */}
              <Card className="p-8" id="contrarian">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 bg-gradient-to-br from-red-400 to-red-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <Target className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">Contrarian Trading</h3>
                    <p className="text-slate-600">Bet against the crowd when market sentiment is clearly wrong. Advanced.</p>
                  </div>
                </div>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3">How It Works:</h4>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                        <span>Identify markets where crowd is clearly emotional/wrong</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                        <span>Bet opposite direction when odds are mispriced</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                        <span>Requires strong conviction and patience</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                        <span>Often means going against popular narratives</span>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3">Best For:</h4>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li>• Experienced traders with strong market knowledge</li>
                      <li>• Those comfortable being wrong and managing drawdowns</li>
                      <li>• Independent thinkers who do deep research</li>
                    </ul>
                    <h4 className="font-semibold text-slate-900 mb-2 mt-4">Example:</h4>
                    <p className="text-sm text-slate-700 italic">Everyone thinks Team A will dominate, pushing odds to 85%. But you notice key injuries and bet No at 15¢ - great value if you're right about mispric ing.</p>
                  </div>
                </div>
              </Card>

              {/* Copy Trading */}
              <Card className="p-8 bg-gradient-to-br from-polycopy-yellow/5 to-yellow-50 border-2 border-polycopy-yellow" id="copy-trading">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 bg-polycopy-yellow rounded-full flex items-center justify-center flex-shrink-0">
                    <Users className="w-6 h-6 text-slate-900" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">Copy Trading (via Polycopy)</h3>
                    <p className="text-slate-600">Follow successful traders and learn by watching their strategies in action.</p>
                  </div>
                </div>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3">How It Works:</h4>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-polycopy-yellow mt-0.5 flex-shrink-0" />
                        <span>Follow top traders who use strategies that fit your style</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-polycopy-yellow mt-0.5 flex-shrink-0" />
                        <span>See their trades in real-time in your curated feed</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-polycopy-yellow mt-0.5 flex-shrink-0" />
                        <span>Pick which trades to copy (curation over automation)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-polycopy-yellow mt-0.5 flex-shrink-0" />
                        <span>Learn patterns and develop your own edge over time</span>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3">Best For:</h4>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li>• Beginners who want to learn from successful traders</li>
                      <li>• Anyone wanting to see strategies in action</li>
                      <li>• Traders who value curated opportunities over manual research</li>
                    </ul>
                    <h4 className="font-semibold text-slate-900 mb-2 mt-4">Why Polycopy:</h4>
                    <p className="text-sm text-slate-700">The only platform that lets you follow and copy top Polymarket traders. See what successful traders do in real-time, learn their patterns, copy what makes sense to you.</p>
                    <div className="mt-4">
                      <Link href="/login?mode=signup">
                        <Button className="bg-polycopy-yellow text-slate-900 hover:bg-polycopy-yellow-hover font-semibold">
                          Start Copy Trading Free
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Risk Management - Critical Section */}
              <Card className="p-8 bg-gradient-to-br from-red-50 to-orange-50 border-red-200">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Shield className="w-6 h-6 text-red-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">Risk Management (Critical for All Strategies)</h3>
                    <p className="text-slate-600">No strategy works without proper risk control.</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="bg-white p-4 rounded-lg">
                    <h4 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-orange-600" />
                      Position Sizing Rule
                    </h4>
                    <p className="text-sm text-slate-700">Never put more than 2-5% of your total bankroll on a single trade. If you have $1,000, max bet is $20-50 per trade. This protects you from one bad trade wiping you out.</p>
                  </div>
                  
                  <div className="bg-white p-4 rounded-lg">
                    <h4 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-orange-600" />
                      Stop-Loss Mental Model
                    </h4>
                    <p className="text-sm text-slate-700">Before entering any trade, decide: "At what point am I wrong?" If you buy Yes at 60¢, maybe you exit if it drops to 50¢. Don't hold losers hoping they recover.</p>
                  </div>
                  
                  <div className="bg-white p-4 rounded-lg">
                    <h4 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-orange-600" />
                      Diversification
                    </h4>
                    <p className="text-sm text-slate-700">Don't put all capital in one market type. Spread across sports, politics, crypto, etc. If one category has a bad week, others might compensate.</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* How to Choose Your Strategy */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Which Strategy Should You Choose?
              </h2>
              <p className="text-xl text-slate-600">
                Match strategy to your situation
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <Card className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
                <h3 className="text-lg font-bold text-slate-900 mb-4">If You're New:</h3>
                <p className="text-sm text-slate-700 mb-4">Start with Event-Based Trading in categories you know. Make 10-20 trades. Learn the basics. Then explore other strategies.</p>
                <p className="text-xs text-slate-600 italic">Recommended: Event-Based + Portfolio Diversification</p>
              </Card>

              <Card className="p-6 bg-gradient-to-br from-blue-50 to-blue-50 border-blue-200">
                <h3 className="text-lg font-bold text-slate-900 mb-4">If You're Active:</h3>
                <p className="text-sm text-slate-700 mb-4">Use Momentum Trading + follow top traders on Polycopy. Check feed multiple times daily. Execute quick trades.</p>
                <p className="text-xs text-slate-600 italic">Recommended: Momentum + Copy Trading</p>
              </Card>

              <Card className="p-6 bg-gradient-to-br from-purple-50 to-purple-50 border-purple-200">
                <h3 className="text-lg font-bold text-slate-900 mb-4">If You Want Stability:</h3>
                <p className="text-sm text-slate-700 mb-4">Focus on Portfolio Strategy. Diversify across 10-15 markets. Hold longer. Accept slower but steadier returns.</p>
                <p className="text-xs text-slate-600 italic">Recommended: Portfolio + Event-Based</p>
              </Card>
            </div>
          </div>
        </section>

        {/* Copy Trading Integration */}
        <section className="py-16 md:py-24 bg-slate-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-polycopy-yellow/10 border border-polycopy-yellow/20 mb-6">
                <Sparkles className="w-4 h-4 text-polycopy-yellow" />
                <span className="text-sm font-medium text-slate-900">
                  Learn faster with Polycopy
                </span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                See These Strategies in Action
              </h2>
              <p className="text-xl text-slate-600 max-w-2xl mx-auto">
                The fastest way to learn? Follow top traders who excel at each strategy and watch how they execute in real-time.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <Card className="p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                  <Eye className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Watch Strategies Live</h3>
                <p className="text-slate-600 text-sm">
                  See momentum traders execute fast trades. Watch event-based traders hold positions. Learn by observation before risking your own capital.
                </p>
              </Card>

              <Card className="p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <Target className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Copy What Works</h3>
                <p className="text-slate-600 text-sm">
                  Start by copying traders who use strategies that match your style. Test the strategy with real trades before committing larger capital.
                </p>
              </Card>

              <Card className="p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <TrendingUp className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Build Your Own Edge</h3>
                <p className="text-slate-600 text-sm">
                  Over time, internalize patterns and develop your own approach. Copy trading is training wheels for building long-term market sense.
                </p>
              </Card>
            </div>

            <div className="bg-white p-8 rounded-2xl border-2 border-polycopy-yellow">
              <div className="max-w-3xl mx-auto text-center">
                <h3 className="text-2xl font-bold text-slate-900 mb-4">
                  Follow 500K+ Traders on Polycopy
                </h3>
                <p className="text-slate-600 mb-6 leading-relaxed">
                  Filter traders by strategy type. Follow event-based traders for sports. Follow momentum traders for quick opportunities. Follow portfolio strategists for stability. See all their trades in one curated feed.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link href="/login?mode=signup">
                    <Button size="lg" className="bg-polycopy-yellow text-slate-900 hover:bg-polycopy-yellow-hover font-semibold">
                      Start Free
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                  </Link>
                  <Link href="/top-traders">
                    <Button size="lg" variant="outline">
                      Browse Top Traders
                    </Button>
                  </Link>
                </div>
                <p className="text-sm text-slate-500 mt-4">
                  No credit card required • Follow unlimited traders • See all strategies
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Disclaimer */}
        <section className="py-12 bg-white border-t border-slate-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-slate-50 border-l-4 border-slate-400 p-6 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Not Financial Advice</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    The strategies and information on this page are for educational purposes only and do not constitute financial advice. Trading prediction markets involves risk, and past performance does not guarantee future results. You should do your own research and consult with a financial advisor before making any investment decisions. All trading decisions are your own responsibility.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 md:py-24 bg-slate-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-polycopy-yellow/20 border border-polycopy-yellow/30 mb-6">
                <Sparkles className="w-4 h-4 text-polycopy-yellow" />
                <span className="text-sm font-medium text-polycopy-yellow">
                  Fast-track learning
                </span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Learn Strategies by Copying the Best
              </h2>
              <p className="text-xl text-slate-300 max-w-2xl mx-auto">
                The fastest way to learn these strategies? Watch top traders execute them in real-time on Polycopy.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white/10 backdrop-blur rounded-xl p-6 border border-white/20">
                <div className="w-12 h-12 bg-polycopy-yellow/20 rounded-lg flex items-center justify-center mb-4">
                  <Eye className="w-6 h-6 text-polycopy-yellow" />
                </div>
                <h3 className="text-lg font-bold mb-2">See Strategies in Action</h3>
                <p className="text-slate-300 text-sm">
                  Filter traders by strategy. Watch how momentum traders operate vs. event-based traders. Learn by observation.
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur rounded-xl p-6 border border-white/20">
                <div className="w-12 h-12 bg-polycopy-yellow/20 rounded-lg flex items-center justify-center mb-4">
                  <Target className="w-6 h-6 text-polycopy-yellow" />
                </div>
                <h3 className="text-lg font-bold mb-2">Copy What Works</h3>
                <p className="text-slate-300 text-sm">
                  Start by copying traders who use strategies that fit your style. See which trades work for you.
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur rounded-xl p-6 border border-white/20">
                <div className="w-12 h-12 bg-polycopy-yellow/20 rounded-lg flex items-center justify-center mb-4">
                  <TrendingUp className="w-6 h-6 text-polycopy-yellow" />
                </div>
                <h3 className="text-lg font-bold mb-2">Develop Your Own Edge</h3>
                <p className="text-slate-300 text-sm">
                  Over time, you'll internalize patterns and develop your own approach. Copy trading is training wheels.
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  <Link href="/polymarket-vs-other-platforms" className="text-polycopy-yellow hover:underline">Compare platforms</Link> | <Link href="/pricing" className="text-polycopy-yellow hover:underline">See pricing</Link>
                </p>
              </div>
            </div>

            <div className="text-center">
              <Link href="/top-traders">
                <Button size="lg" className="bg-polycopy-yellow text-slate-900 hover:bg-polycopy-yellow-hover font-semibold text-base px-8 h-12 shadow-lg">
                  Find Traders by Strategy
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Strategy Questions
              </h2>
            </div>

            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <Card 
                  key={index} 
                  className="overflow-hidden cursor-pointer hover:border-polycopy-yellow/30 transition-colors"
                  onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
                >
                  <div className="p-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-slate-900 pr-4">{faq.question}</h3>
                      <ChevronDown 
                        className={`w-5 h-5 text-slate-500 flex-shrink-0 transition-transform ${
                          openFaqIndex === index ? 'rotate-180' : ''
                        }`} 
                      />
                    </div>
                    {openFaqIndex === index && (
                      <p className="mt-4 text-slate-600 leading-relaxed">
                        {faq.answer}
                      </p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="py-16 md:py-24 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">
              Ready to Put Strategy Into Action?
            </h2>
            <p className="text-xl text-slate-300 mb-8">
              Follow top traders, see their strategies live, start applying what you learned.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/login?mode=signup">
                <Button size="lg" className="bg-polycopy-yellow text-slate-900 hover:bg-polycopy-yellow-hover font-semibold text-base px-8 h-12 shadow-lg">
                  Start Free
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/top-traders">
                <Button size="lg" variant="outline" className="font-semibold text-base px-8 h-12 bg-transparent border-white text-white hover:bg-white/10">
                  Browse Traders
                </Button>
              </Link>
            </div>
            <p className="mt-6 text-sm text-slate-400">
              500K+ traders • Multiple strategies represented • Learn by watching
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
