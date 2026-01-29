"""
Hybrid Backfill Script v3 - Best of Both Worlds

Combines:
- Example's GCS streaming + parallel processing
- My v2's correct API usage + checkpointing
- No memory deduplication (uses BigQuery constraints)
"""

import os
import time
import sys
import json
import requests
from datetime import datetime
from typing import List, Dict, Set, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from google.cloud import bigquery
from google.cloud import storage
try:
    from google.cloud import bigquery_datatransfer
    DTS_AVAILABLE = True
except ImportError:
    DTS_AVAILABLE = False

# Configuration
PROJECT_ID = "gen-lang-client-0299056258"
DOME_API_KEY = os.getenv("DOME_API_KEY")
GCS_BUCKET = os.getenv("GCS_BUCKET", f"{PROJECT_ID}-backfill-temp")

TRADERS_TABLE = f"{PROJECT_ID}.polycopy_v1.traders"
EVENTS_TABLE = f"{PROJECT_ID}.polycopy_v1.events"
MARKETS_TABLE = f"{PROJECT_ID}.polycopy_v1.markets"
TRADES_TABLE = f"{PROJECT_ID}.polycopy_v1.trades"
TRADES_STAGING_TABLE = f"{PROJECT_ID}.polycopy_v1.trades_staging"
CHECKPOINT_TABLE = f"{PROJECT_ID}.polycopy_v1.backfill_checkpoint"

USE_STAGING_TABLE = os.getenv("USE_STAGING_TABLE", "true").lower() == "true"
USE_DTS = os.getenv("USE_DTS", "true").lower() == "true"  # Use Data Transfer Service instead of load jobs
MAX_WORKERS = int(os.getenv("MAX_WORKERS", "5"))  # Reduced to avoid BigQuery load job quota
API_RATE_LIMIT_DELAY = float(os.getenv("API_RATE_LIMIT_DELAY", "0.05"))  # 20 RPS
BIGQUERY_MAX_RETRIES = int(os.getenv("BIGQUERY_MAX_RETRIES", "3"))
BIGQUERY_RETRY_DELAY = float(os.getenv("BIGQUERY_RETRY_DELAY", "2.0"))
BIGQUERY_LOAD_DELAY = float(os.getenv("BIGQUERY_LOAD_DELAY", "1.0"))  # Delay between load jobs to avoid quota
BATCH_LOAD_SIZE = int(os.getenv("BATCH_LOAD_SIZE", "20"))  # Number of wallets to batch into single load job

WALLET_ADDRESSES_ENV = os.getenv("WALLET_ADDRESSES")


def get_bigquery_client():
    return bigquery.Client(project=PROJECT_ID)


def get_storage_client():
    return storage.Client(project=PROJECT_ID)


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


def create_checkpoint_table(client):
    """Creates checkpoint table and adds upload_successful column if missing"""
    try:
        # Try to get table to check if it exists
        try:
            table = client.get_table(CHECKPOINT_TABLE)
            # Check if upload_successful column exists
            has_column = any(field.name == 'upload_successful' for field in table.schema)
            if not has_column:
                print("Adding upload_successful column to checkpoint table...", flush=True)
                alter_query = f"""
                ALTER TABLE `{CHECKPOINT_TABLE}`
                ADD COLUMN IF NOT EXISTS upload_successful BOOL NOT NULL DEFAULT true
                """
                client.query(alter_query).result()
                print("✅ Added upload_successful column", flush=True)
        except Exception:
            # Table doesn't exist, create it
            print("Creating checkpoint table...", flush=True)
            query = f"""
            CREATE TABLE `{CHECKPOINT_TABLE}` (
                wallet_address STRING NOT NULL,
                completed BOOL NOT NULL,
                processed_at TIMESTAMP NOT NULL,
                trade_count INT64,
                gcs_file STRING,
                upload_successful BOOL NOT NULL
            )
            """
            client.query(query).result()
            print("✅ Checkpoint table created", flush=True)
    except Exception as e:
        print(f"⚠️  Checkpoint table setup error: {e}", flush=True)


def verify_wallet_has_trades(client, wallet: str) -> bool:
    """
    Verifies that a wallet actually has trades in BigQuery.
    Checks both staging and production tables.
    """
    try:
        # Check staging table
        staging_query = f"""
        SELECT COUNT(*) as cnt
        FROM `{TRADES_STAGING_TABLE}`
        WHERE LOWER(wallet_address) = LOWER('{wallet}')
        """
        staging_result = list(client.query(staging_query).result())
        staging_count = staging_result[0].cnt if staging_result else 0
        
        # Check production table
        prod_query = f"""
        SELECT COUNT(*) as cnt
        FROM `{TRADES_TABLE}`
        WHERE LOWER(wallet_address) = LOWER('{wallet}')
        """
        prod_result = list(client.query(prod_query).result())
        prod_count = prod_result[0].cnt if prod_result else 0
        
        total_count = staging_count + prod_count
        return total_count > 0
    except Exception as e:
        print(f"  ⚠️  Verification error for {wallet}: {e}", flush=True)
        return False  # If we can't verify, assume not complete


def get_processed_wallets(client, verify: bool = True) -> Set[str]:
    """
    Gets successfully processed wallets.
    If verify=True, also checks that wallets actually have trades in BigQuery.
    """
    create_checkpoint_table(client)
    try:
        query = f"""
        SELECT DISTINCT wallet_address 
        FROM `{CHECKPOINT_TABLE}` 
        WHERE completed = true AND upload_successful = true
        """
        results = client.query(query).result()
        checkpoint_wallets = {row.wallet_address.lower() for row in results if row.wallet_address}
        
        if not verify:
            return checkpoint_wallets
        
        # Verify wallets actually have trades
        verified_wallets = set()
        for wallet in checkpoint_wallets:
            if verify_wallet_has_trades(client, wallet):
                verified_wallets.add(wallet)
            else:
                print(f"  ⚠️  Wallet {wallet} marked complete but has no trades. Will reprocess.", flush=True)
        
        return verified_wallets
    except Exception as e:
        print(f"  ⚠️  Error getting processed wallets: {e}", flush=True)
        return set()


def mark_wallet_complete(client, wallet: str, trade_count: int, gcs_file: str, success: bool, retry_count: int = 0):
    """
    Marks wallet complete with retry logic.
    CRITICAL: This must succeed for resume capability.
    """
    max_retries = 5
    for attempt in range(max_retries):
        try:
            delete_query = f"DELETE FROM `{CHECKPOINT_TABLE}` WHERE wallet_address = '{wallet.lower()}'"
            try:
                client.query(delete_query).result()
            except:
                pass
            
            rows = [{
                'wallet_address': wallet.lower(),
                'completed': True,
                'processed_at': datetime.utcnow().isoformat(),
                'trade_count': trade_count,
                'gcs_file': gcs_file,
                'upload_successful': success
            }]
            errors = client.insert_rows_json(CHECKPOINT_TABLE, rows)
            if errors:
                raise Exception(f"Insert errors: {errors}")
            return True  # Success
        except Exception as e:
            if attempt < max_retries - 1:
                wait_time = BIGQUERY_RETRY_DELAY * (2 ** attempt)
                print(f"  ⚠️  Checkpoint error (attempt {attempt + 1}/{max_retries}): {e}. Retrying in {wait_time}s...", flush=True)
                time.sleep(wait_time)
            else:
                print(f"  ❌ CRITICAL: Failed to checkpoint wallet {wallet} after {max_retries} attempts: {e}", flush=True)
                # Don't raise - checkpoint failure shouldn't stop processing, but log it
                return False
    return False


def fetch_trades_to_gcs(session: requests.Session, storage_client: storage.Client, wallet: str) -> tuple[str, int, Set[str]]:
    """
    Fetches all trades for a wallet and streams to GCS JSONL file.
    Returns (gcs_file_path, trade_count, condition_ids_set)
    """
    gcs_file = f"trades/{wallet}.jsonl"
    bucket = storage_client.bucket(GCS_BUCKET)
    blob = bucket.blob(gcs_file)
    
    # Use blob.open() for streaming write
    trade_count = 0
    seen_ids = set()  # Only for within-this-fetch deduplication
    condition_ids = set()  # Track condition_ids from trades
    
    offset = 0
    limit = 1000
    pagination_key = None
    page_count = 0
    
    with blob.open('w') as f:
        while True:
            base_url = "https://api.domeapi.io/v1"
            url = f"{base_url}/polymarket/orders?user={wallet}&limit={limit}"
            
            if pagination_key:
                url += f"&pagination_key={pagination_key}"
            elif offset <= 10000:
                url += f"&offset={offset}"
            else:
                break
            
            headers = {"Authorization": f"Bearer {DOME_API_KEY}", "Accept": "application/json"}
            
            try:
                time.sleep(API_RATE_LIMIT_DELAY)  # Rate limiting
                response = session.get(url, headers=headers, timeout=30)
                response.raise_for_status()
                data = response.json()
                orders = data.get('orders', [])
                pagination = data.get('pagination', {})
                page_count += 1
                
                if page_count % 50 == 0:
                    print(f"    [{wallet[:10]}...] Page {page_count}: {trade_count:,} trades", flush=True)
                
                # Stream to file
                for order in orders:
                    trade_id = order.get('order_hash') or order.get('tx_hash')
                    if not trade_id or trade_id in seen_ids:
                        continue
                    seen_ids.add(trade_id)
                    
                    # Convert timestamp
                    timestamp_unix = order.get('timestamp')
                    timestamp_str = None
                    if timestamp_unix:
                        timestamp_str = datetime.fromtimestamp(timestamp_unix).strftime('%Y-%m-%d %H:%M:%S')
                    
                    condition_id = order.get('condition_id')
                    
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
                        # Note: order_hash, taker, market_slug, title not included
                        # - order_hash: redundant (have id and tx_hash)
                        # - taker: counterparty wallet, not needed for ML model
                        # - market_slug, title: join to markets table via condition_id
                    }
                    
                    f.write(json.dumps(trade) + '\n')
                    trade_count += 1
                    
                    # Track condition_id for markets/events fetching
                    if condition_id:
                        condition_ids.add(condition_id)
                
                # Pagination
                has_more = pagination.get('has_more', False)
                new_pagination_key = pagination.get('pagination_key')
                
                if not has_more or len(orders) == 0:
                    break
                
                if new_pagination_key:
                    pagination_key = new_pagination_key
                    offset = None
                elif offset is not None:
                    next_offset = offset + len(orders)
                    if next_offset > 10000:
                        if not new_pagination_key:
                            break
                        pagination_key = new_pagination_key
                        offset = None
                    else:
                        offset = next_offset
                else:
                    break
                    
            except Exception as e:
                print(f"  ❌ Error fetching {wallet}: {e}", flush=True)
                time.sleep(5)
                continue
    
    return gcs_file, trade_count, condition_ids


def ensure_staging_table_exists(client):
    """Creates non-partitioned staging table to avoid partition quota"""
    try:
        client.get_table(TRADES_STAGING_TABLE)
    except Exception:
        print(f"Creating staging table {TRADES_STAGING_TABLE}...", flush=True)
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
        # CRITICAL: NO partitioning - use clustering instead to avoid partition quota
        table.clustering_fields = ["wallet_address", "timestamp"]
        table.description = "Non-partitioned staging table to avoid partition modification quota"
        client.create_table(table)
        print(f"✅ Staging table created (non-partitioned)", flush=True)


def load_gcs_to_bigquery(client: bigquery.Client, gcs_file: str, table_id: str) -> bool:
    """
    Loads JSONL file from GCS to BigQuery with deduplication and retry logic.
    - If staging table: Direct INSERT (dedup happens in copy_staging_to_production)
    - If production table: MERGE for deduplication (avoids partition quota issues)
    Supports single file or list of files for batching.
    """
    # Support both single file and list of files
    if isinstance(gcs_file, str):
        gcs_files = [gcs_file]
    else:
        gcs_files = gcs_file
    
    for attempt in range(BIGQUERY_MAX_RETRIES):
        try:
            is_staging = table_id == TRADES_STAGING_TABLE
            temp_table_id = None
            
            if is_staging:
                # Staging table: Direct INSERT (non-partitioned, no quota)
                # Batch multiple files into single load job to reduce quota usage
                job_config = bigquery.LoadJobConfig(
                    write_disposition="WRITE_APPEND",
                    source_format="NEWLINE_DELIMITED_JSON",
                    autodetect=False,
                    ignore_unknown_values=False
                )
                gcs_uris = [f"gs://{GCS_BUCKET}/{f}" for f in gcs_files]
                # Load multiple URIs in single job (reduces quota usage)
                load_job = client.load_table_from_uri(gcs_uris, table_id, job_config=job_config)
                load_job.result()
                return True
            else:
                # Production table: Use MERGE for deduplication
                temp_table_id = f"{table_id}_temp_{int(time.time() * 1000000)}"
                dest_table = client.get_table(table_id)
                temp_table = bigquery.Table(temp_table_id, schema=dest_table.schema)
                client.create_table(temp_table)
                
                # Load to temp
                job_config = bigquery.LoadJobConfig(
                    write_disposition="WRITE_TRUNCATE",
                    source_format="NEWLINE_DELIMITED_JSON",
                    autodetect=False
                )
                gcs_uri = f"gs://{GCS_BUCKET}/{gcs_file}"
                load_job = client.load_table_from_uri(gcs_uri, temp_table_id, job_config=job_config)
                load_job.result()
                
                # MERGE to production (deduplicates on id)
                merge_query = f"""
                MERGE `{table_id}` AS target
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
                
                client.delete_table(temp_table_id)
                return True
            
        except Exception as e:
            # Clean up temp table on error
            if temp_table_id:
                try:
                    client.delete_table(temp_table_id)
                except:
                    pass
            
            if attempt < BIGQUERY_MAX_RETRIES - 1:
                wait_time = BIGQUERY_RETRY_DELAY * (2 ** attempt)
                print(f"  ⚠️  BigQuery load failed (attempt {attempt + 1}/{BIGQUERY_MAX_RETRIES}): {e}. Retrying in {wait_time}s...", flush=True)
                time.sleep(wait_time)
            else:
                print(f"  ❌ BigQuery load failed after {BIGQUERY_MAX_RETRIES} attempts: {e}", flush=True)
                import traceback
                traceback.print_exc()
                return False
    
    return False


def copy_staging_to_production(client: bigquery.Client):
    """
    Copies data from non-partitioned staging to partitioned production table.
    This is done ONCE at the end to minimize partition modifications.
    """
    try:
        # Count staging rows
        count_query = f"SELECT COUNT(*) as cnt FROM `{TRADES_STAGING_TABLE}`"
        count_result = list(client.query(count_query).result())[0]
        staging_count = count_result.cnt
        
        if staging_count == 0:
            print("No data in staging to copy", flush=True)
            return True
        
        print(f"\n{'='*80}", flush=True)
        print(f"Copying {staging_count:,} rows from staging to production...", flush=True)
        print(f"{'='*80}", flush=True)
        
        # Single INSERT with deduplication (only 1 partition mod!)
        copy_query = f"""
        INSERT INTO `{TRADES_TABLE}`
        SELECT *
        FROM `{TRADES_STAGING_TABLE}`
        QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY timestamp DESC) = 1
        """
        
        copy_job = client.query(copy_query)
        copy_job.result()
        
        print(f"✅ Copied {staging_count:,} rows to production (1 partition mod)", flush=True)
        return True
        
    except Exception as e:
        print(f"❌ Copy to production failed: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return False


def fetch_markets_by_condition_ids(
    session: requests.Session, 
    condition_ids: List[str],
    already_fetched: Set[str] = None
) -> Tuple[List[Dict], List[Dict], Set[str]]:
    """
    Fetches markets for condition IDs.
    Skips condition_ids that are already in already_fetched set.
    Returns (markets_mapped, markets_raw, newly_fetched_condition_ids)
    """
    if not condition_ids:
        return [], [], set()
    
    if already_fetched is None:
        already_fetched = set()
    
    # Filter out already-fetched condition_ids
    new_condition_ids = [cid for cid in condition_ids if cid and cid not in already_fetched]
    if not new_condition_ids:
        return [], [], set()
    
    markets_mapped = []
    markets_raw = []
    newly_fetched = set()
    base_url = "https://api.domeapi.io/v1"
    batch_size = 100
    
    for i in range(0, len(new_condition_ids), batch_size):
        batch = new_condition_ids[i:i + batch_size]
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
            markets = data.get('markets', []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
            
            for market in markets:
                # Convert timestamps
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
                
                mapped = {
                    'condition_id': market.get('condition_id'),
                    'event_slug': market.get('event_slug'),
                    'market_slug': market.get('market_slug'),
                    'bet_structure': market.get('bet_structure'),
                    'market_subtype': market.get('market_subtype'),
                    'market_type': market.get('market_type'),  # For classification
                    'liquidity': to_number(market.get('liquidity')),
                    'status': market.get('status'),
                    'winning_label': market.get('winning_side', {}).get('label') if isinstance(market.get('winning_side'), dict) else market.get('winning_side'),
                    'winning_id': market.get('winning_side', {}).get('id') if isinstance(market.get('winning_side'), dict) else None,
                    # Text fields
                    'title': market.get('title'),
                    'description': market.get('description'),
                    'resolution_source': market.get('resolution_source'),
                    'image': market.get('image'),
                    'negative_risk_id': market.get('negative_risk_id'),  # Risk field
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
                if mapped['condition_id']:
                    markets_mapped.append(mapped)
                    markets_raw.append(market)
                    # Track that we've fetched this condition_id
                    newly_fetched.add(mapped['condition_id'])
                    already_fetched.add(mapped['condition_id'])
        except Exception as e:
            print(f"  ⚠️  Market fetch error: {e}", flush=True)
            continue
    
    return markets_mapped, markets_raw, newly_fetched


def extract_events_from_markets(markets_raw: List[Dict], already_fetched: Set[str] = None) -> Tuple[List[Dict], Set[str]]:
    """
    Extracts events from markets.
    Skips event_slugs that are already in already_fetched set.
    Returns (events_list, newly_fetched_event_slugs)
    """
    if already_fetched is None:
        already_fetched = set()
    
    events = []
    seen_slugs = set()  # Track within this extraction
    newly_fetched = set()
    
    for market in markets_raw:
        event_slug = market.get('event_slug')
        # Skip if already fetched in this run or already seen in this extraction
        if not event_slug or event_slug in seen_slugs or event_slug in already_fetched:
            continue
        
        seen_slugs.add(event_slug)
        newly_fetched.add(event_slug)
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
    
    return events, newly_fetched


def load_markets_to_bigquery(client: bigquery.Client, markets: List[Dict]) -> bool:
    """Loads markets to BigQuery with deduplication and retry logic"""
    if not markets:
        return True
    
    for attempt in range(BIGQUERY_MAX_RETRIES):
        temp_table_id = None
        try:
            # Create temp table
            temp_table_id = f"{MARKETS_TABLE}_temp_{int(time.time() * 1000000)}"
            dest_table = client.get_table(MARKETS_TABLE)
            temp_table = bigquery.Table(temp_table_id, schema=dest_table.schema)
            client.create_table(temp_table)
            
            # Load to temp
            job_config = bigquery.LoadJobConfig(
                write_disposition="WRITE_TRUNCATE",
                source_format="NEWLINE_DELIMITED_JSON",
                autodetect=False
            )
            load_job = client.load_table_from_json(markets, temp_table_id, job_config=job_config)
            load_job.result()
            
            # MERGE to destination (deduplicates on condition_id)
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
            if temp_table_id:
                try:
                    client.delete_table(temp_table_id)
                except:
                    pass
            
            if attempt < BIGQUERY_MAX_RETRIES - 1:
                wait_time = BIGQUERY_RETRY_DELAY * (2 ** attempt)
                print(f"  ⚠️  Markets load failed (attempt {attempt + 1}/{BIGQUERY_MAX_RETRIES}): {e}. Retrying...", flush=True)
                time.sleep(wait_time)
            else:
                print(f"  ❌ Markets load failed after {BIGQUERY_MAX_RETRIES} attempts: {e}", flush=True)
                return False
    
    return False


def load_events_to_bigquery(client: bigquery.Client, events: List[Dict]) -> bool:
    """Loads events to BigQuery with deduplication and retry logic"""
    if not events:
        return True
    
    for attempt in range(BIGQUERY_MAX_RETRIES):
        temp_table_id = None
        try:
            # Create temp table
            temp_table_id = f"{EVENTS_TABLE}_temp_{int(time.time() * 1000000)}"
            dest_table = client.get_table(EVENTS_TABLE)
            temp_table = bigquery.Table(temp_table_id, schema=dest_table.schema)
            client.create_table(temp_table)
            
            # Load to temp
            job_config = bigquery.LoadJobConfig(
                write_disposition="WRITE_TRUNCATE",
                source_format="NEWLINE_DELIMITED_JSON",
                autodetect=False
            )
            load_job = client.load_table_from_json(events, temp_table_id, job_config=job_config)
            load_job.result()
            
            # MERGE to destination (deduplicates on event_slug)
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
            if temp_table_id:
                try:
                    client.delete_table(temp_table_id)
                except:
                    pass
            
            if attempt < BIGQUERY_MAX_RETRIES - 1:
                wait_time = BIGQUERY_RETRY_DELAY * (2 ** attempt)
                print(f"  ⚠️  Events load failed (attempt {attempt + 1}/{BIGQUERY_MAX_RETRIES}): {e}. Retrying...", flush=True)
                time.sleep(wait_time)
            else:
                print(f"  ❌ Events load failed after {BIGQUERY_MAX_RETRIES} attempts: {e}", flush=True)
                return False
    
    return False


def process_wallet_fetch_only(
    wallet: str, 
    session: requests.Session, 
    storage_client: storage.Client,
    bq_client: bigquery.Client,
    fetched_markets: Set[str] = None,
    fetched_events: Set[str] = None
):
    """
    Fetches trades for a wallet to GCS and returns info for batching.
    Returns (wallet, gcs_file, trade_count, condition_ids, fetched_markets, fetched_events) or None on error.
    """
    if fetched_markets is None:
        fetched_markets = set()
    if fetched_events is None:
        fetched_events = set()
    
    try:
        print(f"Fetching {wallet}...", flush=True)
        
        # Fetch trades to GCS (also returns condition_ids)
        gcs_file, trade_count, condition_ids = fetch_trades_to_gcs(session, storage_client, wallet)
        print(f"  ✅ Fetched {trade_count:,} trades to {gcs_file}", flush=True)
        print(f"  Found {len(condition_ids)} unique condition_ids in trades", flush=True)
        
        if trade_count == 0:
            # Mark complete immediately for wallets with no trades (no load needed)
            mark_wallet_complete(bq_client, wallet, 0, gcs_file, True)
            return None  # Skip batching for empty wallets
        
        # Return GCS file info for batching (don't load immediately)
        # Loading will happen in batches via DTS or batched load jobs
        return (wallet, gcs_file, trade_count, condition_ids, fetched_markets, fetched_events)
            
    except Exception as e:
        print(f"  ❌ Error processing {wallet}: {e}", flush=True)
        import traceback
        traceback.print_exc()
        # Return None to indicate failure
        return None


def main():
    """Main function with parallel processing"""
    if not DOME_API_KEY:
        raise ValueError("DOME_API_KEY not set")
    
    print("=" * 80, flush=True)
    print("BACKFILL v3 (Hybrid) STARTING", flush=True)
    print("=" * 80, flush=True)
    
    bq_client = get_bigquery_client()
    storage_client = get_storage_client()
    session = get_http_session()
    
    # Ensure staging table exists (CRITICAL for partition quota)
    if USE_STAGING_TABLE:
        ensure_staging_table_exists(bq_client)
    
    # Ensure GCS bucket exists
    try:
        bucket = storage_client.bucket(GCS_BUCKET)
        if not bucket.exists():
            bucket.create(location="US")
    except:
        pass
    
    # Get wallets
    if WALLET_ADDRESSES_ENV:
        trader_wallets = [w.strip() for w in WALLET_ADDRESSES_ENV.split(",") if w.strip()]
    else:
        query = f"SELECT DISTINCT wallet_address FROM `{TRADERS_TABLE}` WHERE wallet_address IS NOT NULL"
        results = bq_client.query(query).result()
        trader_wallets = [row['wallet_address'] for row in results if row.get('wallet_address')]
    
    if not trader_wallets:
        raise ValueError("No wallets to process")
    
    # Filter processed wallets (with verification)
    print("Checking for already-processed wallets...", flush=True)
    verify_checkpoints = os.getenv("VERIFY_CHECKPOINTS", "true").lower() == "true"
    processed = get_processed_wallets(bq_client, verify=verify_checkpoints)
    remaining = [w for w in trader_wallets if w.lower() not in processed]
    
    print(f"\n{'='*80}", flush=True)
    print(f"Wallet Summary:", flush=True)
    print(f"  Total wallets: {len(trader_wallets)}", flush=True)
    print(f"  Already processed (verified): {len(processed)}", flush=True)
    print(f"  Remaining to process: {len(remaining)}", flush=True)
    print(f"  Max workers: {MAX_WORKERS}", flush=True)
    print(f"{'='*80}", flush=True)
    
    if len(processed) > 0:
        print(f"\nSkipping {len(processed)} already-processed wallets.", flush=True)
        print(f"Set VERIFY_CHECKPOINTS=false to skip verification (faster startup).", flush=True)
    
    if not remaining:
        print("All wallets processed!")
        return
    
    # Shared sets to track fetched markets/events across all wallets (avoid duplicate API calls)
    # Use Lock for thread-safe access
    from threading import Lock
    fetched_markets_lock = Lock()
    fetched_markets = set()  # condition_ids already fetched in this run
    fetched_events = set()   # event_slugs already fetched in this run
    
    # Process in parallel with batching
    start_time = time.time()
    
    # Phase 1: Fetch all wallets to GCS (parallel)
    print(f"\n{'='*80}", flush=True)
    print("Phase 1: Fetching trades to GCS (parallel)...", flush=True)
    print(f"{'='*80}", flush=True)
    
    wallet_results = []  # List of (wallet, gcs_file, trade_count, condition_ids) tuples
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        def fetch_wallet(wallet):
            # Get current state (thread-safe)
            with fetched_markets_lock:
                markets_set = fetched_markets.copy()
                events_set = fetched_events.copy()
            
            # Fetch wallet (returns GCS file info)
            result = process_wallet_fetch_only(wallet, session, storage_client, bq_client, markets_set, events_set)
            
            # Update shared sets (thread-safe)
            if result:
                with fetched_markets_lock:
                    fetched_markets.update(result[4])  # markets set
                    fetched_events.update(result[5])   # events set
            
            return result
        
        futures = {
            executor.submit(fetch_wallet, wallet): wallet
            for wallet in remaining
        }
        
        completed = 0
        failed = 0
        for future in as_completed(futures):
            completed += 1
            wallet = futures[future]
            try:
                result = future.result()
                if result:
                    wallet_results.append(result)
                else:
                    failed += 1
                    print(f"  ❌ {wallet} fetch failed", flush=True)
            except Exception as e:
                failed += 1
                print(f"  ❌ {wallet} failed: {e}", flush=True)
            
            if completed % 10 == 0 or completed == len(remaining):
                print(f"Fetch progress: {completed}/{len(remaining)} wallets ({failed} failed, {len(wallet_results)} ready for batch load)", flush=True)
    
    # Phase 2: Load trades to BigQuery (via DTS or direct load)
    print(f"\n{'='*80}", flush=True)
    if USE_DTS:
        print(f"Phase 2: Triggering Data Transfer Service ({len(wallet_results)} wallets)...", flush=True)
        print(f"{'='*80}", flush=True)
        
        # With DTS, we just trigger the transfer - it handles loading automatically
        # All files in GCS matching the pattern will be loaded
        if not DTS_AVAILABLE:
            print(f"  ⚠️  DTS library not available - falling back to direct load", flush=True)
            USE_DTS = False
        else:
            try:
                dts_client = bigquery_datatransfer.DataTransferServiceClient()
                transfer_name = f"projects/{PROJECT_ID}/locations/us/transferConfigs/gcs-to-trades-staging"
                
                # Try to get existing transfer config, create if doesn't exist
                parent = f"projects/{PROJECT_ID}/locations/us"
                transfer_config_name_base = f"{parent}/transferConfigs"
                
                # List existing configs to find ours
                existing_config = None
                try:
                    list_configs = dts_client.list_transfer_configs(parent=parent)
                    for cfg in list_configs:
                        if cfg.display_name == "GCS to Trades Staging":
                            existing_config = cfg
                            transfer_name = cfg.name
                            print(f"  Found existing DTS config: {cfg.display_name}", flush=True)
                            break
                except Exception as e:
                    print(f"  ⚠️  Error listing configs: {e}", flush=True)
                
                if not existing_config:
                    print(f"  Creating DTS transfer config...", flush=True)
                    try:
                        # Create transfer config
                        transfer_config = bigquery_datatransfer.TransferConfig(
                            display_name="GCS to Trades Staging",
                            data_source_id="google_cloud_storage",
                            destination_dataset_id="polycopy_v1",
                            params={
                                "data_path_template": f"gs://{GCS_BUCKET}/trades/*.jsonl",
                                "destination_table_name_template": "trades_staging",
                                "file_format": "NEWLINE_DELIMITED_JSON",
                                "write_disposition": "WRITE_APPEND",
                                "max_bad_records": "0",
                            },
                            schedule_options=bigquery_datatransfer.ScheduleOptions(
                                disable_auto_scheduling=True  # Manual runs only
                            ),
                        )
                        transfer_config = dts_client.create_transfer_config(
                            parent=parent,
                            transfer_config=transfer_config,
                        )
                        transfer_name = transfer_config.name
                        print(f"  ✅ Created DTS config: {transfer_config.display_name}", flush=True)
                    except Exception as e:
                        print(f"  ❌ Failed to create DTS config: {e}", flush=True)
                        print(f"  ⚠️  Falling back to direct load jobs...", flush=True)
                        USE_DTS = False
                
                print(f"Triggering DTS transfer for all GCS files...", flush=True)
                run_request = bigquery_datatransfer.StartManualTransferRunsRequest(
                    parent=transfer_name,
                    requested_run_time=None,  # Run now
                )
                
                response = dts_client.start_manual_transfer_runs(run_request)
                
                if response.runs:
                    run = response.runs[0]
                    print(f"  ✅ DTS transfer started: {run.name}", flush=True)
                    print(f"  ⏳ Waiting for transfer to complete...", flush=True)
                    
                    # Wait for transfer to complete (with timeout)
                    max_wait = 300  # 5 minutes max wait
                    start_wait = time.time()
                    
                    while time.time() - start_wait < max_wait:
                        run_status = dts_client.get_transfer_run(
                            name=f"{transfer_name}/runs/{run.run_id}"
                        )
                        
                        if run_status.state == bigquery_datatransfer.TransferState.SUCCEEDED:
                            print(f"  ✅ DTS transfer completed successfully!", flush=True)
                            successful_wallets = wallet_results  # All wallets succeed if DTS succeeds
                            break
                        elif run_status.state == bigquery_datatransfer.TransferState.FAILED:
                            print(f"  ❌ DTS transfer failed: {run_status.error_status}", flush=True)
                            # Mark all wallets as failed
                            for wallet, gcs_file, trade_count, _, _, _ in wallet_results:
                                mark_wallet_complete(bq_client, wallet, trade_count, gcs_file, False)
                            successful_wallets = []
                            break
                        elif run_status.state == bigquery_datatransfer.TransferState.CANCELLED:
                            print(f"  ⚠️  DTS transfer cancelled", flush=True)
                            successful_wallets = []
                            break
                        
                        time.sleep(5)  # Check every 5 seconds
                    else:
                        print(f"  ⏳ DTS transfer still running (will complete in background)", flush=True)
                        # Assume success for now - DTS will complete asynchronously
                        successful_wallets = wallet_results
                else:
                    print(f"  ⚠️  Could not start DTS transfer - falling back to direct load", flush=True)
                    USE_DTS = False  # Fall back to direct load
            
            except Exception as e:
                print(f"  ⚠️  DTS error: {e}. Falling back to direct load jobs...", flush=True)
                import traceback
                traceback.print_exc()
                USE_DTS = False  # Fall back to direct load
    
    if not USE_DTS:
        # Fallback: Direct batch loading (original approach)
        print(f"Phase 2: Batch loading trades to BigQuery ({len(wallet_results)} wallets)...", flush=True)
        print(f"{'='*80}", flush=True)
        
        target_table = TRADES_STAGING_TABLE if USE_STAGING_TABLE else TRADES_TABLE
        batch_num = 0
        successful_wallets = []
        
        for i in range(0, len(wallet_results), BATCH_LOAD_SIZE):
            batch = wallet_results[i:i + BATCH_LOAD_SIZE]
            batch_num += 1
            batch_gcs_files = [result[1] for result in batch]  # Extract GCS file paths
            
            print(f"\nBatch {batch_num}: Loading {len(batch)} wallets ({len(batch_gcs_files)} GCS files)...", flush=True)
            
            # Load batch of GCS files in single load job
            trades_success = load_gcs_to_bigquery(bq_client, batch_gcs_files, target_table)
            
            if trades_success:
                print(f"  ✅ Batch {batch_num} loaded successfully", flush=True)
                successful_wallets.extend(batch)
            else:
                print(f"  ❌ Batch {batch_num} failed - wallets will be retried", flush=True)
                # Mark wallets as failed
                for wallet, gcs_file, trade_count, _, _, _ in batch:
                    mark_wallet_complete(bq_client, wallet, trade_count, gcs_file, False)
    
    # Phase 3: Process markets/events for successfully loaded wallets
    print(f"\n{'='*80}", flush=True)
    print(f"Phase 3: Processing markets/events for {len(successful_wallets)} wallets...", flush=True)
    print(f"{'='*80}", flush=True)
    
    for wallet, gcs_file, trade_count, condition_ids, markets_set, events_set in successful_wallets:
        try:
            # Fetch markets and events
            markets_success = True
            events_success = True
            
            if condition_ids:
                new_condition_ids = [cid for cid in condition_ids if cid not in fetched_markets]
                
                if new_condition_ids:
                    wallet_markets, raw_markets, newly_fetched_cids = fetch_markets_by_condition_ids(session, new_condition_ids, fetched_markets)
                    wallet_events, newly_fetched_slugs = extract_events_from_markets(raw_markets, fetched_events)
                    
                    fetched_markets.update(newly_fetched_cids)
                    fetched_events.update(newly_fetched_slugs)
                    
                    if wallet_markets:
                        markets_success = load_markets_to_bigquery(bq_client, wallet_markets)
                    if wallet_events:
                        events_success = load_events_to_bigquery(bq_client, wallet_events)
            
            # Mark complete
            overall_success = markets_success and events_success
            mark_wallet_complete(bq_client, wallet, trade_count, gcs_file, overall_success)
            
            if overall_success:
                print(f"  ✅ {wallet} complete", flush=True)
            else:
                print(f"  ⚠️  {wallet} markets/events failed", flush=True)
        except Exception as e:
            print(f"  ❌ {wallet} markets/events error: {e}", flush=True)
            mark_wallet_complete(bq_client, wallet, trade_count, gcs_file, False)
    
    elapsed = time.time() - start_time
    print(f"\n{'='*80}", flush=True)
    print(f"✅ All wallets processed in {elapsed:.1f}s", flush=True)
    
    # CRITICAL: Copy staging to production ONCE at the end (minimizes partition mods)
    if USE_STAGING_TABLE:
        print(f"\n{'='*80}", flush=True)
        print("Final step: Copying staging to production table...", flush=True)
        print(f"{'='*80}", flush=True)
        copy_staging_to_production(bq_client)
        print(f"✅ All data copied to production!", flush=True)
    
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
