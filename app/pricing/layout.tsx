import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing: Free & Premium Plans | Polycopy",
  description: "Polycopy pricing: Free forever with unlimited follows. Premium ($20/mo) adds one-click execution and auto-close. No credit card required.",
  keywords: [
    'polycopy pricing',
    'polymarket copy trading cost',
    'polymarket copy trading pricing',
    'free copy trading polymarket',
    'polycopy cost',
    'polycopy free tier',
    'polycopy premium',
    'polymarket automation pricing',
    'copy trading subscription',
    'polymarket trading tool pricing',
  ],
  openGraph: {
    title: "Polycopy Pricing - Free Forever or $20/mo Premium",
    description: "Start free with unlimited trader follows and full feed access. Upgrade to Premium for one-click execution. No credit card required.",
    url: 'https://polycopy.app/pricing',
    siteName: 'Polycopy',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Polycopy Pricing - Free & Premium Plans'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Polycopy Pricing - Free Forever or Premium',
    description: 'Free tier: unlimited follows, full feed access. Premium: $20/mo for one-click execution & auto-close.',
    images: ['/og-image.png']
  },
  alternates: {
    canonical: 'https://polycopy.app/pricing'
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // FAQ Schema for pricing questions
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Is Polycopy really free?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes! The free tier is genuinely useful, not just a trial. You get unlimited trader follows, full access to your personalized feed, portfolio tracking, and manual trade copying. You can see everything top traders are doing and copy trades yourself on Polymarket."
        }
      },
      {
        "@type": "Question",
        "name": "What does Premium add for $20/month?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Premium adds speed and convenience: one-click trade execution through Polycopy (no manual copying on Polymarket), auto-close when the original trader exits, connected wallet integration, and priority support. The feed and curation features remain the same - Premium is about faster execution."
        }
      },
      {
        "@type": "Question",
        "name": "Can I try Premium before paying?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "You can start with the free tier and upgrade anytime. The free tier gives you full access to the feed and all traders, so you can experience the core value before deciding on Premium. Some users get promo codes - ask in Discord or contact support."
        }
      },
      {
        "@type": "Question",
        "name": "Do I need Premium to make money?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No. The free tier gives you everything you need to see what top traders are doing and copy their trades manually. Premium just makes execution faster and more convenient. Many successful users stay on free tier."
        }
      },
      {
        "@type": "Question",
        "name": "Can I cancel Premium anytime?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. Premium is a monthly subscription with no long-term commitment. Cancel anytime and you'll retain access until the end of your billing period, then automatically revert to the free tier."
        }
      },
      {
        "@type": "Question",
        "name": "Is there a transaction fee or commission?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No. Polycopy charges no transaction fees or commissions. You only pay the subscription ($0 for free tier, $20/mo for Premium). Trading fees on Polymarket itself still apply, but Polycopy doesn't add anything on top."
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
        "name": "Pricing",
        "item": "https://polycopy.app/pricing"
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
