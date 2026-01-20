// ⚠️ NOTE: This API route is currently NOT USED.
// Feed fetching is done entirely client-side in app/page.tsx
// This file is kept for reference but can be deleted.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

interface PolymarketTrade {
  id: string;
  asset_id: string;
  market: string;
  side: 'BUY' | 'SELL';
  outcome: string;
  price: string | number;
  size: string | number;
  timestamp: string | number;
  trader_address?: string;
  [key: string]: any;
}

interface FeedTrade {
  id: string;
  trader: {
    wallet: string;
    displayName: string;
  };
  market: {
    title: string;
    slug: string;
    icon?: string;
  };
  trade: {
    side: 'BUY' | 'SELL';
    outcome: string;
    size: number;
    price: number;
    timestamp: number;
    timeAgo: string;
  };
}

// Helper to calculate "time ago"
function getTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
}

// Helper to abbreviate wallet
function abbreviateWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export async function GET(request: Request) {
  try {
    // Create server-side Supabase client that can read cookies
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          async get(name: string) {
            const cookie = cookieStore.get(name);
            return cookie?.value;
          },
        },
      }
    );

    // Get authenticated user from cookie session
    console.log('🔐 Getting user from server-side session...');
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    console.log('🔐 Auth result:', {
      hasUser: !!user,
      email: user?.email,
      error: userError
    });

    if (!user || userError) {
      console.log('❌ No authenticated user found');
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const userId = user.id;
    console.log('✅ User authenticated:', userId, user.email);
    console.log('📰 Fetching feed for user:', userId);

    // Fetch followed traders
    console.log('🔍 Querying follows for user:', userId);
    const { data: follows, error: followsError } = await supabase
      .from('follows')
      .select('trader_wallet')
      .eq('user_id', userId);

    console.log('📊 Query result - follows:', follows);
    console.log('📊 Query error:', followsError);
    console.log('📊 Follows count:', follows?.length || 0);

    if (followsError) {
      console.error('❌ Error fetching follows:', {
        message: followsError.message,
        details: followsError.details,
        hint: followsError.hint,
      });
      const details = followsError.message || String(followsError)
      return NextResponse.json(
        { error: 'Failed to fetch follows', details },
        { status: 500 }
      );
    }

    if (!follows || follows.length === 0) {
      console.log('ℹ️ User has no follows - returning empty array');
      return NextResponse.json({
        trades: [],
        count: 0,
        message: 'No followed traders'
      });
    }

    console.log('✅ Found', follows.length, 'followed traders:', follows.map(f => f.trader_wallet));

    // Fetch trades for each followed trader
    const allTrades: FeedTrade[] = [];

    for (const follow of follows) {
      const wallet = follow.trader_wallet;
      
      try {
        console.log('📊 Fetching trades for:', wallet);
        
        // Fetch recent trades from Polymarket
        const tradesResponse = await fetch(
          `https://data-api.polymarket.com/trades?wallet=${wallet}&limit=10`,
          { cache: 'no-store' }
        );

        if (!tradesResponse.ok) {
          console.warn(`⚠️ Failed to fetch trades for ${wallet}`);
          continue;
        }

        const trades: PolymarketTrade[] = await tradesResponse.json();

        if (!trades || trades.length === 0) {
          console.log(`ℹ️ No trades found for ${wallet}`);
          continue;
        }

        // Fetch trader profile to get username
        let displayName = abbreviateWallet(wallet);
        try {
          const profileResponse = await fetch(
            `https://data-api.polymarket.com/users/${wallet}`,
            { cache: 'no-store' }
          );
          if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            if (profileData.userName || profileData.username) {
              displayName = profileData.userName || profileData.username;
            }
          }
        } catch (err) {
          // Use abbreviated wallet if profile fetch fails
        }

        // Transform and add trades
        for (const trade of trades) {
          const timestamp = typeof trade.timestamp === 'string' 
            ? parseInt(trade.timestamp) 
            : trade.timestamp;

          allTrades.push({
            id: `${wallet}-${trade.id || timestamp}`,
            trader: {
              wallet,
              displayName,
            },
            market: {
              title: trade.market || 'Unknown Market',
              slug: '', // Polymarket doesn't provide slug in trades API
              icon: trade.icon,
            },
            trade: {
              side: trade.side,
              outcome: trade.outcome || 'Yes',
              size: parseFloat(String(trade.size || 0)),
              price: parseFloat(String(trade.price || 0)),
              timestamp,
              timeAgo: getTimeAgo(timestamp),
            },
          });
        }

        console.log(`✅ Added ${trades.length} trades for ${displayName}`);
      } catch (err) {
        console.error(`❌ Error fetching trades for ${wallet}:`, err);
        continue;
      }
    }

    // Sort by timestamp (most recent first)
    allTrades.sort((a, b) => b.trade.timestamp - a.trade.timestamp);

    console.log('✅ Returning', allTrades.length, 'total trades');

    return NextResponse.json({
      trades: allTrades.slice(0, 50), // Limit to 50 most recent
      count: allTrades.length,
    });

  } catch (error: any) {
    console.error('❌ Error fetching feed:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch feed',
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}
