#!/usr/bin/env python3
"""
Sync trader stats from BigQuery to Supabase.
Reads from existing BigQuery tables (trader_global_stats, trader_profile_stats)
and syncs them to Supabase tables.
"""

import os
import sys
from datetime import datetime
from typing import List, Dict, Optional
from google.cloud import bigquery
from supabase import create_client, Client

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
GLOBAL_STATS_TABLE = f"{PROJECT_ID}.{DATASET}.trader_global_stats"
PROFILE_STATS_TABLE = f"{PROJECT_ID}.{DATASET}.trader_profile_stats"

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def get_bigquery_client():
    """Initializes BigQuery client."""
    return bigquery.Client(project=PROJECT_ID)

def get_supabase_client() -> Optional[Client]:
    """Initializes Supabase client."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("⚠️  Supabase credentials not set, skipping stats sync", flush=True)
        return None
    try:
        return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    except Exception as e:
        print(f"⚠️  Error initializing Supabase client: {e}", flush=True)
        return None

def sync_global_stats(bq_client: bigquery.Client, supabase_client: Client) -> int:
    """Read global stats from BigQuery and sync to Supabase."""
    print("Step 1: Reading global stats from BigQuery...", flush=True)
    
    query = f"""
    SELECT 
        wallet_address,
        L_count,
        D30_count,
        D7_count,
        L_win_rate,
        D30_win_rate,
        D7_win_rate,
        L_total_pnl_usd,
        D30_total_pnl_usd,
        D7_total_pnl_usd,
        L_total_roi_pct,
        D30_total_roi_pct,
        D7_total_roi_pct,
        L_avg_pnl_trade_usd,
        D30_avg_pnl_trade_usd,
        D7_avg_pnl_trade_usd,
        L_avg_trade_size_usd,
        D30_avg_trade_size_usd,
        D7_avg_trade_size_usd,
        L_avg_pos_size_usd,
        L_avg_trades_per_pos,
        current_win_streak
    FROM `{GLOBAL_STATS_TABLE}`
    """
    
    try:
        results = bq_client.query(query).result()
        stats_list = []
        
        for row in results:
            stats_list.append({
                'wallet_address': str(row['wallet_address']).lower().strip(),
                'l_count': int(row['L_count']) if row['L_count'] is not None else 0,
                'd30_count': int(row['D30_count']) if row['D30_count'] is not None else 0,
                'd7_count': int(row['D7_count']) if row['D7_count'] is not None else 0,
                'l_win_rate': float(row['L_win_rate']) if row['L_win_rate'] is not None else None,
                'd30_win_rate': float(row['D30_win_rate']) if row['D30_win_rate'] is not None else None,
                'd7_win_rate': float(row['D7_win_rate']) if row['D7_win_rate'] is not None else None,
                'l_total_pnl_usd': float(row['L_total_pnl_usd']) if row['L_total_pnl_usd'] is not None else 0.0,
                'd30_total_pnl_usd': float(row['D30_total_pnl_usd']) if row['D30_total_pnl_usd'] is not None else 0.0,
                'd7_total_pnl_usd': float(row['D7_total_pnl_usd']) if row['D7_total_pnl_usd'] is not None else 0.0,
                'l_total_roi_pct': float(row['L_total_roi_pct']) if row['L_total_roi_pct'] is not None else 0.0,
                'd30_total_roi_pct': float(row['D30_total_roi_pct']) if row['D30_total_roi_pct'] is not None else 0.0,
                'd7_total_roi_pct': float(row['D7_total_roi_pct']) if row['D7_total_roi_pct'] is not None else 0.0,
                'l_avg_pnl_trade_usd': float(row['L_avg_pnl_trade_usd']) if row['L_avg_pnl_trade_usd'] is not None else 0.0,
                'd30_avg_pnl_trade_usd': float(row['D30_avg_pnl_trade_usd']) if row['D30_avg_pnl_trade_usd'] is not None else 0.0,
                'd7_avg_pnl_trade_usd': float(row['D7_avg_pnl_trade_usd']) if row['D7_avg_pnl_trade_usd'] is not None else 0.0,
                'l_avg_trade_size_usd': float(row['L_avg_trade_size_usd']) if row['L_avg_trade_size_usd'] is not None else 0.0,
                'd30_avg_trade_size_usd': float(row['D30_avg_trade_size_usd']) if row['D30_avg_trade_size_usd'] is not None else 0.0,
                'd7_avg_trade_size_usd': float(row['D7_avg_trade_size_usd']) if row['D7_avg_trade_size_usd'] is not None else 0.0,
                'l_avg_pos_size_usd': float(row['L_avg_pos_size_usd']) if row['L_avg_pos_size_usd'] is not None else 0.0,
                'l_avg_trades_per_pos': float(row['L_avg_trades_per_pos']) if row['L_avg_trades_per_pos'] is not None else 0.0,
                'current_win_streak': int(row['current_win_streak']) if row['current_win_streak'] is not None else 0,
                'updated_at': datetime.utcnow().isoformat()
            })
        
        print(f"  ✅ Read {len(stats_list)} global stats records from BigQuery", flush=True)
        
        # Upsert to Supabase in batches
        print("Step 2: Upserting global stats to Supabase...", flush=True)
        batch_size = 100
        updated = 0
        errors = 0
        
        for i in range(0, len(stats_list), batch_size):
            batch = stats_list[i:i + batch_size]
            try:
                result = supabase_client.table('trader_global_stats').upsert(
                    batch,
                    on_conflict='wallet_address'
                ).execute()
                updated += len(batch)
                if (i // batch_size + 1) % 10 == 0:
                    print(f"  Processed {updated}/{len(stats_list)} records...", flush=True)
            except Exception as e:
                errors += len(batch)
                print(f"  ❌ Error upserting batch {i//batch_size + 1}: {e}", flush=True)
        
        print(f"  ✅ Upserted {updated} global stats records", flush=True)
        if errors > 0:
            print(f"  ⚠️  {errors} records failed", flush=True)
        
        return updated
        
    except Exception as e:
        print(f"  ❌ Error reading global stats from BigQuery: {e}", flush=True)
        return 0

def sync_profile_stats(bq_client: bigquery.Client, supabase_client: Client) -> int:
    """Read profile stats from BigQuery and sync to Supabase."""
    print("\nStep 3: Reading profile stats from BigQuery...", flush=True)
    
    query = f"""
    SELECT 
        wallet_address,
        final_niche,
        structure,
        bracket,
        L_count,
        D30_count,
        D7_count,
        L_win_rate,
        D30_win_rate,
        D7_win_rate,
        L_total_pnl_usd,
        D30_total_pnl_usd,
        D7_total_pnl_usd,
        L_total_roi_pct,
        D30_total_roi_pct,
        D7_total_roi_pct,
        L_avg_pnl_trade_usd,
        D30_avg_pnl_trade_usd,
        D7_avg_pnl_trade_usd,
        L_avg_trade_size_usd,
        D30_avg_trade_size_usd,
        D7_avg_trade_size_usd,
        current_win_streak
    FROM `{PROFILE_STATS_TABLE}`
    """
    
    try:
        results = bq_client.query(query).result()
        stats_list = []
        
        for row in results:
            stats_list.append({
                'wallet_address': str(row['wallet_address']).lower().strip(),
                'final_niche': str(row['final_niche']) if row['final_niche'] else 'OTHER',
                'structure': str(row['structure']) if row['structure'] else 'STANDARD',
                'bracket': str(row['bracket']) if row['bracket'] else 'MID',
                'l_count': int(row['L_count']) if row['L_count'] is not None else 0,
                'd30_count': int(row['D30_count']) if row['D30_count'] is not None else 0,
                'd7_count': int(row['D7_count']) if row['D7_count'] is not None else 0,
                'l_win_rate': float(row['L_win_rate']) if row['L_win_rate'] is not None else None,
                'd30_win_rate': float(row['D30_win_rate']) if row['D30_win_rate'] is not None else None,
                'd7_win_rate': float(row['D7_win_rate']) if row['D7_win_rate'] is not None else None,
                'l_total_pnl_usd': float(row['L_total_pnl_usd']) if row['L_total_pnl_usd'] is not None else 0.0,
                'd30_total_pnl_usd': float(row['D30_total_pnl_usd']) if row['D30_total_pnl_usd'] is not None else 0.0,
                'd7_total_pnl_usd': float(row['D7_total_pnl_usd']) if row['D7_total_pnl_usd'] is not None else 0.0,
                'l_total_roi_pct': float(row['L_total_roi_pct']) if row['L_total_roi_pct'] is not None else 0.0,
                'd30_total_roi_pct': float(row['D30_total_roi_pct']) if row['D30_total_roi_pct'] is not None else 0.0,
                'd7_total_roi_pct': float(row['D7_total_roi_pct']) if row['D7_total_roi_pct'] is not None else 0.0,
                'l_avg_pnl_trade_usd': float(row['L_avg_pnl_trade_usd']) if row['L_avg_pnl_trade_usd'] is not None else 0.0,
                'd30_avg_pnl_trade_usd': float(row['D30_avg_pnl_trade_usd']) if row['D30_avg_pnl_trade_usd'] is not None else 0.0,
                'd7_avg_pnl_trade_usd': float(row['D7_avg_pnl_trade_usd']) if row['D7_avg_pnl_trade_usd'] is not None else 0.0,
                'l_avg_trade_size_usd': float(row['L_avg_trade_size_usd']) if row['L_avg_trade_size_usd'] is not None else 0.0,
                'd30_avg_trade_size_usd': float(row['D30_avg_trade_size_usd']) if row['D30_avg_trade_size_usd'] is not None else 0.0,
                'd7_avg_trade_size_usd': float(row['D7_avg_trade_size_usd']) if row['D7_avg_trade_size_usd'] is not None else 0.0,
                'current_win_streak': int(row['current_win_streak']) if row['current_win_streak'] is not None else 0,
                'updated_at': datetime.utcnow().isoformat()
            })
        
        print(f"  ✅ Read {len(stats_list)} profile stats records from BigQuery", flush=True)
        
        # Upsert to Supabase in batches
        print("Step 4: Upserting profile stats to Supabase...", flush=True)
        batch_size = 100
        updated = 0
        errors = 0
        
        for i in range(0, len(stats_list), batch_size):
            batch = stats_list[i:i + batch_size]
            try:
                result = supabase_client.table('trader_profile_stats').upsert(
                    batch,
                    on_conflict='wallet_address,final_niche,structure,bracket'
                ).execute()
                updated += len(batch)
                if (i // batch_size + 1) % 10 == 0:
                    print(f"  Processed {updated}/{len(stats_list)} records...", flush=True)
            except Exception as e:
                errors += len(batch)
                print(f"  ❌ Error upserting batch {i//batch_size + 1}: {e}", flush=True)
        
        print(f"  ✅ Upserted {updated} profile stats records", flush=True)
        if errors > 0:
            print(f"  ⚠️  {errors} records failed", flush=True)
        
        return updated
        
    except Exception as e:
        print(f"  ❌ Error reading profile stats from BigQuery: {e}", flush=True)
        return 0

def main():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise ValueError("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    
    start_time = datetime.utcnow()
    print("=" * 80, flush=True)
    print("Syncing Trader Stats from BigQuery to Supabase", flush=True)
    print("Reading from existing BigQuery tables", flush=True)
    print("=" * 80, flush=True)
    print()
    
    bq_client = get_bigquery_client()
    supabase_client = get_supabase_client()
    
    if not supabase_client:
        print("❌ Supabase client not available", flush=True)
        return
    
    # Sync global stats
    global_stats_count = sync_global_stats(bq_client, supabase_client)
    
    # Sync profile stats
    profile_stats_count = sync_profile_stats(bq_client, supabase_client)
    
    end_time = datetime.utcnow()
    duration = (end_time - start_time).total_seconds()
    
    print()
    print("=" * 80, flush=True)
    print("✅ Sync Complete!", flush=True)
    print(f"Duration: {duration:.1f} seconds", flush=True)
    print(f"Global stats synced: {global_stats_count}", flush=True)
    print(f"Profile stats synced: {profile_stats_count}", flush=True)
    print("=" * 80, flush=True)

if __name__ == "__main__":
    main()
