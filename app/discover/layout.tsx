import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Discover Top Polymarket Traders | Copy Trading Leaderboard",
  description: "Discover top Polymarket traders. Real-time leaderboards, performance metrics, and copy trading strategies. Browse by category: Sports, Politics, Crypto.",
  keywords: [
    'Polymarket traders',
    'Polymarket leaderboard',
    'top Polymarket traders',
    'copy trading Polymarket',
    'prediction market traders',
    'Polymarket rankings',
    'best Polymarket traders',
    'Polymarket statistics',
    'crypto prediction markets',
    'sports betting Polymarket',
    'political betting traders'
  ],
  openGraph: {
    title: "Discover Top Polymarket Traders | Polycopy",
    description: "Find and follow the best performing Polymarket traders. Real-time rankings, performance analytics, and copy trading for prediction markets.",
    url: 'https://polycopy.app/discover',
    siteName: 'Polycopy',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Polycopy - Discover Top Polymarket Traders'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Discover Top Polymarket Traders | Polycopy',
    description: 'Find and follow the best performing Polymarket traders with real-time rankings and analytics.',
    images: ['/og-image.png']
  },
  alternates: {
    canonical: 'https://polycopy.app/discover'
  }
};

export default function DiscoverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Breadcrumb structured data
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
        "name": "Discover Traders",
        "item": "https://polycopy.app/discover"
      }
    ]
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      {children}
    </>
  );
}
