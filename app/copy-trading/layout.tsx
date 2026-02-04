import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Copy Trading Made Simple - Follow Top Polymarket Traders",
  description: "Learn how copy trading works on Polymarket. Follow proven traders, automatically copy their strategies, and track your performance. Start free with Polycopy.",
  keywords: [
    'copy trading',
    'what is copy trading',
    'how does copy trading work',
    'polymarket copy trading',
    'prediction market copy trading',
    'social trading',
    'mirror trading',
    'copy trading explained',
    'copy trading for beginners',
    'automated copy trading',
  ],
  openGraph: {
    title: "Copy Trading Made Simple | Polycopy",
    description: "Follow top Polymarket traders and copy their winning strategies. Learn how copy trading works and start growing your portfolio today.",
    url: 'https://polycopy.app/copy-trading',
    siteName: 'Polycopy',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Polycopy Copy Trading Platform'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Copy Trading Made Simple | Polycopy',
    description: 'Follow top Polymarket traders and copy their winning strategies. Start free today.',
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
        "name": "What is copy trading?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Copy trading is a strategy where you automatically replicate the trades of experienced traders. On Polycopy, you can follow top Polymarket traders and copy their prediction market positions with just a few clicks."
        }
      },
      {
        "@type": "Question",
        "name": "Is copy trading legal?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes, copy trading is legal. You maintain full control of your funds and can start or stop copying at any time. Polycopy connects to your wallet with your permission to execute trades on your behalf."
        }
      },
      {
        "@type": "Question",
        "name": "How much does copy trading cost?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Polycopy offers a free plan where you can manually copy trades. Premium plans start at a monthly fee and include automatic trade execution, real-time notifications, and advanced analytics."
        }
      },
      {
        "@type": "Question",
        "name": "Do I need to connect my wallet to copy trades?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "For manual copying (free plan), you don't need to connect your wallet - you'll receive trade alerts and can execute them yourself. For automatic copying (Premium), you'll need to securely connect your wallet."
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
