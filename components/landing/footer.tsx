"use client"

import Link from "next/link"

const footerLinks = [
  { label: "FAQ", href: "/faq" },
  { label: "Trading Setup", href: "/faq" }, // TODO: Create dedicated trading setup page
  { label: "Terms of Service", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
]

export function Footer() {
  return (
    <footer className="bg-neutral-black border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Links Row */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 lg:gap-6">
          {/* Navigation Links */}
          <nav className="flex flex-wrap items-center justify-center gap-4 lg:gap-6">
            {footerLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-white/60 hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
            {/* X/Twitter */}
            <a
              href="https://x.com/polycopy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/60 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </nav>

          {/* Copyright */}
          <p className="text-sm text-white/60">
            © {new Date().getFullYear()} Polycopy. All rights reserved.
          </p>
        </div>

        {/* Disclaimer */}
        <div className="mt-8 pt-8 border-t border-white/10">
          <p className="text-xs text-white/40 text-center leading-relaxed max-w-4xl mx-auto">
            Trading involves risk. Past performance does not guarantee future results. Polycopy is a copy trading platform and does not provide financial advice. Premium users who connect their wallet authorize Polycopy to execute trades on your behalf when you explicitly instruct us to do so. You maintain full ownership of your wallet and funds at all times. You can disconnect your wallet anytime.
          </p>
        </div>
      </div>
    </footer>
  )
}
