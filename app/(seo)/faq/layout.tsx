import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ - Polymarket Copy Trading Help | Polycopy",
  description: "Get answers to frequently asked questions about Polycopy copy trading for Polymarket. Learn about setup, security, wallets, fees, premium features, and automated trading strategies.",
  keywords: [
    'Polycopy FAQ',
    'Polymarket copy trading help',
    'how does copy trading work',
    'Polymarket trading questions',
    'Polycopy support',
    'prediction market FAQ',
    'copy trading setup',
    'Polymarket wallet setup',
    'automated trading Polymarket',
    'Polycopy security',
    'copy trading fees'
  ],
  openGraph: {
    title: "Frequently Asked Questions | Polycopy",
    description: "Everything you need to know about copy trading on Polymarket with Polycopy. Setup guides, security info, and trading help.",
    url: 'https://polycopy.app/faq',
    siteName: 'Polycopy',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Polycopy FAQ - Copy Trading Help'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Polycopy FAQ - Copy Trading Questions Answered',
    description: 'Get help with Polymarket copy trading setup, security, and strategies.',
    images: ['/og-image.png']
  },
  alternates: {
    canonical: 'https://polycopy.app/faq'
  }
};

export default function FAQLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
