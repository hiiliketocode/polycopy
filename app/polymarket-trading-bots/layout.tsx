import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Polymarket Trading Bots | AI Copy Trading | Polycopy",
  description: "Automated Polymarket trading bots that copy proven strategies. Free tier available. ML-powered bots analyze 500K+ traders and execute high-confidence trades automatically.",
  keywords: [
    'Polymarket bot',
    'Polymarket trading bot',
    'Polymarket copy trading bot',
    'automated Polymarket trading',
    'Polymarket AI bot',
    'best Polymarket bots',
    'free Polymarket bot',
    'Polymarket strategy bot',
    'Polymarket automated trading',
    'prediction market bot',
  ],
  alternates: {
    canonical: 'https://polycopy.app/polymarket-trading-bots'
  },
  openGraph: {
    title: "Polymarket Trading Bots | Automated Copy Trading",
    description: "Automated trading bots for Polymarket. Follow AI-powered strategies with real-time performance tracking. Free and premium bots available.",
    url: 'https://polycopy.app/polymarket-trading-bots',
    siteName: 'Polycopy',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Polycopy - Polymarket Trading Bots'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Polymarket Trading Bots | Polycopy',
    description: 'Automated Polymarket trading bots with AI-powered strategies',
    images: ['/og-image.png']
  },
  robots: {
    index: true,
    follow: true,
  }
};

export default function PolymarketTradingBotsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // FAQ Schema
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What are Polymarket trading bots?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Polymarket trading bots are automated wallets that execute trading strategies on Polymarket. They analyze markets, identify opportunities, and place trades automatically based on predefined rules and AI analysis."
        }
      },
      {
        "@type": "Question",
        "name": "Are there free Polymarket bots?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes! Polycopy's free tier includes access to one trading bot so you can try bot-powered trading at no cost. Premium users ($20/mo) unlock the full lineup of bots across all risk levels, including advanced ML-powered bots."
        }
      },
      {
        "@type": "Question",
        "name": "How do Polymarket bots work?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Bots follow specific trading strategies (conservative, balanced, aggressive, or ML-powered). They analyze markets, place trades automatically, and manage positions. You can copy their trades or track their performance in real-time."
        }
      },
      {
        "@type": "Question",
        "name": "Are Polymarket bots profitable?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Bot performance varies by strategy and market conditions. All bots display real-time P&L, ROI, and win rate. Past performance doesn't guarantee future results. Trading involves risk."
        }
      }
    ]
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://polycopy.app"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Polymarket Trading Bots",
        "item": "https://polycopy.app/polymarket-trading-bots"
      }
    ]
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      {children}
    </>
  );
}
