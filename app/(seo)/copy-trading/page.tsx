'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TopTraders } from '@/components/landing/top-traders';
import {
  ArrowRight,
  Users,
  Rss,
  CheckCircle2,
  Brain,
  Eye,
  ChevronDown,
  Target,
} from 'lucide-react';

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
    <main className="min-h-screen bg-poly-cream">
      {/* Hero Section */}
      <section className="relative border-b border-border bg-poly-paper pt-20 pb-16 md:pt-32 md:pb-24">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-poly-yellow mb-6">
              Curation over automation
            </p>

            {/* Headline */}
            <h1 className="font-sans text-4xl font-black uppercase tracking-tight text-poly-black leading-tight mb-6 sm:text-5xl md:text-6xl">
              Copy Trading for Polymarket,{' '}
              <span className="text-poly-yellow">But Smarter</span>
            </h1>

            <p className="font-body text-xl leading-relaxed text-muted-foreground mb-8">
              Get a curated feed of trades from top Polymarket traders.<br className="hidden sm:inline" />
              See their moves. Pick what makes sense. Execute with one click.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
              <Link
                href="/login?mode=signup"
                className="inline-flex items-center gap-2 bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
              >
                Start Your Feed Free
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/v2/discover"
                className="inline-flex items-center border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
              >
                Browse Top Traders
              </Link>
            </div>

            {/* Trust indicators */}
            <div className="flex items-center justify-center gap-8 font-body text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-profit-green" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-profit-green" />
                <span>100% non-custodial</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Feed Concept */}
      <section className="border-b border-border bg-poly-cream py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left: Visual mockup */}
            <div className="order-2 md:order-1">
              <div className="relative max-w-md mx-auto">
                {/* Featured Trade Card */}
                <div className="border border-border bg-card p-6">
                  <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border">
                    <span className="font-sans text-base font-bold uppercase tracking-wide text-poly-black">Your Feed</span>
                    <div className="ml-auto">
                      <span className="inline-flex items-center gap-2 bg-poly-yellow px-4 py-2 font-sans text-xs font-bold uppercase tracking-widest text-poly-black">
                        Crypto
                      </span>
                    </div>
                  </div>

                  <div className="border border-border bg-poly-paper p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex h-10 w-10 items-center justify-center border border-border bg-poly-cream" />
                      <div className="flex-1">
                        <div className="font-sans text-base font-bold uppercase tracking-wide text-poly-black mb-1">Bitcoin hits $100k</div>
                        <div className="font-body text-sm text-muted-foreground">by TopDog</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div>
                        <div className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Action</div>
                        <div className="font-sans text-base font-bold text-profit-green">Buy Yes</div>
                      </div>
                      <div>
                        <div className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Price</div>
                        <div className="font-sans text-base font-bold text-poly-black">$0.72</div>
                      </div>
                    </div>

                    <button
                      className="w-full bg-poly-yellow px-4 py-3 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
                    >
                      Copy Trade
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="order-1 md:order-2">
              <h2 className="font-sans text-3xl font-black uppercase tracking-tight text-poly-black mb-6 md:text-4xl">
                Think of it like Twitter for trading
              </h2>
              <div className="space-y-4">
                <p className="font-body text-lg leading-relaxed text-muted-foreground">
                  Most copy trading platforms are binary: pick a trader, automatically copy everything they do. But that's not how smart trading works.
                </p>
                <p className="font-body text-lg leading-relaxed text-muted-foreground">
                  <strong className="text-poly-black">Polycopy gives you a curated feed</strong> of trades from the Polymarket traders you choose to follow. You see their moves in real-time, review the opportunities, and decide which trades align with your strategy.
                </p>
                <p className="font-body text-lg leading-relaxed text-muted-foreground">
                  <strong className="text-poly-black">You maintain agency.</strong> You're not blindly following anyone - you're using their trades as informed signals to make better decisions.
                </p>
                <p className="font-body text-base text-muted-foreground mt-4">
                  New to copy trading? Check out our <Link href="/how-to-copy-trade-polymarket" className="text-poly-yellow hover:underline font-medium">complete beginner's guide</Link>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-b border-border bg-poly-paper py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-sans text-3xl font-black uppercase tracking-tight text-poly-black mb-4 md:text-4xl">
              How It Works
            </h2>
            <p className="font-body text-xl text-muted-foreground max-w-2xl mx-auto">
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
                  <div className="border border-border bg-card p-6 h-full transition-all hover:border-poly-yellow">
                    <div className="absolute -top-3 -left-3 flex h-10 w-10 items-center justify-center border border-border bg-poly-yellow font-sans text-lg font-bold text-poly-black">
                      {step.number}
                    </div>
                    <div className="mb-4 mt-2 flex h-10 w-10 items-center justify-center border border-border">
                      <Icon className="w-6 h-6 text-poly-yellow" />
                    </div>
                    <h3 className="font-sans text-base font-bold uppercase tracking-wide text-poly-black mb-2">{step.title}</h3>
                    <p className="font-body text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Traditional vs Polycopy Comparison */}
      <section className="border-b border-border bg-poly-cream py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans text-3xl font-black uppercase tracking-tight text-poly-black mb-4 md:text-4xl">
              Traditional vs. Polycopy
            </h2>
          </div>

          <div className="border border-border bg-card p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-body text-sm">
              <div className="border border-loss-red bg-poly-paper p-6">
                <p className="font-sans text-base font-bold text-loss-red mb-3">❌ Traditional copy trading</p>
                <p className="text-muted-foreground">"Copy everything trader X does"</p>
              </div>
              <div className="border border-profit-green bg-poly-paper p-6">
                <p className="font-sans text-base font-bold text-profit-green mb-3">✅ Polycopy</p>
                <p className="text-muted-foreground">"Show me what successful traders are doing so I can decide"</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Curation Matters */}
      <section className="border-b border-border bg-poly-paper py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans text-3xl font-black uppercase tracking-tight text-poly-black mb-4 md:text-4xl">
              Why Curation Beats Automation
            </h2>
            <p className="font-body text-xl text-muted-foreground">
              The problem with "copy everything" bots
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="border border-loss-red bg-poly-paper p-8">
              <h3 className="font-sans text-base font-bold uppercase tracking-wide text-poly-black mb-4 flex items-center gap-2">
                <span className="text-loss-red">❌</span>
                Blind Automation
              </h3>
              <ul className="space-y-3 font-body text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-loss-red mt-1">•</span>
                  <span>Copies trades you don't understand</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-loss-red mt-1">•</span>
                  <span>No learning - just delegation</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-loss-red mt-1">•</span>
                  <span>Different risk tolerance than yours</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-loss-red mt-1">•</span>
                  <span>You're on autopilot, not improving</span>
                </li>
              </ul>
            </div>

            <div className="border border-profit-green bg-poly-paper p-8">
              <h3 className="font-sans text-base font-bold uppercase tracking-wide text-poly-black mb-4 flex items-center gap-2">
                <span className="text-profit-green">✓</span>
                Smart Curation
              </h3>
              <ul className="space-y-3 font-body text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-profit-green mt-1">•</span>
                  <span>See opportunities, decide for yourself</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-profit-green mt-1">•</span>
                  <span>Learn patterns from successful traders</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-profit-green mt-1">•</span>
                  <span>Match trades to your strategy</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-profit-green mt-1">•</span>
                  <span>You're thinking better, not less</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-l-4 border-poly-yellow bg-card p-6">
            <p className="font-body text-lg leading-relaxed text-muted-foreground">
              <strong className="text-poly-black">The key insight:</strong> Even the best traders make moves you won't understand, take positions you're not comfortable with, or operate at different timeframes. Polycopy lets you learn from their expertise while maintaining your own judgment.
            </p>
          </div>
        </div>
      </section>

      {/* What You Actually Get */}
      <section className="border-b border-border bg-poly-cream py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans text-3xl font-black uppercase tracking-tight text-poly-black mb-4 md:text-4xl">
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
                <div key={index} className="border border-border bg-card p-6 text-center transition-all hover:border-poly-yellow">
                  <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center border border-border">
                    <Icon className="w-7 h-7 text-poly-yellow" />
                  </div>
                  <h3 className="font-sans text-base font-bold uppercase tracking-wide text-poly-black mb-2">{benefit.title}</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">{benefit.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Live Trader Examples */}
      <TopTraders traderLinkBase="/v2" />

      {/* Free vs Premium */}
      <section className="border-b border-border bg-poly-paper py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans text-3xl font-black uppercase tracking-tight text-poly-black mb-4 md:text-4xl">
              Free vs. Premium
            </h2>
            <p className="font-body text-xl text-muted-foreground">
              Both tiers give you the feed and curation - Premium adds speed
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-8">
            {/* Free Tier */}
            <div className="flex flex-col border border-border bg-card p-8 transition-all hover:border-poly-yellow">
              <div className="mb-6">
                <h3 className="font-sans text-2xl font-bold uppercase tracking-wide text-poly-black mb-2">Free</h3>
                <p className="font-sans text-3xl font-bold text-poly-black">$0<span className="font-body text-base font-normal text-muted-foreground">/forever</span></p>
              </div>
              <ul className="space-y-3 mb-6 flex-1">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-profit-green mt-0.5 flex-shrink-0" />
                  <span className="font-body text-muted-foreground">Follow unlimited traders</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-profit-green mt-0.5 flex-shrink-0" />
                  <span className="font-body text-muted-foreground">Full feed access - see all trades</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-profit-green mt-0.5 flex-shrink-0" />
                  <span className="font-body text-muted-foreground">Portfolio tracking</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-profit-green mt-0.5 flex-shrink-0" />
                  <span className="font-body text-muted-foreground">Manual trade copying</span>
                </li>
              </ul>
              <Link
                href="/login?mode=signup"
                className="mt-auto inline-flex items-center justify-center border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
              >
                Start Free
              </Link>
            </div>

            {/* Premium Tier */}
            <div className="relative flex flex-col border-2 border-poly-yellow bg-card p-8 transition-all hover:border-poly-yellow">
              <div className="absolute -top-3 right-4 inline-flex items-center gap-2 bg-poly-yellow px-4 py-2 font-sans text-xs font-bold uppercase tracking-widest text-poly-black">
                POPULAR
              </div>
              <div className="mb-6">
                <h3 className="font-sans text-2xl font-bold uppercase tracking-wide text-poly-black mb-2">Premium</h3>
                <p className="font-sans text-3xl font-bold text-poly-black">$20<span className="font-body text-base font-normal text-muted-foreground">/month</span></p>
              </div>
              <p className="font-body text-sm text-muted-foreground mb-4 italic">Everything in Free, plus:</p>
              <ul className="space-y-3 mb-6 flex-1">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-poly-yellow mt-0.5 flex-shrink-0" />
                  <span className="font-body text-muted-foreground"><strong className="text-poly-black">One-click execution</strong> through Polycopy</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-poly-yellow mt-0.5 flex-shrink-0" />
                  <span className="font-body text-muted-foreground"><strong className="text-poly-black">Auto-close</strong> when original trader exits</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-poly-yellow mt-0.5 flex-shrink-0" />
                  <span className="font-body text-muted-foreground">Connected wallet integration</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-poly-yellow mt-0.5 flex-shrink-0" />
                  <span className="font-body text-muted-foreground">Priority support</span>
                </li>
              </ul>
              <Link
                href="/login?mode=signup"
                className="mt-auto inline-flex items-center justify-center bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
              >
                Start Free, Upgrade Anytime
              </Link>
            </div>
          </div>

          <p className="text-center font-body text-sm text-muted-foreground mt-6">
            <strong className="text-poly-black">The feed and curation work the same on both tiers.</strong> Premium is about convenience and speed, not access.
          </p>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="border-b border-border bg-poly-cream py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans text-3xl font-black uppercase tracking-tight text-poly-black mb-4 md:text-4xl">
              Common Questions
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="cursor-pointer border border-border bg-card p-6 transition-all hover:border-poly-yellow"
                onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-sans text-base font-bold uppercase tracking-wide text-poly-black pr-4">{faq.question}</h3>
                  <ChevronDown
                    className={`w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform ${
                      openFaqIndex === index ? 'rotate-180' : ''
                    }`}
                  />
                </div>
                {openFaqIndex === index && (
                  <p className="mt-4 font-body text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="border-b border-border bg-poly-black py-16 md:py-24 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-sans text-3xl font-black uppercase tracking-tight mb-6 md:text-5xl">
            Start Your Curated Trading Feed
          </h2>
          <p className="font-body text-xl text-gray-300 mb-8">
            Follow top traders. See their moves. Pick what makes sense. Start free.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login?mode=signup"
              className="inline-flex items-center gap-2 bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow hover:border hover:border-poly-yellow"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/v2/discover"
              className="inline-flex items-center border border-white px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-white/10"
            >
              Browse Traders
            </Link>
          </div>
          <p className="mt-6 font-body text-sm text-gray-400">
            No credit card required • No commitment • 100% non-custodial
          </p>
        </div>
      </section>
    </main>
  );
}
