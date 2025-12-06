// Batch proxy API for fetching Gamma market prices (bypasses CORS)
// Accepts multiple condition IDs and returns prices for all of them
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const conditionIds = searchParams.get('condition_ids');
  
  if (!conditionIds) {
    return NextResponse.json({ error: 'condition_ids parameter required' }, { status: 400 });
  }
  
  const ids = conditionIds.split(',').filter(id => id.trim());
  const results: Record<string, { outcomePrices: string; outcomes: string }> = {};
  
  // Fetch all markets in parallel
  const fetchPromises = ids.map(async (conditionId) => {
    try {
      const response = await fetch(
        `https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`,
        { 
          headers: { 'Accept': 'application/json' },
          cache: 'no-store'
        }
      );
      
      if (!response.ok) return null;
      
      const data = await response.json();
      
      if (data && data.length > 0 && data[0].outcomePrices) {
        return {
          conditionId,
          outcomePrices: data[0].outcomePrices,
          outcomes: data[0].outcomes || '["Yes", "No"]'
        };
      }
      return null;
    } catch (error) {
      console.error(`[Gamma Batch] Error fetching ${conditionId}:`, error);
      return null;
    }
  });
  
  const fetchResults = await Promise.all(fetchPromises);
  
  // Build results map
  fetchResults.forEach((result) => {
    if (result) {
      results[result.conditionId] = {
        outcomePrices: result.outcomePrices,
        outcomes: result.outcomes
      };
    }
  });
  
  return NextResponse.json({
    success: true,
    count: Object.keys(results).length,
    total: ids.length,
    prices: results
  });
}
