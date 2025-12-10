// Proxy API for fetching Gamma market data (bypasses CORS)
// Supports:
// 1. Single market details by conditionId (includes category)
// 2. Batch market prices by condition_ids
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const conditionId = searchParams.get('conditionId');
  const conditionIds = searchParams.get('condition_ids');
  
  // Mode 1: Single market details (includes category)
  if (conditionId) {
    try {
      const response = await fetch(
        `https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`,
        { 
          headers: { 'Accept': 'application/json' },
          cache: 'no-store'
        }
      );
      
      if (!response.ok) {
        return NextResponse.json({ error: 'Market not found' }, { status: 404 });
      }
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        return NextResponse.json({
          conditionId,
          category: data[0].category || null,
          outcomePrices: data[0].outcomePrices,
          outcomes: data[0].outcomes || '["Yes", "No"]',
          title: data[0].question || data[0].title
        });
      }
      
      return NextResponse.json({ error: 'No market data' }, { status: 404 });
    } catch (error) {
      console.error(`[Gamma] Error fetching ${conditionId}:`, error);
      return NextResponse.json({ error: 'Failed to fetch market' }, { status: 500 });
    }
  }
  
  // Mode 2: Batch prices
  if (conditionIds) {
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
  
  return NextResponse.json({ error: 'conditionId or condition_ids parameter required' }, { status: 400 });
}
