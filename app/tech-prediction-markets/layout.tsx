import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tech Prediction Markets | AI & Product Launches | Polycopy',
  description: 'Trade tech markets on Polymarket. Follow tech experts profiting from AI releases, Apple launches, Big Tech earnings, Silicon Valley events. Copy strategies.',
  keywords: ['tech prediction markets', 'AI prediction markets', 'tech trading', 'silicon valley markets', 'AI releases', 'tech traders', 'polymarket tech'],
  alternates: {
    canonical: 'https://polycopy.app/tech-prediction-markets',
  },
  openGraph: {
    title: 'Tech Prediction Markets: AI, Product Launches & Tech Trading 2026',
    description: 'Follow top tech traders on Polymarket and copy their strategies.',
    type: 'website',
    url: 'https://polycopy.app/tech-prediction-markets',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tech Prediction Markets | Polycopy',
    description: 'Trade AI releases, product launches, and tech markets',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
