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
    
    // STEP 1: Try to get data from leaderboard using address lookup (PRIMARY SOURCE)
    // This endpoint works for ANY wallet, not just top 500
    try {
      console.log('🔍 Looking up trader by address:', wallet);
      
      const addressLookupResponse = await fetch(
        `https://data-api.polymarket.com/leaderboard?address=${wallet}`,
        { cache: 'no-store' }
      );
      
      if (addressLookupResponse.ok) {
        const leaderboardData = await addressLookupResponse.json();
        console.log('✅ Address lookup response:', JSON.stringify(leaderboardData, null, 2));
        
        // API returns array with single trader object
        const trader = Array.isArray(leaderboardData) ? leaderboardData[0] : leaderboardData;
        
        if (trader) {
          foundInLeaderboard = true;
          
          // Log raw trader object to verify field names
          console.log('🔍 Raw trader data:', JSON.stringify({
            username: trader.username,
            name: trader.name,
            total_pnl: trader.total_pnl,
            pnl: trader.pnl,
            volume: trader.volume,
            total_trades: trader.total_trades,
            roi: trader.roi
          }));
          
          // Use leaderboard data - this is Polymarket's official ALL-TIME stats
          if (trader.username || trader.name) {
            displayName = trader.username || trader.name;
          }
          // Use total_pnl (all-time) instead of pnl (monthly)
          pnl = trader.total_pnl ?? trader.pnl ?? 0;
          volume = trader.volume ?? 0;
          roi = trader.roi ?? (volume > 0 ? ((pnl / volume) * 100) : 0);
          
          console.log('✅ Found trader stats:', {
            displayName,
            pnl: Math.round(pnl),
            volume: Math.round(volume),
            roi: roi.toFixed(1) + '%'
          });
        } else {
          console.log('⚠️ No data returned for wallet, will fall back to positions');
        }
      } else {
        console.log('⚠️ Address lookup request failed:', addressLookupResponse.status);
      }
    } catch (err) {
      console.log('⚠️ Could not fetch address lookup:', err);
    }

    // STEP 2: Fall back to positions endpoint ONLY if not found in leaderboard
    if (!foundInLeaderboard) {
      console.log('📊 Fetching positions as fallback for:', wallet);
      
      try {
        const response = await fetch(
          `https://data-api.polymarket.com/positions?user=${wallet}`,
          { cache: 'no-store' }
        );

        if (response.ok) {
          const positions: Position[] = await response.json();
          
          if (positions && positions.length > 0) {
            let totalPnl = 0;
            let totalVolume = 0;

            positions.forEach((position) => {
              const positionPnl = parseFloat(String(position.cashPnl || 0));
              const size = parseFloat(String(position.size || 0));
              totalPnl += positionPnl;
              totalVolume += size;
            });

            pnl = totalPnl;
            volume = totalVolume;
            roi = totalVolume > 0 ? ((totalPnl / totalVolume) * 100) : 0;
            
            console.log('📊 Positions fallback data:', {
              pnl: Math.round(pnl),
              volume: Math.round(volume),
              roi: roi.toFixed(1) + '%',
              positionCount: positions.length
            });
          }
        }
      } catch (err) {
        console.log('⚠️ Could not fetch positions:', err);
      }
    }

    // STEP 3: Count followers from Supabase
    let followerCount = 0
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      
      // Normalize wallet to lowercase for consistent matching
      // All follows are stored with lowercase wallet addresses
      const normalizedWallet = wallet.toLowerCase();
      
      const { count, error: countError } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('trader_wallet', normalizedWallet)

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
      pnl: Math.round(pnl),
      roi: parseFloat(roi.toFixed(1)),
      volume: Math.round(volume),
      followerCount,
      source: foundInLeaderboard ? 'leaderboard' : 'positions', // Debug: shows which data source was used
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

