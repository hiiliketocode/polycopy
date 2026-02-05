'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Navigation } from '@/components/polycopy/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  ArrowRight, 
  Check,
  X,
  TrendingUp,
  DollarSign,
  Users,
  Shield,
  Zap,
  Globe,
  ChevronDown,
  AlertCircle
} from 'lucide-react';

export default function ComparisonPage() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const faqs = [
    {
      question: "Which prediction market has the most liquidity?",
      answer: "Polymarket has the highest liquidity of any prediction market, with billions in monthly volume. This means tighter spreads, better prices, and easier entry/exit on trades. Kalshi is second for US users, while PredictIt has much lower liquidity."
    },
    {
      question: "Can I copy trade on platforms other than Polymarket?",
      answer: "Currently, Polycopy only supports Polymarket. Other platforms don't have robust APIs or trader tracking infrastructure needed for copy trading. Polymarket's blockchain-based transparency makes it ideal for following and copying traders."
    },
    {
      question: "Is Polymarket legal in the US?",
      answer: "Polymarket is available globally but excludes US users from direct platform access. US users can legally access prediction markets through Kalshi (CFTC-regulated) or PredictIt (no-action letter from CFTC). Always check local regulations."
    },
    {
      question: "Which platform has the lowest fees?",
      answer: "Polymarket charges no platform fees - you only pay Polygon network gas fees (pennies). Kalshi charges 7% on winnings. PredictIt charges 10% on profits plus 5% withdrawal fees. Manifold uses play money (no real money trading)."
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
                <TrendingUp className="w-4 h-4 text-polycopy-yellow" />
                <span className="text-sm font-medium text-slate-900">
                  Platform comparison
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 leading-tight mb-6">
                Polymarket vs{' '}
                <span className="relative inline-block">
                  <span className="relative z-10 text-polycopy-yellow">Other Platforms</span>
                  <svg className="absolute -bottom-2 left-0 w-full h-3 text-polycopy-yellow/30" viewBox="0 0 200 12" preserveAspectRatio="none">
                    <path d="M0,8 Q50,0 100,8 T200,8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>

              <p className="text-xl text-slate-600 mb-8 leading-relaxed">
                Honest comparison of Polymarket, Kalshi, PredictIt, and other prediction markets.<br className="hidden sm:inline" />
                Liquidity, fees, markets, and why Polymarket is best for copy trading.
              </p>
            </div>
          </div>
        </section>

        {/* Quick Comparison Table */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Platform Comparison at a Glance
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="text-left py-4 px-4 font-semibold text-slate-900 border-b-2 border-slate-300">Feature</th>
                    <th className="text-center py-4 px-4 font-semibold text-slate-900 border-b-2 border-slate-300 bg-polycopy-yellow/10">Polymarket</th>
                    <th className="text-center py-4 px-4 font-semibold text-slate-900 border-b-2 border-slate-300">Kalshi</th>
                    <th className="text-center py-4 px-4 font-semibold text-slate-900 border-b-2 border-slate-300">PredictIt</th>
                    <th className="text-center py-4 px-4 font-semibold text-slate-900 border-b-2 border-slate-300">Manifold</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="py-4 px-4 font-medium text-slate-900">Monthly Volume</td>
                    <td className="py-4 px-4 text-center bg-green-50 font-semibold text-green-700">$100M+</td>
                    <td className="py-4 px-4 text-center text-slate-700">$10-20M</td>
                    <td className="py-4 px-4 text-center text-slate-700">~$5M</td>
                    <td className="py-4 px-4 text-center text-slate-700">Play money</td>
                  </tr>
                  <tr className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="py-4 px-4 font-medium text-slate-900">Platform Fees</td>
                    <td className="py-4 px-4 text-center bg-green-50 font-semibold text-green-700">0%</td>
                    <td className="py-4 px-4 text-center text-slate-700">7% on wins</td>
                    <td className="py-4 px-4 text-center text-slate-700">10% + 5% w/d</td>
                    <td className="py-4 px-4 text-center text-slate-700">0% (fake $)</td>
                  </tr>
                  <tr className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="py-4 px-4 font-medium text-slate-900">US Access</td>
                    <td className="py-4 px-4 text-center bg-red-50 font-semibold text-red-700">No</td>
                    <td className="py-4 px-4 text-center text-green-700 font-semibold">Yes (CFTC)</td>
                    <td className="py-4 px-4 text-center text-green-700 font-semibold">Yes (limited)</td>
                    <td className="py-4 px-4 text-center text-green-700 font-semibold">Yes</td>
                  </tr>
                  <tr className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="py-4 px-4 font-medium text-slate-900">Copy Trading</td>
                    <td className="py-4 px-4 text-center bg-green-50">
                      <Check className="w-5 h-5 text-green-600 mx-auto" />
                    </td>
                    <td className="py-4 px-4 text-center">
                      <X className="w-5 h-5 text-slate-300 mx-auto" />
                    </td>
                    <td className="py-4 px-4 text-center">
                      <X className="w-5 h-5 text-slate-300 mx-auto" />
                    </td>
                    <td className="py-4 px-4 text-center">
                      <X className="w-5 h-5 text-slate-300 mx-auto" />
                    </td>
                  </tr>
                  <tr className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="py-4 px-4 font-medium text-slate-900">Active Markets</td>
                    <td className="py-4 px-4 text-center bg-green-50 font-semibold text-green-700">1000+</td>
                    <td className="py-4 px-4 text-center text-slate-700">100+</td>
                    <td className="py-4 px-4 text-center text-slate-700">~50</td>
                    <td className="py-4 px-4 text-center text-slate-700">10,000+</td>
                  </tr>
                  <tr className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="py-4 px-4 font-medium text-slate-900">Min. Trade</td>
                    <td className="py-4 px-4 text-center bg-green-50 font-semibold text-green-700">$1</td>
                    <td className="py-4 px-4 text-center text-slate-700">$1</td>
                    <td className="py-4 px-4 text-center text-slate-700">$1</td>
                    <td className="py-4 px-4 text-center text-slate-700">$0 (fake)</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="py-4 px-4 font-medium text-slate-900">Transparency</td>
                    <td className="py-4 px-4 text-center bg-green-50 font-semibold text-green-700">Blockchain</td>
                    <td className="py-4 px-4 text-center text-slate-700">Centralized</td>
                    <td className="py-4 px-4 text-center text-slate-700">Centralized</td>
                    <td className="py-4 px-4 text-center text-slate-700">Centralized</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="text-center text-sm text-slate-600 mt-6">
              Data as of January 2026. Volumes and market counts fluctuate.
            </p>
          </div>
        </section>

        {/* Detailed Comparisons */}
        <section className="py-16 md:py-24 bg-slate-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Platform Deep Dives
              </h2>
            </div>

            <div className="space-y-8">
              {/* Polymarket */}
              <Card className="p-8 border-2 border-polycopy-yellow">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-16 h-16 bg-polycopy-yellow rounded-full flex items-center justify-center font-bold text-2xl text-slate-900">
                    #1
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">Polymarket</h3>
                    <p className="text-slate-600">The global leader in prediction markets</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-green-700 mb-3 flex items-center gap-2">
                      <Check className="w-5 h-5" />
                      Strengths
                    </h4>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li>• Highest liquidity by far ($100M+ monthly volume)</li>
                      <li>• Zero platform fees (only gas, pennies per trade)</li>
                      <li>• 1000+ active markets across all categories</li>
                      <li>• Blockchain transparency (all trades public)</li>
                      <li>• <strong>Only platform with copy trading (Polycopy)</strong></li>
                      <li>• Largest trader community to follow and learn from</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-red-700 mb-3 flex items-center gap-2">
                      <X className="w-5 h-5" />
                      Weaknesses
                    </h4>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li>• Not available to US users (geo-blocked)</li>
                      <li>• Requires crypto wallet (small learning curve)</li>
                      <li>• Less regulatory clarity in some jurisdictions</li>
                    </ul>
                    <div className="mt-4 bg-green-50 p-4 rounded-lg border border-green-200">
                      <p className="text-xs text-green-900 font-semibold">
                        Best For: International traders, crypto-comfortable users, anyone wanting to copy trade
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Kalshi */}
              <Card className="p-8">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-2xl">
                    #2
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">Kalshi</h3>
                    <p className="text-slate-600">US-regulated, CFTC-approved platform</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-green-700 mb-3 flex items-center gap-2">
                      <Check className="w-5 h-5" />
                      Strengths
                    </h4>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li>• Legal for US users (CFTC regulated)</li>
                      <li>• No crypto needed (USD deposits)</li>
                      <li>• Growing market selection (~100 markets)</li>
                      <li>• Decent liquidity ($10-20M monthly)</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-red-700 mb-3 flex items-center gap-2">
                      <X className="w-5 h-5" />
                      Weaknesses
                    </h4>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li>• 7% fee on all winnings (adds up fast)</li>
                      <li>• Lower liquidity than Polymarket</li>
                      <li>• Fewer markets available</li>
                      <li>• No copy trading infrastructure</li>
                      <li>• US-only (geo-blocked internationally)</li>
                    </ul>
                    <div className="mt-4 bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <p className="text-xs text-blue-900 font-semibold">
                        Best For: US traders who want regulation, those uncomfortable with crypto
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* PredictIt */}
              <Card className="p-8">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-16 h-16 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-2xl">
                    #3
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">PredictIt</h3>
                    <p className="text-slate-600">Academic research platform with real money</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-green-700 mb-3 flex items-center gap-2">
                      <Check className="w-5 h-5" />
                      Strengths
                    </h4>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li>• Available to US users</li>
                      <li>• Long operating history (since 2014)</li>
                      <li>• No crypto required</li>
                      <li>• Unique political markets</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-red-700 mb-3 flex items-center gap-2">
                      <X className="w-5 h-5" />
                      Weaknesses
                    </h4>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li>• <strong>10% fee on profits + 5% withdrawal fee</strong></li>
                      <li>• $850 max position per market (severely limited)</li>
                      <li>• Low liquidity (~$5M monthly)</li>
                      <li>• Very few active markets (~50)</li>
                      <li>• Clunky UX, outdated platform</li>
                      <li>• No copy trading</li>
                    </ul>
                    <div className="mt-4 bg-purple-50 p-4 rounded-lg border border-purple-200">
                      <p className="text-xs text-purple-900 font-semibold">
                        Best For: US political junkies with small bankrolls. Hard to recommend for serious trading.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Manifold */}
              <Card className="p-8">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-16 h-16 bg-orange-600 text-white rounded-full flex items-center justify-center font-bold text-2xl">
                    #4
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">Manifold Markets</h3>
                    <p className="text-slate-600">Play money prediction market</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-green-700 mb-3 flex items-center gap-2">
                      <Check className="w-5 h-5" />
                      Strengths
                    </h4>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li>• Completely free (play money)</li>
                      <li>• 10,000+ markets (anyone can create)</li>
                      <li>• Great for learning prediction markets</li>
                      <li>• No regulatory concerns</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-red-700 mb-3 flex items-center gap-2">
                      <X className="w-5 h-5" />
                      Weaknesses
                    </h4>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li>• <strong>No real money - play money only</strong></li>
                      <li>• Less serious participants (gamified)</li>
                      <li>• Many low-quality markets</li>
                      <li>• Can't withdraw or profit financially</li>
                    </ul>
                    <div className="mt-4 bg-orange-50 p-4 rounded-lg border border-orange-200">
                      <p className="text-xs text-orange-900 font-semibold">
                        Best For: Learning how prediction markets work before risking real money. Not for actual trading.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* Why Polymarket for Copy Trading (Currently) */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Why Copy Trading Works Best on Polymarket (For Now)
              </h2>
              <p className="text-xl text-slate-600">
                Current state of copy trading infrastructure across platforms
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <Card className="p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Massive Liquidity</h3>
                <p className="text-slate-600 text-sm">
                  With $100M+ monthly volume, there are actually successful traders worth copying. Lower volume platforms don't have enough proven traders yet.
                </p>
              </Card>

              <Card className="p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Blockchain Transparency</h3>
                <p className="text-slate-600 text-sm">
                  All Polymarket trades are on-chain. This makes trader tracking possible. Other platforms currently hide trader data, making copy trading impossible.
                </p>
              </Card>

              <Card className="p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">500K+ Traders</h3>
                <p className="text-slate-600 text-sm">
                  The largest prediction market community means more strategies to learn from, more traders to follow, better diversification options.
                </p>
              </Card>
            </div>

            <div className="mt-8 bg-blue-50 border-l-4 border-blue-500 p-6 rounded-lg">
              <p className="text-slate-700 leading-relaxed">
                <strong className="text-slate-900">Current state:</strong> Polycopy currently only supports Polymarket due to its unique combination of liquidity, transparency, and trader diversity. We're monitoring other platforms as they grow. If Kalshi, PredictIt, or others develop the infrastructure needed for copy trading, we'll evaluate adding support.
              </p>
              <p className="text-sm text-slate-600 mt-3">
                Learn more: <Link href="/copy-trading" className="text-polycopy-yellow hover:underline font-medium">How copy trading works on Polycopy</Link> | <Link href="/pricing" className="text-polycopy-yellow hover:underline font-medium">Pricing & features</Link>
              </p>
            </div>

            <div className="mt-6 bg-slate-100 p-6 rounded-lg">
              <h4 className="font-semibold text-slate-900 mb-2">What Would Other Platforms Need?</h4>
              <ul className="space-y-2 text-sm text-slate-700">
                <li>• <strong>Public trader data:</strong> Ability to track individual trader performance</li>
                <li>• <strong>API access:</strong> Programmatic trading and data retrieval</li>
                <li>• <strong>Sufficient liquidity:</strong> Enough volume to support copy trading without slippage</li>
                <li>• <strong>Diverse trader base:</strong> Multiple successful traders across categories</li>
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 md:py-24 bg-slate-50">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Platform Questions
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
              Ready to Start on Polymarket?
            </h2>
            <p className="text-xl text-slate-300 mb-8">
              Polycopy currently supports Polymarket. We're monitoring other platforms as they evolve.
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
                  See Top Traders
                </Button>
              </Link>
            </div>
            <p className="mt-6 text-sm text-slate-400">
              Currently supports Polymarket • Highest liquidity • Blockchain transparent
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
