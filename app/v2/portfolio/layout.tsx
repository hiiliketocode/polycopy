import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Portfolio | Polycopy",
  description: "Track your Polymarket portfolio performance. View open positions, order history, total P&L, and win rate across all copied trades.",
  alternates: {
    canonical: 'https://polycopy.app/portfolio'
  },
  openGraph: {
    title: "Your Portfolio | Polycopy",
    description: "Track your Polymarket portfolio and copied trade performance.",
    url: 'https://polycopy.app/portfolio',
    siteName: 'Polycopy',
    type: 'website',
  },
  robots: {
    index: false, // Authenticated page
    follow: true,
  }
};

export default function V2PortfolioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
