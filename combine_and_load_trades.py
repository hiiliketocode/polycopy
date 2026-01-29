#!/usr/bin/env python3
"""
Combine all JSONL files from GCS and load to BigQuery
Much simpler than DTS!
"""

import os
from google.cloud import bigquery
from google.cloud import storage
from google.cloud.bigquery import LoadJobConfig

PROJECT_ID = "gen-lang-client-0299056258"
BUCKET = "gen-lang-client-0299056258-backfill-temp"
DATASET = "polycopy_v1"
TABLE = "trades_staging"
SOURCE_PREFIX = "trades/"
COMBINED_FILE = "trades_combined.jsonl"

def main():
    print("=" * 80)
    print("Combining JSONL Files and Loading to BigQuery")
    print("=" * 80)
    print()
    
    # Initialize clients
    storage_client = storage.Client(project=PROJECT_ID)
    bq_client = bigquery.Client(project=PROJECT_ID)
    
    # Step 1: List all JSONL files
    print("Step 1: Listing all JSONL files...")
    bucket = storage_client.bucket(BUCKET)
    blobs = list(bucket.list_blobs(prefix=SOURCE_PREFIX))
    jsonl_blobs = [b for b in blobs if b.name.endswith('.jsonl')]
    
    print(f"  Found {len(jsonl_blobs)} JSONL files")
    print()
    
    if not jsonl_blobs:
        print("❌ No JSONL files found!")
        return
    
    # Step 2: Create combined file in GCS (using compose for efficiency)
    print("Step 2: Combining files using GCS compose...")
    print("  (This is efficient - no download needed)")
    
    # GCS compose can combine up to 32 files at a time
    # So we'll do it in batches
    MAX_COMPOSE = 32
    combined_blobs = []
    
    for i in range(0, len(jsonl_blobs), MAX_COMPOSE):
        batch = jsonl_blobs[i:i + MAX_COMPOSE]
        temp_name = f"{SOURCE_PREFIX}_temp_batch_{i // MAX_COMPOSE}.jsonl"
        temp_blob = bucket.blob(temp_name)
        
        # Compose this batch
        temp_blob.compose(batch)
        combined_blobs.append(temp_blob)
        print(f"  Combined batch {i // MAX_COMPOSE + 1} ({len(batch)} files)")
    
    # If we have multiple batches, compose them into final file
    if len(combined_blobs) > 1:
        print(f"  Combining {len(combined_blobs)} batches into final file...")
        final_blob = bucket.blob(f"{SOURCE_PREFIX}{COMBINED_FILE}")
        final_blob.compose(combined_blobs)
        # Clean up temp batches
        for blob in combined_blobs:
            blob.delete()
        combined_file_uri = f"gs://{BUCKET}/{SOURCE_PREFIX}{COMBINED_FILE}"
    else:
        # Only one batch, rename it
        final_blob = bucket.blob(f"{SOURCE_PREFIX}{COMBINED_FILE}")
        final_blob.upload_from_string(combined_blobs[0].download_as_bytes())
        combined_blobs[0].delete()
        combined_file_uri = f"gs://{BUCKET}/{SOURCE_PREFIX}{COMBINED_FILE}"
    
    print(f"✅ Combined file created: {combined_file_uri}")
    print()
    
    # Step 3: Load to BigQuery
    print("Step 3: Loading to BigQuery...")
    table_id = f"{PROJECT_ID}.{DATASET}.{TABLE}"
    
    job_config = LoadJobConfig(
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
        write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
        autodetect=False,  # Use existing schema
    )
    
    load_job = bq_client.load_table_from_uri(
        combined_file_uri,
        table_id,
        job_config=job_config
    )
    
    print(f"  Job started: {load_job.job_id}")
    print("  Waiting for job to complete...")
    
    load_job.result()  # Wait for completion
    
    # Get stats
    table = bq_client.get_table(table_id)
    print()
    print("=" * 80)
    print("✅ SUCCESS!")
    print("=" * 80)
    print(f"Loaded to: {table_id}")
    print(f"Total rows: {table.num_rows:,}")
    print()
    print("To verify:")
    print(f"  bq query --use_legacy_sql=false \"SELECT COUNT(*) FROM `{table_id}`\"")

if __name__ == "__main__":
    main()
