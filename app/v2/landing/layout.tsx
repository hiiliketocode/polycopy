import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Polycopy - Copy Trading for Polymarket",
  description: "Discover and copy top Polymarket traders. Track performance, follow winning strategies, and make smarter prediction market trades.",
  keywords: [
    'Polymarket',
    'copy trading',
    'prediction markets',
    'Polymarket traders',
    'prediction trading',
    'market forecasting',
    'trading bots',
    'automated trading'
  ],
  alternates: {
    canonical: 'https://polycopy.app'
  },
  openGraph: {
    title: 'Polycopy - Copy Trading for Polymarket',
    description: 'Discover and copy top Polymarket traders. Track performance, follow winning strategies, and make smarter prediction market trades.',
    url: 'https://polycopy.app',
    siteName: 'Polycopy',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Polycopy - Copy Trading for Polymarket'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Polycopy - Copy Trading for Polymarket',
    description: 'Discover and copy top Polymarket traders.',
    images: ['/og-image.png']
  },
  robots: {
    index: true,
    follow: true,
  }
};

export default function V2LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Organization schema
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Polycopy",
    "url": "https://polycopy.app",
    "logo": "https://polycopy.app/logos/polycopy-logo-primary.png",
    "description": "Copy trading platform for Polymarket prediction markets",
    "sameAs": [
      "https://twitter.com/polycopyapp"
    ]
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      {children}
    </>
  );
}
