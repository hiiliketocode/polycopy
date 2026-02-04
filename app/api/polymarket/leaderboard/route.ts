import { NextResponse } from 'next/server'
import { fetchPolymarketLeaderboard } from '@/lib/polymarket-leaderboard'

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

    // Use shared function to fetch leaderboard
    const traders = await fetchPolymarketLeaderboard({
      timePeriod,
      orderBy,
      limit,
      category,
      offset,
    });

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

