#!/usr/bin/env python3
"""
Run diagnostic and CREATE TABLE queries for i_wish_i_copied_that table.
"""

import os
import sys
from google.cloud import bigquery
from google.cloud.exceptions import NotFound

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv('.env.local')
except ImportError:
    pass

PROJECT_ID = "gen-lang-client-0299056258"
DATASET = "polycopy_v1"

def get_bigquery_client():
    """Initialize BigQuery client."""
    return bigquery.Client(project=PROJECT_ID)

def run_diagnostic_query(client: bigquery.Client):
    """Run diagnostic query to check condition_id formatting."""
    print("\n" + "="*80)
    print("🔍 RUNNING DIAGNOSTIC QUERY: condition_id Format Check")
    print("="*80)
    
    queries = [
        # Query 1: Sample from markets
        """
        SELECT 
          'MARKETS' as source_table,
          condition_id,
          LENGTH(condition_id) as id_length,
          SUBSTR(condition_id, 1, 2) as first_two_chars,
          SUBSTR(condition_id, -2) as last_two_chars,
          CASE 
            WHEN condition_id LIKE '0x%' THEN 'Has 0x prefix'
            WHEN REGEXP_CONTAINS(condition_id, r'[A-Z]') THEN 'Has uppercase'
            ELSE 'No issues detected'
          END as format_notes
        FROM `gen-lang-client-0299056258.polycopy_v1.markets`
        WHERE condition_id IS NOT NULL
        LIMIT 20
        """,
        
        # Query 2: Sample from trades
        """
        SELECT 
          'TRADES' as source_table,
          condition_id,
          LENGTH(condition_id) as id_length,
          SUBSTR(condition_id, 1, 2) as first_two_chars,
          SUBSTR(condition_id, -2) as last_two_chars,
          CASE 
            WHEN condition_id LIKE '0x%' THEN 'Has 0x prefix'
            WHEN REGEXP_CONTAINS(condition_id, r'[A-Z]') THEN 'Has uppercase'
            ELSE 'No issues detected'
          END as format_notes
        FROM `gen-lang-client-0299056258.polycopy_v1.trades`
        WHERE condition_id IS NOT NULL
        LIMIT 20
        """,
        
        # Query 3: Direct comparison
        """
        SELECT 
          m.condition_id as markets_condition_id,
          t.condition_id as trades_condition_id,
          m.condition_id = t.condition_id as exact_match,
          LOWER(m.condition_id) = LOWER(t.condition_id) as case_insensitive_match,
          LENGTH(m.condition_id) as markets_length,
          LENGTH(t.condition_id) as trades_length,
          COUNT(DISTINCT t.wallet_address) as unique_traders,
          COUNT(*) as trade_count
        FROM `gen-lang-client-0299056258.polycopy_v1.markets` m
        INNER JOIN `gen-lang-client-0299056258.polycopy_v1.trades` t
          ON m.condition_id = t.condition_id
        WHERE m.condition_id IS NOT NULL
          AND t.condition_id IS NOT NULL
        GROUP BY m.condition_id, t.condition_id
        LIMIT 20
        """,
        
        # Query 4: Summary statistics
        """
        SELECT 
          'SUMMARY' as check_type,
          (SELECT COUNT(DISTINCT condition_id) FROM `gen-lang-client-0299056258.polycopy_v1.markets` WHERE condition_id IS NOT NULL) as distinct_markets_ids,
          (SELECT COUNT(DISTINCT condition_id) FROM `gen-lang-client-0299056258.polycopy_v1.trades` WHERE condition_id IS NOT NULL) as distinct_trades_ids,
          (SELECT COUNT(DISTINCT m.condition_id) 
           FROM `gen-lang-client-0299056258.polycopy_v1.markets` m
           INNER JOIN `gen-lang-client-0299056258.polycopy_v1.trades` t
             ON m.condition_id = t.condition_id
           WHERE m.condition_id IS NOT NULL) as matching_ids_exact,
          (SELECT COUNT(DISTINCT LOWER(m.condition_id))
           FROM `gen-lang-client-0299056258.polycopy_v1.markets` m
           INNER JOIN `gen-lang-client-0299056258.polycopy_v1.trades` t
             ON LOWER(m.condition_id) = LOWER(t.condition_id)
           WHERE m.condition_id IS NOT NULL) as matching_ids_case_insensitive
        """
    ]
    
    for i, query in enumerate(queries, 1):
        print(f"\n📊 Running diagnostic query {i}/{len(queries)}...")
        try:
            results = client.query(query).result()
            rows = list(results)
            
            if rows:
                # Print headers
                headers = list(rows[0].keys())
                print("  " + " | ".join(f"{h:25}" for h in headers[:6]))
                print("  " + "-" * 180)
                
                # Print rows
                for row in rows[:10]:  # Limit to 10 rows for display
                    values = []
                    for h in headers[:6]:
                        val = row.get(h)
                        if val is None:
                            val = "NULL"
                        else:
                            val = str(val)[:23] + "..." if len(str(val)) > 25 else str(val)
                        values.append(f"{val:25}")
                    print("  " + " | ".join(values))
                
                if len(rows) > 10:
                    print(f"  ... and {len(rows) - 10} more rows")
            else:
                print("  ⚠️  No results returned")
                
        except Exception as e:
            print(f"  ❌ Error: {e}")
            import traceback
            traceback.print_exc()

def run_create_table_query(client: bigquery.Client, dry_run: bool = False, use_refined: bool = True):
    """Run CREATE TABLE query."""
    print("\n" + "="*80)
    print("🏗️  RUNNING CREATE TABLE QUERY: i_wish_i_copied_that")
    if use_refined:
        print("   (REFINED VERSION: Top 100-200 most exciting trades)")
    print("="*80)
    
    if dry_run:
        print("🔍 DRY RUN MODE - Will validate query without executing")
    
    # Read the CREATE TABLE query from file if refined, otherwise use inline
    if use_refined:
        try:
            import os
            script_dir = os.path.dirname(os.path.abspath(__file__))
            sql_file = os.path.join(script_dir, 'create-i-wish-i-copied-that-refined.sql')
            with open(sql_file, 'r') as f:
                create_table_query = f.read()
            print(f"📄 Using refined SQL from: {sql_file}")
        except FileNotFoundError as e:
            print(f"⚠️  Refined SQL file not found: {e}")
            print("⚠️  Falling back to inline query")
            use_refined = False
    
    if not use_refined:
        # Original inline query (fallback - simplified version)
        create_table_query = """
    CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.i_wish_i_copied_that` AS

    WITH 
    -- Step 1: Get resolved markets from last 7 days
    recent_markets AS (
      SELECT 
        condition_id,
        status,
        winning_label,
        end_time,
        completed_time,
        title,
        -- Use end_time if available, otherwise completed_time
        COALESCE(end_time, completed_time) as market_close_time
      FROM `gen-lang-client-0299056258.polycopy_v1.markets`
      WHERE status IN ('closed', 'resolved')
        AND winning_label IS NOT NULL
        AND COALESCE(end_time, completed_time) >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    ),

    -- Step 2: Get winning trades (BUY side only, matching winning_label)
    winning_trades AS (
      SELECT 
        t.id as trade_id,
        t.condition_id,
        t.wallet_address,
        t.timestamp,
        t.side,
        t.price,
        t.shares_normalized as shares,
        t.token_label,
        m.winning_label,
        m.market_close_time,
        m.title as market_title,
        -- Calculate invested USD (price * shares)
        t.price * t.shares_normalized as invested_usd,
        -- Calculate ROI: (1.0 - entry_price) / entry_price * 100
        CASE 
          WHEN t.price > 0 THEN ((1.0 - t.price) / t.price) * 100.0
          ELSE NULL
        END as roi_pct,
        -- Calculate minutes before market close
        CASE 
          WHEN m.market_close_time IS NOT NULL AND t.timestamp IS NOT NULL THEN
            TIMESTAMP_DIFF(m.market_close_time, t.timestamp, MINUTE)
          ELSE NULL
        END as mins_before_close
      FROM `gen-lang-client-0299056258.polycopy_v1.trades` t
      INNER JOIN recent_markets m
        ON LOWER(TRIM(COALESCE(t.condition_id, ''))) = LOWER(TRIM(COALESCE(m.condition_id, '')))
        AND LOWER(TRIM(COALESCE(t.condition_id, ''))) != ''
      WHERE t.side = 'BUY'
        AND t.token_label IS NOT NULL
        AND m.winning_label IS NOT NULL
        AND LOWER(TRIM(t.token_label)) = LOWER(TRIM(m.winning_label))
        AND t.price IS NOT NULL
        AND t.shares_normalized IS NOT NULL
        AND t.price > 0
        AND t.shares_normalized > 0
    ),

    -- Step 3: Calculate trader volume per market
    trader_market_volume AS (
      SELECT 
        wt.condition_id,
        wt.wallet_address,
        SUM(wt.invested_usd) as total_invested_usd
      FROM winning_trades wt
      GROUP BY wt.condition_id, wt.wallet_address
      HAVING SUM(wt.invested_usd) >= 100.0
    ),

    -- Step 4: Filter for Human trades ($100 - $1M volume)
    human_trades AS (
      SELECT 
        wt.*,
        tmv.total_invested_usd as trader_market_volume
      FROM winning_trades wt
      INNER JOIN trader_market_volume tmv
        ON wt.condition_id = tmv.condition_id
        AND wt.wallet_address = tmv.wallet_address
      WHERE tmv.total_invested_usd >= 100.0
        AND tmv.total_invested_usd <= 1000000.0
    ),

    -- Step 5: Classify personas
    classified_trades AS (
      SELECT 
        *,
        CASE 
          WHEN invested_usd >= 1000.0 
            AND mins_before_close IS NOT NULL 
            AND mins_before_close <= 10 
            AND mins_before_close >= 0 THEN 'Clutch'
          WHEN trader_market_volume >= 50000.0 THEN 'Whale'
          WHEN roi_pct >= 500.0 
            AND price < 0.20 THEN 'Sniper'
          WHEN roi_pct >= 200.0 THEN 'High ROI'
          ELSE 'Standard'
        END as story_label
      FROM human_trades
    ),

    -- Step 6: Get trader stats for context
    trades_with_stats AS (
      SELECT 
        ct.*,
        COALESCE(tgs.L_win_rate, 0.0) as lifetime_win_rate,
        COALESCE(tgs.L_total_pnl_usd, 0.0) as lifetime_pnl_usd
      FROM classified_trades ct
      LEFT JOIN `gen-lang-client-0299056258.polycopy_v1.trader_global_stats` tgs
        ON LOWER(TRIM(ct.wallet_address)) = LOWER(TRIM(tgs.wallet_address))
    )

    -- Final output
    SELECT 
      trade_id,
      condition_id,
      wallet_address,
      timestamp,
      price as entry_price,
      shares,
      invested_usd,
      roi_pct,
      mins_before_close,
      story_label,
      market_title,
      winning_label,
      market_close_time,
      trader_market_volume,
      lifetime_win_rate,
      lifetime_pnl_usd,
      CURRENT_TIMESTAMP() as created_at
    FROM trades_with_stats
    WHERE story_label IN ('Whale', 'Sniper', 'Clutch', 'High ROI')
    ORDER BY 
      CASE story_label
        WHEN 'Clutch' THEN 1
        WHEN 'Whale' THEN 2
        WHEN 'Sniper' THEN 3
        WHEN 'High ROI' THEN 4
        ELSE 5
      END,
      roi_pct DESC,
      invested_usd DESC
    """
    
    try:
        job_config = bigquery.QueryJobConfig(dry_run=dry_run)
        
        if dry_run:
            print("🔍 Validating query syntax...")
            query_job = client.query(create_table_query, job_config=job_config)
            print(f"✅ Query is valid!")
            print(f"📊 Estimated bytes processed: {query_job.total_bytes_processed:,}")
            print(f"💰 Estimated cost: ${query_job.total_bytes_processed / (1024**4) * 5:.4f}")
            return True
        else:
            print("🚀 Executing CREATE TABLE query (this may take a few minutes)...")
            query_job = client.query(create_table_query, job_config=job_config)
            
            # Wait for completion
            query_job.result()
            
            print(f"✅ Table created successfully!")
            print(f"📊 Bytes processed: {query_job.total_bytes_processed:,}")
            
            # Get row count
            count_query = f"SELECT COUNT(*) as cnt FROM `{PROJECT_ID}.{DATASET}.i_wish_i_copied_that`"
            count_result = client.query(count_query).result()
            row_count = next(count_result).cnt
            print(f"📈 Rows created: {row_count:,}")
            
            # Show sample and summary
            sample_query = f"""
            SELECT 
              COUNT(*) as total_count,
              AVG(roi_pct) as avg_roi,
              AVG(invested_usd) as avg_invested,
              AVG(profit_usd) as avg_profit,
              AVG(excitement_score) as avg_excitement,
              MIN(roi_pct) as min_roi,
              MAX(roi_pct) as max_roi,
              MIN(invested_usd) as min_invested,
              MAX(invested_usd) as max_invested,
              COUNTIF(mins_before_close <= 10 AND mins_before_close >= 0) as clutch_trades
            FROM `{PROJECT_ID}.{DATASET}.i_wish_i_copied_that`
            """
            print("\n📊 Summary:")
            sample_results = client.query(sample_query).result()
            for row in sample_results:
                print(f"  • Total trades: {row.total_count}")
                print(f"  • Avg ROI: {row.avg_roi:.1f}% (min: {row.min_roi:.1f}%, max: {row.max_roi:.1f}%)")
                print(f"  • Avg invested: ${row.avg_invested:,.2f} (min: ${row.min_invested:,.2f}, max: ${row.max_invested:,.2f})")
                print(f"  • Avg profit: ${row.avg_profit:,.2f}")
                print(f"  • Avg excitement score: {row.avg_excitement:.2f}")
                print(f"  • Clutch trades (≤10 min): {row.clutch_trades}")
            
            # Show top 5 by excitement
            top5_query = f"""
            SELECT 
              market_title,
              wallet_address,
              invested_usd,
              roi_pct,
              profit_usd,
              mins_before_close,
              excitement_score
            FROM `{PROJECT_ID}.{DATASET}.i_wish_i_copied_that`
            ORDER BY excitement_score DESC
            LIMIT 5
            """
            print("\n🏆 Top 5 Most Exciting Trades:")
            top5_results = client.query(top5_query).result()
            for i, row in enumerate(top5_results, 1):
                title = (row.market_title[:50] + "...") if row.market_title and len(row.market_title) > 50 else (row.market_title or "N/A")
                wallet = row.wallet_address[:10] + "..." if row.wallet_address else "N/A"
                print(f"  {i}. {title}")
                print(f"     Wallet: {wallet} | Invested: ${row.invested_usd:,.2f} | ROI: {row.roi_pct:.1f}% | Profit: ${row.profit_usd:,.2f}")
                if row.mins_before_close is not None:
                    print(f"     Clutch: {row.mins_before_close} min before close | Score: {row.excitement_score:.2f}")
                print()
            
            return True
            
    except NotFound as e:
        print(f"❌ Table or dataset not found: {e}")
        return False
    except Exception as e:
        print(f"❌ Error creating table: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Run i_wish_i_copied_that queries")
    parser.add_argument("--diagnostic", action="store_true", help="Run diagnostic query only")
    parser.add_argument("--create", action="store_true", help="Run CREATE TABLE query")
    parser.add_argument("--dry-run", action="store_true", help="Dry run CREATE TABLE (validate only)")
    parser.add_argument("--all", action="store_true", help="Run both diagnostic and CREATE TABLE")
    parser.add_argument("--original", action="store_true", help="Use original query instead of refined")
    
    args = parser.parse_args()
    
    if not any([args.diagnostic, args.create, args.all]):
        parser.print_help()
        print("\n💡 Example usage:")
        print("  python run-i-wish-i-copied-that-queries.py --diagnostic")
        print("  python run-i-wish-i-copied-that-queries.py --create --dry-run")
        print("  python run-i-wish-i-copied-that-queries.py --all")
        return
    
    client = get_bigquery_client()
    
    if args.diagnostic or args.all:
        run_diagnostic_query(client)
    
    if args.create or args.all:
        success = run_create_table_query(client, dry_run=args.dry_run, use_refined=not args.original)
        if not success:
            sys.exit(1)
    
    print("\n" + "="*80)
    print("✅ Done!")
    print("="*80)

if __name__ == "__main__":
    main()
