'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  X,
  DollarSign,
  Zap,
  Shield,
  TrendingUp,
  ChevronDown,
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
    <main className="min-h-screen bg-poly-cream">
      {/* Hero Section */}
      <section className="relative bg-poly-paper pt-20 pb-16 md:pt-32 md:pb-24 border-b border-border">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-border bg-card mb-6">
              <DollarSign className="w-4 h-4 text-poly-yellow" />
              <span className="font-body text-sm text-muted-foreground">
                Simple, transparent pricing
              </span>
            </div>

            {/* Headline */}
            <h1 className="font-sans font-black uppercase tracking-tight text-4xl sm:text-5xl md:text-6xl text-poly-black leading-tight mb-6">
              Start Free,{' '}
              <span className="text-poly-yellow">Upgrade When Ready</span>
            </h1>

            <p className="font-body text-xl text-muted-foreground mb-8 leading-relaxed">
              Free tier is genuinely useful, not a trial. Premium adds speed and convenience.<br className="hidden sm:inline" />
              Both tiers give you the feed. No hidden fees, no surprises.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-16 md:py-24 bg-poly-cream border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto mb-12">
            {/* Free Tier */}
            <div className="border border-border bg-white p-8 flex flex-col">
              <div className="mb-6">
                <h3 className="font-sans font-black uppercase tracking-tight text-2xl text-poly-black mb-2">Free</h3>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-5xl font-bold text-poly-black">$0</span>
                  <span className="font-body text-muted-foreground">/forever</span>
                </div>
                <p className="font-body text-sm text-muted-foreground">No credit card required</p>
              </div>

              <div className="mb-6">
                <p className="font-body text-muted-foreground font-medium mb-4">Perfect for learning and manual copying</p>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-poly-yellow mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-body text-poly-black font-medium">Follow unlimited traders</span>
                    <p className="font-body text-sm text-muted-foreground">No restrictions on who you follow</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-poly-yellow mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-body text-poly-black font-medium">Full feed access</span>
                    <p className="font-body text-sm text-muted-foreground">See all trades in real-time</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-poly-yellow mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-body text-poly-black font-medium">Portfolio tracking</span>
                    <p className="font-body text-sm text-muted-foreground">Monitor your positions</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-poly-yellow mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-body text-poly-black font-medium">Manual trade copying</span>
                    <p className="font-body text-sm text-muted-foreground">Copy trades on Polymarket yourself</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-poly-yellow mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-body text-poly-black font-medium">Filter & search traders</span>
                    <p className="font-body text-sm text-muted-foreground">By ROI, category, win rate, etc.</p>
                  </div>
                </li>
              </ul>

              <Link
                href="/v2/login?mode=signup"
                className="inline-block w-full border border-border bg-card px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black text-center transition-all hover:bg-poly-black hover:text-poly-yellow"
              >
                Start Free
              </Link>
            </div>

            {/* Premium Tier */}
            <div className="bg-poly-yellow p-8 relative flex flex-col">
              <span className="absolute -top-3 right-4 bg-poly-black px-3 py-1 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-yellow">
                POPULAR CHOICE
              </span>

              <div className="mb-6">
                <h3 className="font-sans font-black uppercase tracking-tight text-2xl text-poly-black mb-2">Premium</h3>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-5xl font-bold text-poly-black">$20</span>
                  <span className="font-body text-poly-black/70">/month</span>
                </div>
                <p className="font-body text-sm text-poly-black/70">Cancel anytime</p>
              </div>

              <div className="mb-6">
                <p className="font-body text-poly-black font-medium mb-2">Everything in Free, plus:</p>
                <p className="font-body text-sm text-poly-black/70">For traders who want speed & convenience</p>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-poly-black mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-body text-poly-black font-medium">One-click trade execution</span>
                    <p className="font-body text-sm text-poly-black/70">Execute through Polycopy instantly</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-poly-black mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-body text-poly-black font-medium">Auto-close positions</span>
                    <p className="font-body text-sm text-poly-black/70">Exit when original trader exits</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-poly-black mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-body text-poly-black font-medium">Connected wallet</span>
                    <p className="font-body text-sm text-poly-black/70">Seamless integration with your wallet</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-poly-black mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-body text-poly-black font-medium">Advanced controls</span>
                    <p className="font-body text-sm text-poly-black/70">Position sizing, risk limits</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-poly-black mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-body text-poly-black font-medium">Priority support</span>
                    <p className="font-body text-sm text-poly-black/70">Faster response times</p>
                  </div>
                </li>
              </ul>

              <Link
                href="/v2/login?mode=signup"
                className="inline-block w-full bg-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-yellow text-center transition-all hover:bg-poly-black/90"
              >
                Start Free, Upgrade Anytime
              </Link>
            </div>
          </div>

          <p className="text-center font-body text-muted-foreground max-w-2xl mx-auto">
            <strong className="text-poly-black">The feed and curation work the same on both tiers.</strong> Premium is about convenience and speed, not access. Start free, see the value, upgrade when you want faster execution.
          </p>
          <p className="text-center font-body text-sm text-muted-foreground mt-4">
            Want to see copy trading in action? Read our <Link href="/v2/how-to-copy-trade-polymarket" className="text-poly-yellow hover:underline font-medium">step-by-step guide</Link>.
          </p>
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="py-16 md:py-24 bg-poly-paper border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans font-black uppercase tracking-tight text-3xl md:text-4xl text-poly-black mb-4">
              Feature Comparison
            </h2>
            <p className="font-body text-xl text-muted-foreground">
              See exactly what you get with each tier
            </p>
          </div>

          <div className="border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-poly-paper">
                  <tr>
                    <th className="text-left py-4 px-6 font-sans font-bold uppercase text-poly-black">Feature</th>
                    <th className="text-center py-4 px-6 font-sans font-bold uppercase text-poly-black">Free</th>
                    <th className="text-center py-4 px-6 font-sans font-bold uppercase text-poly-black bg-poly-yellow/10">Premium</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
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
                    <tr key={index} className="hover:bg-poly-cream">
                      <td className="py-4 px-6">
                        <div>
                          <p className="font-body font-medium text-poly-black">{row.feature}</p>
                          {row.desc && <p className="font-body text-sm text-muted-foreground">{row.desc}</p>}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-center">
                        {typeof row.free === 'boolean' ? (
                          row.free ? (
                            <Check className="w-5 h-5 text-poly-yellow mx-auto" />
                          ) : (
                            <X className="w-5 h-5 text-muted-foreground mx-auto" />
                          )
                        ) : (
                          <span className="font-body text-sm text-muted-foreground">{row.free}</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-center bg-poly-yellow/5">
                        {typeof row.premium === 'boolean' ? (
                          row.premium ? (
                            <Check className="w-5 h-5 text-poly-yellow mx-auto" />
                          ) : (
                            <X className="w-5 h-5 text-muted-foreground mx-auto" />
                          )
                        ) : (
                          <span className="font-body text-sm text-muted-foreground font-medium">{row.premium}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Why Our Pricing Makes Sense */}
      <section className="py-16 md:py-24 bg-poly-cream border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans font-black uppercase tracking-tight text-3xl md:text-4xl text-poly-black mb-4">
              Why This Pricing Model?
            </h2>
            <p className="font-body text-xl text-muted-foreground">
              Curation is valuable even without automation
            </p>
          </div>

          <div className="space-y-6">
            <div className="border border-border bg-card p-6 md:p-8 transition-colors hover:border-poly-yellow">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center border border-border flex-shrink-0 text-poly-yellow">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-sans font-black uppercase tracking-tight text-xl text-poly-black mb-2">Free Tier Is Actually Useful</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    Most "free tiers" are crippled demos. Ours isn't. You get the full curated feed, unlimited follows, and complete trader data. The only difference is execution speed. Many users make money on the free tier by copying trades manually - they just prefer the convenience of Premium.
                  </p>
                </div>
              </div>
            </div>

            <div className="border border-border bg-card p-6 md:p-8 transition-colors hover:border-poly-yellow">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center border border-border flex-shrink-0 text-poly-yellow">
                  <Clock className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-sans font-black uppercase tracking-tight text-xl text-poly-black mb-2">Premium = Time Savings</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    If you're actively copying trades, Premium pays for itself quickly. One-click execution vs. manually navigating to Polymarket, finding the market, entering amounts, confirming... that adds up fast. $20/mo is cheap for the time you save.
                  </p>
                </div>
              </div>
            </div>

            <div className="border border-border bg-card p-6 md:p-8 transition-colors hover:border-poly-yellow">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center border border-border flex-shrink-0 text-poly-yellow">
                  <Shield className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-sans font-black uppercase tracking-tight text-xl text-poly-black mb-2">No Hidden Fees or Commission</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    Some copy trading platforms charge per trade, take a cut of profits, or have minimum volumes. We don't. You pay $0 or $20/mo. That's it. No commissions, no transaction fees, no surprise charges. What you see is what you pay.
                  </p>
                </div>
              </div>
            </div>

            <div className="border border-border bg-card p-6 md:p-8 transition-colors hover:border-poly-yellow">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center border border-border flex-shrink-0 text-poly-yellow">
                  <Target className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-sans font-black uppercase tracking-tight text-xl text-poly-black mb-2">Aligned Incentives</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    We make money when you find the tool valuable enough to pay for convenience, not when you make trades. This keeps our incentives aligned with yours: build the best curation and decision-making tool, not push you to trade more.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Who Should Choose What */}
      <section className="py-16 md:py-24 bg-poly-paper border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans font-black uppercase tracking-tight text-3xl md:text-4xl text-poly-black mb-4">
              Which Tier Is Right for You?
            </h2>
            <p className="font-body text-xl text-muted-foreground">
              Choose based on your trading style
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Free Tier Best For */}
            <div className="border border-border bg-card p-8">
              <h3 className="font-sans font-black uppercase tracking-tight text-2xl text-poly-black mb-4">Free Tier Is Best For:</h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <div className="flex h-6 w-6 items-center justify-center flex-shrink-0 mt-0.5 border border-border bg-poly-yellow">
                    <Check className="w-4 h-4 text-poly-black" />
                  </div>
                  <span className="font-body text-muted-foreground"><strong className="text-poly-black">Learning mode:</strong> You're new to Polymarket or copy trading and want to observe before committing</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex h-6 w-6 items-center justify-center flex-shrink-0 mt-0.5 border border-border bg-poly-yellow">
                    <Check className="w-4 h-4 text-poly-black" />
                  </div>
                  <span className="font-body text-muted-foreground"><strong className="text-poly-black">Casual traders:</strong> You copy 1-3 trades per week and don't mind the manual process</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex h-6 w-6 items-center justify-center flex-shrink-0 mt-0.5 border border-border bg-poly-yellow">
                    <Check className="w-4 h-4 text-poly-black" />
                  </div>
                  <span className="font-body text-muted-foreground"><strong className="text-poly-black">Small bankroll:</strong> Trading with under $500 and want to keep costs at zero</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex h-6 w-6 items-center justify-center flex-shrink-0 mt-0.5 border border-border bg-poly-yellow">
                    <Check className="w-4 h-4 text-poly-black" />
                  </div>
                  <span className="font-body text-muted-foreground"><strong className="text-poly-black">Pattern seekers:</strong> More interested in learning trader strategies than frequent execution</span>
                </li>
              </ul>
            </div>

            {/* Premium Best For */}
            <div className="border border-border bg-poly-yellow p-8">
              <h3 className="font-sans font-black uppercase tracking-tight text-2xl text-poly-black mb-4">Premium Is Best For:</h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <div className="flex h-6 w-6 items-center justify-center flex-shrink-0 mt-0.5 border border-poly-black bg-poly-black">
                    <Zap className="w-4 h-4 text-poly-yellow" />
                  </div>
                  <span className="font-body text-poly-black"><strong>Active copiers:</strong> You want to copy 5+ trades per week and value time savings</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex h-6 w-6 items-center justify-center flex-shrink-0 mt-0.5 border border-poly-black bg-poly-black">
                    <Zap className="w-4 h-4 text-poly-yellow" />
                  </div>
                  <span className="font-body text-poly-black"><strong>Speed matters:</strong> You want to catch trades quickly before odds shift</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex h-6 w-6 items-center justify-center flex-shrink-0 mt-0.5 border border-poly-black bg-poly-black">
                    <Zap className="w-4 h-4 text-poly-yellow" />
                  </div>
                  <span className="font-body text-poly-black"><strong>Serious bankroll:</strong> Trading with $1,000+ where $20/mo is negligible compared to potential returns</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex h-6 w-6 items-center justify-center flex-shrink-0 mt-0.5 border border-poly-black bg-poly-black">
                    <Zap className="w-4 h-4 text-poly-yellow" />
                  </div>
                  <span className="font-body text-poly-black"><strong>Auto-close fans:</strong> You want to exit positions automatically when the original trader does</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-8 border border-border border-l-4 border-l-poly-yellow bg-poly-paper p-6">
            <p className="font-body text-muted-foreground leading-relaxed">
              <strong className="text-poly-black">Pro tip:</strong> Start free to validate the feed works for you. If you find yourself copying 5+ trades in your first week, upgrade to Premium to save time. Many users stay free for months before upgrading - that's totally fine.
            </p>
            <p className="font-body text-sm text-muted-foreground mt-3">
              Learn more: <Link href="/v2/copy-trading" className="text-poly-yellow hover:underline font-medium">What is copy trading on Polycopy?</Link>
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 md:py-24 bg-poly-cream border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans font-black uppercase tracking-tight text-3xl md:text-4xl text-poly-black mb-4">
              Pricing Questions
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="border border-border bg-card cursor-pointer transition-colors hover:border-poly-yellow"
                onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
              >
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-sans font-bold uppercase text-poly-black pr-4">{faq.question}</h3>
                    <ChevronDown
                      className={`w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform ${
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
      <section className="py-16 md:py-24 bg-poly-black text-white border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-sans font-black uppercase tracking-tight text-3xl md:text-5xl mb-6">
            Start Free, Upgrade Anytime
          </h2>
          <p className="font-body text-xl text-white/80 mb-8">
            No credit card required. No commitment. See the value before paying anything.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/v2/login?mode=signup"
              className="inline-flex items-center justify-center bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow border border-poly-yellow"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
            <Link
              href="/v2/discover"
              className="inline-flex items-center justify-center border border-white px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-white hover:text-poly-black"
            >
              Browse Traders
            </Link>
          </div>
          <p className="mt-6 font-body text-sm text-white/60">
            $0 forever free • $20/mo Premium • No hidden fees
          </p>
        </div>
      </section>
    </main>
  );
}
