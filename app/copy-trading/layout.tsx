import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Copy Trading for Polymarket - See What Top Traders Are Doing",
  description: "Get a curated feed of trades from top Polymarket traders. See their moves in real-time, pick which trades make sense for you, and execute with one click. Curation over automation.",
  keywords: [
    'copy trading',
    'polymarket copy trading',
    'prediction market signals',
    'trading feed',
    'polymarket traders feed',
    'smart copy trading',
    'curated trading opportunities',
    'polymarket trade alerts',
    'social trading polymarket',
    'informed trading decisions',
  ],
  openGraph: {
    title: "Copy Trading for Polymarket - Curated Feed of Top Traders | Polycopy",
    description: "Like Twitter for Polymarket trading. Follow top traders, see their moves in a feed, choose what to copy. Curation over automation.",
    url: 'https://polycopy.app/copy-trading',
    siteName: 'Polycopy',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Polycopy - Smart Copy Trading for Polymarket'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Copy Trading for Polymarket - Your Curated Trading Feed',
    description: 'Follow top Polymarket traders. See their moves in a feed. Pick what to copy. Curation over automation.',
    images: ['/og-image.png']
  },
  alternates: {
    canonical: 'https://polycopy.app/copy-trading'
  }
};

export default function CopyTradingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // FAQ Schema for rich snippets
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is copy trading on Polycopy?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Copy trading on Polycopy is different from traditional automation. You follow top Polymarket traders and see their trades in a real-time feed (like Twitter). You pick which trades align with your strategy and copy them with one click. You maintain full control and decision-making power."
        }
      },
      {
        "@type": "Question",
        "name": "Does Polycopy automatically copy all trades?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No. Polycopy shows you what traders are doing in a curated feed, but you choose what to copy. We believe in curation over automation - even the best traders make moves you might not understand or be comfortable with. You stay in control."
        }
      },
      {
        "@type": "Question",
        "name": "How much does Polycopy cost?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Polycopy has a free tier that includes following unlimited traders, full feed access, and manual trade copying. Premium is $20/month and adds one-click trade execution, auto-close functionality, and priority support."
        }
      },
      {
        "@type": "Question",
        "name": "Do I need to connect my wallet?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "For the free tier, no wallet connection is needed - you see the feed and manually copy trades on Polymarket yourself. Premium users can connect their wallet for one-click execution through Polycopy. Your wallet and funds remain 100% under your control."
        }
      }
    ]
  };

  // Breadcrumb Schema
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
        "name": "Copy Trading",
        "item": "https://polycopy.app/copy-trading"
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
