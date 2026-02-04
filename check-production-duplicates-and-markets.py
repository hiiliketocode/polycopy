#!/usr/bin/env python3
"""
Comprehensive check for:
1. Duplicates in production trades table
2. Markets table - condition_ids, duplicates, semantic categorization
3. Events table - condition_ids, duplicates
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

def main():
    client = bigquery.Client(project=PROJECT_ID)
    
    print_section("PRODUCTION TABLE DUPLICATES & MARKETS CHECK")
    print(f"Timestamp: {datetime.now().isoformat()}")
    
    # 1. Check for duplicates in trades table
    print_section("1. TRADES TABLE DUPLICATES CHECK")
    try:
        # Check duplicates on idempotency key
        dup_query = f"""
        SELECT 
          COUNT(*) as total_rows,
          COUNT(DISTINCT CONCAT(wallet_address, '|', tx_hash, '|', COALESCE(order_hash, ''))) as unique_keys,
          COUNT(*) - COUNT(DISTINCT CONCAT(wallet_address, '|', tx_hash, '|', COALESCE(order_hash, ''))) as duplicate_count
        FROM `{TRADES_TABLE}`
        """
        results = client.query(dup_query).result()
        row = next(results, None)
        
        if row:
            print(f"  Total rows: {row.total_rows:,}")
            print(f"  Unique keys: {row.unique_keys:,}")
            print(f"  Duplicate count: {row.duplicate_count:,}")
            
            if row.duplicate_count > 0:
                dup_pct = (row.duplicate_count / row.total_rows * 100) if row.total_rows > 0 else 0
                print(f"  ⚠️  WARNING: Found {row.duplicate_count:,} duplicates ({dup_pct:.2f}%)")
                
                # Show sample duplicates
                sample_query = f"""
                SELECT 
                  wallet_address,
                  tx_hash,
                  COALESCE(order_hash, '') as order_hash,
                  COUNT(*) as dup_count,
                  MIN(timestamp) as earliest,
                  MAX(timestamp) as latest
                FROM `{TRADES_TABLE}`
                GROUP BY wallet_address, tx_hash, order_hash
                HAVING COUNT(*) > 1
                ORDER BY dup_count DESC
                LIMIT 10
                """
                sample_results = client.query(sample_query).result()
                print(f"\n  Sample duplicates (top 10):")
                for dup in sample_results:
                    print(f"    - {dup.wallet_address[:10]}... | {dup.tx_hash[:16]}... | Count: {dup.dup_count}")
            else:
                print(f"  ✅ No duplicates found!")
    except Exception as e:
        print(f"  ❌ Error checking duplicates: {e}")
        import traceback
        traceback.print_exc()
    
    # 2. Check condition_ids in trades vs markets
    print_section("2. CONDITION_IDS: TRADES vs MARKETS")
    try:
        # Trades with condition_ids not in markets
        missing_markets_query = f"""
        SELECT 
          COUNT(DISTINCT t.condition_id) as missing_condition_ids,
          COUNT(*) as trades_with_missing_markets
        FROM `{TRADES_TABLE}` t
        LEFT JOIN `{MARKETS_TABLE}` m ON t.condition_id = m.condition_id
        WHERE t.condition_id IS NOT NULL
          AND m.condition_id IS NULL
        """
        results = client.query(missing_markets_query).result()
        row = next(results, None)
        
        if row:
            print(f"  Missing condition_ids: {row.missing_condition_ids:,}")
            print(f"  Trades with missing markets: {row.trades_with_missing_markets:,}")
            
            if row.missing_condition_ids > 0:
                print(f"  ⚠️  WARNING: {row.missing_condition_ids:,} condition_ids in trades don't have markets")
                
                # Show sample missing condition_ids
                sample_query = f"""
                SELECT DISTINCT t.condition_id, COUNT(*) as trade_count
                FROM `{TRADES_TABLE}` t
                LEFT JOIN `{MARKETS_TABLE}` m ON t.condition_id = m.condition_id
                WHERE t.condition_id IS NOT NULL
                  AND m.condition_id IS NULL
                GROUP BY t.condition_id
                ORDER BY trade_count DESC
                LIMIT 10
                """
                sample_results = client.query(sample_query).result()
                print(f"\n  Sample missing condition_ids (top 10):")
                for missing in sample_results:
                    print(f"    - {missing.condition_id}: {missing.trade_count} trades")
            else:
                print(f"  ✅ All condition_ids in trades have corresponding markets")
        
        # Total stats
        stats_query = f"""
        SELECT 
          COUNT(DISTINCT t.condition_id) as unique_condition_ids_in_trades,
          COUNT(DISTINCT m.condition_id) as unique_condition_ids_in_markets
        FROM `{TRADES_TABLE}` t
        CROSS JOIN (SELECT COUNT(DISTINCT condition_id) as unique_condition_ids_in_markets FROM `{MARKETS_TABLE}`) m
        WHERE t.condition_id IS NOT NULL
        """
        stats_results = client.query(stats_query).result()
        stats_row = next(stats_results, None)
        if stats_row:
            print(f"\n  Total unique condition_ids in trades: {stats_row.unique_condition_ids_in_trades:,}")
            print(f"  Total unique condition_ids in markets: {stats_row.unique_condition_ids_in_markets:,}")
    except Exception as e:
        print(f"  ❌ Error checking condition_ids: {e}")
        import traceback
        traceback.print_exc()
    
    # 3. Check for duplicates in markets table
    print_section("3. MARKETS TABLE DUPLICATES CHECK")
    try:
        dup_query = f"""
        SELECT 
          COUNT(*) as total_markets,
          COUNT(DISTINCT condition_id) as unique_condition_ids,
          COUNT(*) - COUNT(DISTINCT condition_id) as duplicate_count
        FROM `{MARKETS_TABLE}`
        WHERE condition_id IS NOT NULL
        """
        results = client.query(dup_query).result()
        row = next(results, None)
        
        if row:
            print(f"  Total markets: {row.total_markets:,}")
            print(f"  Unique condition_ids: {row.unique_condition_ids:,}")
            print(f"  Duplicate count: {row.duplicate_count:,}")
            
            if row.duplicate_count > 0:
                print(f"  ⚠️  WARNING: Found {row.duplicate_count:,} duplicate markets")
                
                # Show sample duplicates
                sample_query = f"""
                SELECT condition_id, COUNT(*) as dup_count
                FROM `{MARKETS_TABLE}`
                WHERE condition_id IS NOT NULL
                GROUP BY condition_id
                HAVING COUNT(*) > 1
                ORDER BY dup_count DESC
                LIMIT 10
                """
                sample_results = client.query(sample_query).result()
                print(f"\n  Sample duplicate condition_ids (top 10):")
                for dup in sample_results:
                    print(f"    - {dup.condition_id}: {dup.dup_count} entries")
            else:
                print(f"  ✅ No duplicates found!")
    except Exception as e:
        print(f"  ❌ Error checking market duplicates: {e}")
        import traceback
        traceback.print_exc()
    
    # 4. Check semantic categorization in markets
    print_section("4. MARKETS SEMANTIC CATEGORIZATION CHECK")
    try:
        # Check for classification columns
        schema_query = f"""
        SELECT column_name, data_type
        FROM `{PROJECT_ID}.{DATASET}.INFORMATION_SCHEMA.COLUMNS`
        WHERE table_name = 'markets'
          AND column_name IN ('market_type', 'market_subtype', 'bet_structure', 'classification', 'category', 'tags')
        ORDER BY column_name
        """
        schema_results = client.query(schema_query).result()
        classification_cols = list(schema_results)
        
        if classification_cols:
            print(f"  Found {len(classification_cols)} classification columns:")
            for col in classification_cols:
                print(f"    - {col.column_name}: {col.data_type}")
            
            # Check how many markets have classification data
            for col in classification_cols:
                col_name = col.column_name
                check_query = f"""
                SELECT 
                  COUNT(*) as total,
                  COUNT({col_name}) as has_value,
                  COUNT(*) - COUNT({col_name}) as missing_value
                FROM `{MARKETS_TABLE}`
                """
                check_results = client.query(check_query).result()
                check_row = next(check_results, None)
                if check_row:
                    pct = (check_row.has_value / check_row.total * 100) if check_row.total > 0 else 0
                    print(f"\n  {col_name}:")
                    print(f"    Total markets: {check_row.total:,}")
                    print(f"    With value: {check_row.has_value:,} ({pct:.1f}%)")
                    print(f"    Missing: {check_row.missing_value:,}")
                    
                    if check_row.missing_value > 0:
                        print(f"    ⚠️  {check_row.missing_value:,} markets missing {col_name}")
                    
                    # Show sample values
                    if check_row.has_value > 0:
                        sample_query = f"""
                        SELECT {col_name}, COUNT(*) as count
                        FROM `{MARKETS_TABLE}`
                        WHERE {col_name} IS NOT NULL
                        GROUP BY {col_name}
                        ORDER BY count DESC
                        LIMIT 5
                        """
                        sample_results = client.query(sample_query).result()
                        print(f"    Top values:")
                        for val in sample_results:
                            val_str = str(val[col_name])[:50] if val[col_name] else 'NULL'
                            print(f"      - {val_str}: {val.count:,}")
        else:
            print(f"  ⚠️  No classification columns found!")
            print(f"  Expected columns: market_type, market_subtype, bet_structure, classification, category, tags")
    except Exception as e:
        print(f"  ❌ Error checking semantic categorization: {e}")
        import traceback
        traceback.print_exc()
    
    # 5. Check events table
    print_section("5. EVENTS TABLE CHECK")
    try:
        # Check for duplicates
        dup_query = f"""
        SELECT 
          COUNT(*) as total_events,
          COUNT(DISTINCT event_slug) as unique_event_slugs,
          COUNT(*) - COUNT(DISTINCT event_slug) as duplicate_count
        FROM `{EVENTS_TABLE}`
        WHERE event_slug IS NOT NULL
        """
        results = client.query(dup_query).result()
        row = next(results, None)
        
        if row:
            print(f"  Total events: {row.total_events:,}")
            print(f"  Unique event_slugs: {row.unique_event_slugs:,}")
            print(f"  Duplicate count: {row.duplicate_count:,}")
            
            if row.duplicate_count > 0:
                print(f"  ⚠️  WARNING: Found {row.duplicate_count:,} duplicate events")
            else:
                print(f"  ✅ No duplicates found!")
        
        # Check events vs markets
        events_in_markets_query = f"""
        SELECT 
          COUNT(DISTINCT e.event_slug) as unique_events,
          COUNT(DISTINCT m.event_slug) as events_in_markets
        FROM `{EVENTS_TABLE}` e
        CROSS JOIN (SELECT COUNT(DISTINCT event_slug) as events_in_markets FROM `{MARKETS_TABLE}` WHERE event_slug IS NOT NULL) m
        WHERE e.event_slug IS NOT NULL
        """
        events_results = client.query(events_in_markets_query).result()
        events_row = next(events_results, None)
        if events_row:
            print(f"\n  Unique events in events table: {events_row.unique_events:,}")
            print(f"  Unique events in markets table: {events_row.events_in_markets:,}")
    except Exception as e:
        print(f"  ❌ Error checking events: {e}")
        import traceback
        traceback.print_exc()
    
    # 6. Check recent markets updates
    print_section("6. RECENT MARKETS UPDATES")
    try:
        # Check if markets table has last_updated or similar
        schema_query = f"""
        SELECT column_name
        FROM `{PROJECT_ID}.{DATASET}.INFORMATION_SCHEMA.COLUMNS`
        WHERE table_name = 'markets'
          AND column_name LIKE '%update%' OR column_name LIKE '%modified%' OR column_name LIKE '%created%'
        """
        schema_results = client.query(schema_query).result()
        update_cols = [row.column_name for row in schema_results]
        
        if update_cols:
            for col in update_cols[:1]:  # Check first update column found
                recent_query = f"""
                SELECT 
                  DATE({col}) as update_date,
                  COUNT(*) as markets_updated
                FROM `{MARKETS_TABLE}`
                WHERE {col} >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
                GROUP BY update_date
                ORDER BY update_date DESC
                LIMIT 7
                """
                recent_results = client.query(recent_query).result()
                rows = list(recent_results)
                
                if rows:
                    print(f"  Markets updated in last 7 days (by {col}):")
                    for r in rows:
                        print(f"    {r.update_date}: {r.markets_updated:,} markets")
                else:
                    print(f"  ⚠️  No markets updated in last 7 days")
        else:
            print(f"  ℹ️  No update timestamp column found in markets table")
    except Exception as e:
        print(f"  ⚠️  Error checking recent updates: {e}")
    
    print("\n" + "=" * 80)
    print("✅ Check complete!")
    print("=" * 80)

if __name__ == "__main__":
    main()
