#!/usr/bin/env node
'use strict';

/**
 * Conviction Score vs Trade Performance Analysis
 * 
 * Analyzes historical trade data to show how conviction scores
 * correlate with win rates and ROI across different price brackets.
 * 
 * Usage:
 *   node scripts/analyze-conviction-performance.js
 * 
 * Requires:
 *   - GOOGLE_APPLICATION_CREDENTIALS or GCP_SERVICE_ACCOUNT_KEY
 *   - BigQuery access to polycopy_v1 dataset
 */

const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');
const fs = require('fs');

// Load environment
const dotenv = require('dotenv');
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Initialize BigQuery client
let bigquery;
try {
  if (process.env.GCP_SERVICE_ACCOUNT_KEY) {
    const credentials = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY);
    bigquery = new BigQuery({
      projectId: credentials.project_id,
      credentials,
    });
  } else {
    bigquery = new BigQuery();
  }
} catch (err) {
  console.error('Failed to initialize BigQuery client:', err.message);
  process.exit(1);
}

const PROJECT_ID = 'gen-lang-client-0299056258';
const DATASET = 'polycopy_v1';

// ============================================================================
// QUERY DEFINITIONS
// ============================================================================

const QUERIES = {
  // Analysis 1: Win rate by conviction bucket
  convictionWinRate: `
    WITH trade_outcomes AS (
      SELECT
        CASE 
          WHEN conviction_z_score < -2 THEN '1. Very Low (<-2σ)'
          WHEN conviction_z_score < -1 THEN '2. Low (-2σ to -1σ)'
          WHEN conviction_z_score < -0.5 THEN '3. Below Avg (-1σ to -0.5σ)'
          WHEN conviction_z_score < 0.5 THEN '4. Average (-0.5σ to 0.5σ)'
          WHEN conviction_z_score < 1 THEN '5. Above Avg (0.5σ to 1σ)'
          WHEN conviction_z_score < 2 THEN '6. High (1σ to 2σ)'
          ELSE '7. Very High (>2σ)'
        END as conviction_bucket,
        outcome,
        entry_price
      FROM \`${PROJECT_ID}.${DATASET}.enriched_trades_training_v11\`
      WHERE conviction_z_score IS NOT NULL
        AND conviction_z_score BETWEEN -10 AND 10
        AND entry_price > 0.01 AND entry_price < 0.99
    )
    SELECT
      conviction_bucket,
      COUNT(*) as total_trades,
      COUNTIF(outcome = 'WON') as wins,
      COUNTIF(outcome = 'LOST') as losses,
      ROUND(SAFE_DIVIDE(COUNTIF(outcome = 'WON'), COUNT(*)) * 100, 1) as win_rate_pct,
      ROUND(AVG(entry_price) * 100, 1) as avg_entry_price_pct
    FROM trade_outcomes
    GROUP BY conviction_bucket
    ORDER BY conviction_bucket
  `,

  // Analysis 2: Full matrix - conviction x price bracket
  convictionPriceMatrix: `
    WITH trade_outcomes AS (
      SELECT
        CASE 
          WHEN conviction_z_score < -1 THEN '1_Low'
          WHEN conviction_z_score < 0 THEN '2_Below'
          WHEN conviction_z_score < 1 THEN '3_Above'
          ELSE '4_High'
        END as conv,
        CASE 
          WHEN entry_price < 0.3 THEN 'Under'
          WHEN entry_price < 0.5 THEN 'L_Mid'
          WHEN entry_price < 0.7 THEN 'H_Mid'
          ELSE 'Fav'
        END as price,
        outcome
      FROM \`${PROJECT_ID}.${DATASET}.enriched_trades_training_v11\`
      WHERE conviction_z_score IS NOT NULL
        AND conviction_z_score BETWEEN -10 AND 10
        AND entry_price > 0.01 AND entry_price < 0.99
    )
    SELECT
      conv as conviction,
      CONCAT(
        ROUND(SAFE_DIVIDE(COUNTIF(price = 'Under' AND outcome = 'WON'), NULLIF(COUNTIF(price = 'Under'), 0)) * 100, 0),
        '% (', COUNTIF(price = 'Under'), ')'
      ) as underdog,
      CONCAT(
        ROUND(SAFE_DIVIDE(COUNTIF(price = 'L_Mid' AND outcome = 'WON'), NULLIF(COUNTIF(price = 'L_Mid'), 0)) * 100, 0),
        '% (', COUNTIF(price = 'L_Mid'), ')'
      ) as low_mid,
      CONCAT(
        ROUND(SAFE_DIVIDE(COUNTIF(price = 'H_Mid' AND outcome = 'WON'), NULLIF(COUNTIF(price = 'H_Mid'), 0)) * 100, 0),
        '% (', COUNTIF(price = 'H_Mid'), ')'
      ) as high_mid,
      CONCAT(
        ROUND(SAFE_DIVIDE(COUNTIF(price = 'Fav' AND outcome = 'WON'), NULLIF(COUNTIF(price = 'Fav'), 0)) * 100, 0),
        '% (', COUNTIF(price = 'Fav'), ')'
      ) as favorite,
      CONCAT(
        ROUND(SAFE_DIVIDE(COUNTIF(outcome = 'WON'), COUNT(*)) * 100, 0),
        '% (', COUNT(*), ')'
      ) as total
    FROM trade_outcomes
    GROUP BY conv
    ORDER BY conv
  `,

  // Analysis 3: ROI by conviction bucket
  convictionRoi: `
    WITH trade_pnl AS (
      SELECT
        CASE 
          WHEN conviction_z_score < -1 THEN '1. Low (<-1σ)'
          WHEN conviction_z_score < 0 THEN '2. Below Avg'
          WHEN conviction_z_score < 1 THEN '3. Above Avg'
          ELSE '4. High (>1σ)'
        END as conviction_bucket,
        outcome,
        entry_price,
        CASE 
          WHEN outcome = 'WON' THEN (1.0 - entry_price) / entry_price
          ELSE -1.0
        END as roi_pct,
        EXP(trade_size_log) - 1 as trade_value_usd
      FROM \`${PROJECT_ID}.${DATASET}.enriched_trades_training_v11\`
      WHERE conviction_z_score IS NOT NULL
        AND conviction_z_score BETWEEN -10 AND 10
        AND entry_price > 0.01 AND entry_price < 0.99
    )
    SELECT
      conviction_bucket,
      COUNT(*) as total_trades,
      ROUND(SAFE_DIVIDE(COUNTIF(outcome = 'WON'), COUNT(*)) * 100, 1) as win_rate_pct,
      ROUND(AVG(roi_pct) * 100, 1) as avg_roi_pct,
      ROUND(SUM(trade_value_usd * roi_pct), 0) as total_pnl_usd,
      ROUND(SUM(trade_value_usd), 0) as total_invested_usd,
      ROUND(SAFE_DIVIDE(SUM(trade_value_usd * roi_pct), SUM(trade_value_usd)) * 100, 1) as weighted_roi_pct
    FROM trade_pnl
    GROUP BY conviction_bucket
    ORDER BY conviction_bucket
  `,

  // Analysis 4: By niche
  convictionByNiche: `
    WITH trade_outcomes AS (
      SELECT
        final_niche,
        CASE 
          WHEN conviction_z_score < 0 THEN 'Low Conviction'
          ELSE 'High Conviction'
        END as conviction_level,
        outcome
      FROM \`${PROJECT_ID}.${DATASET}.enriched_trades_training_v11\`
      WHERE conviction_z_score IS NOT NULL
        AND conviction_z_score BETWEEN -10 AND 10
        AND entry_price > 0.01 AND entry_price < 0.99
        AND final_niche IS NOT NULL
    )
    SELECT
      final_niche,
      COUNTIF(conviction_level = 'Low Conviction') as low_conv_trades,
      ROUND(SAFE_DIVIDE(
        COUNTIF(conviction_level = 'Low Conviction' AND outcome = 'WON'),
        NULLIF(COUNTIF(conviction_level = 'Low Conviction'), 0)
      ) * 100, 1) as low_conv_wr,
      COUNTIF(conviction_level = 'High Conviction') as high_conv_trades,
      ROUND(SAFE_DIVIDE(
        COUNTIF(conviction_level = 'High Conviction' AND outcome = 'WON'),
        NULLIF(COUNTIF(conviction_level = 'High Conviction'), 0)
      ) * 100, 1) as high_conv_wr,
      ROUND(
        SAFE_DIVIDE(
          COUNTIF(conviction_level = 'High Conviction' AND outcome = 'WON'),
          NULLIF(COUNTIF(conviction_level = 'High Conviction'), 0)
        ) -
        SAFE_DIVIDE(
          COUNTIF(conviction_level = 'Low Conviction' AND outcome = 'WON'),
          NULLIF(COUNTIF(conviction_level = 'Low Conviction'), 0)
        ), 0.001
      ) * 100 as wr_diff_pct
    FROM trade_outcomes
    GROUP BY final_niche
    HAVING COUNT(*) >= 1000
    ORDER BY high_conv_trades DESC
    LIMIT 15
  `,

  // Analysis 5: By performance regime
  convictionByRegime: `
    WITH trade_outcomes AS (
      SELECT
        performance_regime,
        CASE 
          WHEN conviction_z_score < 0 THEN 'Below Avg'
          ELSE 'Above Avg'
        END as conviction_level,
        outcome
      FROM \`${PROJECT_ID}.${DATASET}.enriched_trades_training_v11\`
      WHERE conviction_z_score IS NOT NULL
        AND conviction_z_score BETWEEN -10 AND 10
        AND entry_price > 0.01 AND entry_price < 0.99
        AND performance_regime IS NOT NULL
    )
    SELECT
      performance_regime,
      conviction_level,
      COUNT(*) as trades,
      ROUND(SAFE_DIVIDE(COUNTIF(outcome = 'WON'), COUNT(*)) * 100, 1) as win_rate_pct
    FROM trade_outcomes
    GROUP BY performance_regime, conviction_level
    ORDER BY performance_regime, conviction_level
  `,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function runQuery(sql) {
  const [rows] = await bigquery.query({ query: sql, location: 'US' });
  return rows;
}

function printTable(title, rows, columns) {
  console.log('\n' + '═'.repeat(80));
  console.log(`  ${title}`);
  console.log('═'.repeat(80));
  
  if (!rows || rows.length === 0) {
    console.log('  No data found.');
    return;
  }

  // Get column widths
  const widths = {};
  columns.forEach(col => {
    const maxWidth = Math.max(
      col.length,
      ...rows.map(row => String(row[col] ?? '').length)
    );
    widths[col] = Math.min(maxWidth, 20);
  });

  // Print header
  const header = columns.map(col => col.padEnd(widths[col])).join(' │ ');
  console.log('  ' + header);
  console.log('  ' + columns.map(col => '─'.repeat(widths[col])).join('─┼─'));

  // Print rows
  rows.forEach(row => {
    const line = columns.map(col => {
      const val = String(row[col] ?? '');
      return val.substring(0, widths[col]).padEnd(widths[col]);
    }).join(' │ ');
    console.log('  ' + line);
  });
}

function formatNumber(n) {
  if (n === null || n === undefined) return '-';
  if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toFixed(0);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║          CONVICTION SCORE vs TRADE PERFORMANCE ANALYSIS                      ║');
  console.log('║                                                                              ║');
  console.log('║  Conviction = trade_size / trader_avg_trade_size                            ║');
  console.log('║  A conviction of 2x means the trade is 2x the trader\'s typical size         ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  try {
    // Analysis 1: Overall win rate by conviction
    console.log('\n\n📊 ANALYSIS 1: WIN RATE BY CONVICTION BUCKET');
    console.log('   How does conviction correlate with winning?');
    
    const winRateData = await runQuery(QUERIES.convictionWinRate);
    printTable(
      'Win Rate by Conviction (Z-Score Buckets)',
      winRateData,
      ['conviction_bucket', 'total_trades', 'wins', 'losses', 'win_rate_pct', 'avg_entry_price_pct']
    );

    // Analysis 2: Conviction x Price Matrix
    console.log('\n\n📊 ANALYSIS 2: CONVICTION x PRICE BRACKET MATRIX');
    console.log('   Win rates shown as "WR% (N trades)"');
    
    const matrixData = await runQuery(QUERIES.convictionPriceMatrix);
    printTable(
      'Win Rate Matrix: Conviction (rows) x Price (cols)',
      matrixData,
      ['conviction', 'underdog', 'low_mid', 'high_mid', 'favorite', 'total']
    );

    // Analysis 3: ROI by conviction
    console.log('\n\n📊 ANALYSIS 3: ROI BY CONVICTION BUCKET');
    console.log('   Does higher conviction = higher returns?');
    
    const roiData = await runQuery(QUERIES.convictionRoi);
    printTable(
      'ROI and P&L by Conviction Level',
      roiData,
      ['conviction_bucket', 'total_trades', 'win_rate_pct', 'avg_roi_pct', 'weighted_roi_pct', 'total_pnl_usd']
    );

    // Analysis 4: By niche
    console.log('\n\n📊 ANALYSIS 4: CONVICTION IMPACT BY NICHE');
    console.log('   Which niches benefit most from high conviction?');
    
    const nicheData = await runQuery(QUERIES.convictionByNiche);
    printTable(
      'High vs Low Conviction by Niche',
      nicheData,
      ['final_niche', 'low_conv_trades', 'low_conv_wr', 'high_conv_trades', 'high_conv_wr', 'wr_diff_pct']
    );

    // Analysis 5: By performance regime
    console.log('\n\n📊 ANALYSIS 5: CONVICTION x PERFORMANCE REGIME');
    console.log('   Does conviction matter more when HOT or COLD?');
    
    const regimeData = await runQuery(QUERIES.convictionByRegime);
    printTable(
      'Conviction Impact by Performance Streak',
      regimeData,
      ['performance_regime', 'conviction_level', 'trades', 'win_rate_pct']
    );

    // Summary
    console.log('\n\n' + '═'.repeat(80));
    console.log('  KEY INSIGHTS');
    console.log('═'.repeat(80));
    
    // Extract insights
    const lowConv = winRateData.find(r => r.conviction_bucket?.includes('Low'));
    const highConv = winRateData.find(r => r.conviction_bucket?.includes('High (1σ'));
    const veryHighConv = winRateData.find(r => r.conviction_bucket?.includes('Very High'));
    
    if (lowConv && highConv) {
      const diff = (highConv.win_rate_pct || 0) - (lowConv.win_rate_pct || 0);
      console.log(`\n  • High conviction trades have ${diff > 0 ? '+' : ''}${diff.toFixed(1)}% higher win rate than low conviction`);
      console.log(`    - Low conviction (< -1σ): ${lowConv.win_rate_pct}% WR`);
      console.log(`    - High conviction (1-2σ): ${highConv.win_rate_pct}% WR`);
    }
    
    if (veryHighConv) {
      console.log(`\n  • Very high conviction (>2σ) trades: ${veryHighConv.win_rate_pct}% WR (${formatNumber(veryHighConv.total_trades)} trades)`);
    }

    // ROI insights
    const lowRoi = roiData.find(r => r.conviction_bucket?.includes('Low'));
    const highRoi = roiData.find(r => r.conviction_bucket?.includes('High'));
    
    if (lowRoi && highRoi) {
      console.log(`\n  • ROI comparison:`);
      console.log(`    - Low conviction: ${lowRoi.weighted_roi_pct}% weighted ROI`);
      console.log(`    - High conviction: ${highRoi.weighted_roi_pct}% weighted ROI`);
    }

    console.log('\n' + '═'.repeat(80));
    console.log('\n');

  } catch (error) {
    console.error('\n❌ Error running analysis:', error.message);
    console.error('\nMake sure you have:');
    console.error('1. GCP_SERVICE_ACCOUNT_KEY in .env.local');
    console.error('2. Access to the BigQuery dataset');
    console.error('3. The enriched_trades_training_v11 table exists');
    process.exit(1);
  }
}

main();
