import { ClobClient } from '@dschz/polymarket-clob-client';

// Initialize CLOB client for Polymarket API
// For read-only operations (leaderboards, market data), no authentication needed
// Uses default: host='https://clob.polymarket.com', chainId=137 (Polygon)
export const clobClient = new ClobClient();
