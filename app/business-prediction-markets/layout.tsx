import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Business & Finance Markets | IPOs & M&A | Polycopy',
  description: 'Trade business and finance markets on Polymarket. Follow expert traders profiting from IPOs, mergers, CEO changes, earnings. Copy winning strategies.',
  keywords: ['business prediction markets', 'finance prediction markets', 'IPO trading', 'merger arbitrage', 'corporate events', 'Polymarket business', 'copy trading business', 'follow business traders'],
  alternates: {
    canonical: 'https://polycopy.app/business-prediction-markets',
  },
  openGraph: {
    title: 'Business & Finance Prediction Markets | Polycopy',
    description: 'Trade business and finance prediction markets. Follow expert traders and copy their strategies.',
    type: 'website',
    url: 'https://polycopy.app/business-prediction-markets',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Business & Finance Prediction Markets | Polycopy',
    description: 'Trade business and finance prediction markets. Follow expert traders and copy their strategies.',
  }
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
