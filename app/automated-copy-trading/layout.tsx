import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'One-Click Copy Trading on Polymarket | Polycopy Premium',
  description: 'Copy trades instantly with one-click execution. Polycopy Premium users can execute trades directly through the platform - no manual navigation to Polymarket required.',
  keywords: [
    'one-click copy trading',
    'polycopy premium',
    'instant trade execution',
    'quick copy polymarket',
    'fast trade copying',
    'polycopy execution',
    'premium copy trading',
    'polymarket instant execution',
    'copy trading speed',
    'trade execution platform',
  ],
  alternates: {
    canonical: 'https://polycopy.app/automated-copy-trading',
  },
  openGraph: {
    title: 'One-Click Copy Trading on Polymarket | Polycopy Premium',
    description: 'Execute trades instantly with one-click. Copy trades directly through Polycopy without manual navigation.',
    type: 'website',
    url: 'https://polycopy.app/automated-copy-trading',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'One-Click Copy Trading | Polycopy Premium',
    description: 'Execute trades instantly with one-click through Polycopy',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
