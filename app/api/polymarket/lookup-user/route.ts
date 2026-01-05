import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { username } = await request.json()

    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      )
    }

    // Clean input (remove @ if present, trim whitespace)
    const cleanInput = username.trim().replace(/^@/, '')

    if (!cleanInput) {
      return NextResponse.json(
        { error: 'Invalid input' },
        { status: 400 }
      )
    }

    console.log('🔍 Looking up Polymarket user:', cleanInput)

    // Check if it's already a wallet address (starts with 0x and is 42 chars)
    if (cleanInput.startsWith('0x') && cleanInput.length === 42) {
      console.log('✅ Input is already a wallet address');
      return NextResponse.json({
        success: true,
        username: cleanInput,
        walletAddress: cleanInput.toLowerCase(),
        profileUrl: `https://polymarket.com/profile/${cleanInput}`
      })
    }

    // Otherwise, search for username in leaderboard using LOCAL API
    console.log('📡 Searching leaderboard for username using local API...');
    
    try {
      // Use our local API route (same as Feed page)
      const leaderboardRes = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/polymarket/leaderboard?limit=1000&orderBy=PNL`,
        {
          headers: {
            'Accept': 'application/json',
          }
        }
      );
      
      if (!leaderboardRes.ok) {
        throw new Error(`Local leaderboard API returned status ${leaderboardRes.status}`);
      }

      const leaderboardData = await leaderboardRes.json();
      console.log(`📊 Local API returned ${leaderboardData.traders?.length || 0} traders`);

      // Find trader by username (case-insensitive)
      // Our API returns displayName field
      const trader = leaderboardData.traders?.find((t: any) => 
        t.displayName?.toLowerCase() === cleanInput.toLowerCase()
      );

      if (trader && trader.wallet) {
        console.log('✅ Found wallet address for username:', trader.wallet);
        console.log('✅ Trader username:', trader.displayName);
        console.log('✅ Profile image:', trader.profileImage || 'none');
        
        return NextResponse.json({
          success: true,
          username: trader.displayName,
          walletAddress: trader.wallet.toLowerCase(),
          profileUrl: `https://polymarket.com/profile/${trader.displayName}`,
          profileImage: trader.profileImage || null
        })
      }

      // Username not found in leaderboard
      console.warn('❌ Username not found in leaderboard');
      return NextResponse.json(
        { 
          error: 'Username not found',
          details: 'This username was not found in the Polymarket leaderboard. Try entering the wallet address directly (starts with 0x).'
        },
        { status: 404 }
      )
    } catch (leaderboardError: any) {
      console.error('❌ Error fetching leaderboard:', leaderboardError);
      return NextResponse.json(
        { 
          error: 'Failed to search for username',
          details: 'Could not connect to Polymarket leaderboard. Try entering the wallet address directly (starts with 0x).'
        },
        { status: 500 }
      )
    }

  } catch (error: any) {
    console.error('❌ Error looking up user:', error)
    return NextResponse.json(
      { 
        error: 'Failed to lookup user',
        details: error.message 
      },
      { status: 500 }
    )
  }
}

