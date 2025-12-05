import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

interface Position {
  cashPnl?: number | string;
  size?: number | string;
  [key: string]: any;
}

interface LeaderboardTrader {
  proxyWallet: string;
  userName?: string;
  pnl?: number;
  vol?: number; // Field is "vol" not "volume"
  rank?: string;
  profileImage?: string;
  [key: string]: any;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wallet: string }> }
) {
  const { wallet } = await params
  
  if (!wallet) {
    return NextResponse.json(
      { error: 'Wallet address is required' },
      { status: 400 }
    )
  }

  try {
    // Initialize with defaults
    let displayName = abbreviateWallet(wallet)
    let pnl = 0
    let volume = 0
    let roi = 0
    let foundInLeaderboard = false
    
    // STEP 1: Get data from V1 leaderboard endpoint (CORRECT API)
    // This is the same endpoint Polymarket's website uses
    try {
      console.log('🔍 Looking up trader using V1 leaderboard API:', wallet);
      
      // IMPORTANT: Use V1 endpoint with user parameter for accurate all-time stats
      const v1LeaderboardUrl = `https://data-api.polymarket.com/v1/leaderboard?timePeriod=all&orderBy=VOL&limit=1&offset=0&category=overall&user=${wallet}`;
      
      const leaderboardResponse = await fetch(v1LeaderboardUrl, { cache: 'no-store' });
      
      if (leaderboardResponse.ok) {
        const leaderboardData = await leaderboardResponse.json();
        console.log('✅ V1 Leaderboard response:', JSON.stringify(leaderboardData, null, 2));
        
        // API returns array - get first result
        const trader = Array.isArray(leaderboardData) && leaderboardData.length > 0 ? leaderboardData[0] : null;
        
        if (trader) {
          foundInLeaderboard = true;
          
          // Log raw trader object to verify field names
          console.log('🔍 Raw V1 trader data:', JSON.stringify({
            userName: trader.userName,
            proxyWallet: trader.proxyWallet,
            pnl: trader.pnl,
            vol: trader.vol,
            rank: trader.rank
          }));
          
          // Map V1 API response fields (CORRECT mapping):
          // - userName (not username!)
          // - vol (not volume!)
          // - pnl (all-time P&L)
          if (trader.userName) {
            displayName = trader.userName;
          }
          pnl = trader.pnl ?? 0;
          volume = trader.vol ?? 0;
          roi = volume > 0 ? ((pnl / volume) * 100) : 0;
          
          console.log('✅ Found trader stats from V1 API:', {
            displayName,
            pnl: Math.round(pnl),
            volume: Math.round(volume),
            roi: roi.toFixed(1) + '%',
            rank: trader.rank
          });
        } else {
          console.log('⚠️ User not found in V1 leaderboard (empty array returned)');
        }
      } else {
        console.log('⚠️ V1 Leaderboard request failed:', leaderboardResponse.status);
      }
    } catch (err) {
      console.log('⚠️ Could not fetch V1 leaderboard:', err);
    }

    // STEP 2: Try to get username from recent trades if not on leaderboard
    // Don't calculate P&L from positions - it's always wrong!
    if (!foundInLeaderboard) {
      console.log('📊 User not on leaderboard - attempting to get username from trades');
      
      try {
        const tradesResponse = await fetch(
          `https://data-api.polymarket.com/trades?user=${wallet}&limit=1`,
          { cache: 'no-store' }
        );

        if (tradesResponse.ok) {
          const trades = await tradesResponse.json();
          
          if (trades && trades.length > 0 && trades[0].name) {
            displayName = trades[0].name;
            console.log('✅ Got username from trades:', displayName);
          }
        }
      } catch (err) {
        console.log('⚠️ Could not fetch trades for username:', err);
      }
      
      // Leave stats as zero - we don't have reliable data
      console.log('⚠️ No leaderboard stats available for this wallet');
    }

    // STEP 3: Determine if we have valid stats
    const hasStats = foundInLeaderboard;
    
    // STEP 4: Count followers from Supabase
    let followerCount = 0
    try {
      console.log('📊 Counting followers for wallet:', wallet);
      
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      
      // Normalize wallet to lowercase for consistent matching
      // All follows are stored with lowercase wallet addresses
      const normalizedWallet = wallet.toLowerCase();
      console.log('📊 Normalized wallet for query:', normalizedWallet);
      
      // First, let's verify the table exists and see what data is there
      const { data: allFollows, error: fetchError } = await supabase
        .from('follows')
        .select('trader_wallet, user_id')
        .limit(10);
      
      console.log('📊 Sample follows in database:', allFollows);
      console.log('📊 Fetch error:', fetchError);
      
      // Now count followers for this specific wallet
      const { count, error: countError, data: countData } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('trader_wallet', normalizedWallet);

      console.log('📊 Count query result:', { count, error: countError });
      
      // Also try to fetch the actual rows to debug
      const { data: matchingFollows, error: debugError } = await supabase
        .from('follows')
        .select('*')
        .eq('trader_wallet', normalizedWallet);
      
      console.log('📊 Matching follows for this wallet:', matchingFollows);
      console.log('📊 Debug error:', debugError);

      if (!countError && count !== null) {
        followerCount = count
        console.log('✅ Follower count for', normalizedWallet, ':', followerCount);
      } else if (countError) {
        console.error('❌ Error counting followers:', countError);
      }
    } catch (err) {
      console.error('❌ Exception counting followers:', err)
    }

    // Return the data
    return NextResponse.json({
      wallet,
      displayName,
      pnl: hasStats ? Math.round(pnl) : null,
      roi: hasStats ? parseFloat(roi.toFixed(1)) : null,
      volume: hasStats ? Math.round(volume) : null,
      followerCount,
      hasStats, // Indicates if stats are available (user on leaderboard)
      source: foundInLeaderboard ? 'v1_leaderboard' : 'none', // Debug: shows which data source was used
    })

  } catch (error) {
    console.error('Error fetching trader data:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch trader data',
        details: String(error)
      },
      { status: 500 }
    )
  }
}

// Helper function to abbreviate wallet address
function abbreviateWallet(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

