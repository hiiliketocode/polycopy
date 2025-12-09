import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import "./styles/design-system.css";
import BottomNav from "./components/BottomNav";

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover', // Required for safe-area-inset to work on iPhones
};

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
      <head>
        {/* Google Tag Manager */}
        <Script id="google-tag-manager" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-WBP9V9WH');`}
        </Script>
      </head>
      <body
        className={`${inter.variable} font-sans antialiased bg-slate-50 relative`}
        style={{ minHeight: '100vh', overflowX: 'hidden' }}
      >
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe 
            src="https://www.googletagmanager.com/ns.html?id=GTM-WBP9V9WH"
            height="0" 
            width="0" 
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        {/* End Google Tag Manager (noscript) */}
        
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
