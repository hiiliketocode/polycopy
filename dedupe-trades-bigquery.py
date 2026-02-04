#!/usr/bin/env python3
"""
Deduplicate BigQuery trades table.

This script:
1. Creates a deduplicated table keeping the most recent record for each idempotency key
2. Verifies the deduplication results
3. Replaces the original table with the deduplicated version

Idempotency key: wallet_address + tx_hash + COALESCE(order_hash, '')
"""

import os
import sys
import time
from datetime import datetime
from google.cloud import bigquery

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv('.env.local')
except ImportError:
    pass

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# Configuration
PROJECT_ID = "gen-lang-client-0299056258"
DATASET = "polycopy_v1"
TRADES_TABLE = f"{PROJECT_ID}.{DATASET}.trades"
TRADES_TABLE_DEDUPED = f"{PROJECT_ID}.{DATASET}.trades_deduped"
TRADES_TABLE_BACKUP = f"{PROJECT_ID}.{DATASET}.trades_backup_{int(time.time())}"

def get_bigquery_client():
    """Initializes BigQuery client."""
    print(f"🔌 Creating BigQuery client for project: {PROJECT_ID}", flush=True)
    try:
        client = bigquery.Client(project=PROJECT_ID)
        print("✅ BigQuery client created successfully", flush=True)
        return client
    except Exception as e:
        print(f"❌ ERROR: Failed to create BigQuery client: {e}", flush=True)
        raise

def get_table_stats(client: bigquery.Client, table_id: str) -> dict:
    """Get statistics about a table."""
    query = f"""
    SELECT 
        COUNT(*) as total_rows,
        COUNT(DISTINCT id) as distinct_ids,
        COUNT(DISTINCT CONCAT(wallet_address, '|', tx_hash, '|', COALESCE(order_hash, ''))) as distinct_keys
    FROM `{table_id}`
    """
    result = client.query(query).result()
    row = next(result)
    return {
        'total_rows': row.total_rows,
        'distinct_ids': row.distinct_ids,
        'distinct_keys': row.distinct_keys
    }

def create_deduplicated_table(client: bigquery.Client) -> str:
    """Create a deduplicated version of the trades table."""
    print(f"\n📊 Step 1: Creating deduplicated table...", flush=True)
    
    # First, get the schema from the original table
    print(f"  📋 Getting schema from {TRADES_TABLE}...", flush=True)
    source_table = client.get_table(TRADES_TABLE)
    schema = source_table.schema
    
    # Create deduplicated table using CREATE TABLE AS SELECT
    # Keep the most recent record for each idempotency key
    create_query = f"""
    CREATE OR REPLACE TABLE `{TRADES_TABLE_DEDUPED}` AS
    SELECT *
    FROM `{TRADES_TABLE}`
    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY 
            wallet_address, 
            tx_hash, 
            COALESCE(order_hash, '')
        ORDER BY 
            timestamp DESC,
            id DESC
    ) = 1
    """
    
    print(f"  🔄 Executing deduplication query...", flush=True)
    print(f"  ⏳ This may take several minutes for ~56M rows...", flush=True)
    
    job = client.query(create_query)
    job.result()  # Wait for completion
    
    print(f"  ✅ Deduplicated table created: {TRADES_TABLE_DEDUPED}", flush=True)
    return TRADES_TABLE_DEDUPED

def verify_deduplication(client: bigquery.Client):
    """Verify the deduplication results."""
    print(f"\n🔍 Step 2: Verifying deduplication...", flush=True)
    
    # Get stats for original table
    print(f"  📊 Analyzing original table...", flush=True)
    original_stats = get_table_stats(client, TRADES_TABLE)
    print(f"    Original - Total rows: {original_stats['total_rows']:,}")
    print(f"    Original - Distinct IDs: {original_stats['distinct_ids']:,}")
    print(f"    Original - Distinct keys: {original_stats['distinct_keys']:,}")
    
    # Get stats for deduplicated table
    print(f"  📊 Analyzing deduplicated table...", flush=True)
    deduped_stats = get_table_stats(client, TRADES_TABLE_DEDUPED)
    print(f"    Deduplicated - Total rows: {deduped_stats['total_rows']:,}")
    print(f"    Deduplicated - Distinct IDs: {deduped_stats['distinct_ids']:,}")
    print(f"    Deduplicated - Distinct keys: {deduped_stats['distinct_keys']:,}")
    
    # Check for remaining duplicates
    print(f"  🔍 Checking for remaining duplicates in deduplicated table...", flush=True)
    duplicate_check_query = f"""
    SELECT 
        COUNT(*) as duplicate_count
    FROM (
        SELECT 
            wallet_address, 
            tx_hash, 
            COALESCE(order_hash, '') as order_hash,
            COUNT(*) as cnt
        FROM `{TRADES_TABLE_DEDUPED}`
        GROUP BY wallet_address, tx_hash, COALESCE(order_hash, '')
        HAVING COUNT(*) > 1
    )
    """
    result = client.query(duplicate_check_query).result()
    duplicate_count = next(result).duplicate_count
    
    if duplicate_count > 0:
        print(f"    ⚠️  WARNING: Found {duplicate_count} remaining duplicate groups!", flush=True)
        return False
    else:
        print(f"    ✅ No duplicates found!", flush=True)
    
    # Verify row counts match distinct keys
    if deduped_stats['total_rows'] != deduped_stats['distinct_keys']:
        print(f"    ⚠️  WARNING: Row count ({deduped_stats['total_rows']:,}) doesn't match distinct keys ({deduped_stats['distinct_keys']:,})", flush=True)
        return False
    
    # Calculate reduction
    rows_removed = original_stats['total_rows'] - deduped_stats['total_rows']
    reduction_pct = (rows_removed / original_stats['total_rows']) * 100
    
    print(f"\n  📈 Deduplication Summary:", flush=True)
    print(f"    Rows removed: {rows_removed:,} ({reduction_pct:.2f}%)", flush=True)
    print(f"    Final row count: {deduped_stats['total_rows']:,}", flush=True)
    
    return True

def backup_original_table(client: bigquery.Client):
    """Create a backup of the original table."""
    print(f"\n💾 Step 3: Creating backup of original table...", flush=True)
    
    copy_query = f"""
    CREATE TABLE `{TRADES_TABLE_BACKUP}` AS
    SELECT * FROM `{TRADES_TABLE}`
    """
    
    print(f"  📋 Copying to {TRADES_TABLE_BACKUP}...", flush=True)
    job = client.query(copy_query)
    job.result()
    
    print(f"  ✅ Backup created: {TRADES_TABLE_BACKUP}", flush=True)
    return TRADES_TABLE_BACKUP

def replace_original_table(client: bigquery.Client):
    """Replace the original table with the deduplicated version."""
    print(f"\n🔄 Step 4: Replacing original table with deduplicated version...", flush=True)
    
    # Get original table to preserve partitioning and clustering
    print(f"  📋 Getting original table definition...", flush=True)
    original_table = client.get_table(TRADES_TABLE)
    
    # Extract partitioning and clustering info
    partition_field = None
    partition_type = None
    clustering_fields = None
    
    if original_table.time_partitioning:
        partition_field = original_table.time_partitioning.field
        partition_type = original_table.time_partitioning.type_
        print(f"    Partitioning: {partition_type} on {partition_field}", flush=True)
    
    if original_table.clustering_fields:
        clustering_fields = original_table.clustering_fields
        print(f"    Clustering: {clustering_fields}", flush=True)
    
    # Step 1: Drop the original table
    print(f"  🗑️  Dropping original table...", flush=True)
    drop_query = f"DROP TABLE `{TRADES_TABLE}`"
    client.query(drop_query).result()
    print(f"    ✅ Original table dropped", flush=True)
    
    # Step 2: Create new table structure with partitioning and clustering
    print(f"  📋 Creating new table structure...", flush=True)
    
    # Get schema from deduplicated table
    deduped_table = client.get_table(TRADES_TABLE_DEDUPED)
    
    # Create new table with same schema
    new_table = bigquery.Table(TRADES_TABLE, schema=deduped_table.schema)
    
    # Preserve partitioning
    if partition_field and partition_type:
        if partition_type == "DAY":
            new_table.time_partitioning = bigquery.TimePartitioning(
                type_=bigquery.TimePartitioningType.DAY,
                field=partition_field
            )
        elif partition_type == "HOUR":
            new_table.time_partitioning = bigquery.TimePartitioning(
                type_=bigquery.TimePartitioningType.HOUR,
                field=partition_field
            )
        elif partition_type == "MONTH":
            new_table.time_partitioning = bigquery.TimePartitioning(
                type_=bigquery.TimePartitioningType.MONTH,
                field=partition_field
            )
        elif partition_type == "YEAR":
            new_table.time_partitioning = bigquery.TimePartitioning(
                type_=bigquery.TimePartitioningType.YEAR,
                field=partition_field
            )
    
    # Preserve clustering
    if clustering_fields:
        new_table.clustering_fields = clustering_fields
    
    # Create empty table
    client.create_table(new_table)
    print(f"    ✅ Table structure created", flush=True)
    
    # Step 3: Copy data from deduplicated table
    print(f"  🔄 Copying deduplicated data...", flush=True)
    copy_query = f"""
    INSERT INTO `{TRADES_TABLE}`
    SELECT * FROM `{TRADES_TABLE_DEDUPED}`
    """
    job = client.query(copy_query)
    job.result()
    
    print(f"  ✅ Original table replaced with deduplicated version", flush=True)
    
    # Verify final state
    print(f"  🔍 Verifying final state...", flush=True)
    final_stats = get_table_stats(client, TRADES_TABLE)
    print(f"    Final - Total rows: {final_stats['total_rows']:,}")
    print(f"    Final - Distinct IDs: {final_stats['distinct_ids']:,}")
    print(f"    Final - Distinct keys: {final_stats['distinct_keys']:,}")

def main():
    """Main execution function."""
    print("=" * 80, flush=True)
    print("BigQuery Trades Table Deduplication", flush=True)
    print("=" * 80, flush=True)
    print(f"Start time: {datetime.now().isoformat()}", flush=True)
    print(f"Table: {TRADES_TABLE}", flush=True)
    print("=" * 80, flush=True)
    
    client = get_bigquery_client()
    
    try:
        # Step 1: Create deduplicated table
        deduped_table = create_deduplicated_table(client)
        
        # Step 2: Verify deduplication
        if not verify_deduplication(client):
            print("\n❌ Verification failed! Aborting replacement.", flush=True)
            print(f"   Deduplicated table created at: {TRADES_TABLE_DEDUPED}", flush=True)
            print(f"   Please review before proceeding.", flush=True)
            return False
        
        # Step 3: Backup original table
        backup_table = backup_original_table(client)
        
        # Step 4: Replace original table
        replace_original_table(client)
        
        print("\n" + "=" * 80, flush=True)
        print("✅ Deduplication completed successfully!", flush=True)
        print("=" * 80, flush=True)
        print(f"Backup table: {backup_table}", flush=True)
        print(f"Deduplicated table: {TRADES_TABLE_DEDUPED}", flush=True)
        print(f"Original table: {TRADES_TABLE} (now deduplicated)", flush=True)
        print("=" * 80, flush=True)
        
        return True
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
