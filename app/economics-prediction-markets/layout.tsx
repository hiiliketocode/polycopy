import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Economics Markets | Fed, Inflation, GDP | Polycopy',
  description: 'Trade economics markets on Polymarket. Follow top macro traders profiting from Fed decisions, CPI, unemployment, GDP, recession markets. Copy strategies.',
  keywords: ['economics prediction markets', 'macro trading', 'fed prediction markets', 'inflation trading', 'GDP markets', 'economics traders', 'polymarket economics'],
  alternates: {
    canonical: 'https://polycopy.app/economics-prediction-markets',
  },
  openGraph: {
    title: 'Economics Prediction Markets: Fed, Inflation, GDP Trading 2026',
    description: 'Follow top macro traders on Polymarket and copy their economics strategies.',
    type: 'website',
    url: 'https://polycopy.app/economics-prediction-markets',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Economics Prediction Markets | Polycopy',
    description: 'Trade Fed decisions, inflation, GDP, and macro markets',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
