// lib/polymarket-api.ts
// Helper functions for fetching data from Polymarket APIs
// Uses the same API as the discover page for consistency

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, { data: any; timestamp: number }>();

function getCached(key: string) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() });
}

// Types for trader data
export interface LeaderboardTrader {
  wallet: string;
  displayName: string;
  pnl: number;
  volume: number;
  rank: number;
  roi: number; // Calculated as (pnl / volume) * 100
  marketsTraded: number;
}

// Category mapping (same as discover page)
export const CATEGORY_MAP: Record<string, string> = {
  'All': 'overall',
  'Politics': 'politics',
  'Sports': 'sports',
  'Crypto': 'crypto',
  'Pop Culture': 'culture',
  'Business': 'finance',
  'Economics': 'economics',
  'Tech': 'tech',
  'Weather': 'weather'
};

export const CATEGORIES = ['All', 'Politics', 'Sports', 'Crypto', 'Pop Culture', 'Business', 'Economics', 'Tech', 'Weather'];

// Fetch leaderboard from Polymarket API (same as discover page uses)
// This is for server-side use - directly calls Polymarket API
export async function fetchLeaderboard(options: {
  limit?: number;
  orderBy?: 'PNL' | 'VOL';
  category?: string;
  timePeriod?: 'day' | 'week' | 'month' | 'all';
}): Promise<LeaderboardTrader[]> {
  const {
    limit = 50,
    orderBy = 'PNL',
    category = 'overall',
    timePeriod = 'month'
  } = options;

  const cacheKey = `leaderboard_${category}_${orderBy}_${limit}_${timePeriod}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`📦 Cache hit for ${cacheKey}`);
    return cached;
  }

  try {
    const url = `https://data-api.polymarket.com/v1/leaderboard?timePeriod=${timePeriod}&orderBy=${orderBy}&limit=${limit}&offset=0&category=${category}`;
    
    console.log(`📡 Fetching leaderboard: ${category} (${orderBy})`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Polycopy/1.0)',
      },
      cache: 'no-store',
      // 10 second timeout
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      console.error(`❌ Polymarket API error: ${response.status}`);
      throw new Error(`Polymarket API returned ${response.status}`);
    }

    const data = await response.json();
    
    if (!Array.isArray(data)) {
      console.error('❌ Unexpected response format:', typeof data);
      return [];
    }

    console.log(`✅ Fetched ${data.length} traders for ${category}`);

    // Transform to our format with ROI calculation
    const traders: LeaderboardTrader[] = data.map((trader: any) => {
      const pnl = trader.pnl || 0;
      const volume = trader.vol || 0;
      const roi = volume > 0 ? (pnl / volume) * 100 : 0;
      
      return {
        wallet: trader.proxyWallet || '',
        displayName: trader.userName || abbreviateWallet(trader.proxyWallet || ''),
        pnl: Math.round(pnl * 100) / 100,
        volume: Math.round(volume * 100) / 100,
        rank: parseInt(trader.rank) || 0,
        roi: Math.round(roi * 100) / 100,
        marketsTraded: trader.marketsTraded || 0 // May not always be available
      };
    });

    setCache(cacheKey, traders);
    return traders;
  } catch (error: any) {
    console.error(`❌ Error fetching ${category} leaderboard:`, error.message);
    return [];
  }
}

// Fetch all category leaderboards in parallel
export async function fetchAllCategoryLeaderboards(limit: number = 10): Promise<Record<string, LeaderboardTrader[]>> {
  const cacheKey = `all_categories_${limit}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log('📦 Cache hit for all category leaderboards');
    return cached;
  }

  const categories = ['politics', 'sports', 'crypto', 'finance', 'tech', 'weather'];
  
  console.log('🔄 Fetching all category leaderboards in parallel...');
  
  const results = await Promise.allSettled(
    categories.map(category => fetchLeaderboard({ limit, category, orderBy: 'PNL' }))
  );

  const leaderboards: Record<string, LeaderboardTrader[]> = {};
  
  categories.forEach((category, index) => {
    const result = results[index];
    if (result.status === 'fulfilled' && result.value.length > 0) {
      // Sort by ROI for category leaderboards
      const sortedByROI = [...result.value].sort((a, b) => b.roi - a.roi);
      leaderboards[category] = sortedByROI;
    }
  });

  setCache(cacheKey, leaderboards);
  console.log(`✅ Fetched ${Object.keys(leaderboards).length} category leaderboards`);
  
  return leaderboards;
}

// Helper function to abbreviate wallet address
function abbreviateWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Format currency values
export function formatCurrency(value: number): string {
  if (value === 0) return '$0';
  
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  
  let formatted: string;
  if (absValue >= 1_000_000) {
    formatted = `$${(absValue / 1_000_000).toFixed(2)}M`;
  } else if (absValue >= 1_000) {
    formatted = `$${(absValue / 1_000).toFixed(1)}K`;
  } else {
    formatted = `$${absValue.toFixed(0)}`;
  }
  
  return isNegative ? `-${formatted}` : formatted;
}

// Format percentage
export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

// Format wallet for display
export function formatWallet(address: string): string {
  if (!address || address.length < 10) return address || 'Unknown';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Get display name for category
export function getCategoryDisplayName(apiCategory: string): string {
  for (const [display, api] of Object.entries(CATEGORY_MAP)) {
    if (api === apiCategory) return display;
  }
  return apiCategory.charAt(0).toUpperCase() + apiCategory.slice(1);
}
