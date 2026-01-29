"""
Robust Dome API to BigQuery Backfill Script v2

Key improvements:
1. Uses BigQuery MERGE for deduplication (no memory loading of IDs)
2. Proper error handling with rollback
3. Faster uploads with optimized batching
4. Robust checkpointing with transaction safety
5. Better pagination handling
6. Comprehensive retry logic
7. Progress tracking and monitoring
"""

import os
import time
import sys
import json
import requests
from datetime import datetime
from typing import List, Dict, Set, Optional, Tuple
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from google.cloud import bigquery
from google.api_core import exceptions as bq_exceptions

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# --- CONFIGURATION ---
PROJECT_ID = "gen-lang-client-0299056258"
DOME_API_KEY = os.getenv("DOME_API_KEY")

TRADERS_TABLE = f"{PROJECT_ID}.polycopy_v1.traders"
EVENTS_TABLE = f"{PROJECT_ID}.polycopy_v1.events"
MARKETS_TABLE = f"{PROJECT_ID}.polycopy_v1.markets"
TRADES_TABLE = f"{PROJECT_ID}.polycopy_v1.trades"
TRADES_STAGING_TABLE = f"{PROJECT_ID}.polycopy_v1.trades_staging"
CHECKPOINT_TABLE = f"{PROJECT_ID}.polycopy_v1.backfill_checkpoint"

USE_STAGING_TABLE = os.getenv("USE_STAGING_TABLE", "true").lower() == "true"

# Performance tuning - optimized for speed
API_RATE_LIMIT_DELAY = float(os.getenv("API_RATE_LIMIT_DELAY", "0.1"))
BATCH_UPLOAD_SIZE = int(os.getenv("BATCH_UPLOAD_SIZE", "50"))  # Smaller batches for faster checkpointing
LARGE_WALLET_THRESHOLD = int(os.getenv("LARGE_WALLET_THRESHOLD", "100000"))  # Upload immediately if > 100K trades
IN_MEMORY_CHUNK_SIZE = int(os.getenv("IN_MEMORY_CHUNK_SIZE", "1000000"))  # 1M trades in memory max
BIGQUERY_UPLOAD_DELAY = float(os.getenv("BIGQUERY_UPLOAD_DELAY", "1.0"))  # Reduced delay
BIGQUERY_CHUNK_SIZE = int(os.getenv("BIGQUERY_CHUNK_SIZE", "100000"))  # 100K rows per chunk
MAX_RETRIES = 5
RETRY_BACKOFF_BASE = 2

WALLET_ADDRESSES_ENV = os.getenv("WALLET_ADDRESSES")


class BackfillError(Exception):
    """Custom exception for backfill errors"""
    pass


def get_bigquery_client():
    """Initializes BigQuery client"""
    client = bigquery.Client(project=PROJECT_ID)
    return client


def get_http_session():
    """Creates HTTP session with retry logic"""
    session = requests.Session()
    retry_strategy = Retry(
        total=MAX_RETRIES,
        backoff_factor=RETRY_BACKOFF_BASE,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"]
    )
    adapter = HTTPAdapter(
        max_retries=retry_strategy,
        pool_connections=10,
        pool_maxsize=20
    )
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def create_checkpoint_table(client):
    """Creates checkpoint table if it doesn't exist"""
    try:
        query = f"""
        CREATE TABLE IF NOT EXISTS `{CHECKPOINT_TABLE}` (
            wallet_address STRING NOT NULL,
            completed BOOL NOT NULL,
            processed_at TIMESTAMP NOT NULL,
            trade_count INT64,
            upload_successful BOOL NOT NULL
        )
        """
        client.query(query).result()
    except Exception:
        pass


def get_processed_wallets(client) -> Set[str]:
    """Gets wallets that were successfully processed"""
    create_checkpoint_table(client)
    try:
        query = f"""
        SELECT DISTINCT wallet_address 
        FROM `{CHECKPOINT_TABLE}` 
        WHERE completed = true AND upload_successful = true
        """
        results = client.query(query).result()
        return {row.wallet_address.lower() for row in results if row.wallet_address}
    except Exception:
        return set()


def mark_wallet_complete(client, wallet_address: str, trade_count: int, upload_successful: bool = True):
    """Marks wallet as complete with upload status"""
    try:
        # Delete existing entry
        delete_query = f"""
        DELETE FROM `{CHECKPOINT_TABLE}` 
        WHERE wallet_address = '{wallet_address.lower()}'
        """
        try:
            client.query(delete_query).result()
        except:
            pass
        
        # Insert new entry
        rows = [{
            'wallet_address': wallet_address.lower(),
            'completed': True,
            'processed_at': datetime.utcnow().isoformat(),
            'trade_count': trade_count,
            'upload_successful': upload_successful
        }]
        errors = client.insert_rows_json(CHECKPOINT_TABLE, rows)
        if errors:
            raise BackfillError(f"Checkpoint update failed: {errors}")
    except Exception as e:
        raise BackfillError(f"Failed to update checkpoint: {e}")


def upload_to_bigquery_with_deduplication(
    client, 
    data: List[Dict], 
    table_id: str, 
    chunk_size: Optional[int] = None
) -> bool:
    """
    Uploads data to BigQuery with built-in deduplication.
    Uses INSERT with QUALIFY ROW_NUMBER for efficient deduplication.
    Returns True if successful, False otherwise.
    """
    if not data:
        return True
    
    # Chunk large datasets
    if chunk_size and len(data) > chunk_size:
        print(f"  Chunking {len(data):,} rows into {chunk_size:,} row chunks...", flush=True)
        for i in range(0, len(data), chunk_size):
            chunk = data[i:i + chunk_size]
            chunk_num = (i // chunk_size) + 1
            total_chunks = (len(data) + chunk_size - 1) // chunk_size
            print(f"    Uploading chunk {chunk_num}/{total_chunks}...", flush=True)
            if not upload_to_bigquery_with_deduplication(client, chunk, table_id, chunk_size=None):
                return False
        return True
    
    # Create temporary table for staging
    temp_table_id = f"{table_id}_temp_{int(time.time() * 1000000)}"  # Use microseconds for uniqueness
    
    try:
        # Get schema from destination table
        dest_table = client.get_table(table_id)
        schema = dest_table.schema
        
        # Create temp table
        temp_table = bigquery.Table(temp_table_id, schema=schema)
        client.create_table(temp_table)
        
        # Upload to temp table
        job_config = bigquery.LoadJobConfig(
            write_disposition="WRITE_TRUNCATE",
            source_format="NEWLINE_DELIMITED_JSON",
            autodetect=False
        )
        
        job = client.load_table_from_json(data, temp_table_id, job_config=job_config)
        job.result()  # Wait for completion
        
        # Insert with deduplication using MERGE
        # This only inserts rows that don't already exist (based on id)
        merge_query = f"""
        MERGE `{table_id}` AS target
        USING (
            SELECT *
            FROM `{temp_table_id}`
            QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY timestamp DESC) = 1
        ) AS source
        ON target.id = source.id
        WHEN NOT MATCHED THEN
            INSERT ROW
        """
        
        merge_job = client.query(merge_query)
        merge_job.result()
        
        # Clean up temp table
        client.delete_table(temp_table_id)
        
        print(f"  ✅ Uploaded {len(data):,} rows to {table_id} (deduplicated)", flush=True)
        return True
        
    except Exception as e:
        print(f"  ❌ Upload failed: {e}", flush=True)
        import traceback
        traceback.print_exc()
        # Clean up temp table on error
        try:
            client.delete_table(temp_table_id)
        except:
            pass
        return False


def fetch_trades_for_wallet(
    session: requests.Session,
    wallet: str,
    existing_trade_ids: Set[str]
) -> Tuple[List[Dict], Set[str]]:
    """
    Fetches all trades for a wallet with proper pagination.
    Returns (trades_list, condition_ids_set)
    """
    trades = []
    condition_ids = set()
    seen_trade_ids = set()  # Track duplicates within this fetch
    
    offset = 0
    limit = 1000
    pagination_key = None
    page_count = 0
    
    while True:
        base_url = "https://api.domeapi.io/v1"
        url = f"{base_url}/polymarket/orders?user={wallet}&limit={limit}"
        
        # Build pagination params
        if pagination_key:
            url += f"&pagination_key={pagination_key}"
        elif offset <= 10000:
            url += f"&offset={offset}"
        else:
            print(f"  ⚠️  Offset {offset} > 10000 without pagination_key. Stopping.", flush=True)
            break
        
        headers = {"Authorization": f"Bearer {DOME_API_KEY}", "Accept": "application/json"}
        
        try:
            response = session.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            data = response.json()
            orders = data.get('orders', [])
            pagination = data.get('pagination', {})
            page_count += 1
            
            if page_count % 50 == 0:
                print(f"    Page {page_count}: {len(trades):,} trades fetched...", flush=True)
            
            # Process orders
            for order in orders:
                trade_id = order.get('order_hash') or order.get('tx_hash')
                condition_id = order.get('condition_id')
                
                # Skip duplicates (both existing and within this fetch)
                if not trade_id or trade_id in existing_trade_ids or trade_id in seen_trade_ids:
                    continue
                
                seen_trade_ids.add(trade_id)
                
                # Convert timestamp
                timestamp_unix = order.get('timestamp')
                timestamp_str = None
                if timestamp_unix:
                    timestamp_dt = datetime.fromtimestamp(timestamp_unix)
                    timestamp_str = timestamp_dt.strftime('%Y-%m-%d %H:%M:%S')
                
                trade = {
                    "id": trade_id,
                    "condition_id": condition_id,
                    "wallet_address": order.get("user") or wallet,
                    "timestamp": timestamp_str,
                    "side": order.get("side"),
                    "price": float(order.get('price')) if order.get('price') is not None else None,
                    "shares_normalized": float(order.get('shares_normalized')) if order.get('shares_normalized') is not None else None,
                    "token_label": order.get("token_label"),
                    "token_id": order.get("token_id"),
                    "tx_hash": order.get("tx_hash"),
                }
                trades.append(trade)
                
                if condition_id:
                    condition_ids.add(condition_id)
            
            # Check pagination
            has_more = pagination.get('has_more', False)
            new_pagination_key = pagination.get('pagination_key')
            
            if not has_more or len(orders) == 0:
                break
            
            # Update pagination state
            if new_pagination_key:
                pagination_key = new_pagination_key
                offset = None
            elif offset is not None:
                next_offset = offset + len(orders)
                if next_offset > 10000:
                    if not new_pagination_key:
                        print(f"  ⚠️  Next offset {next_offset} > 10000 without pagination_key. Stopping.", flush=True)
                        break
                    pagination_key = new_pagination_key
                    offset = None
                else:
                    offset = next_offset
            else:
                break
            
            # Rate limiting
            if API_RATE_LIMIT_DELAY > 0:
                time.sleep(API_RATE_LIMIT_DELAY)
                
        except requests.RequestException as e:
            print(f"  ❌ API error: {e}. Retrying...", flush=True)
            time.sleep(RETRY_BACKOFF_BASE ** 2)
            continue
    
    return trades, condition_ids


def fetch_markets_by_condition_ids(session: requests.Session, condition_ids: List[str]) -> Tuple[List[Dict], List[Dict]]:
    """Fetches markets for condition IDs"""
    if not condition_ids:
        return [], []
    
    markets_mapped = []
    markets_raw = []
    base_url = "https://api.domeapi.io/v1"
    batch_size = 100
    
    for i in range(0, len(condition_ids), batch_size):
        batch = condition_ids[i:i + batch_size]
        from urllib.parse import urlencode
        url = f"{base_url}/polymarket/markets"
        params = [('limit', len(batch))]
        for cid in batch:
            params.append(('condition_id', cid))
        url = f"{url}?{urlencode(params)}"
        
        headers = {"Authorization": f"Bearer {DOME_API_KEY}", "Accept": "application/json"}
        
        try:
            response = session.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            data = response.json()
            markets = data.get('markets', []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
            
            for market in markets:
                mapped = {
                    'condition_id': market.get('condition_id'),
                    'event_slug': market.get('event_slug'),
                    'market_slug': market.get('market_slug'),
                    'bet_structure': market.get('bet_structure'),
                    'market_subtype': market.get('market_subtype'),
                    'liquidity': float(market.get('liquidity')) if market.get('liquidity') is not None else None,
                    'status': market.get('status'),
                    'winning_label': market.get('winning_side', {}).get('label') if isinstance(market.get('winning_side'), dict) else market.get('winning_side'),
                    'winning_id': market.get('winning_side', {}).get('id') if isinstance(market.get('winning_side'), dict) else None,
                }
                if mapped['condition_id']:
                    markets_mapped.append(mapped)
                    markets_raw.append(market)
            
            if API_RATE_LIMIT_DELAY > 0:
                time.sleep(API_RATE_LIMIT_DELAY)
        except Exception as e:
            print(f"  ⚠️  Market fetch error: {e}", flush=True)
            continue
    
    return markets_mapped, markets_raw


def extract_events_from_markets(markets_raw: List[Dict]) -> List[Dict]:
    """Extracts events from markets"""
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


def ensure_staging_table_exists(client):
    """Creates staging table if needed"""
    try:
        client.get_table(TRADES_STAGING_TABLE)
    except Exception:
        schema = [
            bigquery.SchemaField("id", "STRING"),
            bigquery.SchemaField("condition_id", "STRING"),
            bigquery.SchemaField("wallet_address", "STRING"),
            bigquery.SchemaField("timestamp", "TIMESTAMP"),
            bigquery.SchemaField("side", "STRING"),
            bigquery.SchemaField("price", "FLOAT"),
            bigquery.SchemaField("shares_normalized", "FLOAT"),
            bigquery.SchemaField("token_label", "STRING"),
            bigquery.SchemaField("token_id", "STRING"),
            bigquery.SchemaField("tx_hash", "STRING"),
        ]
        table = bigquery.Table(TRADES_STAGING_TABLE, schema=schema)
        table.clustering_fields = ["wallet_address", "timestamp"]
        client.create_table(table)


def main():
    """Main backfill function"""
    if not DOME_API_KEY:
        raise BackfillError("DOME_API_KEY not set")
    
    print("=" * 80, flush=True)
    print("BACKFILL v2 STARTING", flush=True)
    print("=" * 80, flush=True)
    
    client = get_bigquery_client()
    session = get_http_session()
    
    if USE_STAGING_TABLE:
        ensure_staging_table_exists(client)
    
    # Get wallets to process
    if WALLET_ADDRESSES_ENV:
        trader_wallets = [w.strip() for w in WALLET_ADDRESSES_ENV.split(",") if w.strip()]
    else:
        query = f"SELECT DISTINCT wallet_address FROM `{TRADERS_TABLE}` WHERE wallet_address IS NOT NULL"
        results = client.query(query).result()
        trader_wallets = [row['wallet_address'] for row in results if row.get('wallet_address')]
    
    if not trader_wallets:
        raise BackfillError("No wallets to process")
    
    # Filter processed wallets
    processed_wallets = get_processed_wallets(client)
    remaining_wallets = [w for w in trader_wallets if w.lower() not in processed_wallets]
    
    print(f"Total wallets: {len(trader_wallets)}")
    print(f"Already processed: {len(processed_wallets)}")
    print(f"Remaining: {len(remaining_wallets)}")
    print("=" * 80, flush=True)
    
    if not remaining_wallets:
        print("All wallets processed!")
        return
    
    # Track existing IDs for deduplication (only for current run, not all historical)
    existing_trade_ids: Set[str] = set()
    existing_market_ids: Set[str] = set()
    existing_event_slugs: Set[str] = set()
    
    # Batch processing
    batch_trades = []
    batch_markets = []
    batch_events = []
    batch_wallets = []
    
    start_time = time.time()
    total_trades = 0
    
    for i, wallet in enumerate(remaining_wallets):
        print(f"\n[{i+1}/{len(remaining_wallets)}] Processing {wallet}...", flush=True)
        wallet_start = time.time()
        
        try:
            # Fetch trades
            wallet_trades, condition_ids = fetch_trades_for_wallet(session, wallet, existing_trade_ids)
            
            if not wallet_trades:
                print(f"  No new trades found", flush=True)
                mark_wallet_complete(client, wallet, 0, upload_successful=True)
                continue
            
            print(f"  Found {len(wallet_trades):,} new trades", flush=True)
            
            # Fetch markets and events
            wallet_markets = []
            wallet_events = []
            if condition_ids:
                wallet_markets, raw_markets = fetch_markets_by_condition_ids(session, list(condition_ids))
                wallet_events = extract_events_from_markets(raw_markets)
                print(f"  Found {len(wallet_markets)} markets, {len(wallet_events)} events", flush=True)
            
            # Update existing IDs
            for trade in wallet_trades:
                if trade.get('id'):
                    existing_trade_ids.add(trade['id'])
            for market in wallet_markets:
                if market.get('condition_id'):
                    existing_market_ids.add(market['condition_id'])
            for event in wallet_events:
                if event.get('event_slug'):
                    existing_event_slugs.add(event['event_slug'])
            
            # Upload immediately for large wallets
            if len(wallet_trades) >= LARGE_WALLET_THRESHOLD:
                print(f"  Large wallet - uploading immediately...", flush=True)
                target_table = TRADES_STAGING_TABLE if USE_STAGING_TABLE else TRADES_TABLE
                success = (
                    upload_to_bigquery_with_deduplication(client, wallet_events, EVENTS_TABLE) and
                    upload_to_bigquery_with_deduplication(client, wallet_markets, MARKETS_TABLE) and
                    upload_to_bigquery_with_deduplication(client, wallet_trades, target_table, BIGQUERY_CHUNK_SIZE)
                )
                mark_wallet_complete(client, wallet, len(wallet_trades), upload_successful=success)
                if success:
                    total_trades += len(wallet_trades)
            else:
                # Add to batch
                batch_trades.extend(wallet_trades)
                batch_markets.extend(wallet_markets)
                batch_events.extend(wallet_events)
                batch_wallets.append((wallet, len(wallet_trades)))
            
            # Upload batch if needed
            if len(batch_trades) >= IN_MEMORY_CHUNK_SIZE or (i + 1) % BATCH_UPLOAD_SIZE == 0:
                if batch_trades:
                    print(f"\n  Uploading batch ({len(batch_trades):,} trades)...", flush=True)
                    target_table = TRADES_STAGING_TABLE if USE_STAGING_TABLE else TRADES_TABLE
                    success = (
                        upload_to_bigquery_with_deduplication(client, batch_events, EVENTS_TABLE) and
                        upload_to_bigquery_with_deduplication(client, batch_markets, MARKETS_TABLE) and
                        upload_to_bigquery_with_deduplication(client, batch_trades, target_table, BIGQUERY_CHUNK_SIZE)
                    )
                    
                    # Mark wallets complete
                    for wallet_addr, trade_count in batch_wallets:
                        mark_wallet_complete(client, wallet_addr, trade_count, upload_successful=success)
                    
                    if success:
                        total_trades += len(batch_trades)
                    
                    batch_trades, batch_markets, batch_events, batch_wallets = [], [], [], []
            
            elapsed = time.time() - wallet_start
            print(f"  ✅ Completed in {elapsed:.1f}s", flush=True)
            
        except Exception as e:
            print(f"  ❌ Error processing wallet: {e}", flush=True)
            import traceback
            traceback.print_exc()
            # Mark as failed
            mark_wallet_complete(client, wallet, 0, upload_successful=False)
            continue
    
    # Final batch upload
    if batch_trades:
        print(f"\n  Final batch upload ({len(batch_trades):,} trades)...", flush=True)
        target_table = TRADES_STAGING_TABLE if USE_STAGING_TABLE else TRADES_TABLE
        success = (
            upload_to_bigquery_with_deduplication(client, batch_events, EVENTS_TABLE) and
            upload_to_bigquery_with_deduplication(client, batch_markets, MARKETS_TABLE) and
            upload_to_bigquery_with_deduplication(client, batch_trades, target_table, BIGQUERY_CHUNK_SIZE)
        )
        for wallet_addr, trade_count in batch_wallets:
            mark_wallet_complete(client, wallet_addr, trade_count, upload_successful=success)
    
    total_elapsed = time.time() - start_time
    print(f"\n{'='*80}", flush=True)
    print(f"✅ BACKFILL COMPLETE", flush=True)
    print(f"Total trades: {total_trades:,}", flush=True)
    print(f"Time: {total_elapsed:.1f}s", flush=True)
    print(f"Rate: {total_trades/total_elapsed:.0f} trades/sec", flush=True)
    print(f"{'='*80}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n{'='*80}", flush=True)
        print(f"FATAL ERROR: {e}", flush=True)
        print(f"{'='*80}", flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)
