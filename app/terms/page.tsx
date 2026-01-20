import Link from 'next/link';
import { Navigation } from '@/components/polycopy/navigation';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation />
      
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Back to Home */}
        <Link 
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-[#FDB022] mb-8 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </Link>

        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 md:p-12 mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">Terms of Service</h1>
          <p className="text-sm text-slate-500">Last Updated: January 9, 2026</p>
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 md:p-12 prose prose-slate max-w-none">
          
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">1. Acceptance of Terms</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              By accessing or using Polycopy ("the Service"), you agree to be bound by these Terms of Service ("Terms"). 
              If you do not agree to these Terms, you may not access or use the Service. These Terms apply to all visitors, 
              users, and others who access or use the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">2. Description of Service</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              Polycopy is a copy trading platform for Polymarket prediction markets. The Service provides different 
              features depending on your subscription tier:
            </p>
            
            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">2.1 Free Tier</h3>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li>Discovery and tracking of top traders on Polymarket</li>
              <li>Ability to follow traders and view their trading activity</li>
              <li>Tools to manually mark trades as "copied" and track your own trading performance</li>
              <li>Analytics and leaderboards based on public blockchain data</li>
              <li>Email notifications for trading activity from followed traders</li>
            </ul>
            <p className="text-slate-700 leading-relaxed mb-4">
              Free tier users do not connect wallets or execute trades through Polycopy. All trading activity occurs 
              directly on Polymarket's platform.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">2.2 Premium Tier</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              Premium subscribers ($10/month) receive additional features including:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li><strong>Direct Trade Execution:</strong> Execute trades directly from the Polycopy interface without leaving the platform</li>
              <li><strong>Copy Trading Tools:</strong> One-click copy trading with pre-filled parameters and customizable slippage settings</li>
              <li><strong>Advanced Trade Controls:</strong> Limit orders, custom slippage, and position sizing tools</li>
              <li><strong>Portfolio Tracking:</strong> Monitor your copy trading performance with detailed analytics</li>
              <li><strong>Auto-Close Positions:</strong> Set trades to automatically close when copied traders exit positions</li>
              <li><strong>Early Access:</strong> Get new features before they're available to free users</li>
            </ul>
            <p className="text-slate-700 leading-relaxed mb-4">
              <strong>Important:</strong> To use premium features, you must connect your Polymarket wallet through our 
              secure third-party wallet management provider, Turnkey. When you connect your wallet, you authorize 
              Polycopy to execute trades on your behalf based on your instructions. You maintain full ownership of your 
              wallet and can disconnect it at any time. We never have access to your private keys.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">2.3 Future Features</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              We are continuously developing new features, including potential automated copy trading capabilities that 
              would automatically replicate trades from followed traders. Any such features will be clearly disclosed 
              and will require explicit user authorization before activation.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">3. Account Registration and Eligibility</h2>
            
            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">3.1 Account Creation</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              To use certain features of the Service, you must create an account by providing a valid email address. 
              We use passwordless "magic link" authentication, which sends a secure login link to your email each time 
              you sign in.
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              You are responsible for maintaining the confidentiality of your email account and for all activities 
              that occur under your Polycopy account. You agree to notify us immediately at support@polycopy.app of 
              any unauthorized use of your account.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">3.2 Age Requirement</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              You must be at least 18 years old to use the Service. By creating an account, you represent and warrant 
              that you are at least 18 years of age. We do not perform independent age verification, but we rely on 
              Polymarket's age verification for users who trade on their platform.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">3.3 Premium Subscription</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              Premium subscriptions are available for $10/month. Payment is processed through Stripe, our third-party 
              payment processor. By subscribing to premium, you authorize recurring monthly charges to your payment 
              method until you cancel. You may cancel your subscription at any time through your account settings.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">4. Wallet Connection and Trade Execution (Premium Users Only)</h2>
            
            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">4.1 Wallet Connection</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              Premium users may connect their Polymarket wallet to enable direct trade execution through Polycopy. 
              Wallet connection and private key management is handled by Turnkey, a third-party wallet infrastructure 
              provider. When you connect your wallet:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li>Your private key is encrypted client-side in your browser using Turnkey's secure encryption</li>
              <li>The encrypted key is stored exclusively on Turnkey's secure infrastructure</li>
              <li>Polycopy never has access to, receives, or stores your unencrypted private key</li>
              <li>We store only your public wallet address for trade execution purposes</li>
            </ul>
            <p className="text-slate-700 leading-relaxed mb-4">
              By connecting your wallet, you acknowledge that you understand these security measures and authorize 
              Turnkey to manage your private key for trade signing. For more information about Turnkey's security 
              practices, visit{' '}
              <a href="https://www.turnkey.com" target="_blank" rel="noopener noreferrer" className="text-[#FDB022] hover:text-[#E69E1A] font-medium">
                turnkey.com
              </a>
              .
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">4.2 Trade Execution Authorization</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              When you execute a trade through Polycopy's interface, you are authorizing us to submit that specific 
              trade to Polymarket on your behalf using your connected wallet. Each trade execution requires your 
              explicit action (clicking "Execute Trade" or similar button).
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              <strong>You acknowledge and agree that:</strong>
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li>Once a trade is submitted, it cannot be reversed or cancelled</li>
              <li>You are responsible for reviewing all trade parameters (amount, price, slippage) before execution</li>
              <li>Trades are subject to market conditions and may execute at different prices than displayed</li>
              <li>You authorize Polycopy to interact with Polymarket's smart contracts using your wallet</li>
              <li>You maintain full ownership and control of your wallet and funds at all times</li>
            </ul>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">4.3 Disconnecting Your Wallet</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              You may disconnect your wallet at any time through your profile settings. Disconnecting your wallet will:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li>Remove your wallet address from our database</li>
              <li>Revoke Polycopy's ability to execute trades on your behalf</li>
              <li>Not affect your existing Polymarket positions or wallet holdings</li>
            </ul>
            <p className="text-slate-700 leading-relaxed mb-4">
              Your encrypted private key will remain in Turnkey's infrastructure according to their data retention 
              policies. Contact Turnkey directly for information about deleting your private key from their systems.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">4.4 Wallet Security</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              You are solely responsible for the security of your wallet and any funds it contains. We strongly 
              recommend:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li>Using a secure, unique password for your email account</li>
              <li>Enabling two-factor authentication on your email</li>
              <li>Never sharing your private key or recovery phrase with anyone</li>
              <li>Regularly monitoring your wallet activity on Polymarket</li>
              <li>Only funding your connected wallet with amounts you can afford to lose</li>
            </ul>
          </section>

          <section className="mb-8 bg-amber-50 border-2 border-amber-200 rounded-xl p-6">
            <h2 className="text-2xl font-bold text-amber-900 mb-4">⚠️ 5. Copy Trading Disclaimer and Risk Warnings</h2>
            <div className="space-y-4 text-amber-900">
              <p className="font-semibold text-lg">
                IMPORTANT: Please read this section carefully before using Polycopy.
              </p>

              <div>
                <p className="font-semibold mb-2">Copying trades does not guarantee similar results.</p>
                <p className="leading-relaxed">
                  The traders featured on Polycopy have achieved their results under specific market conditions, with 
                  specific timing, and with their own risk management strategies. Timing differences, slippage, 
                  position sizing, and market volatility mean your results will differ—potentially significantly.
                </p>
              </div>

              <div>
                <p className="font-semibold mb-2">Past performance is not indicative of future results.</p>
                <p className="leading-relaxed">
                  Historical trading performance displayed on Polycopy is no guarantee of future performance. Market 
                  conditions change, and traders' strategies may not continue to be successful. A trader's winning 
                  streak can end at any time.
                </p>
              </div>

              <div>
                <p className="font-semibold mb-2">You are solely responsible for all trading decisions and losses.</p>
                <p className="leading-relaxed">
                  Polycopy is a tool that displays publicly available blockchain data and facilitates trade execution. 
                  We do not provide trading recommendations, financial advice, or investment guidance. Every trading 
                  decision you make—whether executing a trade manually or copying another trader—is entirely your 
                  own responsibility. You bear 100% of the risk of any losses incurred.
                </p>
              </div>

              <div>
                <p className="font-semibold mb-2">We do not manage your funds or guarantee trade execution.</p>
                <p className="leading-relaxed">
                  While premium users can execute trades through our interface, we do not hold custody of your funds. 
                  Your funds remain in your Polymarket wallet at all times. Trade execution depends on market 
                  liquidity, Polymarket's platform availability, blockchain network conditions, and other factors 
                  outside our control. Trades may fail, execute at different prices, or experience delays.
                </p>
              </div>

              <div>
                <p className="font-semibold mb-2">Trading involves substantial risk of loss.</p>
                <p className="leading-relaxed">
                  Prediction market trading carries significant financial risk. You can lose some or all of your 
                  invested capital. Only trade with funds you can afford to lose completely. Consider your financial 
                  situation, risk tolerance, investment objectives, and experience level before engaging in any 
                  trading activity.
                </p>
              </div>

              <div>
                <p className="font-semibold mb-2">No endorsement of traders or markets.</p>
                <p className="leading-relaxed">
                  The inclusion of any trader on our leaderboard or platform does not constitute an endorsement, 
                  recommendation, or guarantee of their future performance. Similarly, the display of any market 
                  does not constitute a recommendation to trade in that market.
                </p>
              </div>

              <div>
                <p className="font-semibold mb-2">Technical risks and system failures.</p>
                <p className="leading-relaxed">
                  Our Service depends on third-party infrastructure including Turnkey (wallet management), Polymarket 
                  (trading platform), Polygon blockchain, and internet connectivity. Any of these systems may 
                  experience outages, failures, or security breaches that could prevent trade execution, cause losses, 
                  or result in other adverse outcomes. We are not liable for any losses resulting from such technical 
                  issues.
                </p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">6. Acceptable Use Policy</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              You agree to use the Service only for lawful purposes and in accordance with these Terms. You agree not to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li>Use the Service in any way that violates any applicable local, state, national, or international law or regulation</li>
              <li>Use automated systems, bots, or scripts to access, scrape, or extract data from the Service without written permission</li>
              <li>Attempt to gain unauthorized access to the Service, other user accounts, or connected systems</li>
              <li>Interfere with or disrupt the Service or servers or networks connected to the Service</li>
              <li>Impersonate any person or entity or misrepresent your affiliation with any person or entity</li>
              <li>Use the Service to transmit spam, chain letters, or other unsolicited communications</li>
              <li>Attempt to reverse engineer, decompile, or discover the source code of the Service</li>
              <li>Share your account credentials with others or allow others to access your account</li>
              <li>Use the Service for any illegal activity, including money laundering, fraud, or market manipulation</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">7. Data and Analytics</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              The data and analytics displayed on Polycopy are derived from public blockchain data, Polymarket's 
              public APIs, and user-generated information. While we strive for accuracy, we make no guarantees or 
              warranties regarding the accuracy, completeness, timeliness, or reliability of any data displayed on 
              the Service.
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              Trading statistics, ROI calculations, performance metrics, and trader rankings are calculated based on 
              publicly available data and may not reflect the complete trading activity or actual results of any 
              trader. Data may be delayed, incomplete, contain errors, or become outdated. You should independently 
              verify any information before making trading decisions.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">8. No Financial Advice</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              The information provided through the Service is for informational and educational purposes only and 
              does not constitute financial, investment, trading, legal, tax, or other professional advice. You 
              should not rely on the information on Polycopy as a substitute for professional advice from a licensed 
              financial advisor, accountant, or attorney.
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              Polycopy does not recommend or endorse any particular trader, trading strategy, prediction market, or 
              investment decision. The inclusion of any trader on our platform does not constitute an endorsement or 
              recommendation. We are not registered as an investment advisor, broker-dealer, or financial institution.
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              You should conduct your own research and consult with qualified professionals before making any 
              financial decisions.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">9. Third-Party Services and Links</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              The Service integrates with and links to third-party websites and services, including but not limited to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li><strong>Polymarket:</strong> The prediction market trading platform where trades are executed</li>
              <li><strong>Turnkey:</strong> Wallet infrastructure and private key management provider (premium users)</li>
              <li><strong>Stripe:</strong> Payment processing for premium subscriptions</li>
              <li><strong>Supabase:</strong> Database and authentication infrastructure</li>
              <li><strong>Vercel:</strong> Hosting infrastructure</li>
            </ul>
            <p className="text-slate-700 leading-relaxed mb-4">
              We have no control over, and assume no responsibility for, the content, privacy policies, terms of 
              service, or practices of any third-party websites or services. You acknowledge and agree that Polycopy 
              shall not be responsible or liable, directly or indirectly, for any damage or loss caused or alleged to 
              be caused by or in connection with use of or reliance on any third-party services.
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              You are subject to the terms and conditions of each third-party service you use in connection with 
              Polycopy. We encourage you to review their terms and privacy policies.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">10. Intellectual Property</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              The Service and its original content, features, functionality, design, logos, and branding are owned by 
              Polycopy and are protected by international copyright, trademark, patent, trade secret, and other 
              intellectual property laws.
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              You may not copy, modify, distribute, sell, lease, reverse engineer, or create derivative works of any 
              part of our Service without our prior written permission. You are granted a limited, non-exclusive, 
              non-transferable license to access and use the Service for your personal, non-commercial use in 
              accordance with these Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">11. Subscription Terms and Billing</h2>
            
            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">11.1 Premium Subscription</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              Premium subscriptions are billed monthly at $10/month. By subscribing, you authorize us to charge your 
              payment method on a recurring monthly basis until you cancel your subscription.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">11.2 Cancellation</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              You may cancel your premium subscription at any time through your account settings or the Stripe 
              customer portal. Cancellation will take effect at the end of your current billing period. You will 
              retain premium access until the end of the paid period. No refunds are provided for partial months.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">11.3 Price Changes</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              We reserve the right to change our subscription pricing at any time. We will provide you with reasonable 
              advance notice of any price changes. If you do not agree to the new pricing, you may cancel your 
              subscription before the price change takes effect.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">11.4 Payment Processing</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              All payments are processed by Stripe. We do not store your payment card information. Failed payments 
              may result in suspension or termination of your premium subscription.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">12. Disclaimer of Warranties</h2>
            <p className="text-slate-700 leading-relaxed mb-4 uppercase">
              THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER 
              EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A 
              PARTICULAR PURPOSE, TITLE, OR NON-INFRINGEMENT.
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              Polycopy does not warrant that:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li>The Service will be uninterrupted, timely, secure, or error-free</li>
              <li>The results obtained from use of the Service will be accurate or reliable</li>
              <li>Any errors in the Service will be corrected</li>
              <li>The Service will meet your requirements or expectations</li>
              <li>Trade execution will be successful or occur at desired prices</li>
              <li>Third-party services (Polymarket, Turnkey, etc.) will be available or function properly</li>
            </ul>
            <p className="text-slate-700 leading-relaxed mb-4">
              You acknowledge that your use of the Service is at your sole risk and that you assume full responsibility 
              for all risks associated with your use of the Service and any trading activity.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">13. Limitation of Liability</h2>
            <p className="text-slate-700 leading-relaxed mb-4 uppercase">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL POLYCOPY, ITS DIRECTORS, OFFICERS, 
              EMPLOYEES, PARTNERS, AGENTS, SUPPLIERS, AFFILIATES, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, 
              SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING WITHOUT LIMITATION, LOSS OF PROFITS, 
              DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li>Your access to, use of, or inability to access or use the Service</li>
              <li>Any conduct or content of any third party on or through the Service</li>
              <li>Any content obtained from the Service</li>
              <li>Unauthorized access, use, or alteration of your transmissions or content</li>
              <li>Trading losses or other financial losses incurred based on information from the Service</li>
              <li>Failed trade executions, delayed executions, or executions at unfavorable prices</li>
              <li>Wallet security breaches, loss of private keys, or unauthorized wallet access</li>
              <li>Failures, errors, or downtime of third-party services (Polymarket, Turnkey, Stripe, etc.)</li>
              <li>Blockchain network congestion, high gas fees, or failed transactions</li>
              <li>Inaccurate data, calculations, or performance metrics displayed on the Service</li>
            </ul>
            <p className="text-slate-700 leading-relaxed mb-4 uppercase">
              IN NO EVENT SHALL POLYCOPY'S TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATED TO THE 
              SERVICE EXCEED THE AMOUNT YOU PAID TO POLYCOPY IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR ONE 
              HUNDRED DOLLARS ($100), WHICHEVER IS GREATER.
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              Some jurisdictions do not allow the exclusion or limitation of certain warranties or liabilities, so 
              some of the above limitations may not apply to you.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">14. Indemnification</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              You agree to defend, indemnify, and hold harmless Polycopy and its officers, directors, employees, 
              contractors, agents, licensors, and suppliers from and against any claims, liabilities, damages, 
              judgments, awards, losses, costs, expenses, or fees (including reasonable attorneys' fees) arising out 
              of or relating to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li>Your violation of these Terms</li>
              <li>Your use or misuse of the Service</li>
              <li>Your trading activity and any resulting losses</li>
              <li>Your violation of any rights of another party</li>
              <li>Your violation of any applicable laws or regulations</li>
              <li>Any content you submit through the Service</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">15. Changes to Terms</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              We reserve the right to modify or replace these Terms at any time at our sole discretion. If we make 
              material changes, we will notify you by email and/or by posting a notice on the Service at least 30 
              days prior to the effective date of the changes.
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              Your continued use of the Service after the effective date of any changes constitutes your acceptance 
              of the new Terms. If you do not agree to the new Terms, you must stop using the Service and may cancel 
              your premium subscription if applicable.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">16. Termination</h2>
            
            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">16.1 Termination by You</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              You may terminate your account at any time by contacting us at support@polycopy.app. If you have a 
              premium subscription, you should cancel it through your account settings before terminating your account.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">16.2 Termination by Us</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              We may terminate or suspend your account and access to the Service immediately, without prior notice or 
              liability, for any reason, including if you breach these Terms. Reasons for termination may include:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li>Violation of these Terms or our Acceptable Use Policy</li>
              <li>Fraudulent or illegal activity</li>
              <li>Failure to pay subscription fees</li>
              <li>Extended periods of inactivity</li>
              <li>At our sole discretion for any or no reason</li>
            </ul>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">16.3 Effect of Termination</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              Upon termination, your right to use the Service will immediately cease. We will delete your email 
              address and account data from our systems. However:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li>Your wallet and any connected funds remain under your control</li>
              <li>Your encrypted private key may remain in Turnkey's systems per their policies</li>
              <li>We may retain anonymized usage data for analytics purposes</li>
              <li>Provisions of these Terms that by their nature should survive (liability limitations, dispute resolution, etc.) will survive termination</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">17. Governing Law and Dispute Resolution</h2>
            
            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">17.1 Governing Law</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, 
              United States, without regard to its conflict of law provisions.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">17.2 Dispute Resolution</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              Any disputes arising from these Terms or your use of the Service shall be resolved through binding 
              arbitration in accordance with the rules of the American Arbitration Association, except that either 
              party may seek injunctive or other equitable relief in a court of competent jurisdiction.
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              You agree to waive any right to a jury trial or to participate in a class action against Polycopy.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">17.3 Jurisdiction</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              For any disputes not subject to arbitration, you agree to submit to the personal and exclusive 
              jurisdiction of the state and federal courts located in Delaware.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">18. Miscellaneous</h2>
            
            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">18.1 Entire Agreement</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              These Terms constitute the entire agreement between you and Polycopy regarding the Service and supersede 
              all prior agreements and understandings.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">18.2 Severability</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              If any provision of these Terms is found to be unenforceable or invalid, that provision will be limited 
              or eliminated to the minimum extent necessary, and the remaining provisions will remain in full force 
              and effect.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">18.3 Waiver</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              No waiver of any term of these Terms shall be deemed a further or continuing waiver of such term or 
              any other term.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">18.4 Assignment</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              You may not assign or transfer these Terms or your rights hereunder without our prior written consent. 
              We may assign these Terms without restriction.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">18.5 Force Majeure</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              We shall not be liable for any failure or delay in performance due to circumstances beyond our reasonable 
              control, including but not limited to acts of God, war, terrorism, riots, embargoes, acts of civil or 
              military authorities, fire, floods, accidents, network infrastructure failures, strikes, or shortages of 
              transportation, facilities, fuel, energy, labor, or materials.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">19. Contact Information</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              If you have any questions about these Terms, please contact us at:{' '}
              <a href="mailto:support@polycopy.app" className="text-[#FDB022] hover:text-[#E69E1A] font-medium">
                support@polycopy.app
              </a>
            </p>
          </section>

          <div className="mt-12 pt-8 border-t border-slate-200">
            <p className="text-sm text-slate-500 text-center">
              By using Polycopy, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
