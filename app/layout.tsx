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
  title: "Polycopy - Follow Polymarket Traders",
  description: "Track and follow the best Polymarket traders",
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
