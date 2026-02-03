#!/usr/bin/env python3
"""
Check how many trades were added to BigQuery today.
"""

import os
import sys
from datetime import datetime, timezone
from google.cloud import bigquery

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv('.env.local')
except ImportError:
    pass

PROJECT_ID = "gen-lang-client-0299056258"
DATASET = "polycopy_v1"
TABLE = "trades"

def main():
    client = bigquery.Client(project=PROJECT_ID)
    
    # Get today's date in UTC
    today = datetime.now(timezone.utc).date()
    today_str = today.isoformat()
    
    print(f"📊 Checking trades added today ({today_str} UTC)...")
    print("")
    
    # Query 1: Trades with today's timestamp
    query1 = f"""
    SELECT 
      COUNT(*) as total_trades,
      COUNT(DISTINCT wallet_address) as unique_wallets,
      MIN(timestamp) as earliest_trade,
      MAX(timestamp) as latest_trade
    FROM `{PROJECT_ID}.{DATASET}.{TABLE}`
    WHERE DATE(timestamp) = '{today_str}'
    """
    
    try:
        print("Querying trades with today's date...")
        results = client.query(query1).result()
        row = next(results, None)
        
        if row:
            print(f"✅ Trades with today's timestamp:")
            print(f"   Total trades: {row.total_trades:,}")
            print(f"   Unique wallets: {row.unique_wallets:,}")
            if row.earliest_trade:
                print(f"   Earliest trade: {row.earliest_trade}")
            if row.latest_trade:
                print(f"   Latest trade: {row.latest_trade}")
        else:
            print("   No trades found with today's date")
    except Exception as e:
        print(f"❌ Error: {e}")
        return
    
    print("")
    
    # Query 2: Check partition time (if table is partitioned)
    try:
        query2 = f"""
        SELECT 
          COUNT(*) as total_trades,
          COUNT(DISTINCT wallet_address) as unique_wallets
        FROM `{PROJECT_ID}.{DATASET}.{TABLE}`
        WHERE DATE(_PARTITIONTIME) = '{today_str}'
        """
        print("Querying trades by partition time...")
        results2 = client.query(query2).result()
        row2 = next(results2, None)
        
        if row2 and row2.total_trades > 0:
            print(f"✅ Trades in today's partition:")
            print(f"   Total trades: {row2.total_trades:,}")
            print(f"   Unique wallets: {row2.unique_wallets:,}")
        else:
            print("   No trades found in today's partition")
    except Exception as e:
        print(f"⚠️  Partition query failed (table may not be partitioned): {e}")
    
    print("")
    
    # Query 3: Recent trades (last 24 hours)
    query3 = f"""
    SELECT 
      COUNT(*) as total_trades,
      COUNT(DISTINCT wallet_address) as unique_wallets,
      MIN(timestamp) as earliest_trade,
      MAX(timestamp) as latest_trade
    FROM `{PROJECT_ID}.{DATASET}.{TABLE}`
    WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
    """
    
    try:
        print("Querying trades from last 24 hours...")
        results3 = client.query(query3).result()
        row3 = next(results3, None)
        
        if row3:
            print(f"✅ Trades in last 24 hours:")
            print(f"   Total trades: {row3.total_trades:,}")
            print(f"   Unique wallets: {row3.unique_wallets:,}")
            if row3.earliest_trade:
                print(f"   Earliest trade: {row3.earliest_trade}")
            if row3.latest_trade:
                print(f"   Latest trade: {row3.latest_trade}")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    main()
