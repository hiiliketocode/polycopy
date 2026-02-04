import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Polymarket Trading Strategies - Learn from Top Traders | Polycopy",
  description: "Master proven Polymarket trading strategies. Learn momentum trading, event-based strategies, arbitrage, portfolio management, and risk control from successful traders.",
  keywords: [
    'polymarket trading strategies',
    'polymarket trading tips',
    'prediction market strategies',
    'polymarket profitable strategies',
    'how to win on polymarket',
    'polymarket trading guide',
    'polymarket arbitrage',
    'prediction market trading',
    'polymarket momentum trading',
    'polymarket risk management',
  ],
  openGraph: {
    title: "Polymarket Trading Strategies - Learn from the Best | Polycopy",
    description: "Proven Polymarket trading strategies from top performers. Momentum, events, arbitrage, and risk management tactics that actually work.",
    url: 'https://polycopy.app/polymarket-trading-strategies',
    siteName: 'Polycopy',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Polymarket Trading Strategies Guide'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Polymarket Trading Strategies - Proven Tactics',
    description: 'Learn trading strategies that top Polymarket traders actually use. From momentum to arbitrage to risk management.',
    images: ['/og-image.png']
  },
  alternates: {
    canonical: 'https://polycopy.app/polymarket-trading-strategies'
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function TradingStrategiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What's the most profitable Polymarket strategy?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "There's no single 'best' strategy - it depends on your knowledge and time commitment. Event-based trading (betting on outcomes you deeply understand) tends to be most profitable for beginners. Momentum trading works well for active traders. Arbitrage requires speed but has lower risk. Most successful traders combine multiple strategies."
        }
      },
      {
        "@type": "Question",
        "name": "How much capital do I need for each strategy?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Event-based and momentum strategies can start with $50-100. Arbitrage needs slightly more ($200-500) to make spreads worthwhile. Portfolio strategies work at any scale but benefit from $500+ to diversify properly. Start small with any strategy and scale up as you prove it works for you."
        }
      },
      {
        "@type": "Question",
        "name": "Can I combine multiple strategies?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes, and you should! Most successful traders use event-based trading for high-conviction bets, momentum trading for quick opportunities, and portfolio diversification for stability. Don't put all eggs in one strategy basket."
        }
      },
      {
        "@type": "Question",
        "name": "How long does it take to be profitable?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Most traders see results within 2-4 weeks if they stick to one strategy and track performance. Expect some losing trades while learning - focus on overall win rate and ROI over time, not individual trade outcomes. Give yourself 20-30 trades before judging if a strategy works for you."
        }
      },
      {
        "@type": "Question",
        "name": "What's the biggest mistake traders make with strategies?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Switching strategies too quickly. Pick one, commit to it for 20+ trades, track results. If it's not working after that sample size, then adjust. Most traders give up on strategies too early, before they've learned the nuances."
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
        "name": "Trading Strategies",
        "item": "https://polycopy.app/polymarket-trading-strategies"
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
