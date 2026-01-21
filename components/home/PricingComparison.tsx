import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function PricingComparison() {
  return (
    <div className="bg-white py-20 lg:py-32">
      <div className="max-w-7xl mx-auto px-6">
        <h2 className="text-4xl lg:text-5xl font-black text-slate-900 mb-6 text-center">
          Start free, upgrade when ready
        </h2>
        <p className="text-xl text-slate-600 mb-16 text-center max-w-3xl mx-auto">
          Get full access to the curated feed for free. Upgrade to Premium for one-click execution.
        </p>
        
        <div className="grid lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Free */}
          <div className="bg-slate-50 rounded-2xl p-8 border-2 border-slate-200">
            <h3 className="text-2xl font-bold text-slate-900 mb-2">Free</h3>
            <div className="text-4xl font-black text-slate-900 mb-6">$0<span className="text-lg font-normal text-slate-600">/forever</span></div>
            
            <ul className="space-y-3 mb-8">
              {[
                'Manual copy trades',
                'Unlimited following',
                'Curated feed',
                'Portfolio tracking',
                'Filter & search'
              ].map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">{feature}</span>
                </li>
              ))}
            </ul>
            
            <Link href="/login?mode=signup">
              <Button className="w-full bg-slate-900 text-white hover:bg-slate-800" size="lg">
                Start For Free
              </Button>
            </Link>
          </div>
          
          {/* Premium */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 border-2 border-[#FDB022] relative">
            <div className="absolute -top-4 right-8 bg-[#FDB022] text-slate-900 px-4 py-1 rounded-full text-sm font-bold">
              POPULAR
            </div>
            
            <h3 className="text-2xl font-bold text-white mb-2">Premium</h3>
            <div className="text-4xl font-black text-white mb-6">$20<span className="text-lg font-normal text-slate-300">/month</span></div>
            
            <div className="text-sm text-slate-300 mb-4">Everything in Free, plus:</div>
            
            <ul className="space-y-3 mb-8">
              {[
                'Quick copy trades',
                'Auto-close positions',
                'Advanced controls',
                'Connected wallet',
                'Priority support'
              ].map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-[#FDB022] mt-0.5 flex-shrink-0" />
                  <span className="text-white">{feature}</span>
                </li>
              ))}
            </ul>
            
            <Link href="/login?mode=signup">
              <Button className="w-full bg-[#FDB022] text-slate-900 hover:bg-yellow-400" size="lg">
                Upgrade to Premium
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
