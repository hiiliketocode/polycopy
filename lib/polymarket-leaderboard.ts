/**
 * Shared utility for fetching Polymarket leaderboard data
 * Used by both /api/polymarket/leaderboard and /api/fire-feed
 */

export interface PolymarketLeaderboardEntry {
  rank: string;
  proxyWallet: string;
  userName: string;
  xUsername: string;
  verifiedBadge: boolean;
  vol: number;
  pnl: number;
  profileImage: string;
}

export interface TransformedTrader {
  wallet: string;
  displayName: string;
  pnl: number;
  winRate: number;
  totalTrades: number;
  volume: number;
  rank: number;
  followerCount: number;
  profileImage: string | null;
}

// Helper function to abbreviate wallet address
function abbreviateWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export async function fetchPolymarketLeaderboard(options: {
  timePeriod?: string;
  orderBy?: string;
  limit?: number;
  category?: string;
  offset?: number;
}): Promise<TransformedTrader[]> {
  const {
    timePeriod = 'month',
    orderBy = 'PNL',
    limit = 50,
    category = 'overall',
    offset = 0,
  } = options;

  // Validate parameters
  if (!['day', 'week', 'month', 'all'].includes(timePeriod)) {
    throw new Error('Invalid timePeriod. Must be: day, week, month, or all');
  }

  if (!['VOL', 'PNL'].includes(orderBy)) {
    throw new Error('Invalid orderBy. Must be: VOL or PNL');
  }

  if (limit < 1 || limit > 100) {
    throw new Error('Invalid limit. Must be between 1 and 100');
  }

  console.log('🏆 Fetching leaderboard:', { timePeriod, orderBy, limit, category, offset });

  // Create timeout promise (30 seconds — Polymarket API can be slow)
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('API request timeout')), 30000)
  );

  // Fetch leaderboard from Polymarket
  const leaderboardUrl = `https://data-api.polymarket.com/v1/leaderboard?timePeriod=${timePeriod}&orderBy=${orderBy}&limit=${limit}&offset=${offset}&category=${category}`;
  
  console.log('📡 Fetching from:', leaderboardUrl);

  const leaderboardPromise = fetch(leaderboardUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Polycopy/1.0)',
    },
    cache: 'no-store'
  });

  // Race between API call and timeout
  const response = await Promise.race([
    leaderboardPromise,
    timeoutPromise
  ]);

  if (!response.ok) {
    console.error('❌ Polymarket API error:', response.status);
    throw new Error(`Polymarket API returned ${response.status}`);
  }

  const data: PolymarketLeaderboardEntry[] = await response.json();
  console.log('✅ Leaderboard data fetched:', data?.length || 0, 'traders');

  // Check if data is an array
  if (!Array.isArray(data)) {
    console.error('❌ Unexpected response format:', typeof data);
    throw new Error('Unexpected API response format');
  }

  // Transform leaderboard data into our trader format
  const traders = data.map((trader: PolymarketLeaderboardEntry) => {
    const pnl = trader.pnl || 0;
    const volume = trader.vol || 0;
    
    return {
      wallet: trader.proxyWallet || '',
      displayName: trader.userName || abbreviateWallet(trader.proxyWallet || ''),
      pnl: Math.round(pnl * 100) / 100, // Round to 2 decimals
      winRate: 0, // Not calculated for leaderboard (too slow)
      totalTrades: 0, // Not available in leaderboard data
      volume: Math.round(volume * 100) / 100, // Round to 2 decimals
      rank: parseInt(trader.rank) || 0,
      followerCount: 0, // Will be fetched from our database in the future
      profileImage: trader.profileImage || null, // Polymarket profile picture URL
    };
  });

  console.log('✅ Transformed', traders.length, 'traders');
  return traders;
}
