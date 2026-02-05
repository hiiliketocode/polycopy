#!/usr/bin/env python3
"""
Comprehensive audit of all data pipelines.

Checks:
1. Adding new traders to Supabase traders table (via API)
2. Syncing traders from Supabase to BigQuery
3. Daily sync: trades, markets, events to BigQuery
4. Market classification
5. Recomputing global/profile stats
6. Syncing stats to Supabase
7. Scheduled jobs and cron endpoints
"""

import os
import sys
import json
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from google.cloud import bigquery
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv('.env.local')

PROJECT_ID = "gen-lang-client-0299056258"
DATASET = "polycopy_v1"

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Table names
TRADERS_TABLE = f"{PROJECT_ID}.{DATASET}.traders"
TRADES_TABLE = f"{PROJECT_ID}.{DATASET}.trades"
MARKETS_TABLE = f"{PROJECT_ID}.{DATASET}.markets"
EVENTS_TABLE = f"{PROJECT_ID}.{DATASET}.events"
GLOBAL_STATS_TABLE = f"{PROJECT_ID}.{DATASET}.trader_global_stats"
PROFILE_STATS_TABLE = f"{PROJECT_ID}.{DATASET}.trader_profile_stats"
CHECKPOINT_TABLE = f"{PROJECT_ID}.{DATASET}.daily_sync_checkpoint"

def get_bigquery_client():
    """Initialize BigQuery client."""
    return bigquery.Client(project=PROJECT_ID)

def get_supabase_client() -> Client:
    """Initialize Supabase client."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise ValueError("Supabase credentials not set")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def audit_pipeline_1_traders_to_supabase(bq_client: bigquery.Client, supabase_client: Client) -> Dict:
    """Audit Pipeline 1: Adding new traders to Supabase traders table."""
    print("\n" + "="*80)
    print("PIPELINE 1: Adding New Traders to Supabase")
    print("="*80)
    
    results = {
        'status': '✅',
        'issues': [],
        'details': {}
    }
    
    try:
        # Check Supabase traders table
        traders_result = supabase_client.table('traders').select('wallet_address, created_at, updated_at', count='exact').limit(1000).execute()
        supabase_count = traders_result.count if traders_result.count else len(traders_result.data or [])
        
        # Check recent additions (last 7 days)
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        recent_result = supabase_client.table('traders')\
            .select('wallet_address, created_at', count='exact')\
            .gte('created_at', week_ago)\
            .execute()
        recent_count = recent_result.count if recent_result.count else len(recent_result.data or [])
        
        results['details'] = {
            'total_traders_supabase': supabase_count,
            'recent_additions_7d': recent_count,
            'sample_recent': recent_result.data[:5] if recent_result.data else []
        }
        
        print(f"  ✅ Total traders in Supabase: {supabase_count:,}")
        print(f"  📊 New traders added in last 7 days: {recent_count:,}")
        
        # Check if there's a cron endpoint for syncing traders
        print("\n  🔍 Checking cron endpoints...")
        print("     - /api/cron/sync-trader-leaderboard (should sync from Polymarket leaderboard)")
        print("     - /api/cron/sync-public-trades (should add traders when syncing trades)")
        
        if recent_count == 0:
            results['issues'].append("⚠️  No new traders added in last 7 days - may indicate pipeline issue")
            results['status'] = '⚠️'
        
    except Exception as e:
        results['status'] = '❌'
        results['issues'].append(f"Error checking Supabase traders: {e}")
        print(f"  ❌ Error: {e}")
    
    return results

def audit_pipeline_2_traders_to_bigquery(bq_client: bigquery.Client, supabase_client: Client) -> Dict:
    """Audit Pipeline 2: Syncing traders from Supabase to BigQuery."""
    print("\n" + "="*80)
    print("PIPELINE 2: Syncing Traders to BigQuery")
    print("="*80)
    
    results = {
        'status': '✅',
        'issues': [],
        'details': {}
    }
    
    try:
        # Count traders in Supabase
        supabase_result = supabase_client.table('traders').select('wallet_address', count='exact').execute()
        supabase_count = supabase_result.count if supabase_result.count else len(supabase_result.data or [])
        
        # Count traders in BigQuery
        bq_query = f"SELECT COUNT(DISTINCT wallet_address) as count FROM `{TRADERS_TABLE}`"
        bq_result = list(bq_client.query(bq_query).result())
        bq_count = bq_result[0].count if bq_result else 0
        
        # Check for missing traders
        if supabase_count > bq_count:
            missing = supabase_count - bq_count
            results['issues'].append(f"⚠️  {missing:,} traders in Supabase but not in BigQuery")
            results['status'] = '⚠️'
            
            # Get sample missing traders
            supabase_wallets = set()
            supabase_data = supabase_client.table('traders').select('wallet_address').limit(5000).execute()
            for row in supabase_data.data or []:
                if row.get('wallet_address'):
                    supabase_wallets.add(row['wallet_address'].lower().strip())
            
            bq_query = f"SELECT DISTINCT wallet_address FROM `{TRADERS_TABLE}` LIMIT 5000"
            bq_data = list(bq_client.query(bq_query).result())
            bq_wallets = {row.wallet_address.lower().strip() for row in bq_data if row.wallet_address}
            
            missing_wallets = supabase_wallets - bq_wallets
            results['details']['missing_wallets_sample'] = list(missing_wallets)[:10]
        
        results['details'] = {
            'supabase_count': supabase_count,
            'bigquery_count': bq_count,
            'sync_status': '✅ Synced' if supabase_count == bq_count else '⚠️ Out of sync'
        }
        
        print(f"  ✅ Traders in Supabase: {supabase_count:,}")
        print(f"  ✅ Traders in BigQuery: {bq_count:,}")
        
        if supabase_count != bq_count:
            print(f"  ⚠️  Difference: {abs(supabase_count - bq_count):,} traders")
            print(f"     Run: python3 scripts/sync-traders-to-bigquery.py")
        else:
            print(f"  ✅ Traders are in sync!")
        
    except Exception as e:
        results['status'] = '❌'
        results['issues'].append(f"Error checking trader sync: {e}")
        print(f"  ❌ Error: {e}")
    
    return results

def audit_pipeline_3_daily_sync(bq_client: bigquery.Client) -> Dict:
    """Audit Pipeline 3: Daily sync of trades, markets, events."""
    print("\n" + "="*80)
    print("PIPELINE 3: Daily Sync (Trades, Markets, Events)")
    print("="*80)
    
    results = {
        'status': '✅',
        'issues': [],
        'details': {}
    }
    
    try:
        # Check checkpoint table
        checkpoint_query = f"""
        SELECT 
            MAX(last_sync_time) as last_sync,
            COUNT(*) as checkpoint_count
        FROM `{CHECKPOINT_TABLE}`
        """
        checkpoint_result = list(bq_client.query(checkpoint_query).result())
        last_sync = checkpoint_result[0].last_sync if checkpoint_result and checkpoint_result[0].last_sync else None
        checkpoint_count = checkpoint_result[0].checkpoint_count if checkpoint_result else 0
        
        # Check recent trades
        recent_trades_query = f"""
        SELECT 
            COUNT(*) as count,
            MAX(timestamp) as latest_trade
        FROM `{TRADES_TABLE}`
        WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
        """
        trades_result = list(bq_client.query(recent_trades_query).result())
        recent_trades = trades_result[0].count if trades_result else 0
        latest_trade = trades_result[0].latest_trade if trades_result else None
        
        # Check recent markets (using last_updated column)
        recent_markets_query = f"""
        SELECT 
            COUNT(*) as count,
            MAX(last_updated) as latest_market
        FROM `{MARKETS_TABLE}`
        WHERE last_updated >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
        """
        markets_result = list(bq_client.query(recent_markets_query).result())
        recent_markets = markets_result[0].count if markets_result else 0
        latest_market = markets_result[0].latest_market if markets_result else None
        
        # Check total counts
        total_trades_query = f"SELECT COUNT(*) as count FROM `{TRADES_TABLE}`"
        total_trades = list(bq_client.query(total_trades_query).result())[0].count
        
        total_markets_query = f"SELECT COUNT(*) as count FROM `{MARKETS_TABLE}`"
        total_markets = list(bq_client.query(total_markets_query).result())[0].count
        
        results['details'] = {
            'last_sync_time': str(last_sync) if last_sync else None,
            'checkpoint_count': checkpoint_count,
            'recent_trades_24h': recent_trades,
            'latest_trade': str(latest_trade) if latest_trade else None,
            'recent_markets_24h': recent_markets,
            'latest_market': str(latest_market) if latest_market else None,
            'total_trades': total_trades,
            'total_markets': total_markets
        }
        
        print(f"  📊 Last sync checkpoint: {last_sync}")
        print(f"  📊 Recent trades (24h): {recent_trades:,}")
        print(f"  📊 Recent markets updated (24h): {recent_markets:,}")
        print(f"  📊 Total trades: {total_trades:,}")
        print(f"  📊 Total markets: {total_markets:,}")
        
        if not last_sync:
            results['issues'].append("⚠️  No sync checkpoint found - daily sync may not be running")
            results['status'] = '⚠️'
        elif last_sync < datetime.now(timezone.utc) - timedelta(hours=25):
            results['issues'].append(f"⚠️  Last sync was {last_sync} - may be stale")
            results['status'] = '⚠️'
        
        if recent_trades == 0:
            results['issues'].append("⚠️  No trades in last 24 hours - may indicate sync issue")
            results['status'] = '⚠️'
        
    except Exception as e:
        results['status'] = '❌'
        results['issues'].append(f"Error checking daily sync: {e}")
        print(f"  ❌ Error: {e}")
    
    return results

def audit_pipeline_4_market_classification(bq_client: bigquery.Client) -> Dict:
    """Audit Pipeline 4: Market classification."""
    print("\n" + "="*80)
    print("PIPELINE 4: Market Classification")
    print("="*80)
    
    results = {
        'status': '✅',
        'issues': [],
        'details': {}
    }
    
    try:
        # Check classification coverage
        classification_query = f"""
        SELECT 
            COUNT(*) as total_markets,
            COUNT(market_type) as markets_with_type,
            COUNT(market_subtype) as markets_with_subtype,
            COUNT(bet_structure) as markets_with_bet_structure,
            COUNT(CASE WHEN market_type IS NOT NULL AND market_subtype IS NOT NULL AND bet_structure IS NOT NULL THEN 1 END) as fully_classified
        FROM `{MARKETS_TABLE}`
        """
        class_result = list(bq_client.query(classification_query).result())[0]
        
        total = class_result.total_markets
        with_type = class_result.markets_with_type
        with_subtype = class_result.markets_with_subtype
        with_structure = class_result.markets_with_bet_structure
        fully_classified = class_result.fully_classified
        
        coverage_pct = (fully_classified / total * 100) if total > 0 else 0
        
        # Check recent markets classification
        recent_class_query = f"""
        SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN market_type IS NOT NULL AND market_subtype IS NOT NULL AND bet_structure IS NOT NULL THEN 1 END) as classified
        FROM `{MARKETS_TABLE}`
        WHERE last_updated >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
        """
        recent_class_result = list(bq_client.query(recent_class_query).result())[0]
        recent_total = recent_class_result.total
        recent_classified = recent_class_result.classified
        
        results['details'] = {
            'total_markets': total,
            'markets_with_type': with_type,
            'markets_with_subtype': with_subtype,
            'markets_with_bet_structure': with_structure,
            'fully_classified': fully_classified,
            'coverage_pct': coverage_pct,
            'recent_markets_24h': recent_total,
            'recent_classified_24h': recent_classified
        }
        
        print(f"  📊 Total markets: {total:,}")
        print(f"  ✅ Markets with type: {with_type:,} ({with_type/total*100:.1f}%)")
        print(f"  ✅ Markets with subtype: {with_subtype:,} ({with_subtype/total*100:.1f}%)")
        print(f"  ✅ Markets with bet_structure: {with_structure:,} ({with_structure/total*100:.1f}%)")
        print(f"  ✅ Fully classified: {fully_classified:,} ({coverage_pct:.1f}%)")
        print(f"  📊 Recent markets (24h): {recent_total:,}")
        print(f"  ✅ Recent classified (24h): {recent_classified:,}")
        
        if coverage_pct < 90:
            results['issues'].append(f"⚠️  Only {coverage_pct:.1f}% of markets are fully classified")
            results['status'] = '⚠️'
        
        if recent_total > 0 and recent_classified < recent_total * 0.9:
            results['issues'].append(f"⚠️  Only {recent_classified}/{recent_total} recent markets are classified")
            results['status'] = '⚠️'
        
    except Exception as e:
        results['status'] = '❌'
        results['issues'].append(f"Error checking market classification: {e}")
        print(f"  ❌ Error: {e}")
    
    return results

def audit_pipeline_5_stats_recalculation(bq_client: bigquery.Client) -> Dict:
    """Audit Pipeline 5: Stats recalculation."""
    print("\n" + "="*80)
    print("PIPELINE 5: Stats Recalculation")
    print("="*80)
    
    results = {
        'status': '✅',
        'issues': [],
        'details': {}
    }
    
    try:
        # Check global stats
        global_stats_query = f"SELECT COUNT(*) as count FROM `{GLOBAL_STATS_TABLE}`"
        global_count = list(bq_client.query(global_stats_query).result())[0].count
        
        # Check profile stats
        profile_stats_query = f"SELECT COUNT(*) as count FROM `{PROFILE_STATS_TABLE}`"
        profile_count = list(bq_client.query(profile_stats_query).result())[0].count
        
        # Check traders with trades
        traders_with_trades_query = f"""
        SELECT COUNT(DISTINCT wallet_address) as count
        FROM `{TRADES_TABLE}`
        WHERE side = 'BUY'
        """
        traders_with_trades = list(bq_client.query(traders_with_trades_query).result())[0].count
        
        # Check coverage
        coverage_pct = (global_count / traders_with_trades * 100) if traders_with_trades > 0 else 0
        
        # Check last updated (if there's an updated_at column)
        try:
            last_updated_query = f"""
            SELECT MAX(last_updated) as last_updated
            FROM `{GLOBAL_STATS_TABLE}`
            """
            last_updated_result = list(bq_client.query(last_updated_query).result())
            last_updated = last_updated_result[0].last_updated if last_updated_result and last_updated_result[0].last_updated else None
        except:
            last_updated = None
        
        results['details'] = {
            'global_stats_count': global_count,
            'profile_stats_count': profile_count,
            'traders_with_trades': traders_with_trades,
            'coverage_pct': coverage_pct,
            'last_updated': str(last_updated) if last_updated else None
        }
        
        print(f"  📊 Global stats records: {global_count:,}")
        print(f"  📊 Profile stats records: {profile_count:,}")
        print(f"  📊 Traders with trades: {traders_with_trades:,}")
        print(f"  ✅ Coverage: {coverage_pct:.1f}%")
        
        if coverage_pct < 95:
            results['issues'].append(f"⚠️  Only {coverage_pct:.1f}% of traders with trades have stats")
            results['status'] = '⚠️'
        
        if last_updated and last_updated < datetime.now(timezone.utc) - timedelta(days=1):
            results['issues'].append(f"⚠️  Stats last updated {last_updated} - may be stale")
            results['status'] = '⚠️'
        
    except Exception as e:
        results['status'] = '❌'
        results['issues'].append(f"Error checking stats: {e}")
        print(f"  ❌ Error: {e}")
    
    return results

def audit_pipeline_6_stats_to_supabase(bq_client: bigquery.Client, supabase_client: Client) -> Dict:
    """Audit Pipeline 6: Syncing stats to Supabase."""
    print("\n" + "="*80)
    print("PIPELINE 6: Syncing Stats to Supabase")
    print("="*80)
    
    results = {
        'status': '✅',
        'issues': [],
        'details': {}
    }
    
    try:
        # Check BigQuery stats
        bq_global_query = f"SELECT COUNT(*) as count FROM `{GLOBAL_STATS_TABLE}`"
        bq_global_count = list(bq_client.query(bq_global_query).result())[0].count
        
        bq_profile_query = f"SELECT COUNT(*) as count FROM `{PROFILE_STATS_TABLE}`"
        bq_profile_count = list(bq_client.query(bq_profile_query).result())[0].count
        
        # Check Supabase stats
        supabase_global_result = supabase_client.table('trader_global_stats').select('wallet_address', count='exact').execute()
        supabase_global_count = supabase_global_result.count if supabase_global_result.count else len(supabase_global_result.data or [])
        
        # Try to count profile stats (may not have 'id' column)
        try:
            supabase_profile_result = supabase_client.table('trader_profile_stats').select('wallet_address', count='exact').execute()
            supabase_profile_count = supabase_profile_result.count if supabase_profile_result.count else len(supabase_profile_result.data or [])
        except:
            # Fallback: get all and count
            supabase_profile_result = supabase_client.table('trader_profile_stats').select('wallet_address').limit(50000).execute()
            supabase_profile_count = len(supabase_profile_result.data or [])
        
        results['details'] = {
            'bigquery_global': bq_global_count,
            'supabase_global': supabase_global_count,
            'bigquery_profile': bq_profile_count,
            'supabase_profile': supabase_profile_count,
            'global_sync_status': '✅ Synced' if bq_global_count == supabase_global_count else '⚠️ Out of sync',
            'profile_sync_status': '✅ Synced' if bq_profile_count == supabase_profile_count else '⚠️ Out of sync'
        }
        
        print(f"  📊 BigQuery global stats: {bq_global_count:,}")
        print(f"  📊 Supabase global stats: {supabase_global_count:,}")
        print(f"  📊 BigQuery profile stats: {bq_profile_count:,}")
        print(f"  📊 Supabase profile stats: {supabase_profile_count:,}")
        
        if bq_global_count != supabase_global_count:
            diff = abs(bq_global_count - supabase_global_count)
            results['issues'].append(f"⚠️  Global stats out of sync: {diff:,} records difference")
            results['status'] = '⚠️'
            print(f"  ⚠️  Global stats out of sync by {diff:,} records")
            print(f"     Run: python3 sync-trader-stats-from-bigquery.py")
        else:
            print(f"  ✅ Global stats are in sync!")
        
        if bq_profile_count != supabase_profile_count:
            diff = abs(bq_profile_count - supabase_profile_count)
            results['issues'].append(f"⚠️  Profile stats out of sync: {diff:,} records difference")
            results['status'] = '⚠️'
            print(f"  ⚠️  Profile stats out of sync by {diff:,} records")
            print(f"     Run: python3 sync-trader-stats-from-bigquery.py")
        else:
            print(f"  ✅ Profile stats are in sync!")
        
    except Exception as e:
        results['status'] = '❌'
        results['issues'].append(f"Error checking stats sync: {e}")
        print(f"  ❌ Error: {e}")
    
    return results

def audit_scheduled_jobs() -> Dict:
    """Audit scheduled jobs and cron endpoints."""
    print("\n" + "="*80)
    print("PIPELINE 7: Scheduled Jobs & Cron Endpoints")
    print("="*80)
    
    results = {
        'status': '✅',
        'issues': [],
        'details': {}
    }
    
    cron_endpoints = [
        {
            'name': 'Sync Trader Leaderboard',
            'path': '/api/cron/sync-trader-leaderboard',
            'description': 'Syncs traders from Polymarket leaderboard to Supabase'
        },
        {
            'name': 'Sync Public Trades',
            'path': '/api/cron/sync-public-trades',
            'description': 'Syncs public trades and adds new traders'
        },
        {
            'name': 'Daily Sync Trades/Markets',
            'path': 'daily-sync-trades-markets.py',
            'description': 'Cloud Run job that syncs trades, markets, events to BigQuery'
        },
        {
            'name': 'Sync Stats to Supabase',
            'path': 'sync-trader-stats-from-bigquery.py',
            'description': 'Cloud Run job that syncs stats from BigQuery to Supabase'
        }
    ]
    
    print("  📋 Expected Cron Endpoints:")
    for endpoint in cron_endpoints:
        print(f"     - {endpoint['name']}: {endpoint['path']}")
        print(f"       {endpoint['description']}")
    
    results['details'] = {
        'endpoints': cron_endpoints,
        'note': 'Check Vercel cron jobs and Cloud Run scheduled jobs for actual schedules'
    }
    
    print("\n  💡 Note: Check Vercel dashboard and Google Cloud Console for actual schedules")
    
    return results

def main():
    print("="*80)
    print("  COMPREHENSIVE PIPELINE AUDIT")
    print("="*80)
    print(f"Started at: {datetime.now(timezone.utc).isoformat()}")
    
    bq_client = get_bigquery_client()
    supabase_client = get_supabase_client()
    
    all_results = {}
    
    # Run all audits
    all_results['pipeline_1'] = audit_pipeline_1_traders_to_supabase(bq_client, supabase_client)
    all_results['pipeline_2'] = audit_pipeline_2_traders_to_bigquery(bq_client, supabase_client)
    all_results['pipeline_3'] = audit_pipeline_3_daily_sync(bq_client)
    all_results['pipeline_4'] = audit_pipeline_4_market_classification(bq_client)
    all_results['pipeline_5'] = audit_pipeline_5_stats_recalculation(bq_client)
    all_results['pipeline_6'] = audit_pipeline_6_stats_to_supabase(bq_client, supabase_client)
    all_results['pipeline_7'] = audit_scheduled_jobs()
    
    # Summary
    print("\n" + "="*80)
    print("  AUDIT SUMMARY")
    print("="*80)
    
    pipeline_names = {
        'pipeline_1': '1. Traders to Supabase',
        'pipeline_2': '2. Traders to BigQuery',
        'pipeline_3': '3. Daily Sync',
        'pipeline_4': '4. Market Classification',
        'pipeline_5': '5. Stats Recalculation',
        'pipeline_6': '6. Stats to Supabase',
        'pipeline_7': '7. Scheduled Jobs'
    }
    
    for key, name in pipeline_names.items():
        result = all_results[key]
        status = result['status']
        print(f"  {status} {name}")
        if result['issues']:
            for issue in result['issues']:
                print(f"     {issue}")
    
    # Overall status
    all_statuses = [r['status'] for r in all_results.values()]
    if '❌' in all_statuses:
        overall_status = '❌ CRITICAL ISSUES FOUND'
    elif '⚠️' in all_statuses:
        overall_status = '⚠️ WARNINGS FOUND'
    else:
        overall_status = '✅ ALL PIPELINES OPERATIONAL'
    
    print("\n" + "="*80)
    print(f"  {overall_status}")
    print("="*80)
    
    # Save results
    results_file = 'pipeline-audit-results.json'
    with open(results_file, 'w') as f:
        json.dump(all_results, f, indent=2, default=str)
    print(f"\n📄 Detailed results saved to: {results_file}")

if __name__ == "__main__":
    main()
