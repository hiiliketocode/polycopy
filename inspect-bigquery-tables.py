#!/usr/bin/env python3
"""
Utility script to inspect BigQuery tables.
Shows table schemas, row counts, and sample data.
"""

import os
import sys
from google.cloud import bigquery
from google.cloud.exceptions import NotFound

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv('.env.local')
except ImportError:
    pass

PROJECT_ID = "gen-lang-client-0299056258"
DATASET = "polycopy_v1"

def get_bigquery_client():
    """Initialize BigQuery client."""
    return bigquery.Client(project=PROJECT_ID)

def list_tables(client: bigquery.Client):
    """List all tables in the dataset."""
    dataset_ref = client.dataset(DATASET)
    try:
        tables = list(client.list_tables(dataset_ref))
        print(f"\n📊 Tables in {PROJECT_ID}.{DATASET}:")
        print("=" * 80)
        for table in tables:
            print(f"  • {table.table_id}")
        return [t.table_id for t in tables]
    except NotFound:
        print(f"❌ Dataset {DATASET} not found!")
        return []

def get_table_info(client: bigquery.Client, table_name: str):
    """Get detailed information about a table."""
    table_ref = client.dataset(DATASET).table(table_name)
    
    try:
        table = client.get_table(table_ref)
        
        print(f"\n📋 Table: {PROJECT_ID}.{DATASET}.{table_name}")
        print("=" * 80)
        
        # Row count
        print(f"📊 Row count: {table.num_rows:,}")
        print(f"💾 Size: {table.num_bytes / (1024**3):.2f} GB")
        print(f"🕐 Created: {table.created}")
        print(f"🔄 Modified: {table.modified}")
        
        # Schema
        print(f"\n📐 Schema ({len(table.schema)} columns):")
        print("-" * 80)
        for field in table.schema:
            mode_str = f" ({field.mode})" if field.mode != "NULLABLE" else ""
            print(f"  • {field.name:30} {field.field_type:15}{mode_str}")
            if field.description:
                print(f"    └─ {field.description}")
        
        return table
    except NotFound:
        print(f"❌ Table {table_name} not found!")
        return None

def get_table_sample(client: bigquery.Client, table_name: str, limit: int = 5):
    """Get sample rows from a table."""
    query = f"""
    SELECT *
    FROM `{PROJECT_ID}.{DATASET}.{table_name}`
    LIMIT {limit}
    """
    
    try:
        print(f"\n🔍 Sample data (first {limit} rows):")
        print("-" * 80)
        results = client.query(query).result()
        
        rows = list(results)
        if not rows:
            print("  (No rows found)")
            return
        
        # Print column headers
        headers = list(rows[0].keys())
        print("  " + " | ".join(f"{h:20}" for h in headers[:10]))  # Limit to 10 cols for display
        print("  " + "-" * 200)
        
        # Print rows
        for row in rows:
            values = []
            for h in headers[:10]:
                val = row.get(h)
                if val is None:
                    val = "NULL"
                elif isinstance(val, (int, float)):
                    val = str(val)
                elif isinstance(val, str):
                    val = val[:17] + "..." if len(val) > 20 else val
                else:
                    val = str(val)[:17] + "..." if len(str(val)) > 20 else str(val)
                values.append(f"{val:20}")
            print("  " + " | ".join(values))
        
        if len(headers) > 10:
            print(f"\n  ... and {len(headers) - 10} more columns")
            
    except Exception as e:
        print(f"❌ Error querying table: {e}")

def get_table_stats(client: bigquery.Client, table_name: str):
    """Get basic statistics about a table."""
    query = f"""
    SELECT 
        COUNT(*) as total_rows,
        COUNT(DISTINCT wallet_address) as unique_wallets,
        MIN(timestamp) as earliest_timestamp,
        MAX(timestamp) as latest_timestamp
    FROM `{PROJECT_ID}.{DATASET}.{table_name}`
    """
    
    # Adjust query based on table structure
    if table_name == "markets":
        query = f"""
        SELECT 
            COUNT(*) as total_rows,
            COUNT(DISTINCT condition_id) as unique_condition_ids,
            COUNTIF(status = 'resolved') as resolved_count,
            COUNTIF(status = 'open') as open_count,
            MIN(created_at) as earliest_created,
            MAX(created_at) as latest_created
        FROM `{PROJECT_ID}.{DATASET}.{table_name}`
        """
    elif table_name == "traders":
        query = f"""
        SELECT 
            COUNT(*) as total_rows,
            COUNT(DISTINCT wallet_address) as unique_wallets
        FROM `{PROJECT_ID}.{DATASET}.{table_name}`
        """
    
    try:
        print(f"\n📈 Table Statistics:")
        print("-" * 80)
        results = client.query(query).result()
        row = next(results, None)
        if row:
            for key, value in row.items():
                print(f"  • {key}: {value}")
    except Exception as e:
        print(f"⚠️  Could not get stats: {e}")

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Inspect BigQuery tables")
    parser.add_argument("table", nargs="?", help="Table name to inspect (optional)")
    parser.add_argument("--list", action="store_true", help="List all tables")
    parser.add_argument("--sample", type=int, default=5, help="Number of sample rows to show")
    parser.add_argument("--stats", action="store_true", help="Show table statistics")
    
    args = parser.parse_args()
    
    client = get_bigquery_client()
    
    if args.list or not args.table:
        tables = list_tables(client)
        if not args.table and not args.list:
            print("\n💡 Usage:")
            print("  python inspect-bigquery-tables.py <table_name>")
            print("  python inspect-bigquery-tables.py <table_name> --sample 10")
            print("  python inspect-bigquery-tables.py <table_name> --stats")
            print("  python inspect-bigquery-tables.py --list")
            return
    
    if args.table:
        table = get_table_info(client, args.table)
        if table:
            if args.stats:
                get_table_stats(client, args.table)
            get_table_sample(client, args.table, args.sample)

if __name__ == "__main__":
    main()
