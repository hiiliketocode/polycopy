import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Polymarket vs Kalshi, PredictIt | Comparison | Polycopy",
  description: "Compare Polymarket to Kalshi, PredictIt, Manifold. Compare liquidity, fees, markets, and which platform is best for copy trading.",
  keywords: [
    'polymarket vs kalshi',
    'polymarket vs predictit',
    'prediction market comparison',
    'best prediction market platform',
    'polymarket alternatives',
    'polymarket vs manifold',
    'prediction market platforms compared',
    'which prediction market to use',
    'polymarket copy trading',
    'prediction market trading platforms',
  ],
  openGraph: {
    title: "Polymarket vs Other Platforms - Which Prediction Market Is Best?",
    description: "Detailed comparison of Polymarket, Kalshi, PredictIt, and other prediction markets. Liquidity, fees, features, and copy trading availability.",
    url: 'https://polycopy.app/polymarket-vs-other-platforms',
    siteName: 'Polycopy',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Polymarket vs Other Prediction Markets Comparison'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Polymarket vs Kalshi, PredictIt & Others - Platform Comparison',
    description: 'Which prediction market is best? Compare Polymarket to alternatives on liquidity, fees, markets, and copy trading.',
    images: ['/og-image.png']
  },
  alternates: {
    canonical: 'https://polycopy.app/polymarket-vs-other-platforms'
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function ComparisonLayout({
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
        "name": "Which prediction market has the most liquidity?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Polymarket has the highest liquidity of any prediction market, with billions in monthly volume. This means tighter spreads, better prices, and easier entry/exit on trades. Kalshi is second for US users, while PredictIt has much lower liquidity."
        }
      },
      {
        "@type": "Question",
        "name": "Can I copy trade on platforms other than Polymarket?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Currently, Polycopy only supports Polymarket. Other platforms don't have robust APIs or trader tracking infrastructure needed for copy trading. Polymarket's blockchain-based transparency makes it ideal for following and copying traders."
        }
      },
      {
        "@type": "Question",
        "name": "Is Polymarket legal in the US?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Polymarket is available globally but excludes US users from direct platform access. US users can legally access prediction markets through Kalshi (CFTC-regulated) or PredictIt (no-action letter from CFTC). Always check local regulations."
        }
      },
      {
        "@type": "Question",
        "name": "Which platform has the lowest fees?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Polymarket charges no platform fees - you only pay Polygon network gas fees (pennies). Kalshi charges 7% on winnings. PredictIt charges 10% on profits plus 5% withdrawal fees. Manifold uses play money (no real money trading)."
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
        "name": "Polymarket vs Other Platforms",
        "item": "https://polycopy.app/polymarket-vs-other-platforms"
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
