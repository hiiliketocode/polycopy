import Link from 'next/link';
import Header from '@/app/components/Header';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      
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
          <p className="text-sm text-slate-500">Last Updated: December 9, 2024</p>
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
              Polycopy is a copy trading discovery platform for Polymarket prediction markets. The Service provides:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li>Discovery and tracking of top traders on Polymarket</li>
              <li>Ability to follow traders and view their trading activity</li>
              <li>Tools to mark trades as "copied" and track your own trading performance</li>
              <li>Analytics and leaderboards based on public blockchain data</li>
              <li>Email notifications for trading activity</li>
            </ul>
            <p className="text-slate-700 leading-relaxed mb-4">
              Polycopy is an informational tool only. We do not execute trades on your behalf, hold custody of funds, 
              or provide trading services. All trading activity occurs directly on Polymarket.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">3. Account Registration</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              To use certain features of the Service, you must create an account by providing a valid email address. 
              You are responsible for maintaining the confidentiality of your account credentials and for all activities 
              that occur under your account. You agree to notify us immediately of any unauthorized use of your account.
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              You must be at least 18 years old to use the Service. By creating an account, you represent and warrant 
              that you are at least 18 years of age.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">4. Use of Service</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              You agree to use the Service only for lawful purposes and in accordance with these Terms. You agree not to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li>Use the Service in any way that violates any applicable law or regulation</li>
              <li>Use automated systems, bots, or scripts to access or scrape the Service</li>
              <li>Attempt to gain unauthorized access to the Service or its related systems</li>
              <li>Interfere with or disrupt the Service or servers or networks connected to the Service</li>
              <li>Impersonate any person or entity or misrepresent your affiliation with any person or entity</li>
              <li>Use the Service to transmit spam, chain letters, or other unsolicited communications</li>
            </ul>
          </section>

          <section className="mb-8 bg-amber-50 border-2 border-amber-200 rounded-xl p-6">
            <h2 className="text-2xl font-bold text-amber-900 mb-4">⚠️ 5. Copy Trading Disclaimer</h2>
            <div className="space-y-4 text-amber-900">
              <p className="font-semibold text-lg">
                IMPORTANT: Please read this section carefully before using Polycopy.
              </p>
              <p className="leading-relaxed">
                <strong>Copying trades does not guarantee similar results.</strong> The traders featured on Polycopy 
                have achieved their results under specific market conditions, with specific timing, and with their own 
                risk management strategies. Your results may differ significantly.
              </p>
              <p className="leading-relaxed">
                <strong>Past performance is not indicative of future results.</strong> Historical trading performance 
                displayed on Polycopy is no guarantee of future performance. Market conditions change, and traders' 
                strategies may not continue to be successful.
              </p>
              <p className="leading-relaxed">
                <strong>You are solely responsible for your trading decisions and any losses incurred.</strong> 
                Polycopy is an informational tool that displays publicly available blockchain data. We do not provide 
                trading recommendations, signals, or advice. Every trading decision you make is your own responsibility.
              </p>
              <p className="leading-relaxed">
                <strong>Polycopy does not execute trades on your behalf.</strong> We do not have access to your funds, 
                wallets, or Polymarket account. All trading activity occurs directly on Polymarket, and you maintain 
                full control over your trades at all times.
              </p>
              <p className="leading-relaxed">
                <strong>Trading involves substantial risk of loss.</strong> You should only trade with funds you can 
                afford to lose. Consider your financial situation, risk tolerance, and investment objectives before 
                engaging in any trading activity.
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">6. Data and Analytics</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              The data and analytics displayed on Polycopy are derived from public blockchain data and Polymarket's 
              public APIs. While we strive for accuracy, we make no guarantees or warranties regarding the accuracy, 
              completeness, or timeliness of any data displayed on the Service.
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              Trading statistics, ROI calculations, and performance metrics are calculated based on publicly available 
              data and may not reflect the complete trading activity or actual results of any trader. Data may be 
              delayed, incomplete, or contain errors.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">7. No Financial Advice</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              The information provided through the Service is for informational purposes only and does not constitute 
              financial, investment, trading, or other professional advice. You should not rely on the information on 
              Polycopy as a substitute for professional advice from a licensed financial advisor.
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              Polycopy does not recommend or endorse any particular trader, trading strategy, or prediction market. 
              The inclusion of any trader on our platform does not constitute an endorsement or recommendation.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">8. Intellectual Property</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              The Service and its original content, features, and functionality are owned by Polycopy and are protected 
              by international copyright, trademark, patent, trade secret, and other intellectual property laws. You may 
              not copy, modify, distribute, sell, or lease any part of our Service without our prior written permission.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">9. Third-Party Links and Services</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              The Service may contain links to third-party websites or services, including Polymarket, that are not 
              owned or controlled by Polycopy. We have no control over, and assume no responsibility for, the content, 
              privacy policies, or practices of any third-party websites or services. You acknowledge and agree that 
              Polycopy shall not be responsible or liable for any damage or loss caused by use of any third-party services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">10. Disclaimer of Warranties</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER 
              EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A 
              PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              Polycopy does not warrant that the Service will be uninterrupted, timely, secure, or error-free. We do 
              not warrant that the results obtained from the use of the Service will be accurate or reliable.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">11. Limitation of Liability</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL POLYCOPY, ITS DIRECTORS, EMPLOYEES, 
              PARTNERS, AGENTS, SUPPLIERS, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, 
              OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION, LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER 
              INTANGIBLE LOSSES, RESULTING FROM:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li>Your access to or use of or inability to access or use the Service</li>
              <li>Any conduct or content of any third party on the Service</li>
              <li>Any content obtained from the Service</li>
              <li>Unauthorized access, use, or alteration of your transmissions or content</li>
              <li>Trading losses or other financial losses incurred based on information from the Service</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">12. Changes to Terms</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              We reserve the right to modify or replace these Terms at any time at our sole discretion. If we make 
              material changes, we will notify you by email or by posting a notice on the Service prior to the effective 
              date of the changes. Your continued use of the Service after any such changes constitutes your acceptance 
              of the new Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">13. Termination</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              We may terminate or suspend your account and access to the Service immediately, without prior notice or 
              liability, for any reason, including if you breach these Terms. Upon termination, your right to use the 
              Service will immediately cease.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">14. Governing Law</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              These Terms shall be governed by and construed in accordance with the laws of the United States, without 
              regard to its conflict of law provisions. Any disputes arising from these Terms or your use of the Service 
              shall be resolved in the courts of competent jurisdiction.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">15. Contact Information</h2>
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
