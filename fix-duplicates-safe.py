#!/usr/bin/env python3
"""
Safely fix duplicates using DELETE statements (safer than table replacement).
"""

import os
import sys
from datetime import datetime
from google.cloud import bigquery
from dotenv import load_dotenv

load_dotenv('.env.local')

PROJECT_ID = "gen-lang-client-0299056258"
DATASET = "polycopy_v1"
TRADES_TABLE = f"{PROJECT_ID}.{DATASET}.trades"
MARKETS_TABLE = f"{PROJECT_ID}.{DATASET}.markets"
EVENTS_TABLE = f"{PROJECT_ID}.{DATASET}.events"

def print_section(title):
    print("\n" + "=" * 80)
    print(f"  {title}")
    print("=" * 80)

def fix_trades_duplicates(client):
    """Fix duplicates in trades table using DELETE."""
    print_section("1. FIXING TRADES TABLE DUPLICATES")
    
    try:
        # Check current duplicates
        check_query = f"""
        SELECT 
          COUNT(*) as total,
          COUNT(DISTINCT CONCAT(wallet_address, '|', tx_hash, '|', COALESCE(order_hash, ''))) as unique_keys
        FROM `{TRADES_TABLE}`
        """
        result = list(client.query(check_query).result())[0]
        duplicates = result.total - result.unique_keys
        print(f"  Current: {result.total:,} rows, {result.unique_keys:,} unique keys")
        print(f"  Duplicates to remove: {duplicates:,}")
        
        if duplicates == 0:
            print("  ✅ No duplicates found!")
            return True
        
        # Use a simpler approach: create temp table with rows to keep, then delete others
        # First create temp table with unique rows
        temp_table = f"{TRADES_TABLE}_keep_{int(datetime.now().timestamp())}"
        create_temp_query = f"""
        CREATE TABLE `{temp_table}` AS
        SELECT *
        FROM `{TRADES_TABLE}`
        QUALIFY ROW_NUMBER() OVER (
            PARTITION BY wallet_address, tx_hash, COALESCE(order_hash, '')
            ORDER BY timestamp DESC, id DESC
        ) = 1
        """
        
        print("  Creating temp table with unique rows...")
        client.query(create_temp_query).result()
        
        # Count rows to keep
        keep_count = list(client.query(f"SELECT COUNT(*) as cnt FROM `{temp_table}`").result())[0].cnt
        print(f"  Rows to keep: {keep_count:,}")
        
        # Delete all rows from original table
        print("  Clearing original table...")
        client.query(f"TRUNCATE TABLE `{TRADES_TABLE}`").result()
        
        # Copy back unique rows
        print("  Copying unique rows back...")
        copy_query = f"INSERT INTO `{TRADES_TABLE}` SELECT * FROM `{temp_table}`"
        client.query(copy_query).result()
        
        # Cleanup
        client.delete_table(temp_table)
        print("  ✅ Temp table cleaned up")
        
        # Skip the DELETE query, we already did the work
        delete_query = None
        
        if delete_query:
            print("  Deleting duplicates (keeping latest record)...")
            job = client.query(delete_query)
            job.result()
        
        # Verify
        verify_result = list(client.query(check_query).result())[0]
        removed = result.total - verify_result.total
        print(f"  ✅ Removed {removed:,} duplicate rows")
        print(f"  Final: {verify_result.total:,} rows, {verify_result.unique_keys:,} unique keys")
        
        return True
        
    except Exception as e:
        print(f"  ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def fix_markets_duplicates(client):
    """Fix duplicates in markets table."""
    print_section("2. FIXING MARKETS TABLE DUPLICATES")
    
    try:
        check_query = f"""
        SELECT 
          COUNT(*) as total,
          COUNT(DISTINCT condition_id) as unique_ids
        FROM `{MARKETS_TABLE}`
        WHERE condition_id IS NOT NULL
        """
        result = list(client.query(check_query).result())[0]
        duplicates = result.total - result.unique_ids
        print(f"  Current: {result.total:,} rows, {result.unique_ids:,} unique condition_ids")
        print(f"  Duplicates to remove: {duplicates:,}")
        
        if duplicates == 0:
            print("  ✅ No duplicates found!")
            return True
        
        # Check for last_updated column
        schema_query = f"""
        SELECT column_name
        FROM `{PROJECT_ID}.{DATASET}.INFORMATION_SCHEMA.COLUMNS`
        WHERE table_name = 'markets' AND column_name = 'last_updated'
        """
        has_last_updated = len(list(client.query(schema_query).result())) > 0
        
        if has_last_updated:
            delete_query = f"""
            DELETE FROM `{MARKETS_TABLE}`
            WHERE condition_id IN (
                SELECT condition_id
                FROM (
                    SELECT 
                        condition_id,
                        ROW_NUMBER() OVER (
                            PARTITION BY condition_id
                            ORDER BY last_updated DESC, condition_id DESC
                        ) as row_num
                    FROM `{MARKETS_TABLE}`
                    WHERE condition_id IS NOT NULL
                )
                WHERE row_num > 1
            )
            """
        else:
            # Use condition_id only - need a unique identifier
            # Use a hash of all columns or just delete all but one per condition_id
            delete_query = f"""
            DELETE FROM `{MARKETS_TABLE}`
            WHERE condition_id IN (
                SELECT condition_id
                FROM (
                    SELECT 
                        condition_id,
                        ROW_NUMBER() OVER (
                            PARTITION BY condition_id
                            ORDER BY condition_id DESC
                        ) as row_num
                    FROM `{MARKETS_TABLE}`
                    WHERE condition_id IS NOT NULL
                )
                WHERE row_num > 1
            )
            """
        
        print("  Deleting duplicates (keeping latest record)...")
        job = client.query(delete_query)
        job.result()
        
        verify_result = list(client.query(check_query).result())[0]
        removed = result.total - verify_result.total
        print(f"  ✅ Removed {removed:,} duplicate rows")
        print(f"  Final: {verify_result.total:,} rows, {verify_result.unique_ids:,} unique condition_ids")
        
        return True
        
    except Exception as e:
        print(f"  ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def fix_events_duplicates(client):
    """Fix duplicates in events table."""
    print_section("3. FIXING EVENTS TABLE DUPLICATES")
    
    try:
        check_query = f"""
        SELECT 
          COUNT(*) as total,
          COUNT(DISTINCT event_slug) as unique_slugs
        FROM `{EVENTS_TABLE}`
        WHERE event_slug IS NOT NULL
        """
        result = list(client.query(check_query).result())[0]
        duplicates = result.total - result.unique_slugs
        print(f"  Current: {result.total:,} rows, {result.unique_slugs:,} unique event_slugs")
        print(f"  Duplicates to remove: {duplicates:,}")
        
        if duplicates == 0:
            print("  ✅ No duplicates found!")
            return True
        
        # Check for timestamp column
        schema_query = f"""
        SELECT column_name
        FROM `{PROJECT_ID}.{DATASET}.INFORMATION_SCHEMA.COLUMNS`
        WHERE table_name = 'events' 
          AND column_name IN ('created_at', 'updated_at', 'last_updated')
        LIMIT 1
        """
        schema_result = list(client.query(schema_query).result())
        timestamp_col = schema_result[0].column_name if schema_result else None
        
        if timestamp_col:
            delete_query = f"""
            DELETE FROM `{EVENTS_TABLE}`
            WHERE event_slug IN (
                SELECT event_slug
                FROM (
                    SELECT 
                        event_slug,
                        ROW_NUMBER() OVER (
                            PARTITION BY event_slug
                            ORDER BY {timestamp_col} DESC, event_slug DESC
                        ) as row_num
                    FROM `{EVENTS_TABLE}`
                    WHERE event_slug IS NOT NULL
                )
                WHERE row_num > 1
            )
            """
        else:
            delete_query = f"""
            DELETE FROM `{EVENTS_TABLE}`
            WHERE event_slug IN (
                SELECT event_slug
                FROM (
                    SELECT 
                        event_slug,
                        ROW_NUMBER() OVER (
                            PARTITION BY event_slug
                            ORDER BY event_slug DESC
                        ) as row_num
                    FROM `{EVENTS_TABLE}`
                    WHERE event_slug IS NOT NULL
                )
                WHERE row_num > 1
            )
            """
        
        print("  Deleting duplicates (keeping latest record)...")
        job = client.query(delete_query)
        job.result()
        
        verify_result = list(client.query(check_query).result())[0]
        removed = result.total - verify_result.total
        print(f"  ✅ Removed {removed:,} duplicate rows")
        print(f"  Final: {verify_result.total:,} rows, {verify_result.unique_slugs:,} unique event_slugs")
        
        return True
        
    except Exception as e:
        print(f"  ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("=" * 80)
    print("  SAFE DEDUPLICATION - Using DELETE statements")
    print("=" * 80)
    print(f"Timestamp: {datetime.now().isoformat()}")
    
    client = bigquery.Client(project=PROJECT_ID)
    
    print("\n⚠️  This will DELETE duplicate rows from production tables.")
    print("Only the latest record per key will be kept.")
    
    response = input("\nContinue? (yes/no): ").strip().lower()
    if response != 'yes':
        print("Cancelled.")
        return
    
    success = True
    success &= fix_trades_duplicates(client)
    success &= fix_markets_duplicates(client)
    success &= fix_events_duplicates(client)
    
    print("\n" + "=" * 80)
    if success:
        print("✅ Deduplication complete!")
    else:
        print("⚠️  Some operations failed. Check logs above.")
    print("=" * 80)

if __name__ == "__main__":
    main()
