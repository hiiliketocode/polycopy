import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'gen-lang-client-0299056258';
const DATASET = 'polycopy_v1';

const bigquery = new BigQuery({
  projectId: PROJECT_ID,
});

// Config definitions
const CONFIGS = [
  { config_id: 'MODEL_50', price_min: 0.0, price_max: 1.0, min_edge: 0.0, min_wr: 0.50, min_trades: 50 },
  { config_id: 'UNDERDOG_M50_E5', price_min: 0.0, price_max: 0.50, min_edge: 0.05, min_wr: 0.50, min_trades: 50 },
  { config_id: 'BALANCED_MODEL50', price_min: 0.30, price_max: 0.70, min_edge: 0.0, min_wr: 0.50, min_trades: 50 },
  { config_id: 'FAVORITES_95ct', price_min: 0.95, price_max: 1.0, min_edge: -999, min_wr: 0.0, min_trades: 0 },
];

export async function GET() {
  try {
    // Get live signals summary by config
    const summaryQuery = `
      SELECT 
        config_id,
        COUNT(*) as total_signals,
        COUNTIF(outcome IS NULL) as open_positions,
        COUNTIF(outcome = 'WON') as won,
        COUNTIF(outcome = 'LOST') as lost,
        AVG(entry_price) as avg_entry_price,
        AVG(edge) as avg_edge,
        AVG(trader_win_rate) as avg_trader_wr,
        SUM(CASE 
          WHEN outcome = 'WON' THEN (1 - entry_price) / entry_price 
          WHEN outcome = 'LOST' THEN -1 
          ELSE 0 
        END) as realized_pnl,
        MIN(trade_time) as earliest_trade,
        MAX(trade_time) as latest_trade
      FROM \`${PROJECT_ID}.${DATASET}.live_signals\`
      GROUP BY config_id
      ORDER BY total_signals DESC
    `;

    const [summary] = await bigquery.query({ query: summaryQuery });

    // Get recent signals (last 100 per config)
    const recentQuery = `
      SELECT 
        config_id,
        signal_id,
        wallet_address,
        market_slug,
        entry_price,
        side,
        trade_time,
        trader_win_rate,
        edge,
        outcome
      FROM \`${PROJECT_ID}.${DATASET}.live_signals\`
      WHERE outcome IS NULL
      ORDER BY trade_time DESC
      LIMIT 100
    `;

    const [recent] = await bigquery.query({ query: recentQuery });

    return NextResponse.json({
      success: true,
      summary,
      open_positions: recent,
      last_updated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Live forward test fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch live forward test data' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'refresh';

    if (action === 'check_resolutions') {
      // Update outcomes for signals where market has resolved
      const updateQuery = `
        UPDATE \`${PROJECT_ID}.${DATASET}.live_signals\` s
        SET 
          outcome = CASE 
            WHEN m.winning_label = s.side THEN 'WON'
            WHEN m.winning_label IS NOT NULL AND m.winning_label != '' THEN 'LOST'
            ELSE s.outcome
          END,
          resolved_time = CASE 
            WHEN m.winning_label IS NOT NULL AND m.winning_label != '' THEN CURRENT_TIMESTAMP()
            ELSE s.resolved_time
          END,
          pnl = CASE 
            WHEN m.winning_label = s.side THEN (1 - s.entry_price) / s.entry_price
            WHEN m.winning_label IS NOT NULL AND m.winning_label != '' THEN -1
            ELSE s.pnl
          END,
          last_checked_at = CURRENT_TIMESTAMP()
        FROM \`${PROJECT_ID}.${DATASET}.markets\` m
        WHERE s.market_slug = m.market_slug
          AND s.outcome IS NULL
          AND m.winning_label IS NOT NULL 
          AND m.winning_label != ''
      `;

      await bigquery.query({ query: updateQuery });

      // Count updates
      const countQuery = `
        SELECT 
          config_id,
          COUNTIF(outcome IS NULL) as still_open,
          COUNTIF(outcome IS NOT NULL) as resolved
        FROM \`${PROJECT_ID}.${DATASET}.live_signals\`
        GROUP BY config_id
      `;

      const [counts] = await bigquery.query({ query: countQuery });

      return NextResponse.json({
        success: true,
        action: 'check_resolutions',
        results: counts,
      });
    }

    if (action === 'add_new_signals') {
      // Add signals for new trades
      let totalAdded = 0;

      for (const cfg of CONFIGS) {
        const insertQuery = `
          INSERT INTO \`${PROJECT_ID}.${DATASET}.live_signals\`
          (signal_id, config_id, trade_id, wallet_address, market_slug, condition_id,
           entry_price, side, shares, trade_time, model_win_probability, trader_win_rate,
           trader_trades, edge, outcome, signal_created_at, last_checked_at)
          WITH trader_stats AS (
            SELECT 
              wallet_address, 
              L_win_rate, 
              L_resolved_count,
              ROW_NUMBER() OVER (PARTITION BY wallet_address ORDER BY trade_time DESC) as rn
            FROM \`${PROJECT_ID}.${DATASET}.trader_stats_at_trade\`
            WHERE stat_confidence IN ('HIGH', 'MEDIUM')
          )
          SELECT
            CONCAT('${cfg.config_id}', '_', t.id) as signal_id,
            '${cfg.config_id}' as config_id,
            t.id as trade_id,
            t.wallet_address,
            t.market_slug,
            t.condition_id,
            t.price as entry_price,
            t.side,
            t.shares_normalized as shares,
            t.timestamp as trade_time,
            CAST(COALESCE(ts.L_win_rate, 0.5) AS FLOAT64) as model_win_probability,
            CAST(COALESCE(ts.L_win_rate, 0.5) AS FLOAT64) as trader_win_rate,
            CAST(COALESCE(ts.L_resolved_count, 0) AS INT64) as trader_trades,
            CAST((COALESCE(ts.L_win_rate, 0.5) - t.price) AS FLOAT64) as edge,
            CAST(NULL AS STRING) as outcome,
            CURRENT_TIMESTAMP() as signal_created_at,
            CURRENT_TIMESTAMP() as last_checked_at
          FROM \`${PROJECT_ID}.${DATASET}.trades\` t
          LEFT JOIN trader_stats ts ON t.wallet_address = ts.wallet_address AND ts.rn = 1
          WHERE t.timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
            AND t.price >= ${cfg.price_min}
            AND t.price <= ${cfg.price_max}
            AND (COALESCE(ts.L_win_rate, 0.5) - t.price) >= ${cfg.min_edge}
            AND COALESCE(ts.L_win_rate, 0) >= ${cfg.min_wr}
            AND COALESCE(ts.L_resolved_count, 0) >= ${cfg.min_trades}
            AND NOT EXISTS (
              SELECT 1 FROM \`${PROJECT_ID}.${DATASET}.live_signals\` s
              WHERE s.signal_id = CONCAT('${cfg.config_id}', '_', t.id)
            )
        `;

        try {
          const [job] = await bigquery.createQueryJob({ query: insertQuery });
          await job.getQueryResults();
        } catch (e) {
          console.error(`Error adding signals for ${cfg.config_id}:`, e);
        }
      }

      return NextResponse.json({
        success: true,
        action: 'add_new_signals',
        message: 'New signals added',
      });
    }

    // Default: refresh all (add new + check resolutions)
    // First add new signals, then check resolutions
    const refreshResponse = await fetch(request.url, {
      method: 'POST',
      body: JSON.stringify({ action: 'add_new_signals' }),
    });

    const checkResponse = await fetch(request.url, {
      method: 'POST', 
      body: JSON.stringify({ action: 'check_resolutions' }),
    });

    return NextResponse.json({
      success: true,
      action: 'refresh',
      message: 'Signals refreshed and resolutions checked',
    });
  } catch (error) {
    console.error('Live forward test update error:', error);
    return NextResponse.json(
      { error: 'Failed to update live forward test' },
      { status: 500 }
    );
  }
}
