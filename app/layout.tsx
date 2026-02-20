import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, DM_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import BottomNav from "./components/BottomNav";
import Footer from "./components/Footer";


// Polycopy 2.0 - Industrial Block Typography
const spaceGrotesk = Space_Grotesk({ 
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  preload: true,
});

const dmSans = DM_Sans({ 
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  preload: true,
});

// Keep Inter for backward compatibility
const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  preload: true,
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover', // Required for safe-area-inset to work on iPhones
};

export const metadata: Metadata = {
  title: {
    default: 'Polycopy — The Home for Copy Trading on Polymarket',
    template: '%s | Polycopy'
  },
  description: 'Institutional-grade copy trading for Polymarket. Follow top traders, automate strategies, and maximize your edge with AI-powered bots.',
  keywords: ['Polymarket', 'copy trading', 'prediction markets', 'crypto trading', 'trading signals', 'Polymarket traders', 'prediction trading', 'market forecasting', 'trading bots', 'automated trading'],
  authors: [{ name: 'Polycopy' }],
  creator: 'Polycopy',
  metadataBase: new URL('https://polycopy.app'),
  alternates: {
    canonical: 'https://polycopy.app'
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://polycopy.app',
    siteName: 'Polycopy',
    title: 'Polycopy — The Home for Copy Trading on Polymarket',
    description: 'Institutional-grade copy trading for Polymarket. Follow top traders, automate strategies, and maximize your edge.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Polycopy — The Home for Copy Trading on Polymarket'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Polycopy — The Home for Copy Trading on Polymarket',
    description: 'Institutional-grade copy trading for Polymarket.',
    site: '@polycopyapp',
    creator: '@polycopyapp',
    images: ['/og-image.png']
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon.png', type: 'image/png' }
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }]
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1
    }
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Polycopy",
    "url": "https://polycopy.app",
    "logo": "https://polycopy.app/logos/polycopy-logo-primary.png",
    "description": "Discover and copy top Polymarket traders. Track performance, follow winning strategies, and make smarter prediction market trades.",
    "sameAs": [
      "https://twitter.com/polycopyapp"
    ],
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "Customer Support",
      "url": "https://twitter.com/polycopyapp"
    }
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Polycopy",
    "url": "https://polycopy.app",
    "description": "Copy trading platform for Polymarket prediction markets",
    "potentialAction": {
      "@type": "SearchAction",
      "target": "https://polycopy.app/discover?search={search_term_string}",
      "query-input": "required name=search_term_string"
    }
  };

  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${dmSans.variable} ${inter.variable}`}>
      <head>
        {/* Resource Hints for Performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        
        {/* Structured Data - Organization */}
        <Script id="schema-organization" type="application/ld+json" strategy="beforeInteractive">
          {JSON.stringify(organizationSchema)}
        </Script>
        {/* Structured Data - Website */}
        <Script id="schema-website" type="application/ld+json" strategy="beforeInteractive">
          {JSON.stringify(websiteSchema)}
        </Script>
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
        className={`font-body antialiased bg-poly-cream relative flex flex-col`}
        style={{ minHeight: '100vh', overflowX: 'hidden' }}
      >
        {/* Suppress MetaMask extension errors - we don't use MetaMask */}
        <Script id="suppress-metamask-errors" strategy="beforeInteractive">
          {`
            if (typeof window !== 'undefined') {
              // Suppress MetaMask extension errors
              const originalError = window.console.error;
              window.console.error = function(...args) {
                const errorMessage = args.join(' ');
                // Filter out MetaMask connection errors
                if (errorMessage.includes('Failed to connect to MetaMask') || 
                    errorMessage.includes('MetaMask') && errorMessage.includes('connect')) {
                  return; // Suppress these errors
                }
                originalError.apply(console, args);
              };
              
              // Also catch unhandled promise rejections from MetaMask
              window.addEventListener('unhandledrejection', (event) => {
                const errorMessage = event.reason?.message || event.reason?.toString() || '';
                if (errorMessage.includes('MetaMask') || errorMessage.includes('ethereum')) {
                  event.preventDefault(); // Suppress the error
                  return;
                }
              });
            }
          `}
        </Script>
        
        {/* Skip to main content link for keyboard navigation */}
        <a 
          href="#main-content" 
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-polycopy-yellow focus:text-neutral-black focus:px-4 focus:py-2 focus:rounded-lg focus:font-semibold focus:shadow-lg"
        >
          Skip to main content
        </a>
        
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe 
            src="https://www.googletagmanager.com/ns.html?id=GTM-WBP9V9WH"
            height="0" 
            width="0" 
            style={{ display: 'none', visibility: 'hidden' }}
            title="Google Tag Manager"
          />
        </noscript>
        {/* End Google Tag Manager (noscript) */}
        
        <div id="main-content" className="flex-1 bottom-nav-offset">
          {children}
        </div>
        <Footer />
        <BottomNav />
      </body>
    </html>
  );
}
