import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pop Culture Prediction Markets: Oscars, Grammys & Entertainment Trading 2026 | Polycopy',
  description: 'Trade pop culture markets on Polymarket. Follow entertainment experts profiting from Oscars, Grammys, box office, celebrity events. Copy strategies.',
  keywords: ['pop culture prediction markets', 'oscars markets', 'grammys markets', 'entertainment trading', 'celebrity markets', 'pop culture traders', 'polymarket entertainment'],
  alternates: {
    canonical: 'https://polycopy.app/pop-culture-prediction-markets',
  },
  openGraph: {
    title: 'Pop Culture Prediction Markets: Oscars, Grammys & Entertainment Trading 2026',
    description: 'Follow top pop culture traders on Polymarket and copy their strategies.',
    type: 'website',
    url: 'https://polycopy.app/pop-culture-prediction-markets',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pop Culture Prediction Markets | Polycopy',
    description: 'Trade Oscars, Grammys, and entertainment markets',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
