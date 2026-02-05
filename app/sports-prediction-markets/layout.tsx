import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sports Prediction Markets: Top Traders & Betting Strategies 2026 | Polycopy',
  description: 'Trade sports prediction markets on Polymarket. Follow top sports traders, see NFL, NBA, soccer strategies, and copy profitable sports bets.',
  keywords: [
    'sports prediction markets',
    'polymarket sports',
    'sports betting prediction markets',
    'nfl prediction markets',
    'nba prediction markets',
    'soccer prediction markets',
    'sports traders polymarket',
    'sports betting strategies',
    'best sports traders',
    'polymarket sports betting',
  ],
  alternates: {
    canonical: 'https://polycopy.app/sports-prediction-markets',
  },
  openGraph: {
    title: 'Sports Prediction Markets: Top Traders & Strategies 2026',
    description: 'Follow the best sports traders on Polymarket. See their NFL, NBA, and soccer strategies in real-time.',
    type: 'website',
    url: 'https://polycopy.app/sports-prediction-markets',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sports Prediction Markets: Top Traders & Strategies 2026',
    description: 'Top sports traders and betting strategies on Polymarket',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
