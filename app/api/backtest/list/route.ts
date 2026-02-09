import { NextRequest, NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'gen-lang-client-0299056258';
const DATASET = 'polycopy_v1';

// Initialize BigQuery client
function getBigQueryClient() {
  // Check for credentials in environment
  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  
  if (credentials) {
    return new BigQuery({
      projectId: PROJECT_ID,
      credentials: JSON.parse(credentials),
    });
  }
  
  // Fall back to default credentials
  return new BigQuery({ projectId: PROJECT_ID });
}

export async function GET(request: NextRequest) {
  try {
    const client = getBigQueryClient();
    
    const query = `
      SELECT 
        run_id,
        run_name,
        created_at,
        status,
        strategy_type,
        start_date,
        end_date,
        initial_capital,
        total_trades,
        winning_trades,
        total_return_pct,
        sharpe_ratio,
        max_drawdown_pct,
        final_capital,
        description
      FROM \`${PROJECT_ID}.${DATASET}.backtest_runs\`
      ORDER BY created_at DESC
      LIMIT 100
    `;
    
    const [rows] = await client.query(query);
    
    // Helper to safely convert BigQuery timestamps to ISO strings
    const toISOString = (val: any): string => {
      if (!val) return '';
      if (typeof val === 'string') return val;
      if (val.value) return typeof val.value === 'string' ? val.value : new Date(val.value).toISOString();
      if (val instanceof Date) return val.toISOString();
      // BigQuery BigQueryTimestamp has a .toISOString() method
      if (typeof val.toISOString === 'function') return val.toISOString();
      return String(val);
    };
    
    // Convert BigQuery results to plain objects
    const runs = rows.map((row: any) => ({
      run_id: row.run_id,
      run_name: row.run_name,
      created_at: toISOString(row.created_at),
      status: row.status,
      strategy_type: row.strategy_type,
      start_date: toISOString(row.start_date),
      end_date: toISOString(row.end_date),
      initial_capital: row.initial_capital,
      total_trades: row.total_trades,
      winning_trades: row.winning_trades,
      total_return_pct: row.total_return_pct,
      sharpe_ratio: row.sharpe_ratio,
      max_drawdown_pct: row.max_drawdown_pct,
      final_capital: row.final_capital,
      description: row.description,
    }));
    
    return NextResponse.json({ runs });
  } catch (error) {
    console.error('Error fetching backtest runs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch backtest runs', message: String(error) },
      { status: 500 }
    );
  }
}
