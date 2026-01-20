import Link from "next/link"
import { Twitter } from "lucide-react"

export function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-300 mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-6">
            <Link href="/faq" className="text-sm hover:text-white transition-colors">
              FAQ
            </Link>
            <Link href="/terms" className="text-sm hover:text-white transition-colors">
              Terms of Service
            </Link>
            <Link href="/privacy" className="text-sm hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <a
              href="https://x.com/polycopyapp"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
              aria-label="Follow Polycopy on X"
            >
              <Twitter className="h-5 w-5" />
            </a>
          </div>
          <div className="text-sm">© {new Date().getFullYear()} Polycopy. All rights reserved.</div>
        </div>
        <div className="text-xs text-slate-400 text-center max-w-4xl mx-auto">
          Trading involves risk. Past performance does not guarantee future results. Polycopy is a copy trading platform
          and does not provide financial advice. By importing your wallet, you authorize Polycopy to execute trades on
          your behalf based on the traders you follow. You can disconnect your wallet anytime.
        </div>
      </div>
    </footer>
  )
}
