import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'tech prediction markets | Polycopy',
  description: 'Trade prediction markets on Polymarket. Follow top traders and copy their strategies.',
  openGraph: {
    title: 'tech prediction markets',
    type: 'website',
    url: 'https://polycopy.app/tech-prediction-markets',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
