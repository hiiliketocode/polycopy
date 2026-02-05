import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'weather prediction markets | Polycopy',
  description: 'Trade prediction markets on Polymarket. Follow top traders and copy their strategies.',
  openGraph: {
    title: 'weather prediction markets',
    type: 'website',
    url: 'https://polycopy.app/weather-prediction-markets',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
