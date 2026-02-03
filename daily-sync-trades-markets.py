#!/usr/bin/env python3
"""
Daily incremental sync job for trades, markets, and events.

This script:
1. Gets wallets from:
   - BigQuery traders table
   - Supabase user wallets (profiles, turnkey_wallets, clob_credentials, user_wallets)
2. Fetches new trades since last checkpoint
3. Fetches new markets and events for new condition_ids
4. Updates open (not resolved) markets to get latest data
5. Uses checkpointing to track last sync time
"""

import os
import sys
import json
import time
import requests
import importlib.util
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
    pass  # dotenv not required if env vars are set externally

# Supabase is optional - only needed if fetching user wallets
try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    Client = None
    create_client = None

# Force unbuffered output for Cloud Run logs
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# --- CONFIGURATION ---
PROJECT_ID = "gen-lang-client-0299056258"
DOME_API_KEY = os.getenv("DOME_API_KEY")
DATASET = "polycopy_v1"

# Supabase config (optional - only needed if fetching user wallets)
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Table names
TRADERS_TABLE = f"{PROJECT_ID}.{DATASET}.traders"
TRADES_TABLE = f"{PROJECT_ID}.{DATASET}.trades"
MARKETS_TABLE = f"{PROJECT_ID}.{DATASET}.markets"
EVENTS_TABLE = f"{PROJECT_ID}.{DATASET}.events"
CHECKPOINT_TABLE = f"{PROJECT_ID}.{DATASET}.daily_sync_checkpoint"

# API settings
API_RATE_LIMIT_DELAY = 0.05  # 20 RPS
BATCH_SIZE = 100  # Dome API limit for condition_ids
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 2

# Default lookback window (if no checkpoint exists)
DEFAULT_LOOKBACK_HOURS = 24

# Test mode: limit wallets processed (set via TEST_MODE_WALLET_LIMIT env var)
TEST_MODE_WALLET_LIMIT = int(os.getenv("TEST_MODE_WALLET_LIMIT", "0"))  # 0 = no limit

def get_bigquery_client():
    """Initializes BigQuery client."""
    return bigquery.Client(project=PROJECT_ID)

def get_supabase_client() -> Optional[Client]:
    """Initializes Supabase client."""
    if not SUPABASE_AVAILABLE:
        print("⚠️  Supabase library not available. Skipping user wallets.", flush=True)
        return None
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("⚠️  Supabase credentials not set. Skipping user wallets.", flush=True)
        return None
    try:
        return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    except Exception as e:
        print(f"⚠️  Error initializing Supabase client: {e}. Skipping user wallets.", flush=True)
        return None

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

def get_all_wallets(bq_client: bigquery.Client, supabase_client: Optional[Client]) -> Set[str]:
    """Gets all wallet addresses from traders table and user wallets."""
    wallets = set()
    
    # 1. Get wallets from BigQuery traders table
    print("📊 Fetching wallets from traders table...", flush=True)
    try:
        query = f"SELECT DISTINCT wallet_address FROM `{TRADERS_TABLE}` WHERE wallet_address IS NOT NULL"
        results = bq_client.query(query).result()
        trader_wallets = {row['wallet_address'].lower().strip() for row in results if row.get('wallet_address')}
        wallets.update(trader_wallets)
        print(f"  ✅ Found {len(trader_wallets)} wallets from traders table", flush=True)
    except Exception as e:
        print(f"  ⚠️  Error fetching traders: {e}", flush=True)
    
    # 2. Get user wallets from Supabase
    if supabase_client:
        print("📊 Fetching user wallets from Supabase...", flush=True)
        user_wallets = set()
        
        try:
            # From profiles table
            profiles = supabase_client.table('profiles').select('trading_wallet_address, wallet_address').execute()
            for profile in profiles.data or []:
                if profile.get('trading_wallet_address'):
                    user_wallets.add(profile['trading_wallet_address'].lower().strip())
                if profile.get('wallet_address'):
                    user_wallets.add(profile['wallet_address'].lower().strip())
        except Exception as e:
            print(f"  ⚠️  Error fetching profiles: {e}", flush=True)
        
        try:
            # From turnkey_wallets table
            turnkey = supabase_client.table('turnkey_wallets').select('polymarket_account_address, eoa_address').execute()
            for wallet in turnkey.data or []:
                if wallet.get('polymarket_account_address'):
                    user_wallets.add(wallet['polymarket_account_address'].lower().strip())
                if wallet.get('eoa_address'):
                    user_wallets.add(wallet['eoa_address'].lower().strip())
        except Exception as e:
            print(f"  ⚠️  Error fetching turnkey_wallets: {e}", flush=True)
        
        try:
            # From clob_credentials table
            clob = supabase_client.table('clob_credentials').select('polymarket_account_address').execute()
            for cred in clob.data or []:
                if cred.get('polymarket_account_address'):
                    user_wallets.add(cred['polymarket_account_address'].lower().strip())
        except Exception as e:
            print(f"  ⚠️  Error fetching clob_credentials: {e}", flush=True)
        
        try:
            # From user_wallets table
            user_w = supabase_client.table('user_wallets').select('proxy_wallet, eoa_wallet').execute()
            for uw in user_w.data or []:
                if uw.get('proxy_wallet'):
                    user_wallets.add(uw['proxy_wallet'].lower().strip())
                if uw.get('eoa_wallet'):
                    user_wallets.add(uw['eoa_wallet'].lower().strip())
        except Exception as e:
            print(f"  ⚠️  Error fetching user_wallets: {e}", flush=True)
        
        wallets.update(user_wallets)
        print(f"  ✅ Found {len(user_wallets)} unique user wallets", flush=True)
    
    print(f"✅ Total unique wallets: {len(wallets)}", flush=True)
    return wallets

def get_last_checkpoint(bq_client: bigquery.Client) -> Optional[datetime]:
    """Gets the last checkpoint timestamp."""
    try:
        query = f"""
        SELECT last_sync_time
        FROM `{CHECKPOINT_TABLE}`
        ORDER BY last_sync_time DESC
        LIMIT 1
        """
        results = bq_client.query(query).result()
        row = next(results, None)
        if row and row.get('last_sync_time'):
            return row['last_sync_time']
    except Exception as e:
        print(f"⚠️  No checkpoint found (first run?): {e}", flush=True)
    return None

def update_checkpoint(bq_client: bigquery.Client, sync_time: datetime, duration: float, 
                     trades: int, markets: int, events: int, wallets: int):
    """Updates or creates checkpoint."""
    try:
        # Create table if it doesn't exist
        create_table_query = f"""
        CREATE TABLE IF NOT EXISTS `{CHECKPOINT_TABLE}` (
            last_sync_time TIMESTAMP,
            sync_duration_seconds FLOAT64,
            trades_fetched INT64,
            markets_fetched INT64,
            events_fetched INT64,
            wallets_processed INT64
        )
        """
        bq_client.query(create_table_query).result()
        
        # Insert checkpoint
        insert_query = f"""
        INSERT INTO `{CHECKPOINT_TABLE}` 
        (last_sync_time, sync_duration_seconds, trades_fetched, markets_fetched, events_fetched, wallets_processed)
        VALUES 
        (TIMESTAMP('{sync_time.isoformat()}'), {duration}, {trades}, {markets}, {events}, {wallets})
        """
        bq_client.query(insert_query).result()
        print(f"✅ Checkpoint updated: {sync_time.isoformat()}", flush=True)
    except Exception as e:
        print(f"⚠️  Error updating checkpoint: {e}", flush=True)

def fetch_trades_for_wallet(session: requests.Session, wallet: str, since: Optional[datetime]) -> List[Dict]:
    """Fetches trades for a wallet since the given timestamp."""
    all_trades = []
    base_url = "https://api.domeapi.io/v1"
    headers = {"Authorization": f"Bearer {DOME_API_KEY}", "Accept": "application/json"}
    
    # Use 'user' parameter (not 'wallet') and 'start_time' (not 'since') per Dome API docs
    params = {"user": wallet, "limit": 100}
    if since:
        # Convert datetime to Unix timestamp
        params["start_time"] = int(since.timestamp())
    
    offset = 0
    
    while True:
        params["offset"] = offset
        
        try:
            time.sleep(API_RATE_LIMIT_DELAY)
            response = session.get(f"{base_url}/polymarket/orders", headers=headers, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            # Dome API returns orders in 'orders' field
            orders = data.get('orders', [])
            if not orders:
                # Fallback to 'results' if 'orders' doesn't exist
                orders = data.get('results', [])
            
            if not orders:
                break
            
            all_trades.extend(orders)
            
            # Check pagination
            pagination = data.get('pagination', {})
            has_more = pagination.get('has_more', False)
            
            if not has_more:
                break
            
            offset += len(orders)
            
            if len(all_trades) % 1000 == 0:
                print(f"    Fetched {len(all_trades)} trades so far...", flush=True)
        
        except Exception as e:
            print(f"    ⚠️  Error fetching trades for {wallet[:10]}...: {e}", flush=True)
            if 'response' in locals():
                try:
                    error_text = response.text[:500]
                    print(f"    Response: {error_text}", flush=True)
                except:
                    pass
            break
    
    return all_trades

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
    
    # Generate ID from order_hash or tx_hash (API doesn't return 'id' field)
    trade_id = trade.get('id') or trade.get('order_hash') or trade.get('tx_hash')
    if not trade_id:
        # Fallback: create composite ID from wallet + timestamp + tx_hash
        tx_hash = trade.get('tx_hash', '')
        timestamp = trade.get('timestamp') or trade.get('created_at', 0)
        trade_id = f"{wallet.lower().strip()}_{timestamp}_{tx_hash}"[:100]  # Limit length
    
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
        'order_hash': trade.get('order_hash'),  # Also capture order_hash if available
    }

def load_trades_to_bigquery(client: bigquery.Client, trades: List[Dict]) -> bool:
    """Loads trades using MERGE with deduplication."""
    if not trades:
        print(f"  ⚠️  No trades to load (empty list)", flush=True)
        return True
    
    print(f"  📊 Preparing to load {len(trades)} trades...", flush=True)
    
    try:
        temp_table_id = f"{TRADES_TABLE}_temp_{int(time.time() * 1000000)}"
        print(f"  📊 Creating temp table: {temp_table_id}", flush=True)
        dest_table = client.get_table(TRADES_TABLE)
        temp_table = bigquery.Table(temp_table_id, schema=dest_table.schema)
        client.create_table(temp_table)
        
        # Filter out trades missing required fields
        valid_trades = []
        for trade in trades:
            if not trade.get('id'):
                continue
            if not trade.get('timestamp'):
                continue
            if not trade.get('tx_hash'):
                continue
            valid_trades.append(trade)
        
        if not valid_trades:
            print(f"  ⚠️  No valid trades after filtering (required: id, timestamp, tx_hash)", flush=True)
            client.delete_table(temp_table_id)
            return False
        
        print(f"  📊 Loading {len(valid_trades)} valid trades to temp table...", flush=True)
        job_config = bigquery.LoadJobConfig(
            write_disposition="WRITE_TRUNCATE",
            source_format="NEWLINE_DELIMITED_JSON",
            autodetect=False
        )
        load_job = client.load_table_from_json(valid_trades, temp_table_id, job_config=job_config)
        load_job.result()
        print(f"  ✅ Loaded to temp table", flush=True)
        
        print(f"  📊 Merging to main table...", flush=True)
        merge_query = f"""
        MERGE `{TRADES_TABLE}` AS target
        USING (
            SELECT *
            FROM `{temp_table_id}`
            QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY timestamp DESC) = 1
        ) AS source
        ON target.id = source.id
        WHEN NOT MATCHED THEN INSERT ROW
        """
        
        merge_job = client.query(merge_query)
        merge_job.result()
        print(f"  ✅ Merge completed", flush=True)
        
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

def get_open_market_condition_ids(bq_client: bigquery.Client) -> List[str]:
    """Gets condition_ids for open markets that need updating."""
    try:
        query = f"""
        SELECT DISTINCT condition_id
        FROM `{MARKETS_TABLE}`
        WHERE status = 'open'
          AND condition_id IS NOT NULL
        """
        results = bq_client.query(query).result()
        return [row['condition_id'] for row in results if row.get('condition_id')]
    except Exception as e:
        print(f"⚠️  Error fetching open markets: {e}", flush=True)
        return []

def main():
    if not DOME_API_KEY:
        raise ValueError("DOME_API_KEY not set")
    
    start_time = datetime.now(datetime.UTC) if hasattr(datetime, 'UTC') else datetime.utcnow()
    print("=" * 80, flush=True)
    print("Daily Incremental Sync Job", flush=True)
    print("=" * 80, flush=True)
    print()
    
    bq_client = get_bigquery_client()
    supabase_client = get_supabase_client()
    session = get_http_session()
    
    # Get last checkpoint
    last_checkpoint = get_last_checkpoint(bq_client)
    
    # Also get the latest trade timestamp from BigQuery to catch any gaps
    try:
        latest_trade_query = f"SELECT MAX(timestamp) as latest_trade FROM `{TRADES_TABLE}`"
        latest_trade_result = bq_client.query(latest_trade_query).result()
        latest_trade_row = next(latest_trade_result, None)
        latest_trade_time = latest_trade_row['latest_trade'] if latest_trade_row and latest_trade_row.get('latest_trade') else None
    except Exception as e:
        print(f"⚠️  Could not get latest trade timestamp: {e}", flush=True)
        latest_trade_time = None
    
    # Use the earlier of checkpoint or latest trade time to ensure we don't miss any trades
    # This catches gaps if checkpoint is ahead of actual data
    if last_checkpoint and latest_trade_time:
        # If checkpoint is more than 1 hour ahead of latest trade, there might be a gap
        # Use the earlier timestamp to ensure we catch all trades
        checkpoint_delta = (last_checkpoint - latest_trade_time).total_seconds() / 3600
        if checkpoint_delta > 1:
            print(f"⚠️  Checkpoint is {checkpoint_delta:.1f} hours ahead of latest trade - possible gap detected", flush=True)
            since = latest_trade_time
            print(f"📅 Last checkpoint: {last_checkpoint.isoformat()}", flush=True)
            print(f"📅 Latest trade in DB: {latest_trade_time.isoformat()}", flush=True)
            print(f"📅 Using latest trade timestamp to fill gap: {since.isoformat()}", flush=True)
        else:
            since = min(last_checkpoint, latest_trade_time)
            print(f"📅 Last checkpoint: {last_checkpoint.isoformat()}", flush=True)
            print(f"📅 Latest trade in DB: {latest_trade_time.isoformat()}", flush=True)
            print(f"📅 Using earlier timestamp: {since.isoformat()}", flush=True)
    elif last_checkpoint:
        since = last_checkpoint
        print(f"📅 Last sync: {since.isoformat()}", flush=True)
    elif latest_trade_time:
        since = latest_trade_time
        print(f"📅 Latest trade in DB: {since.isoformat()}", flush=True)
    else:
        now = datetime.now(datetime.UTC) if hasattr(datetime, 'UTC') else datetime.utcnow()
        since = now - timedelta(hours=DEFAULT_LOOKBACK_HOURS)
        print(f"📅 No checkpoint or trades found. Using default lookback: {since.isoformat()} ({DEFAULT_LOOKBACK_HOURS} hours)", flush=True)
    print()
    
    # Get all wallets
    wallets = get_all_wallets(bq_client, supabase_client)
    
    # Test mode: limit wallets if TEST_MODE_WALLET_LIMIT is set
    if TEST_MODE_WALLET_LIMIT > 0:
        wallets = list(wallets)[:TEST_MODE_WALLET_LIMIT]
        print(f"🧪 TEST MODE: Limited to {len(wallets)} wallets", flush=True)
    
    print(f"📊 Processing {len(wallets)} wallets", flush=True)
    print()
    
    # Step 1: Fetch new trades
    print("Step 1: Fetching new trades...", flush=True)
    all_trades = []
    all_condition_ids = set()
    
    for i, wallet in enumerate(sorted(wallets), 1):
        if i % 50 == 0:
            print(f"  Processing wallet {i}/{len(wallets)}...", flush=True)
        
        trades = fetch_trades_for_wallet(session, wallet, since)
        for trade in trades:
            mapped = map_trade_to_schema(trade, wallet)
            # Only add trades that have required fields
            if mapped.get('id') and mapped.get('timestamp') and mapped.get('tx_hash'):
                all_trades.append(mapped)
                if mapped.get('condition_id'):
                    all_condition_ids.add(mapped['condition_id'])
    
    print(f"  ✅ Fetched {len(all_trades)} trades", flush=True)
    print(f"  ✅ Found {len(all_condition_ids)} unique condition_ids", flush=True)
    print()
    
    # Step 2: Get condition_ids for new markets and open markets to update
    print("Step 2: Identifying markets to fetch...", flush=True)
    
    # Get existing condition_ids
    existing_query = f"SELECT DISTINCT condition_id FROM `{MARKETS_TABLE}` WHERE condition_id IS NOT NULL"
    existing_results = bq_client.query(existing_query).result()
    existing_condition_ids = {row['condition_id'] for row in existing_results if row.get('condition_id')}
    
    # New condition_ids from trades
    new_condition_ids = all_condition_ids - existing_condition_ids
    print(f"  ✅ New condition_ids: {len(new_condition_ids)}", flush=True)
    
    # Open markets to update
    open_condition_ids = get_open_market_condition_ids(bq_client)
    print(f"  ✅ Open markets to update: {len(open_condition_ids)}", flush=True)
    
    # Combine (deduplicate) - include new markets and open markets to update
    markets_to_fetch = list((new_condition_ids | set(open_condition_ids)))
    
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
    
    # Update checkpoint
    end_time = datetime.now(datetime.UTC) if hasattr(datetime, 'UTC') else datetime.utcnow()
    duration = (end_time - start_time).total_seconds()
    update_checkpoint(bq_client, end_time, duration, len(all_trades), len(markets_mapped), len(events), len(wallets))
    
    # Step 8: Sync trader stats to Supabase (if trades were loaded)
    if all_trades:
        print("Step 8: Syncing trader stats to Supabase...", flush=True)
        try:
            # Import the sync functions directly
            import importlib.util
            import sys
            
            sync_script_path = os.path.join(os.path.dirname(__file__), 'sync-trader-stats-from-bigquery.py')
            if os.path.exists(sync_script_path):
                spec = importlib.util.spec_from_file_location("sync_trader_stats", sync_script_path)
                sync_module = importlib.util.module_from_spec(spec)
                sys.modules["sync_trader_stats"] = sync_module
                spec.loader.exec_module(sync_module)
                
                supabase_client = sync_module.get_supabase_client()
                if supabase_client:
                    stats_wallets = sync_module.get_wallets_to_update(bq_client)
                    
                    # Only process wallets that were in this sync
                    wallets_with_trades = {w.lower() for w in wallets} & set(stats_wallets)
                    
                    print(f"  📊 Processing {len(wallets_with_trades)} wallets for stats...", flush=True)
                    
                    global_stats_count = 0
                    profile_stats_count = 0
                    
                    for i, wallet in enumerate(sorted(wallets_with_trades), 1):
                        if i % 50 == 0:
                            print(f"    Processing stats for wallet {i}/{len(wallets_with_trades)}...", flush=True)
                        
                        # Calculate and upsert global stats
                        global_stats = sync_module.calculate_global_stats(bq_client, wallet)
                        if global_stats and sync_module.upsert_global_stats(supabase_client, global_stats):
                            global_stats_count += 1
                        
                        # Calculate and upsert profile stats
                        profile_stats = sync_module.calculate_profile_stats(bq_client, wallet)
                        if profile_stats and sync_module.upsert_profile_stats(supabase_client, profile_stats):
                            profile_stats_count += len(profile_stats)
                    
                    print(f"  ✅ Updated {global_stats_count} global stats and {profile_stats_count} profile stats", flush=True)
                else:
                    print("  ⚠️  Supabase client not available, skipping stats sync", flush=True)
            else:
                print("  ⚠️  Stats sync script not found, skipping", flush=True)
        except Exception as e:
            print(f"  ⚠️  Error syncing trader stats: {e}", flush=True)
            import traceback
            traceback.print_exc()
        print()
    
    print("=" * 80, flush=True)
    print("✅ Daily sync complete!", flush=True)
    print(f"Duration: {duration:.1f} seconds", flush=True)
    print(f"Trades: {len(all_trades)}", flush=True)
    print(f"Markets: {len(markets_mapped)}", flush=True)
    print(f"Events: {len(events)}", flush=True)
    print("=" * 80, flush=True)

if __name__ == "__main__":
    main()
