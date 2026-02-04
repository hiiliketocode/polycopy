'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Navigation } from '@/components/polycopy/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowRight, 
  Check,
  X,
  DollarSign,
  Zap,
  Shield,
  Users,
  TrendingUp,
  ChevronDown,
  Sparkles,
  Clock,
  Target
} from 'lucide-react';

export default function PricingPage() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  const faqs = [
    {
      question: "Is Polycopy really free?",
      answer: "Yes! The free tier is genuinely useful, not just a trial. You get unlimited trader follows, full access to your personalized feed, portfolio tracking, and manual trade copying. You can see everything top traders are doing and copy trades yourself on Polymarket."
    },
    {
      question: "What does Premium add for $20/month?",
      answer: "Premium adds speed and convenience: one-click trade execution through Polycopy (no manual copying on Polymarket), auto-close when the original trader exits, connected wallet integration, and priority support. The feed and curation features remain the same - Premium is about faster execution."
    },
    {
      question: "Can I try Premium before paying?",
      answer: "You can start with the free tier and upgrade anytime. The free tier gives you full access to the feed and all traders, so you can experience the core value before deciding on Premium. Some users get promo codes - ask in Discord or contact support."
    },
    {
      question: "Do I need Premium to make money?",
      answer: "No. The free tier gives you everything you need to see what top traders are doing and copy their trades manually. Premium just makes execution faster and more convenient. Many successful users stay on free tier."
    },
    {
      question: "Can I cancel Premium anytime?",
      answer: "Yes. Premium is a monthly subscription with no long-term commitment. Cancel anytime and you'll retain access until the end of your billing period, then automatically revert to the free tier."
    },
    {
      question: "Is there a transaction fee or commission?",
      answer: "No. Polycopy charges no transaction fees or commissions. You only pay the subscription ($0 for free tier, $20/mo for Premium). Trading fees on Polymarket itself still apply, but Polycopy doesn't add anything on top."
    },
    {
      question: "What payment methods do you accept?",
      answer: "We accept all major credit cards (Visa, Mastercard, American Express) and debit cards. Payments are processed securely through Stripe. We don't store your card information."
    },
    {
      question: "Can I switch between Free and Premium?",
      answer: "Yes! Upgrade from Free to Premium instantly anytime. If you cancel Premium, you'll keep access until your billing period ends, then automatically move back to the free tier. No data is lost when switching."
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
                <DollarSign className="w-4 h-4 text-polycopy-yellow" />
                <span className="text-sm font-medium text-slate-900">
                  Simple, transparent pricing
                </span>
              </div>

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 leading-tight mb-6">
                Start Free,{' '}
                <span className="relative inline-block">
                  <span className="relative z-10 text-polycopy-yellow">Upgrade When Ready</span>
                  <svg className="absolute -bottom-2 left-0 w-full h-3 text-polycopy-yellow/30" viewBox="0 0 200 12" preserveAspectRatio="none">
                    <path d="M0,8 Q50,0 100,8 T200,8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>

              <p className="text-xl text-slate-600 mb-8 leading-relaxed">
                Free tier is genuinely useful, not a trial. Premium adds speed and convenience.<br className="hidden sm:inline" />
                Both tiers give you the feed. No hidden fees, no surprises.
              </p>
            </div>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto mb-12">
              {/* Free Tier */}
              <Card className="p-8 border-2 hover:shadow-lg transition-shadow flex flex-col">
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">Free</h3>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-5xl font-bold text-slate-900">$0</span>
                    <span className="text-slate-600">/forever</span>
                  </div>
                  <p className="text-sm text-slate-600">No credit card required</p>
                </div>

                <div className="mb-6">
                  <p className="text-slate-700 font-medium mb-4">Perfect for learning and manual copying</p>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-slate-900 font-medium">Follow unlimited traders</span>
                      <p className="text-sm text-slate-600">No restrictions on who you follow</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-slate-900 font-medium">Full feed access</span>
                      <p className="text-sm text-slate-600">See all trades in real-time</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-slate-900 font-medium">Portfolio tracking</span>
                      <p className="text-sm text-slate-600">Monitor your positions</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-slate-900 font-medium">Manual trade copying</span>
                      <p className="text-sm text-slate-600">Copy trades on Polymarket yourself</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-slate-900 font-medium">Filter & search traders</span>
                      <p className="text-sm text-slate-600">By ROI, category, win rate, etc.</p>
                    </div>
                  </li>
                </ul>

                <Link href="/login?mode=signup" className="mt-auto">
                  <Button size="lg" variant="outline" className="w-full font-semibold">
                    Start Free
                  </Button>
                </Link>
              </Card>

              {/* Premium Tier */}
              <Card className="p-8 border-2 border-polycopy-yellow hover:shadow-lg transition-shadow relative flex flex-col bg-gradient-to-br from-slate-900 to-slate-800 text-white">
                <div className="absolute -top-3 right-4 bg-polycopy-yellow text-slate-900 text-xs font-bold px-3 py-1 rounded-full">
                  MOST POPULAR
                </div>

                <div className="mb-6">
                  <h3 className="text-2xl font-bold mb-2">Premium</h3>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-5xl font-bold">$20</span>
                    <span className="text-slate-300">/month</span>
                  </div>
                  <p className="text-sm text-slate-300">Cancel anytime</p>
                </div>

                <div className="mb-6">
                  <p className="text-slate-200 font-medium mb-2">Everything in Free, plus:</p>
                  <p className="text-sm text-slate-400">For traders who want speed & convenience</p>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-polycopy-yellow mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="font-medium">One-click trade execution</span>
                      <p className="text-sm text-slate-400">Execute through Polycopy instantly</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-polycopy-yellow mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="font-medium">Auto-close positions</span>
                      <p className="text-sm text-slate-400">Exit when original trader exits</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-polycopy-yellow mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="font-medium">Connected wallet</span>
                      <p className="text-sm text-slate-400">Seamless integration with your wallet</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-polycopy-yellow mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="font-medium">Advanced controls</span>
                      <p className="text-sm text-slate-400">Position sizing, risk limits</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-polycopy-yellow mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="font-medium">Priority support</span>
                      <p className="text-sm text-slate-400">Faster response times</p>
                    </div>
                  </li>
                </ul>

                <Link href="/login?mode=signup" className="mt-auto">
                  <Button size="lg" className="w-full bg-polycopy-yellow text-slate-900 hover:bg-polycopy-yellow-hover font-semibold">
                    Start Free, Upgrade Anytime
                  </Button>
                </Link>
              </Card>
            </div>

            <p className="text-center text-slate-600 max-w-2xl mx-auto">
              <strong>The feed and curation work the same on both tiers.</strong> Premium is about convenience and speed, not access. Start free, see the value, upgrade when you want faster execution.
            </p>
            <p className="text-center text-sm text-slate-500 mt-4">
              Want to see copy trading in action? Read our <Link href="/how-to-copy-trade-polymarket" className="text-polycopy-yellow hover:underline font-medium">step-by-step guide</Link>.
            </p>
          </div>
        </section>

        {/* Feature Comparison Table */}
        <section className="py-16 md:py-24 bg-slate-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Feature Comparison
              </h2>
              <p className="text-xl text-slate-600">
                See exactly what you get with each tier
              </p>
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="text-left py-4 px-6 font-semibold text-slate-900">Feature</th>
                      <th className="text-center py-4 px-6 font-semibold text-slate-900">Free</th>
                      <th className="text-center py-4 px-6 font-semibold text-slate-900 bg-polycopy-yellow/10">Premium</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {[
                      { feature: 'Follow traders', free: true, premium: true, desc: 'Unlimited' },
                      { feature: 'Real-time trade feed', free: true, premium: true, desc: 'See all trades as they happen' },
                      { feature: 'Portfolio tracking', free: true, premium: true, desc: 'Monitor your positions' },
                      { feature: 'Trader search & filters', free: true, premium: true, desc: 'By ROI, category, win rate' },
                      { feature: 'Trade execution', free: 'Manual', premium: 'One-click', desc: '' },
                      { feature: 'Auto-close positions', free: false, premium: true, desc: 'Exit when trader exits' },
                      { feature: 'Connected wallet', free: false, premium: true, desc: 'Seamless integration' },
                      { feature: 'Position sizing controls', free: false, premium: true, desc: 'Custom amounts per trade' },
                      { feature: 'Risk management tools', free: false, premium: true, desc: 'Stop-loss, limits' },
                      { feature: 'Priority support', free: false, premium: true, desc: 'Faster response times' },
                    ].map((row, index) => (
                      <tr key={index} className="hover:bg-slate-50">
                        <td className="py-4 px-6">
                          <div>
                            <p className="font-medium text-slate-900">{row.feature}</p>
                            {row.desc && <p className="text-sm text-slate-600">{row.desc}</p>}
                          </div>
                        </td>
                        <td className="py-4 px-6 text-center">
                          {typeof row.free === 'boolean' ? (
                            row.free ? (
                              <Check className="w-5 h-5 text-green-600 mx-auto" />
                            ) : (
                              <X className="w-5 h-5 text-slate-300 mx-auto" />
                            )
                          ) : (
                            <span className="text-sm text-slate-700">{row.free}</span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-center bg-polycopy-yellow/5">
                          {typeof row.premium === 'boolean' ? (
                            row.premium ? (
                              <Check className="w-5 h-5 text-polycopy-yellow mx-auto" />
                            ) : (
                              <X className="w-5 h-5 text-slate-300 mx-auto" />
                            )
                          ) : (
                            <span className="text-sm text-slate-700 font-medium">{row.premium}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </section>

        {/* Why Our Pricing Makes Sense */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Why This Pricing Model?
              </h2>
              <p className="text-xl text-slate-600">
                Curation is valuable even without automation
              </p>
            </div>

            <div className="space-y-6">
              <Card className="p-6 md:p-8 hover:border-polycopy-yellow/30 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-6 h-6 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-slate-900 mb-2">Free Tier Is Actually Useful</h3>
                    <p className="text-slate-600 leading-relaxed">
                      Most "free tiers" are crippled demos. Ours isn't. You get the full curated feed, unlimited follows, and complete trader data. The only difference is execution speed. Many users make money on the free tier by copying trades manually - they just prefer the convenience of Premium.
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-6 md:p-8 hover:border-polycopy-yellow/30 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Clock className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-slate-900 mb-2">Premium = Time Savings</h3>
                    <p className="text-slate-600 leading-relaxed">
                      If you're actively copying trades, Premium pays for itself quickly. One-click execution vs. manually navigating to Polymarket, finding the market, entering amounts, confirming... that adds up fast. $20/mo is cheap for the time you save.
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-6 md:p-8 hover:border-polycopy-yellow/30 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Shield className="w-6 h-6 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-slate-900 mb-2">No Hidden Fees or Commission</h3>
                    <p className="text-slate-600 leading-relaxed">
                      Some copy trading platforms charge per trade, take a cut of profits, or have minimum volumes. We don't. You pay $0 or $20/mo. That's it. No commissions, no transaction fees, no surprise charges. What you see is what you pay.
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-6 md:p-8 hover:border-polycopy-yellow/30 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Target className="w-6 h-6 text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-slate-900 mb-2">Aligned Incentives</h3>
                    <p className="text-slate-600 leading-relaxed">
                      We make money when you find the tool valuable enough to pay for convenience, not when you make trades. This keeps our incentives aligned with yours: build the best curation and decision-making tool, not push you to trade more.
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* Who Should Choose What */}
        <section className="py-16 md:py-24 bg-slate-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Which Tier Is Right for You?
              </h2>
              <p className="text-xl text-slate-600">
                Choose based on your trading style
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Free Tier Best For */}
              <Card className="p-8 bg-gradient-to-br from-green-50 to-white border-green-200">
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Free Tier Is Best For:</h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-slate-700"><strong>Learning mode:</strong> You're new to Polymarket or copy trading and want to observe before committing</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-slate-700"><strong>Casual traders:</strong> You copy 1-3 trades per week and don't mind the manual process</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-slate-700"><strong>Small bankroll:</strong> Trading with under $500 and want to keep costs at zero</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-slate-700"><strong>Pattern seekers:</strong> More interested in learning trader strategies than frequent execution</span>
                  </li>
                </ul>
              </Card>

              {/* Premium Best For */}
              <Card className="p-8 bg-gradient-to-br from-yellow-50 to-white border-polycopy-yellow">
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Premium Is Best For:</h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-polycopy-yellow rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Zap className="w-4 h-4 text-slate-900" />
                    </div>
                    <span className="text-slate-700"><strong>Active copiers:</strong> You want to copy 5+ trades per week and value time savings</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-polycopy-yellow rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Zap className="w-4 h-4 text-slate-900" />
                    </div>
                    <span className="text-slate-700"><strong>Speed matters:</strong> You want to catch trades quickly before odds shift</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-polycopy-yellow rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Zap className="w-4 h-4 text-slate-900" />
                    </div>
                    <span className="text-slate-700"><strong>Serious bankroll:</strong> Trading with $1,000+ where $20/mo is negligible compared to potential returns</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-polycopy-yellow rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Zap className="w-4 h-4 text-slate-900" />
                    </div>
                    <span className="text-slate-700"><strong>Auto-close fans:</strong> You want to exit positions automatically when the original trader does</span>
                  </li>
                </ul>
              </Card>
            </div>

            <div className="mt-8 bg-slate-100 border-l-4 border-polycopy-yellow p-6 rounded-lg">
              <p className="text-slate-700 leading-relaxed">
                <strong className="text-slate-900">Pro tip:</strong> Start free to validate the feed works for you. If you find yourself copying 5+ trades in your first week, upgrade to Premium to save time. Many users stay free for months before upgrading - that's totally fine.
              </p>
              <p className="text-sm text-slate-600 mt-3">
                Learn more: <Link href="/copy-trading" className="text-polycopy-yellow hover:underline font-medium">What is copy trading on Polycopy?</Link>
              </p>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Pricing Questions
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
              Start Free, Upgrade Anytime
            </h2>
            <p className="text-xl text-slate-300 mb-8">
              No credit card required. No commitment. See the value before paying anything.
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
              $0 forever free • $20/mo Premium • No hidden fees
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
