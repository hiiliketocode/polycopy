'use client';

import Link from 'next/link';
import { ArrowRight, Zap, Shield, Clock, CheckCircle2, AlertCircle, MousePointer, Settings, TrendingUp, X } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function OneClickCopyTradingPage() {
  return (
    <div className="min-h-screen bg-poly-cream">
      {/* Hero Section */}
      <section className="border-b border-border bg-poly-paper">
        <div className="max-w-4xl mx-auto px-4 py-16 md:py-24">
          <div className="text-center">
            <div className="mb-6 inline-flex items-center gap-2 bg-poly-yellow px-4 py-2 font-sans text-xs font-bold uppercase tracking-widest text-poly-black">
              <Zap className="h-4 w-4" />
              Premium Feature
            </div>
            <h1 className="mb-6 font-sans text-4xl font-black uppercase tracking-tight text-poly-black md:text-5xl">
              One-Click Trade Execution
            </h1>
            <p className="mb-8 font-body text-xl leading-relaxed text-muted-foreground max-w-3xl mx-auto">
              Stop navigating to Polymarket for every trade. With Premium, execute trades directly in Polycopy with one click. See a trade you want to copy? Click execute. Done.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/v2/landing#pricing"
                className="inline-flex items-center justify-center gap-2 bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
              >
                Get Premium
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/v2/discover"
                className="inline-flex items-center justify-center gap-2 border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
              >
                How Copy Trading Works
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Manual vs One-Click */}
      <section className="border-b border-border bg-poly-cream py-12 md:py-16">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Free vs. Premium Execution
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            {/* Free */}
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow overflow-hidden">
              <div className="mb-6 border-b border-border pb-4">
                <h3 className="font-sans text-xl font-bold uppercase tracking-tight text-poly-black">Free Tier (Manual Copy)</h3>
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-profit-green flex-shrink-0 mt-0.5" />
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">See trades from followed traders in your feed</p>
                </div>
                <div className="flex items-start gap-3">
                  <X className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">Navigate to Polymarket to copy each trade</p>
                </div>
                <div className="flex items-start gap-3">
                  <X className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">Find the market, enter amount, click buy</p>
                </div>
                <div className="flex items-start gap-3">
                  <X className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">Repeat for every trade (5+ clicks per trade)</p>
                </div>
                <div className="flex items-start gap-3">
                  <X className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">Slower execution = worse prices</p>
                </div>
              </div>
            </div>

            {/* Premium */}
            <div className="border-2 border-poly-yellow bg-card p-6 transition-all hover:border-poly-yellow overflow-hidden">
              <div className="mb-6 border-b border-poly-yellow bg-poly-paper px-6 py-4 -mx-6 -mt-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-sans text-xl font-bold uppercase tracking-tight text-poly-black">Premium (One-Click)</h3>
                  <span className="bg-poly-yellow px-4 py-2 font-sans text-xs font-bold uppercase tracking-widest text-poly-black">BEST</span>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-profit-green flex-shrink-0 mt-0.5" />
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">See trades in your feed</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-profit-green flex-shrink-0 mt-0.5" />
                  <p className="font-body text-sm leading-relaxed text-muted-foreground"><strong className="text-poly-black">Click &quot;Execute&quot; - done in 1 second</strong></p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-profit-green flex-shrink-0 mt-0.5" />
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">No tab switching, no searching for markets</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-profit-green flex-shrink-0 mt-0.5" />
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">Faster execution = better entry prices</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-profit-green flex-shrink-0 mt-0.5" />
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">Auto-close when trader exits position</p>
                </div>
              </div>
              <div className="mt-6">
                <Link
                  href="/v2/landing#pricing"
                  className="inline-flex w-full items-center justify-center gap-2 bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
                >
                  Upgrade to Premium
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-b border-border bg-poly-paper py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            How One-Click Execution Works
          </h2>
          <div className="space-y-8">
            <div className="flex gap-6 items-start">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow">
                  <span className="font-sans text-lg font-bold text-poly-black">1</span>
                </div>
              </div>
              <div>
                <h3 className="mb-3 font-sans text-xl font-bold uppercase tracking-tight text-poly-black">Connect Your Polymarket Wallet</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Link your Polymarket wallet address and import your private key through our secure Turnkey integration. This is a one-time setup that takes 2-3 minutes.
                </p>
                <Link href="/v2/portfolio/connect-wallet" className="mt-2 inline-block font-body text-sm font-medium text-poly-yellow transition-colors hover:text-poly-black">
                  View setup guide →
                </Link>
              </div>
            </div>

            <div className="flex gap-6 items-start">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow">
                  <span className="font-sans text-lg font-bold text-poly-black">2</span>
                </div>
              </div>
              <div>
                <h3 className="mb-3 font-sans text-xl font-bold uppercase tracking-tight text-poly-black">See Trades in Your Feed</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Follow traders you trust. When they make a trade, it appears in your Polycopy feed with all the details: market, outcome, price, position size.
                </p>
              </div>
            </div>

            <div className="flex gap-6 items-start">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow">
                  <span className="font-sans text-lg font-bold text-poly-black">3</span>
                </div>
              </div>
              <div>
                <h3 className="mb-3 font-sans text-xl font-bold uppercase tracking-tight text-poly-black">Click &quot;Execute&quot; to Copy</h3>
                <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
                  See a trade you want to copy? Click the &quot;Execute&quot; button. Polycopy places the trade on Polymarket for you instantly. No tab switching, no manual entry.
                </p>
                <div className="border-l-4 border-poly-yellow bg-poly-cream p-4">
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    <strong className="text-poly-black">You still control every trade.</strong> It&apos;s not automated - you manually approve each copy by clicking execute. But the execution itself is instant.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-6 items-start">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow">
                  <span className="font-sans text-lg font-bold text-poly-black">4</span>
                </div>
              </div>
              <div>
                <h3 className="mb-3 font-sans text-xl font-bold uppercase tracking-tight text-poly-black">Auto-Close When Trader Exits</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  When the trader you copied closes their position, Polycopy can automatically close yours too (if you enable this). Or you can manage exits manually - your choice.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="border-b border-border bg-poly-cream py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Why One-Click Execution Matters
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow">
                  <Clock className="h-5 w-5" />
                </div>
              </div>
              <div>
                <h3 className="mb-2 font-sans text-lg font-bold uppercase tracking-tight text-poly-black">Save Time</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Manual copying takes 30-60 seconds per trade (open Polymarket, find market, enter amount, confirm). One-click execution takes 1 second. Copy 10 trades? You just saved 10 minutes.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow">
                  <Zap className="h-5 w-5" />
                </div>
              </div>
              <div>
                <h3 className="mb-2 font-sans text-lg font-bold uppercase tracking-tight text-poly-black">Better Prices</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Prediction markets move fast after news breaks. The 30 seconds it takes to manually copy can mean the difference between $0.45 and $0.52 entry. Speed = profit.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow">
                  <MousePointer className="h-5 w-5" />
                </div>
              </div>
              <div>
                <h3 className="mb-2 font-sans text-lg font-bold uppercase tracking-tight text-poly-black">No Context Switching</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Stay in Polycopy. No tab switching, no searching for markets on Polymarket, no re-entering trade details. Everything happens in one place.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>
              <div>
                <h3 className="mb-2 font-sans text-lg font-bold uppercase tracking-tight text-poly-black">Scale Your Copying</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Follow 5 active traders? One-click execution makes it realistic to copy their best plays without spending hours on manual execution.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* You Still Control Everything */}
      <section className="border-b border-border bg-poly-paper py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <div className="border-2 border-border bg-card p-6 md:p-10">
            <div className="flex flex-col md:flex-row items-start gap-6">
              <div className="flex-shrink-0 mx-auto md:mx-0">
                <div className="flex h-14 w-14 items-center justify-center border border-border bg-poly-black text-poly-yellow">
                  <Shield className="h-7 w-7" />
                </div>
              </div>
              <div className="flex-1 w-full">
                <h3 className="mb-4 text-center md:text-left font-sans text-2xl font-black uppercase tracking-tight text-poly-black md:text-3xl">You Still Control Every Trade</h3>
                <p className="mb-4 font-body text-base leading-relaxed text-muted-foreground md:text-lg">
                  This is <strong className="text-poly-black">not</strong> a trading bot. This is <strong className="text-poly-black">not</strong> autopilot. You manually approve every single trade by clicking &quot;Execute.&quot;
                </p>
                <p className="mb-6 font-body text-base leading-relaxed text-muted-foreground md:text-lg">
                  The difference is <em>how</em> you execute: Premium users click once in Polycopy. Free users open Polymarket, navigate to the market, and manually place the order.
                </p>
                <div className="border-l-4 border-poly-yellow bg-poly-cream p-4 md:p-6">
                  <p className="font-body text-sm leading-relaxed text-muted-foreground font-medium md:text-base">
                    <strong className="text-poly-black">You maintain full control:</strong> You decide which trades to copy, what position size to use, and when to exit. Premium just makes execution faster.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Safety & Security */}
      <section className="border-b border-border bg-poly-cream py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Safety & Security
          </h2>
          <div className="space-y-6">
            <div className="border-l-4 border-profit-green border border-border bg-card p-6">
              <div className="flex items-start gap-4">
                <Shield className="h-6 w-6 text-profit-green flex-shrink-0 mt-1" />
                <div>
                  <h3 className="mb-2 font-sans text-xl font-bold uppercase tracking-tight text-poly-black">You Own Your Wallet</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    Polycopy never holds your funds. Your wallet remains yours - we only get permission to execute trades when you explicitly click &quot;Execute&quot; on a specific trade.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-l-4 border-poly-yellow border border-border bg-card p-6">
              <div className="flex items-start gap-4">
                <Settings className="h-6 w-6 text-poly-yellow flex-shrink-0 mt-1" />
                <div>
                  <h3 className="mb-2 font-sans text-xl font-bold uppercase tracking-tight text-poly-black">Secured by Turnkey</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    We use Turnkey, an institutional-grade wallet infrastructure, to securely store your private key. It&apos;s encrypted and only accessible when you authorize a specific trade.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-l-4 border-poly-yellow border border-border bg-card p-6">
              <div className="flex items-start gap-4">
                <MousePointer className="h-6 w-6 text-poly-yellow flex-shrink-0 mt-1" />
                <div>
                  <h3 className="mb-2 font-sans text-xl font-bold uppercase tracking-tight text-poly-black">Every Trade Requires Your Approval</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    Nothing executes without you clicking a button. You review each trade, decide if you want to copy it, set your position size, and click &quot;Execute.&quot; Complete control.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Who Should Use This */}
      <section className="border-b border-border bg-poly-paper py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Who Should Upgrade to Premium?
          </h2>
          <div className="space-y-6">
            <div className="border-l-4 border-profit-green border border-border bg-card p-6">
              <h3 className="mb-2 flex items-center font-sans text-lg font-bold uppercase tracking-tight text-poly-black">
                <CheckCircle2 className="mr-2 h-5 w-5 text-profit-green" />
                Active Copy Traders
              </h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                If you&apos;re copying 5+ trades per week, the time savings alone justify Premium. Plus, faster execution means better prices on your entries.
              </p>
            </div>

            <div className="border-l-4 border-profit-green border border-border bg-card p-6">
              <h3 className="mb-2 flex items-center font-sans text-lg font-bold uppercase tracking-tight text-poly-black">
                <CheckCircle2 className="mr-2 h-5 w-5 text-profit-green" />
                Traders Who Value Speed
              </h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                In prediction markets, prices shift fast after news. If you want to copy trades at similar prices to the original trader, you need fast execution.
              </p>
            </div>

            <div className="border-l-4 border-profit-green border border-border bg-card p-6">
              <h3 className="mb-2 flex items-center font-sans text-lg font-bold uppercase tracking-tight text-poly-black">
                <CheckCircle2 className="mr-2 h-5 w-5 text-profit-green" />
                People Who Want Convenience
              </h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Manually navigating to Polymarket for every trade gets tedious. If you value your time and want a smoother experience, Premium is worth it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Callout */}
      <section className="border-b border-border bg-poly-black py-12 md:py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="mb-6 font-sans text-3xl font-black uppercase tracking-tight text-white md:text-4xl">
            Ready for One-Click Execution?
          </h2>
          <p className="mb-4 font-body text-xl leading-relaxed text-white/90">
            One-click execution is included in <strong className="text-poly-yellow">Polycopy Premium</strong> for $20/month.
          </p>
          <p className="mb-8 font-body text-base text-white/70">
            Also includes auto-close, priority support, and advanced analytics.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/v2/landing#pricing"
              className="inline-flex items-center justify-center gap-2 bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow border border-poly-yellow"
            >
              View Pricing
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/v2/discover"
              className="inline-flex items-center justify-center gap-2 border border-white px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-white transition-all hover:border-poly-yellow hover:bg-poly-yellow hover:text-poly-black"
            >
              Browse Top Traders
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-border bg-poly-cream py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Frequently Asked Questions
          </h2>
          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="item-1" className="border border-border bg-poly-paper px-6">
              <AccordionTrigger className="font-sans text-lg font-bold uppercase tracking-tight text-poly-black hover:no-underline">
                Is this automated trading?
              </AccordionTrigger>
              <AccordionContent className="pt-2 font-body text-sm leading-relaxed text-muted-foreground">
                No. You manually approve every trade by clicking &quot;Execute.&quot; The automation is only in the execution speed - Polycopy handles the technical steps of placing the order on Polymarket instantly.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2" className="border border-border bg-poly-paper px-6">
              <AccordionTrigger className="font-sans text-lg font-bold uppercase tracking-tight text-poly-black hover:no-underline">
                Can I turn off auto-close?
              </AccordionTrigger>
              <AccordionContent className="pt-2 font-body text-sm leading-relaxed text-muted-foreground">
                Yes. Auto-close is optional. You can choose to have positions close automatically when the original trader exits, or manage all exits manually via Polymarket.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3" className="border border-border bg-poly-paper px-6">
              <AccordionTrigger className="font-sans text-lg font-bold uppercase tracking-tight text-poly-black hover:no-underline">
                Is my wallet secure?
              </AccordionTrigger>
              <AccordionContent className="pt-2 font-body text-sm leading-relaxed text-muted-foreground">
                Yes. We use Turnkey, a secure institutional-grade wallet infrastructure. Your private key is encrypted and only used when you explicitly click &quot;Execute&quot; on a trade. We can&apos;t withdraw funds or transfer assets.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4" className="border border-border bg-poly-paper px-6">
              <AccordionTrigger className="font-sans text-lg font-bold uppercase tracking-tight text-poly-black hover:no-underline">
                Do I have to copy every trade?
              </AccordionTrigger>
              <AccordionContent className="pt-2 font-body text-sm leading-relaxed text-muted-foreground">
                No. You see all trades from your followed traders in your feed. You decide which ones to copy. Skip the ones you don&apos;t understand or disagree with.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5" className="border border-border bg-poly-paper px-6">
              <AccordionTrigger className="font-sans text-lg font-bold uppercase tracking-tight text-poly-black hover:no-underline">
                Can I still copy trades on the free tier?
              </AccordionTrigger>
              <AccordionContent className="pt-2 font-body text-sm leading-relaxed text-muted-foreground">
                Absolutely. Free users see the same feed and can copy any trade manually by navigating to Polymarket. Premium just makes execution faster and more convenient.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-b border-border bg-poly-paper py-12 md:py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="mb-6 font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Stop Wasting Time on Manual Copying
          </h2>
          <p className="mb-8 font-body text-xl leading-relaxed text-muted-foreground">
            Upgrade to Premium and execute trades with one click. More speed, better prices, less hassle.
          </p>
          <Link
            href="/v2/landing#pricing"
            className="inline-flex items-center justify-center gap-2 bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
          >
            Get Premium Now
            <ArrowRight className="h-5 w-5" />
          </Link>
          <p className="mt-6 font-body text-sm text-muted-foreground">
            $20/month. Cancel anytime.
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="border-t border-border bg-poly-paper py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="font-body text-sm leading-relaxed text-muted-foreground">
              <strong className="text-poly-black">Not Financial Advice:</strong> One-click execution does not guarantee profits. You are authorizing Polycopy to execute trades on your behalf when you explicitly click &quot;Execute&quot; on specific trades. Past performance does not predict future results. You maintain full ownership and control of your wallet.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
