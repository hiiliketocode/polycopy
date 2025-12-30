import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy - Polycopy",
  description: "Privacy Policy for Polycopy copy trading platform",
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-16 md:py-24">
        <div className="bg-white rounded-lg border border-slate-200 p-8 md:p-12">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">Privacy Policy</h1>
          <p className="text-sm text-slate-500 mb-8">Last updated: December 21, 2024</p>

          <div className="prose prose-slate max-w-none">
            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">1. Information We Collect</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              We collect information you provide directly to us, including your email address, username, Polymarket
              wallet address, and trading activity. Premium users who enable automated trading provide their encrypted
              wallet private key, which is stored securely through Turnkey.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">2. How We Use Your Information</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              We use your information to provide, maintain, and improve our services, including executing trades on your
              behalf if you're a Premium user. We also use your information to communicate with you about your account,
              send notifications, and respond to your requests.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">3. Security of Private Keys</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              Your wallet private keys are encrypted using industry-standard encryption and stored securely through
              Turnkey's infrastructure. Polycopy does not store or have access to your unencrypted private keys. Private
              keys are only decrypted when executing authorized trades on your behalf.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">4. Data Sharing and Disclosure</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              We do not sell, trade, or rent your personal information to third parties. We may share information with
              service providers who assist in operating our platform (such as Turnkey for key management and Klaviyo for
              notifications), but only to the extent necessary to provide services.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">5. Cookies and Tracking</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              We use cookies and similar tracking technologies to track activity on our platform and hold certain
              information. You can instruct your browser to refuse all cookies or to indicate when a cookie is being
              sent.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">6. Third-Party Services</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              Our platform integrates with third-party services including Polymarket (for trading data), Turnkey (for
              secure key management), Stripe (for payment processing), and Klaviyo (for notifications). These services
              have their own privacy policies and we encourage you to review them.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">7. Data Retention</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              We retain your information for as long as your account is active or as needed to provide you services. If
              you close your account, we will delete or anonymize your information within 90 days, except where we're
              required to retain it for legal purposes.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">8. Your Rights</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              You have the right to access, correct, or delete your personal information. You can disconnect your wallet
              and close your account at any time through your account settings. Premium users can request deletion of
              their encrypted private keys at any time.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">9. Children's Privacy</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              Polycopy is not intended for users under the age of 18. We do not knowingly collect information from
              children under 18. If you believe we have collected information from a child, please contact us
              immediately.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">10. Changes to Privacy Policy</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new
              Privacy Policy on this page and updating the "Last updated" date.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">11. Contact Us</h2>
            <p className="text-slate-600 leading-relaxed">
              If you have questions about this Privacy Policy or our data practices, please contact us at{" "}
              <a
                href="https://x.com/polycopyapp"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-600 hover:text-amber-700"
              >
                @polycopyapp on X
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
