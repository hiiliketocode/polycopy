import { NextResponse } from 'next/server'
import { badRequest, externalApiError } from '@/lib/http/error-response'

// Helper function to validate Ethereum address
function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Helper function to abbreviate wallet address
function abbreviateWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get('wallet');

    // Validate wallet parameter
    if (!wallet) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    if (!isValidEthereumAddress(wallet)) {
      return NextResponse.json(
        { error: 'Invalid Ethereum address format' },
        { status: 400 }
      );
    }

    console.log('📊 Fetching trader stats for:', wallet);

    // Create timeout promise (10 seconds)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('API request timeout')), 10000)
    );

    // Fetch positions from Polymarket
    const positionsPromise = fetch(
      `https://data-api.polymarket.com/positions?user=${wallet}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Polycopy/1.0)',
        },
        cache: 'no-store'
      }
    );

    // Race between API call and timeout
    const positionsResponse = await Promise.race([
      positionsPromise,
      timeoutPromise
    ]) as Response;

    if (!positionsResponse.ok) {
      console.error('❌ Polymarket API error:', positionsResponse.status);
      throw new Error(`Polymarket API returned ${positionsResponse.status}`);
    }

    const positions = await positionsResponse.json();
    console.log('✅ Positions fetched:', positions?.length || 0);

    // Fetch recent trades (for win rate calculation)
    const tradesPromise = fetch(
      `https://data-api.polymarket.com/trades?user=${wallet}&limit=50`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Polycopy/1.0)',
        },
        cache: 'no-store'
      }
    );

    const tradesResponse = await Promise.race([
      tradesPromise,
      timeoutPromise
    ]) as Response;

    let trades: any[] = [];
    if (tradesResponse.ok) {
      trades = await tradesResponse.json();
      console.log('✅ Trades fetched:', trades?.length || 0);
    } else {
      console.warn('⚠️ Trades API error, continuing without trades data');
    }

    // Calculate statistics
    let totalPnl = 0;
    let totalTrades = 0;
    let profitableTrades = 0;

    // Calculate P&L from positions
    if (positions && Array.isArray(positions)) {
      positions.forEach((position: any) => {
        const pnl = parseFloat(String(position.cashPnl || 0));
        totalPnl += pnl;
      });
    }

    // Calculate win rate from trades
    if (trades && Array.isArray(trades)) {
      totalTrades = trades.length;
      
      // Count profitable trades (simplified - could be more sophisticated)
      trades.forEach((trade: any) => {
        const pnl = parseFloat(String(trade.pnl || 0));
        if (pnl > 0) {
          profitableTrades++;
        }
      });
    } else {
      // Fallback: estimate from positions if no trades data
      totalTrades = positions?.length || 0;
      if (positions && Array.isArray(positions)) {
        positions.forEach((position: any) => {
          const pnl = parseFloat(String(position.cashPnl || 0));
          if (pnl > 0) {
            profitableTrades++;
          }
        });
      }
    }

    const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;

    // Try to get display name from user data (if available in API response)
    let displayName = abbreviateWallet(wallet);
    
    // Some positions might have user info
    if (positions && positions.length > 0 && positions[0].user?.name) {
      displayName = positions[0].user.name;
    }

    const stats = {
      wallet: wallet.toLowerCase(),
      displayName,
      pnl: Math.round(totalPnl * 100) / 100, // Round to 2 decimal places
      winRate: Math.round(winRate * 10) / 10, // Round to 1 decimal place
      totalTrades,
      followerCount: 0, // Will be fetched from our database in the future
    };

    console.log('✅ Stats calculated:', stats);

    return NextResponse.json(stats);

  } catch (error: any) {
    // Check for timeout errors
    if (error.message === 'API request timeout') {
      return NextResponse.json(
        { error: 'Request timeout - Polymarket API is slow or unavailable' },
        { status: 504 }
      );
    }

    return externalApiError('Polymarket', error, 'fetch trader stats');
  }
}

