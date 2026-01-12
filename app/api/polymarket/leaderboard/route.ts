import { NextResponse } from 'next/server'

// Polymarket leaderboard API response type
interface PolymarketLeaderboardEntry {
  rank: string;
  proxyWallet: string;
  userName: string;
  xUsername: string;
  verifiedBadge: boolean;
  vol: number;
  pnl: number;
  profileImage: string;
}

// Helper function to abbreviate wallet address
function abbreviateWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters with defaults
    const timePeriod = searchParams.get('timePeriod') || 'month';
    const orderBy = searchParams.get('orderBy') || 'PNL';
    const limit = parseInt(searchParams.get('limit') || '50');
    const category = searchParams.get('category') || 'overall';
    const offset = parseInt(searchParams.get('offset') || '0');

    // Validate parameters
    if (!['day', 'week', 'month', 'all'].includes(timePeriod)) {
      return NextResponse.json(
        { error: 'Invalid timePeriod. Must be: day, week, month, or all' },
        { status: 400 }
      );
    }

    if (!['VOL', 'PNL'].includes(orderBy)) {
      return NextResponse.json(
        { error: 'Invalid orderBy. Must be: VOL or PNL' },
        { status: 400 }
      );
    }

    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'Invalid limit. Must be between 1 and 100' },
        { status: 400 }
      );
    }

    console.log('🏆 Fetching leaderboard:', { timePeriod, orderBy, limit, category, offset });

    // Create timeout promise (10 seconds)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('API request timeout')), 10000)
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
    ]) as Response;

    if (!response.ok) {
      console.error('❌ Polymarket API error:', response.status);
      throw new Error(`Polymarket API returned ${response.status}`);
    }

    const data: PolymarketLeaderboardEntry[] = await response.json();
    console.log('✅ Leaderboard data fetched:', data?.length || 0, 'traders');
    
    // Log raw sample to see exact structure
    // SECURITY: Removed full data logging (contains user trading data)
    // Use logInfo for safe logging instead

    // Check if data is an array
    if (!Array.isArray(data)) {
      console.error('❌ Unexpected response format:', typeof data);
      return NextResponse.json(
        { error: 'Unexpected API response format' },
        { status: 500 }
      );
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

    return NextResponse.json({
      traders,
      meta: {
        timePeriod,
        orderBy,
        limit,
        category,
        offset,
        returned: traders.length
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching leaderboard:', error);

    if (error.message === 'API request timeout') {
      return NextResponse.json(
        { error: 'Request timeout - Polymarket API is slow or unavailable' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to fetch leaderboard',
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

