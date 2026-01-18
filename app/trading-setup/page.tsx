import Link from 'next/link'
import { Navigation } from '@/components/polycopy/navigation'

export default function TradingSetupPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <Navigation />

      <div className="max-w-4xl mx-auto px-4 py-16">
        <header className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Set Up Trading on Polycopy
          </h1>
          <p className="text-lg text-slate-600">
            A simple, step-by-step guide to get copy trading working fast.
          </p>
        </header>

        <section className="mb-12">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900 mb-3">Start here</h2>
            <p className="text-slate-600 mb-6">
              You only need three things: a Polymarket account created with email, USDC funding, and a linked wallet if
              you are a premium user.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { href: '#account', label: '1. Create a Polymarket account' },
                { href: '#funding', label: '2. Fund your Polymarket account with USDC' },
                { href: '#wallet', label: '3. Premium: Link your Polymarket wallet' },
                { href: '#private-key', label: '4. Premium: Import your private key' },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-[#FDB022] hover:text-slate-900 transition-colors"
                >
                  {item.label}
                  <span className="text-slate-400">→</span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section id="account" className="scroll-mt-8 mb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-6 pb-3 border-b-2 border-[#FDB022]">
            1. Create a Polymarket account
          </h2>
          <div className="space-y-4 text-slate-600">
            <p>
              Create your Polymarket account at{' '}
              <a
                href="https://docs.polymarket.com/polymarket-learn/get-started/how-to-signup"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#FDB022] hover:text-[#E69E1A] font-semibold"
              >
                Polymarket sign-up guide
              </a>
              .
            </p>
            <p className="font-semibold text-slate-900">
              Use email login, not a wallet login. This is required to link your Polymarket wallet later.
            </p>
            <ol className="list-decimal list-inside space-y-2">
              <li>Go to <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer" className="text-[#FDB022] hover:text-[#E69E1A] font-semibold">polymarket.com</a>.</li>
              <li>Click “Sign Up” and choose email login.</li>
              <li>Verify your email and finish your profile.</li>
            </ol>
          </div>
        </section>

        <section id="funding" className="scroll-mt-8 mb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-6 pb-3 border-b-2 border-[#FDB022]">
            2. Fund your Polymarket account with USDC
          </h2>
          <div className="space-y-4 text-slate-600">
            <p>
              Polymarket trading uses USDC (a stablecoin pegged to USD). You can add funds with a card or crypto
              transfer. The official Polymarket funding guide is here:{' '}
              <a
                href="https://docs.polymarket.com/polymarket-learn/get-started/how-to-deposit"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#FDB022] hover:text-[#E69E1A] font-semibold"
              >
                How to deposit on Polymarket
              </a>
              .
            </p>
            <p className="text-sm text-slate-600">
              Your funds stay on Polymarket. Polycopy does not hold your funds or execute trades without your explicit
              action.
            </p>
            <ol className="list-decimal list-inside space-y-2">
              <li>Open the Polymarket deposit page.</li>
              <li>Choose your funding method (card or crypto transfer).</li>
              <li>Confirm your balance shows USDC before copying trades.</li>
            </ol>
            <p className="text-sm text-slate-500">
              Tip: Polymarket uses the Polygon network. Send USDC on Polygon to avoid delays or lost funds.
            </p>
          </div>
        </section>

        <section id="wallet" className="scroll-mt-8 mb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-6 pb-3 border-b-2 border-[#FDB022]">
            3. Premium users: Link your Polymarket wallet
          </h2>
          <div className="space-y-4 text-slate-600">
            <p>
              Your Polymarket wallet is the public 0x address tied to your Polymarket account on Polygon. Polycopy uses
              this address to verify your account and execute trades you approve.
            </p>
            <ol className="list-decimal list-inside space-y-2">
              <li>Open your Polymarket profile or funding page.</li>
              <li>Copy the wallet address (it starts with 0x).</li>
              <li>
                Paste it into Polycopy at{' '}
                <Link href="/profile/connect-wallet" className="text-[#FDB022] hover:text-[#E69E1A] font-semibold">
                  Portfolio → Connect Wallet
                </Link>
                .
              </li>
            </ol>
            <p className="text-sm text-slate-500">
              This is just your public address. You can find it at the top of your Polymarket profile.
            </p>
          </div>
        </section>

        <section id="private-key" className="scroll-mt-8 mb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-6 pb-3 border-b-2 border-[#FDB022]">
            4. Premium users: Import your private key
          </h2>
          <div className="space-y-4 text-slate-600">
            <p>
              To enable Quick Copy, you also import your Polymarket wallet private key. Polymarket provides this via
              Magic’s export flow.
            </p>
            <ol className="list-decimal list-inside space-y-2">
              <li>Go to your Polymarket account settings.</li>
              <li>Click on “If you already logged in”.</li>
              <li>OneWorks and Magic wallet export will show a warning: “Do not share this private key with anybody else”.</li>
              <li>Make sure you are ready to share trade.</li>
              <li>Copy your private key (0x…) and paste it into Polycopy on the Connect Wallet screen.</li>
            </ol>
            <p className="text-sm text-slate-600">
              Secure by Turnkey. Polycopy does not store your private keys; they are held in secured third-party wallets.
            </p>
          </div>
        </section>

        <section className="mt-12">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-bold text-slate-900 mb-3">You are ready to trade</h3>
            <p className="text-slate-600 mb-4">
              Free users can keep copying manually. Premium users can Quick Copy directly inside Polycopy once the wallet
              is linked.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/discover"
                className="px-4 py-2 rounded-lg bg-black text-white font-semibold hover:bg-slate-800 transition-colors"
              >
                Discover traders
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
