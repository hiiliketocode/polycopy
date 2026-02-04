#!/usr/bin/env python3
"""
Check staging table status in BigQuery.
Compares staging table with production table.
"""

import os
import sys
from datetime import datetime
from google.cloud import bigquery
from dotenv import load_dotenv

load_dotenv('.env.local')

PROJECT_ID = "gen-lang-client-0299056258"
DATASET = "polycopy_v1"
STAGING_TABLE = f"{PROJECT_ID}.{DATASET}.trades_staging"
PRODUCTION_TABLE = f"{PROJECT_ID}.{DATASET}.trades"

def print_section(title):
    """Print a formatted section header."""
    print("\n" + "=" * 80)
    print(f"  {title}")
    print("=" * 80)

def main():
    client = bigquery.Client(project=PROJECT_ID)
    
    print_section("STAGING TABLE STATUS CHECK")
    print(f"Timestamp: {datetime.now().isoformat()}")
    
    # Check if staging table exists
    print_section("1. STAGING TABLE EXISTENCE")
    try:
        staging_table = client.get_table(STAGING_TABLE)
        print(f"  ✅ Staging table exists: {STAGING_TABLE}")
        print(f"  Created: {staging_table.created}")
        print(f"  Modified: {staging_table.modified}")
        print(f"  Description: {staging_table.description or 'N/A'}")
        
        # Check clustering
        if staging_table.clustering_fields:
            print(f"  Clustering: {', '.join(staging_table.clustering_fields)}")
        else:
            print(f"  Clustering: None")
        
        # Check partitioning
        if staging_table.time_partitioning:
            print(f"  ⚠️  WARNING: Table is partitioned (should be non-partitioned)")
        else:
            print(f"  ✅ Table is NOT partitioned (correct for staging)")
            
    except Exception as e:
        print(f"  ❌ Staging table does not exist: {e}")
        print(f"  Table name: {STAGING_TABLE}")
        return
    
    # Check staging table row count and stats
    print_section("2. STAGING TABLE STATISTICS")
    try:
        query = f"""
        SELECT 
          COUNT(*) as total_rows,
          COUNT(DISTINCT wallet_address) as unique_wallets,
          COUNT(DISTINCT condition_id) as unique_markets,
          COUNT(DISTINCT tx_hash) as unique_tx_hashes,
          MIN(timestamp) as earliest_trade,
          MAX(timestamp) as latest_trade,
          COUNT(DISTINCT DATE(timestamp)) as unique_dates
        FROM `{STAGING_TABLE}`
        """
        results = client.query(query).result()
        row = next(results, None)
        
        if row:
            print(f"  Total rows: {row.total_rows:,}")
            print(f"  Unique wallets: {row.unique_wallets:,}")
            print(f"  Unique markets: {row.unique_markets:,}")
            print(f"  Unique transactions: {row.unique_tx_hashes:,}")
            print(f"  Unique dates: {row.unique_dates}")
            if row.earliest_trade:
                print(f"  Earliest trade: {row.earliest_trade}")
            if row.latest_trade:
                print(f"  Latest trade: {row.latest_trade}")
        else:
            print(f"  ⚠️  Staging table is empty")
    except Exception as e:
        print(f"  ❌ Error querying staging table: {e}")
        import traceback
        traceback.print_exc()
    
    # Check for duplicates in staging
    print_section("3. STAGING TABLE DUPLICATES CHECK")
    try:
        query = f"""
        SELECT 
          COUNT(*) as total_rows,
          COUNT(DISTINCT CONCAT(wallet_address, '|', tx_hash, '|', COALESCE(id, ''))) as unique_keys
        FROM `{STAGING_TABLE}`
        """
        results = client.query(query).result()
        row = next(results, None)
        
        if row and row.total_rows > 0:
            duplicates = row.total_rows - row.unique_keys
            duplicate_pct = (duplicates / row.total_rows * 100) if row.total_rows > 0 else 0
            print(f"  Total rows: {row.total_rows:,}")
            print(f"  Unique keys: {row.unique_keys:,}")
            print(f"  Potential duplicates: {duplicates:,} ({duplicate_pct:.2f}%)")
            
            if duplicates > 0:
                print(f"  ⚠️  WARNING: Found {duplicates:,} potential duplicate rows")
            else:
                print(f"  ✅ No duplicates found")
    except Exception as e:
        print(f"  ⚠️  Error checking duplicates: {e}")
    
    # Compare with production table
    print_section("4. STAGING vs PRODUCTION COMPARISON")
    try:
        # Production stats
        prod_query = f"""
        SELECT 
          COUNT(*) as total_rows,
          COUNT(DISTINCT wallet_address) as unique_wallets,
          MIN(timestamp) as earliest_trade,
          MAX(timestamp) as latest_trade
        FROM `{PRODUCTION_TABLE}`
        """
        prod_results = client.query(prod_query).result()
        prod_row = next(prod_results, None)
        
        # Staging stats
        staging_query = f"""
        SELECT 
          COUNT(*) as total_rows,
          COUNT(DISTINCT wallet_address) as unique_wallets,
          MIN(timestamp) as earliest_trade,
          MAX(timestamp) as latest_trade
        FROM `{STAGING_TABLE}`
        """
        staging_results = client.query(staging_query).result()
        staging_row = next(staging_results, None)
        
        if prod_row and staging_row:
            print(f"  Production Table:")
            print(f"    Total rows: {prod_row.total_rows:,}")
            print(f"    Unique wallets: {prod_row.unique_wallets:,}")
            if prod_row.earliest_trade:
                print(f"    Earliest trade: {prod_row.earliest_trade}")
            if prod_row.latest_trade:
                print(f"    Latest trade: {prod_row.latest_trade}")
            
            print(f"\n  Staging Table:")
            print(f"    Total rows: {staging_row.total_rows:,}")
            print(f"    Unique wallets: {staging_row.unique_wallets:,}")
            if staging_row.earliest_trade:
                print(f"    Earliest trade: {staging_row.earliest_trade}")
            if staging_row.latest_trade:
                print(f"    Latest trade: {staging_row.latest_trade}")
            
            # Calculate differences
            row_diff = staging_row.total_rows - prod_row.total_rows
            wallet_diff = staging_row.unique_wallets - prod_row.unique_wallets
            
            print(f"\n  Differences:")
            print(f"    Row difference: {row_diff:,} ({'+' if row_diff >= 0 else ''}{row_diff:,})")
            print(f"    Wallet difference: {wallet_diff:,} ({'+' if wallet_diff >= 0 else ''}{wallet_diff:,})")
            
            if staging_row.total_rows > 0:
                staging_pct = (staging_row.total_rows / prod_row.total_rows * 100) if prod_row.total_rows > 0 else 0
                print(f"    Staging is {staging_pct:.1f}% of production size")
    except Exception as e:
        print(f"  ⚠️  Error comparing tables: {e}")
        import traceback
        traceback.print_exc()
    
    # Check for rows in staging not in production
    print_section("5. ROWS IN STAGING NOT IN PRODUCTION")
    try:
        query = f"""
        SELECT COUNT(*) as count
        FROM `{STAGING_TABLE}` s
        LEFT JOIN `{PRODUCTION_TABLE}` p
          ON s.wallet_address = p.wallet_address
          AND s.tx_hash = p.tx_hash
          AND COALESCE(s.id, '') = COALESCE(p.id, '')
        WHERE p.wallet_address IS NULL
        """
        results = client.query(query).result()
        row = next(results, None)
        
        if row:
            new_rows = row.count
            print(f"  Rows in staging not in production: {new_rows:,}")
            
            if new_rows > 0:
                print(f"  ✅ Staging has {new_rows:,} new rows ready to copy")
            else:
                print(f"  ℹ️  All staging rows already exist in production")
    except Exception as e:
        print(f"  ⚠️  Error checking new rows: {e}")
    
    # Check staging table schema
    print_section("6. STAGING TABLE SCHEMA")
    try:
        table = client.get_table(STAGING_TABLE)
        print(f"  Columns ({len(table.schema)}):")
        for field in table.schema:
            nullable = "NULL" if field.mode == "NULLABLE" else "NOT NULL"
            print(f"    - {field.name}: {field.field_type} ({nullable})")
    except Exception as e:
        print(f"  ⚠️  Error getting schema: {e}")
    
    # Recent activity in staging
    print_section("7. RECENT ACTIVITY IN STAGING")
    try:
        query = f"""
        SELECT 
          DATE(timestamp) as trade_date,
          COUNT(*) as trade_count,
          COUNT(DISTINCT wallet_address) as wallet_count
        FROM `{STAGING_TABLE}`
        WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
        GROUP BY trade_date
        ORDER BY trade_date DESC
        LIMIT 7
        """
        results = client.query(query).result()
        rows = list(results)
        
        if rows:
            print(f"  Trades by date (last 7 days):")
            for row in rows:
                print(f"    {row.trade_date}: {row.trade_count:,} trades, {row.wallet_count} wallets")
        else:
            print(f"  ℹ️  No recent activity in staging table")
    except Exception as e:
        print(f"  ⚠️  Error checking recent activity: {e}")
    
    print("\n" + "=" * 80)
    print("✅ Staging table check complete!")
    print("=" * 80)

if __name__ == "__main__":
    main()
