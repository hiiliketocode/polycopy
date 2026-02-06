/**
 * BigQuery Client for PolyCopy
 * 
 * Provides access to historical trades and markets data stored in BigQuery.
 * Used for backtesting and ML training data access.
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0299056258';
const DATASET = 'polycopy_v1';

let bigqueryClient: BigQuery | null = null;

/**
 * Get or create BigQuery client singleton
 */
export function getBigQueryClient(): BigQuery {
  if (!bigqueryClient) {
    // Check for service account credentials in env
    const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    
    if (credentials) {
      try {
        const creds = JSON.parse(credentials);
        bigqueryClient = new BigQuery({
          projectId: PROJECT_ID,
          credentials: creds,
        });
      } catch (e) {
        console.error('[BigQuery] Failed to parse credentials JSON:', e);
        // Fall back to ADC
        bigqueryClient = new BigQuery({ projectId: PROJECT_ID });
      }
    } else {
      // Use Application Default Credentials
      bigqueryClient = new BigQuery({ projectId: PROJECT_ID });
    }
  }
  
  return bigqueryClient;
}

/**
 * Trade data from BigQuery trades table
 */
export interface BigQueryTrade {
  id: string;
  wallet_address: string;
  timestamp: string;
  side: 'BUY' | 'SELL';
  outcome: string;
  price: number;
  size: number;
  usd_size: number;
  condition_id: string;
  market_slug?: string;
  title?: string;
  asset?: string;
}

/**
 * Market data from BigQuery markets table
 */
export interface BigQueryMarket {
  condition_id: string;
  title?: string;
  market_slug?: string;
  status?: string;
  closed?: boolean;
  resolved_outcome?: string;
  winning_side?: string;
  close_time?: string;
  end_time?: string;
}

/**
 * Fetch trades from BigQuery for a specific date range
 * 
 * @param startDate Start of date range (inclusive)
 * @param endDate End of date range (inclusive)
 * @param options Additional query options
 * @returns Array of trades
 */
export async function fetchTradesFromBigQuery(
  startDate: Date,
  endDate: Date,
  options: {
    side?: 'BUY' | 'SELL';
    limit?: number;
    walletAddresses?: string[];
  } = {}
): Promise<BigQueryTrade[]> {
  const client = getBigQueryClient();
  
  const { side = 'BUY', limit = 5000, walletAddresses } = options;
  
  // Build the query
  let query = `
    SELECT 
      id,
      wallet_address,
      timestamp,
      side,
      outcome,
      price,
      size,
      usd_size,
      condition_id,
      market_slug,
      title,
      asset
    FROM \`${PROJECT_ID}.${DATASET}.trades\`
    WHERE timestamp >= @startDate
      AND timestamp <= @endDate
      AND side = @side
  `;
  
  if (walletAddresses && walletAddresses.length > 0) {
    query += ` AND wallet_address IN UNNEST(@walletAddresses)`;
  }
  
  query += `
    ORDER BY timestamp ASC
    LIMIT @limit
  `;
  
  const queryOptions = {
    query,
    params: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      side,
      limit,
      walletAddresses: walletAddresses || [],
    },
  };
  
  console.log(`[BigQuery] Fetching trades from ${startDate.toISOString()} to ${endDate.toISOString()}`);
  
  const [rows] = await client.query(queryOptions);
  
  console.log(`[BigQuery] Found ${rows.length} trades`);
  
  return rows as BigQueryTrade[];
}

/**
 * Fetch market resolution data from BigQuery
 * 
 * @param conditionIds Array of market condition IDs
 * @returns Map of condition_id to market data
 */
export async function fetchMarketResolutions(
  conditionIds: string[]
): Promise<Map<string, BigQueryMarket>> {
  if (conditionIds.length === 0) {
    return new Map();
  }
  
  const client = getBigQueryClient();
  
  // Batch into chunks of 1000 for BigQuery
  const batchSize = 1000;
  const results = new Map<string, BigQueryMarket>();
  
  for (let i = 0; i < conditionIds.length; i += batchSize) {
    const batch = conditionIds.slice(i, i + batchSize);
    
    const query = `
      SELECT 
        condition_id,
        title,
        market_slug,
        status,
        closed,
        resolved_outcome,
        winning_side,
        close_time,
        end_time
      FROM \`${PROJECT_ID}.${DATASET}.markets\`
      WHERE condition_id IN UNNEST(@conditionIds)
    `;
    
    const [rows] = await client.query({
      query,
      params: { conditionIds: batch },
    });
    
    for (const row of rows) {
      results.set(row.condition_id, row as BigQueryMarket);
    }
  }
  
  console.log(`[BigQuery] Fetched ${results.size} market resolutions for ${conditionIds.length} condition IDs`);
  
  return results;
}

/**
 * Get top traders by PnL from BigQuery
 * 
 * @param limit Number of traders to return
 * @param minTrades Minimum number of trades required
 * @returns Array of wallet addresses
 */
export async function fetchTopTraders(
  limit: number = 50,
  minTrades: number = 10
): Promise<string[]> {
  const client = getBigQueryClient();
  
  const query = `
    SELECT 
      wallet_address,
      COUNT(*) as trade_count,
      SUM(CASE WHEN side = 'BUY' THEN usd_size ELSE -usd_size END) as total_volume
    FROM \`${PROJECT_ID}.${DATASET}.trades\`
    GROUP BY wallet_address
    HAVING COUNT(*) >= @minTrades
    ORDER BY total_volume DESC
    LIMIT @limit
  `;
  
  const [rows] = await client.query({
    query,
    params: { minTrades, limit },
  });
  
  return rows.map((r: any) => r.wallet_address);
}

/**
 * Get trade statistics for a date range
 */
export async function getTradeStats(
  startDate: Date,
  endDate: Date
): Promise<{
  totalTrades: number;
  uniqueMarkets: number;
  uniqueTraders: number;
  totalVolume: number;
}> {
  const client = getBigQueryClient();
  
  const query = `
    SELECT 
      COUNT(*) as total_trades,
      COUNT(DISTINCT condition_id) as unique_markets,
      COUNT(DISTINCT wallet_address) as unique_traders,
      SUM(usd_size) as total_volume
    FROM \`${PROJECT_ID}.${DATASET}.trades\`
    WHERE timestamp >= @startDate
      AND timestamp <= @endDate
      AND side = 'BUY'
  `;
  
  const [rows] = await client.query({
    query,
    params: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
  });
  
  const row = rows[0] || {};
  return {
    totalTrades: Number(row.total_trades) || 0,
    uniqueMarkets: Number(row.unique_markets) || 0,
    uniqueTraders: Number(row.unique_traders) || 0,
    totalVolume: Number(row.total_volume) || 0,
  };
}
