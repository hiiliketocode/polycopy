'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Zap, Shield, Clock, CheckCircle2, AlertCircle, MousePointer, Settings, TrendingUp, X } from 'lucide-react';
import { Navigation } from '@/components/polycopy/navigation';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function OneClickCopyTradingPage() {
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
            <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-800 px-4 py-2 rounded-full text-sm font-semibold mb-6">
              <Zap className="w-4 h-4" />
              Premium Feature
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
              One-Click Trade Execution
            </h1>
            <p className="text-xl text-slate-600 mb-8 leading-relaxed max-w-3xl mx-auto">
              Stop navigating to Polymarket for every trade. With Premium, execute trades directly in Polycopy with one click. See a trade you want to copy? Click execute. Done.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/pricing">
                <Button size="lg" className="bg-polycopy-yellow hover:bg-polycopy-yellow/90 text-slate-900 font-semibold text-base px-8 h-12">
                  Get Premium
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

      {/* Manual vs One-Click */}
      <section className="py-12 md:py-16">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Free vs. Premium Execution
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            {/* Free */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-100 px-6 py-4 border-b border-slate-200">
                <h3 className="text-xl font-semibold text-slate-900">Free Tier (Manual Copy)</h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <p className="text-slate-700 text-sm">See trades from followed traders in your feed</p>
                </div>
                <div className="flex items-start gap-3">
                  <X className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                  <p className="text-slate-700 text-sm">Navigate to Polymarket to copy each trade</p>
                </div>
                <div className="flex items-start gap-3">
                  <X className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                  <p className="text-slate-700 text-sm">Find the market, enter amount, click buy</p>
                </div>
                <div className="flex items-start gap-3">
                  <X className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                  <p className="text-slate-700 text-sm">Repeat for every trade (5+ clicks per trade)</p>
                </div>
                <div className="flex items-start gap-3">
                  <X className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                  <p className="text-slate-700 text-sm">Slower execution = worse prices</p>
                </div>
              </div>
            </div>

            {/* Premium */}
            <div className="bg-white rounded-xl border-2 border-polycopy-yellow shadow-lg overflow-hidden">
              <div className="bg-gradient-to-r from-amber-50 to-yellow-50 px-6 py-4 border-b border-polycopy-yellow">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-slate-900">Premium (One-Click)</h3>
                  <span className="text-xs font-semibold bg-polycopy-yellow text-slate-900 px-2 py-1 rounded-full">BEST</span>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <p className="text-slate-700 text-sm">See trades in your feed</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <p className="text-slate-700 text-sm"><strong>Click "Execute" - done in 1 second</strong></p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <p className="text-slate-700 text-sm">No tab switching, no searching for markets</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <p className="text-slate-700 text-sm">Faster execution = better entry prices</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <p className="text-slate-700 text-sm">Auto-close when trader exits position</p>
                </div>
              </div>
              <div className="px-6 pb-6">
                <Link href="/pricing">
                  <Button className="w-full bg-polycopy-yellow hover:bg-polycopy-yellow/90 text-slate-900 font-semibold">
                    Upgrade to Premium
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-12 md:py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            How One-Click Execution Works
          </h2>
          <div className="space-y-8">
            <div className="flex gap-6 items-start">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-blue-600">1</span>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-900 mb-3">Connect Your Polymarket Wallet</h3>
                <p className="text-slate-700 leading-relaxed">
                  Link your Polymarket wallet address and import your private key through our secure Turnkey integration. This is a one-time setup that takes 2-3 minutes.
                </p>
                <Link href="/trading-setup" className="text-polycopy-yellow hover:underline font-medium text-sm mt-2 inline-block">
                  View setup guide →
                </Link>
              </div>
            </div>

            <div className="flex gap-6 items-start">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-purple-600">2</span>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-900 mb-3">See Trades in Your Feed</h3>
                <p className="text-slate-700 leading-relaxed">
                  Follow traders you trust. When they make a trade, it appears in your Polycopy feed with all the details: market, outcome, price, position size.
                </p>
              </div>
            </div>

            <div className="flex gap-6 items-start">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-emerald-600">3</span>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-900 mb-3">Click "Execute" to Copy</h3>
                <p className="text-slate-700 leading-relaxed mb-4">
                  See a trade you want to copy? Click the "Execute" button. Polycopy places the trade on Polymarket for you instantly. No tab switching, no manual entry.
                </p>
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
                  <p className="text-sm text-slate-700">
                    <strong>You still control every trade.</strong> It's not automated - you manually approve each copy by clicking execute. But the execution itself is instant.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-6 items-start">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-amber-600">4</span>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-900 mb-3">Auto-Close When Trader Exits</h3>
                <p className="text-slate-700 leading-relaxed">
                  When the trader you copied closes their position, Polycopy can automatically close yours too (if you enable this). Or you can manage exits manually - your choice.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Why One-Click Execution Matters
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Clock className="w-5 h-5 text-blue-600" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Save Time</h3>
                <p className="text-slate-600 leading-relaxed">
                  Manual copying takes 30-60 seconds per trade (open Polymarket, find market, enter amount, confirm). One-click execution takes 1 second. Copy 10 trades? You just saved 10 minutes.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                  <Zap className="w-5 h-5 text-emerald-600" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Better Prices</h3>
                <p className="text-slate-600 leading-relaxed">
                  Prediction markets move fast after news breaks. The 30 seconds it takes to manually copy can mean the difference between $0.45 and $0.52 entry. Speed = profit.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <MousePointer className="w-5 h-5 text-purple-600" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Context Switching</h3>
                <p className="text-slate-600 leading-relaxed">
                  Stay in Polycopy. No tab switching, no searching for markets on Polymarket, no re-entering trade details. Everything happens in one place.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-amber-600" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Scale Your Copying</h3>
                <p className="text-slate-600 leading-relaxed">
                  Follow 5 active traders? One-click execution makes it realistic to copy their best plays without spending hours on manual execution.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* You Still Control Everything */}
      <section className="py-12 md:py-16 bg-blue-50 border-y border-blue-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="bg-white rounded-2xl shadow-lg border-2 border-blue-200 p-6 md:p-10">
            <div className="flex flex-col md:flex-row items-start gap-6">
              <div className="flex-shrink-0 mx-auto md:mx-0">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <Shield className="w-7 h-7 text-white" />
                </div>
              </div>
              <div className="flex-1 w-full">
                <h3 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4 text-center md:text-left">You Still Control Every Trade</h3>
                <p className="text-base md:text-lg text-slate-700 leading-relaxed mb-4">
                  This is <strong>not</strong> a trading bot. This is <strong>not</strong> autopilot. You manually approve every single trade by clicking "Execute."
                </p>
                <p className="text-base md:text-lg text-slate-700 leading-relaxed mb-6">
                  The difference is <em>how</em> you execute: Premium users click once in Polycopy. Free users open Polymarket, navigate to the market, and manually place the order.
                </p>
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 p-4 md:p-6 rounded-r-xl">
                  <p className="text-sm md:text-base text-slate-700 font-medium">
                    <strong>You maintain full control:</strong> You decide which trades to copy, what position size to use, and when to exit. Premium just makes execution faster.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Safety & Security */}
      <section className="py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Safety & Security
          </h2>
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border-l-4 border-emerald-500 shadow-sm">
              <div className="flex items-start gap-4">
                <Shield className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">You Own Your Wallet</h3>
                  <p className="text-slate-700 leading-relaxed">
                    Polycopy never holds your funds. Your wallet remains yours - we only get permission to execute trades when you explicitly click "Execute" on a specific trade.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-blue-500 shadow-sm">
              <div className="flex items-start gap-4">
                <Settings className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">Secured by Turnkey</h3>
                  <p className="text-slate-700 leading-relaxed">
                    We use Turnkey, an institutional-grade wallet infrastructure, to securely store your private key. It's encrypted and only accessible when you authorize a specific trade.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-purple-500 shadow-sm">
              <div className="flex items-start gap-4">
                <MousePointer className="w-6 h-6 text-purple-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">Every Trade Requires Your Approval</h3>
                  <p className="text-slate-700 leading-relaxed">
                    Nothing executes without you clicking a button. You review each trade, decide if you want to copy it, set your position size, and click "Execute." Complete control.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Who Should Use This */}
      <section className="py-12 md:py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Who Should Upgrade to Premium?
          </h2>
          <div className="space-y-6">
            <div className="bg-emerald-50 border-l-4 border-emerald-500 p-6 rounded-r-lg">
              <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center">
                <CheckCircle2 className="w-5 h-5 mr-2 text-emerald-600" />
                Active Copy Traders
              </h3>
              <p className="text-slate-700 leading-relaxed">
                If you're copying 5+ trades per week, the time savings alone justify Premium. Plus, faster execution means better prices on your entries.
              </p>
            </div>

            <div className="bg-emerald-50 border-l-4 border-emerald-500 p-6 rounded-r-lg">
              <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center">
                <CheckCircle2 className="w-5 h-5 mr-2 text-emerald-600" />
                Traders Who Value Speed
              </h3>
              <p className="text-slate-700 leading-relaxed">
                In prediction markets, prices shift fast after news. If you want to copy trades at similar prices to the original trader, you need fast execution.
              </p>
            </div>

            <div className="bg-emerald-50 border-l-4 border-emerald-500 p-6 rounded-r-lg">
              <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center">
                <CheckCircle2 className="w-5 h-5 mr-2 text-emerald-600" />
                People Who Want Convenience
              </h3>
              <p className="text-slate-700 leading-relaxed">
                Manually navigating to Polymarket for every trade gets tedious. If you value your time and want a smoother experience, Premium is worth it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Callout */}
      <section className="py-12 md:py-16 bg-gradient-to-r from-amber-50 to-yellow-50 border-y border-polycopy-yellow">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
            Ready for One-Click Execution?
          </h2>
          <p className="text-xl text-slate-700 mb-4 leading-relaxed">
            One-click execution is included in <strong>Polycopy Premium</strong> for $20/month.
          </p>
          <p className="text-base text-slate-600 mb-8">
            Also includes auto-close, priority support, and advanced analytics.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/pricing">
              <Button size="lg" className="bg-polycopy-yellow hover:bg-polycopy-yellow/90 text-slate-900 font-semibold text-base px-8 h-12">
                View Pricing
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/top-traders">
              <Button size="lg" variant="outline" className="font-semibold text-base px-8 h-12 border-slate-900 hover:bg-slate-900 hover:text-white">
                Browse Top Traders
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Frequently Asked Questions
          </h2>
          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="item-1" className="bg-slate-50 rounded-xl border border-slate-200 px-6">
              <AccordionTrigger className="text-lg font-semibold text-slate-900 hover:no-underline">
                Is this automated trading?
              </AccordionTrigger>
              <AccordionContent className="text-slate-700 leading-relaxed pt-2">
                No. You manually approve every trade by clicking "Execute." The automation is only in the execution speed - Polycopy handles the technical steps of placing the order on Polymarket instantly.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2" className="bg-slate-50 rounded-xl border border-slate-200 px-6">
              <AccordionTrigger className="text-lg font-semibold text-slate-900 hover:no-underline">
                Can I turn off auto-close?
              </AccordionTrigger>
              <AccordionContent className="text-slate-700 leading-relaxed pt-2">
                Yes. Auto-close is optional. You can choose to have positions close automatically when the original trader exits, or manage all exits manually via Polymarket.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3" className="bg-slate-50 rounded-xl border border-slate-200 px-6">
              <AccordionTrigger className="text-lg font-semibold text-slate-900 hover:no-underline">
                Is my wallet secure?
              </AccordionTrigger>
              <AccordionContent className="text-slate-700 leading-relaxed pt-2">
                Yes. We use Turnkey, a secure institutional-grade wallet infrastructure. Your private key is encrypted and only used when you explicitly click "Execute" on a trade. We can't withdraw funds or transfer assets.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4" className="bg-slate-50 rounded-xl border border-slate-200 px-6">
              <AccordionTrigger className="text-lg font-semibold text-slate-900 hover:no-underline">
                Do I have to copy every trade?
              </AccordionTrigger>
              <AccordionContent className="text-slate-700 leading-relaxed pt-2">
                No. You see all trades from your followed traders in your feed. You decide which ones to copy. Skip the ones you don't understand or disagree with.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5" className="bg-slate-50 rounded-xl border border-slate-200 px-6">
              <AccordionTrigger className="text-lg font-semibold text-slate-900 hover:no-underline">
                Can I still copy trades on the free tier?
              </AccordionTrigger>
              <AccordionContent className="text-slate-700 leading-relaxed pt-2">
                Absolutely. Free users see the same feed and can copy any trade manually by navigating to Polymarket. Premium just makes execution faster and more convenient.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 md:py-16 bg-gradient-to-b from-slate-50 to-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
            Stop Wasting Time on Manual Copying
          </h2>
          <p className="text-xl text-slate-600 mb-8 leading-relaxed">
            Upgrade to Premium and execute trades with one click. More speed, better prices, less hassle.
          </p>
          <Link href="/pricing">
            <Button size="lg" className="bg-polycopy-yellow hover:bg-polycopy-yellow/90 text-slate-900 font-semibold text-base px-8 h-12">
              Get Premium Now
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
          <p className="text-sm text-slate-500 mt-6">
            $20/month. Cancel anytime.
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="py-8 bg-slate-100 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-600 leading-relaxed">
              <strong>Not Financial Advice:</strong> One-click execution does not guarantee profits. You are authorizing Polycopy to execute trades on your behalf when you explicitly click "Execute" on specific trades. Past performance does not predict future results. You maintain full ownership and control of your wallet.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
