import { NextResponse } from 'next/server';

/**
 * Server-side proxy for Polymarket CLOB API to fetch paginated trade history
 * 
 * CLOB API for PUBLIC trade data (no auth required):
 * - GET /trades?user={wallet} - Returns public trade history
 * 
 * This proxy helps with:
 * 1. CORS issues when calling CLOB from client
 * 2. Pagination support (next_cursor)
 * 3. Consistent error handling
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ wallet: string }> }
) {
  const { wallet } = await params;
  
  if (!wallet) {
    return NextResponse.json(
      { error: 'Wallet address is required' },
      { status: 400 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const nextCursor = searchParams.get('next_cursor');
    const limit = searchParams.get('limit') || '100';

    // Build CLOB API URL for public trade data (no auth needed)
    let clobUrl = `https://clob.polymarket.com/trades?user=${wallet}&limit=${limit}`;
    if (nextCursor) {
      clobUrl += `&next_cursor=${nextCursor}`;
    }

    console.log('🔄 Fetching public CLOB trades:', clobUrl);

    const response = await fetch(clobUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Polycopy',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error('❌ CLOB API error:', response.status, response.statusText);
      
      return NextResponse.json(
        { 
          error: `CLOB API returned ${response.status}`,
          message: 'Public trade data unavailable',
          fallback: true
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // CLOB API can return data in different formats
    const tradesCount = data.data?.length || data.trades?.length || (Array.isArray(data) ? data.length : 0);
    console.log('✅ CLOB API success, trades returned:', tradesCount);
    console.log('   Has next_cursor:', !!data.next_cursor);

    return NextResponse.json(data);
  } catch (error) {
    console.error('❌ Error fetching from CLOB API:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch trades from CLOB API',
        details: String(error),
        fallback: true
      },
      { status: 500 }
    );
  }
}

