import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'pop culture prediction markets | Polycopy',
  description: 'Trade prediction markets on Polymarket. Follow top traders and copy their strategies.',
  openGraph: {
    title: 'pop culture prediction markets',
    type: 'website',
    url: 'https://polycopy.app/pop-culture-prediction-markets',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
