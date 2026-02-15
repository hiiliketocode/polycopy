import Link from 'next/link';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-poly-cream">
      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Back to Home */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-poly-yellow mb-8 transition-colors font-semibold"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </Link>

        {/* Hero */}
        <div className="bg-poly-paper border-b border-border py-12 mb-12 text-center">
          <h1 className="font-sans font-black uppercase tracking-tight text-poly-black text-4xl mb-4">Privacy Policy</h1>
          <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Last Updated: January 9, 2026</p>
        </div>

        {/* Content */}
        <div className="bg-poly-cream">
          <section className="mb-12">
            <h2 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mb-4">1. Introduction</h2>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              Welcome to Polycopy. We respect your privacy and are committed to protecting your personal data. This
              Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our
              Service. Please read this Privacy Policy carefully.
            </p>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              By using Polycopy, you agree to the collection and use of information in accordance with this Privacy Policy.
              If you do not agree with our policies and practices, please do not use the Service.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mb-4">2. Information We Collect</h2>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">2.1 Account Data</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              When you create an account on Polycopy, we collect your <strong>email address</strong> for authentication
              and communication purposes. We use passwordless "magic link" authentication through Supabase, which means
              you log in via a secure link sent to your email rather than a traditional password.
            </p>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">2.2 Wallet Information (Premium Users Only)</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              If you subscribe to Polycopy Premium and connect your Polymarket wallet, we collect:
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground space-y-2 font-body text-sm leading-relaxed">
              <li><strong>Public wallet address:</strong> Your Ethereum/Polygon wallet address associated with your Polymarket account</li>
              <li><strong>Turnkey wallet identifiers:</strong> References to your wallet stored in Turnkey's infrastructure (organization ID, user ID, wallet ID)</li>
            </ul>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              <strong>IMPORTANT:</strong> We never collect, receive, access, or store your private keys or recovery
              phrases. Wallet connection and private key management are handled entirely by Turnkey, a third-party
              wallet infrastructure provider. Your private key is encrypted in your browser and sent directly to
              Turnkey's secure servers. Polycopy has zero access to your unencrypted private key at any time.
            </p>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">2.3 Blockchain and Trading Data</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We collect and display public blockchain data and trading activity from Polymarket, including:
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground space-y-2 font-body text-sm leading-relaxed">
              <li>Public wallet addresses of traders you choose to follow</li>
              <li>Trading activity, positions, and performance metrics available through Polymarket's public APIs and the Polygon blockchain</li>
              <li>Market data, prices, and outcomes from prediction markets</li>
              <li>Transaction history, trade timestamps, and trade amounts</li>
            </ul>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              This data is publicly available on the blockchain and through Polymarket's platform. We aggregate and
              display this information to provide our Service.
            </p>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">2.4 Usage Data</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We automatically collect certain information when you visit and use the Service, including:
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground space-y-2 font-body text-sm leading-relaxed">
              <li>Browser type and version</li>
              <li>Device type and operating system</li>
              <li>IP address (which may be anonymized)</li>
              <li>Pages visited and features used</li>
              <li>Time and date of visits</li>
              <li>Time spent on pages</li>
              <li>Referring website addresses</li>
              <li>Click patterns and navigation paths</li>
            </ul>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">2.5 User-Generated Data</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We store information about your use of the Service, including:
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground space-y-2 font-body text-sm leading-relaxed">
              <li>Traders you follow</li>
              <li>Trades you mark as "copied" (for tracking purposes)</li>
              <li>Your performance tracking data (entry prices, amounts invested, exit prices)</li>
              <li>Your preferences and settings</li>
              <li>Notification preferences</li>
              <li>Onboarding completion status</li>
            </ul>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">2.6 Payment Information</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              If you subscribe to Polycopy Premium, payment processing is handled by Stripe. We collect:
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground space-y-2 font-body text-sm leading-relaxed">
              <li><strong>Stripe customer ID:</strong> A reference linking your Polycopy account to your Stripe customer profile</li>
              <li><strong>Subscription status:</strong> Whether you have an active premium subscription</li>
              <li><strong>Subscription dates:</strong> When you subscribed and when your subscription renews</li>
            </ul>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We do NOT collect or store your credit card numbers, CVV codes, or other payment card details. All
              payment information is processed and stored securely by Stripe.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mb-4">3. How We Use Your Information</h2>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We use the information we collect for the following purposes:
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground space-y-2 font-body text-sm leading-relaxed">
              <li><strong>Provide the Service:</strong> To create and manage your account, display trading data, enable you to follow traders, track performance, and execute trades (premium users)</li>
              <li><strong>Authentication:</strong> To send magic link authentication emails when you log in and verify your identity</li>
              <li><strong>Trade Execution (Premium):</strong> To submit trades to Polymarket on your behalf using your connected wallet when you explicitly authorize a trade</li>
              <li><strong>Payment Processing:</strong> To process premium subscriptions, manage billing, and handle cancellations through Stripe</li>
              <li><strong>Notifications:</strong> To send you email notifications about trading activity from traders you follow (if you enable this feature)</li>
              <li><strong>Analytics:</strong> To understand how users interact with our Service, identify popular features, and improve functionality</li>
              <li><strong>Display Leaderboards:</strong> To aggregate and display trader performance metrics and rankings based on public blockchain data</li>
              <li><strong>Service Improvements:</strong> To diagnose technical issues, improve our algorithms, develop new features, and enhance user experience</li>
              <li><strong>Communication:</strong> To respond to your inquiries, provide customer support, and send important service announcements</li>
              <li><strong>Security:</strong> To detect and prevent fraud, abuse, security incidents, and other harmful activity</li>
              <li><strong>Legal Compliance:</strong> To comply with applicable laws, regulations, legal processes, or governmental requests</li>
            </ul>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mb-4">4. Third-Party Services</h2>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We use the following third-party services to operate Polycopy. Each service has its own privacy policy
              that governs how they handle your data:
            </p>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">4.1 Supabase (Authentication & Database)</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We use Supabase for authentication and database services. Your email address, account data, and user
              preferences are stored on Supabase's secure infrastructure. Supabase's privacy policy can be found at{' '}
              <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-poly-yellow hover:text-poly-black transition-colors font-semibold">
                supabase.com/privacy
              </a>
              .
            </p>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">4.2 Turnkey (Wallet Infrastructure - Premium Only)</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              Premium users who connect their wallets use Turnkey for secure private key management. Turnkey encrypts
              and stores your private key using enterprise-grade security. Polycopy never has access to your
              unencrypted private key. Turnkey's privacy policy can be found at{' '}
              <a href="https://www.turnkey.com/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-poly-yellow hover:text-poly-black transition-colors font-semibold">
                turnkey.com/privacy-policy
              </a>
              .
            </p>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">4.3 Stripe (Payment Processing)</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We use Stripe to process premium subscription payments. Your payment card information is transmitted
              directly to Stripe and is never stored on our servers. We only receive a Stripe customer ID and
              subscription status from Stripe. Stripe's privacy policy can be found at{' '}
              <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-poly-yellow hover:text-poly-black transition-colors font-semibold">
                stripe.com/privacy
              </a>
              .
            </p>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">4.4 Vercel (Hosting)</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              Our Service is hosted on Vercel's infrastructure. Vercel may collect anonymized usage data as part of
              their hosting services, such as request logs and performance metrics. Vercel's privacy policy can be
              found at{' '}
              <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-poly-yellow hover:text-poly-black transition-colors font-semibold">
                vercel.com/legal/privacy-policy
              </a>
              .
            </p>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">4.5 Resend (Email Delivery)</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We use Resend to deliver transactional emails, including magic link authentication emails and trade
              notifications. Your email address is shared with Resend for delivery purposes. Resend's privacy policy
              can be found at{' '}
              <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-poly-yellow hover:text-poly-black transition-colors font-semibold">
                resend.com/legal/privacy-policy
              </a>
              .
            </p>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">4.6 Polymarket APIs & Polygon Blockchain</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We fetch public blockchain and trading data from Polymarket's APIs and the Polygon blockchain to display
              trader information and market data. This data is publicly available and does not require sharing your
              personal information with Polymarket through our Service. When premium users execute trades, those
              transactions are submitted directly to Polymarket and recorded on the Polygon blockchain.
            </p>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">4.7 Google Analytics</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We use Google Analytics to analyze usage patterns and improve our Service. Google Analytics collects
              information about your visit, including pages viewed, time spent, interactions, and anonymized demographic
              information. You can opt out of Google Analytics by installing the{' '}
              <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer" className="text-poly-yellow hover:text-poly-black transition-colors font-semibold">
                Google Analytics Opt-out Browser Add-on
              </a>
              .
            </p>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">4.8 Mixpanel & Marketing Pixels (Planned)</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We plan to integrate Mixpanel for advanced product analytics and may add marketing pixels from Google,
              Meta (Facebook), X (Twitter), and other platforms for advertising and conversion tracking. We will update
              this privacy policy before implementing these services.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mb-4">5. Data Sharing and Disclosure</h2>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We do not sell, trade, or rent your personal information to third parties. We may share your information
              in the following circumstances:
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground space-y-2 font-body text-sm leading-relaxed">
              <li><strong>Service Providers:</strong> We share data with third-party service providers (listed above) who help us operate the Service</li>
              <li><strong>Legal Requirements:</strong> We may disclose your information if required to do so by law or in response to valid requests by public authorities</li>
              <li><strong>Business Transfers:</strong> If Polycopy is involved in a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction</li>
              <li><strong>With Your Consent:</strong> We may share your information with third parties when you give us explicit consent to do so</li>
            </ul>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mb-4">6. Data Retention</h2>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We retain your personal information for as long as necessary to provide the Service and fulfill the
              purposes outlined in this Privacy Policy:
            </p>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">6.1 Account Data</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              When you delete your account, we will delete your email address and personal account data from our
              systems within 30 days. However:
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground space-y-2 font-body text-sm leading-relaxed">
              <li>We may retain anonymized usage data and aggregated statistics for analytics purposes</li>
              <li>Publicly available blockchain data will remain accessible on the blockchain</li>
              <li>Backup copies may exist for a limited time in our disaster recovery systems</li>
            </ul>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">6.2 Wallet Data (Premium Users)</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              When you disconnect your wallet or delete your account, we will delete your wallet address from our
              database. Your encrypted private key stored in Turnkey's infrastructure is subject to Turnkey's data
              retention policies. Contact Turnkey directly at{' '}
              <a href="mailto:support@turnkey.com" className="text-poly-yellow hover:text-poly-black transition-colors font-semibold">
                support@turnkey.com
              </a>
              {' '}to request deletion of your private key from their systems.
            </p>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">6.3 Payment Data</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              Payment data is retained by Stripe according to their data retention policies and legal requirements.
              We retain your Stripe customer ID for as long as you have an account with us or as required by law for
              tax and accounting purposes.
            </p>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">6.4 Legal Retention</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We may retain certain information for longer periods if required by law, to comply with legal obligations,
              resolve disputes, enforce our agreements, or prevent fraud and abuse.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mb-4">7. Data Security</h2>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We implement appropriate technical and organizational security measures to protect your personal information
              against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over
              the internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
            </p>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              Our security measures include:
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground space-y-2 font-body text-sm leading-relaxed">
              <li><strong>Encryption in transit:</strong> All data transmitted between your browser and our servers is encrypted using HTTPS/TLS</li>
              <li><strong>Encryption at rest:</strong> Sensitive data stored in our database is encrypted</li>
              <li><strong>Secure authentication:</strong> Passwordless magic link authentication through Supabase reduces credential theft risk</li>
              <li><strong>Private key security:</strong> Your private keys are never stored on our servers and are managed exclusively by Turnkey using hardware security modules (HSMs)</li>
              <li><strong>Access controls:</strong> Strict access controls and authentication requirements for our systems and databases</li>
              <li><strong>Regular security updates:</strong> Continuous monitoring and updates to address security vulnerabilities</li>
              <li><strong>Secure payment processing:</strong> PCI-DSS compliant payment processing through Stripe</li>
              <li><strong>Security audits:</strong> Regular security reviews and testing of our infrastructure</li>
            </ul>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              <strong>Your Responsibilities:</strong> You are responsible for maintaining the security of your email
              account (used for authentication) and any devices you use to access Polycopy. We recommend enabling
              two-factor authentication on your email and using a strong, unique password.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mb-4">8. Your Privacy Rights</h2>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              Depending on your location, you may have certain rights regarding your personal information:
            </p>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">8.1 General Rights</h3>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground space-y-2 font-body text-sm leading-relaxed">
              <li><strong>Access:</strong> You can request a copy of the personal information we hold about you</li>
              <li><strong>Correction:</strong> You can update your account information through your profile settings</li>
              <li><strong>Deletion:</strong> You can request deletion of your account and personal information by contacting support@polycopy.app</li>
              <li><strong>Data Portability:</strong> You can request a copy of your data in a machine-readable format (JSON/CSV)</li>
              <li><strong>Opt-Out:</strong> You can opt out of email notifications through your account settings</li>
              <li><strong>Object to Processing:</strong> You can object to certain types of data processing</li>
              <li><strong>Withdraw Consent:</strong> Where processing is based on consent, you can withdraw it at any time</li>
            </ul>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">8.2 California Privacy Rights (CCPA)</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA):
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground space-y-2 font-body text-sm leading-relaxed">
              <li>Right to know what personal information we collect, use, disclose, and sell</li>
              <li>Right to request deletion of your personal information</li>
              <li>Right to opt-out of the sale of personal information (note: we do not sell personal information)</li>
              <li>Right to non-discrimination for exercising your privacy rights</li>
            </ul>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">8.3 European Privacy Rights (GDPR)</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              If you are in the European Economic Area (EEA), United Kingdom, or Switzerland, you have rights under
              the General Data Protection Regulation (GDPR):
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground space-y-2 font-body text-sm leading-relaxed">
              <li>Right to access your personal data</li>
              <li>Right to rectification of inaccurate data</li>
              <li>Right to erasure ("right to be forgotten")</li>
              <li>Right to restrict processing</li>
              <li>Right to data portability</li>
              <li>Right to object to processing</li>
              <li>Right to withdraw consent at any time</li>
              <li>Right to lodge a complaint with your local data protection authority</li>
            </ul>

            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mt-6 mb-3">8.4 Exercising Your Rights</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              To exercise any of these rights, please contact us at{' '}
              <a href="mailto:support@polycopy.app" className="text-poly-yellow hover:text-poly-black transition-colors font-semibold">
                support@polycopy.app
              </a>
              . We will respond to your request within 30 days. We may need to verify your identity before processing
              your request.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mb-4">9. Cookies and Tracking Technologies</h2>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We use cookies and similar tracking technologies to enhance your experience on our Service. Cookies are
              small data files stored on your device that help us remember your preferences and improve functionality.
            </p>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We use the following types of cookies:
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground space-y-2 font-body text-sm leading-relaxed">
              <li><strong>Essential Cookies:</strong> Required for authentication and basic functionality</li>
              <li><strong>Analytics Cookies:</strong> Help us understand how users interact with the Service</li>
              <li><strong>Preference Cookies:</strong> Remember your settings and preferences</li>
            </ul>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              You can control cookies through your browser settings. Note that disabling cookies may limit your ability
              to use certain features of the Service.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mb-4">10. Children's Privacy</h2>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              Our Service is not intended for individuals under the age of 18. We do not knowingly collect personal
              information from children under 18. If you are a parent or guardian and believe your child has provided
              us with personal information, please contact us, and we will delete such information.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mb-4">11. International Data Transfers</h2>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              Polycopy operates globally, and your information may be transferred to, stored, and processed in the
              United States and other countries where our service providers operate. These countries may have data
              protection laws that differ from the laws of your jurisdiction.
            </p>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              When we transfer personal data from the EEA, UK, or Switzerland to other countries, we implement
              appropriate safeguards such as:
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground space-y-2 font-body text-sm leading-relaxed">
              <li>Standard Contractual Clauses approved by the European Commission</li>
              <li>Ensuring our service providers participate in recognized privacy frameworks</li>
              <li>Other legally approved transfer mechanisms</li>
            </ul>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              By using the Service, you acknowledge and consent to the transfer of your information to the United
              States and other countries where our service providers operate, including:
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground space-y-2 font-body text-sm leading-relaxed">
              <li><strong>Supabase:</strong> United States</li>
              <li><strong>Stripe:</strong> United States (with regional data centers)</li>
              <li><strong>Turnkey:</strong> United States</li>
              <li><strong>Vercel:</strong> United States (with global edge network)</li>
              <li><strong>Google Analytics:</strong> United States</li>
            </ul>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mb-4">12. Changes to This Privacy Policy</h2>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We may update this Privacy Policy from time to time to reflect changes in our practices, technology,
              legal requirements, or other factors. When we make material changes, we will notify you by:
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground space-y-2 font-body text-sm leading-relaxed">
              <li>Sending an email to the address associated with your account</li>
              <li>Posting a prominent notice on the Service</li>
              <li>Updating the "Last Updated" date at the top of this policy</li>
            </ul>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We will provide notice at least 30 days before material changes take effect. Your continued use of the
              Service after the effective date of any changes indicates your acceptance of the updated Privacy Policy.
              If you do not agree to the changes, you should stop using the Service and may delete your account.
            </p>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We encourage you to review this Privacy Policy periodically to stay informed about how we protect your
              information.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mb-4">13. Do Not Track Signals</h2>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              Some browsers include a "Do Not Track" (DNT) feature that signals websites you visit that you do not
              want to have your online activity tracked. Because there is not yet a common understanding of how to
              interpret DNT signals, we do not currently respond to DNT signals. We will continue to monitor
              developments around DNT technology and may implement such support in the future.
            </p>
          </section>

          <section className="mb-12 border-b border-border pb-12">
            <h2 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mb-4">14. Data Breach Notification</h2>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              In the event of a data breach that affects your personal information, we will notify you and relevant
              regulatory authorities as required by applicable law. Notification will be provided without undue delay
              and, where feasible, within 72 hours of becoming aware of the breach.
            </p>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              We will provide information about the breach, including:
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground space-y-2 font-body text-sm leading-relaxed">
              <li>The nature of the breach and categories of data affected</li>
              <li>The likely consequences of the breach</li>
              <li>Measures we have taken or propose to take to address the breach</li>
              <li>Contact information for questions or concerns</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black mb-4">15. Contact Information</h2>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices,
              please contact us at:
            </p>
            <div className="bg-poly-paper border border-border p-4 mb-4">
              <p className="font-body text-sm leading-relaxed text-muted-foreground mb-2">
                <strong>Email:</strong>{' '}
                <a href="mailto:support@polycopy.app" className="text-poly-yellow hover:text-poly-black transition-colors font-semibold">
                  support@polycopy.app
                </a>
              </p>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                <strong>Response Time:</strong> We aim to respond to all privacy inquiries within 30 days.
              </p>
            </div>
            <p className="font-body text-sm leading-relaxed text-muted-foreground mb-4">
              For data protection inquiries from EEA, UK, or Swiss residents, you may also contact your local data
              protection authority.
            </p>
          </section>

          <div className="mt-12 pt-8 border-t border-border">
            <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center">
              By using Polycopy, you acknowledge that you have read and understood this Privacy Policy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
