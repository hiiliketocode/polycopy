import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'economics prediction markets | Polycopy',
  description: 'Trade prediction markets on Polymarket. Follow top traders and copy their strategies.',
  openGraph: {
    title: 'economics prediction markets',
    type: 'website',
    url: 'https://polycopy.app/economics-prediction-markets',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
