import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-slate-900 border-t border-slate-800 py-12 px-4 mt-auto">
      <div className="max-w-6xl mx-auto">
        {/* Main Footer Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Learn Column */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Learn</h3>
            <ul className="space-y-3">
              <li>
                <Link 
                  href="/polymarket-trading-strategies" 
                  className="text-sm text-slate-400 hover:text-[#FDB022] transition-colors"
                >
                  Strategies
                </Link>
              </li>
              <li>
                <Link 
                  href="/how-to-copy-trade-polymarket" 
                  className="text-sm text-slate-400 hover:text-[#FDB022] transition-colors"
                >
                  How-To Guide
                </Link>
              </li>
              <li>
                <Link 
                  href="/polymarket-vs-other-platforms" 
                  className="text-sm text-slate-400 hover:text-[#FDB022] transition-colors"
                >
                  Platform Compare
                </Link>
              </li>
              <li>
                <Link 
                  href="/polymarket-market-categories" 
                  className="text-sm text-slate-400 hover:text-[#FDB022] transition-colors"
                >
                  Market Categories
                </Link>
              </li>
              <li>
                <Link 
                  href="/faq" 
                  className="text-sm text-slate-400 hover:text-[#FDB022] transition-colors"
                >
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* Product Column */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Product</h3>
            <ul className="space-y-3">
              <li>
                <Link 
                  href="/copy-trading" 
                  className="text-sm text-slate-400 hover:text-[#FDB022] transition-colors"
                >
                  Copy Trading
                </Link>
              </li>
              <li>
                <Link 
                  href="/top-traders" 
                  className="text-sm text-slate-400 hover:text-[#FDB022] transition-colors"
                >
                  Top Traders
                </Link>
              </li>
              <li>
                <Link 
                  href="/pricing" 
                  className="text-sm text-slate-400 hover:text-[#FDB022] transition-colors"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link 
                  href="/polymarket-trading-bots" 
                  className="text-sm text-slate-400 hover:text-[#FDB022] transition-colors"
                >
                  Trading Bots
                </Link>
              </li>
              <li>
                <Link 
                  href="/high-signal-polymarket-trades" 
                  className="text-sm text-slate-400 hover:text-[#FDB022] transition-colors"
                >
                  High-Signal Trades
                </Link>
              </li>
              <li>
                <Link 
                  href="/trading-setup" 
                  className="text-sm text-slate-400 hover:text-[#FDB022] transition-colors"
                >
                  Trading Setup
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal Column */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Legal</h3>
            <ul className="space-y-3">
              <li>
                <Link 
                  href="/terms" 
                  className="text-sm text-slate-400 hover:text-[#FDB022] transition-colors"
                >
                  Terms
                </Link>
              </li>
              <li>
                <Link 
                  href="/privacy" 
                  className="text-sm text-slate-400 hover:text-[#FDB022] transition-colors"
                >
                  Privacy
                </Link>
              </li>
            </ul>
          </div>

          {/* Connect Column */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Connect</h3>
            <div className="flex gap-4">
              <a 
                href="https://twitter.com/polycopyapp" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-[#FDB022] transition-colors"
                aria-label="Follow us on Twitter"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="pt-8 border-t border-slate-800">
          {/* Copyright */}
          <div className="text-sm text-slate-400 mb-4">
            © 2026 Polycopy. All rights reserved.
          </div>

          {/* Disclaimer */}
          <div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Trading involves risk. Past performance does not guarantee future results. Polycopy is a copy trading signals 
              platform and does not provide financial advice. Premium users who connect their wallet authorize Polycopy 
              to execute trades on your behalf when you explicitly instruct us to do so. You maintain full ownership of 
              your wallet and funds at all times. You can disconnect your wallet anytime.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
