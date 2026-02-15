import Link from "next/link"

export function V2Footer() {
  return (
    <footer className="hidden bg-poly-black text-white md:block">
      <div className="mx-auto max-w-6xl px-4 py-16">
        {/* Main grid */}
        <div className="grid grid-cols-1 gap-12 md:grid-cols-5">
          {/* Brand column */}
          <div className="md:col-span-1">
            <div className="mb-5 flex items-center gap-1 font-sans text-xl font-black uppercase tracking-tight">
              <span className="border border-poly-yellow px-1.5 py-0.5 text-poly-yellow">POLY</span>
              <span>COPY</span>
            </div>
            <p className="font-body text-sm leading-relaxed text-white/50">
              The ultimate command center for Polymarket copy trading.
              Automate your alpha, mirror your favorite traders, and
              copy proprietary algorithms.
            </p>
          </div>

          {/* Learn Hub */}
          <div>
            <h3 className="mb-5 font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-poly-yellow">
              LEARN_HUB
            </h3>
            <ul className="flex flex-col gap-3">
              <li>
                <Link
                  href="/polymarket-trading-strategies"
                  className="font-sans text-xs font-bold uppercase tracking-wider text-white/80 transition-colors hover:text-white"
                >
                  STRATEGIES
                </Link>
              </li>
              <li>
                <Link
                  href="/how-to-copy-trade-polymarket"
                  className="font-sans text-xs font-bold uppercase tracking-wider text-white/80 transition-colors hover:text-white"
                >
                  HOW-TO GUIDE
                </Link>
              </li>
              <li>
                <Link
                  href="/polymarket-vs-other-platforms"
                  className="font-sans text-xs font-bold uppercase tracking-wider text-white/80 transition-colors hover:text-white"
                >
                  PLATFORM COMPARE
                </Link>
              </li>
              <li>
                <Link
                  href="/polymarket-market-categories"
                  className="font-sans text-xs font-bold uppercase tracking-wider text-white/80 transition-colors hover:text-white"
                >
                  MARKET CATEGORIES
                </Link>
              </li>
              <li>
                <Link
                  href="/faq"
                  className="font-sans text-xs font-bold uppercase tracking-wider text-white/80 transition-colors hover:text-white"
                >
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* Product Core */}
          <div>
            <h3 className="mb-5 font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-poly-yellow">
              PRODUCT_CORE
            </h3>
            <ul className="flex flex-col gap-3">
              <li>
                <Link
                  href="/copy-trading"
                  className="font-sans text-xs font-bold uppercase tracking-wider text-white/80 transition-colors hover:text-white"
                >
                  COPY TRADING
                </Link>
              </li>
              <li>
                <Link
                  href="/top-traders"
                  className="font-sans text-xs font-bold uppercase tracking-wider text-white/80 transition-colors hover:text-white"
                >
                  TOP TRADERS
                </Link>
              </li>
              <li>
                <Link
                  href="/pricing"
                  className="font-sans text-xs font-bold uppercase tracking-wider text-white/80 transition-colors hover:text-white"
                >
                  PRICING
                </Link>
              </li>
              <li>
                <Link
                  href="/trading-setup"
                  className="font-sans text-xs font-bold uppercase tracking-wider text-white/80 transition-colors hover:text-white"
                >
                  TRADING SETUP
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal Dept */}
          <div>
            <h3 className="mb-5 font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-poly-yellow">
              LEGAL_DEPT
            </h3>
            <ul className="flex flex-col gap-3">
              <li>
                <Link
                  href="/terms"
                  className="font-sans text-xs font-bold uppercase tracking-wider text-white/80 transition-colors hover:text-white"
                >
                  TERMS
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="font-sans text-xs font-bold uppercase tracking-wider text-white/80 transition-colors hover:text-white"
                >
                  PRIVACY
                </Link>
              </li>
            </ul>
          </div>

          {/* Connect */}
          <div>
            <h3 className="mb-5 font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-poly-yellow">
              CONNECT
            </h3>
            <a
              href="https://x.com/polycopyapp"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-wider text-white/80 transition-colors hover:text-white"
              aria-label="Follow Polycopy on X"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              @POLYCOPYAPP
            </a>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <p className="mb-4 font-sans text-[10px] font-bold uppercase tracking-widest text-white/40">
            &copy; {new Date().getFullYear()} POLYCOPY_LABS. ALL RIGHTS RESERVED.
          </p>
          <p className="font-sans text-[9px] font-medium uppercase leading-relaxed tracking-wider text-white/25">
            TRADING INVOLVES RISK. PAST PERFORMANCE DOES NOT GUARANTEE FUTURE RESULTS. POLYCOPY IS A COPY TRADING SIGNALS PLATFORM
            AND DOES NOT PROVIDE FINANCIAL ADVICE. PREMIUM USERS WHO CONNECT THEIR WALLET AUTHORIZE POLYCOPY TO EXECUTE TRADES ON
            YOUR BEHALF WHEN YOU EXPLICITLY INSTRUCT US TO DO SO. YOU MAINTAIN FULL OWNERSHIP OF YOUR WALLET AND FUNDS AT ALL TIMES.
            YOU CAN DISCONNECT YOUR WALLET ANYTIME.
          </p>
        </div>
      </div>
    </footer>
  )
}
