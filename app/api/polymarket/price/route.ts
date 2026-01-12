// Proxy API for fetching Polymarket prices (bypasses CORS)
// Uses CLOB API for accurate real-time prices
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const conditionId = searchParams.get('conditionId');
  const slug = searchParams.get('slug');
  const title = searchParams.get('title');

  try {
    // Try 1: CLOB API with condition_id (most accurate for real-time prices)
    if (conditionId && conditionId.startsWith('0x')) {
      console.log(`[Price API] CLOB search by conditionId: ${conditionId}`);
      const response = await fetch(
        `https://clob.polymarket.com/markets/${conditionId}`,
        { cache: 'no-store' }
      );
      
      if (response.ok) {
        const market = await response.json();
        console.log(`[Price API] CLOB found: ${market.question}`);
        
        // CLOB API returns tokens array with outcome and price
        if (market.tokens && Array.isArray(market.tokens)) {
          const outcomes = market.tokens.map((t: any) => t.outcome);
          const prices = market.tokens.map((t: any) => t.price.toString());
          
          // Market prices are public data - safe to log summary
          console.log(`[Price API] Fetched ${prices?.length || 0} prices for ${outcomes?.length || 0} outcomes`);
          
          const resolved =
            typeof market.resolved === 'boolean'
              ? market.resolved
              : typeof market.is_resolved === 'boolean'
                ? market.is_resolved
                : typeof market.isResolved === 'boolean'
                  ? market.isResolved
                  : undefined;

          return NextResponse.json({
            success: true,
            market: {
              question: market.question,
              conditionId: market.condition_id,
              slug: market.market_slug,
              closed: market.closed,
              resolved,
              outcomePrices: prices,
              outcomes: outcomes,
              // Sports/Event metadata
              description: market.description,
              category: market.category,
              endDateIso: market.end_date_iso || null,
              gameStartTime: market.game_start_time || market.start_date_iso || market.event_start_date || null,
              enableOrderBook: market.enable_order_book || false,
              // Additional sports metadata if available
              eventStatus: market.event_status || market.status || null,
              score: market.score || market.live_score || null,
              homeTeam: market.home_team || null,
              awayTeam: market.away_team || null,
            }
          });
        }
      } else {
        console.log(`[Price API] CLOB returned ${response.status}`);
      }
    }

    // Try 2: Gamma API by slug (fallback for older markets)
    if (slug && !slug.startsWith('0x')) {
      console.log(`[Price API] Gamma search by slug: ${slug}`);
      const response = await fetch(
        `https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}`,
        { cache: 'no-store' }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          const market = data[0];
          console.log(`[Price API] Gamma found: ${market.question}`);
          
          let prices = market.outcomePrices;
          let outcomes = market.outcomes;
          
          if (typeof prices === 'string') {
            try { prices = JSON.parse(prices); } catch { prices = null; }
          }
          if (typeof outcomes === 'string') {
            try { outcomes = JSON.parse(outcomes); } catch { outcomes = null; }
          }

          const resolved =
            typeof market.resolved === 'boolean'
              ? market.resolved
              : typeof market.is_resolved === 'boolean'
                ? market.is_resolved
                : typeof market.isResolved === 'boolean'
                  ? market.isResolved
                  : undefined;

          return NextResponse.json({
            success: true,
            market: {
              question: market.question,
              conditionId: market.conditionId,
              slug: market.slug,
              closed: market.closed,
              resolved,
              outcomePrices: prices,
              outcomes: outcomes,
            }
          });
        }
      }
    }

    // Try 3: Gamma API title search in open markets
    if (title) {
      console.log(`[Price API] Gamma title search: ${title.substring(0, 30)}...`);
      const response = await fetch(
        `https://gamma-api.polymarket.com/markets?closed=false&limit=100`,
        { cache: 'no-store' }
      );
      
      if (response.ok) {
        const data = await response.json();
        const titleLower = title.toLowerCase();
        
        // Try exact match first
        let match = data.find((m: any) => 
          m.question?.toLowerCase() === titleLower
        );
        
        // Then partial match
        if (!match && titleLower.length > 10) {
          match = data.find((m: any) => 
            m.question?.toLowerCase().includes(titleLower.substring(0, 20))
          );
        }
        
        if (match) {
          console.log(`[Price API] Gamma title found: ${match.question}`);
          
          let prices = match.outcomePrices;
          let outcomes = match.outcomes;
          
          if (typeof prices === 'string') {
            try { prices = JSON.parse(prices); } catch { prices = null; }
          }
          if (typeof outcomes === 'string') {
            try { outcomes = JSON.parse(outcomes); } catch { outcomes = null; }
          }

          const resolved =
            typeof match.resolved === 'boolean'
              ? match.resolved
              : typeof match.is_resolved === 'boolean'
                ? match.is_resolved
                : typeof match.isResolved === 'boolean'
                  ? match.isResolved
                  : undefined;

          return NextResponse.json({
            success: true,
            market: {
              question: match.question,
              conditionId: match.conditionId,
              slug: match.slug,
              closed: match.closed,
              resolved,
              outcomePrices: prices,
              outcomes: outcomes,
            }
          });
        }
      }
    }

    console.log(`[Price API] Market not found for conditionId=${conditionId}, slug=${slug}, title=${title?.substring(0, 30)}`);
    return NextResponse.json({
      success: false,
      error: 'Market not found'
    });

  } catch (error: any) {
    console.error('[Price API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch price' },
      { status: 500 }
    );
  }
}
