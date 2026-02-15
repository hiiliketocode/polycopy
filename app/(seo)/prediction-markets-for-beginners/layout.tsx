import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Prediction Markets for Beginners Guide | Polycopy',
  description: 'New to prediction markets? Learn how they work, how to get started, betting strategies for beginners, and common mistakes to avoid on Polymarket.',
  keywords: [
    'prediction markets for beginners',
    'how do prediction markets work',
    'polymarket beginner guide',
    'prediction market basics',
    'prediction market tutorial',
    'learn prediction markets',
    'polymarket for beginners',
    'prediction market trading',
    'what are prediction markets',
    'prediction market strategies',
  ],
  alternates: {
    canonical: 'https://polycopy.app/prediction-markets-for-beginners',
  },
  openGraph: {
    title: 'Prediction Markets for Beginners: Complete Guide 2026',
    description: 'New to prediction markets? Learn everything you need to know to start trading on Polymarket, from basic concepts to beginner strategies.',
    type: 'article',
    url: 'https://polycopy.app/prediction-markets-for-beginners',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Prediction Markets for Beginners: Complete Guide 2026',
    description: 'Master prediction market basics and start trading smarter on Polymarket',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
