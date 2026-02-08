#!/usr/bin/env python3
"""
Conviction Score vs Trade Performance Analysis

Analyzes historical trade data to show how conviction scores
correlate with win rates and ROI across different price brackets.

Usage:
    python scripts/analyze-conviction-performance.py

Requires:
    - GCP_SERVICE_ACCOUNT_KEY in .env.local or GOOGLE_APPLICATION_CREDENTIALS
    - BigQuery access to polycopy_v1 dataset
"""

import os
import json
from google.cloud import bigquery
from google.oauth2 import service_account
from dotenv import load_dotenv
# Simple table formatting (no external deps)
def tabulate(data, headers='keys', tablefmt='simple', floatfmt='.1f'):
    """Simple tabulate replacement"""
    if not data:
        return "No data"
    
    if headers == 'keys':
        headers = list(data[0].keys())
    
    # Calculate column widths
    widths = {h: len(str(h)) for h in headers}
    for row in data:
        for h in headers:
            val = row.get(h, '')
            widths[h] = max(widths[h], len(str(val)))
    
    # Build output
    lines = []
    # Header
    header_line = '  '.join(str(h).ljust(widths[h]) for h in headers)
    lines.append(header_line)
    lines.append('  '.join('-' * widths[h] for h in headers))
    
    # Data rows
    for row in data:
        row_vals = []
        for h in headers:
            val = row.get(h, '')
            row_vals.append(str(val).ljust(widths[h]))
        lines.append('  '.join(row_vals))
    
    return '\n'.join(lines)

# Load environment
load_dotenv('.env.local')

# Initialize BigQuery client
def get_bigquery_client():
    """Get BigQuery client with proper credentials"""
    gcp_key = os.environ.get('GCP_SERVICE_ACCOUNT_KEY')
    
    if gcp_key:
        try:
            credentials_dict = json.loads(gcp_key)
            credentials = service_account.Credentials.from_service_account_info(credentials_dict)
            project_id = credentials_dict.get('project_id', 'gen-lang-client-0299056258')
            return bigquery.Client(credentials=credentials, project=project_id)
        except json.JSONDecodeError:
            print("Warning: Could not parse GCP_SERVICE_ACCOUNT_KEY as JSON")
    
    # Fall back to default credentials
    return bigquery.Client()

PROJECT_ID = 'gen-lang-client-0299056258'
DATASET = 'polycopy_v1'

# ============================================================================
# QUERY DEFINITIONS
# ============================================================================

QUERIES = {
    'conviction_win_rate': f"""
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
          FROM `{PROJECT_ID}.{DATASET}.enriched_trades_training_v11`
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
          ROUND(AVG(entry_price) * 100, 1) as avg_entry_pct
        FROM trade_outcomes
        GROUP BY conviction_bucket
        ORDER BY conviction_bucket
    """,

    'conviction_price_matrix': f"""
        WITH trade_outcomes AS (
          SELECT
            CASE 
              WHEN conviction_z_score < -1 THEN '1_Low (<-1σ)'
              WHEN conviction_z_score < 0 THEN '2_Below (0 to -1σ)'
              WHEN conviction_z_score < 1 THEN '3_Above (0 to 1σ)'
              ELSE '4_High (>1σ)'
            END as conv,
            CASE 
              WHEN entry_price < 0.3 THEN 'Underdog'
              WHEN entry_price < 0.5 THEN 'Low-Mid'
              WHEN entry_price < 0.7 THEN 'High-Mid'
              ELSE 'Favorite'
            END as price,
            outcome
          FROM `{PROJECT_ID}.{DATASET}.enriched_trades_training_v11`
          WHERE conviction_z_score IS NOT NULL
            AND conviction_z_score BETWEEN -10 AND 10
            AND entry_price > 0.01 AND entry_price < 0.99
        )
        SELECT
          conv as conviction,
          CONCAT(
            CAST(ROUND(SAFE_DIVIDE(COUNTIF(price = 'Underdog' AND outcome = 'WON'), NULLIF(COUNTIF(price = 'Underdog'), 0)) * 100, 0) AS STRING),
            '% (', CAST(COUNTIF(price = 'Underdog') AS STRING), ')'
          ) as underdog,
          CONCAT(
            CAST(ROUND(SAFE_DIVIDE(COUNTIF(price = 'Low-Mid' AND outcome = 'WON'), NULLIF(COUNTIF(price = 'Low-Mid'), 0)) * 100, 0) AS STRING),
            '% (', CAST(COUNTIF(price = 'Low-Mid') AS STRING), ')'
          ) as low_mid,
          CONCAT(
            CAST(ROUND(SAFE_DIVIDE(COUNTIF(price = 'High-Mid' AND outcome = 'WON'), NULLIF(COUNTIF(price = 'High-Mid'), 0)) * 100, 0) AS STRING),
            '% (', CAST(COUNTIF(price = 'High-Mid') AS STRING), ')'
          ) as high_mid,
          CONCAT(
            CAST(ROUND(SAFE_DIVIDE(COUNTIF(price = 'Favorite' AND outcome = 'WON'), NULLIF(COUNTIF(price = 'Favorite'), 0)) * 100, 0) AS STRING),
            '% (', CAST(COUNTIF(price = 'Favorite') AS STRING), ')'
          ) as favorite,
          CONCAT(
            CAST(ROUND(SAFE_DIVIDE(COUNTIF(outcome = 'WON'), COUNT(*)) * 100, 0) AS STRING),
            '% (', CAST(COUNT(*) AS STRING), ')'
          ) as total
        FROM trade_outcomes
        GROUP BY conv
        ORDER BY conv
    """,

    'conviction_roi': f"""
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
          FROM `{PROJECT_ID}.{DATASET}.enriched_trades_training_v11`
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
    """,

    'conviction_by_niche': f"""
        WITH trade_outcomes AS (
          SELECT
            final_niche,
            CASE 
              WHEN conviction_z_score < 0 THEN 'Low Conviction'
              ELSE 'High Conviction'
            END as conviction_level,
            outcome
          FROM `{PROJECT_ID}.{DATASET}.enriched_trades_training_v11`
          WHERE conviction_z_score IS NOT NULL
            AND conviction_z_score BETWEEN -10 AND 10
            AND entry_price > 0.01 AND entry_price < 0.99
            AND final_niche IS NOT NULL
        )
        SELECT
          final_niche as niche,
          COUNTIF(conviction_level = 'Low Conviction') as low_trades,
          ROUND(SAFE_DIVIDE(
            COUNTIF(conviction_level = 'Low Conviction' AND outcome = 'WON'),
            NULLIF(COUNTIF(conviction_level = 'Low Conviction'), 0)
          ) * 100, CAST(1 AS INT64)) as low_wr,
          COUNTIF(conviction_level = 'High Conviction') as high_trades,
          ROUND(SAFE_DIVIDE(
            COUNTIF(conviction_level = 'High Conviction' AND outcome = 'WON'),
            NULLIF(COUNTIF(conviction_level = 'High Conviction'), 0)
          ) * 100, CAST(1 AS INT64)) as high_wr,
          ROUND(
            (SAFE_DIVIDE(
              COUNTIF(conviction_level = 'High Conviction' AND outcome = 'WON'),
              NULLIF(COUNTIF(conviction_level = 'High Conviction'), 0)
            ) -
            SAFE_DIVIDE(
              COUNTIF(conviction_level = 'Low Conviction' AND outcome = 'WON'),
              NULLIF(COUNTIF(conviction_level = 'Low Conviction'), 0)
            )) * 100, CAST(1 AS INT64)
          ) as wr_diff
        FROM trade_outcomes
        GROUP BY final_niche
        HAVING COUNT(*) >= 1000
        ORDER BY high_trades DESC
        LIMIT 15
    """,

    'conviction_by_regime': f"""
        WITH trade_outcomes AS (
          SELECT
            performance_regime as regime,
            CASE 
              WHEN conviction_z_score < 0 THEN 'Below Avg'
              ELSE 'Above Avg'
            END as conviction_level,
            outcome
          FROM `{PROJECT_ID}.{DATASET}.enriched_trades_training_v11`
          WHERE conviction_z_score IS NOT NULL
            AND conviction_z_score BETWEEN -10 AND 10
            AND entry_price > 0.01 AND entry_price < 0.99
            AND performance_regime IS NOT NULL
        )
        SELECT
          regime,
          conviction_level,
          COUNT(*) as trades,
          ROUND(SAFE_DIVIDE(COUNTIF(outcome = 'WON'), COUNT(*)) * 100, 1) as win_rate_pct
        FROM trade_outcomes
        GROUP BY regime, conviction_level
        ORDER BY regime, conviction_level
    """,
}

def run_query(client, query):
    """Execute BigQuery query and return results"""
    query_job = client.query(query)
    return list(query_job.result())

def format_number(n):
    """Format large numbers"""
    if n is None:
        return '-'
    if abs(n) >= 1000000:
        return f'{n/1000000:.1f}M'
    if abs(n) >= 1000:
        return f'{n/1000:.1f}K'
    return f'{n:.0f}'

def print_section(title, description=''):
    """Print a section header"""
    print('\n' + '=' * 80)
    print(f'  {title}')
    if description:
        print(f'  {description}')
    print('=' * 80)

def main():
    print('\n')
    print('╔' + '═' * 78 + '╗')
    print('║' + ' CONVICTION SCORE vs TRADE PERFORMANCE ANALYSIS'.center(78) + '║')
    print('║' + ''.center(78) + '║')
    print('║' + ' Conviction = trade_size / trader_avg_trade_size'.center(78) + '║')
    print('║' + " A conviction of 2x means the trade is 2x the trader's typical size".center(78) + '║')
    print('╚' + '═' * 78 + '╝')

    try:
        client = get_bigquery_client()
        print('\n✓ Connected to BigQuery')

        # Analysis 1: Win Rate by Conviction Bucket
        print_section(
            '📊 ANALYSIS 1: WIN RATE BY CONVICTION BUCKET',
            'How does conviction correlate with winning?'
        )
        rows = run_query(client, QUERIES['conviction_win_rate'])
        data = [dict(row) for row in rows]
        print('\n' + tabulate(data, headers='keys', tablefmt='simple', floatfmt='.1f'))

        # Analysis 2: Conviction x Price Matrix
        print_section(
            '📊 ANALYSIS 2: CONVICTION x PRICE BRACKET MATRIX',
            'Win rates shown as "WR% (N trades)"'
        )
        rows = run_query(client, QUERIES['conviction_price_matrix'])
        data = [dict(row) for row in rows]
        print('\n' + tabulate(data, headers='keys', tablefmt='simple'))

        # Analysis 3: ROI by Conviction
        print_section(
            '📊 ANALYSIS 3: ROI BY CONVICTION BUCKET',
            'Does higher conviction = higher returns?'
        )
        rows = run_query(client, QUERIES['conviction_roi'])
        data = [dict(row) for row in rows]
        print('\n' + tabulate(data, headers='keys', tablefmt='simple', floatfmt='.1f'))

        # Analysis 4: By Niche
        print_section(
            '📊 ANALYSIS 4: CONVICTION IMPACT BY NICHE',
            'Which niches benefit most from high conviction?'
        )
        rows = run_query(client, QUERIES['conviction_by_niche'])
        data = [dict(row) for row in rows]
        print('\n' + tabulate(data, headers='keys', tablefmt='simple', floatfmt='.1f'))

        # Analysis 5: By Performance Regime
        print_section(
            '📊 ANALYSIS 5: CONVICTION x PERFORMANCE REGIME',
            'Does conviction matter more when HOT or COLD?'
        )
        rows = run_query(client, QUERIES['conviction_by_regime'])
        data = [dict(row) for row in rows]
        print('\n' + tabulate(data, headers='keys', tablefmt='simple', floatfmt='.1f'))

        # Key Insights
        print('\n' + '=' * 80)
        print('  KEY INSIGHTS')
        print('=' * 80)
        
        # Get win rate data for insights
        wr_rows = run_query(client, QUERIES['conviction_win_rate'])
        wr_data = {row['conviction_bucket']: row for row in wr_rows}
        
        low_wr = next((v for k, v in wr_data.items() if 'Low (-2' in k), None)
        high_wr = next((v for k, v in wr_data.items() if 'High (1σ' in k), None)
        very_high_wr = next((v for k, v in wr_data.items() if 'Very High' in k), None)
        
        if low_wr and high_wr:
            diff = high_wr['win_rate_pct'] - low_wr['win_rate_pct']
            print(f"\n  • High conviction trades have {'+' if diff > 0 else ''}{diff:.1f}% higher win rate than low conviction")
            print(f"    - Low conviction (< -1σ): {low_wr['win_rate_pct']}% WR ({format_number(low_wr['total_trades'])} trades)")
            print(f"    - High conviction (1-2σ): {high_wr['win_rate_pct']}% WR ({format_number(high_wr['total_trades'])} trades)")
        
        if very_high_wr:
            print(f"\n  • Very high conviction (>2σ) trades: {very_high_wr['win_rate_pct']}% WR ({format_number(very_high_wr['total_trades'])} trades)")
        
        # Get ROI data for insights
        roi_rows = run_query(client, QUERIES['conviction_roi'])
        roi_data = {row['conviction_bucket']: row for row in roi_rows}
        
        low_roi = next((v for k, v in roi_data.items() if 'Low' in k), None)
        high_roi = next((v for k, v in roi_data.items() if 'High' in k), None)
        
        if low_roi and high_roi:
            print(f"\n  • ROI comparison:")
            print(f"    - Low conviction: {low_roi['weighted_roi_pct']}% weighted ROI (${format_number(low_roi['total_pnl_usd'])} total P&L)")
            print(f"    - High conviction: {high_roi['weighted_roi_pct']}% weighted ROI (${format_number(high_roi['total_pnl_usd'])} total P&L)")

        print('\n' + '=' * 80)
        print('\n')

    except Exception as e:
        print(f'\n❌ Error running analysis: {e}')
        print('\nMake sure you have:')
        print('1. GCP_SERVICE_ACCOUNT_KEY in .env.local')
        print('2. Access to the BigQuery dataset')
        print('3. The enriched_trades_training_v11 table exists')
        import traceback
        traceback.print_exc()
        exit(1)

if __name__ == '__main__':
    main()
