/**
 * Helper to enrich blockchain trades with market metadata
 * Maps tokenId/conditionId to market names and outcomes
 */

interface BlockchainTrade {
  timestamp: number;
  transactionHash: string;
  blockNumber: number;
  side: string;
  price: number;
  size: number;
  tokenId: string;
  conditionId: string | null;
  market: string;
  outcome: string;
}

interface EnrichedTrade extends BlockchainTrade {
  market: string;
  outcome: string;
  conditionId: string;
  marketSlug?: string;
  eventSlug?: string;
  marketAvatarUrl?: string | null;
}

// Cache for market data to avoid repeated API calls
const marketCache = new Map<string, any>();

/**
 * Fetch market data from CLOB API by tokenId
 */
async function fetchMarketByTokenId(tokenId: string): Promise<any | null> {
  try {
    // Check cache first
    if (marketCache.has(tokenId)) {
      return marketCache.get(tokenId);
    }

    // Query CLOB API for market by token
    const response = await fetch(
      `https://clob.polymarket.com/markets?token_id=${tokenId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Polycopy',
        },
        cache: 'force-cache', // Cache market data
      }
    );

    if (!response.ok) {
      console.warn(`⚠️ Failed to fetch market for token ${tokenId}`);
      return null;
    }

    const markets = await response.json();
    
    if (!markets || markets.length === 0) {
      return null;
    }

    const market = markets[0];
    marketCache.set(tokenId, market);
    return market;
  } catch (error) {
    console.error(`❌ Error fetching market for token ${tokenId}:`, error);
    return null;
  }
}

/**
 * Enrich blockchain trades with market metadata
 */
export async function enrichBlockchainTrades(
  trades: BlockchainTrade[]
): Promise<EnrichedTrade[]> {
  console.log(`🔍 Enriching ${trades.length} blockchain trades with market data...`);

  const enrichedTrades = await Promise.all(
    trades.map(async (trade) => {
      try {
        const market = await fetchMarketByTokenId(trade.tokenId);

        if (!market) {
          return {
            ...trade,
            market: 'Unknown Market',
            outcome: 'Unknown',
            conditionId: trade.tokenId.slice(0, 66), // Truncate to conditionId format
          };
        }

        // Find the outcome token that matches this tokenId
        const token = market.tokens?.find((t: any) => 
          t.token_id?.toLowerCase() === trade.tokenId.toLowerCase()
        );
        const marketAvatarUrl =
          typeof market?.icon === 'string' && market.icon.trim()
            ? market.icon.trim()
            : typeof market?.image === 'string' && market.image.trim()
              ? market.image.trim()
              : null;

        return {
          ...trade,
          market: market.question || market.title || 'Unknown Market',
          outcome: token?.outcome || 'Unknown',
          conditionId: market.condition_id || trade.tokenId.slice(0, 66),
          marketSlug: market.slug,
          eventSlug: market.event_slug,
          marketAvatarUrl,
        };
      } catch (error) {
        console.error('❌ Error enriching trade:', error);
        return {
          ...trade,
          market: 'Unknown Market',
          outcome: 'Unknown',
          conditionId: trade.tokenId.slice(0, 66),
        };
      }
    })
  );

  console.log(`✅ Enriched ${enrichedTrades.length} trades with market data`);

  return enrichedTrades;
}

/**
 * Match buy and sell trades to calculate P&L
 */
export interface MatchedPosition {
  conditionId: string;
  market: string;
  outcome: string;
  buyTrades: EnrichedTrade[];
  sellTrades: EnrichedTrade[];
  averageEntryPrice: number;
  averageExitPrice: number;
  totalShares: number;
  totalInvested: number;
  totalReturned: number;
  pnl: number;
  roi: number;
  status: 'open' | 'closed';
  firstTradeTimestamp: number;
  lastTradeTimestamp: number;
}

export function matchTradesToPositions(trades: EnrichedTrade[]): MatchedPosition[] {
  console.log(`🔄 Matching ${trades.length} trades to positions...`);

  // Group trades by conditionId + outcome
  const positionMap = new Map<string, MatchedPosition>();

  for (const trade of trades) {
    const key = `${trade.conditionId}-${trade.outcome}`;
    
    let position = positionMap.get(key);
    if (!position) {
      position = {
        conditionId: trade.conditionId,
        market: trade.market,
        outcome: trade.outcome,
        buyTrades: [],
        sellTrades: [],
        averageEntryPrice: 0,
        averageExitPrice: 0,
        totalShares: 0,
        totalInvested: 0,
        totalReturned: 0,
        pnl: 0,
        roi: 0,
        status: 'open',
        firstTradeTimestamp: trade.timestamp,
        lastTradeTimestamp: trade.timestamp,
      };
      positionMap.set(key, position);
    }

    // Add to buy or sell trades
    if (trade.side === 'BUY') {
      position.buyTrades.push(trade);
      position.totalShares += trade.size;
      position.totalInvested += trade.size * trade.price;
    } else {
      position.sellTrades.push(trade);
      position.totalShares -= trade.size;
      position.totalReturned += trade.size * trade.price;
    }

    // Update timestamps
    position.firstTradeTimestamp = Math.min(position.firstTradeTimestamp, trade.timestamp);
    position.lastTradeTimestamp = Math.max(position.lastTradeTimestamp, trade.timestamp);
  }

  // Calculate P&L and status for each position
  const positions = Array.from(positionMap.values()).map(position => {
    const totalBought = position.buyTrades.reduce((sum, t) => sum + t.size, 0);
    const totalSold = position.sellTrades.reduce((sum, t) => sum + t.size, 0);

    position.averageEntryPrice = totalBought > 0
      ? position.totalInvested / totalBought
      : 0;

    position.averageExitPrice = totalSold > 0
      ? position.totalReturned / totalSold
      : 0;

    position.status = Math.abs(position.totalShares) < 0.01 ? 'closed' : 'open';
    position.pnl = position.totalReturned - position.totalInvested;
    position.roi = position.totalInvested > 0
      ? (position.pnl / position.totalInvested) * 100
      : 0;

    return position;
  });

  console.log(`✅ Created ${positions.length} positions (${positions.filter(p => p.status === 'open').length} open, ${positions.filter(p => p.status === 'closed').length} closed)`);

  return positions;
}
