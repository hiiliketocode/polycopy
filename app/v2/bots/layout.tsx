import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Polymarket Trading Bots | AI Copy Trading | Polycopy",
  description: "Automated Polymarket trading bots. Follow AI-powered strategies from conservative to aggressive. Free tier available. Premium unlocks all bots including ML-powered strategies.",
  keywords: [
    'Polymarket bot',
    'Polymarket trading bot',
    'Polymarket copy trading bot',
    'automated Polymarket trading',
    'Polymarket AI bot',
    'best Polymarket bots',
    'free Polymarket bot',
    'Polymarket strategy bot',
  ],
  alternates: {
    canonical: 'https://polycopy.app/bots'
  },
  openGraph: {
    title: "Polymarket Trading Bots | Polycopy",
    description: "Automated trading bots for Polymarket. Follow AI strategies with real-time performance tracking.",
    url: 'https://polycopy.app/bots',
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
    description: 'Automated trading bots for Polymarket with real-time performance tracking',
    images: ['/og-image.png']
  },
  robots: {
    index: true,
    follow: true,
  }
};

export default function V2BotsLayout({
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
        "name": "Trading Bots",
        "item": "https://polycopy.app/bots"
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
