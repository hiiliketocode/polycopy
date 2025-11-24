import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./styles/design-system.css";
import BottomNav from "./components/BottomNav";

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Polycopy - Copy Trades from Top Polymarket Traders',
  description: 'Discover and copy trades from the best prediction market traders on Polymarket. Follow top performers and replicate their strategies.',
  metadataBase: new URL('https://polycopy.app'),
  openGraph: {
    title: 'Polycopy - Copy Trades from Top Polymarket Traders',
    description: 'Discover and copy trades from the best prediction market traders on Polymarket. Follow top performers and replicate their strategies.',
    url: 'https://polycopy.app',
    siteName: 'Polycopy',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Polycopy - Copy Trading Platform',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Polycopy - Copy Trades from Top Polymarket Traders',
    description: 'Discover and copy trades from the best prediction market traders on Polymarket.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} font-sans antialiased bg-slate-50`}
      >
        <div className="pb-20 md:pb-0">
          {children}
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
