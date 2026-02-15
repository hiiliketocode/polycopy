import Link from 'next/link';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-poly-cream">
      {/* Hero */}
      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center md:py-20">
          <p className="mb-3 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-yellow">LEGAL_DEPT</p>
          <h1 className="mb-4 font-sans text-4xl font-black uppercase tracking-tight text-poly-black md:text-5xl">Terms of Service</h1>
          <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Last Updated: January 9, 2026</p>
        </div>
      </section>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-4 py-16">
        <div className="border border-border bg-card p-8 md:p-12">
          
          <section className="mb-12 border-b border-border pb-12">
            <h2 className="mb-4 font-sans text-xl font-bold uppercase tracking-wide text-poly-black">1. Acceptance of Terms</h2>
            <p className="font-body text-sm leading-relaxed text-muted-foreground">
              By accessing or using Polycopy (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;). 
              If you do not agree to these Terms, you may not access or use the Service. These Terms apply to all visitors, 
              users, and others who access or use the Service.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="mb-4 font-sans text-xl font-bold uppercase tracking-wide text-poly-black">2. Description of Service</h2>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              Polycopy is a copy trading platform for Polymarket prediction markets. The Service provides different 
              features depending on your subscription tier:
            </p>
            
            <h3 className="mb-3 mt-6 font-sans text-base font-bold uppercase tracking-wide text-poly-black">2.1 Free Tier</h3>
            <ul className="mb-4 list-disc space-y-2 pl-6 font-body text-sm leading-relaxed text-muted-foreground">
              <li>Discovery and tracking of top traders on Polymarket</li>
              <li>Ability to follow traders and view their trading activity</li>
              <li>Tools to manually mark trades as &ldquo;copied&rdquo; and track your own trading performance</li>
              <li>Analytics and leaderboards based on public blockchain data</li>
              <li>Email notifications for trading activity from followed traders</li>
            </ul>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              Free tier users do not connect wallets or execute trades through Polycopy. All trading activity occurs 
              directly on Polymarket&apos;s platform.
            </p>

            <h3 className="mb-3 mt-6 font-sans text-base font-bold uppercase tracking-wide text-poly-black">2.2 Premium Tier</h3>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              Premium subscribers ($10/month) receive additional features including:
            </p>
            <ul className="mb-4 list-disc space-y-2 pl-6 font-body text-sm leading-relaxed text-muted-foreground">
              <li><strong className="text-poly-black">Direct Trade Execution:</strong> Execute trades directly from the Polycopy interface without leaving the platform</li>
              <li><strong className="text-poly-black">Copy Trading Tools:</strong> One-click copy trading with pre-filled parameters and customizable slippage settings</li>
              <li><strong className="text-poly-black">Advanced Trade Controls:</strong> Limit orders, custom slippage, and position sizing tools</li>
              <li><strong className="text-poly-black">Portfolio Tracking:</strong> Monitor your copy trading performance with detailed analytics</li>
              <li><strong className="text-poly-black">Auto-Close Positions:</strong> Set trades to automatically close when copied traders exit positions</li>
              <li><strong className="text-poly-black">Early Access:</strong> Get new features before they&apos;re available to free users</li>
            </ul>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              <strong className="text-poly-black">Important:</strong> To use premium features, you must connect your Polymarket wallet through our 
              secure third-party wallet management provider, Turnkey. When you connect your wallet, you authorize 
              Polycopy to execute trades on your behalf based on your instructions. You maintain full ownership of your 
              wallet and can disconnect it at any time. We never have access to your private keys.
            </p>

            <h3 className="mb-3 mt-6 font-sans text-base font-bold uppercase tracking-wide text-poly-black">2.3 Future Features</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground">
              We are continuously developing new features, including potential automated copy trading capabilities that 
              would automatically replicate trades from followed traders. Any such features will be clearly disclosed 
              and will require explicit user authorization before activation.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="mb-4 font-sans text-xl font-bold uppercase tracking-wide text-poly-black">3. Account Registration and Eligibility</h2>
            
            <h3 className="mb-3 mt-6 font-sans text-base font-bold uppercase tracking-wide text-poly-black">3.1 Account Creation</h3>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              To use certain features of the Service, you must create an account by providing a valid email address. 
              We use passwordless &ldquo;magic link&rdquo; authentication, which sends a secure login link to your email each time 
              you sign in.
            </p>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              You are responsible for maintaining the confidentiality of your email account and for all activities 
              that occur under your Polycopy account. You agree to notify us immediately at support@polycopy.app of 
              any unauthorized use of your account.
            </p>

            <h3 className="mb-3 mt-6 font-sans text-base font-bold uppercase tracking-wide text-poly-black">3.2 Age Requirement</h3>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              You must be at least 18 years old to use the Service. By creating an account, you represent and warrant 
              that you are at least 18 years of age.
            </p>

            <h3 className="mb-3 mt-6 font-sans text-base font-bold uppercase tracking-wide text-poly-black">3.3 Premium Subscription</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground">
              Premium subscriptions are available for $10/month. Payment is processed through Stripe. By subscribing to premium, you authorize recurring monthly charges to your payment 
              method until you cancel. You may cancel your subscription at any time through your account settings.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="mb-4 font-sans text-xl font-bold uppercase tracking-wide text-poly-black">4. Wallet Connection and Trade Execution (Premium Users Only)</h2>
            
            <h3 className="mb-3 mt-6 font-sans text-base font-bold uppercase tracking-wide text-poly-black">4.1 Wallet Connection</h3>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              Premium users may connect their Polymarket wallet to enable direct trade execution through Polycopy. 
              Wallet connection and private key management is handled by Turnkey, a third-party wallet infrastructure 
              provider. When you connect your wallet:
            </p>
            <ul className="mb-4 list-disc space-y-2 pl-6 font-body text-sm leading-relaxed text-muted-foreground">
              <li>Your private key is encrypted client-side in your browser using Turnkey&apos;s secure encryption</li>
              <li>The encrypted key is stored exclusively on Turnkey&apos;s secure infrastructure</li>
              <li>Polycopy never has access to, receives, or stores your unencrypted private key</li>
              <li>We store only your public wallet address for trade execution purposes</li>
            </ul>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              By connecting your wallet, you acknowledge that you understand these security measures and authorize 
              Turnkey to manage your private key for trade signing. For more information about Turnkey&apos;s security 
              practices, visit{' '}
              <a href="https://www.turnkey.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-poly-yellow transition-colors hover:text-poly-black">
                turnkey.com
              </a>.
            </p>

            <h3 className="mb-3 mt-6 font-sans text-base font-bold uppercase tracking-wide text-poly-black">4.2 Trade Execution Authorization</h3>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              When you execute a trade through Polycopy&apos;s interface, you are authorizing us to submit that specific 
              trade to Polymarket on your behalf using your connected wallet. Each trade execution requires your 
              explicit action.
            </p>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              <strong className="text-poly-black">You acknowledge and agree that:</strong>
            </p>
            <ul className="mb-4 list-disc space-y-2 pl-6 font-body text-sm leading-relaxed text-muted-foreground">
              <li>Once a trade is submitted, it cannot be reversed or cancelled</li>
              <li>You are responsible for reviewing all trade parameters before execution</li>
              <li>Trades are subject to market conditions and may execute at different prices than displayed</li>
              <li>You authorize Polycopy to interact with Polymarket&apos;s smart contracts using your wallet</li>
              <li>You maintain full ownership and control of your wallet and funds at all times</li>
            </ul>

            <h3 className="mb-3 mt-6 font-sans text-base font-bold uppercase tracking-wide text-poly-black">4.3 Disconnecting Your Wallet</h3>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              You may disconnect your wallet at any time through your profile settings. Disconnecting your wallet will:
            </p>
            <ul className="mb-4 list-disc space-y-2 pl-6 font-body text-sm leading-relaxed text-muted-foreground">
              <li>Remove your wallet address from our database</li>
              <li>Revoke Polycopy&apos;s ability to execute trades on your behalf</li>
              <li>Not affect your existing Polymarket positions or wallet holdings</li>
            </ul>

            <h3 className="mb-3 mt-6 font-sans text-base font-bold uppercase tracking-wide text-poly-black">4.4 Wallet Security</h3>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              You are solely responsible for the security of your wallet and any funds it contains. We strongly recommend:
            </p>
            <ul className="list-disc space-y-2 pl-6 font-body text-sm leading-relaxed text-muted-foreground">
              <li>Using a secure, unique password for your email account</li>
              <li>Enabling two-factor authentication on your email</li>
              <li>Never sharing your private key or recovery phrase with anyone</li>
              <li>Regularly monitoring your wallet activity on Polymarket</li>
              <li>Only funding your connected wallet with amounts you can afford to lose</li>
            </ul>
          </section>

          <section className="mb-12 border border-poly-yellow bg-poly-yellow/5 p-6">
            <h2 className="mb-4 font-sans text-xl font-bold uppercase tracking-wide text-poly-black">5. Copy Trading Disclaimer and Risk Warnings</h2>
            <p className="mb-4 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">
              IMPORTANT: Please read this section carefully before using Polycopy.
            </p>
            <div className="space-y-4">
              <div>
                <p className="mb-2 font-sans text-sm font-bold text-poly-black">Copying trades does not guarantee similar results.</p>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  The traders featured on Polycopy have achieved their results under specific market conditions. Timing differences, slippage, 
                  position sizing, and market volatility mean your results will differ&mdash;potentially significantly.
                </p>
              </div>
              <div>
                <p className="mb-2 font-sans text-sm font-bold text-poly-black">Past performance is not indicative of future results.</p>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Historical trading performance displayed on Polycopy is no guarantee of future performance. Market 
                  conditions change, and traders&apos; strategies may not continue to be successful.
                </p>
              </div>
              <div>
                <p className="mb-2 font-sans text-sm font-bold text-poly-black">You are solely responsible for all trading decisions and losses.</p>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Polycopy is a tool that displays publicly available blockchain data and facilitates trade execution. 
                  We do not provide trading recommendations, financial advice, or investment guidance. Every trading 
                  decision you make is entirely your own responsibility. You bear 100% of the risk of any losses incurred.
                </p>
              </div>
              <div>
                <p className="mb-2 font-sans text-sm font-bold text-poly-black">We do not manage your funds or guarantee trade execution.</p>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Your funds remain in your Polymarket wallet at all times. Trade execution depends on market 
                  liquidity, Polymarket&apos;s platform availability, blockchain network conditions, and other factors 
                  outside our control.
                </p>
              </div>
              <div>
                <p className="mb-2 font-sans text-sm font-bold text-poly-black">Trading involves substantial risk of loss.</p>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Prediction market trading carries significant financial risk. You can lose some or all of your 
                  invested capital. Only trade with funds you can afford to lose completely.
                </p>
              </div>
              <div>
                <p className="mb-2 font-sans text-sm font-bold text-poly-black">No endorsement of traders or markets.</p>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  The inclusion of any trader on our leaderboard or platform does not constitute an endorsement, 
                  recommendation, or guarantee of their future performance.
                </p>
              </div>
              <div>
                <p className="mb-2 font-sans text-sm font-bold text-poly-black">Technical risks and system failures.</p>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Our Service depends on third-party infrastructure including Turnkey, Polymarket, Polygon blockchain, and internet connectivity. Any of these systems may 
                  experience outages, failures, or security breaches. We are not liable for any losses resulting from such technical issues.
                </p>
              </div>
            </div>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="mb-4 font-sans text-xl font-bold uppercase tracking-wide text-poly-black">6. Acceptable Use Policy</h2>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              You agree to use the Service only for lawful purposes. You agree not to:
            </p>
            <ul className="list-disc space-y-2 pl-6 font-body text-sm leading-relaxed text-muted-foreground">
              <li>Use the Service in any way that violates applicable law</li>
              <li>Use automated systems, bots, or scripts to access or scrape data without written permission</li>
              <li>Attempt to gain unauthorized access to the Service or other accounts</li>
              <li>Interfere with or disrupt the Service</li>
              <li>Impersonate any person or entity</li>
              <li>Use the Service to transmit spam or unsolicited communications</li>
              <li>Attempt to reverse engineer the Service</li>
              <li>Share your account credentials with others</li>
              <li>Use the Service for any illegal activity</li>
            </ul>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="mb-4 font-sans text-xl font-bold uppercase tracking-wide text-poly-black">7. Data and Analytics</h2>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              The data and analytics displayed on Polycopy are derived from public blockchain data, Polymarket&apos;s 
              public APIs, and user-generated information. While we strive for accuracy, we make no guarantees regarding the accuracy, completeness, timeliness, or reliability of any data displayed.
            </p>
            <p className="font-body text-sm leading-relaxed text-muted-foreground">
              Trading statistics, ROI calculations, performance metrics, and trader rankings are calculated based on 
              publicly available data and may not reflect complete trading activity. Data may be delayed, incomplete, or contain errors. You should independently verify any information before making trading decisions.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="mb-4 font-sans text-xl font-bold uppercase tracking-wide text-poly-black">8. No Financial Advice</h2>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              The information provided through the Service is for informational and educational purposes only and 
              does not constitute financial, investment, trading, legal, tax, or other professional advice.
            </p>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              Polycopy does not recommend or endorse any particular trader, trading strategy, prediction market, or 
              investment decision. We are not registered as an investment advisor, broker-dealer, or financial institution.
            </p>
            <p className="font-body text-sm leading-relaxed text-muted-foreground">
              You should conduct your own research and consult with qualified professionals before making any financial decisions.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="mb-4 font-sans text-xl font-bold uppercase tracking-wide text-poly-black">9. Third-Party Services and Links</h2>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              The Service integrates with third-party services including:
            </p>
            <ul className="mb-4 list-disc space-y-2 pl-6 font-body text-sm leading-relaxed text-muted-foreground">
              <li><strong className="text-poly-black">Polymarket:</strong> The prediction market trading platform</li>
              <li><strong className="text-poly-black">Turnkey:</strong> Wallet infrastructure and private key management (premium users)</li>
              <li><strong className="text-poly-black">Stripe:</strong> Payment processing for premium subscriptions</li>
              <li><strong className="text-poly-black">Supabase:</strong> Database and authentication infrastructure</li>
              <li><strong className="text-poly-black">Vercel:</strong> Hosting infrastructure</li>
            </ul>
            <p className="font-body text-sm leading-relaxed text-muted-foreground">
              We have no control over, and assume no responsibility for, the content, privacy policies, or practices of any third-party services. You are subject to their terms and conditions.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="mb-4 font-sans text-xl font-bold uppercase tracking-wide text-poly-black">10. Intellectual Property</h2>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              The Service and its original content, features, functionality, design, logos, and branding are owned by 
              Polycopy and protected by international copyright, trademark, and other intellectual property laws.
            </p>
            <p className="font-body text-sm leading-relaxed text-muted-foreground">
              You are granted a limited, non-exclusive, non-transferable license to access and use the Service for your personal, non-commercial use in accordance with these Terms.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="mb-4 font-sans text-xl font-bold uppercase tracking-wide text-poly-black">11. Subscription Terms and Billing</h2>
            
            <h3 className="mb-3 mt-6 font-sans text-base font-bold uppercase tracking-wide text-poly-black">11.1 Premium Subscription</h3>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              Premium subscriptions are billed monthly at $10/month. By subscribing, you authorize recurring monthly charges until you cancel.
            </p>

            <h3 className="mb-3 mt-6 font-sans text-base font-bold uppercase tracking-wide text-poly-black">11.2 Cancellation</h3>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              You may cancel at any time through your account settings. Cancellation takes effect at the end of your current billing period. No refunds for partial months.
            </p>

            <h3 className="mb-3 mt-6 font-sans text-base font-bold uppercase tracking-wide text-poly-black">11.3 Price Changes</h3>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              We reserve the right to change pricing at any time with reasonable advance notice.
            </p>

            <h3 className="mb-3 mt-6 font-sans text-base font-bold uppercase tracking-wide text-poly-black">11.4 Payment Processing</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground">
              All payments are processed by Stripe. We do not store your payment card information.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="mb-4 font-sans text-xl font-bold uppercase tracking-wide text-poly-black">12. Disclaimer of Warranties</h2>
            <p className="mb-4 font-sans text-xs font-bold uppercase tracking-wider text-poly-black">
              THE SERVICE IS PROVIDED ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; BASIS WITHOUT WARRANTIES OF ANY KIND.
            </p>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">Polycopy does not warrant that:</p>
            <ul className="mb-4 list-disc space-y-2 pl-6 font-body text-sm leading-relaxed text-muted-foreground">
              <li>The Service will be uninterrupted, timely, secure, or error-free</li>
              <li>Results obtained will be accurate or reliable</li>
              <li>Any errors will be corrected</li>
              <li>Trade execution will be successful or at desired prices</li>
              <li>Third-party services will be available or function properly</li>
            </ul>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="mb-4 font-sans text-xl font-bold uppercase tracking-wide text-poly-black">13. Limitation of Liability</h2>
            <p className="mb-4 font-sans text-xs font-bold uppercase tracking-wider text-poly-black">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, POLYCOPY SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, 
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.
            </p>
            <ul className="mb-4 list-disc space-y-2 pl-6 font-body text-sm leading-relaxed text-muted-foreground">
              <li>Your access to or inability to access the Service</li>
              <li>Any conduct or content of third parties</li>
              <li>Trading losses or financial losses based on Service information</li>
              <li>Failed or delayed trade executions</li>
              <li>Wallet security breaches or unauthorized access</li>
              <li>Third-party service failures</li>
              <li>Inaccurate data or metrics</li>
            </ul>
            <p className="font-sans text-xs font-bold uppercase tracking-wider text-poly-black">
              TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT PAID IN THE PRECEDING 12 MONTHS, OR $100, WHICHEVER IS GREATER.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="mb-4 font-sans text-xl font-bold uppercase tracking-wide text-poly-black">14. Indemnification</h2>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              You agree to defend, indemnify, and hold harmless Polycopy from claims arising out of:
            </p>
            <ul className="list-disc space-y-2 pl-6 font-body text-sm leading-relaxed text-muted-foreground">
              <li>Your violation of these Terms</li>
              <li>Your use or misuse of the Service</li>
              <li>Your trading activity and any resulting losses</li>
              <li>Your violation of any rights of another party</li>
              <li>Your violation of any applicable laws</li>
            </ul>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="mb-4 font-sans text-xl font-bold uppercase tracking-wide text-poly-black">15. Changes to Terms</h2>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              We reserve the right to modify these Terms at any time. Material changes will be communicated with at least 30 
              days prior notice. Continued use constitutes acceptance of new Terms.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="mb-4 font-sans text-xl font-bold uppercase tracking-wide text-poly-black">16. Termination</h2>
            
            <h3 className="mb-3 mt-6 font-sans text-base font-bold uppercase tracking-wide text-poly-black">16.1 Termination by You</h3>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              You may terminate your account at any time by contacting support@polycopy.app.
            </p>

            <h3 className="mb-3 mt-6 font-sans text-base font-bold uppercase tracking-wide text-poly-black">16.2 Termination by Us</h3>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              We may terminate or suspend your account immediately, without prior notice, for violation of these Terms, fraudulent activity, failure to pay, or at our sole discretion.
            </p>

            <h3 className="mb-3 mt-6 font-sans text-base font-bold uppercase tracking-wide text-poly-black">16.3 Effect of Termination</h3>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              Upon termination, your right to use the Service ceases. Your wallet and funds remain under your control. We may retain anonymized data for analytics.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="mb-4 font-sans text-xl font-bold uppercase tracking-wide text-poly-black">17. Governing Law and Dispute Resolution</h2>
            
            <h3 className="mb-3 mt-6 font-sans text-base font-bold uppercase tracking-wide text-poly-black">17.1 Governing Law</h3>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              These Terms shall be governed by the laws of the State of Delaware, United States.
            </p>

            <h3 className="mb-3 mt-6 font-sans text-base font-bold uppercase tracking-wide text-poly-black">17.2 Dispute Resolution</h3>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              Disputes shall be resolved through binding arbitration per the rules of the American Arbitration Association. You waive any right to a jury trial or class action.
            </p>

            <h3 className="mb-3 mt-6 font-sans text-base font-bold uppercase tracking-wide text-poly-black">17.3 Jurisdiction</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground">
              For disputes not subject to arbitration, you submit to the jurisdiction of the courts of Delaware.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="mb-4 font-sans text-xl font-bold uppercase tracking-wide text-poly-black">18. Miscellaneous</h2>
            <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
              These Terms constitute the entire agreement between you and Polycopy. If any provision is found unenforceable, the remaining provisions remain in effect. No waiver of any term shall be a continuing waiver. You may not assign these Terms without consent. We shall not be liable for circumstances beyond our reasonable control.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 font-sans text-xl font-bold uppercase tracking-wide text-poly-black">19. Contact Information</h2>
            <p className="font-body text-sm leading-relaxed text-muted-foreground">
              Questions about these Terms? Contact us at:{' '}
              <a href="mailto:support@polycopy.app" className="font-semibold text-poly-yellow transition-colors hover:text-poly-black">
                support@polycopy.app
              </a>
            </p>
          </section>

          <div className="mt-12 border-t border-border pt-8">
            <p className="text-center font-body text-xs text-muted-foreground">
              By using Polycopy, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
