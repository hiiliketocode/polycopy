// lib/polymarket-api.ts
// Helper functions for fetching data from Polymarket APIs
// Uses the same API as the discover page for consistency

const CACHE_DURATION = 20 * 60 * 1000; // 20 minutes (extended for admin dashboard)
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
      
      // Try multiple fields for trade count
      const marketsTraded = trader.marketsTraded || trader.markets_traded || trader.totalTrades || 0;
      
      return {
        wallet: trader.proxyWallet || '',
        displayName: trader.userName || abbreviateWallet(trader.proxyWallet || ''),
        pnl: Math.round(pnl * 100) / 100,
        volume: Math.round(volume * 100) / 100,
        rank: parseInt(trader.rank) || 0,
        roi: Math.round(roi * 100) / 100,
        marketsTraded: marketsTraded
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

// Fetch actual trade count and username for a trader
export async function fetchTraderTradeCount(wallet: string): Promise<{ count: number; username?: string }> {
  try {
    // Fetch up to 50 trades (optimized for speed while maintaining accuracy)
    const response = await fetch(
      `https://data-api.polymarket.com/trades?limit=50&user=${wallet.toLowerCase()}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Polycopy/1.0)' },
        cache: 'no-store',
        signal: AbortSignal.timeout(6000) // Reduced timeout for faster failures
      }
    );
    
    if (!response.ok) return { count: 0 };
    
    const trades = await response.json();
    
    if (!Array.isArray(trades)) return { count: 0 };
    
    // Get username from first trade if available
    const username = trades.length > 0 ? trades[0].name || trades[0].userName : undefined;
    
    // Return actual trade count (50+ if we got 50 trades, likely has more)
    return { 
      count: trades.length,
      username: username || undefined
    };
  } catch (error) {
    console.error(`Error fetching trade data for ${wallet}:`, error);
    return { count: 0 };
  }
}

// Enrich traders with actual trade counts and usernames
export async function enrichTradersWithTradeCounts(traders: LeaderboardTrader[]): Promise<LeaderboardTrader[]> {
  // Check cache first
  const cacheKey = `enriched_traders_${traders.map(t => t.wallet).join(',')}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log('📦 Using cached enriched trader data');
    return cached;
  }
  
  console.log('🔄 Enriching traders with actual trade counts and usernames...');
  const startTime = Date.now();
  
  // Fetch trade data in parallel (optimized batch size)
  const batchSize = 10; // Increased from 5
  const enrichedTraders = [...traders];
  
  for (let i = 0; i < enrichedTraders.length; i += batchSize) {
    const batch = enrichedTraders.slice(i, i + batchSize);
    
    const tradeData = await Promise.all(
      batch.map(trader => fetchTraderTradeCount(trader.wallet))
    );
    
    tradeData.forEach((data, index) => {
      const traderIndex = i + index;
      if (data.count > 0) {
        enrichedTraders[traderIndex].marketsTraded = data.count;
      }
      // Update username if we got one from trades API and current name is abbreviated
      if (data.username && (
        enrichedTraders[traderIndex].displayName.includes('...') ||
        enrichedTraders[traderIndex].displayName === abbreviateWallet(enrichedTraders[traderIndex].wallet)
      )) {
        enrichedTraders[traderIndex].displayName = data.username;
      }
    });
    
    // Reduced delay for faster processing
    if (i + batchSize < enrichedTraders.length) {
      await new Promise(resolve => setTimeout(resolve, 100)); // Reduced from 200ms
    }
  }
  
  const successCount = enrichedTraders.filter(t => t.marketsTraded > 0).length;
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ Enriched ${successCount}/${enrichedTraders.length} traders in ${duration}s`);
  
  // Cache the enriched results
  setCache(cacheKey, enrichedTraders);
  
  return enrichedTraders;
}
