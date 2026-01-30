import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Polycopy",
  description: "Polycopy's Privacy Policy. Learn how we collect, use, and protect your personal data on our Polymarket copy trading platform. Your privacy is our priority.",
  alternates: {
    canonical: 'https://polycopy.app/privacy'
  },
  openGraph: {
    title: "Privacy Policy | Polycopy",
    description: "Learn how Polycopy protects your privacy and personal data.",
    url: 'https://polycopy.app/privacy',
    siteName: 'Polycopy',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  }
};

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
