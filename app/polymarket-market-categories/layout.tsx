import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Polymarket Market Categories: Complete Guide 2026 | Polycopy',
  description: 'Explore all Polymarket market categories: Sports, Politics, Crypto, Pop Culture, Business, Economics, Tech, and Weather. Find top traders in each category.',
  keywords: [
    'polymarket categories',
    'prediction market types',
    'polymarket market categories',
    'types of prediction markets',
    'polymarket sports',
    'polymarket politics',
    'polymarket crypto',
    'polymarket guide',
    'prediction market categories',
    'polymarket markets overview',
  ],
  openGraph: {
    title: 'Polymarket Market Categories: Complete Guide 2026',
    description: 'Explore every Polymarket category and find top traders in sports, politics, crypto, and more.',
    type: 'website',
    url: 'https://polycopy.app/polymarket-market-categories',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Polymarket Market Categories: Complete Guide 2026',
    description: 'Complete guide to all Polymarket prediction market categories',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
