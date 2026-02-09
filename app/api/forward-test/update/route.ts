import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'gen-lang-client-0299056258';
const DATASET = 'polycopy_v1';

const bigquery = new BigQuery({
  projectId: PROJECT_ID,
});

// Forward test configurations - aligned with ft_wallets strategies + FT learnings
const CONFIGS = [
  // Original BigQuery configs
  { config_id: 'MODEL_50', model_threshold: 0.50, price_min: 0.0, price_max: 1.0, min_edge: 0.0, use_model: true },
  { config_id: 'UNDERDOG_M50_E5', model_threshold: 0.50, price_min: 0.0, price_max: 0.50, min_edge: 0.05, use_model: true },
  { config_id: 'BALANCED_MODEL50', model_threshold: 0.50, price_min: 0.30, price_max: 0.70, min_edge: 0.0, use_model: true },
  { config_id: 'FAVORITES_95ct', model_threshold: 0.0, price_min: 0.95, price_max: 1.0, min_edge: 0.0, use_model: false },
  // FT core strategies (from ft_wallets)
  { config_id: 'MODEL_ONLY', model_threshold: 0.55, price_min: 0.0, price_max: 1.0, min_edge: 0.0, use_model: true },
  { config_id: 'HIGH_CONVICTION', model_threshold: 0.0, price_min: 0.0, price_max: 0.50, min_edge: 0.0, use_model: false },
  { config_id: 'UNDERDOG_HUNTER', model_threshold: 0.50, price_min: 0.0, price_max: 0.50, min_edge: 0.05, use_model: true },
  { config_id: 'FAVORITE_GRINDER', model_threshold: 0.0, price_min: 0.50, price_max: 0.90, min_edge: 0.03, use_model: false },
  { config_id: 'MODEL_BALANCED', model_threshold: 0.50, price_min: 0.0, price_max: 1.0, min_edge: 0.05, use_model: true },
  { config_id: 'SHARP_SHOOTER', model_threshold: 0.55, price_min: 0.10, price_max: 0.70, min_edge: 0.10, use_model: true },
  // FT learnings strategies (Feb 2026)
  { config_id: 'LEARNINGS_SWEET_SPOT', model_threshold: 0.55, price_min: 0.20, price_max: 0.40, min_edge: 0.05, use_model: true },
  { config_id: 'LEARNINGS_ML_60', model_threshold: 0.60, price_min: 0.0, price_max: 1.0, min_edge: 0.05, use_model: true },
  // ML threshold sweep (pure unfiltered ML - find sweet spot)
  { config_id: 'ML_SWEEP_50', model_threshold: 0.50, price_min: 0.0, price_max: 1.0, min_edge: 0.0, use_model: true },
  { config_id: 'ML_SWEEP_55', model_threshold: 0.55, price_min: 0.0, price_max: 1.0, min_edge: 0.0, use_model: true },
  { config_id: 'ML_SWEEP_60', model_threshold: 0.60, price_min: 0.0, price_max: 1.0, min_edge: 0.0, use_model: true },
  { config_id: 'ML_SWEEP_65', model_threshold: 0.65, price_min: 0.0, price_max: 1.0, min_edge: 0.0, use_model: true },
  { config_id: 'ML_SWEEP_70', model_threshold: 0.70, price_min: 0.0, price_max: 1.0, min_edge: 0.0, use_model: true },
  // ML context strategies (best band + context; BigQuery has no market_categories/live filters)
  { config_id: 'ML_CTX_SWEET_SPOT', model_threshold: 0.60, price_min: 0.20, price_max: 0.40, min_edge: 0.05, use_model: true },
  { config_id: 'ML_CTX_NO_CRYPTO', model_threshold: 0.60, price_min: 0.0, price_max: 1.0, min_edge: 0.05, use_model: true },
  { config_id: 'ML_CTX_SPORTS', model_threshold: 0.60, price_min: 0.20, price_max: 0.70, min_edge: 0.05, use_model: true },
  { config_id: 'ML_CTX_POLITICS', model_threshold: 0.60, price_min: 0.0, price_max: 1.0, min_edge: 0.05, use_model: true },
  { config_id: 'ML_CTX_ML_SCALED', model_threshold: 0.60, price_min: 0.20, price_max: 0.40, min_edge: 0.05, use_model: true },
  { config_id: 'ML_CTX_65_NO_CRYPTO', model_threshold: 0.65, price_min: 0.0, price_max: 1.0, min_edge: 0.05, use_model: true },
  { config_id: 'ML_CTX_FAVORITES', model_threshold: 0.60, price_min: 0.55, price_max: 0.85, min_edge: 0.05, use_model: true },
];

export async function POST() {
  try {
    const results = [];
    const today = new Date().toISOString().split('T')[0];

    for (const cfg of CONFIGS) {
      // Different query based on whether we use the model or not
      const query = cfg.use_model 
        ? `
          SELECT 
            COUNT(*) as total_trades,
            COUNTIF(t.outcome = 'WON') as won_trades,
            COUNTIF(t.outcome = 'LOST') as lost_trades,
            SAFE_DIVIDE(COUNTIF(t.outcome = 'WON'), COUNT(*)) as win_rate,
            AVG(CASE WHEN t.outcome = 'WON' THEN (1 - t.entry_price) / t.entry_price ELSE -1 END) as avg_pnl,
            SUM(CASE WHEN t.outcome = 'WON' THEN (1 - t.entry_price) / t.entry_price ELSE -1 END) as total_pnl
          FROM \`${PROJECT_ID}.${DATASET}.trade_predictions_pnl_weighted\` p
          JOIN \`${PROJECT_ID}.${DATASET}.trader_stats_at_trade\` t
            ON p.trade_key = t.trade_key
          WHERE t.trade_time >= '2026-02-01'
            AND t.stat_confidence IN ('HIGH', 'MEDIUM')
            AND t.outcome IN ('WON', 'LOST')
            AND p.model_win_probability >= ${cfg.model_threshold}
            AND t.entry_price >= ${cfg.price_min}
            AND t.entry_price <= ${cfg.price_max}
            AND (t.L_win_rate - t.entry_price) >= ${cfg.min_edge}
        `
        : `
          SELECT 
            COUNT(*) as total_trades,
            COUNTIF(t.outcome = 'WON') as won_trades,
            COUNTIF(t.outcome = 'LOST') as lost_trades,
            SAFE_DIVIDE(COUNTIF(t.outcome = 'WON'), COUNT(*)) as win_rate,
            AVG(CASE WHEN t.outcome = 'WON' THEN (1 - t.entry_price) / t.entry_price ELSE -1 END) as avg_pnl,
            SUM(CASE WHEN t.outcome = 'WON' THEN (1 - t.entry_price) / t.entry_price ELSE -1 END) as total_pnl
          FROM \`${PROJECT_ID}.${DATASET}.trader_stats_at_trade\` t
          WHERE t.trade_time >= '2026-02-01'
            AND t.stat_confidence IN ('HIGH', 'MEDIUM')
            AND t.outcome IN ('WON', 'LOST')
            AND t.entry_price >= ${cfg.price_min}
            AND t.entry_price <= ${cfg.price_max}
        `;

      const [rows] = await bigquery.query({ query });
      
      if (rows.length > 0 && rows[0].total_trades > 0) {
        const row = rows[0];
        
        // Insert into tracking table
        const insertQuery = `
          INSERT INTO \`${PROJECT_ID}.${DATASET}.forward_test_results\`
          (config_id, snapshot_date, period_start, period_end, total_trades, won_trades, lost_trades, 
           win_rate, avg_pnl_pct, total_pnl, created_at)
          VALUES (
            '${cfg.config_id}',
            DATE('${today}'),
            DATE('2026-02-01'),
            DATE('${today}'),
            ${row.total_trades},
            ${row.won_trades},
            ${row.lost_trades},
            ${row.win_rate},
            ${row.avg_pnl},
            ${row.total_pnl},
            CURRENT_TIMESTAMP()
          )
        `;
        
        await bigquery.query({ query: insertQuery });
        
        results.push({
          config_id: cfg.config_id,
          total_trades: row.total_trades,
          won_trades: row.won_trades,
          lost_trades: row.lost_trades,
          win_rate: row.win_rate,
          avg_pnl: row.avg_pnl,
          total_pnl: row.total_pnl,
        });
      }
    }

    return NextResponse.json({
      success: true,
      snapshot_date: today,
      results,
    });
  } catch (error) {
    console.error('Forward test update error:', error);
    return NextResponse.json(
      { error: 'Failed to update forward test results' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Get latest results for each config
    const query = `
      WITH latest AS (
        SELECT 
          config_id,
          MAX(snapshot_date) as latest_date
        FROM \`${PROJECT_ID}.${DATASET}.forward_test_results\`
        GROUP BY config_id
      )
      SELECT r.*
      FROM \`${PROJECT_ID}.${DATASET}.forward_test_results\` r
      JOIN latest l ON r.config_id = l.config_id AND r.snapshot_date = l.latest_date
      ORDER BY r.total_pnl DESC
    `;

    const [rows] = await bigquery.query({ query });

    // Get historical data for charts
    const historyQuery = `
      SELECT 
        config_id,
        snapshot_date,
        total_trades,
        win_rate,
        avg_pnl_pct,
        total_pnl
      FROM \`${PROJECT_ID}.${DATASET}.forward_test_results\`
      ORDER BY config_id, snapshot_date
    `;

    const [history] = await bigquery.query({ query: historyQuery });

    return NextResponse.json({
      success: true,
      latest: rows,
      history,
    });
  } catch (error) {
    console.error('Forward test fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch forward test results' },
      { status: 500 }
    );
  }
}
