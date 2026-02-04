#!/usr/bin/env python3
"""
Copy deduplicated trades from staging to production.
Uses MERGE to avoid inserting duplicates.
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
    print("\n" + "=" * 80)
    print(f"  {title}")
    print("=" * 80)

def main():
    client = bigquery.Client(project=PROJECT_ID)
    
    print_section("COPY STAGING TO PRODUCTION (WITH DEDUPLICATION)")
    print(f"Timestamp: {datetime.now().isoformat()}")
    
    # Step 1: Check staging table
    print_section("Step 1: Checking Staging Table")
    try:
        staging_query = f"""
        SELECT 
          COUNT(*) as total_rows,
          COUNT(DISTINCT CONCAT(wallet_address, '|', tx_hash, '|', COALESCE(id, ''))) as unique_keys
        FROM `{STAGING_TABLE}`
        """
        results = client.query(staging_query).result()
        staging_row = next(results, None)
        
        if staging_row:
            print(f"  Total rows in staging: {staging_row.total_rows:,}")
            print(f"  Unique keys: {staging_row.unique_keys:,}")
            duplicates = staging_row.total_rows - staging_row.unique_keys
            print(f"  Duplicates: {duplicates:,} ({duplicates/staging_row.total_rows*100:.2f}%)")
            
            if staging_row.total_rows == 0:
                print("  ⚠️  Staging table is empty - nothing to copy")
                return
        else:
            print("  ❌ Could not query staging table")
            return
    except Exception as e:
        print(f"  ❌ Error checking staging: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # Step 2: Check production table (before)
    print_section("Step 2: Checking Production Table (Before)")
    try:
        prod_query = f"SELECT COUNT(*) as total_rows FROM `{PRODUCTION_TABLE}`"
        results = client.query(prod_query).result()
        prod_before = next(results, None)
        
        if prod_before:
            print(f"  Production rows (before): {prod_before.total_rows:,}")
        else:
            prod_before = type('obj', (object,), {'total_rows': 0})()
    except Exception as e:
        print(f"  ⚠️  Error checking production: {e}")
        prod_before = type('obj', (object,), {'total_rows': 0})()
    
    # Step 3: Copy with deduplication using MERGE
    print_section("Step 3: Copying with Deduplication")
    print("  Strategy:")
    print("    • Deduplicate staging data (wallet_address + tx_hash + order_hash)")
    print("    • Keep latest record (ORDER BY timestamp DESC)")
    print("    • Use MERGE to only insert new rows (skip existing)")
    print("    • This may take several minutes...")
    print()
    
    try:
        # Staging table has 10 columns, production has 14 columns
        # Staging columns: id, condition_id, wallet_address, timestamp, side, price, shares_normalized, token_label, token_id, tx_hash
        # Production extra columns: order_hash, taker, market_slug, title
        # We need to explicitly select columns and add NULL for missing ones
        merge_query = f"""
        MERGE `{PRODUCTION_TABLE}` AS target
        USING (
            SELECT 
                id,
                condition_id,
                wallet_address,
                timestamp,
                side,
                price,
                shares_normalized,
                token_label,
                token_id,
                tx_hash,
                CAST(NULL AS STRING) as order_hash,
                CAST(NULL AS STRING) as taker,
                CAST(NULL AS STRING) as market_slug,
                CAST(NULL AS STRING) as title
            FROM `{STAGING_TABLE}`
            QUALIFY ROW_NUMBER() OVER (
                PARTITION BY wallet_address, tx_hash, COALESCE(id, '')
                ORDER BY timestamp DESC, id DESC
            ) = 1
        ) AS source
        ON target.wallet_address = source.wallet_address
           AND target.tx_hash = source.tx_hash
        WHEN NOT MATCHED THEN INSERT ROW
        """
        
        print("  Executing MERGE query...")
        job = client.query(merge_query)
        job.result()
        print("  ✅ MERGE completed successfully!")
        
    except Exception as e:
        print(f"  ❌ Error during MERGE: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # Step 4: Check production table (after)
    print_section("Step 4: Checking Production Table (After)")
    try:
        prod_query = f"SELECT COUNT(*) as total_rows FROM `{PRODUCTION_TABLE}`"
        results = client.query(prod_query).result()
        prod_after = next(results, None)
        
        if prod_after:
            print(f"  Production rows (after): {prod_after.total_rows:,}")
            new_rows = prod_after.total_rows - prod_before.total_rows
            print(f"  New rows added: {new_rows:,}")
            
            if new_rows > 0:
                print(f"  ✅ Successfully added {new_rows:,} new rows to production")
            else:
                print(f"  ℹ️  No new rows added (all rows already existed in production)")
        else:
            print("  ⚠️  Could not get production count")
    except Exception as e:
        print(f"  ⚠️  Error checking production after: {e}")
    
    # Step 5: Summary
    print_section("Summary")
    print(f"  Staging rows: {staging_row.total_rows:,}")
    print(f"  Staging unique keys: {staging_row.unique_keys:,}")
    print(f"  Production before: {prod_before.total_rows:,}")
    if 'prod_after' in locals() and prod_after:
        print(f"  Production after: {prod_after.total_rows:,}")
        new_rows = prod_after.total_rows - prod_before.total_rows
        print(f"  New rows added: {new_rows:,}")
        skipped = staging_row.unique_keys - new_rows
        print(f"  Rows skipped (already existed): {skipped:,}")
    
    print("\n" + "=" * 80)
    print("✅ Copy complete!")
    print("=" * 80)

if __name__ == "__main__":
    main()
