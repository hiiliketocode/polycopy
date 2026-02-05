'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, TrendingUp, Users, Shield, Brain, AlertCircle, CheckCircle2, DollarSign, Target, BookOpen, X } from 'lucide-react';
import { Navigation } from '@/components/polycopy/navigation';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

export default function PredictionMarketsForBeginnersPage() {
  const [user, setUser] = useState<User | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        Promise.all([
          supabase.from('profiles').select('is_premium, profile_image_url').eq('id', session.user.id).single(),
          supabase.from('turnkey_wallets').select('polymarket_account_address, eoa_address').eq('user_id', session.user.id).maybeSingle()
        ]).then(([profileRes, walletRes]) => {
          setIsPremium(profileRes.data?.is_premium || false);
          setProfileImageUrl(profileRes.data?.profile_image_url || null);
          setWalletAddress(walletRes.data?.polymarket_account_address || walletRes.data?.eoa_address || null);
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
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-slate-50 to-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-16 md:py-24">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
              Prediction Markets for Beginners
            </h1>
            <p className="text-xl text-slate-600 mb-8 leading-relaxed">
              Never traded prediction markets before? No problem. This guide will teach you everything you need to know to start trading confidently on Polymarket.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/how-to-copy-trade-polymarket">
                <Button size="lg" className="bg-polycopy-yellow hover:bg-polycopy-yellow/90 text-slate-900 font-semibold text-base px-8 h-12">
                  Start Copy Trading
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/top-traders">
                <Button size="lg" variant="outline" className="font-semibold text-base px-8 h-12">
                  Browse Top Traders
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* What Are Prediction Markets */}
      <section className="py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-4">
          <div className="mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
              What Are Prediction Markets?
            </h2>
            <div className="prose prose-lg max-w-none text-slate-700">
              <p className="text-lg leading-relaxed mb-6">
                Prediction markets are platforms where you can buy and sell shares based on the outcome of future events. Think of it like the stock market, but instead of trading company shares, you're trading on whether something will happen.
              </p>
              <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-r-lg my-8">
                <h3 className="text-xl font-semibold text-slate-900 mb-3 flex items-center">
                  <Brain className="w-6 h-6 mr-2 text-blue-600" />
                  Example: Election Prediction
                </h3>
                <p className="text-slate-700 leading-relaxed">
                  If there's a market for "Will Candidate A win the election?", you can buy "Yes" shares if you think they'll win, or "No" shares if you think they'll lose. Share prices range from $0.01 to $0.99 and represent the market's collective belief about the probability of that outcome.
                </p>
                <p className="text-slate-700 leading-relaxed mt-4">
                  If you buy "Yes" at $0.65 and the candidate wins, each share pays out $1.00. Your profit is $0.35 per share. If they lose, your shares are worth $0.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How They Work */}
      <section className="py-16 md:py-20 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            How Prediction Markets Work
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-emerald-600">1</span>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Browse Markets</h3>
              <p className="text-slate-600 leading-relaxed">
                Find events you understand and have opinions about. Politics, sports, crypto, economics, tech - Polymarket has markets for all major events.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-blue-600">2</span>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Buy Shares</h3>
              <p className="text-slate-600 leading-relaxed">
                If you think the market's probability is wrong, buy shares. Pay $0.60 for a "Yes" share? If it resolves Yes, you get $1.00 back.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-amber-600">3</span>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Market Resolves</h3>
              <p className="text-slate-600 leading-relaxed">
                When the event concludes, the market resolves. Correct predictions pay $1.00 per share. Incorrect predictions pay $0.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Trade Prediction Markets */}
      <section className="py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Why Trade Prediction Markets?
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Profit from Your Knowledge</h3>
                <p className="text-slate-600 leading-relaxed">
                  If you have insights others don't, you can profit from being right. Your political analysis, sports knowledge, or tech expertise has real value.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Brain className="w-5 h-5 text-blue-600" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Improve Your Thinking</h3>
                <p className="text-slate-600 leading-relaxed">
                  Trading forces you to quantify your beliefs and think probabilistically. You'll become better at evaluating uncertainty and making predictions.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <Shield className="w-5 h-5 text-purple-600" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Hedge Real-World Risks</h3>
                <p className="text-slate-600 leading-relaxed">
                  Running a business affected by politics? Holding crypto? You can hedge real-world risks by taking positions in related prediction markets.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                  <Target className="w-5 h-5 text-amber-600" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">More Transparent Than Traditional Betting</h3>
                <p className="text-slate-600 leading-relaxed">
                  On-chain markets with transparent order books. No hidden fees, no black-box odds. You see exactly what the market believes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Platforms */}
      <section className="py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Popular Prediction Market Platforms
          </h2>
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-xl border-2 border-polycopy-yellow shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-slate-900">Polymarket</h3>
                <span className="bg-polycopy-yellow text-slate-900 text-xs font-bold px-2 py-1 rounded-full">FEATURED</span>
              </div>
              <p className="text-slate-700 mb-4 leading-relaxed">
                The largest crypto-based prediction market. Trade on politics, sports, crypto, and more. On-chain, transparent, global access.
              </p>
              <p className="text-sm text-slate-600 mb-4">
                <strong>Best for:</strong> Crypto users, US traders, high-volume markets
              </p>
              <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer" className="text-polycopy-yellow hover:underline font-semibold text-sm">
                Visit Polymarket →
              </a>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-4">Kalshi</h3>
              <p className="text-slate-700 mb-4 leading-relaxed">
                CFTC-regulated US prediction market. Trade with USD, FDIC-insured accounts, legal for US residents.
              </p>
              <p className="text-sm text-slate-600 mb-4">
                <strong>Best for:</strong> US residents, traditional finance users
              </p>
              <a href="https://kalshi.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold text-sm">
                Visit Kalshi →
              </a>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-4">Manifold</h3>
              <p className="text-slate-700 mb-4 leading-relaxed">
                Play-money prediction market. Free to use, great for learning without risk. Community-created markets.
              </p>
              <p className="text-sm text-slate-600 mb-4">
                <strong>Best for:</strong> Beginners, learning, fun/casual trading
              </p>
              <a href="https://manifold.markets" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline font-semibold text-sm">
                Visit Manifold →
              </a>
            </div>
          </div>
          <p className="text-center text-slate-600 text-sm">
            This guide focuses on Polymarket, the most popular platform. <Link href="/polymarket-vs-other-platforms" className="text-polycopy-yellow hover:underline font-medium">Compare all platforms →</Link>
          </p>
        </div>
      </section>

      {/* Getting Started Steps */}
      <section className="py-16 md:py-20 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            How to Get Started on Polymarket (5 Steps)
          </h2>
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border-l-4 border-emerald-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Step 1: Set Up a Wallet
              </h3>
              <p className="text-slate-700 leading-relaxed">
                Polymarket runs on the Polygon blockchain. You'll need a crypto wallet (MetaMask is popular) and some USDC stablecoin to trade. Don't worry - it's easier than it sounds, and Polymarket has guides.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-blue-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Step 2: Start Small
              </h3>
              <p className="text-slate-700 leading-relaxed">
                Your first few trades should be small. Think $5-20 per position. Focus on learning how the platform works and how prices move, not on making huge profits.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-purple-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Step 3: Pick Markets You Understand
              </h3>
              <p className="text-slate-700 leading-relaxed">
                Don't trade obscure geopolitical events if you're not a foreign policy expert. Start with categories where you have genuine knowledge - maybe sports if you follow leagues closely, or tech if you work in the industry.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-amber-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Step 4: Follow Successful Traders
              </h3>
              <p className="text-slate-700 leading-relaxed mb-4">
                One of the best ways to learn is by watching profitable traders. Polycopy makes this easy - follow top performers, see their trades in real-time, and understand their reasoning.
              </p>
              <Link href="/top-traders">
                <Button variant="outline" size="sm" className="text-polycopy-yellow border-polycopy-yellow hover:bg-polycopy-yellow/10">
                  Browse Top Traders
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Step 5: Learn from Every Trade
              </h3>
              <p className="text-slate-700 leading-relaxed">
                Keep a simple log: Why did you make this trade? What was your thesis? What happened? Win or lose, every trade teaches you something about the market and your own judgment.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Common Beginner Mistakes */}
      <section className="py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Common Beginner Mistakes to Avoid
          </h2>
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border-l-4 border-amber-500 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <X className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Trading Markets You Don't Understand</h3>
                  <p className="text-slate-700 leading-relaxed">
                    Just because a market exists doesn't mean you should trade it. If you can't explain why the current price is wrong, don't trade.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-amber-500 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <X className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Ignoring Base Rates</h3>
                  <p className="text-slate-700 leading-relaxed">
                    "I have a feeling" isn't a strategy. Before betting against the market, ask: What do I know that thousands of other traders don't? If you can't answer that, reconsider.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-amber-500 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <X className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Overtrading</h3>
                  <p className="text-slate-700 leading-relaxed">
                    You don't need to have an active position in every market. The best traders are selective. Wait for opportunities where you have a real edge.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-amber-500 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <X className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Letting Emotions Drive Decisions</h3>
                  <p className="text-slate-700 leading-relaxed">
                    You're rooting for Team A, so you buy "Yes" at $0.90 even though the odds are poor. Bad idea. Trade what you think will happen, not what you want to happen.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-amber-500 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <X className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Not Understanding Timing</h3>
                  <p className="text-slate-700 leading-relaxed">
                    A market can be "wrong" for months before resolving correctly. Make sure you can afford to have your capital tied up until resolution.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Beginner Strategies */}
      <section className="py-16 md:py-20 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            3 Beginner-Friendly Strategies
          </h2>
          <div className="space-y-8">
            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="text-2xl font-semibold text-slate-900">Copy Trading</h3>
              </div>
              <p className="text-slate-700 leading-relaxed mb-4">
                The easiest way to start. Follow experienced traders on Polycopy, see their trades as they happen, and decide which ones to copy. You learn while you trade.
              </p>
              <p className="text-sm text-slate-600 mb-4">
                <strong>Best for:</strong> Complete beginners who want to learn from successful traders.
              </p>
              <Link href="/copy-trading">
                <Button variant="outline" size="sm" className="text-polycopy-yellow border-polycopy-yellow hover:bg-polycopy-yellow/10">
                  Learn About Copy Trading
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>

            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-2xl font-semibold text-slate-900">Event-Based Trading</h3>
              </div>
              <p className="text-slate-700 leading-relaxed mb-4">
                Trade around scheduled events where you have an information edge. Sports games, earnings reports, political debates - events with clear timelines and outcomes.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Best for:</strong> Beginners who follow specific domains closely (sports, tech, politics).
              </p>
            </div>

            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-purple-600" />
                </div>
                <h3 className="text-2xl font-semibold text-slate-900">High-Confidence, Low-Frequency</h3>
              </div>
              <p className="text-slate-700 leading-relaxed mb-4">
                Only trade when you're highly confident the market is mispriced. Maybe that's once a week, or once a month. Quality over quantity.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Best for:</strong> Beginners with limited time who want to be strategic and selective.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Resources */}
      <section className="py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Keep Learning
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Link href="/polymarket-trading-strategies" className="bg-slate-50 hover:bg-slate-100 transition-colors p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-2 flex items-center">
                <TrendingUp className="w-5 h-5 mr-2 text-emerald-600" />
                Trading Strategies
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Learn 6 proven strategies used by profitable Polymarket traders, from event-based to arbitrage.
              </p>
            </Link>

            <Link href="/top-traders" className="bg-slate-50 hover:bg-slate-100 transition-colors p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-2 flex items-center">
                <Users className="w-5 h-5 mr-2 text-blue-600" />
                Top Traders
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Browse the highest-performing traders on Polymarket and see what they're trading in real-time.
              </p>
            </Link>

            <Link href="/polymarket-vs-other-platforms" className="bg-slate-50 hover:bg-slate-100 transition-colors p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-2 flex items-center">
                <Shield className="w-5 h-5 mr-2 text-purple-600" />
                Platform Comparison
              </h3>
              <p className="text-slate-600 leading-relaxed">
                See how Polymarket compares to other prediction markets like Kalshi, PredictIt, and Manifold.
              </p>
            </Link>

            <Link href="/how-to-copy-trade-polymarket" className="bg-slate-50 hover:bg-slate-100 transition-colors p-6 rounded-xl border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-2 flex items-center">
                <Target className="w-5 h-5 mr-2 text-amber-600" />
                How to Copy Trade
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Step-by-step guide to copying successful traders and learning from their strategies.
              </p>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-20 bg-gradient-to-b from-slate-50 to-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
            Ready to Start Trading?
          </h2>
          <p className="text-xl text-slate-600 mb-4 leading-relaxed">
            Follow top traders, see their strategies in action, and start making informed decisions.
          </p>
          <p className="text-lg text-slate-600 mb-8 leading-relaxed">
            Not sure which markets to trade? <Link href="/polymarket-market-categories" className="text-polycopy-yellow hover:underline font-semibold">Explore all market categories</Link> to find topics you know well.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="https://polycopy.app">
              <Button size="lg" className="bg-polycopy-yellow hover:bg-polycopy-yellow/90 text-slate-900 font-semibold text-base px-8 h-12">
                Get Started Free
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="font-semibold text-base px-8 h-12">
                View Pricing
              </Button>
            </Link>
          </div>
          <p className="text-sm text-slate-500 mt-6">
            Free to browse. No credit card required to start following traders.
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="py-8 bg-slate-100 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-600 leading-relaxed">
              <strong>Not Financial Advice:</strong> This guide is for educational purposes only. Prediction market trading involves risk, and you can lose money. Past performance does not guarantee future results. Only trade with money you can afford to lose. Do your own research and consider your personal financial situation before trading.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
