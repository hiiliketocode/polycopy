#!/usr/bin/env python3
"""
ML Data Audit - Stage 0
Analyzes BigQuery data to understand what we have before building ML infrastructure.

This script runs READ-ONLY queries to:
1. Understand data date ranges
2. Analyze resolution timing
3. Count trades by period
4. Identify data quality issues
5. Inform the design of point-in-time infrastructure

Run: python scripts/ml-data-audit.py
"""

import os
import sys
from datetime import datetime
from google.cloud import bigquery

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv('.env.local')
except ImportError:
    pass

PROJECT_ID = "gen-lang-client-0299056258"
DATASET = "polycopy_v1"

def get_client():
    """Initialize BigQuery client."""
    return bigquery.Client(project=PROJECT_ID)

def run_query(client, query, description):
    """Run a query and print results."""
    print(f"\n{'='*80}")
    print(f"📊 {description}")
    print('='*80)
    
    try:
        results = client.query(query).result()
        rows = list(results)
        
        if not rows:
            print("  (No results)")
            return []
        
        # Print results
        for row in rows:
            for key, value in row.items():
                if isinstance(value, float):
                    print(f"  {key}: {value:,.2f}")
                elif isinstance(value, int):
                    print(f"  {key}: {value:,}")
                else:
                    print(f"  {key}: {value}")
            if len(rows) > 1:
                print("  ---")
        
        return rows
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return []

def audit_trades_table(client):
    """Audit the trades table."""
    
    # 1. Basic stats
    run_query(client, f"""
    SELECT 
        COUNT(*) as total_trades,
        COUNT(DISTINCT wallet_address) as unique_traders,
        COUNT(DISTINCT condition_id) as unique_markets,
        MIN(timestamp) as earliest_trade,
        MAX(timestamp) as latest_trade,
        TIMESTAMP_DIFF(MAX(timestamp), MIN(timestamp), DAY) as days_of_data
    FROM `{PROJECT_ID}.{DATASET}.trades`
    WHERE timestamp IS NOT NULL
    """, "TRADES TABLE - Basic Statistics")
    
    # 2. Trades by year-month
    run_query(client, f"""
    SELECT 
        FORMAT_TIMESTAMP('%Y-%m', timestamp) as month,
        COUNT(*) as trade_count,
        COUNT(DISTINCT wallet_address) as unique_traders,
        COUNT(DISTINCT condition_id) as unique_markets
    FROM `{PROJECT_ID}.{DATASET}.trades`
    WHERE timestamp IS NOT NULL
    GROUP BY month
    ORDER BY month DESC
    LIMIT 24
    """, "TRADES TABLE - Monthly Distribution (Last 24 Months)")
    
    # 3. BUY vs SELL distribution
    run_query(client, f"""
    SELECT 
        side,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
    FROM `{PROJECT_ID}.{DATASET}.trades`
    GROUP BY side
    """, "TRADES TABLE - Side Distribution")

def audit_markets_table(client):
    """Audit the markets table."""
    
    # 1. Basic stats
    run_query(client, f"""
    SELECT 
        COUNT(*) as total_markets,
        COUNT(DISTINCT condition_id) as unique_condition_ids,
        COUNTIF(winning_label IS NOT NULL) as resolved_markets,
        COUNTIF(winning_label IS NULL) as unresolved_markets,
        ROUND(COUNTIF(winning_label IS NOT NULL) * 100.0 / COUNT(*), 2) as resolution_rate_pct
    FROM `{PROJECT_ID}.{DATASET}.markets`
    """, "MARKETS TABLE - Basic Statistics")
    
    # 2. Resolution status
    run_query(client, f"""
    SELECT 
        status,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
    FROM `{PROJECT_ID}.{DATASET}.markets`
    GROUP BY status
    ORDER BY count DESC
    """, "MARKETS TABLE - Status Distribution")

def audit_resolution_timing(client):
    """Analyze how long markets take to resolve."""
    
    run_query(client, f"""
    WITH trade_resolution AS (
        SELECT 
            t.condition_id,
            t.timestamp as trade_timestamp,
            m.end_time as resolution_time,
            m.winning_label,
            TIMESTAMP_DIFF(m.end_time, t.timestamp, DAY) as days_to_resolve
        FROM `{PROJECT_ID}.{DATASET}.trades` t
        JOIN `{PROJECT_ID}.{DATASET}.markets` m ON t.condition_id = m.condition_id
        WHERE t.side = 'BUY'
          AND m.winning_label IS NOT NULL
          AND m.end_time IS NOT NULL
          AND t.timestamp IS NOT NULL
    )
    SELECT 
        CASE 
            WHEN days_to_resolve < 0 THEN 'Already resolved (negative)'
            WHEN days_to_resolve = 0 THEN 'Same day'
            WHEN days_to_resolve <= 1 THEN '1 day'
            WHEN days_to_resolve <= 7 THEN '2-7 days'
            WHEN days_to_resolve <= 30 THEN '8-30 days'
            WHEN days_to_resolve <= 90 THEN '1-3 months'
            WHEN days_to_resolve <= 180 THEN '3-6 months'
            ELSE '6+ months'
        END as resolution_bucket,
        COUNT(*) as trade_count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
    FROM trade_resolution
    GROUP BY resolution_bucket
    ORDER BY 
        CASE resolution_bucket
            WHEN 'Already resolved (negative)' THEN 0
            WHEN 'Same day' THEN 1
            WHEN '1 day' THEN 2
            WHEN '2-7 days' THEN 3
            WHEN '8-30 days' THEN 4
            WHEN '1-3 months' THEN 5
            WHEN '3-6 months' THEN 6
            ELSE 7
        END
    """, "RESOLUTION TIMING - How long do trades take to resolve?")

def audit_trader_stats_tables(client):
    """Audit the trader stats tables."""
    
    # 1. trader_global_stats
    run_query(client, f"""
    SELECT 
        COUNT(*) as total_rows,
        COUNT(DISTINCT wallet_address) as unique_wallets,
        AVG(L_count) as avg_trades_per_trader,
        AVG(L_win_rate) as avg_win_rate,
        MIN(L_count) as min_trades,
        MAX(L_count) as max_trades
    FROM `{PROJECT_ID}.{DATASET}.trader_global_stats`
    """, "TRADER_GLOBAL_STATS - Basic Statistics")
    
    # 2. Check D7/D30 values (are they meaningful?)
    run_query(client, f"""
    SELECT 
        COUNTIF(D7_count > 0) as traders_with_d7_trades,
        COUNTIF(D30_count > 0) as traders_with_d30_trades,
        AVG(CASE WHEN D7_count > 0 THEN D7_win_rate END) as avg_d7_win_rate,
        AVG(CASE WHEN D30_count > 0 THEN D30_win_rate END) as avg_d30_win_rate,
        -- These should be similar to L_win_rate if D7/D30 are working correctly
        AVG(L_win_rate) as avg_lifetime_win_rate
    FROM `{PROJECT_ID}.{DATASET}.trader_global_stats`
    """, "TRADER_GLOBAL_STATS - D7/D30 Analysis")

def audit_enriched_trades(client):
    """Audit the enriched trades training table."""
    
    # 1. Check if table exists and basic stats
    run_query(client, f"""
    SELECT 
        COUNT(*) as total_rows,
        COUNT(DISTINCT wallet_address) as unique_traders,
        COUNT(DISTINCT condition_id) as unique_markets,
        MIN(timestamp) as earliest_trade,
        MAX(timestamp) as latest_trade,
        COUNTIF(outcome = 'WON') as won_count,
        COUNTIF(outcome = 'LOST') as lost_count,
        ROUND(COUNTIF(outcome = 'WON') * 100.0 / COUNT(*), 2) as win_rate_pct
    FROM `{PROJECT_ID}.{DATASET}.enriched_trades_training_v11`
    """, "ENRICHED_TRADES_TRAINING_V11 - Basic Statistics")
    
    # 2. Check feature distributions
    run_query(client, f"""
    SELECT 
        AVG(global_win_rate) as avg_global_win_rate,
        AVG(D30_win_rate) as avg_d30_win_rate,
        AVG(D7_win_rate) as avg_d7_win_rate,
        AVG(total_lifetime_trades) as avg_lifetime_trades,
        STDDEV(global_win_rate) as stddev_global_win_rate
    FROM `{PROJECT_ID}.{DATASET}.enriched_trades_training_v11`
    """, "ENRICHED_TRADES_TRAINING_V11 - Feature Statistics")
    
    # 3. Monthly distribution
    run_query(client, f"""
    SELECT 
        FORMAT_TIMESTAMP('%Y-%m', timestamp) as month,
        COUNT(*) as trade_count,
        ROUND(AVG(CASE WHEN outcome = 'WON' THEN 1.0 ELSE 0.0 END) * 100, 2) as win_rate_pct
    FROM `{PROJECT_ID}.{DATASET}.enriched_trades_training_v11`
    GROUP BY month
    ORDER BY month DESC
    LIMIT 24
    """, "ENRICHED_TRADES_TRAINING_V11 - Monthly Distribution")

def audit_point_in_time_feasibility(client):
    """Check what's needed for point-in-time infrastructure."""
    
    # 1. Count unique trader-days (estimate of trader_stats_daily size)
    run_query(client, f"""
    SELECT 
        COUNT(DISTINCT wallet_address) as unique_traders,
        COUNT(DISTINCT DATE(timestamp)) as unique_dates,
        COUNT(DISTINCT CONCAT(wallet_address, '-', FORMAT_DATE('%Y-%m-%d', DATE(timestamp)))) as unique_trader_days
    FROM `{PROJECT_ID}.{DATASET}.trades`
    WHERE timestamp IS NOT NULL
    """, "POINT-IN-TIME FEASIBILITY - Unique Trader-Days (Table Size Estimate)")
    
    # 2. Sample a specific trader's history to verify logic
    run_query(client, f"""
    WITH sample_trader AS (
        SELECT wallet_address
        FROM `{PROJECT_ID}.{DATASET}.trader_global_stats`
        WHERE L_count BETWEEN 100 AND 200
        LIMIT 1
    )
    SELECT 
        t.wallet_address,
        DATE(t.timestamp) as trade_date,
        COUNT(*) as trades_that_day,
        -- What we'd calculate for point-in-time
        SUM(COUNT(*)) OVER (ORDER BY DATE(t.timestamp)) as cumulative_trades
    FROM `{PROJECT_ID}.{DATASET}.trades` t
    JOIN sample_trader s ON t.wallet_address = s.wallet_address
    WHERE t.side = 'BUY'
    GROUP BY t.wallet_address, DATE(t.timestamp)
    ORDER BY trade_date DESC
    LIMIT 20
    """, "POINT-IN-TIME FEASIBILITY - Sample Trader History")

def audit_data_quality(client):
    """Check for data quality issues."""
    
    # 1. NULL checks
    run_query(client, f"""
    SELECT 
        'trades' as table_name,
        COUNTIF(wallet_address IS NULL) as null_wallet,
        COUNTIF(condition_id IS NULL) as null_condition_id,
        COUNTIF(timestamp IS NULL) as null_timestamp,
        COUNTIF(price IS NULL) as null_price,
        COUNTIF(side IS NULL) as null_side
    FROM `{PROJECT_ID}.{DATASET}.trades`
    """, "DATA QUALITY - NULL Values in Trades")
    
    # 2. Duplicate check
    run_query(client, f"""
    SELECT 
        COUNT(*) as total_rows,
        COUNT(DISTINCT id) as unique_ids,
        COUNT(*) - COUNT(DISTINCT id) as potential_duplicates
    FROM `{PROJECT_ID}.{DATASET}.trades`
    """, "DATA QUALITY - Duplicate Check (Trades)")
    
    # 3. Orphan trades (no matching market)
    run_query(client, f"""
    SELECT 
        COUNT(*) as trades_without_market
    FROM `{PROJECT_ID}.{DATASET}.trades` t
    LEFT JOIN `{PROJECT_ID}.{DATASET}.markets` m ON t.condition_id = m.condition_id
    WHERE m.condition_id IS NULL
    """, "DATA QUALITY - Trades Without Matching Market")

def main():
    print("\n" + "="*80)
    print("🔍 ML DATA AUDIT - STAGE 0")
    print("="*80)
    print(f"Project: {PROJECT_ID}")
    print(f"Dataset: {DATASET}")
    print(f"Time: {datetime.now().isoformat()}")
    print("\nThis script runs READ-ONLY queries to understand the data.")
    print("="*80)
    
    client = get_client()
    
    # Run all audits
    print("\n\n" + "🔹"*40)
    print("SECTION 1: TRADES TABLE AUDIT")
    print("🔹"*40)
    audit_trades_table(client)
    
    print("\n\n" + "🔹"*40)
    print("SECTION 2: MARKETS TABLE AUDIT")
    print("🔹"*40)
    audit_markets_table(client)
    
    print("\n\n" + "🔹"*40)
    print("SECTION 3: RESOLUTION TIMING ANALYSIS")
    print("🔹"*40)
    audit_resolution_timing(client)
    
    print("\n\n" + "🔹"*40)
    print("SECTION 4: TRADER STATS TABLES AUDIT")
    print("🔹"*40)
    audit_trader_stats_tables(client)
    
    print("\n\n" + "🔹"*40)
    print("SECTION 5: ENRICHED TRADES TABLE AUDIT")
    print("🔹"*40)
    audit_enriched_trades(client)
    
    print("\n\n" + "🔹"*40)
    print("SECTION 6: POINT-IN-TIME FEASIBILITY")
    print("🔹"*40)
    audit_point_in_time_feasibility(client)
    
    print("\n\n" + "🔹"*40)
    print("SECTION 7: DATA QUALITY CHECKS")
    print("🔹"*40)
    audit_data_quality(client)
    
    print("\n\n" + "="*80)
    print("✅ AUDIT COMPLETE")
    print("="*80)
    print("\nNext steps:")
    print("1. Review the output above for any issues")
    print("2. Use these numbers to plan the point-in-time infrastructure")
    print("3. Proceed to Stage 1 only if data quality is acceptable")
    print("="*80 + "\n")

if __name__ == "__main__":
    main()
