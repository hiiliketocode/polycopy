import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Discover Top Polymarket Traders | Copy Trading Leaderboard",
  description: "Browse 500K+ Polymarket traders with real-time performance metrics. Filter by category (Sports, Politics, Crypto), analyze strategies, and follow the best.",
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
    description: "Browse and analyze 500K+ Polymarket traders with real-time performance data and metrics.",
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
    description: 'Browse 500K+ traders with real-time performance rankings',
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
