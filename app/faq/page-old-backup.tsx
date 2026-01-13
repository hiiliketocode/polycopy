'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Navigation } from '@/components/polycopy/navigation';
import { ChevronDown } from 'lucide-react';

interface FAQ {
  question: string;
  answer: React.ReactNode;
  category: string;
}

const faqs: FAQ[] = [
  // GETTING STARTED
  {
    category: 'Getting Started',
    question: 'What is Polycopy?',
    answer: (
      <div className="space-y-3">
        <p>
          Polycopy is a copy trading platform for Polymarket prediction markets. We help you discover and copy trades from 
          successful Polymarket traders, allowing you to mirror their strategies and potentially benefit from their expertise.
        </p>
        <p>
          We surface trades in your feed in near real-time so you can copy almost instantly and reduce slippage risk in fast-moving markets. 
          Think of it like following expert investors on the stock market - except for prediction markets. You can see what 
          the top performers are betting on and either manually copy their trades (free) or automatically execute them 
          on Polycopy in two clicks (premium).
        </p>
      </div>
    ),
  },
  {
    category: 'Getting Started',
    question: 'Do I need a Polymarket account to use Polycopy?',
    answer: (
      <div className="space-y-3">
        <p>
          Yes. You need a funded Polymarket account (with USDC) and a Premium subscription to place trades via Polycopy. Free users can still browse, follow, and manually copy trades, but executing trades requires a funded Polymarket wallet.
        </p>
        <p className="text-sm text-slate-600">
          Quick Copy (premium) also requires connecting your Polymarket wallet to Polycopy.
        </p>
      </div>
    ),
  },
  {
    category: 'Getting Started',
    question: 'How does Polycopy work?',
    answer: (
      <div className="space-y-3">
        <p>Polycopy works in four simple steps:</p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li><strong>Discover Top Traders:</strong> Browse our leaderboard to find successful traders based on their PnL, ROI, volume, and win rate.</li>
          <li><strong>Follow Traders:</strong> Follow traders you're interested in to see their trades in your personalized feed.</li>
          <li><strong>Copy Trades:</strong> When a followed trader makes a bet, copy it manually (free) or on Polycopy in two clicks (premium).</li>
          <li><strong>Track Performance:</strong> Monitor your copy trading performance and adjust your strategy over time.</li>
        </ol>
        <p className="text-sm text-slate-600 mt-3">
          All trading data comes from the Polygon blockchain and Polymarket's public APIs, ensuring transparency and accuracy.
        </p>
      </div>
    ),
  },
  {
    category: 'Getting Started',
    question: 'How do I find traders to copy on Polycopy?',
    answer: (
      <div className="space-y-3">
        <p>
          Use the <Link href="/discover" className="text-[#FDB022] hover:text-[#E69E1A] font-medium">Discover page</Link> to find 
          and evaluate traders. Here's what you can do:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>View Trending Traders:</strong> See top performers ranked by their recent success</li>
          <li><strong>Filter by Category:</strong> Find traders who specialize in specific markets (Politics, Sports, Crypto, etc.)</li>
          <li><strong>Analyze Performance:</strong> Review detailed stats including PnL, ROI, volume, win rate, and trading history</li>
          <li><strong>Time Period Filters:</strong> See performance over different timeframes (24h, 7d, 30d, all-time) to identify consistent traders</li>
          <li><strong>Sort by Metrics:</strong> Rank traders by profit, ROI percentage, or trading volume to match your strategy</li>
        </ul>
        <p className="text-sm text-slate-600 mt-3">
          Pro tip: Look for traders with consistent performance across multiple time periods, not just short-term wins.
        </p>
      </div>
    ),
  },

  // COPY TRADING
  {
    category: 'Copy Trading',
    question: 'What is Manual Copy and how do I use it? (Free Feature)',
    answer: (
      <div className="space-y-3">
        <p>
          Manual Copy is our free feature that lets you replicate trades from traders you follow. Here's how it works:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li><strong>Find a Trade:</strong> See a trade you like in your feed from a followed trader</li>
          <li><strong>Click "Manual Copy":</strong> This opens a new tab taking you directly to the Polymarket market for that trade</li>
          <li><strong>Execute on Polymarket:</strong> Log into Polymarket (if not already logged in) and manually place the bet with your desired amount</li>
          <li><strong>Return to Polycopy:</strong> Come back to Polycopy and click "Mark as Copied"</li>
          <li><strong>Enter Trade Details:</strong> Fill in your Entry Price (price per contract) and Amount Invested (dollar amount you bet)</li>
          <li><strong>Confirm:</strong> Click confirm and your trade will now be visible in your profile under the "Trades" tab</li>
        </ol>
        <p className="text-sm bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
          <strong>Note:</strong> Manual Copy requires you to have a Polymarket account and execute trades yourself on their platform. 
          It's perfect for getting started with copy trading without connecting your wallet.
        </p>
      </div>
    ),
  },
  {
    category: 'Copy Trading',
    question: 'What is Quick Copy and how does it work? (Premium Feature)',
    answer: (
      <div className="space-y-3">
        <p>
          Quick Copy is a premium feature that lets you execute copy trades directly on Polycopy - no need 
          to leave the platform or manually enter trade details.
        </p>
        
        <p className="font-semibold mt-4">How it works:</p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>See a trade in your feed from a followed trader</li>
          <li>Click "Quick Copy" button</li>
          <li>Review pre-filled trade parameters (outcome, amount, slippage)</li>
          <li>Input the dollar amount for your copy trade</li>
          <li>Adjust settings if desired (see advanced features below)</li>
          <li>Click "Execute Trade" - done!</li>
        </ol>

        <p className="text-sm text-slate-600">
          We show the current fill price automatically; only update it if it has changed.
        </p>

        <p className="font-semibold mt-4">Advanced Features Available:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Custom Slippage:</strong> Set how much price movement you'll tolerate (default is optimized for you)</li>
          <li><strong>Fill or Kill (FoK):</strong> Execute the trade fully at your price or cancel it entirely</li>
          <li><strong>Limit Orders:</strong> Set a maximum price you're willing to pay (full manual controls coming soon)</li>
          <li><strong>Auto-Close Positions:</strong> Automatically close your position when the trader you copied exits</li>
          <li><strong>Position Sizing:</strong> Customize how much you want to invest per trade</li>
        </ul>
      </div>
    ),
  },
  {
    category: 'Copy Trading',
    question: 'Can I manually sell my Quick Copied order?',
    answer: (
      <div className="space-y-3">
        <p>
          Yes. Premium users can manually sell a Quick Copy position anytime (market conditions allowing).
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Go to your profile and open the <strong>Trades</strong> page</li>
          <li>Find the copied trade you want to exit</li>
          <li>Click <strong>Sell</strong> and confirm the order</li>
        </ol>
        <p className="text-sm text-slate-600">
          If the market is illiquid or halted, you may need to wait for a fill or try again later.
        </p>
      </div>
    ),
  },
  {
    category: 'Copy Trading',
    question: 'What happens when a trader I copied closes their trade before a market resolves?',
    answer: (
      <div className="space-y-3">
        <p>
          If a trader you are copying closes their trade before the market resolves, Polycopy will send you an email letting you know.
        </p>

        <p>
          Users with premium subscriptions can enable the Auto-Close feature during a Quick Trade to automatically close a position when the trader they copied closes theirs.
        </p>

        <p className="font-semibold mt-4">How Auto-Close Works:</p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>During the Quick Copy process, check the "Auto-Close Position" option</li>
          <li>Execute your copy trade as normal</li>
          <li>Polycopy monitors the trader's position</li>
          <li>When they close/exit their position, Polycopy automatically closes yours at the current market price</li>
          <li>You realize your profit or loss immediately, matching the trader's exit timing</li>
        </ol>

        <p className="text-sm bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
          <strong>Why use Auto-Close?</strong> Many successful traders exit positions early to lock in profits before market 
          resolution. Auto-Close ensures you follow their complete strategy, including their exit timing - a critical part of 
          their success.
        </p>
      </div>
    ),
  },
  // TRADING & ORDERS
  {
    category: 'Trading & Orders',
    question: 'What is slippage?',
    answer: (
      <div className="space-y-3">
        <p>
          Slippage is the difference between the price you expect and the price you actually get. In fast-moving Polymarket markets, prices can change quickly while your order is being placed.
        </p>
        <p className="text-sm text-slate-600">
          Polycopy focuses on speed to help reduce slippage, but it can still happen when liquidity is thin or the market moves fast.
        </p>
      </div>
    ),
  },
  {
    category: 'Trading & Orders',
  {
    category: 'Trading & Orders',
    question: 'What is the minimum order size?',
    answer: (
      <div className="space-y-3">
        <p>
          The minimum is usually $1, but it may vary by market conditions. If your order is below the minimum, Polycopy will show you the exact minimum for that market.
        </p>
      </div>
    ),
  },
  {
    category: 'Trading & Orders',
    question: 'Why is the contract amount different from the one I entered?',
    answer: (
      <div className="space-y-3">
        <p>
          Prices move quickly, so we may adjust the contract amount to stay close to the live price, keep it above the market minimum, and round to valid contract increments.
        </p>
        <p className="text-sm text-slate-600">
          The goal is to place the closest valid order without it being rejected by the market.
        </p>
      </div>
    ),
  },
  {
    category: 'Trading & Orders',
    question: "What's the difference between Fill or Kill (FoK) and Good to Cancel (GTC)?",
    answer: (
      <div className="space-y-3">
        <p>
          <strong>Fill or Kill</strong> means the order must fill completely right away or it cancels. <strong>Good to Cancel</strong> keeps the order open until it fills or you cancel it.
        </p>
        <p className="text-sm text-slate-600">
          Most users prefer FoK because Polymarket markets move fast and they want to avoid stale orders.
        </p>
      </div>
    ),
  },
  {
    category: 'Trading & Orders',
    question: 'Can I enter limit orders?',
    answer: (
      <div className="space-y-3">
        <p>
          All Polymarket orders are limit orders by design, and Polycopy tries to get you the best available price at the time of execution.
        </p>
        <p className="text-sm text-slate-600">
          Full manual limit controls are coming soon.
        </p>
      </div>
    ),
  },
  {
    category: 'Trading & Orders',
    question: 'Can I see my Polymarket trades on Polycopy?',
    answer: (
      <div className="space-y-3">
        <p>
          Polycopy only shows trades made or marked as traded on Polycopy. Polycopy users can see their manual and Quick Copy trades on the "Trades" tab of the profile page. Polymarket trades executed on platforms other than Polycopy do not display on Polycopy.
        </p>
      </div>
    ),
  },
  // STRATEGY & RISK
  {
    category: 'Strategy & Risk',
    question: 'What are the risks of using Polymarket Polycopy?',
    answer: (
      <div className="space-y-3">
        <p>
          Polymarket markets move quickly, and copying trades doesn’t guarantee the same results. A trader with a strong track record today can underperform tomorrow.
        </p>
        <p className="text-sm text-slate-600">
          Only trade what you can afford to lose, and make sure each copy fits your strategy and risk tolerance.
        </p>
      </div>
    ),
  },
// WALLET & SECURITY
  {
    category: 'Wallet & Security',
    question: 'How do I connect my Polymarket wallet to Polycopy?',
    answer: (
      <div className="space-y-3">
        <p>
          Connecting your wallet is required for Premium features (Quick Copy, direct trade execution). Here's the step-by-step process:
        </p>

        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li><strong>Subscribe to Premium:</strong> Go to your profile and upgrade to Premium ($20/month)</li>
          <li><strong>Navigate to Profile:</strong> Click "Connect Wallet" to begin</li>
          <li><strong>Enter Your Polymarket Address:</strong> Visit Polymarket and copy your wallet address, then paste it into Polycopy</li>
          <li><strong>Import Private Key (Secure):</strong> Enter your Polymarket wallet's private key</li>
          <li><strong>Turnkey Encryption:</strong> Your private key is encrypted client-side in your browser using Turnkey's secure encryption</li>
          <li><strong>Secure Storage:</strong> The encrypted key is sent directly to Turnkey's infrastructure (not Polycopy's servers)</li>
          <li><strong>Verification:</strong> Confirm your wallet is connected - you're ready to use Quick Copy!</li>
        </ol>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
          <p className="font-semibold text-green-900 mb-2">Security Guarantee:</p>
          <ul className="list-disc list-inside space-y-1 text-sm text-green-900">
            <li><strong>Polycopy NEVER sees your unencrypted private key</strong></li>
            <li>Your key is encrypted in your browser before transmission</li>
            <li>Only Turnkey (enterprise wallet security provider) stores your encrypted key</li>
            <li>We only store your public wallet address in our database</li>
          </ul>
        </div>

        <p className="text-sm text-slate-600 mt-3">
          <strong>What is Turnkey?</strong> Turnkey is a professional Web3 infrastructure company specializing in secure wallet 
          management. They use bank-level encryption (TEE/HSM) and are trusted by thousands of applications. 
          Learn more at{' '}
          <a 
            href="https://www.turnkey.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[#FDB022] hover:text-[#E69E1A] underline"
          >
            turnkey.com
          </a>
        </p>
      </div>
    ),
  },
  {
    category: 'Wallet & Security',
    question: 'Does Polycopy have access to my private keys?',
    answer: (
      <div className="space-y-3">
        <p className="text-lg font-semibold text-green-700">
          No. Polycopy NEVER has access to your private keys.
        </p>

        <p>Here's exactly how we ensure your private key stays secure:</p>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3 mt-3">
          <div>
            <p className="font-semibold text-slate-900">1. Client-Side Encryption</p>
            <p className="text-sm text-slate-700">
              Your private key is encrypted directly in your browser using Turnkey's encryption library before it ever 
              leaves your device.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-900">2. Zero Access</p>
            <p className="text-sm text-slate-700">
              The encrypted bundle passes through our server only momentarily for routing to Turnkey - we cannot decrypt it 
              and never store it.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-900">3. Turnkey Secure Storage</p>
            <p className="text-sm text-slate-700">
              Your encrypted private key is stored exclusively on Turnkey's infrastructure using Hardware Security Modules (HSMs) 
              and Trusted Execution Environments (TEEs).
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-900">4. We Only Store Your Address</p>
            <p className="text-sm text-slate-700">
              Polycopy's database only contains your public wallet address (e.g., 0x1234...) and a reference to your Turnkey 
              wallet ID. Public addresses are already visible on the blockchain.
            </p>
          </div>
        </div>

        <p className="text-sm bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
          <strong>Analogy:</strong> It's like using Apple Pay - you enter your card once, Apple encrypts it securely, and you 
          can pay later without Apple seeing your actual card number. Same concept with Polycopy and Turnkey.
        </p>

        <p className="text-sm text-slate-600 mt-3">
          <strong>Additional Security:</strong> Even Turnkey uses zero-knowledge architecture, meaning they can sign transactions 
          on your behalf but cannot decrypt and view your private key either.
        </p>
      </div>
    ),
  },
  {
    category: 'Wallet & Security',
    question: 'What happens if Polycopy gets hacked?',
    answer: (
      <div className="space-y-3">
        <p className="font-semibold text-slate-900">
          Your private key and funds remain secure. Here's what would and wouldn't be at risk:
        </p>

        <div className="grid md:grid-cols-2 gap-4 mt-3">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="font-semibold text-red-900 mb-2">What Could Be Accessed:</p>
            <ul className="list-disc list-inside space-y-1 text-sm text-red-900">
              <li>Your email address</li>
              <li>Your public wallet address</li>
              <li>Your copied trades history</li>
              <li>Your subscription status</li>
              <li>Traders you follow</li>
            </ul>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="font-semibold text-green-900 mb-2">What CANNOT Be Accessed:</p>
            <ul className="list-disc list-inside space-y-1 text-sm text-green-900">
              <li><strong>Your private key</strong> (stored on Turnkey, not Polycopy)</li>
              <li><strong>Your funds</strong> (secured by Turnkey's infrastructure)</li>
              <li>Payment card details (stored by Stripe, not us)</li>
            </ul>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
          <p className="text-sm text-blue-900">
            <strong>Why?</strong> Your private key never touches our servers. It's encrypted in your browser and sent directly 
            to Turnkey's secure, SOC 2 Type II certified infrastructure. Even if our entire database was compromised, attackers 
            would find no private keys.
          </p>
        </div>

        <p className="text-sm text-slate-600 mt-3">
          <strong>Security Best Practice:</strong> Always use a unique, strong password for your Polycopy account and enable 
          two-factor authentication on your email.
        </p>
      </div>
    ),
  },
  {
    category: 'Wallet & Security',
    question: 'Can Polycopy steal my funds or make unauthorized trades?',
    answer: (
      <div className="space-y-3">
        <p className="text-lg font-semibold text-green-700">No.</p>
        
        <p>
          While we can execute trades on your behalf (that's the feature!), there are multiple safeguards preventing unauthorized activity:
        </p>

        <div className="space-y-3 mt-3">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="font-semibold text-slate-900 mb-1">1. Explicit Authorization Required</p>
            <p className="text-sm text-slate-700">
              Trades only execute when you explicitly click "Quick Copy" or enable auto-copy for specific traders. We don't have 
              blanket permission to trade whenever we want.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="font-semibold text-slate-900 mb-1">2. Blockchain Transparency</p>
            <p className="text-sm text-slate-700">
              Every trade is publicly visible on the Polygon blockchain. If we made unauthorized trades, they would be immediately 
              visible and traceable back to us.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="font-semibold text-slate-900 mb-1">3. Turnkey Monitoring</p>
            <p className="text-sm text-slate-700">
              Even we must request Turnkey to sign transactions. Turnkey monitors for suspicious activity and unusual patterns.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="font-semibold text-slate-900 mb-1">4. Instant Revocation</p>
            <p className="text-sm text-slate-700">
              You can disconnect your wallet anytime in your profile settings, immediately revoking our ability to execute trades.
            </p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
          <p className="text-sm text-amber-900">
            <strong>Our Business Model:</strong> We make money from $20/month subscriptions, not from your trades or funds. 
            Stealing from users would destroy our reputation and company instantly. We're building a long-term business based 
            on trust and transparency.
          </p>
        </div>
      </div>
    ),
  },
  {
    category: 'Wallet & Security',
    question: 'How do I disconnect my wallet from Polycopy?',
    answer: (
      <div className="space-y-3">
        <p>
          You can disconnect your wallet anytime from your profile page. Here's how:
        </p>

        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Go to your <Link href="/profile" className="text-[#FDB022] hover:text-[#E69E1A] underline">Profile page</Link></li>
          <li>Click the disconnect icon (X) next to your connected wallet address</li>
          <li>Confirm that you want to disconnect</li>
        </ol>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-900 mb-2">
            <strong>What happens when you disconnect:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 text-sm text-blue-900">
            <li>Your wallet address is removed from your Polycopy profile</li>
            <li>Your encrypted private key is permanently deleted from Turnkey's secure infrastructure</li>
            <li>You can no longer use Quick Copy or execute trades through Polycopy</li>
            <li>Your manual copy trade history remains intact</li>
            <li>You can reconnect the same or a different wallet anytime</li>
          </ul>
        </div>

        <p className="text-sm text-slate-600 mt-3">
          <strong>Note:</strong> If you cancel your Premium subscription, your wallet is automatically disconnected and your credentials are deleted from Turnkey.
        </p>
      </div>
    ),
  },

  // PREMIUM FEATURES
  {
    category: 'Premium Features',
    question: 'What\'s the difference between Polycopy\'s free and premium tiers?',
    answer: (
      <div className="space-y-3">
        <p>Polycopy offers two tiers to match your copy trading needs:</p>

        <div className="overflow-x-auto mt-4">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-4 py-3 text-left font-semibold">Feature</th>
                <th className="border border-slate-300 px-4 py-3 text-center font-semibold">Free</th>
                <th className="border border-slate-300 px-4 py-3 text-center font-semibold bg-amber-50">Premium ($20/mo)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 px-4 py-3">Discover & Browse Traders</td>
                <td className="border border-slate-300 px-4 py-3 text-center">✓</td>
                <td className="border border-slate-300 px-4 py-3 text-center bg-amber-50">✓</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-4 py-3">Follow Traders</td>
                <td className="border border-slate-300 px-4 py-3 text-center">✓</td>
                <td className="border border-slate-300 px-4 py-3 text-center bg-amber-50">✓</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-4 py-3">View Leaderboards</td>
                <td className="border border-slate-300 px-4 py-3 text-center">✓</td>
                <td className="border border-slate-300 px-4 py-3 text-center bg-amber-50">✓</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-4 py-3">Manual Copy (Trade on Polymarket)</td>
                <td className="border border-slate-300 px-4 py-3 text-center">✓</td>
                <td className="border border-slate-300 px-4 py-3 text-center bg-amber-50">✓</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-4 py-3">Track Manual Copies</td>
                <td className="border border-slate-300 px-4 py-3 text-center">✓</td>
                <td className="border border-slate-300 px-4 py-3 text-center bg-amber-50">✓</td>
              </tr>
              <tr className="bg-amber-50">
                <td className="border border-slate-300 px-4 py-3 font-semibold">Quick Copy (1-Click Trading)</td>
                <td className="border border-slate-300 px-4 py-3 text-center">✗</td>
                <td className="border border-slate-300 px-4 py-3 text-center font-semibold">✓</td>
              </tr>
              <tr className="bg-amber-50">
                <td className="border border-slate-300 px-4 py-3 font-semibold">Execute Trades Directly</td>
                <td className="border border-slate-300 px-4 py-3 text-center">✗</td>
                <td className="border border-slate-300 px-4 py-3 text-center font-semibold">✓</td>
              </tr>
              <tr className="bg-amber-50">
                <td className="border border-slate-300 px-4 py-3 font-semibold">Auto-Close Positions</td>
                <td className="border border-slate-300 px-4 py-3 text-center">✗</td>
                <td className="border border-slate-300 px-4 py-3 text-center font-semibold">✓</td>
              </tr>
              <tr className="bg-amber-50">
                <td className="border border-slate-300 px-4 py-3 font-semibold">Advanced Trade Controls</td>
                <td className="border border-slate-300 px-4 py-3 text-center">✗</td>
                <td className="border border-slate-300 px-4 py-3 text-center font-semibold">✓</td>
              </tr>
              <tr className="bg-amber-50">
                <td className="border border-slate-300 px-4 py-3">Custom Slippage</td>
                <td className="border border-slate-300 px-4 py-3 text-center">✗</td>
                <td className="border border-slate-300 px-4 py-3 text-center">✓</td>
              </tr>
              <tr className="bg-amber-50">
                <td className="border border-slate-300 px-4 py-3">Limit Orders</td>
                <td className="border border-slate-300 px-4 py-3 text-center">✗</td>
                <td className="border border-slate-300 px-4 py-3 text-center">Coming soon</td>
              </tr>
              <tr className="bg-amber-50">
                <td className="border border-slate-300 px-4 py-3">Fill or Kill (FoK)</td>
                <td className="border border-slate-300 px-4 py-3 text-center">✗</td>
                <td className="border border-slate-300 px-4 py-3 text-center">✓</td>
              </tr>
              <tr className="bg-amber-50">
                <td className="border border-slate-300 px-4 py-3 font-semibold">Portfolio Tracking</td>
                <td className="border border-slate-300 px-4 py-3 text-center">✗</td>
                <td className="border border-slate-300 px-4 py-3 text-center font-semibold">✓</td>
              </tr>
              <tr className="bg-amber-50">
                <td className="border border-slate-300 px-4 py-3 font-semibold">Early Access to Features</td>
                <td className="border border-slate-300 px-4 py-3 text-center">✗</td>
                <td className="border border-slate-300 px-4 py-3 text-center font-semibold">✓</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="font-semibold text-blue-900 mb-2">Which plan is right for you?</p>
          <p className="text-sm text-blue-900 mb-2">
            <strong>Choose Free if:</strong> You want to explore copy trading, manually execute trades on Polymarket, 
            and track your copies without connecting your wallet.
          </p>
          <p className="text-sm text-blue-900">
            <strong>Choose Premium if:</strong> You want the fastest, easiest copy trading experience with one-click execution, 
            auto-close features, and advanced trade controls.
          </p>
        </div>

        <p className="text-center mt-4">
          <Link 
            href="/profile" 
            className="inline-block px-6 py-3 bg-[#FDB022] hover:bg-[#E69E1A] text-black font-semibold rounded-lg transition-colors"
          >
            Upgrade to Premium - $20/month
          </Link>
        </p>
      </div>
    ),
  },
  {
    category: 'Premium Features',
    question: 'Can I execute Polymarket trades on Polycopy?',
    answer: (
      <div className="space-y-3">
        <p className="text-lg font-semibold">Yes - if you're a Premium subscriber!</p>

        <p>
          Premium users can execute Polymarket trades directly from Polycopy's interface without leaving the platform. 
          This includes both copy trades and independent trades you want to make yourself.
        </p>

        <div className="space-y-3 mt-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="font-semibold text-amber-900 mb-2">Why Trade Through Polycopy?</p>
            <ul className="list-disc list-inside space-y-1 text-sm text-amber-900">
              <li><strong>Speed:</strong> Execute copy trades in seconds without switching tabs</li>
              <li><strong>Pre-filled Parameters:</strong> Trade details auto-populate based on the trader you're copying</li>
              <li><strong>Advanced Controls:</strong> Custom slippage and Fill or Kill options (full limit order controls coming soon)</li>
              <li><strong>Auto-Close:</strong> Set positions to automatically close when copied traders exit</li>
              <li><strong>Portfolio Tracking:</strong> All trades automatically logged and tracked in your dashboard</li>
              <li><strong>Seamless Experience:</strong> Stay in one platform for discovery, analysis, and execution</li>
            </ul>
          </div>
        </div>

        <p className="text-sm text-slate-600 mt-3">
          <strong>Requirements:</strong> Premium subscription ($20/month) and connected Polymarket wallet via Turnkey secure infrastructure.
        </p>

        <p className="text-sm text-slate-600">
          <strong>Free users</strong> can still copy trades manually by clicking "Manual Copy" which opens Polymarket in a new tab.
        </p>
      </div>
    ),
  },

  // ACCOUNT & BILLING
  {
    category: 'Account & Billing',
    question: 'How much does Polycopy cost?',
    answer: (
      <div className="space-y-3">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="border-2 border-slate-300 rounded-lg p-6">
            <h4 className="text-2xl font-bold mb-2">Free</h4>
            <p className="text-3xl font-bold mb-4">$0<span className="text-base font-normal text-slate-600">/month</span></p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <span>Discover and browse traders</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <span>Follow unlimited traders</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <span>View leaderboards and stats</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <span>Manual copy tracking</span>
              </li>
            </ul>
          </div>

          <div className="border-2 border-[#FDB022] rounded-lg p-6 bg-gradient-to-br from-amber-50 to-white relative">
            <div className="absolute top-0 right-0 bg-[#FDB022] text-black text-xs font-bold px-3 py-1 rounded-bl-lg rounded-tr-lg">
              POPULAR
            </div>
            <h4 className="text-2xl font-bold mb-2">Premium</h4>
            <p className="text-3xl font-bold mb-4">$20<span className="text-base font-normal text-slate-600">/month</span></p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <span><strong>Quick Copy</strong> - 1-click trade execution</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <span><strong>Auto-Close</strong> positions</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <span><strong>Advanced controls</strong> (slippage, limits, FoK)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <span><strong>Portfolio tracking</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <span><strong>Early access</strong> to new features</span>
              </li>
            </ul>
            <Link 
              href="/profile" 
              className="block text-center mt-4 px-4 py-2 bg-[#FDB022] hover:bg-[#E69E1A] text-black font-semibold rounded-lg transition-colors"
            >
              Upgrade Now
            </Link>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-900">
            <strong>Simple Pricing:</strong> We charge a flat monthly fee - no per-trade fees, no profit sharing, no hidden costs. 
            You keep 100% of your trading profits.
          </p>
        </div>
      </div>
    ),
  },
  {
    category: 'Account & Billing',
    question: 'Can I cancel my subscription?',
    answer: (
      <div className="space-y-3">
        <p>
          <strong>Yes, anytime - with zero hassle.</strong>
        </p>

        <p className="font-semibold mt-4">How to cancel:</p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Go to your Profile page</li>
          <li>Click "Manage Subscription"</li>
          <li>Click "Cancel Subscription"</li>
          <li>Confirm cancellation</li>
        </ol>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-900 mb-2">
            <strong>What happens when you cancel:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 text-sm text-blue-900">
            <li>You keep Premium access until the end of your current billing period</li>
            <li>Your wallet and encrypted credentials are automatically disconnected and deleted from Turnkey</li>
            <li>Your access to Premium features will end at the beginning of your next billing cycle</li>
            <li>No cancellation fees or penalties</li>
            <li>You can re-subscribe anytime</li>
          </ul>
        </div>

        <p className="text-sm text-slate-600 mt-3">
          <strong>Need help?</strong> Contact support at{' '}
          <a href="mailto:support@polycopy.app" className="text-[#FDB022] hover:text-[#E69E1A] underline">
            support@polycopy.app
          </a>
        </p>
      </div>
    ),
  },
  {
    category: 'Account & Billing',
    question: 'How do I fund my Polymarket wallet?',
    answer: (
      <div className="space-y-3">
        <p>
          To trade on Polymarket (and use Polycopy's copy trading features), you need USDC in your Polymarket wallet. 
          Here's how to fund it:
        </p>
        <p className="text-sm">
          For Polymarket's own funding guide, see{' '}
          <a
            href="https://legacy-docs.polymarket.com/faq"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#FDB022] hover:text-[#E69E1A] underline"
          >
            the Polymarket FAQ
          </a>.
        </p>

        <div className="space-y-3 mt-4">
          <div>
            <p className="font-semibold">Option 1: Direct Deposit (Easiest)</p>
            <ol className="list-decimal list-inside space-y-2 ml-4 text-sm">
              <li>Go to <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer" className="text-[#FDB022] hover:text-[#E69E1A] underline">Polymarket.com</a></li>
              <li>Log into your Polymarket account</li>
              <li>Click "Deposit" in the top right</li>
              <li>Choose your funding method:
                <ul className="list-disc list-inside ml-6 mt-1 space-y-1">
                  <li><strong>Credit/Debit Card:</strong> Instant, small fees (~3-5%)</li>
                  <li><strong>Bank Transfer:</strong> Lower fees, takes 1-3 days</li>
                  <li><strong>Crypto Transfer:</strong> Send USDC from another wallet</li>
                </ul>
              </li>
              <li>Enter amount and confirm</li>
            </ol>
          </div>

          <div>
            <p className="font-semibold">Option 2: Crypto Transfer (For Crypto Users)</p>
            <ol className="list-decimal list-inside space-y-2 ml-4 text-sm">
              <li>Copy your Polymarket wallet address from Polymarket</li>
              <li>Send USDC on <strong>Polygon network</strong> to that address</li>
              <li>Wait for confirmation (usually 1-2 minutes)</li>
              <li>Your balance will update automatically</li>
            </ol>
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-2">
              <strong>⚠️ Important:</strong> Make sure to send USDC on the <strong>Polygon network</strong>, not Ethereum mainnet. 
              Sending on the wrong network may result in lost funds.
            </p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-900">
            <strong>No Gas Fees:</strong> Polymarket uses a "gasless" system, so you don't need MATIC tokens for gas fees. 
            You only need USDC to place bets!
          </p>
        </div>

        <p className="text-sm text-slate-600 mt-3">
          <strong>Minimum Deposit:</strong> Most funding methods have a $10-20 minimum. Check Polymarket's deposit page for current limits.
        </p>
      </div>
    ),
  },

  // TECHNICAL & GENERAL
  {
    category: 'Technical & General',
    question: 'What markets does Polycopy support?',
    answer: (
      <div className="space-y-3">
        <p>
          <strong>Polycopy supports all markets available on Polymarket.</strong>
        </p>

        <p>
          This includes prediction markets across multiple categories:
        </p>

        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Politics:</strong> Elections, approval ratings, policy outcomes, political events</li>
          <li><strong>Sports:</strong> Game outcomes, player performances, season results, championships</li>
          <li><strong>Crypto:</strong> Bitcoin/Ethereum prices, DeFi protocols, crypto regulations, token launches</li>
          <li><strong>Business:</strong> Stock prices, company earnings, IPOs, mergers & acquisitions</li>
          <li><strong>Entertainment:</strong> Award shows, box office results, streaming metrics</li>
          <li><strong>Science & Technology:</strong> AI developments, space missions, scientific breakthroughs</li>
          <li><strong>Current Events:</strong> News events, global incidents, trending topics</li>
        </ul>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-900 mb-2">
            <strong>How it works:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 text-sm text-blue-900">
            <li>When a trader you follow makes a bet on any Polymarket market, it will appear in your Polycopy feed</li>
            <li>You can copy trades from any market category</li>
            <li>Filter by category on the Discover page to find traders specializing in specific markets</li>
          </ul>
        </div>

        <p className="text-sm text-slate-600 mt-3">
          <strong>New Markets:</strong> As Polymarket adds new markets and categories, they automatically become available on Polycopy. 
          No action needed - you can copy trades from any new market instantly.
        </p>

        <p className="text-sm text-slate-600">
          <strong>Learn more about Polymarket markets:</strong>{' '}
          <a 
            href="https://polymarket.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[#FDB022] hover:text-[#E69E1A] underline"
          >
            Visit Polymarket
          </a>
        </p>
      </div>
    ),
  },
  {
    category: 'Technical & General',
    question: 'Do you have a mobile app?',
    answer: (
      <div className="space-y-3">
        <p>
          <strong>Not yet, but Polycopy works great on mobile browsers!</strong>
        </p>

        <p>
          Our web app is fully responsive and optimized for mobile devices. You can access all features on your phone or tablet:
        </p>

        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Browse and discover traders</li>
          <li>View your personalized feed</li>
          <li>Execute Quick Copy trades (premium)</li>
          <li>Manual copy trades</li>
          <li>Track your performance</li>
          <li>Manage your account and subscription</li>
        </ul>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-900 mb-2">
            <strong>Best Mobile Experience:</strong>
          </p>
          <ol className="list-decimal list-inside space-y-1 text-sm text-blue-900">
            <li>Open <a href="https://polycopy.app" className="underline">polycopy.app</a> in your mobile browser (Safari, Chrome, etc.)</li>
            <li>Tap the "Share" button (iOS) or menu (Android)</li>
            <li>Select "Add to Home Screen"</li>
            <li>Now Polycopy opens like a native app!</li>
          </ol>
        </div>

        <p className="text-sm text-slate-600 mt-3">
          <strong>Native apps coming soon!</strong> We're working on dedicated iOS and Android apps for an even better experience. 
          Premium subscribers will get early access when they launch.
        </p>
      </div>
    ),
  },
  {
    category: 'Technical & General',
    question: 'How does Polycopy make money?',
    answer: (
      <div className="space-y-3">
        <p>
          We believe in complete transparency about our business model. Here's exactly how Polycopy makes money:
        </p>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
          <p className="font-semibold text-green-900 mb-2">Premium Subscriptions - $20/month</p>
          <p className="text-sm text-green-900">
            Our only revenue source. We charge a flat monthly fee for premium features like Quick Copy, auto-close positions, 
            and advanced trade controls. That's it. Simple.
          </p>
        </div>

        <p className="font-semibold mt-4">What we DON'T charge:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>No per-trade fees</strong> - Trade as much as you want on Premium</li>
          <li><strong>No profit sharing</strong> - You keep 100% of your trading profits</li>
          <li><strong>No commission on wins</strong> - Your success doesn't cost you extra</li>
          <li><strong>No hidden fees</strong> - $20/month is all you pay</li>
          <li><strong>No affiliate kickbacks from traders</strong> - We don't get paid when you follow certain traders</li>
        </ul>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-900 mb-2">
            <strong>Why this matters:</strong>
          </p>
          <p className="text-sm text-blue-900">
            Our incentives align with yours. We succeed when you find value in the platform, not when you trade more or lose money. 
            We want you to become a successful copy trader, not a frequent trader paying us fees on every transaction.
          </p>
        </div>

        <p className="text-sm text-slate-600 mt-3">
          <strong>Other costs to consider:</strong> Polymarket itself may charge minimal fees on trades (typically ~2% on wins). 
          These go to Polymarket, not Polycopy. There are no gas fees since Polymarket uses a gasless trading system.
        </p>
      </div>
    ),
  },
];

const categories = Array.from(new Set(faqs.map(faq => faq.category)));

export default function FAQPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const filteredFaqs = faqs.filter(faq =>
    faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <Navigation />
      
      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Frequently Asked Questions
          </h1>
          <p className="text-lg text-slate-600 mb-8">
            Everything you need to know about Polycopy copy trading
          </p>

          {/* Search Box */}
          <div className="max-w-2xl mx-auto">
            <div className="relative">
              <input
                type="text"
                placeholder="Search FAQs... (e.g., 'wallet', 'premium', 'security')"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 pl-12 border-2 border-slate-300 rounded-lg focus:border-[#FDB022] focus:outline-none text-slate-900 placeholder-slate-400"
              />
              <svg
                className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            {searchQuery && (
              <p className="text-sm text-slate-600 mt-2">
                Found {filteredFaqs.length} result{filteredFaqs.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        {/* FAQ Sections */}
        <div className="space-y-12">
          {categories.map((category) => {
            const categoryFaqs = filteredFaqs.filter((faq) => faq.category === category);
            
            if (categoryFaqs.length === 0) return null;

            return (
              <section key={category} id={category.toLowerCase().replace(/\s+/g, '-')} className="scroll-mt-8">
                <h2 className="text-2xl font-bold text-slate-900 mb-6 pb-3 border-b-2 border-[#FDB022]">
                  {category}
                </h2>

                <div className="space-y-3">
                  {categoryFaqs.map((faq, index) => {
                    const globalIndex = faqs.indexOf(faq);
                    const isOpen = openIndex === globalIndex;

                    return (
                      <div
                        key={globalIndex}
                        className="bg-white rounded-lg border-2 border-slate-200 overflow-hidden hover:border-slate-300 transition-colors"
                      >
                        <button
                          onClick={() => toggleFaq(globalIndex)}
                          className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
                        >
                          <h3 className="text-lg font-semibold text-slate-900 flex-1">
                            {faq.question}
                          </h3>
                          <ChevronDown
                            className={`w-5 h-5 text-slate-600 flex-shrink-0 transition-transform duration-200 ${
                              isOpen ? 'transform rotate-180' : ''
                            }`}
                          />
                        </button>

                        <div
                          className={`overflow-hidden transition-all duration-300 ease-in-out ${
                            isOpen ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
                          }`}
                        >
                          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 text-slate-700 leading-relaxed">
                            {faq.answer}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {/* No Results */}
        {filteredFaqs.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-600 text-lg mb-4">No FAQs found matching "{searchQuery}"</p>
            <button
              onClick={() => setSearchQuery('')}
              className="text-[#FDB022] hover:text-[#E69E1A] font-medium underline"
            >
              Clear search
            </button>
          </div>
        )}

        {/* Footer CTA */}
        <div className="mt-16 bg-gradient-to-r from-[#FDB022] to-[#E69E1A] rounded-xl p-8 text-center">
          <h3 className="text-2xl font-bold text-black mb-4">
            Still have questions?
          </h3>
          <p className="text-black/80 mb-6">
            We're here to help! Reach out to our support team.
          </p>
          <div className="flex justify-center">
            <a
              href="https://twitter.com/polycopyapp"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-black text-white rounded-lg font-semibold hover:bg-slate-800 transition-colors"
            >
              DM us on X
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
