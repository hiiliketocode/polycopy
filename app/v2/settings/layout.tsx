import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings | Polycopy",
  description: "Manage your Polycopy account settings, preferences, and subscription.",
  alternates: {
    canonical: 'https://polycopy.app/settings'
  },
  robots: {
    index: false, // Authenticated page
    follow: false,
  }
};

export default function V2SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
