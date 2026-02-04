#!/usr/bin/env python3
"""Check distribution of winning trades to help tune criteria."""

from google.cloud import bigquery

client = bigquery.Client(project='gen-lang-client-0299056258')

query = """
WITH recent_markets AS (
  SELECT condition_id, winning_label, COALESCE(end_time, completed_time) as market_close_time
  FROM `gen-lang-client-0299056258.polycopy_v1.markets`
  WHERE status IN ('closed', 'resolved')
    AND winning_label IS NOT NULL
    AND COALESCE(end_time, completed_time) >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    AND COALESCE(end_time, completed_time) < CURRENT_TIMESTAMP()
),
winning_trades AS (
  SELECT 
    t.price * t.shares_normalized as invested_usd,
    ((1.0 - t.price) / t.price) * 100.0 as roi_pct
  FROM `gen-lang-client-0299056258.polycopy_v1.trades` t
  INNER JOIN recent_markets m ON LOWER(TRIM(t.condition_id)) = LOWER(TRIM(m.condition_id))
  WHERE t.side = 'BUY'
    AND LOWER(TRIM(t.token_label)) = LOWER(TRIM(m.winning_label))
    AND t.price > 0
    AND t.shares_normalized > 0
    AND ((1.0 - t.price) / t.price) >= 5.0
)
SELECT 
  COUNT(*) as total,
  COUNTIF(invested_usd >= 100000) as trades_100k_plus,
  COUNTIF(invested_usd >= 10000) as trades_10k_plus,
  COUNTIF(invested_usd >= 5000) as trades_5k_plus,
  COUNTIF(invested_usd >= 1000) as trades_1k_plus,
  COUNTIF(roi_pct >= 2000) as roi_20x_plus,
  COUNTIF(roi_pct >= 1500) as roi_15x_plus,
  COUNTIF(roi_pct >= 1000) as roi_10x_plus,
  COUNTIF(roi_pct >= 800) as roi_8x_plus,
  COUNTIF(roi_pct >= 600) as roi_6x_plus,
  AVG(invested_usd) as avg_invested,
  AVG(roi_pct) as avg_roi,
  MIN(roi_pct) as min_roi,
  MAX(roi_pct) as max_roi
FROM winning_trades
"""

results = client.query(query).result()
for row in results:
    print(f'Total 5x+ ROI trades: {row.total:,}')
    print(f'Trades $100k+: {row.trades_100k_plus:,}')
    print(f'Trades $10k+: {row.trades_10k_plus:,}')
    print(f'Trades $5k+: {row.trades_5k_plus:,}')
    print(f'Trades $1k+: {row.trades_1k_plus:,}')
    print(f'ROI 20x+: {row.roi_20x_plus:,}')
    print(f'ROI 15x+: {row.roi_15x_plus:,}')
    print(f'ROI 10x+: {row.roi_10x_plus:,}')
    print(f'ROI 8x+: {row.roi_8x_plus:,}')
    print(f'ROI 6x+: {row.roi_6x_plus:,}')
    print(f'Avg invested: ${row.avg_invested:,.2f}')
    print(f'Avg ROI: {row.avg_roi:.1f}%')
    print(f'ROI range: {row.min_roi:.1f}% - {row.max_roi:.1f}%')
