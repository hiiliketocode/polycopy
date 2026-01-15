import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Empty turbopack config to allow webpack config to be used
  turbopack: {},
  outputFileTracingIncludes: {
    '/api/cron/backfill-wallet-pnl': [
      './scripts/backfill-wallet-pnl.js',
      './node_modules/@supabase/**',
      './node_modules/ws/**'
    ]
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
