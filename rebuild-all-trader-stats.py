#!/usr/bin/env python3
"""
Rebuild trader stats tables in BigQuery and sync to Supabase.

This script:
1. Rebuilds trader_global_stats table in BigQuery from trades table
2. Rebuilds trader_profile_stats table in BigQuery from trades table
3. Syncs updated stats to Supabase
4. Ensures all 1400+ traders are included
"""

import os
import sys
from datetime import datetime, timezone
from google.cloud import bigquery
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv('.env.local')

PROJECT_ID = "gen-lang-client-0299056258"
DATASET = "polycopy_v1"
GLOBAL_STATS_TABLE = f"{PROJECT_ID}.{DATASET}.trader_global_stats"
PROFILE_STATS_TABLE = f"{PROJECT_ID}.{DATASET}.trader_profile_stats"
TRADERS_TABLE = f"{PROJECT_ID}.{DATASET}.traders"
TRADES_TABLE = f"{PROJECT_ID}.{DATASET}.trades"

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def get_bigquery_client():
    """Initialize BigQuery client."""
    return bigquery.Client(project=PROJECT_ID)

def get_supabase_client() -> Client:
    """Initialize Supabase client."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise ValueError("Supabase credentials not set")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def read_sql_file(filepath: str) -> str:
    """Read SQL file content."""
    with open(filepath, 'r') as f:
        return f.read()

def rebuild_global_stats(bq_client: bigquery.Client) -> int:
    """Rebuild trader_global_stats table in BigQuery."""
    print("\n" + "="*80)
    print("Step 1: Rebuilding trader_global_stats table in BigQuery")
    print("="*80)
    
    sql_file = os.path.join(os.path.dirname(__file__), 'rebuild-trader-stats-bigquery.sql')
    if not os.path.exists(sql_file):
        raise FileNotFoundError(f"SQL file not found: {sql_file}")
    
    query = read_sql_file(sql_file)
    
    print("  Executing CREATE OR REPLACE TABLE query...")
    print("  This may take several minutes...")
    
    try:
        job = bq_client.query(query)
        job.result()  # Wait for job to complete
        
        # Count rows
        count_query = f"SELECT COUNT(*) as count FROM `{GLOBAL_STATS_TABLE}`"
        count_result = list(bq_client.query(count_query).result())
        row_count = count_result[0].count if count_result else 0
        
        print(f"  ✅ trader_global_stats rebuilt successfully!")
        print(f"  📊 Total wallets: {row_count:,}")
        return row_count
    except Exception as e:
        print(f"  ❌ Error rebuilding trader_global_stats: {e}")
        raise

def rebuild_profile_stats(bq_client: bigquery.Client) -> int:
    """Rebuild trader_profile_stats table in BigQuery."""
    print("\n" + "="*80)
    print("Step 2: Rebuilding trader_profile_stats table in BigQuery")
    print("="*80)
    
    sql_file = os.path.join(os.path.dirname(__file__), 'rebuild-trader-profile-stats-bigquery.sql')
    if not os.path.exists(sql_file):
        raise FileNotFoundError(f"SQL file not found: {sql_file}")
    
    query = read_sql_file(sql_file)
    
    print("  Executing CREATE OR REPLACE TABLE query...")
    print("  This may take several minutes...")
    
    try:
        job = bq_client.query(query)
        job.result()  # Wait for job to complete
        
        # Count rows
        count_query = f"SELECT COUNT(*) as count FROM `{PROFILE_STATS_TABLE}`"
        count_result = list(bq_client.query(count_query).result())
        row_count = count_result[0].count if count_result else 0
        
        print(f"  ✅ trader_profile_stats rebuilt successfully!")
        print(f"  📊 Total profile records: {row_count:,}")
        return row_count
    except Exception as e:
        print(f"  ❌ Error rebuilding trader_profile_stats: {e}")
        raise

def verify_trader_coverage(bq_client: bigquery.Client) -> dict:
    """Verify that all traders are covered."""
    print("\n" + "="*80)
    print("Step 3: Verifying trader coverage")
    print("="*80)
    
    # Count total traders
    traders_query = f"SELECT COUNT(*) as count FROM `{TRADERS_TABLE}`"
    traders_result = list(bq_client.query(traders_query).result())
    total_traders = traders_result[0].count if traders_result else 0
    
    # Count traders with trades
    trades_query = f"""
    SELECT COUNT(DISTINCT wallet_address) as count
    FROM `{TRADES_TABLE}`
    WHERE wallet_address IS NOT NULL
    """
    trades_result = list(bq_client.query(trades_query).result())
    traders_with_trades = trades_result[0].count if trades_result else 0
    
    # Count traders in global_stats
    stats_query = f"SELECT COUNT(*) as count FROM `{GLOBAL_STATS_TABLE}`"
    stats_result = list(bq_client.query(stats_query).result())
    traders_in_stats = stats_result[0].count if stats_result else 0
    
    print(f"  Total traders in traders table: {total_traders:,}")
    print(f"  Traders with trades: {traders_with_trades:,}")
    print(f"  Traders in global_stats: {traders_in_stats:,}")
    
    if traders_with_trades > traders_in_stats:
        missing = traders_with_trades - traders_in_stats
        print(f"  ⚠️  Missing {missing:,} traders from stats")
    else:
        print(f"  ✅ All traders with trades are included!")
    
    return {
        'total_traders': total_traders,
        'traders_with_trades': traders_with_trades,
        'traders_in_stats': traders_in_stats
    }

def sync_to_supabase(bq_client: bigquery.Client, supabase_client: Client) -> dict:
    """Sync stats from BigQuery to Supabase."""
    print("\n" + "="*80)
    print("Step 4: Syncing stats to Supabase")
    print("="*80)
    
    # Import sync functions dynamically
    import importlib.util
    sync_script_path = os.path.join(os.path.dirname(__file__), 'sync-trader-stats-from-bigquery.py')
    if not os.path.exists(sync_script_path):
        raise FileNotFoundError(f"Sync script not found: {sync_script_path}")
    
    spec = importlib.util.spec_from_file_location("sync_trader_stats", sync_script_path)
    sync_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(sync_module)
    
    global_count = sync_module.sync_global_stats(bq_client, supabase_client)
    profile_count = sync_module.sync_profile_stats(bq_client, supabase_client)
    
    return {
        'global_stats': global_count,
        'profile_stats': profile_count
    }

def main():
    start_time = datetime.now(timezone.utc)
    
    print("="*80)
    print("  REBUILD ALL TRADER STATS")
    print("="*80)
    print(f"Started at: {start_time.isoformat()}")
    print()
    
    bq_client = get_bigquery_client()
    supabase_client = get_supabase_client()
    
    try:
        # Step 1: Rebuild global stats
        global_count = rebuild_global_stats(bq_client)
        
        # Step 2: Rebuild profile stats
        profile_count = rebuild_profile_stats(bq_client)
        
        # Step 3: Verify coverage
        coverage = verify_trader_coverage(bq_client)
        
        # Step 4: Sync to Supabase
        sync_results = sync_to_supabase(bq_client, supabase_client)
        
        end_time = datetime.now(timezone.utc)
        duration = (end_time - start_time).total_seconds()
        
        print("\n" + "="*80)
        print("  ✅ REBUILD COMPLETE")
        print("="*80)
        print(f"Duration: {duration:.1f} seconds ({duration/60:.1f} minutes)")
        print(f"\nBigQuery Results:")
        print(f"  Global stats: {global_count:,} wallets")
        print(f"  Profile stats: {profile_count:,} records")
        print(f"\nCoverage:")
        print(f"  Total traders: {coverage['total_traders']:,}")
        print(f"  Traders with trades: {coverage['traders_with_trades']:,}")
        print(f"  Traders in stats: {coverage['traders_in_stats']:,}")
        print(f"\nSupabase Sync:")
        print(f"  Global stats synced: {sync_results['global_stats']:,}")
        print(f"  Profile stats synced: {sync_results['profile_stats']:,}")
        print("="*80)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
