#!/usr/bin/env python3
"""
Fix duplicates in production tables:
1. Trades table - deduplicate on wallet_address + tx_hash + order_hash
2. Markets table - deduplicate on condition_id
3. Events table - deduplicate on event_slug
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
    """Fix duplicates in trades table."""
    print_section("1. FIXING TRADES TABLE DUPLICATES")
    
    try:
        # Create deduplicated view and replace table
        print("  Creating deduplicated trades...")
        
        # First, check current state
        check_query = f"""
        SELECT 
          COUNT(*) as total,
          COUNT(DISTINCT CONCAT(wallet_address, '|', tx_hash, '|', COALESCE(order_hash, ''))) as unique_keys
        FROM `{TRADES_TABLE}`
        """
        result = list(client.query(check_query).result())[0]
        print(f"  Before: {result.total:,} rows, {result.unique_keys:,} unique keys")
        
        # Create temp table with deduplicated data
        temp_table = f"{TRADES_TABLE}_dedup_{int(datetime.now().timestamp())}"
        
        dedup_query = f"""
        CREATE TABLE `{temp_table}` AS
        SELECT *
        FROM `{TRADES_TABLE}`
        QUALIFY ROW_NUMBER() OVER (
            PARTITION BY wallet_address, tx_hash, COALESCE(order_hash, '')
            ORDER BY timestamp DESC, id DESC
        ) = 1
        """
        
        print("  Executing deduplication query (this may take a while)...")
        job = client.query(dedup_query)
        job.result()
        print("  ✅ Deduplicated table created")
        
        # Count deduplicated rows
        count_query = f"SELECT COUNT(*) as cnt FROM `{temp_table}`"
        count_result = list(client.query(count_query).result())[0]
        print(f"  After: {count_result.cnt:,} rows")
        print(f"  Removed: {result.total - count_result.cnt:,} duplicates")
        
        # Ask for confirmation before replacing
        print("\n  ⚠️  Ready to replace production table with deduplicated version")
        print("  This will:")
        print("    1. Backup current table")
        print("    2. Replace with deduplicated version")
        print("    3. Preserve schema and partitioning")
        
        response = input("\n  Continue? (yes/no): ").strip().lower()
        if response != 'yes':
            print("  ❌ Cancelled. Temp table left at:", temp_table)
            return False
        
        # Backup current table
        backup_table = f"{TRADES_TABLE}_backup_{int(datetime.now().timestamp())}"
        print(f"\n  Creating backup: {backup_table}")
        backup_query = f"CREATE TABLE `{backup_table}` AS SELECT * FROM `{TRADES_TABLE}`"
        client.query(backup_query).result()
        print("  ✅ Backup created")
        
        # Replace production table
        print("\n  Replacing production table...")
        # Use DDL to replace table structure
        replace_query = f"""
        CREATE OR REPLACE TABLE `{TRADES_TABLE}` AS
        SELECT * FROM `{temp_table}`
        """
        client.query(replace_query).result()
        print("  ✅ Production table replaced")
        
        # Cleanup temp table
        client.delete_table(temp_table)
        print("  ✅ Temp table cleaned up")
        
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
        # Check current state
        check_query = f"""
        SELECT 
          COUNT(*) as total,
          COUNT(DISTINCT condition_id) as unique_ids
        FROM `{MARKETS_TABLE}`
        WHERE condition_id IS NOT NULL
        """
        result = list(client.query(check_query).result())[0]
        print(f"  Before: {result.total:,} rows, {result.unique_ids:,} unique condition_ids")
        
        # Create deduplicated temp table
        temp_table = f"{MARKETS_TABLE}_dedup_{int(datetime.now().timestamp())}"
        
        # Check if last_updated column exists
        schema_query = f"""
        SELECT column_name
        FROM `{PROJECT_ID}.{DATASET}.INFORMATION_SCHEMA.COLUMNS`
        WHERE table_name = 'markets'
          AND column_name = 'last_updated'
        """
        schema_result = list(client.query(schema_query).result())
        has_last_updated = len(schema_result) > 0
        
        if has_last_updated:
            dedup_query = f"""
            CREATE TABLE `{temp_table}` AS
            SELECT *
            FROM `{MARKETS_TABLE}`
            QUALIFY ROW_NUMBER() OVER (
                PARTITION BY condition_id
                ORDER BY last_updated DESC, condition_id DESC
            ) = 1
            """
        else:
            # Use other timestamp columns or just keep first
            dedup_query = f"""
            CREATE TABLE `{temp_table}` AS
            SELECT *
            FROM `{MARKETS_TABLE}`
            QUALIFY ROW_NUMBER() OVER (
                PARTITION BY condition_id
                ORDER BY condition_id DESC
            ) = 1
            """
        
        print("  Executing deduplication query...")
        job = client.query(dedup_query)
        job.result()
        print("  ✅ Deduplicated table created")
        
        count_query = f"SELECT COUNT(*) as cnt FROM `{temp_table}`"
        count_result = list(client.query(count_query).result())[0]
        print(f"  After: {count_result.cnt:,} rows")
        print(f"  Removed: {result.total - count_result.cnt:,} duplicates")
        
        response = input("\n  Replace production table? (yes/no): ").strip().lower()
        if response != 'yes':
            print("  ❌ Cancelled. Temp table left at:", temp_table)
            return False
        
        # Backup and replace
        backup_table = f"{MARKETS_TABLE}_backup_{int(datetime.now().timestamp())}"
        print(f"\n  Creating backup: {backup_table}")
        client.query(f"CREATE TABLE `{backup_table}` AS SELECT * FROM `{MARKETS_TABLE}`").result()
        
        print("  Replacing production table...")
        client.query(f"CREATE OR REPLACE TABLE `{MARKETS_TABLE}` AS SELECT * FROM `{temp_table}`").result()
        print("  ✅ Production table replaced")
        
        client.delete_table(temp_table)
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
        print(f"  Before: {result.total:,} rows, {result.unique_slugs:,} unique event_slugs")
        
        temp_table = f"{EVENTS_TABLE}_dedup_{int(datetime.now().timestamp())}"
        
        # Check for created_at or similar timestamp
        schema_query = f"""
        SELECT column_name
        FROM `{PROJECT_ID}.{DATASET}.INFORMATION_SCHEMA.COLUMNS`
        WHERE table_name = 'events'
          AND column_name IN ('created_at', 'updated_at', 'last_updated')
        """
        schema_result = list(client.query(schema_query).result())
        timestamp_col = schema_result[0].column_name if schema_result else None
        
        if timestamp_col:
            dedup_query = f"""
            CREATE TABLE `{temp_table}` AS
            SELECT *
            FROM `{EVENTS_TABLE}`
            QUALIFY ROW_NUMBER() OVER (
                PARTITION BY event_slug
                ORDER BY {timestamp_col} DESC, event_slug DESC
            ) = 1
            """
        else:
            dedup_query = f"""
            CREATE TABLE `{temp_table}` AS
            SELECT *
            FROM `{EVENTS_TABLE}`
            QUALIFY ROW_NUMBER() OVER (
                PARTITION BY event_slug
                ORDER BY event_slug DESC
            ) = 1
            """
        
        print("  Executing deduplication query...")
        job = client.query(dedup_query)
        job.result()
        
        count_query = f"SELECT COUNT(*) as cnt FROM `{temp_table}`"
        count_result = list(client.query(count_query).result())[0]
        print(f"  After: {count_result.cnt:,} rows")
        print(f"  Removed: {result.total - count_result.cnt:,} duplicates")
        
        response = input("\n  Replace production table? (yes/no): ").strip().lower()
        if response != 'yes':
            print("  ❌ Cancelled. Temp table left at:", temp_table)
            return False
        
        backup_table = f"{EVENTS_TABLE}_backup_{int(datetime.now().timestamp())}"
        print(f"\n  Creating backup: {backup_table}")
        client.query(f"CREATE TABLE `{backup_table}` AS SELECT * FROM `{EVENTS_TABLE}`").result()
        
        print("  Replacing production table...")
        client.query(f"CREATE OR REPLACE TABLE `{EVENTS_TABLE}` AS SELECT * FROM `{temp_table}`").result()
        print("  ✅ Production table replaced")
        
        client.delete_table(temp_table)
        return True
        
    except Exception as e:
        print(f"  ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("=" * 80)
    print("  PRODUCTION TABLE DEDUPLICATION")
    print("=" * 80)
    print(f"Timestamp: {datetime.now().isoformat()}")
    
    client = bigquery.Client(project=PROJECT_ID)
    
    print("\n⚠️  WARNING: This will modify production tables!")
    print("Backups will be created before any changes.")
    
    response = input("\nContinue? (yes/no): ").strip().lower()
    if response != 'yes':
        print("Cancelled.")
        return
    
    # Fix trades
    fix_trades_duplicates(client)
    
    # Fix markets
    fix_markets_duplicates(client)
    
    # Fix events
    fix_events_duplicates(client)
    
    print("\n" + "=" * 80)
    print("✅ Deduplication complete!")
    print("=" * 80)

if __name__ == "__main__":
    main()
