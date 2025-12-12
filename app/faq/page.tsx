'use client';

import Link from 'next/link';

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            Frequently Asked Questions
          </h1>
          <p className="text-lg text-slate-600">
            Everything you need to know about Polycopy and wallet security
          </p>
        </div>

        {/* FAQ Sections */}
        <div className="space-y-8">
          
          {/* Wallet Security Section */}
          <section id="wallet-security" className="scroll-mt-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6 pb-3 border-b-2 border-[#FDB022]">
              🔒 Wallet Security
            </h2>
            
            <div className="space-y-6">
              {/* Q1 */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-lg font-bold text-slate-900 mb-3">
                  Is my private key safe with Polycopy?
                </h3>
                <div className="text-slate-700 space-y-3">
                  <p>
                    <strong className="text-green-700">Yes, your private key is extremely safe.</strong> Here's exactly how we protect it:
                  </p>
                  
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
                    <p className="flex items-start gap-2">
                      <span className="text-green-600 font-bold">✓</span>
                      <span><strong>We Don't Store It:</strong> Your private key is NEVER saved in Polycopy's database. Ever.</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-green-600 font-bold">✓</span>
                      <span><strong>Privy Handles Encryption:</strong> Your key is encrypted by Privy using military-grade security (TEE/HSM).</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-green-600 font-bold">✓</span>
                      <span><strong>Temporary Transit Only:</strong> Your key passes through our server for ~100 milliseconds to reach Privy, then it's deleted.</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-green-600 font-bold">✓</span>
                      <span><strong>We Only Store Your Address:</strong> We save your public wallet address (0x1234...) which is public info anyway.</span>
                    </p>
                  </div>

                  <p className="text-sm italic text-slate-600 mt-4">
                    <strong>Think of it this way:</strong> It's like using Apple Pay - you enter your card info once, Apple encrypts it securely, and stores pay with it later without seeing the actual card number. Same concept here!
                  </p>
                </div>
              </div>

              {/* Q2 */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-lg font-bold text-slate-900 mb-3">
                  What is Privy and why do you use it?
                </h3>
                <div className="text-slate-700 space-y-3">
                  <p>
                    <strong>Privy</strong> is a professional Web3 infrastructure company that specializes in secure wallet management. They're trusted by thousands of apps to handle private keys safely.
                  </p>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="font-semibold mb-2">Why we use Privy instead of building our own:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li><strong>Security Experts:</strong> They focus 100% on wallet security (we focus on copy trading)</li>
                      <li><strong>SOC 2 Type II Certified:</strong> Independently audited for security compliance</li>
                      <li><strong>Bank-Level Encryption:</strong> Uses TEE (Trusted Execution Environment) and HSM hardware</li>
                      <li><strong>Zero-Knowledge Architecture:</strong> Even Privy can't see your unencrypted private key</li>
                      <li><strong>Insurance Coverage:</strong> Protected by professional liability insurance</li>
                    </ul>
                  </div>

                  <p className="text-sm">
                    Learn more at{' '}
                    <a 
                      href="https://www.privy.io/security" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-700"
                    >
                      Privy's Security Page
                    </a>
                  </p>
                </div>
              </div>

              {/* Q3 */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-lg font-bold text-slate-900 mb-3">
                  What happens if Polycopy gets hacked?
                </h3>
                <div className="text-slate-700 space-y-3">
                  <p>
                    <strong className="text-slate-900">Your private key remains safe.</strong> Here's why:
                  </p>
                  
                  <div className="space-y-2 text-sm">
                    <p>
                      <strong>What a hacker could access:</strong>
                    </p>
                    <ul className="list-disc list-inside space-y-1 ml-4 text-slate-600">
                      <li>Your email address</li>
                      <li>Your public wallet address (0x1234...)</li>
                      <li>Your copied trades history</li>
                      <li>Your subscription status</li>
                    </ul>

                    <p className="mt-3">
                      <strong>What a hacker CANNOT access:</strong>
                    </p>
                    <ul className="list-disc list-inside space-y-1 ml-4 text-slate-600">
                      <li><strong>Your private key</strong> (it's on Privy's servers, not ours)</li>
                      <li><strong>Your funds</strong> (they're in your Polymarket wallet, secured by Privy)</li>
                    </ul>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-3">
                    <p className="text-sm text-yellow-900">
                      <strong>💡 Security Best Practice:</strong> Even though we don't store your private key, always use a unique password for Polycopy that you don't use anywhere else!
                    </p>
                  </div>
                </div>
              </div>

              {/* Q4 */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-lg font-bold text-slate-900 mb-3">
                  Can Polycopy steal my funds or make unauthorized trades?
                </h3>
                <div className="text-slate-700 space-y-3">
                  <p>
                    <strong className="text-green-700">No.</strong> While we can execute trades on your behalf (that's the whole point!), there are safeguards:
                  </p>
                  
                  <div className="space-y-2 text-sm">
                    <ul className="list-disc list-inside space-y-2 ml-4">
                      <li>
                        <strong>Trades only execute when you follow a trader</strong> - we don't have permission to trade unless you explicitly enable copy trading for a specific trader
                      </li>
                      <li>
                        <strong>Blockchain transparency</strong> - every trade is publicly visible on Polygon. If we did something unauthorized, it would be immediately visible.
                      </li>
                      <li>
                        <strong>Privy's security</strong> - even we have to request Privy to sign transactions. Privy monitors for suspicious activity.
                      </li>
                      <li>
                        <strong>You can disconnect anytime</strong> - go to your profile and click "Disconnect Wallet" to revoke our access.
                      </li>
                    </ul>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mt-3">
                    <p className="text-sm text-slate-700">
                      <strong>Our reputation is everything.</strong> We're building a long-term business. Stealing from users would destroy our company instantly. It's literally not worth it, and we have zero incentive to do so.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Copy Trading Section */}
          <section id="copy-trading" className="scroll-mt-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6 pb-3 border-b-2 border-[#FDB022]">
              📊 Copy Trading
            </h2>
            
            <div className="space-y-6">
              {/* Q5 */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-lg font-bold text-slate-900 mb-3">
                  How does copy trading work?
                </h3>
                <div className="text-slate-700 space-y-3">
                  <p>
                    When you follow a trader, we automatically replicate their Polymarket trades in your wallet:
                  </p>
                  <ol className="list-decimal list-inside space-y-2 ml-4 text-sm">
                    <li><strong>Trader makes a bet</strong> - e.g., "Trump wins 2024" for $1000</li>
                    <li><strong>We detect it</strong> - our system monitors the blockchain</li>
                    <li><strong>We calculate proportions</strong> - scale it to your settings (e.g., 10% of your balance)</li>
                    <li><strong>We execute your copy</strong> - place the same bet in your wallet</li>
                    <li><strong>You earn/lose together</strong> - your results mirror the trader's performance</li>
                  </ol>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                    <p className="text-sm text-blue-900">
                      <strong>💡 Pro Tip:</strong> Start with small amounts to test how copy trading works before committing larger funds!
                    </p>
                  </div>
                </div>
              </div>

              {/* Q6 */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-lg font-bold text-slate-900 mb-3">
                  Can I unfollow a trader anytime?
                </h3>
                <div className="text-slate-700">
                  <p>
                    <strong>Yes!</strong> Go to the trader's profile and click "Unfollow". This stops all future copy trades immediately.
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Note: Unfollowing doesn't close your existing positions - you'll need to manually close those on Polymarket if desired.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Pricing Section */}
          <section id="pricing" className="scroll-mt-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6 pb-3 border-b-2 border-[#FDB022]">
              💰 Pricing & Subscription
            </h2>
            
            <div className="space-y-6">
              {/* Q7 */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-lg font-bold text-slate-900 mb-3">
                  How much does Polycopy cost?
                </h3>
                <div className="text-slate-700">
                  <p className="mb-2">
                    <strong>Free:</strong> Browse traders, view leaderboards
                  </p>
                  <p>
                    <strong>Premium ($29/month):</strong> Unlimited copy trading, priority support, advanced analytics
                  </p>
                  <p className="text-sm text-slate-600 mt-3">
                    We don't charge per trade or take a percentage of your profits - just a simple monthly fee!
                  </p>
                </div>
              </div>

              {/* Q8 */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-lg font-bold text-slate-900 mb-3">
                  Can I cancel my subscription?
                </h3>
                <div className="text-slate-700">
                  <p>
                    <strong>Yes, anytime.</strong> Go to your Profile → Manage Subscription. You'll keep premium access until the end of your billing period.
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    No hidden fees, no cancellation charges!
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Technical Section */}
          <section id="technical" className="scroll-mt-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6 pb-3 border-b-2 border-[#FDB022]">
              🔧 Technical Questions
            </h2>
            
            <div className="space-y-6">
              {/* Q9 */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-lg font-bold text-slate-900 mb-3">
                  Which blockchain does Polycopy use?
                </h3>
                <div className="text-slate-700">
                  <p>
                    Polycopy operates on <strong>Polygon (MATIC)</strong>, the same blockchain that Polymarket uses. All trades are executed on Polygon for fast, low-cost transactions.
                  </p>
                </div>
              </div>

              {/* Q10 */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-lg font-bold text-slate-900 mb-3">
                  Do I need MATIC or ETH for gas fees?
                </h3>
                <div className="text-slate-700">
                  <p>
                    <strong>No!</strong> Polymarket (and therefore Polycopy) uses a "relayer" system where gas fees are paid by Polymarket. You only need USDC in your wallet to place bets.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Footer CTA */}
        <div className="mt-12 bg-gradient-to-r from-[#FDB022] to-[#E69E1A] rounded-xl p-8 text-center">
          <h3 className="text-2xl font-bold text-black mb-4">
            Still have questions?
          </h3>
          <p className="text-black/80 mb-6">
            We're here to help! Reach out to our support team.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="mailto:support@polycopy.com"
              className="px-6 py-3 bg-black text-white rounded-lg font-semibold hover:bg-slate-800 transition-colors"
            >
              Email Support
            </a>
            <Link
              href="/profile"
              className="px-6 py-3 bg-white text-black rounded-lg font-semibold hover:bg-slate-100 transition-colors"
            >
              Go to Your Profile
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
