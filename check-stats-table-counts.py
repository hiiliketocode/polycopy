#!/usr/bin/env python3
"""
Check counts in BigQuery trader_global_stats and trader_profile_stats tables
and compare with Supabase counts.
"""

import os
from google.cloud import bigquery
from supabase import create_client

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv('.env.local')
except ImportError:
    pass

PROJECT_ID = "gen-lang-client-0299056258"
DATASET = "polycopy_v1"
GLOBAL_STATS_TABLE = f"{PROJECT_ID}.{DATASET}.trader_global_stats"
PROFILE_STATS_TABLE = f"{PROJECT_ID}.{DATASET}.trader_profile_stats"

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def check_bigquery_counts():
    """Check counts in BigQuery tables."""
    client = bigquery.Client(project=PROJECT_ID)
    
    print("=" * 80)
    print("BigQuery Table Counts")
    print("=" * 80)
    
    # Check if tables exist and get row counts
    try:
        global_query = f"SELECT COUNT(*) as count FROM `{GLOBAL_STATS_TABLE}`"
        global_result = client.query(global_query).result()
        global_count = next(global_result)['count']
        print(f"✅ trader_global_stats: {global_count:,} rows")
    except Exception as e:
        print(f"❌ trader_global_stats: Error - {e}")
        global_count = None
    
    try:
        profile_query = f"SELECT COUNT(*) as count FROM `{PROFILE_STATS_TABLE}`"
        profile_result = client.query(profile_query).result()
        profile_count = next(profile_result)['count']
        print(f"✅ trader_profile_stats: {profile_count:,} rows")
    except Exception as e:
        print(f"❌ trader_profile_stats: Error - {e}")
        profile_count = None
    
    # Check if these are views or tables
    try:
        table_info_query = f"""
        SELECT 
            table_name,
            table_type
        FROM `{PROJECT_ID}.{DATASET}.INFORMATION_SCHEMA.TABLES`
        WHERE table_name IN ('trader_global_stats', 'trader_profile_stats')
        """
        table_info = client.query(table_info_query).result()
        print("\nTable Types:")
        for row in table_info:
            print(f"  {row['table_name']}: {row['table_type']}")
    except Exception as e:
        print(f"\n⚠️  Could not check table types: {e}")
    
    # Check unique wallet count in global stats
    try:
        wallet_query = f"SELECT COUNT(DISTINCT wallet_address) as count FROM `{GLOBAL_STATS_TABLE}`"
        wallet_result = client.query(wallet_query).result()
        wallet_count = next(wallet_result)['count']
        print(f"\nUnique wallets in trader_global_stats: {wallet_count:,}")
    except Exception as e:
        print(f"⚠️  Could not count unique wallets: {e}")
    
    return global_count, profile_count

def check_supabase_counts():
    """Check counts in Supabase tables."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("\n⚠️  Supabase credentials not set, skipping Supabase check")
        return None, None
    
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    print("\n" + "=" * 80)
    print("Supabase Table Counts")
    print("=" * 80)
    
    try:
        global_result = supabase.table('trader_global_stats').select('wallet_address', count='exact').execute()
        global_count = global_result.count
        print(f"✅ trader_global_stats: {global_count:,} rows")
    except Exception as e:
        print(f"❌ trader_global_stats: Error - {e}")
        global_count = None
    
    try:
        profile_result = supabase.table('trader_profile_stats').select('id', count='exact').execute()
        profile_count = profile_result.count
        print(f"✅ trader_profile_stats: {profile_count:,} rows")
    except Exception as e:
        print(f"❌ trader_profile_stats: Error - {e}")
        profile_count = None
    
    # Check unique wallet count
    try:
        wallet_result = supabase.table('trader_global_stats').select('wallet_address').execute()
        unique_wallets = len(set(row['wallet_address'] for row in wallet_result.data))
        print(f"\nUnique wallets in trader_global_stats: {unique_wallets:,}")
    except Exception as e:
        print(f"⚠️  Could not count unique wallets: {e}")
    
    return global_count, profile_count

def check_traders_table():
    """Check total wallets in traders table."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None
    
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    print("\n" + "=" * 80)
    print("Traders Table")
    print("=" * 80)
    
    try:
        traders_result = supabase.table('traders').select('wallet_address', count='exact').execute()
        traders_count = traders_result.count
        print(f"✅ Total wallets in traders table: {traders_count:,}")
        return traders_count
    except Exception as e:
        print(f"❌ Error checking traders table: {e}")
        return None

if __name__ == "__main__":
    print("Checking trader stats table counts...\n")
    
    bq_global, bq_profile = check_bigquery_counts()
    supabase_global, supabase_profile = check_supabase_counts()
    traders_count = check_traders_table()
    
    print("\n" + "=" * 80)
    print("Summary")
    print("=" * 80)
    
    if traders_count:
        print(f"\nTotal wallets in traders table: {traders_count:,}")
    
    if bq_global is not None:
        print(f"BigQuery trader_global_stats: {bq_global:,} rows")
        if traders_count and bq_global < traders_count:
            missing = traders_count - bq_global
            print(f"  ⚠️  Missing {missing:,} wallets in BigQuery!")
    
    if supabase_global is not None:
        print(f"Supabase trader_global_stats: {supabase_global:,} rows")
        if traders_count and supabase_global < traders_count:
            missing = traders_count - supabase_global
            print(f"  ⚠️  Missing {missing:,} wallets in Supabase!")
    
    if bq_global is not None and supabase_global is not None:
        if bq_global != supabase_global:
            diff = abs(bq_global - supabase_global)
            print(f"\n⚠️  Count mismatch: BigQuery has {bq_global:,}, Supabase has {supabase_global:,} (diff: {diff:,})")
        else:
            print(f"\n✅ Counts match between BigQuery and Supabase")
    
    print()
