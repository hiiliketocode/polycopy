#!/usr/bin/env python3
"""
Backfill all existing markets in BigQuery with new fields from Dome API.

This script:
1. Gets all condition_ids from BigQuery markets table
2. Fetches market details from Dome API
3. Updates BigQuery with all new fields (volume, risk, title, description, tags, etc.)
"""

import os
import json
import time
from typing import Dict, List
from datetime import datetime

from google.cloud import bigquery
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Configuration
PROJECT_ID = os.getenv('GOOGLE_CLOUD_PROJECT', 'gen-lang-client-0299056258')
DATASET = os.getenv('DATASET', 'polycopy_v1')
MARKETS_TABLE = f"{PROJECT_ID}.{DATASET}.markets"
DOME_API_KEY = os.getenv('DOME_API_KEY')
BATCH_SIZE = int(os.getenv('BATCH_SIZE', '100'))
API_RATE_LIMIT_DELAY = float(os.getenv('API_RATE_LIMIT_DELAY', '0.1'))

if not DOME_API_KEY:
    raise ValueError("DOME_API_KEY environment variable is required")

# Dome API configuration
DOME_API_BASE = "https://api.domeapi.io/v1"
DOME_HEADERS = {"Authorization": f"Bearer {DOME_API_KEY}"}

# Setup requests session with retry
session = requests.Session()
retry_strategy = Retry(
    total=3,
    backoff_factor=1,
    status_forcelist=[429, 500, 502, 503, 504],
)
adapter = HTTPAdapter(max_retries=retry_strategy)
session.mount("http://", adapter)
session.mount("https://", adapter)

# Initialize BigQuery client
bq_client = bigquery.Client(project=PROJECT_ID)


def fetch_markets_by_condition_ids(condition_ids: List[str]) -> List[Dict]:
    """Fetch markets from Dome API in batches"""
    all_markets = []
    
    for i in range(0, len(condition_ids), BATCH_SIZE):
        batch = condition_ids[i:i + BATCH_SIZE]
        
        from urllib.parse import urlencode
        url = f"{DOME_API_BASE}/polymarket/markets"
        params = [('limit', len(batch))]
        for cid in batch:
            params.append(('condition_id', cid))
        url = f"{url}?{urlencode(params)}"
        
        try:
            time.sleep(API_RATE_LIMIT_DELAY)
            response = session.get(url, headers=DOME_HEADERS, timeout=30)
            response.raise_for_status()
            data = response.json()
            markets = data.get('markets', []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
            all_markets.extend(markets)
            print(f"  Fetched batch {i // BATCH_SIZE + 1}: {len(markets)} markets", flush=True)
        except Exception as e:
            print(f"  ⚠️  Error fetching batch {i // BATCH_SIZE + 1}: {e}", flush=True)
            continue
    
    return all_markets


def map_market_to_bigquery(market: Dict) -> Dict:
    """Map Dome API market to BigQuery schema with all fields"""
    def to_timestamp(unix_seconds):
        if unix_seconds and isinstance(unix_seconds, (int, float)):
            dt = datetime.fromtimestamp(unix_seconds)
            return dt.strftime('%Y-%m-%d %H:%M:%S')
        return None
    
    def to_number(value):
        if value is None:
            return None
        try:
            return float(value) if isinstance(value, (int, float, str)) else None
        except:
            return None
    
    return {
        'condition_id': market.get('condition_id'),
        'event_slug': market.get('event_slug'),
        'market_slug': market.get('market_slug'),
        'bet_structure': market.get('bet_structure'),
        'market_subtype': market.get('market_subtype'),
        'market_type': market.get('market_type'),
        'liquidity': to_number(market.get('liquidity')),
        'status': market.get('status'),
        'winning_label': market.get('winning_side', {}).get('label') if isinstance(market.get('winning_side'), dict) else market.get('winning_side'),
        'winning_id': market.get('winning_side', {}).get('id') if isinstance(market.get('winning_side'), dict) else None,
        # Text fields
        'title': market.get('title'),
        'description': market.get('description'),
        'resolution_source': market.get('resolution_source'),
        'image': market.get('image'),
        'negative_risk_id': market.get('negative_risk_id'),
        'game_start_time_raw': market.get('game_start_time'),
        # Volume fields
        'volume_1_week': to_number(market.get('volume_1_week')),
        'volume_1_month': to_number(market.get('volume_1_month')),
        'volume_1_year': to_number(market.get('volume_1_year')),
        'volume_total': to_number(market.get('volume_total')),
        # Timestamp fields
        'start_time': to_timestamp(market.get('start_time')),
        'end_time': to_timestamp(market.get('end_time')),
        'completed_time': to_timestamp(market.get('completed_time')),
        'close_time': to_timestamp(market.get('close_time')),
        'game_start_time': to_timestamp(market.get('game_start_time')),
        # Unix timestamp fields
        'start_time_unix': int(market.get('start_time')) if market.get('start_time') else None,
        'end_time_unix': int(market.get('end_time')) if market.get('end_time') else None,
        'completed_time_unix': int(market.get('completed_time')) if market.get('completed_time') else None,
        'close_time_unix': int(market.get('close_time')) if market.get('close_time') else None,
        # JSON fields
        'side_a': json.dumps(market.get('side_a')) if market.get('side_a') else None,
        'side_b': json.dumps(market.get('side_b')) if market.get('side_b') else None,
        'tags': json.dumps(market.get('tags')) if market.get('tags') else None,
    }


def update_markets_in_bigquery(markets: List[Dict]):
    """Update markets in BigQuery with all fields"""
    if not markets:
        return
    
    print(f"\n📝 Updating {len(markets)} markets in BigQuery...", flush=True)
    
    # Create temp table
    temp_table_id = f"{MARKETS_TABLE}_temp_{int(time.time() * 1000000)}"
    dest_table = bq_client.get_table(MARKETS_TABLE)
    temp_table = bigquery.Table(temp_table_id, schema=dest_table.schema)
    bq_client.create_table(temp_table)
    
    try:
        # Load to temp table
        job_config = bigquery.LoadJobConfig(
            write_disposition="WRITE_TRUNCATE",
            source_format="NEWLINE_DELIMITED_JSON",
            autodetect=False
        )
        
        load_job = bq_client.load_table_from_json(markets, temp_table_id, job_config=job_config)
        load_job.result()
        
        # MERGE to destination
        merge_query = f"""
        MERGE `{MARKETS_TABLE}` AS target
        USING (
            SELECT *
            FROM `{temp_table_id}`
            QUALIFY ROW_NUMBER() OVER (PARTITION BY condition_id ORDER BY last_updated DESC) = 1
        ) AS source
        ON target.condition_id = source.condition_id
        WHEN MATCHED THEN UPDATE SET
            event_slug = source.event_slug,
            market_slug = source.market_slug,
            bet_structure = source.bet_structure,
            market_subtype = source.market_subtype,
            market_type = source.market_type,
            liquidity = source.liquidity,
            status = source.status,
            winning_label = source.winning_label,
            winning_id = source.winning_id,
            title = source.title,
            description = source.description,
            resolution_source = source.resolution_source,
            image = source.image,
            negative_risk_id = source.negative_risk_id,
            game_start_time_raw = source.game_start_time_raw,
            volume_1_week = source.volume_1_week,
            volume_1_month = source.volume_1_month,
            volume_1_year = source.volume_1_year,
            volume_total = source.volume_total,
            start_time = source.start_time,
            end_time = source.end_time,
            completed_time = source.completed_time,
            close_time = source.close_time,
            game_start_time = source.game_start_time,
            start_time_unix = source.start_time_unix,
            end_time_unix = source.end_time_unix,
            completed_time_unix = source.completed_time_unix,
            close_time_unix = source.close_time_unix,
            side_a = source.side_a,
            side_b = source.side_b,
            tags = source.tags,
            last_updated = CURRENT_TIMESTAMP()
        """.strip()
        
        merge_job = bq_client.query(merge_query)
        merge_job.result()
        print(f"  ✅ Successfully updated {len(markets)} markets", flush=True)
    except Exception as e:
        print(f"  ❌ Error updating markets: {e}", flush=True)
        import traceback
        traceback.print_exc()
        raise
    finally:
        # Clean up temp table
        try:
            bq_client.delete_table(temp_table_id)
        except:
            pass


def main():
    print("=" * 80)
    print("Backfilling Markets with New Fields from Dome API")
    print("=" * 80)
    print()
    
    # Get all condition_ids from markets table
    print("Step 1: Getting all condition_ids from markets table...")
    query = f"SELECT DISTINCT condition_id FROM `{MARKETS_TABLE}` WHERE condition_id IS NOT NULL"
    results = bq_client.query(query).result()
    condition_ids = [row['condition_id'] for row in results if row.get('condition_id')]
    
    print(f"  Found {len(condition_ids):,} condition_ids to update")
    print()
    
    if not condition_ids:
        print("✅ No markets to update!")
        return
    
    # Process in batches
    total_batches = (len(condition_ids) + BATCH_SIZE - 1) // BATCH_SIZE
    print(f"Step 2: Fetching markets from Dome API...")
    print(f"  Processing {len(condition_ids):,} condition_ids in {total_batches} batches")
    print(f"  Estimated time: ~{total_batches * API_RATE_LIMIT_DELAY / 60:.1f} minutes")
    print()
    
    processed = 0
    for i in range(0, len(condition_ids), BATCH_SIZE * 10):  # Process 10 batches at a time
        batch_ids = condition_ids[i:i + BATCH_SIZE * 10]
        
        print(f"\n📦 Processing batch {i // (BATCH_SIZE * 10) + 1} ({len(batch_ids)} condition_ids)...")
        
        # Fetch markets
        markets_raw = fetch_markets_by_condition_ids(batch_ids)
        
        if not markets_raw:
            print(f"  ⚠️  No markets fetched for this batch")
            continue
        
        # Map to BigQuery schema
        markets_mapped = [map_market_to_bigquery(m) for m in markets_raw if m.get('condition_id')]
        
        # Update BigQuery
        if markets_mapped:
            update_markets_in_bigquery(markets_mapped)
            processed += len(markets_mapped)
        
        print(f"  ✅ Processed {processed:,} markets so far")
    
    print("\n" + "=" * 80)
    print(f"✨ Backfill Complete!")
    print(f"  Total markets updated: {processed:,}")
    print("=" * 80)


if __name__ == '__main__':
    main()
