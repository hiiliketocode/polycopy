import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "High-Signal Polymarket Trades | AI Scoring | Polycopy",
  description: "AI-scored prediction market trades ranked by conviction, trader skill, and timing. Find the highest-signal Polymarket bets from 500K+ traders. Free and premium access.",
  keywords: [
    'Polymarket signals',
    'Polymarket trading signals',
    'best Polymarket trades',
    'Polymarket trade recommendations',
    'high confidence Polymarket trades',
    'Polymarket AI signals',
    'prediction market signals',
    'Polymarket trade alerts',
    'Polymarket smart money',
  ],
  alternates: {
    canonical: 'https://polycopy.app/high-signal-polymarket-trades'
  },
  openGraph: {
    title: "High-Signal Polymarket Trades | AI-Scored",
    description: "AI-scored prediction market trades. Find the highest-conviction opportunities from 500K+ Polymarket traders.",
    url: 'https://polycopy.app/high-signal-polymarket-trades',
    siteName: 'Polycopy',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Polycopy - High-Signal Polymarket Trades'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'High-Signal Polymarket Trades | Polycopy',
    description: 'AI-scored trades ranked by conviction, skill, and timing',
    images: ['/og-image.png']
  },
  robots: {
    index: true,
    follow: true,
  }
};

export default function HighSignalTradesLayout({
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
        "name": "What are high-signal Polymarket trades?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "High-signal trades are Polymarket positions identified by Polycopy's AI scoring system as having strong conviction, favorable timing, and skilled trader backing. Each trade is scored 0-100 based on edge, conviction, trader skill, and market context."
        }
      },
      {
        "@type": "Question",
        "name": "How does the AI scoring system work?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "The scoring system (PolySignal) evaluates each trade on four factors: Edge (50% weight) - does the trade have a price advantage; Conviction (25%) - how much is the trader risking; Skill (15%) - the trader's historical performance; Context (10%) - market conditions and timing. Trades scoring 60+ (Buy or Strong Buy) are surfaced."
        }
      },
      {
        "@type": "Question",
        "name": "Are Polymarket trading signals free?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes, Polycopy's free tier includes access to followed trader signals in your feed. Premium users ($20/mo) get access to the full high-signal feed that scans all 500K+ traders across every market category."
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
        "name": "High-Signal Trades",
        "item": "https://polycopy.app/high-signal-polymarket-trades"
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
