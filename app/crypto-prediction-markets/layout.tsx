import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crypto Prediction Markets: Bitcoin, ETH & Altcoin Trading 2026 | Polycopy',
  description: 'Trade crypto prediction markets on Polymarket. Follow top crypto traders, see Bitcoin, Ethereum, and altcoin strategies in real-time.',
  keywords: ['crypto prediction markets', 'polymarket crypto', 'bitcoin prediction markets', 'ethereum prediction markets', 'crypto traders polymarket', 'cryptocurrency betting', 'crypto price predictions', 'altcoin markets'],
  openGraph: {
    title: 'Crypto Prediction Markets: Bitcoin, ETH & Altcoin Trading 2026',
    description: 'Follow top crypto traders on Polymarket and copy their strategies.',
    type: 'website',
    url: 'https://polycopy.app/crypto-prediction-markets',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
