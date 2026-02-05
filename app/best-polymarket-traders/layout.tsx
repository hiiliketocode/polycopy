import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Best Polymarket Traders: Top Performers & Leaderboard 2026 | Polycopy',
  description: 'Best Polymarket traders ranked by ROI, P&L, and win rate. Follow profitable traders, see their strategies, learn from top performers.',
  keywords: [
    'best polymarket traders',
    'top polymarket traders',
    'polymarket leaderboard',
    'profitable polymarket traders',
    'highest roi polymarket',
    'polymarket trader rankings',
    'successful prediction market traders',
    'polymarket profit leaders',
    'follow polymarket traders',
    'best prediction market traders',
  ],
  alternates: {
    canonical: 'https://polycopy.app/best-polymarket-traders',
  },
  openGraph: {
    title: 'Best Polymarket Traders: Top Performers & Leaderboard 2026',
    description: 'See who the most profitable Polymarket traders are. Real-time leaderboard with ROI, P&L, volume, and performance metrics.',
    type: 'website',
    url: 'https://polycopy.app/best-polymarket-traders',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Best Polymarket Traders: Top Performers & Leaderboard 2026',
    description: 'Real-time leaderboard of the most profitable Polymarket traders',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
