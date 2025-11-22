import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

interface Position {
  cashPnl?: number | string;
  size?: number | string;
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
    // Fetch username from leaderboard (SAME AS FEED PAGE)
    let displayName = abbreviateWallet(wallet)
    
    try {
      console.log('🔍 Looking up username for wallet:', wallet);
      
      // Use leaderboard API to find username (same as Feed page)
      const leaderboardResponse = await fetch(
        'https://data-api.polymarket.com/leaderboards/pnl?start_date=2000-01-01',
        { cache: 'no-store' }
      );
      
      if (leaderboardResponse.ok) {
        const leaderboardData = await leaderboardResponse.json();
        console.log('✅ Leaderboard data fetched');
        
        // Find this trader in the leaderboard
        const trader = leaderboardData?.find(
          (t: any) => t.user?.toLowerCase() === wallet.toLowerCase()
        );
        
        if (trader && trader.userName) {
          displayName = trader.userName;
          console.log('✅ Found username:', displayName);
        } else {
          console.log('⚠️ Wallet not found in leaderboard, using abbreviated wallet');
        }
      } else {
        console.log('⚠️ Leaderboard request failed:', leaderboardResponse.status);
      }
    } catch (err) {
      console.log('⚠️ Could not fetch username from leaderboard:', err);
      // Continue with abbreviated wallet if leaderboard fetch fails
    }

    // Fetch positions from Polymarket API
    const response = await fetch(
      `https://data-api.polymarket.com/positions?user=${wallet}`,
      { cache: 'no-store' } // Disable caching for real-time data
    )

    if (!response.ok) {
      throw new Error(`Polymarket API returned ${response.status}`)
    }

    const positions: Position[] = await response.json()

    // Count followers from Supabase
    let followerCount = 0
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      
      const { count, error: countError } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('trader_wallet', wallet)

      if (!countError && count !== null) {
        followerCount = count
      }
    } catch (err) {
      console.error('Error counting followers:', err)
      // Don't fail the request if follower count fails
    }

    // If no positions, return zeros
    if (!positions || positions.length === 0) {
      return NextResponse.json({
        wallet,
        displayName,
        pnl: 0,
        volume: 0,
        followerCount,
      })
    }

    // Calculate statistics
    let totalPnl = 0
    let totalVolume = 0

    positions.forEach((position) => {
      const pnl = parseFloat(String(position.cashPnl || 0))
      const size = parseFloat(String(position.size || 0))
      totalPnl += pnl
      totalVolume += size
    })

    return NextResponse.json({
      wallet,
      displayName,
      pnl: Math.round(totalPnl), // Round to whole number
      volume: Math.round(totalVolume), // Round to whole number
      followerCount,
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

