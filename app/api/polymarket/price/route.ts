// Proxy API for fetching Polymarket prices (bypasses CORS)
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const conditionId = searchParams.get('conditionId');
  const slug = searchParams.get('slug');
  const title = searchParams.get('title');

  try {
    let markets: any[] | null = null;

    // Try 1: condition_id search
    if (conditionId && conditionId.startsWith('0x')) {
      console.log(`[Price API] Searching by conditionId: ${conditionId}`);
      const response = await fetch(
        `https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`,
        { cache: 'no-store' }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          markets = data;
          console.log(`[Price API] Found ${data.length} markets by conditionId`);
        }
      }
    }

    // Try 2: slug search
    if (!markets && slug && !slug.startsWith('0x')) {
      console.log(`[Price API] Searching by slug: ${slug}`);
      const response = await fetch(
        `https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}`,
        { cache: 'no-store' }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          markets = data;
          console.log(`[Price API] Found ${data.length} markets by slug`);
        }
      }
    }

    // Try 3: title search in open markets
    if (!markets && title) {
      console.log(`[Price API] Searching by title in open markets`);
      const response = await fetch(
        `https://gamma-api.polymarket.com/markets?closed=false&limit=100`,
        { cache: 'no-store' }
      );
      
      if (response.ok) {
        const data = await response.json();
        const titleLower = title.toLowerCase();
        
        // Try exact match
        let match = data.find((m: any) => 
          m.question?.toLowerCase() === titleLower
        );
        
        // Try partial match
        if (!match && titleLower.length > 20) {
          match = data.find((m: any) => 
            m.question?.toLowerCase().includes(titleLower.substring(0, 30))
          );
        }
        
        if (match) {
          markets = [match];
          console.log(`[Price API] Found market by title: ${match.question?.substring(0, 40)}`);
        }
      }
    }

    // Try 4: title search in closed markets
    if (!markets && title) {
      console.log(`[Price API] Searching by title in closed markets`);
      const response = await fetch(
        `https://gamma-api.polymarket.com/markets?closed=true&limit=100`,
        { cache: 'no-store' }
      );
      
      if (response.ok) {
        const data = await response.json();
        const titleLower = title.toLowerCase();
        
        const match = data.find((m: any) => 
          m.question?.toLowerCase() === titleLower ||
          (titleLower.length > 20 && m.question?.toLowerCase().includes(titleLower.substring(0, 30)))
        );
        
        if (match) {
          markets = [match];
          console.log(`[Price API] Found market in closed: ${match.question?.substring(0, 40)}`);
        }
      }
    }

    if (markets && markets.length > 0) {
      const market = markets[0];
      
      // Parse prices and outcomes
      let prices = market.outcomePrices;
      let outcomes = market.outcomes;
      
      if (typeof prices === 'string') {
        try { prices = JSON.parse(prices); } catch { prices = null; }
      }
      if (typeof outcomes === 'string') {
        try { outcomes = JSON.parse(outcomes); } catch { outcomes = null; }
      }

      return NextResponse.json({
        success: true,
        market: {
          question: market.question,
          conditionId: market.conditionId,
          slug: market.slug,
          closed: market.closed,
          outcomePrices: prices,
          outcomes: outcomes,
        }
      });
    }

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

