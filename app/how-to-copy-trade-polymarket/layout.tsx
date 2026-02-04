import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How to Copy Trade on Polymarket - Complete Guide | Polycopy",
  description: "Learn how to copy trade on Polymarket step-by-step. Find top traders, set up your feed, manage positions, and execute trades. Beginner-friendly guide with expert tips.",
  keywords: [
    'how to copy trade polymarket',
    'polymarket copy trading guide',
    'copy trading polymarket tutorial',
    'polymarket copy trading setup',
    'how to follow polymarket traders',
    'polymarket trading guide',
    'copy trading for beginners',
    'polymarket automation',
    'how to use polycopy',
    'polymarket copy trading tips',
  ],
  openGraph: {
    title: "How to Copy Trade on Polymarket - Step-by-Step Guide | Polycopy",
    description: "Complete guide to copy trading on Polymarket. Find traders, set up your feed, and start copying trades with Polycopy.",
    url: 'https://polycopy.app/how-to-copy-trade-polymarket',
    siteName: 'Polycopy',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'How to Copy Trade on Polymarket - Complete Guide'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'How to Copy Trade on Polymarket - Complete Guide',
    description: 'Step-by-step guide to copy trading on Polymarket using Polycopy. From finding traders to executing your first trade.',
    images: ['/og-image.png']
  },
  alternates: {
    canonical: 'https://polycopy.app/how-to-copy-trade-polymarket'
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function HowToCopyTradeLayout({
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
        "name": "Is copy trading on Polymarket legal?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes, copy trading on Polymarket is legal. You're making your own trading decisions based on information from other traders. Polycopy shows you what others are doing, but you decide what to copy. You maintain full control of your funds at all times."
        }
      },
      {
        "@type": "Question",
        "name": "Do I need a connected wallet to copy trade?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No. On the free tier, you can see all trades and copy them manually on Polymarket. For one-click execution with auto-close (Premium), you'll need to connect your wallet. Start free to learn the system before connecting anything."
        }
      },
      {
        "@type": "Question",
        "name": "How much money do I need to start?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "You can start with any amount on Polymarket (even $10-20 to test). Most traders recommend starting small to learn the system. Once comfortable, many users trade with $100-500. The platform works the same regardless of your bankroll size."
        }
      },
      {
        "@type": "Question",
        "name": "Can I lose more than I invest?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No. On Polymarket, you can only lose what you put into each trade. There's no margin or leverage, so your maximum loss per trade is the amount you invested. You can't go into debt or lose more than your position size."
        }
      },
      {
        "@type": "Question",
        "name": "How do I know which traders to follow?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Start by filtering traders by category (sports, politics, crypto) that match your interests. Look for consistent positive ROI over time, not just one big win. Check their trading history and volume. Follow 3-5 traders initially and observe their patterns before expanding."
        }
      },
      {
        "@type": "Question",
        "name": "Should I copy every trade from my followed traders?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No. Even the best traders make moves you won't understand or be comfortable with. Polycopy shows you a curated feed where you pick and choose. Copy trades that align with your thesis and risk tolerance. Curation over automation."
        }
      }
    ]
  };

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": "How to Copy Trade on Polymarket",
    "description": "Step-by-step guide to copy trading on Polymarket using Polycopy",
    "step": [
      {
        "@type": "HowToStep",
        "name": "Sign Up for Polycopy",
        "text": "Create a free account on Polycopy. No credit card required.",
        "position": 1
      },
      {
        "@type": "HowToStep",
        "name": "Find Top Traders",
        "text": "Browse 500K+ traders and filter by ROI, win rate, category, and trading history.",
        "position": 2
      },
      {
        "@type": "HowToStep",
        "name": "Follow Traders You Trust",
        "text": "Click follow on 3-5 traders that match your interests and strategy.",
        "position": 3
      },
      {
        "@type": "HowToStep",
        "name": "Watch Your Feed",
        "text": "See their trades appear in your personalized feed in real-time.",
        "position": 4
      },
      {
        "@type": "HowToStep",
        "name": "Pick Trades to Copy",
        "text": "Review each trade and decide which ones align with your thesis.",
        "position": 5
      },
      {
        "@type": "HowToStep",
        "name": "Execute the Trade",
        "text": "Copy manually on Polymarket (free) or with one-click through Polycopy (Premium).",
        "position": 6
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
        "name": "How to Copy Trade Polymarket",
        "item": "https://polycopy.app/how-to-copy-trade-polymarket"
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      {children}
    </>
  );
}
