import { ClobClient } from '@dschz/polymarket-clob-client';

// Initialize CLOB client for Polymarket API
export const clobClient = new ClobClient(
  'https://clob.polymarket.com',
  process.env.POLYMARKET_API_KEY,
  137 // Polygon chain ID
);
