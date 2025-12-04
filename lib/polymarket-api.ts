// lib/polymarket-api.ts
// Helper functions for fetching data from Polymarket APIs

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

// Types for Polymarket API responses
export interface PolymarketTrader {
  address: string;
  username?: string;
  totalProfitLoss?: number;
  volume?: number;
  roi?: number;
  marketsTraded?: number;
  profit?: number;
  profitPercent?: number;
}

export interface PolymarketTrade {
  id: string;
  user?: string;
  market?: string;
  outcome?: string;
  size?: number;
  price?: number;
  timestamp?: number;
  asset_ticker?: string;
  maker_address?: string;
  taker_address?: string;
  side?: string;
}

export interface PolymarketMarket {
  id: string;
  question?: string;
  title?: string;
  volume24hr?: string;
  volume?: string;
  tags?: string[];
  outcomes?: string[];
  active?: boolean;
  closed?: boolean;
  condition_id?: string;
  slug?: string;
}

// Fetch top traders from Polymarket leaderboard
export async function getTopTraders(limit: number = 30): Promise<PolymarketTrader[]> {
  const cacheKey = `leaderboard_${limit}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(
      `https://data-api.polymarket.com/leaderboard?limit=${limit}`,
      { 
        next: { revalidate: 600 },
        headers: {
          'Accept': 'application/json',
        }
      }
    );
    
    if (!response.ok) {
      console.error(`Leaderboard API returned ${response.status}`);
      throw new Error('Leaderboard API failed');
    }
    
    const data = await response.json();
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }
}

// Fetch recent trades across platform
export async function getRecentTrades(limit: number = 50): Promise<PolymarketTrade[]> {
  const cacheKey = `trades_${limit}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(
      `https://data-api.polymarket.com/trades?limit=${limit}`,
      { 
        next: { revalidate: 600 },
        headers: {
          'Accept': 'application/json',
        }
      }
    );
    
    if (!response.ok) {
      console.error(`Trades API returned ${response.status}`);
      throw new Error('Trades API failed');
    }
    
    const data = await response.json();
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error('Error fetching trades:', error);
    return [];
  }
}

// Fetch markets sorted by volume
export async function getMarketsByVolume(limit: number = 50): Promise<PolymarketMarket[]> {
  const cacheKey = `markets_volume_${limit}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(
      `https://gamma-api.polymarket.com/markets?limit=${limit}&order=volume24hr&ascending=false&active=true`,
      { 
        next: { revalidate: 600 },
        headers: {
          'Accept': 'application/json',
        }
      }
    );
    
    if (!response.ok) {
      console.error(`Markets API returned ${response.status}`);
      throw new Error('Markets API failed');
    }
    
    const data = await response.json();
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error('Error fetching markets:', error);
    return [];
  }
}

// Fetch all active markets for category analysis
export async function getAllMarkets(limit: number = 200): Promise<PolymarketMarket[]> {
  const cacheKey = `markets_all_${limit}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(
      `https://gamma-api.polymarket.com/markets?limit=${limit}&active=true`,
      { 
        next: { revalidate: 600 },
        headers: {
          'Accept': 'application/json',
        }
      }
    );
    
    if (!response.ok) {
      console.error(`All Markets API returned ${response.status}`);
      throw new Error('Markets API failed');
    }
    
    const data = await response.json();
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error('Error fetching all markets:', error);
    return [];
  }
}

// Helper: Categorize a market by its title/tags
export function categorizeMarket(title: string, tags?: string[]): string {
  const titleLower = (title || '').toLowerCase();
  
  // Check tags first if available
  if (tags && tags.length > 0) {
    const tagLower = tags[0].toLowerCase();
    if (tagLower.includes('crypto')) return 'Crypto';
    if (tagLower.includes('politics') || tagLower.includes('election')) return 'Politics';
    if (tagLower.includes('sport')) return 'Sports';
    if (tagLower.includes('pop culture') || tagLower.includes('entertainment')) return 'Pop Culture';
    if (tagLower.includes('business')) return 'Business';
    if (tagLower.includes('science')) return 'Science';
    if (tagLower.includes('ai') || tagLower.includes('tech')) return 'AI & Tech';
    if (tagLower.includes('finance')) return 'Finance';
  }
  
  // Fallback to title matching
  if (titleLower.includes('bitcoin') || titleLower.includes('btc') || 
      titleLower.includes('crypto') || titleLower.includes('ethereum') || 
      titleLower.includes('eth') || titleLower.includes('solana')) return 'Crypto';
      
  if (titleLower.includes('election') || titleLower.includes('president') || 
      titleLower.includes('vote') || titleLower.includes('congress') || 
      titleLower.includes('senate') || titleLower.includes('trump') ||
      titleLower.includes('biden') || titleLower.includes('republican') ||
      titleLower.includes('democrat')) return 'Politics';
      
  if (titleLower.includes('sport') || titleLower.includes(' vs ') || 
      titleLower.includes('nba') || titleLower.includes('nfl') || 
      titleLower.includes('soccer') || titleLower.includes('championship') ||
      titleLower.includes('super bowl') || titleLower.includes('game')) return 'Sports';
      
  if (titleLower.includes('stock') || titleLower.includes('msft') || 
      titleLower.includes('tsla') || titleLower.includes('aapl') ||
      titleLower.includes('s&p') || titleLower.includes('spy') ||
      titleLower.includes('nasdaq') || titleLower.includes('dow')) return 'Finance';
      
  if (titleLower.includes('ai') || titleLower.includes('openai') || 
      titleLower.includes('tech') || titleLower.includes('google') ||
      titleLower.includes('microsoft') || titleLower.includes('apple') ||
      titleLower.includes('gpt') || titleLower.includes('chatgpt')) return 'AI & Tech';
      
  if (titleLower.includes('temperature') || titleLower.includes('weather') ||
      titleLower.includes('°f') || titleLower.includes('°c')) return 'Weather';
  
  return 'Other';
}

// Get category breakdown from markets
export function getCategoryBreakdown(markets: PolymarketMarket[]): Array<{
  category: string;
  count: number;
  volume: number;
}> {
  const categories = new Map<string, { count: number; volume: number }>();
  
  markets.forEach(market => {
    const category = categorizeMarket(market.question || market.title || '', market.tags);
    const existing = categories.get(category) || { count: 0, volume: 0 };
    categories.set(category, {
      count: existing.count + 1,
      volume: existing.volume + (parseFloat(market.volume24hr || market.volume || '0') || 0)
    });
  });
  
  return Array.from(categories.entries())
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.count - a.count);
}

// Format wallet address for display
export function formatWalletAddress(address: string): string {
  if (!address) return 'Anonymous';
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Format currency
export function formatCurrency(value: number | string | undefined): string {
  if (value === undefined || value === null) return '$0';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '$0';
  
  if (Math.abs(num) >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(num) >= 1_000) {
    return `$${(num / 1_000).toFixed(1)}K`;
  }
  return `$${num.toFixed(2)}`;
}

// Format percentage
export function formatPercent(value: number | undefined): string {
  if (value === undefined || value === null) return '--';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

