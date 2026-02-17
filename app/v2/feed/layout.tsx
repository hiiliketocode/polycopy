import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Trading Feed | Polycopy",
  description: "Follow top Polymarket traders and see their latest trades in real-time. Your personalized feed of prediction market opportunities from traders you trust.",
  alternates: {
    canonical: 'https://polycopy.app/feed'
  },
  openGraph: {
    title: "Your Trading Feed | Polycopy",
    description: "Follow top traders and see their moves in real-time.",
    url: 'https://polycopy.app/feed',
    siteName: 'Polycopy',
    type: 'website',
  },
  robots: {
    index: false, // Authenticated page
    follow: true,
  }
};

export default function V2FeedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
