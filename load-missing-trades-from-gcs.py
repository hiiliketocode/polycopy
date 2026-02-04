#!/usr/bin/env python3
"""
Load missing trades from GCS to BigQuery.

This script:
1. Finds wallets with GCS files but no trades in BigQuery
2. Loads GCS files to staging table in batches
3. Copies from staging to production with deduplication
"""

import os
import json
import time
from typing import List, Set
from google.cloud import bigquery
from google.cloud import storage

# Configuration
PROJECT_ID = os.getenv('GOOGLE_CLOUD_PROJECT', 'gen-lang-client-0299056258')
DATASET = os.getenv('DATASET', 'polycopy_v1')
GCS_BUCKET = os.getenv('GCS_BUCKET', f"{PROJECT_ID}-backfill-temp")
TRADES_STAGING_TABLE = f"{PROJECT_ID}.{DATASET}.trades_staging"
TRADES_TABLE = f"{PROJECT_ID}.{DATASET}.trades"
BATCH_SIZE = int(os.getenv('BATCH_SIZE', '10'))  # Load 10 files at a time (reduced to avoid quota)
LOAD_DELAY = float(os.getenv('LOAD_DELAY', '2.0'))  # Delay between loads in seconds

# Initialize clients
bq_client = bigquery.Client(project=PROJECT_ID)
storage_client = storage.Client(project=PROJECT_ID)


def get_wallets_with_trades_in_bq() -> Set[str]:
    """Get set of wallets that already have trades in BigQuery"""
    query = f"""
    SELECT DISTINCT wallet_address
    FROM `{TRADES_TABLE}`
    WHERE wallet_address IS NOT NULL
    """
    results = bq_client.query(query).result()
    return {row['wallet_address'].lower() for row in results if row.get('wallet_address')}


def get_gcs_files() -> List[str]:
    """Get list of all GCS trade files"""
    bucket = storage_client.bucket(GCS_BUCKET)
    blobs = bucket.list_blobs(prefix="trades/")
    files = []
    for blob in blobs:
        if blob.name.endswith('.jsonl') and blob.name.startswith('trades/'):
            # Extract wallet address from filename: trades/0x...jsonl
            wallet = blob.name.replace('trades/', '').replace('.jsonl', '')
            files.append((wallet, blob.name))
    return files


def get_trades_schema():
    """Get schema for trades table (from staging or production)"""
    try:
        # Try staging first
        staging_table_ref = bq_client.get_table(TRADES_STAGING_TABLE)
        return staging_table_ref.schema
    except:
        # Fall back to production table
        try:
            prod_table_ref = bq_client.get_table(TRADES_TABLE)
            return prod_table_ref.schema
        except:
            # If both fail, return None and use autodetect
            return None


def load_gcs_file_to_staging(gcs_uri: str, retries: int = 3) -> bool:
    """Load a single GCS file to staging table with deduplication"""
    # Use a temp table to deduplicate before merging into staging
    temp_table_id = f"{PROJECT_ID}.{DATASET}.temp_load_{int(time.time() * 1000000)}"
    
    for attempt in range(retries):
        try:
            # Step 1: Get schema (from staging or production)
            schema = get_trades_schema()
            
            # Step 2: Create temp table with same schema (or autodetect)
            if schema:
                temp_table = bigquery.Table(temp_table_id, schema=schema)
                temp_table = bq_client.create_table(temp_table, exists_ok=True)
                job_config = bigquery.LoadJobConfig(
                    source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
                    write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
                    schema=schema,
                    ignore_unknown_values=True,
                )
            else:
                # Use autodetect if schema unavailable
                job_config = bigquery.LoadJobConfig(
                    source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
                    write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
                    autodetect=True,
                    ignore_unknown_values=True,
                )
            
            # Step 3: Load to temp table
            load_job = bq_client.load_table_from_uri(
                gcs_uri,
                temp_table_id,
                job_config=job_config
            )
            
            load_job.result()  # Wait for job to complete
            
            # Step 4: Deduplicate and merge into staging
            merge_query = f"""
            MERGE `{TRADES_STAGING_TABLE}` AS target
            USING (
                SELECT *
                FROM `{temp_table_id}`
                QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY timestamp DESC) = 1
            ) AS source
            ON target.id = source.id
            WHEN NOT MATCHED THEN INSERT ROW
            """
            
            merge_job = bq_client.query(merge_query)
            merge_job.result()
            
            # Step 5: Clean up temp table
            try:
                bq_client.delete_table(temp_table_id, not_found_ok=True)
            except:
                pass
            
            return True
        except Exception as e:
            error_msg = str(e)
            # Clean up temp table on error
            try:
                bq_client.delete_table(temp_table_id, not_found_ok=True)
            except:
                pass
            
            # Check if it's a quota error
            if 'rateLimitExceeded' in error_msg or 'rate limit' in error_msg.lower():
                if attempt < retries - 1:
                    wait_time = (attempt + 1) * 5  # Exponential backoff: 5s, 10s, 15s
                    print(f"  ⏳ Quota limit hit, waiting {wait_time}s before retry...", flush=True)
                    time.sleep(wait_time)
                    continue
            print(f"  ⚠️  Error loading {gcs_uri}: {e}", flush=True)
            return False
    return False


def copy_staging_to_production():
    """Copy deduplicated trades from staging to production, excluding existing trades"""
    print("\n📝 Copying deduplicated trades from staging to production...", flush=True)
    
    # Use MERGE to avoid duplicates and only insert new trades
    merge_query = f"""
    MERGE `{TRADES_TABLE}` AS target
    USING (
        SELECT *
        FROM `{TRADES_STAGING_TABLE}`
        QUALIFY ROW_NUMBER() OVER (
            PARTITION BY wallet_address, tx_hash, COALESCE(order_hash, '')
            ORDER BY timestamp DESC, id DESC
        ) = 1
    ) AS source
    ON target.wallet_address = source.wallet_address
       AND target.tx_hash = source.tx_hash
       AND COALESCE(target.order_hash, '') = COALESCE(source.order_hash, '')
    WHEN NOT MATCHED THEN INSERT ROW
    """
    
    try:
        job = bq_client.query(merge_query)
        job.result()
        print("  ✅ Successfully copied trades to production", flush=True)
        return True
    except Exception as e:
        print(f"  ❌ Error copying to production: {e}", flush=True)
        return False


def main():
    print("=" * 80)
    print("Loading Missing Trades from GCS to BigQuery")
    print("=" * 80)
    print()
    
    # Step 1: Get wallets that already have trades
    print("Step 1: Finding wallets that already have trades in BigQuery...")
    wallets_in_bq = get_wallets_with_trades_in_bq()
    print(f"  Found {len(wallets_in_bq)} wallets with trades in BigQuery")
    print()
    
    # Step 2: Get all GCS files
    print("Step 2: Listing GCS files...")
    gcs_files = get_gcs_files()
    print(f"  Found {len(gcs_files)} GCS files")
    print()
    
    # Step 3: Filter to missing wallets
    print("Step 3: Identifying missing wallets...")
    missing_files = [
        (wallet, gcs_path) 
        for wallet, gcs_path in gcs_files 
        if wallet.lower() not in wallets_in_bq
    ]
    print(f"  Found {len(missing_files)} wallets with GCS files but no trades in BigQuery")
    print()
    
    if not missing_files:
        print("✅ All wallets already have trades!")
        return
    
    # Step 4: Load files in batches
    print(f"Step 4: Loading {len(missing_files)} GCS files to staging table...")
    print(f"  Processing in batches of {BATCH_SIZE}")
    print()
    
    loaded = 0
    failed = 0
    
    for i in range(0, len(missing_files), BATCH_SIZE):
        batch = missing_files[i:i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        total_batches = (len(missing_files) + BATCH_SIZE - 1) // BATCH_SIZE
        
        print(f"📦 Batch {batch_num}/{total_batches}: Loading {len(batch)} files...", flush=True)
        
        for wallet, gcs_path in batch:
            gcs_uri = f"gs://{GCS_BUCKET}/{gcs_path}"
            if load_gcs_file_to_staging(gcs_uri):
                loaded += 1
            else:
                failed += 1
            
            # Delay between each file load to avoid quota
            time.sleep(LOAD_DELAY)
        
        print(f"  ✅ Loaded {loaded} files, {failed} failed so far", flush=True)
        print()
        
        # Additional delay between batches to avoid quota issues
        if i + BATCH_SIZE < len(missing_files):
            time.sleep(5)
    
    print(f"✅ Loaded {loaded} files to staging, {failed} failed")
    print()
    
    # Step 5: Copy staging to production
    if loaded > 0:
        copy_staging_to_production()
    
    # Step 6: Verify
    print("\n📊 Verification:")
    final_wallets = get_wallets_with_trades_in_bq()
    print(f"  Wallets with trades: {len(final_wallets)}")
    print(f"  Added: {len(final_wallets) - len(wallets_in_bq)} wallets")
    
    print("\n" + "=" * 80)
    print("✨ Complete!")
    print("=" * 80)


if __name__ == '__main__':
    main()
