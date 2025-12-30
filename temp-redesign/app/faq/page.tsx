import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "FAQ - Polycopy",
  description: "Frequently asked questions about Polycopy copy trading platform",
}

const faqs = [
  {
    question: "What is Polycopy?",
    answer:
      "Polycopy is a copy trading platform for Polymarket prediction markets. Follow top-performing traders and automatically replicate their trades in your own account.",
  },
  {
    question: "How does copy trading work?",
    answer:
      "When you follow a trader and mark their trades as copied, Polycopy tracks their performance. Premium users can automatically execute trades based on the traders they follow, with positions opening and closing in sync with the original trader.",
  },
  {
    question: "Is my wallet secure?",
    answer:
      "Yes. Your private keys are encrypted and stored securely using Turnkey's infrastructure. Polycopy never has direct access to your private keys - they are only used to execute trades on your behalf through secure, encrypted channels.",
  },
  {
    question: "What's the difference between Free and Premium?",
    answer:
      "Free users can follow traders and manually track trades. Premium users ($20/month) can automatically execute trades directly from Polycopy, receive SMS notifications, and access advanced features like auto-closing positions when traders exit.",
  },
  {
    question: "Can I stop copying a trader at any time?",
    answer:
      "Yes. You can unfollow traders at any time, and you maintain full control over your positions. You can manually close any copied trade whenever you choose.",
  },
  {
    question: "How do I find the best traders to follow?",
    answer:
      "Browse the Discover page to see top traders ranked by ROI, win rate, volume, and other metrics. You can filter by category and time period to find traders that match your strategy.",
  },
  {
    question: "What markets can I trade?",
    answer:
      "Polycopy supports all Polymarket prediction markets including Politics, Sports, Crypto, Business, Tech, and more.",
  },
  {
    question: "Do I need a Polymarket account?",
    answer:
      "Yes. You'll need to connect your Polymarket wallet address to Polycopy. Premium users will also need to securely import their private key to enable automated trade execution.",
  },
]

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-16 md:py-24">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">Frequently Asked Questions</h1>
          <p className="text-lg text-slate-600">Everything you need to know about Polycopy</p>
        </div>

        <div className="space-y-6">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="bg-white rounded-lg border border-slate-200 p-6 hover:shadow-md transition-shadow"
            >
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{faq.question}</h2>
              <p className="text-slate-600 leading-relaxed">{faq.answer}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-slate-600 mb-4">Still have questions?</p>
          <a
            href="https://x.com/polycopyapp"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-amber-600 hover:text-amber-700 font-medium"
          >
            Contact us on X →
          </a>
        </div>
      </div>
    </div>
  )
}
