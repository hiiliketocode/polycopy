import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Best Polymarket Traders - Top Prediction Market Performers | Polycopy",
  description: "Best Polymarket traders ranked by ROI, win rate, and P&L. Browse 500K+ traders, filter by category, follow top performers in prediction markets.",
  keywords: [
    'best polymarket traders',
    'top polymarket traders',
    'polymarket leaderboard',
    'prediction market traders',
    'top prediction market performers',
    'polymarket rankings',
    'best prediction market traders',
    'polymarket top earners',
    'successful polymarket traders',
    'polymarket trader rankings',
    'who to follow polymarket',
    'polymarket trader stats',
  ],
  openGraph: {
    title: "Best Polymarket Traders - Top Performers & Leaderboard | Polycopy",
    description: "Browse the top Polymarket traders ranked by ROI, P&L, and win rate. Filter by category, follow the best, and see what they're trading in real-time.",
    url: 'https://polycopy.app/top-traders',
    siteName: 'Polycopy',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Polycopy - Best Polymarket Traders & Leaderboard'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Best Polymarket Traders - Top Performers & Stats',
    description: 'Discover top Polymarket traders ranked by ROI, P&L, and win rate. Follow the best and see their trades in real-time.',
    images: ['/og-image.png']
  },
  alternates: {
    canonical: 'https://polycopy.app/top-traders'
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function TopTradersLayout({
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
        "name": "How do you rank the best Polymarket traders?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "We rank traders by multiple metrics: ROI (return on investment), total P&L (profit and loss), win rate, trading volume, and category-specific performance. You can filter and sort by any of these metrics to find traders that match your strategy and interests."
        }
      },
      {
        "@type": "Question",
        "name": "What makes a top Polymarket trader?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Top traders consistently demonstrate: positive ROI over time, strong win rates (typically 60%+), significant trading volume showing experience, category expertise in specific markets (sports, politics, crypto, etc.), and sustainable performance across multiple market types."
        }
      },
      {
        "@type": "Question",
        "name": "Can I follow top Polymarket traders for free?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes! Polycopy's free tier lets you follow unlimited traders, see their trades in a real-time feed, and manually copy any trades you want. You get full access to trader stats, performance history, and market activity without any payment required."
        }
      },
      {
        "@type": "Question",
        "name": "How do I choose which traders to follow?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Start by filtering traders by category (sports, politics, crypto) that match your interests. Look for consistent ROI over time, not just high one-time gains. Check their trading history and volume to ensure experience. Follow 3-5 traders initially and observe their decision patterns before expanding."
        }
      },
      {
        "@type": "Question",
        "name": "Do top traders always win?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No. Even the best traders have losing trades and bad weeks. That's why Polycopy gives you a curated feed where you pick and choose - not blind automation. Top traders have edge over time, but individual trades can still lose. You maintain judgment on every trade you copy."
        }
      },
      {
        "@type": "Question",
        "name": "How often is the leaderboard updated?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Trader stats and rankings update in real-time as trades are executed on Polymarket. You'll see new trades in your feed within seconds, and performance metrics (ROI, P&L, win rate) reflect the latest data from the blockchain."
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
        "name": "Top Traders",
        "item": "https://polycopy.app/top-traders"
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
