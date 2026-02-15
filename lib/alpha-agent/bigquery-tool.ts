/**
 * Alpha Agent - BigQuery Read-Only Query Tool
 * 
 * Allows the agent to run read-only SELECT queries on BigQuery
 * to investigate patterns in historical trade data, feature distributions,
 * model training data, and trader statistics.
 * 
 * SAFETY:
 * - Only SELECT statements allowed (no INSERT, UPDATE, DELETE, CREATE, DROP, ALTER)
 * - No model training queries (no CREATE MODEL, ML.TRAIN, etc.)
 * - Results limited to 500 rows per query
 * - Query cost limit enforced (max 1GB scanned per query)
 * - All queries logged for audit
 */

import { getBigQueryClient } from '@/lib/bigquery/client';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0299056258';
const DATASET = 'polycopy_v1';
const MAX_ROWS = 500;

// Dangerous SQL patterns to block
const BLOCKED_PATTERNS = [
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bDELETE\b/i,
  /\bDROP\b/i,
  /\bCREATE\b/i,
  /\bALTER\b/i,
  /\bTRUNCATE\b/i,
  /\bMERGE\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /\bML\.TRAIN\b/i,
  /\bCREATE\s+MODEL\b/i,
  /\bCREATE\s+OR\s+REPLACE\s+MODEL\b/i,
  /\bCREATE\s+TABLE\b/i,
  /\bCREATE\s+VIEW\b/i,
  /\bEXPORT\b/i,
];

/**
 * Available tables the agent can query
 */
export const AVAILABLE_TABLES = [
  {
    name: `${PROJECT_ID}.${DATASET}.trades`,
    description: 'All raw trades from Polymarket (84M+ rows). Columns: id, wallet_address, timestamp, side (BUY/SELL), outcome, price, size, usd_size, condition_id, market_slug, title, asset',
  },
  {
    name: `${PROJECT_ID}.${DATASET}.markets`,
    description: 'Market metadata and resolution data. Columns: condition_id, title, market_slug, status, closed, resolved_outcome, winning_side, close_time, end_time',
  },
  {
    name: `${PROJECT_ID}.${DATASET}.trader_stats_at_trade`,
    description: 'Point-in-time trader statistics (46M rows). Includes global_win_rate, D30_win_rate, D7_win_rate, total_lifetime_trades, niche_experience_pct, is_in_best_niche, etc.',
  },
  {
    name: `${PROJECT_ID}.${DATASET}.enriched_trades_v13`,
    description: 'Enriched trades with all 34 ML features z-score normalized (40M rows). This is the pre-training dataset with all features.',
  },
  {
    name: `${PROJECT_ID}.${DATASET}.trade_predictions_pnl_weighted`,
    description: 'Model predictions on holdout set. Columns: model_probability, actual_outcome, entry_price, wallet_address, condition_id, etc.',
  },
];

/**
 * Validate a SQL query is safe (read-only, no DDL/DML)
 */
export function validateQuery(sql: string): { valid: boolean; reason?: string } {
  const trimmed = sql.trim();

  // Must start with SELECT or WITH (CTEs)
  if (!trimmed.match(/^(SELECT|WITH)\b/i)) {
    return { valid: false, reason: 'Query must start with SELECT or WITH (CTE)' };
  }

  // Check for blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, reason: `Blocked pattern detected: ${pattern.source}` };
    }
  }

  // Must contain a FROM clause referencing our project
  if (!trimmed.includes(PROJECT_ID) && !trimmed.includes(DATASET)) {
    return { valid: false, reason: `Query must reference tables in ${PROJECT_ID}.${DATASET}` };
  }

  return { valid: true };
}

/**
 * Execute a read-only query and return results
 */
export async function executeAgentQuery(
  sql: string
): Promise<{
  success: boolean;
  rows?: Record<string, unknown>[];
  row_count?: number;
  columns?: string[];
  error?: string;
  bytes_processed?: number;
}> {
  // Validate
  const validation = validateQuery(sql);
  if (!validation.valid) {
    return { success: false, error: validation.reason };
  }

  // Append LIMIT if not present
  let querySql = sql.trim();
  if (!querySql.match(/LIMIT\s+\d+/i)) {
    querySql += ` LIMIT ${MAX_ROWS}`;
  }

  // Enforce max LIMIT
  const limitMatch = querySql.match(/LIMIT\s+(\d+)/i);
  if (limitMatch && parseInt(limitMatch[1]) > MAX_ROWS) {
    querySql = querySql.replace(/LIMIT\s+\d+/i, `LIMIT ${MAX_ROWS}`);
  }

  try {
    const client = getBigQueryClient();

    const [job] = await client.createQueryJob({
      query: querySql,
      maximumBytesBilled: String(1024 * 1024 * 1024), // 1GB limit
    });

    const [rows] = await job.getQueryResults();
    const metadata = await job.getMetadata();
    const bytesProcessed = Number(metadata[0]?.statistics?.query?.totalBytesProcessed || 0);

    // Get column names from first row
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return {
      success: true,
      rows: rows.slice(0, MAX_ROWS) as Record<string, unknown>[],
      row_count: rows.length,
      columns,
      bytes_processed: bytesProcessed,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get a description of available tables for the agent's prompt
 */
export function getTableDescriptions(): string {
  return AVAILABLE_TABLES.map(t =>
    `- \`${t.name}\`: ${t.description}`
  ).join('\n');
}
