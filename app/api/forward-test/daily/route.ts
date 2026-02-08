import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'gen-lang-client-0299056258';
const DATASET = 'polycopy_v1';

const bigquery = new BigQuery({
  projectId: PROJECT_ID,
});

// Forward test configurations
const CONFIGS = [
  {
    config_id: 'MODEL_50',
    model_threshold: 0.50,
    price_min: 0.0,
    price_max: 1.0,
    min_edge: 0.0,
    use_model: true,
  },
  {
    config_id: 'UNDERDOG_M50_E5',
    model_threshold: 0.50,
    price_min: 0.0,
    price_max: 0.50,
    min_edge: 0.05,
    use_model: true,
  },
  {
    config_id: 'BALANCED_MODEL50',
    model_threshold: 0.50,
    price_min: 0.30,
    price_max: 0.70,
    min_edge: 0.0,
    use_model: true,
  },
  {
    config_id: 'FAVORITES_95ct',
    model_threshold: 0.0,
    price_min: 0.95,
    price_max: 1.0,
    min_edge: 0.0,
    use_model: false,
  },
];

export async function POST() {
  try {
    // Clear existing data and repopulate
    await bigquery.query({
      query: `DELETE FROM \`${PROJECT_ID}.${DATASET}.forward_test_daily\` WHERE TRUE`,
    });

    for (const cfg of CONFIGS) {
      const query = cfg.use_model
        ? `
          INSERT INTO \`${PROJECT_ID}.${DATASET}.forward_test_daily\`
          (config_id, trade_date, total_trades, won_trades, lost_trades, win_rate, avg_pnl, total_pnl, avg_entry_price, created_at)
          SELECT 
            '${cfg.config_id}' as config_id,
            DATE(t.trade_time) as trade_date,
            COUNT(*) as total_trades,
            COUNTIF(t.outcome = 'WON') as won_trades,
            COUNTIF(t.outcome = 'LOST') as lost_trades,
            SAFE_DIVIDE(COUNTIF(t.outcome = 'WON'), COUNT(*)) as win_rate,
            AVG(CASE WHEN t.outcome = 'WON' THEN (1 - t.entry_price) / t.entry_price ELSE -1 END) as avg_pnl,
            SUM(CASE WHEN t.outcome = 'WON' THEN (1 - t.entry_price) / t.entry_price ELSE -1 END) as total_pnl,
            AVG(t.entry_price) as avg_entry_price,
            CURRENT_TIMESTAMP() as created_at
          FROM \`${PROJECT_ID}.${DATASET}.trade_predictions_pnl_weighted\` p
          JOIN \`${PROJECT_ID}.${DATASET}.trader_stats_at_trade\` t ON p.trade_key = t.trade_key
          WHERE t.trade_time >= '2026-02-01'
            AND t.stat_confidence IN ('HIGH', 'MEDIUM')
            AND t.outcome IN ('WON', 'LOST')
            AND p.model_win_probability >= ${cfg.model_threshold}
            AND t.entry_price >= ${cfg.price_min}
            AND t.entry_price <= ${cfg.price_max}
            AND (t.L_win_rate - t.entry_price) >= ${cfg.min_edge}
          GROUP BY DATE(t.trade_time)
        `
        : `
          INSERT INTO \`${PROJECT_ID}.${DATASET}.forward_test_daily\`
          (config_id, trade_date, total_trades, won_trades, lost_trades, win_rate, avg_pnl, total_pnl, avg_entry_price, created_at)
          SELECT 
            '${cfg.config_id}' as config_id,
            DATE(t.trade_time) as trade_date,
            COUNT(*) as total_trades,
            COUNTIF(t.outcome = 'WON') as won_trades,
            COUNTIF(t.outcome = 'LOST') as lost_trades,
            SAFE_DIVIDE(COUNTIF(t.outcome = 'WON'), COUNT(*)) as win_rate,
            AVG(CASE WHEN t.outcome = 'WON' THEN (1 - t.entry_price) / t.entry_price ELSE -1 END) as avg_pnl,
            SUM(CASE WHEN t.outcome = 'WON' THEN (1 - t.entry_price) / t.entry_price ELSE -1 END) as total_pnl,
            AVG(t.entry_price) as avg_entry_price,
            CURRENT_TIMESTAMP() as created_at
          FROM \`${PROJECT_ID}.${DATASET}.trader_stats_at_trade\` t
          WHERE t.trade_time >= '2026-02-01'
            AND t.stat_confidence IN ('HIGH', 'MEDIUM')
            AND t.outcome IN ('WON', 'LOST')
            AND t.entry_price >= ${cfg.price_min}
            AND t.entry_price <= ${cfg.price_max}
          GROUP BY DATE(t.trade_time)
        `;

      await bigquery.query({ query });
    }

    return NextResponse.json({ success: true, message: 'Daily data refreshed' });
  } catch (error) {
    console.error('Forward test daily update error:', error);
    return NextResponse.json(
      { error: 'Failed to update daily forward test data' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Get daily breakdown for all configs
    const query = `
      SELECT 
        config_id,
        trade_date,
        total_trades,
        won_trades,
        lost_trades,
        win_rate,
        avg_pnl,
        total_pnl,
        avg_entry_price
      FROM \`${PROJECT_ID}.${DATASET}.forward_test_daily\`
      ORDER BY config_id, trade_date
    `;

    const [rows] = await bigquery.query({ query });

    // Group by config
    const byConfig: Record<string, typeof rows> = {};
    for (const row of rows) {
      if (!byConfig[row.config_id]) {
        byConfig[row.config_id] = [];
      }
      byConfig[row.config_id].push(row);
    }

    // Calculate cumulative totals
    const summary = Object.entries(byConfig).map(([config_id, days]) => {
      const totalTrades = days.reduce((sum, d) => sum + d.total_trades, 0);
      const wonTrades = days.reduce((sum, d) => sum + d.won_trades, 0);
      const lostTrades = days.reduce((sum, d) => sum + d.lost_trades, 0);
      const totalPnl = days.reduce((sum, d) => sum + d.total_pnl, 0);

      return {
        config_id,
        total_trades: totalTrades,
        won_trades: wonTrades,
        lost_trades: lostTrades,
        win_rate: totalTrades > 0 ? wonTrades / totalTrades : 0,
        total_pnl: totalPnl,
        avg_pnl: totalTrades > 0 ? totalPnl / totalTrades : 0,
        days: days.length,
      };
    });

    return NextResponse.json({
      success: true,
      daily: byConfig,
      summary: summary.sort((a, b) => b.total_pnl - a.total_pnl),
    });
  } catch (error) {
    console.error('Forward test daily fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch daily forward test data' },
      { status: 500 }
    );
  }
}
