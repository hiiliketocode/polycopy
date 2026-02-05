import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Politics Prediction Markets | Elections | Polycopy',
  description: 'Trade political prediction markets on Polymarket. Follow top politics traders, election forecasts, copy profitable political strategies.',
  keywords: [
    'politics prediction markets',
    'polymarket politics',
    'election prediction markets',
    'political betting',
    'election forecasting',
    'politics traders polymarket',
    'presidential election markets',
    'political event trading',
    'election odds',
    'polymarket elections',
  ],
  alternates: {
    canonical: 'https://polycopy.app/politics-prediction-markets',
  },
  openGraph: {
    title: 'Politics Prediction Markets: Elections & Trading Strategies 2026',
    description: 'Follow the best politics traders on Polymarket. Trade elections, policy outcomes, and political events.',
    type: 'website',
    url: 'https://polycopy.app/politics-prediction-markets',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Politics Prediction Markets: Elections & Trading 2026',
    description: 'Top politics traders and election strategies on Polymarket',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
