import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-slate-900 border-t border-slate-800 py-8 px-4 mt-auto">
      <div className="max-w-6xl mx-auto">
        {/* Main Footer Content */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-6">
          {/* Links Section */}
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-6 gap-y-2">
            <Link 
              href="/faq" 
              className="text-sm text-slate-400 hover:text-[#FDB022] transition-colors font-medium"
            >
              FAQ
            </Link>
            <Link 
              href="/trading-setup" 
              className="text-sm text-slate-400 hover:text-[#FDB022] transition-colors"
            >
              Trading Setup
            </Link>
            <Link 
              href="/terms" 
              className="text-sm text-slate-400 hover:text-[#FDB022] transition-colors"
            >
              Terms of Service
            </Link>
            <Link 
              href="/privacy" 
              className="text-sm text-slate-400 hover:text-[#FDB022] transition-colors"
            >
              Privacy Policy
            </Link>
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

          {/* Copyright */}
          <div className="text-sm text-slate-400 text-center md:text-right">
            © 2026 Polycopy. All rights reserved.
          </div>
        </div>

        {/* Disclaimer */}
        <div className="pt-6 border-t border-slate-800">
          <p className="text-xs text-slate-500 text-center max-w-3xl mx-auto leading-relaxed">
            Trading involves risk. Past performance does not guarantee future results. Polycopy is a copy trading signals 
            platform and does not provide financial advice. Premium users who connect their wallet authorize Polycopy 
            to execute trades on your behalf when you explicitly instruct us to do so. You maintain full ownership of 
            your wallet and funds at all times. You can disconnect your wallet anytime.
          </p>
        </div>
      </div>
    </footer>
  );
}
