#!/usr/bin/env python3
"""
Fetch missing markets and events from Dome API for all condition_ids in trades
"""

import os
import time
import requests
from typing import List, Dict, Set, Tuple
from google.cloud import bigquery
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

PROJECT_ID = "gen-lang-client-0299056258"
DOME_API_KEY = os.getenv("DOME_API_KEY")
DATASET = "polycopy_v1"

TRADES_TABLE = f"{PROJECT_ID}.{DATASET}.trades"
MARKETS_TABLE = f"{PROJECT_ID}.{DATASET}.markets"
EVENTS_TABLE = f"{PROJECT_ID}.{DATASET}.events"

API_RATE_LIMIT_DELAY = 0.05  # 20 RPS
BATCH_SIZE = 100  # Dome API limit

def get_bigquery_client():
    return bigquery.Client(project=PROJECT_ID)

def get_http_session():
    """HTTP session with retry logic"""
    session = requests.Session()
    retry_strategy = Retry(
        total=5,
        backoff_factor=2,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"]
    )
    adapter = HTTPAdapter(max_retries=retry_strategy, pool_connections=10, pool_maxsize=20)
    session.mount("https://", adapter)
    return session

def fetch_markets_by_condition_ids(
    session: requests.Session, 
    condition_ids: List[str]
) -> Tuple[List[Dict], List[Dict]]:
    """Fetches markets from Dome API /polymarket/markets endpoint"""
    if not condition_ids:
        return [], []
    
    all_markets_mapped = []
    all_markets_raw = []
    base_url = "https://api.domeapi.io/v1"
    
    # Batch in chunks of 100
    for i in range(0, len(condition_ids), BATCH_SIZE):
        batch = condition_ids[i:i + BATCH_SIZE]
        
        from urllib.parse import urlencode
        url = f"{base_url}/polymarket/markets"
        params = [('limit', len(batch))]
        for cid in batch:
            params.append(('condition_id', cid))
        url = f"{url}?{urlencode(params)}"
        
        headers = {"Authorization": f"Bearer {DOME_API_KEY}", "Accept": "application/json"}
        
        try:
            time.sleep(API_RATE_LIMIT_DELAY)
            response = session.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            if isinstance(data, list):
                for market in data:
                    all_markets_raw.append(market)
                    # Map to our schema
                    mapped = {
                        'condition_id': market.get('condition_id'),
                        'event_slug': market.get('event_slug'),
                        'market_slug': market.get('market_slug'),
                        'bet_structure': market.get('bet_structure'),
                        'market_subtype': market.get('market_subtype'),
                        'liquidity': market.get('liquidity'),
                        'status': market.get('status'),
                        'winning_label': market.get('winning_label'),
                        'winning_id': market.get('winning_id'),
                        'last_updated': market.get('last_updated'),
                    }
                    all_markets_mapped.append(mapped)
            
            print(f"  Fetched batch {i // BATCH_SIZE + 1}: {len(data)} markets", flush=True)
            
        except Exception as e:
            print(f"  ⚠️  Error fetching batch: {e}", flush=True)
            continue
    
    return all_markets_mapped, all_markets_raw

def extract_events_from_markets(markets_raw: List[Dict], already_fetched: Set[str] = None) -> Tuple[List[Dict], Set[str]]:
    """Extracts events from markets"""
    if already_fetched is None:
        already_fetched = set()
    
    events = []
    seen_slugs = set()
    newly_fetched = set()
    
    for market in markets_raw:
        event_slug = market.get('event_slug')
        if not event_slug or event_slug in seen_slugs or event_slug in already_fetched:
            continue
        
        seen_slugs.add(event_slug)
        newly_fetched.add(event_slug)
        tags = market.get('tags', [])
        category = tags[0] if isinstance(tags, list) and len(tags) > 0 else None
        
        def to_timestamp(unix_seconds):
            if unix_seconds and isinstance(unix_seconds, (int, float)):
                from datetime import datetime
                return datetime.fromtimestamp(unix_seconds).strftime('%Y-%m-%d %H:%M:%S')
            return None
        
        event = {
            'event_slug': event_slug,
            'title': market.get('title'),
            'category': category,
            'tags': str(tags) if tags else None,
            'start_time': to_timestamp(market.get('start_time')),
            'end_time': to_timestamp(market.get('end_time')),
        }
        events.append(event)
    
    return events, newly_fetched

def load_markets_to_bigquery(client: bigquery.Client, markets: List[Dict]) -> bool:
    """Loads markets using MERGE"""
    if not markets:
        return True
    
    try:
        temp_table_id = f"{MARKETS_TABLE}_temp_{int(time.time() * 1000000)}"
        dest_table = client.get_table(MARKETS_TABLE)
        temp_table = bigquery.Table(temp_table_id, schema=dest_table.schema)
        client.create_table(temp_table)
        
        job_config = bigquery.LoadJobConfig(
            write_disposition="WRITE_TRUNCATE",
            source_format="NEWLINE_DELIMITED_JSON",
            autodetect=False
        )
        load_job = client.load_table_from_json(markets, temp_table_id, job_config=job_config)
        load_job.result()
        
        merge_query = f"""
        MERGE `{MARKETS_TABLE}` AS target
        USING (
            SELECT *
            FROM `{temp_table_id}`
            QUALIFY ROW_NUMBER() OVER (PARTITION BY condition_id ORDER BY last_updated DESC) = 1
        ) AS source
        ON target.condition_id = source.condition_id
        WHEN NOT MATCHED THEN INSERT ROW
        WHEN MATCHED THEN UPDATE SET
            event_slug = source.event_slug,
            market_slug = source.market_slug,
            bet_structure = source.bet_structure,
            market_subtype = source.market_subtype,
            liquidity = source.liquidity,
            status = source.status,
            winning_label = source.winning_label,
            winning_id = source.winning_id,
            last_updated = CURRENT_TIMESTAMP()
        """
        
        merge_job = client.query(merge_query)
        merge_job.result()
        
        client.delete_table(temp_table_id)
        return True
    except Exception as e:
        print(f"  ❌ Markets load failed: {e}", flush=True)
        return False

def load_events_to_bigquery(client: bigquery.Client, events: List[Dict]) -> bool:
    """Loads events using MERGE"""
    if not events:
        return True
    
    try:
        temp_table_id = f"{EVENTS_TABLE}_temp_{int(time.time() * 1000000)}"
        dest_table = client.get_table(EVENTS_TABLE)
        temp_table = bigquery.Table(temp_table_id, schema=dest_table.schema)
        client.create_table(temp_table)
        
        job_config = bigquery.LoadJobConfig(
            write_disposition="WRITE_TRUNCATE",
            source_format="NEWLINE_DELIMITED_JSON",
            autodetect=False
        )
        load_job = client.load_table_from_json(events, temp_table_id, job_config=job_config)
        load_job.result()
        
        merge_query = f"""
        MERGE `{EVENTS_TABLE}` AS target
        USING (
            SELECT *
            FROM `{temp_table_id}`
            QUALIFY ROW_NUMBER() OVER (PARTITION BY event_slug ORDER BY created_at DESC) = 1
        ) AS source
        ON target.event_slug = source.event_slug
        WHEN NOT MATCHED THEN INSERT ROW
        WHEN MATCHED THEN UPDATE SET
            title = source.title,
            category = source.category,
            tags = source.tags,
            start_time = source.start_time,
            end_time = source.end_time
        """
        
        merge_job = client.query(merge_query)
        merge_job.result()
        
        client.delete_table(temp_table_id)
        return True
    except Exception as e:
        print(f"  ❌ Events load failed: {e}", flush=True)
        return False

def main():
    if not DOME_API_KEY:
        raise ValueError("DOME_API_KEY not set")
    
    print("=" * 80)
    print("Fetching Missing Markets and Events from Dome API")
    print("=" * 80)
    print()
    
    bq_client = get_bigquery_client()
    session = get_http_session()
    
    # Get all condition_ids from trades that don't have markets
    print("Step 1: Finding missing condition_ids...")
    missing_query = f"""
    SELECT DISTINCT t.condition_id
    FROM `{TRADES_TABLE}` t
    LEFT JOIN `{MARKETS_TABLE}` m ON t.condition_id = m.condition_id
    WHERE t.condition_id IS NOT NULL
      AND m.condition_id IS NULL
    """
    
    results = bq_client.query(missing_query).result()
    missing_condition_ids = [row['condition_id'] for row in results if row.get('condition_id')]
    
    print(f"  Found {len(missing_condition_ids)} condition_ids missing markets")
    print()
    
    if not missing_condition_ids:
        print("✅ All condition_ids already have markets!")
        return
    
    # Fetch markets
    print("Step 2: Fetching markets from Dome API...")
    print(f"  Fetching {len(missing_condition_ids)} condition_ids in batches of {BATCH_SIZE}...")
    markets_mapped, markets_raw = fetch_markets_by_condition_ids(session, missing_condition_ids)
    
    print(f"  Fetched {len(markets_mapped)} markets")
    print()
    
    # Extract events
    print("Step 3: Extracting events from markets...")
    events, _ = extract_events_from_markets(markets_raw)
    print(f"  Extracted {len(events)} events")
    print()
    
    # Load to BigQuery
    if markets_mapped:
        print("Step 4: Loading markets to BigQuery...")
        markets_success = load_markets_to_bigquery(bq_client, markets_mapped)
        if markets_success:
            print("  ✅ Markets loaded successfully")
        else:
            print("  ❌ Markets load failed")
        print()
    
    if events:
        print("Step 5: Loading events to BigQuery...")
        events_success = load_events_to_bigquery(bq_client, events)
        if events_success:
            print("  ✅ Events loaded successfully")
        else:
            print("  ❌ Events load failed")
        print()
    
    print("=" * 80)
    print("✅ Complete!")
    print("=" * 80)

if __name__ == "__main__":
    main()
