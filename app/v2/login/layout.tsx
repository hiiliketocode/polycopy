import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login | Polycopy",
  description: "Sign in to Polycopy to follow top Polymarket traders, access your trading feed, and copy profitable prediction market strategies.",
  alternates: {
    canonical: 'https://polycopy.app/login'
  },
  robots: {
    index: false, // Auth page
    follow: true,
  }
};

export default function V2LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
