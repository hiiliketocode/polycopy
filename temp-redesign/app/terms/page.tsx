import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms of Service - Polycopy",
  description: "Terms of Service for Polycopy copy trading platform",
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-16 md:py-24">
        <div className="bg-white rounded-lg border border-slate-200 p-8 md:p-12">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">Terms of Service</h1>
          <p className="text-sm text-slate-500 mb-8">Last updated: December 21, 2024</p>

          <div className="prose prose-slate max-w-none">
            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">1. Acceptance of Terms</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              By accessing and using Polycopy, you accept and agree to be bound by the terms and provision of this
              agreement. If you do not agree to these Terms of Service, please do not use our platform.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">2. Description of Service</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              Polycopy is a copy trading platform that enables users to follow and replicate trades made by other
              traders on Polymarket prediction markets. Premium users can authorize Polycopy to execute trades
              automatically on their behalf.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">3. Risk Disclosure</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              Trading prediction markets involves substantial risk of loss. Past performance of traders does not
              guarantee future results. You acknowledge that you are solely responsible for all trading decisions and
              any resulting gains or losses.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">4. Account Registration</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              You must provide accurate and complete information when creating an account. You are responsible for
              maintaining the security of your account credentials and for all activities that occur under your account.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">5. Wallet Connection and Private Keys</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              Premium users who choose to enable automated trading must securely import their Polymarket wallet private
              key. Your private key is encrypted and stored using Turnkey's secure infrastructure. Polycopy does not
              have direct access to your unencrypted private keys. You can disconnect your wallet at any time.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">6. Premium Subscription</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              Premium subscriptions are billed monthly at $20/month. You may cancel your subscription at any time.
              Cancellations take effect at the end of the current billing period. No refunds are provided for partial
              months.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">7. Prohibited Uses</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              You may not use Polycopy to engage in market manipulation, wash trading, or any illegal activities. You
              may not attempt to circumvent security measures or interfere with the proper functioning of the platform.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">8. Limitation of Liability</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              Polycopy is provided "as is" without warranties of any kind. Polycopy shall not be liable for any trading
              losses, system downtime, or other damages arising from your use of the platform. Our liability is limited
              to the subscription fees paid in the past 12 months.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">9. Modifications to Service</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              We reserve the right to modify, suspend, or discontinue any aspect of Polycopy at any time. We may also
              modify these Terms of Service with notice to users.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">10. Termination</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              We may terminate or suspend your account at any time for violation of these terms. Upon termination, your
              right to use Polycopy immediately ceases.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">11. Governing Law</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the United States, without
              regard to its conflict of law provisions.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">12. Contact Information</h2>
            <p className="text-slate-600 leading-relaxed">
              For questions about these Terms of Service, please contact us at{" "}
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
