import Link from 'next/link';
import { Navigation } from '@/components/polycopy/navigation';

export default function PrivacyPolicy() {
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
          <h1 className="text-4xl font-bold text-slate-900 mb-4">Privacy Policy</h1>
          <p className="text-sm text-slate-500">Last Updated: December 9, 2024</p>
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 md:p-12 prose prose-slate max-w-none">
          
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">1. Introduction</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              Welcome to Polycopy. We respect your privacy and are committed to protecting your personal data. This 
              Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our 
              Service. Please read this Privacy Policy carefully.
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              By using Polycopy, you agree to the collection and use of information in accordance with this Privacy Policy. 
              If you do not agree with our policies and practices, please do not use the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">2. Information We Collect</h2>
            
            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">2.1 Account Data</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              When you create an account on Polycopy, we collect your email address for authentication purposes. We use 
              "magic link" authentication through Supabase, which means you log in via a link sent to your email rather 
              than a traditional password.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">2.2 Blockchain and Trading Data</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              We collect and display public blockchain data and trading activity from Polymarket, including:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li>Public wallet addresses of traders you choose to follow</li>
              <li>Trading activity, positions, and performance metrics available through Polymarket's public APIs</li>
              <li>Market data, prices, and outcomes from prediction markets</li>
            </ul>
            <p className="text-slate-700 leading-relaxed mb-4">
              This data is publicly available on the blockchain and through Polymarket's platform. We aggregate and 
              display this information to provide our Service.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">2.3 Usage Data</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              We automatically collect certain information when you visit and use the Service, including:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li>Browser type and version</li>
              <li>Device type and operating system</li>
              <li>IP address (anonymized)</li>
              <li>Pages visited and features used</li>
              <li>Time and date of visits</li>
              <li>Time spent on pages</li>
              <li>Referring website addresses</li>
            </ul>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">2.4 User-Generated Data</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              We store information about your use of the Service, including:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li>Traders you follow</li>
              <li>Trades you mark as "copied"</li>
              <li>Your performance tracking data (entry prices, amounts invested, exit prices)</li>
              <li>Your preferences and settings</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">3. How We Use Your Information</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              We use the information we collect for the following purposes:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li><strong>Provide the Service:</strong> To create and manage your account, display trading data, and enable you to follow traders and track your performance</li>
              <li><strong>Authentication:</strong> To send magic link authentication emails when you log in</li>
              <li><strong>Notifications:</strong> To send you email notifications about trading activity from traders you follow (if you enable this feature)</li>
              <li><strong>Analytics:</strong> To understand how users interact with our Service and improve functionality</li>
              <li><strong>Display Leaderboards:</strong> To aggregate and display trader performance metrics and rankings</li>
              <li><strong>Service Improvements:</strong> To diagnose technical issues, improve our algorithms, and enhance user experience</li>
              <li><strong>Communication:</strong> To respond to your inquiries and provide customer support</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">4. Third-Party Services</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              We use the following third-party services to operate Polycopy:
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">4.1 Supabase</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              We use Supabase for authentication and database services. Your email address and account data are stored 
              on Supabase's secure infrastructure. Supabase's privacy policy can be found at supabase.com/privacy.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">4.2 Vercel</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              Our Service is hosted on Vercel's infrastructure. Vercel may collect anonymized usage data as part of 
              their hosting services. Vercel's privacy policy can be found at vercel.com/legal/privacy-policy.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">4.3 Resend</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              We use Resend to deliver transactional emails, including magic link authentication emails and trade 
              notifications. Your email address is shared with Resend for this purpose. Resend's privacy policy can 
              be found at resend.com/legal/privacy-policy.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">4.4 Polymarket APIs</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              We fetch public blockchain and trading data from Polymarket's APIs to display trader information and 
              market data. This data is publicly available and does not require sharing your personal information with 
              Polymarket through our Service.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-6 mb-3">4.5 Google Analytics</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              We use Google Analytics to analyze usage patterns and improve our Service. Google Analytics may collect 
              anonymized information about your visit, including pages viewed, time spent, and interactions. You can 
              opt out of Google Analytics by installing the Google Analytics Opt-out Browser Add-on.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">5. Data Sharing and Disclosure</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              We do not sell, trade, or rent your personal information to third parties. We may share your information 
              in the following circumstances:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li><strong>Service Providers:</strong> We share data with third-party service providers (listed above) who help us operate the Service</li>
              <li><strong>Legal Requirements:</strong> We may disclose your information if required to do so by law or in response to valid requests by public authorities</li>
              <li><strong>Business Transfers:</strong> If Polycopy is involved in a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction</li>
              <li><strong>With Your Consent:</strong> We may share your information with third parties when you give us explicit consent to do so</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">6. Data Retention</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              We retain your personal information for as long as necessary to provide the Service and fulfill the 
              purposes outlined in this Privacy Policy. When you delete your account, we will delete your email address 
              and personal account data. However, we may retain anonymized usage data and publicly available blockchain 
              data for analytics purposes.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">7. Data Security</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              We implement appropriate technical and organizational security measures to protect your personal information 
              against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over 
              the internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              Our security measures include:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li>Encryption of data in transit using HTTPS/TLS</li>
              <li>Secure authentication through Supabase</li>
              <li>Regular security updates and monitoring</li>
              <li>Access controls and authentication for our systems</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">8. Your Privacy Rights</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              Depending on your location, you may have certain rights regarding your personal information:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li><strong>Access:</strong> You can request a copy of the personal information we hold about you</li>
              <li><strong>Correction:</strong> You can update your account information through your profile settings</li>
              <li><strong>Deletion:</strong> You can request deletion of your account and personal information</li>
              <li><strong>Data Portability:</strong> You can request a copy of your data in a machine-readable format</li>
              <li><strong>Opt-Out:</strong> You can opt out of email notifications through your account settings</li>
            </ul>
            <p className="text-slate-700 leading-relaxed mb-4">
              To exercise any of these rights, please contact us at support@polycopy.app.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">9. Cookies and Tracking Technologies</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              We use cookies and similar tracking technologies to enhance your experience on our Service. Cookies are 
              small data files stored on your device that help us remember your preferences and improve functionality.
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              We use the following types of cookies:
            </p>
            <ul className="list-disc pl-6 mb-4 text-slate-700 space-y-2">
              <li><strong>Essential Cookies:</strong> Required for authentication and basic functionality</li>
              <li><strong>Analytics Cookies:</strong> Help us understand how users interact with the Service</li>
              <li><strong>Preference Cookies:</strong> Remember your settings and preferences</li>
            </ul>
            <p className="text-slate-700 leading-relaxed mb-4">
              You can control cookies through your browser settings. Note that disabling cookies may limit your ability 
              to use certain features of the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">10. Children's Privacy</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              Our Service is not intended for individuals under the age of 18. We do not knowingly collect personal 
              information from children under 18. If you are a parent or guardian and believe your child has provided 
              us with personal information, please contact us, and we will delete such information.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">11. International Data Transfers</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              Your information may be transferred to and maintained on servers located outside of your state, province, 
              country, or other governmental jurisdiction where data protection laws may differ. By using the Service, 
              you consent to the transfer of your information to the United States and other countries where our service 
              providers operate.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">12. Changes to This Privacy Policy</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              We may update this Privacy Policy from time to time. We will notify you of any material changes by posting 
              the new Privacy Policy on this page and updating the "Last Updated" date. We may also send you an email 
              notification of significant changes.
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              Your continued use of the Service after any changes indicates your acceptance of the updated Privacy Policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">13. Contact Information</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, 
              please contact us at:
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              Email:{' '}
              <a href="mailto:support@polycopy.app" className="text-[#FDB022] hover:text-[#E69E1A] font-medium">
                support@polycopy.app
              </a>
            </p>
          </section>

          <div className="mt-12 pt-8 border-t border-slate-200">
            <p className="text-sm text-slate-500 text-center">
              By using Polycopy, you acknowledge that you have read and understood this Privacy Policy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
