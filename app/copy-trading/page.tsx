'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Navigation } from '@/components/polycopy/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TopTraders } from '@/components/landing/top-traders';
import { 
  ArrowRight, 
  TrendingUp, 
  Users, 
  Rss, 
  CheckCircle2,
  Brain,
  Eye,
  ChevronDown,
  Sparkles,
  Target
} from 'lucide-react';

interface TopTrader {
  wallet_address: string;
  display_name: string | null;
  profile_image: string | null;
  pnl: number;
  volume: number;
  total_trades: number;
  win_rate: number | null;
  follower_count: number;
}

export default function CopyTradingPage() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const faqs = [
    {
      question: "What is copy trading on Polycopy?",
      answer: "Copy trading on Polycopy is different from traditional 'copy everything' tools. You follow top Polymarket traders and see their trades in a real-time feed - like Twitter, but for prediction market opportunities. You review each trade and decide which ones align with your strategy. You maintain full control over what you copy and when."
    },
    {
      question: "Does Polycopy automatically copy all trades?",
      answer: "No. We believe in curation over automation. Polycopy shows you what successful traders are doing in a clean feed, but you choose what to copy. Even the best traders make moves you might not understand or be comfortable with - you stay in control and make informed decisions."
    },
    {
      question: "How is this different from other copy trading platforms?",
      answer: "Most platforms use blind automation - pick a trader, copy everything. Polycopy gives you a curated feed where you pick and choose. It's the difference between 'copy everything trader X does' and 'show me what successful traders are betting on so I can make better decisions.' You learn patterns while maintaining agency."
    },
    {
      question: "What's included in the free tier?",
      answer: "The free tier is genuinely useful, not just a trial. You get: unlimited trader follows, full access to your personalized trade feed, portfolio tracking, and manual trade copying. You see everything top traders are doing and can copy trades yourself on Polymarket."
    },
    {
      question: "What does Premium add?",
      answer: "Premium ($20/month) adds speed and convenience: one-click trade execution through Polycopy, auto-close when the original trader exits, connected wallet integration, and priority support. The feed and curation features remain the same - Premium is about faster execution."
    },
    {
      question: "Do I need trading experience?",
      answer: "Polycopy helps you make better decisions by showing you what successful traders are doing, but you still need to use your judgment. It's a learning tool as much as an execution tool. You'll learn patterns over time by seeing what works. No experience required to start, but you'll build it as you go."
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
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-polycopy-yellow/10 border border-polycopy-yellow/20 mb-6">
                <Sparkles className="w-4 h-4 text-polycopy-yellow" />
                <span className="text-sm font-medium text-slate-900">
                  Curation over automation
                </span>
              </div>

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 leading-tight mb-6">
                Copy Trading for Polymarket,{' '}
                <span className="relative inline-block">
                  <span className="relative z-10 text-polycopy-yellow">But Smarter</span>
                  <svg className="absolute -bottom-2 left-0 w-full h-3 text-polycopy-yellow/30" viewBox="0 0 200 12" preserveAspectRatio="none">
                    <path d="M0,8 Q50,0 100,8 T200,8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>

              <p className="text-xl text-slate-600 mb-8 leading-relaxed">
                Get a curated feed of trades from top Polymarket traders.<br className="hidden sm:inline" />
                See their moves. Pick what makes sense. Execute with one click.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
                <Link href="/login?mode=signup">
                  <Button size="lg" className="bg-polycopy-yellow text-slate-900 hover:bg-polycopy-yellow-hover font-semibold text-base px-8 h-12 shadow-lg shadow-polycopy-yellow/20">
                    Start Your Feed Free
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/discover">
                  <Button size="lg" variant="outline" className="font-semibold text-base px-8 h-12">
                    Browse Traders
                  </Button>
                </Link>
              </div>

              {/* Trust indicators */}
              <div className="flex items-center justify-center gap-8 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>100% non-custodial</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* The Feed Concept */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              {/* Left: Visual mockup */}
              <div className="order-2 md:order-1">
                <div className="relative max-w-md mx-auto">
                  {/* Featured Trade Card */}
                  <div className="bg-white rounded-2xl shadow-2xl border-2 border-slate-200 p-6">
                    <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-200">
                      <span className="font-bold text-slate-900 text-sm">Your Feed</span>
                      <div className="ml-auto">
                        <span className="text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded-full font-semibold">
                          Crypto
                        </span>
                      </div>
                    </div>
                    
                    <div className="bg-white border-2 border-slate-200 rounded-xl p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700"></div>
                        <div className="flex-1">
                          <div className="font-semibold text-slate-900 text-base mb-1">Bitcoin hits $100k</div>
                          <div className="text-sm text-slate-500">by TopDog</div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div>
                          <div className="text-xs text-slate-500 uppercase font-medium mb-1">Action</div>
                          <div className="text-base font-bold text-green-600">Buy Yes</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 uppercase font-medium mb-1">Price</div>
                          <div className="text-base font-bold text-slate-900">$0.72</div>
                        </div>
                      </div>
                      
                      <button 
                        className="w-full bg-polycopy-yellow hover:bg-polycopy-yellow-hover text-slate-900 py-3 px-4 rounded-xl font-bold text-base transition-colors"
                      >
                        Copy Trade
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Explanation */}
              <div className="order-1 md:order-2">
                <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
                  Think of it like Twitter for trading
                </h2>
                <div className="prose prose-lg text-slate-700 space-y-4">
                  <p className="text-lg leading-relaxed">
                    Most copy trading platforms are binary: pick a trader, automatically copy everything they do. But that's not how smart trading works.
                  </p>
                  <p className="text-lg leading-relaxed">
                    <strong>Polycopy gives you a curated feed</strong> of trades from the Polymarket traders you choose to follow. You see their moves in real-time, review the opportunities, and decide which trades align with your strategy.
                  </p>
                  <p className="text-lg leading-relaxed">
                    <strong>You maintain agency.</strong> You're not blindly following anyone - you're using their trades as informed signals to make better decisions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-16 md:py-24 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                How It Works
              </h2>
              <p className="text-xl text-slate-600 max-w-2xl mx-auto">
                Four steps to smarter trading
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
              {[
                {
                  icon: Users,
                  number: "1",
                  title: "Follow Top Traders",
                  description: "Browse 500K+ Polymarket traders. Filter by ROI, win rate, category expertise, and trading history."
                },
                {
                  icon: Rss,
                  number: "2", 
                  title: "Get Your Feed",
                  description: "See trades from your followed traders in a clean, chronological feed as they happen in real-time."
                },
                {
                  icon: Brain,
                  number: "3",
                  title: "Pick & Choose",
                  description: "Review each trade. Does it align with your thesis? Your risk tolerance? Your market knowledge? You decide."
                },
                {
                  icon: Target,
                  number: "4",
                  title: "Execute",
                  description: "Copy trades manually (free) or with one-click execution (Premium). You stay in control at every step."
                }
              ].map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={index} className="relative">
                    <Card className="p-6 h-full hover:border-polycopy-yellow/30 transition-colors">
                      <div className="absolute -top-3 -left-3 w-10 h-10 bg-polycopy-yellow rounded-full flex items-center justify-center text-slate-900 font-bold text-lg shadow-lg">
                        {step.number}
                      </div>
                      <div className="w-12 h-12 bg-polycopy-yellow/10 rounded-lg flex items-center justify-center mb-4 mt-2">
                        <Icon className="w-6 h-6 text-polycopy-yellow" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 mb-2">{step.title}</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">{step.description}</p>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Traditional vs Polycopy Comparison */}
        <section className="py-16 md:py-24 bg-slate-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Traditional vs. Polycopy
              </h2>
            </div>

            <Card className="p-8 bg-white border-slate-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                <div className="text-left p-6 bg-red-50/50 rounded-lg border border-red-200">
                  <p className="text-red-600 font-bold mb-3 text-base">❌ Traditional copy trading</p>
                  <p className="text-slate-700">"Copy everything trader X does"</p>
                </div>
                <div className="text-left p-6 bg-green-50/50 rounded-lg border border-green-200">
                  <p className="text-green-600 font-bold mb-3 text-base">✅ Polycopy</p>
                  <p className="text-slate-700">"Show me what successful traders are doing so I can decide"</p>
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* Why Curation Matters */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Why Curation Beats Automation
              </h2>
              <p className="text-xl text-slate-600">
                The problem with "copy everything" bots
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-12">
              <Card className="p-8 border-red-200 bg-red-50/30">
                <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <span className="text-red-600">❌</span>
                  Blind Automation
                </h3>
                <ul className="space-y-3 text-slate-700">
                  <li className="flex items-start gap-2">
                    <span className="text-red-600 mt-1">•</span>
                    <span>Copies trades you don't understand</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-600 mt-1">•</span>
                    <span>No learning - just delegation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-600 mt-1">•</span>
                    <span>Different risk tolerance than yours</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-600 mt-1">•</span>
                    <span>You're on autopilot, not improving</span>
                  </li>
                </ul>
              </Card>

              <Card className="p-8 border-green-200 bg-green-50/30">
                <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <span className="text-green-600">✓</span>
                  Smart Curation
                </h3>
                <ul className="space-y-3 text-slate-700">
                  <li className="flex items-start gap-2">
                    <span className="text-green-600 mt-1">•</span>
                    <span>See opportunities, decide for yourself</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600 mt-1">•</span>
                    <span>Learn patterns from successful traders</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600 mt-1">•</span>
                    <span>Match trades to your strategy</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600 mt-1">•</span>
                    <span>You're thinking better, not less</span>
                  </li>
                </ul>
              </Card>
            </div>

            <div className="bg-slate-100 border-l-4 border-polycopy-yellow p-6 rounded-lg">
              <p className="text-lg text-slate-700 leading-relaxed">
                <strong className="text-slate-900">The key insight:</strong> Even the best traders make moves you won't understand, take positions you're not comfortable with, or operate at different timeframes. Polycopy lets you learn from their expertise while maintaining your own judgment.
              </p>
            </div>
          </div>
        </section>

        {/* What You Actually Get */}
        <section className="py-16 md:py-24 bg-slate-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                What You Actually Get
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-8 mb-8">
              {[
                {
                  icon: Eye,
                  title: "Discovery",
                  description: "Find markets and opportunities you wouldn't have seen on your own. Your feed surfaces the bets that matter."
                },
                {
                  icon: Brain,
                  title: "Pattern Recognition",
                  description: "Learn what successful traders consistently bet on (and skip). Build your instincts over time."
                },
                {
                  icon: Target,
                  title: "Better Decisions",
                  description: "Make informed choices with better data. The best tools don't think for you - they help you think better."
                }
              ].map((benefit, index) => {
                const Icon = benefit.icon;
                return (
                  <Card key={index} className="p-6 text-center hover:shadow-lg transition-shadow">
                    <div className="w-14 h-14 bg-polycopy-yellow/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Icon className="w-7 h-7 text-polycopy-yellow" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">{benefit.title}</h3>
                    <p className="text-slate-600 text-sm leading-relaxed">{benefit.description}</p>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Live Trader Examples */}
        <TopTraders />

        {/* Free vs Premium */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Free vs. Premium
              </h2>
              <p className="text-xl text-slate-600">
                Both tiers give you the feed and curation - Premium adds speed
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-8">
              {/* Free Tier */}
              <Card className="p-8 border-2 hover:shadow-lg transition-shadow flex flex-col">
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">Free</h3>
                  <p className="text-3xl font-bold text-slate-900">$0<span className="text-base font-normal text-slate-600">/forever</span></p>
                </div>
                <ul className="space-y-3 mb-6 flex-1">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-700">Follow unlimited traders</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-700">Full feed access - see all trades</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-700">Portfolio tracking</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-700">Manual trade copying</span>
                  </li>
                </ul>
                <Link href="/login?mode=signup" className="mt-auto">
                  <Button className="w-full" variant="outline">
                    Start Free
                  </Button>
                </Link>
              </Card>

              {/* Premium Tier */}
              <Card className="p-8 border-2 border-polycopy-yellow hover:shadow-lg transition-shadow relative flex flex-col">
                <div className="absolute -top-3 right-4 bg-polycopy-yellow text-slate-900 text-xs font-bold px-3 py-1 rounded-full">
                  POPULAR
                </div>
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">Premium</h3>
                  <p className="text-3xl font-bold text-slate-900">$20<span className="text-base font-normal text-slate-600">/month</span></p>
                </div>
                <p className="text-sm text-slate-600 mb-4 italic">Everything in Free, plus:</p>
                <ul className="space-y-3 mb-6 flex-1">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-polycopy-yellow mt-0.5 flex-shrink-0" />
                    <span className="text-slate-700"><strong>One-click execution</strong> through Polycopy</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-polycopy-yellow mt-0.5 flex-shrink-0" />
                    <span className="text-slate-700"><strong>Auto-close</strong> when original trader exits</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-polycopy-yellow mt-0.5 flex-shrink-0" />
                    <span className="text-slate-700">Connected wallet integration</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-polycopy-yellow mt-0.5 flex-shrink-0" />
                    <span className="text-slate-700">Priority support</span>
                  </li>
                </ul>
                <Link href="/login?mode=signup" className="mt-auto">
                  <Button className="w-full bg-polycopy-yellow text-slate-900 hover:bg-polycopy-yellow-hover font-semibold">
                    Start Free, Upgrade Anytime
                  </Button>
                </Link>
              </Card>
            </div>

            <p className="text-center text-sm text-slate-600 mt-6">
              <strong>The feed and curation work the same on both tiers.</strong> Premium is about convenience and speed, not access.
            </p>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 md:py-24 bg-slate-50">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Common Questions
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
              Start Your Curated Trading Feed
            </h2>
            <p className="text-xl text-slate-300 mb-8">
              Follow top traders. See their moves. Pick what makes sense. Start free.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/login?mode=signup">
                <Button size="lg" className="bg-polycopy-yellow text-slate-900 hover:bg-polycopy-yellow-hover font-semibold text-base px-8 h-12 shadow-lg">
                  Get Started Free
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/discover">
                <Button size="lg" variant="outline" className="font-semibold text-base px-8 h-12 bg-transparent border-white text-white hover:bg-white/10">
                  Browse Traders
                </Button>
              </Link>
            </div>
            <p className="mt-6 text-sm text-slate-400">
              No credit card required • No commitment • 100% non-custodial
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
