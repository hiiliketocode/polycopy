'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, TrendingUp, Target, Brain, Eye, CheckCircle2, AlertCircle, Zap, Trophy } from 'lucide-react';
import { TopTraders } from '@/components/landing/top-traders';
import { Navigation } from '@/components/polycopy/navigation';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

export default function BestPolymarketTradersPage() {
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
            <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-800 px-4 py-2 rounded-full text-sm font-semibold mb-6">
              <Trophy className="w-4 h-4" />
              Live Leaderboard
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
              Best Polymarket Traders
            </h1>
            <p className="text-xl text-slate-600 mb-8 leading-relaxed max-w-3xl mx-auto">
              Real-time rankings of the most profitable prediction market traders. See their strategies, track their performance, and learn from the best.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="https://polycopy.app">
                <Button size="lg" className="bg-polycopy-yellow hover:bg-polycopy-yellow/90 text-slate-900 font-semibold text-base px-8 h-12">
                  Start Following Traders
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/copy-trading">
                <Button size="lg" variant="outline" className="font-semibold text-base px-8 h-12">
                  How Copy Trading Works
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Live Leaderboard */}
      <section className="py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4">
          {/* Embed the TopTraders component */}
          <TopTraders />
          
          <div className="mt-8 text-center">
            <Link href="/top-traders">
              <Button variant="outline" size="lg" className="font-semibold">
                View Full Leaderboard
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* What Makes a Great Trader */}
      <section className="py-12 md:py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            What Makes a Great Polymarket Trader?
          </h2>
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border-l-4 border-emerald-500 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">High ROI Over Volume</h3>
                  <p className="text-slate-700 leading-relaxed">
                    The best traders don't just trade a lot - they trade well. A 50% ROI on $100K volume beats 10% ROI on $1M volume. Look for traders who are selective and profitable, not just active.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-blue-500 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Target className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">Consistent Performance</h3>
                  <p className="text-slate-700 leading-relaxed">
                    Anyone can get lucky on one big trade. Great traders are consistently profitable across multiple markets and time periods. Check their trend line - is it steadily up, or wildly volatile?
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-purple-500 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Brain className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">Category Specialization</h3>
                  <p className="text-slate-700 leading-relaxed">
                    The best traders often specialize. Some dominate sports markets because they have deep knowledge of the leagues. Others excel in crypto or politics. Generalists exist, but specialists often have an edge.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-amber-500 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">Fast Reaction to News</h3>
                  <p className="text-slate-700 leading-relaxed">
                    Great traders react quickly when new information emerges. They're often the first to adjust positions after breaking news, earning profits before the broader market catches up.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How to Evaluate Traders */}
      <section className="py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            How to Evaluate Traders
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Look For</h3>
              </div>
              <ul className="space-y-3 text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 mt-1">•</span>
                  <span>ROI above 20% over sustained periods</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 mt-1">•</span>
                  <span>Upward trending P&L chart (not just one spike)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 mt-1">•</span>
                  <span>Trade volume that shows they're active</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 mt-1">•</span>
                  <span>Specialization in 1-2 categories you understand</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 mt-1">•</span>
                  <span>Multiple profitable months (not just this week)</span>
                </li>
              </ul>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-rose-100 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Red Flags</h3>
              </div>
              <ul className="space-y-3 text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="text-rose-600 mt-1">•</span>
                  <span>Massive ROI on tiny volume ($100 traded, 500% ROI)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-600 mt-1">•</span>
                  <span>Wildly volatile P&L (huge wins, huge losses)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-600 mt-1">•</span>
                  <span>Only trades obscure, low-liquidity markets</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-600 mt-1">•</span>
                  <span>Recent performance tanking after initial spike</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-600 mt-1">•</span>
                  <span>Trading every single market with no focus</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Categories of Top Traders */}
      <section className="py-12 md:py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Top Traders by Category
          </h2>
          <p className="text-lg text-slate-600 text-center mb-12 max-w-2xl mx-auto">
            Different markets reward different skills. Explore top performers in each category.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            <Link href="/sports-prediction-markets" className="bg-white hover:bg-slate-50 transition-colors p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Sports Traders</h3>
              <p className="text-slate-600 leading-relaxed">
                Traders who dominate NFL, NBA, soccer, and other sports markets with deep league knowledge.
              </p>
            </Link>

            <Link href="/politics-prediction-markets" className="bg-white hover:bg-slate-50 transition-colors p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Politics Traders</h3>
              <p className="text-slate-600 leading-relaxed">
                Election specialists who analyze polls, track candidates, and profit from political events.
              </p>
            </Link>

            <Link href="/crypto-prediction-markets" className="bg-white hover:bg-slate-50 transition-colors p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Crypto Traders</h3>
              <p className="text-slate-600 leading-relaxed">
                Traders focused on Bitcoin, Ethereum, altcoins, and crypto market predictions.
              </p>
            </Link>

            <Link href="/business-prediction-markets" className="bg-white hover:bg-slate-50 transition-colors p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Business Traders</h3>
              <p className="text-slate-600 leading-relaxed">
                Finance and business specialists trading earnings, IPOs, M&A, and corporate events.
              </p>
            </Link>
          </div>
          <div className="mt-8 text-center">
            <Link href="/polymarket-market-categories">
              <Button variant="outline" className="font-semibold">
                View All Categories
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Why Follow Top Traders */}
      <section className="py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Why Follow the Best Traders?
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Eye className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Learn Their Strategies</h3>
              <p className="text-slate-600 leading-relaxed">
                See what markets they trade, when they enter, when they exit, and how they manage risk.
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Copy Profitable Trades</h3>
              <p className="text-slate-600 leading-relaxed">
                When you see a trade that makes sense, you can copy it. Learn by doing.
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Brain className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Improve Your Judgment</h3>
              <p className="text-slate-600 leading-relaxed">
                Over time, you'll internalize what good trades look like and develop your own edge.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pro Tips */}
      <section className="py-16 md:py-20 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border-y border-blue-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="bg-white rounded-2xl shadow-lg border-2 border-blue-200 p-6 md:p-10">
            <div className="flex flex-col md:flex-row items-start gap-6">
              <div className="flex-shrink-0 mx-auto md:mx-0">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <Zap className="w-7 h-7 text-white" />
                </div>
              </div>
              <div className="flex-1 w-full">
                <h3 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4 text-center md:text-left">Pro Tip: Don't Blindly Copy</h3>
                <p className="text-base md:text-lg text-slate-700 leading-relaxed mb-4">
                  Following top traders doesn't mean copying every trade automatically. The best approach:
                </p>
                <ol className="space-y-2 md:space-y-3 text-slate-700 ml-6 list-decimal mb-6 text-sm md:text-lg">
                  <li>See a trade from a trader you follow</li>
                  <li>Ask yourself: Do I understand this market?</li>
                  <li>Do I agree with their thesis?</li>
                  <li>If yes to both, consider copying. If not, skip it.</li>
                </ol>
                <p className="text-base md:text-lg text-slate-700 leading-relaxed mb-6">
                  You're not outsourcing your judgment - you're using their trades as high-quality signals to inform your own decisions.
                </p>
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 p-4 md:p-6 rounded-r-xl">
                  <p className="text-sm md:text-base text-slate-700 mb-4 font-medium">
                    Want to learn the right way to copy trades? We've got a complete guide.
                  </p>
                  <Link href="/copy-trading">
                    <Button className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                      Learn How Copy Trading Works
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-20 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
            Start Following Top Traders Today
          </h2>
          <p className="text-xl text-slate-600 mb-8 leading-relaxed">
            See their trades in real-time, learn their strategies, and build your own edge.
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
            Free to browse and follow traders. No credit card required.
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="py-8 bg-slate-100 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-600 leading-relaxed">
              <strong>Not Financial Advice:</strong> Past performance does not guarantee future results. Trading involves risk and you can lose money. Following successful traders does not ensure profitability. Always do your own research and only trade with funds you can afford to lose.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
