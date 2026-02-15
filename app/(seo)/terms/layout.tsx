import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | Polycopy",
  description: "Read Polycopy's Terms of Service. Understand the terms and conditions for using our Polymarket copy trading platform, including free and premium features.",
  alternates: {
    canonical: 'https://polycopy.app/terms'
  },
  openGraph: {
    title: "Terms of Service | Polycopy",
    description: "Terms and conditions for using Polycopy's Polymarket copy trading platform.",
    url: 'https://polycopy.app/terms',
    siteName: 'Polycopy',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  }
};

export default function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
