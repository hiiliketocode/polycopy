#!/usr/bin/env python3
"""
One-time catch-up script to backfill trades from Jan 29, 2026 to Feb 2, 2026.
This fills the gap between the last backfill and when the incremental sync started.
"""

import os
import sys
import json
import time
import requests
from datetime import datetime, timedelta
from typing import List, Dict, Set, Tuple, Optional
from google.cloud import bigquery
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Load environment variables from .env.local if it exists
try:
    from dotenv import load_dotenv
    load_dotenv('.env.local')
except ImportError:
    pass

# Force unbuffered output for Cloud Run logs
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# --- CONFIGURATION ---
PROJECT_ID = "gen-lang-client-0299056258"
DOME_API_KEY = os.getenv("DOME_API_KEY")
DATASET = "polycopy_v1"

# Table names
TRADERS_TABLE = f"{PROJECT_ID}.{DATASET}.traders"
TRADES_TABLE = f"{PROJECT_ID}.{DATASET}.trades"
MARKETS_TABLE = f"{PROJECT_ID}.{DATASET}.markets"
EVENTS_TABLE = f"{PROJECT_ID}.{DATASET}.events"

# API settings
API_RATE_LIMIT_DELAY = 0.05  # 20 RPS
BATCH_SIZE = 100
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 2

# Gap to fill: Jan 29, 2026 04:22:50 UTC (last trade before gap)
GAP_START = datetime(2026, 1, 29, 4, 22, 50)

def get_bigquery_client():
    """Initializes BigQuery client."""
    return bigquery.Client(project=PROJECT_ID)

def get_http_session():
    """Creates HTTP session with retry logic."""
    session = requests.Session()
    retry_strategy = Retry(
        total=MAX_RETRIES,
        backoff_factor=RETRY_BACKOFF_BASE,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"]
    )
    adapter = HTTPAdapter(max_retries=retry_strategy, pool_connections=10, pool_maxsize=20)
    session.mount("https://", adapter)
    return session

def get_all_wallets(bq_client: bigquery.Client) -> Set[str]:
    """Gets all wallet addresses from traders table."""
    wallets = set()
    print("📊 Fetching wallets from traders table...", flush=True)
    try:
        query = f"SELECT DISTINCT wallet_address FROM `{TRADERS_TABLE}` WHERE wallet_address IS NOT NULL"
        results = bq_client.query(query).result()
        trader_wallets = {row['wallet_address'].lower().strip() for row in results if row.get('wallet_address')}
        wallets.update(trader_wallets)
        print(f"  ✅ Found {len(trader_wallets)} wallets from traders table", flush=True)
    except Exception as e:
        print(f"  ⚠️  Error fetching traders: {e}", flush=True)
    
    print(f"✅ Total unique wallets: {len(wallets)}", flush=True)
    return wallets

def fetch_trades_for_wallet(session: requests.Session, wallet: str, since: datetime) -> List[Dict]:
    """Fetches trades for a wallet since the given timestamp."""
    all_trades = []
    base_url = "https://api.domeapi.io/v1"
    headers = {"Authorization": f"Bearer {DOME_API_KEY}", "Accept": "application/json"}
    
    params = {"user": wallet, "limit": 100, "start_time": int(since.timestamp())}
    offset = 0
    
    while True:
        params["offset"] = offset
        
        try:
            time.sleep(API_RATE_LIMIT_DELAY)
            response = session.get(f"{base_url}/polymarket/orders", headers=headers, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            orders = data.get('orders', [])
            if not orders:
                orders = data.get('results', [])
            
            if not orders:
                break
            
            all_trades.extend(orders)
            
            pagination = data.get('pagination', {})
            has_more = pagination.get('has_more', False)
            
            if not has_more:
                break
            
            offset += len(orders)
            
            if len(all_trades) % 1000 == 0:
                print(f"    Fetched {len(all_trades)} trades so far...", flush=True)
        
        except Exception as e:
            print(f"    ⚠️  Error fetching trades for {wallet[:10]}...: {e}", flush=True)
            break
    
    return all_trades

def map_trade_to_schema(trade: Dict, wallet: str) -> Dict:
    """Maps Dome API trade to BigQuery schema."""
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
    
    trade_id = trade.get('id') or trade.get('order_hash') or trade.get('tx_hash')
    if not trade_id:
        tx_hash = trade.get('tx_hash', '')
        timestamp = trade.get('timestamp') or trade.get('created_at', 0)
        trade_id = f"{wallet.lower().strip()}_{timestamp}_{tx_hash}"[:100]
    
    return {
        'id': trade_id,
        'condition_id': trade.get('condition_id'),
        'wallet_address': wallet.lower().strip(),
        'timestamp': to_timestamp(trade.get('timestamp') or trade.get('created_at')),
        'side': trade.get('side'),
        'price': to_number(trade.get('price')),
        'shares_normalized': to_number(trade.get('shares_normalized') or trade.get('shares')),
        'token_label': trade.get('token_label'),
        'token_id': trade.get('token_id'),
        'tx_hash': trade.get('tx_hash'),
        'order_hash': trade.get('order_hash'),
    }

def fetch_markets_by_condition_ids(session: requests.Session, condition_ids: List[str]) -> Tuple[List[Dict], List[Dict]]:
    """Fetches markets from Dome API."""
    if not condition_ids:
        return [], []
    
    all_markets_mapped = []
    all_markets_raw = []
    base_url = "https://api.domeapi.io/v1"
    
    total_batches = (len(condition_ids) + BATCH_SIZE - 1) // BATCH_SIZE
    
    for i in range(0, len(condition_ids), BATCH_SIZE):
        batch = condition_ids[i:i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        
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
            
            markets = []
            if isinstance(data, list):
                markets = data
            elif isinstance(data, dict):
                markets = data.get('markets', [])
                if not markets and 'results' in data:
                    markets = data.get('results', [])
            
            for market in markets:
                all_markets_raw.append(market)
                mapped = map_market_to_schema(market)
                if mapped['condition_id']:
                    all_markets_mapped.append(mapped)
            
            if batch_num % 50 == 0:
                print(f"  Batch {batch_num}/{total_batches}: Fetched {len(markets)} markets", flush=True)
        
        except Exception as e:
            print(f"  ⚠️  Error fetching batch {batch_num}: {e}", flush=True)
            continue
    
    return all_markets_mapped, all_markets_raw

def map_market_to_schema(market: Dict) -> Dict:
    """Maps Dome API market to BigQuery schema."""
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
        'title': market.get('title'),
        'description': market.get('description'),
        'resolution_source': market.get('resolution_source'),
        'image': market.get('image'),
        'negative_risk_id': market.get('negative_risk_id'),
        'game_start_time_raw': market.get('game_start_time'),
        'volume_1_week': to_number(market.get('volume_1_week')),
        'volume_1_month': to_number(market.get('volume_1_month')),
        'volume_1_year': to_number(market.get('volume_1_year')),
        'volume_total': to_number(market.get('volume_total')),
        'start_time': to_timestamp(market.get('start_time')),
        'end_time': to_timestamp(market.get('end_time')),
        'completed_time': to_timestamp(market.get('completed_time')),
        'close_time': to_timestamp(market.get('close_time')),
        'game_start_time': to_timestamp(market.get('game_start_time')),
        'start_time_unix': int(market.get('start_time')) if market.get('start_time') else None,
        'end_time_unix': int(market.get('end_time')) if market.get('end_time') else None,
        'completed_time_unix': int(market.get('completed_time')) if market.get('completed_time') else None,
        'close_time_unix': int(market.get('close_time')) if market.get('close_time') else None,
        'side_a': json.dumps(market.get('side_a')) if market.get('side_a') else None,
        'side_b': json.dumps(market.get('side_b')) if market.get('side_b') else None,
        'tags': json.dumps(market.get('tags')) if market.get('tags') else None,
    }

def extract_events_from_markets(markets_raw: List[Dict]) -> List[Dict]:
    """Extracts events from markets."""
    events = []
    seen_slugs = set()
    
    for market in markets_raw:
        event_slug = market.get('event_slug')
        if not event_slug or event_slug in seen_slugs:
            continue
        
        seen_slugs.add(event_slug)
        tags = market.get('tags', [])
        category = tags[0] if isinstance(tags, list) and len(tags) > 0 else None
        
        def to_timestamp(unix_seconds):
            if unix_seconds and isinstance(unix_seconds, (int, float)):
                return datetime.fromtimestamp(unix_seconds).strftime('%Y-%m-%d %H:%M:%S')
            return None
        
        event = {
            'event_slug': event_slug,
            'title': market.get('title'),
            'category': category,
            'tags': json.dumps(tags) if tags else None,
            'start_time': to_timestamp(market.get('start_time')),
            'end_time': to_timestamp(market.get('end_time')),
        }
        events.append(event)
    
    return events

def load_trades_to_bigquery(client: bigquery.Client, trades: List[Dict]) -> bool:
    """Loads trades using MERGE with deduplication."""
    if not trades:
        return True
    
    try:
        temp_table_id = f"{TRADES_TABLE}_temp_{int(time.time() * 1000000)}"
        dest_table = client.get_table(TRADES_TABLE)
        temp_table = bigquery.Table(temp_table_id, schema=dest_table.schema)
        client.create_table(temp_table)
        
        valid_trades = []
        for trade in trades:
            if not trade.get('id') or not trade.get('timestamp') or not trade.get('tx_hash'):
                continue
            valid_trades.append(trade)
        
        if not valid_trades:
            print(f"  ⚠️  No valid trades after filtering", flush=True)
            client.delete_table(temp_table_id)
            return False
        
        job_config = bigquery.LoadJobConfig(
            write_disposition="WRITE_TRUNCATE",
            source_format="NEWLINE_DELIMITED_JSON",
            autodetect=False
        )
        load_job = client.load_table_from_json(valid_trades, temp_table_id, job_config=job_config)
        load_job.result()
        
        merge_query = f"""
        MERGE `{TRADES_TABLE}` AS target
        USING (
            SELECT *
            FROM `{temp_table_id}`
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
        
        merge_job = client.query(merge_query)
        merge_job.result()
        
        client.delete_table(temp_table_id)
        return True
    except Exception as e:
        print(f"  ❌ Trades load failed: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return False

def load_markets_to_bigquery(client: bigquery.Client, markets: List[Dict]) -> bool:
    """Loads markets using MERGE."""
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
        """
        
        merge_job = client.query(merge_query)
        merge_job.result()
        
        client.delete_table(temp_table_id)
        return True
    except Exception as e:
        print(f"  ❌ Markets load failed: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return False

def load_events_to_bigquery(client: bigquery.Client, events: List[Dict]) -> bool:
    """Loads events using MERGE."""
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
        import traceback
        traceback.print_exc()
        return False

def main():
    if not DOME_API_KEY:
        raise ValueError("DOME_API_KEY not set")
    
    start_time = datetime.now(datetime.UTC) if hasattr(datetime, 'UTC') else datetime.utcnow()
    print("=" * 80, flush=True)
    print("Catch-Up Job: Backfilling Gap from Jan 29, 2026", flush=True)
    print("=" * 80, flush=True)
    print()
    print(f"📅 Fetching trades since: {GAP_START.isoformat()}", flush=True)
    print()
    
    bq_client = get_bigquery_client()
    session = get_http_session()
    
    # Get all wallets
    wallets = get_all_wallets(bq_client)
    print(f"📊 Processing {len(wallets)} wallets", flush=True)
    print()
    
    # Step 1: Fetch trades
    print("Step 1: Fetching trades from gap period...", flush=True)
    all_trades = []
    all_condition_ids = set()
    
    for i, wallet in enumerate(sorted(wallets), 1):
        if i % 50 == 0:
            print(f"  Processing wallet {i}/{len(wallets)}...", flush=True)
        
        trades = fetch_trades_for_wallet(session, wallet, GAP_START)
        for trade in trades:
            mapped = map_trade_to_schema(trade, wallet)
            if mapped.get('id') and mapped.get('timestamp') and mapped.get('tx_hash'):
                all_trades.append(mapped)
                if mapped.get('condition_id'):
                    all_condition_ids.add(mapped['condition_id'])
    
    print(f"  ✅ Fetched {len(all_trades)} trades", flush=True)
    print(f"  ✅ Found {len(all_condition_ids)} unique condition_ids", flush=True)
    print()
    
    # Step 2: Get condition_ids for markets
    print("Step 2: Identifying markets to fetch...", flush=True)
    
    existing_query = f"SELECT DISTINCT condition_id FROM `{MARKETS_TABLE}` WHERE condition_id IS NOT NULL"
    existing_results = bq_client.query(existing_query).result()
    existing_condition_ids = {row['condition_id'] for row in existing_results if row.get('condition_id')}
    
    new_condition_ids = all_condition_ids - existing_condition_ids
    print(f"  ✅ New condition_ids: {len(new_condition_ids)}", flush=True)
    
    markets_to_fetch = list(new_condition_ids)
    print(f"  ✅ Total markets to fetch: {len(markets_to_fetch)}", flush=True)
    print()
    
    # Step 3: Fetch markets
    markets_mapped = []
    markets_raw = []
    if markets_to_fetch:
        print("Step 3: Fetching markets from Dome API...", flush=True)
        markets_mapped, markets_raw = fetch_markets_by_condition_ids(session, markets_to_fetch)
        print(f"  ✅ Fetched {len(markets_mapped)} markets", flush=True)
        print()
    
    # Step 4: Extract events
    events = []
    if markets_raw:
        print("Step 4: Extracting events from markets...", flush=True)
        events = extract_events_from_markets(markets_raw)
        print(f"  ✅ Extracted {len(events)} events", flush=True)
        print()
    
    # Step 5: Load to BigQuery
    if all_trades:
        print("Step 5: Loading trades to BigQuery...", flush=True)
        trades_success = load_trades_to_bigquery(bq_client, all_trades)
        if trades_success:
            print(f"  ✅ Loaded {len(all_trades)} trades", flush=True)
        else:
            print("  ❌ Trades load failed", flush=True)
        print()
    
    if markets_mapped:
        print("Step 6: Loading markets to BigQuery...", flush=True)
        markets_success = load_markets_to_bigquery(bq_client, markets_mapped)
        if markets_success:
            print(f"  ✅ Loaded {len(markets_mapped)} markets", flush=True)
        else:
            print("  ❌ Markets load failed", flush=True)
        print()
    
    if events:
        print("Step 7: Loading events to BigQuery...", flush=True)
        events_success = load_events_to_bigquery(bq_client, events)
        if events_success:
            print(f"  ✅ Loaded {len(events)} events", flush=True)
        else:
            print("  ❌ Events load failed", flush=True)
        print()
    
    end_time = datetime.now(datetime.UTC) if hasattr(datetime, 'UTC') else datetime.utcnow()
    duration = (end_time - start_time).total_seconds()
    
    print("=" * 80, flush=True)
    print("✅ Catch-up complete!", flush=True)
    print(f"Duration: {duration:.1f} seconds", flush=True)
    print(f"Trades: {len(all_trades)}", flush=True)
    print(f"Markets: {len(markets_mapped)}", flush=True)
    print(f"Events: {len(events)}", flush=True)
    print("=" * 80, flush=True)

if __name__ == "__main__":
    main()
