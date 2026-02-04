#!/usr/bin/env python3
"""
Check Dome to BigQuery pipeline status.
Analyzes:
1. Recent trade timestamps
2. Wallets with new trades from yesterday and today
3. Whether traders table is being updated daily
"""

import os
import sys
from datetime import datetime, timedelta
from google.cloud import bigquery
from dotenv import load_dotenv

load_dotenv('.env.local')

PROJECT_ID = "gen-lang-client-0299056258"
DATASET = "polycopy_v1"
TRADES_TABLE = f"{PROJECT_ID}.{DATASET}.trades"
TRADERS_TABLE = f"{PROJECT_ID}.{DATASET}.traders"
CHECKPOINT_TABLE = f"{PROJECT_ID}.{DATASET}.daily_sync_checkpoint"

def get_bigquery_client():
    """Initializes BigQuery client."""
    return bigquery.Client(project=PROJECT_ID)

def print_section(title):
    """Print a formatted section header."""
    print("\n" + "=" * 80)
    print(f"  {title}")
    print("=" * 80)

def main():
    client = get_bigquery_client()
    
    print_section("DOME TO BIGQUERY PIPELINE STATUS CHECK")
    print(f"Timestamp: {datetime.now().isoformat()}")
    
    # 1. Latest trade timestamps
    print_section("1. LATEST TRADE TIMESTAMPS")
    query1 = f"""
    SELECT 
      MAX(timestamp) as latest_trade_timestamp,
      MIN(timestamp) as earliest_trade_timestamp,
      COUNT(*) as total_trades,
      COUNT(DISTINCT wallet_address) as unique_wallets_with_trades,
      COUNT(DISTINCT condition_id) as unique_markets
    FROM `{TRADES_TABLE}`
    """
    result1 = client.query(query1).result()
    row1 = next(result1, None)
    if row1:
        print(f"  Latest trade: {row1.latest_trade_timestamp}")
        print(f"  Earliest trade: {row1.earliest_trade_timestamp}")
        print(f"  Total trades: {row1.total_trades:,}")
        print(f"  Unique wallets: {row1.unique_wallets_with_trades:,}")
        print(f"  Unique markets: {row1.unique_markets:,}")
    
    # 2. Trades today
    print_section("2. TRADES TODAY")
    query2 = f"""
    SELECT 
      COUNT(*) as trades_today,
      COUNT(DISTINCT wallet_address) as wallets_with_trades_today,
      MIN(timestamp) as earliest_trade_today,
      MAX(timestamp) as latest_trade_today
    FROM `{TRADES_TABLE}`
    WHERE DATE(timestamp) = CURRENT_DATE()
    """
    result2 = client.query(query2).result()
    row2 = next(result2, None)
    if row2:
        print(f"  Trades today: {row2.trades_today:,}")
        print(f"  Wallets with trades today: {row2.wallets_with_trades_today:,}")
        if row2.earliest_trade_today:
            print(f"  Earliest trade today: {row2.earliest_trade_today}")
        if row2.latest_trade_today:
            print(f"  Latest trade today: {row2.latest_trade_today}")
    
    # 3. Trades yesterday
    print_section("3. TRADES YESTERDAY")
    query3 = f"""
    SELECT 
      COUNT(*) as trades_yesterday,
      COUNT(DISTINCT wallet_address) as wallets_with_trades_yesterday,
      MIN(timestamp) as earliest_trade_yesterday,
      MAX(timestamp) as latest_trade_yesterday
    FROM `{TRADES_TABLE}`
    WHERE DATE(timestamp) = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
    """
    result3 = client.query(query3).result()
    row3 = next(result3, None)
    if row3:
        print(f"  Trades yesterday: {row3.trades_yesterday:,}")
        print(f"  Wallets with trades yesterday: {row3.wallets_with_trades_yesterday:,}")
        if row3.earliest_trade_yesterday:
            print(f"  Earliest trade yesterday: {row3.earliest_trade_yesterday}")
        if row3.latest_trade_yesterday:
            print(f"  Latest trade yesterday: {row3.latest_trade_yesterday}")
    
    # 4. Wallets with trades in last 48 hours
    print_section("4. WALLETS WITH TRADES IN LAST 48 HOURS")
    query4 = f"""
    SELECT 
      COUNT(DISTINCT wallet_address) as unique_wallets,
      COUNT(*) as total_trades
    FROM `{TRADES_TABLE}`
    WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 48 HOUR)
    """
    result4 = client.query(query4).result()
    row4 = next(result4, None)
    if row4:
        print(f"  Unique wallets: {row4.unique_wallets:,}")
        print(f"  Total trades: {row4.total_trades:,}")
    
    # 5. Traders table vs trades table comparison
    print_section("5. TRADERS TABLE vs TRADES TABLE COMPARISON")
    query5 = f"""
    SELECT 
      (SELECT COUNT(DISTINCT wallet_address) FROM `{TRADERS_TABLE}`) as wallets_in_traders_table,
      (SELECT COUNT(DISTINCT wallet_address) FROM `{TRADES_TABLE}`) as wallets_in_trades_table
    """
    result5 = client.query(query5).result()
    row5 = next(result5, None)
    if row5:
        traders_count = row5.wallets_in_traders_table
        trades_count = row5.wallets_in_trades_table
        print(f"  Wallets in traders table: {traders_count:,}")
        print(f"  Wallets in trades table: {trades_count:,}")
        diff = trades_count - traders_count
        if diff > 0:
            print(f"  ⚠️  {diff:,} wallets have trades but are NOT in traders table")
        else:
            print(f"  ✅ All wallets with trades are in traders table")
    
    # 6. Check wallets with trades today not in traders table
    print_section("6. WALLETS WITH TRADES TODAY NOT IN TRADERS TABLE")
    query6 = f"""
    SELECT 
      t.wallet_address,
      COUNT(*) as trade_count_today,
      MAX(t.timestamp) as latest_trade
    FROM `{TRADES_TABLE}` t
    LEFT JOIN `{TRADERS_TABLE}` tr
      ON LOWER(t.wallet_address) = LOWER(tr.wallet_address)
    WHERE DATE(t.timestamp) = CURRENT_DATE()
      AND tr.wallet_address IS NULL
    GROUP BY t.wallet_address
    ORDER BY trade_count_today DESC
    LIMIT 10
    """
    result6 = client.query(query6).result()
    missing_wallets = list(result6)
    if missing_wallets:
        print(f"  ⚠️  Found {len(missing_wallets)} wallets with trades today not in traders table:")
        for wallet in missing_wallets[:10]:
            print(f"    - {wallet.wallet_address}: {wallet.trade_count_today} trades")
    else:
        print(f"  ✅ All wallets with trades today are in traders table")
    
    # 7. Daily sync checkpoint
    print_section("7. DAILY SYNC CHECKPOINT STATUS")
    try:
        query7 = f"""
        SELECT 
          last_sync_time,
          sync_duration_seconds,
          trades_fetched,
          markets_fetched,
          wallets_processed,
          TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), last_sync_time, HOUR) as hours_since_last_sync
        FROM `{CHECKPOINT_TABLE}`
        ORDER BY last_sync_time DESC
        LIMIT 1
        """
        result7 = client.query(query7).result()
        row7 = next(result7, None)
        if row7:
            print(f"  Last sync time: {row7.last_sync_time}")
            print(f"  Hours since last sync: {row7.hours_since_last_sync:.1f}")
            print(f"  Sync duration: {row7.sync_duration_seconds:.1f} seconds")
            print(f"  Trades fetched: {row7.trades_fetched:,}")
            print(f"  Markets fetched: {row7.markets_fetched:,}")
            print(f"  Wallets processed: {row7.wallets_processed:,}")
            
            if row7.hours_since_last_sync > 25:
                print(f"  ⚠️  WARNING: Last sync was {row7.hours_since_last_sync:.1f} hours ago (>24 hours)")
            else:
                print(f"  ✅ Last sync was {row7.hours_since_last_sync:.1f} hours ago")
        else:
            print(f"  ⚠️  No checkpoint found - sync may not have run yet")
    except Exception as e:
        print(f"  ⚠️  Error checking checkpoint: {e}")
    
    # 8. Top wallets by trades today
    print_section("8. TOP 10 WALLETS BY TRADES TODAY")
    query8 = f"""
    SELECT 
      wallet_address,
      COUNT(*) as trade_count,
      MIN(timestamp) as first_trade_today,
      MAX(timestamp) as last_trade_today
    FROM `{TRADES_TABLE}`
    WHERE DATE(timestamp) = CURRENT_DATE()
    GROUP BY wallet_address
    ORDER BY trade_count DESC
    LIMIT 10
    """
    result8 = client.query(query8).result()
    for i, wallet in enumerate(result8, 1):
        print(f"  {i}. {wallet.wallet_address}: {wallet.trade_count} trades")
        print(f"     First: {wallet.first_trade_today}, Last: {wallet.last_trade_today}")
    
    # 9. Summary and recommendations
    print_section("SUMMARY & RECOMMENDATIONS")
    
    # Check if traders table is being updated
    query9 = f"""
    SELECT COUNT(DISTINCT wallet_address) as traders_with_recent_trades
    FROM `{TRADES_TABLE}` 
    WHERE DATE(timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
      AND wallet_address IN (SELECT wallet_address FROM `{TRADERS_TABLE}`)
    """
    result9 = client.query(query9).result()
    row9 = next(result9, None)
    if row9:
        recent_traders = row9.traders_with_recent_trades
        print(f"  Traders with trades in last 24h: {recent_traders:,}")
    
    print("\n  Key Findings:")
    if row2 and row2.trades_today > 0:
        print(f"    ✅ Pipeline is active - {row2.trades_today:,} trades today")
    else:
        print(f"    ⚠️  No trades found today - check if pipeline is running")
    
    if missing_wallets:
        print(f"    ⚠️  {len(missing_wallets)} wallets with trades today are missing from traders table")
        print(f"       → Traders table may not be updating daily with new wallets")
    else:
        print(f"    ✅ All wallets with trades are in traders table")
    
    print("\n" + "=" * 80)

if __name__ == "__main__":
    main()
