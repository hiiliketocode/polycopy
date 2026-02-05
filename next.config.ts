import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Empty turbopack config to allow webpack config to be used
  turbopack: {},
  outputFileTracingIncludes: {
    '/api/cron/backfill-wallet-pnl': [
      './scripts/backfill-wallet-pnl.js',
      './node_modules/@supabase/**',
      './node_modules/tslib/**',
      './node_modules/ws/**'
    ]
  },
  
  // Image optimization for better Core Web Vitals
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
  },
  
  // Redirect trailing slashes to prevent duplicate content
  async redirects() {
    return [
      {
        source: '/:path+/',
        destination: '/:path+',
        permanent: true,
      },
      // Fix malformed URL
      {
        source: '/$',
        destination: '/',
        permanent: true,
      },
      // SEO-friendly redirects for high-volume keywords
      {
        source: '/polymarket-leaderboard',
        destination: '/top-traders',
        permanent: true,
      },
      {
        source: '/polymarket-betting',
        destination: '/polymarket-trading-strategies',
        permanent: true,
      },
      {
        source: '/polymarket-betting-strategies',
        destination: '/polymarket-trading-strategies',
        permanent: true,
      },
    ];
  },
  
  webpack: (config) => {
    // Add fallbacks for Node.js modules that crypto libraries need
    config.resolve.fallback = { 
      fs: false, 
      net: false, 
      tls: false,
      crypto: false,
      stream: false,
      url: false,
      zlib: false,
      http: false,
      https: false,
      assert: false,
      os: false,
      path: false,
    };
    
    // Externalize packages that don't work in browser
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    
    return config;
  },
};

export default nextConfig;
