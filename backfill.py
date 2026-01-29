import os
import time
import sys
import json
import requests
from datetime import datetime
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Force unbuffered output for Cloud Run logs - CRITICAL for immediate log visibility
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# Print immediately to verify script is starting
print("=" * 80, flush=True)
print("BACKFILL SCRIPT STARTING", flush=True)
print("=" * 80, flush=True)
print(f"Python executable: {sys.executable}", flush=True)
print(f"Python version: {sys.version}", flush=True)
print(f"Working directory: {os.getcwd()}", flush=True)
print(f"Environment variables check:", flush=True)
print(f"  DOME_API_KEY: {'SET' if os.getenv('DOME_API_KEY') else 'NOT SET'}", flush=True)
print(f"  PROJECT_ID: {os.getenv('PROJECT_ID', 'NOT SET')}", flush=True)

# Import BigQuery after initial logging
try:
    print("Importing google.cloud.bigquery...", flush=True)
    from google.cloud import bigquery
    print("BigQuery imported successfully", flush=True)
except Exception as e:
    print(f"ERROR importing BigQuery: {e}", flush=True)
    sys.exit(1)

# --- CONFIGURATION ---
PROJECT_ID = "gen-lang-client-0299056258"
DOME_API_KEY = os.getenv("DOME_API_KEY")

TRADERS_TABLE = f"{PROJECT_ID}.polycopy_v1.traders"
EVENTS_TABLE = f"{PROJECT_ID}.polycopy_v1.events"
MARKETS_TABLE = f"{PROJECT_ID}.polycopy_v1.markets"
TRADES_TABLE = f"{PROJECT_ID}.polycopy_v1.trades"
TRADES_STAGING_TABLE = f"{PROJECT_ID}.polycopy_v1.trades_staging"  # Non-partitioned staging table
CHECKPOINT_TABLE = f"{PROJECT_ID}.polycopy_v1.backfill_checkpoint"

# Use staging table to avoid partition modification quota
USE_STAGING_TABLE = os.getenv("USE_STAGING_TABLE", "true").lower() == "true"

# Performance tuning
API_RATE_LIMIT_DELAY = float(os.getenv("API_RATE_LIMIT_DELAY", "0.1"))  # Reduced from 0.5s
BATCH_UPLOAD_SIZE = int(os.getenv("BATCH_UPLOAD_SIZE", "100"))  # Upload after N wallets (increased significantly to reduce partition mods)
LARGE_WALLET_THRESHOLD = int(os.getenv("LARGE_WALLET_THRESHOLD", "50000"))  # Upload immediately if wallet has > N trades (increased)
IN_MEMORY_CHUNK_SIZE = int(os.getenv("IN_MEMORY_CHUNK_SIZE", "500000"))  # Upload chunk if memory gets too large (increased significantly)
BIGQUERY_UPLOAD_DELAY = float(os.getenv("BIGQUERY_UPLOAD_DELAY", "30.0"))  # Delay between BigQuery uploads to avoid quota (increased to 30s)
BIGQUERY_CHUNK_SIZE = int(os.getenv("BIGQUERY_CHUNK_SIZE", "50000"))  # Chunk size for very large uploads (50K rows per chunk - reduced to minimize partition mods)
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 2  # Exponential backoff base

# Optional: Provide wallet addresses via environment variable (comma-separated)
# If set, this will be used instead of querying the traders table
WALLET_ADDRESSES_ENV = os.getenv("WALLET_ADDRESSES")  # e.g., "0x123...,0x456..."

def get_bigquery_client():
    """Initializes BigQuery client using Application Default Credentials."""
    print(f"Creating BigQuery client for project: {PROJECT_ID}", flush=True)
    try:
        client = bigquery.Client(project=PROJECT_ID)
        print("BigQuery client created successfully", flush=True)
        return client
    except Exception as e:
        print(f"ERROR: Failed to create BigQuery client: {e}", flush=True)
        raise

def get_http_session():
    """Creates a requests session with connection pooling and retry logic."""
    session = requests.Session()
    
    # Retry strategy with exponential backoff
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

def get_existing_ids(client, table_id, column_name):
    """Fetches all existing IDs from a table to prevent duplicates."""
    print(f"Fetching existing IDs from {table_id}...", flush=True)
    try:
        query = f"SELECT DISTINCT {column_name} FROM `{table_id}`"
        print(f"  Executing query: {query[:100]}...", flush=True)
        query_job = client.query(query)
        results = query_job.result()
        ids = {row[column_name] for row in results}
        print(f"  Found {len(ids)} existing IDs", flush=True)
        return ids
    except Exception as e:
        print(f"  Table {table_id} not found or empty: {e}. Starting fresh.", flush=True)
        return set()

def get_processed_wallets(client):
    """Gets list of wallets that have already been fully processed."""
    print(f"Checking for previously processed wallets...")
    try:
        # Create checkpoint table if it doesn't exist
        create_checkpoint_table(client)
        
        query = f"SELECT DISTINCT wallet_address FROM `{CHECKPOINT_TABLE}` WHERE completed = true"
        results = client.query(query).result()
        processed = {row.wallet_address.lower() for row in results if row.wallet_address}
        print(f"Found {len(processed)} previously processed wallets.")
        return processed
    except Exception as e:
        print(f"Could not check checkpoint table: {e}. Starting fresh.")
        return set()

def create_checkpoint_table(client):
    """Creates checkpoint table if it doesn't exist."""
    try:
        query = f"""
        CREATE TABLE IF NOT EXISTS `{CHECKPOINT_TABLE}` (
            wallet_address STRING NOT NULL,
            completed BOOL NOT NULL,
            processed_at TIMESTAMP NOT NULL,
            trade_count INT64
        )
        """
        client.query(query).result()
    except Exception:
        pass  # Table might already exist

def mark_wallet_complete(client, wallet_address, trade_count):
    """Marks a wallet as completed in the checkpoint table."""
    try:
        # Delete any existing entry for this wallet (in case of re-run)
        delete_query = f"DELETE FROM `{CHECKPOINT_TABLE}` WHERE wallet_address = '{wallet_address.lower()}'"
        try:
            client.query(delete_query).result()
        except:
            pass
        
        # Insert new checkpoint entry
        rows = [{
            'wallet_address': wallet_address.lower(),
            'completed': True,
            'processed_at': datetime.utcnow().isoformat(),
            'trade_count': trade_count
        }]
        errors = client.insert_rows_json(CHECKPOINT_TABLE, rows)
        if errors:
            print(f"Warning: Could not update checkpoint: {errors}")
    except Exception as e:
        print(f"Warning: Could not update checkpoint: {e}")

def fetch_markets_by_condition_ids(session, condition_ids, existing_market_ids):
    """
    Fetches markets from Dome API /polymarket/markets endpoint.
    Can batch up to 100 condition_ids per request.
    Returns tuple: (mapped_markets_list, raw_markets_list)
    """
    if not condition_ids:
        return [], []
    
    # Filter out already-fetched markets
    new_condition_ids = [cid for cid in condition_ids if cid and cid not in existing_market_ids]
    if not new_condition_ids:
        return [], []
    
    all_markets_mapped = []
    all_markets_raw = []
    base_url = "https://api.domeapi.io/v1"
    
    # Batch in chunks of 100 (API limit)
    batch_size = 100
    for i in range(0, len(new_condition_ids), batch_size):
        batch = new_condition_ids[i:i + batch_size]
        
        # Build URL with multiple condition_id params (Dome API accepts multiple)
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
            
            # Handle both {markets: [...]} and [...] response formats
            markets = data.get('markets', []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
            
            for market in markets:
                mapped_market = map_market_to_bigquery(market)
                if mapped_market:
                    all_markets_mapped.append(mapped_market)
                    all_markets_raw.append(market)  # Keep raw for event extraction
                    existing_market_ids.add(market.get('condition_id'))
            
            # Rate limiting
            if API_RATE_LIMIT_DELAY > 0:
                time.sleep(API_RATE_LIMIT_DELAY)
                
        except requests.RequestException as e:
            print(f"  Warning: Failed to fetch markets batch: {e}", flush=True)
            continue
    
    return all_markets_mapped, all_markets_raw

def map_market_to_bigquery(market):
    """
    Maps Dome API market response to BigQuery markets schema.
    BigQuery schema: condition_id, event_slug, market_slug, bet_structure, 
    market_subtype, liquidity, status, winning_label, winning_id, last_updated
    """
    condition_id = market.get('condition_id')
    if not condition_id:
        return None
    
    # Convert timestamps if needed
    def to_timestamp(unix_seconds):
        if unix_seconds and isinstance(unix_seconds, (int, float)):
            dt = datetime.fromtimestamp(unix_seconds)
            return dt.strftime('%Y-%m-%d %H:%M:%S')
        return None
    
    return {
        'condition_id': condition_id,
        'event_slug': market.get('event_slug'),
        'market_slug': market.get('market_slug'),
        'bet_structure': market.get('bet_structure'),  # May not be in Dome response
        'market_subtype': market.get('market_subtype'),  # May not be in Dome response
        'liquidity': float(market.get('liquidity')) if market.get('liquidity') is not None else None,
        'status': market.get('status'),
        'winning_label': market.get('winning_side', {}).get('label') if isinstance(market.get('winning_side'), dict) else market.get('winning_side'),
        'winning_id': market.get('winning_side', {}).get('id') if isinstance(market.get('winning_side'), dict) else None,
        # last_updated is auto-generated by BigQuery
    }

def extract_events_from_markets(markets_raw, existing_event_slugs):
    """
    Extracts events from markets and maps to BigQuery events schema.
    BigQuery schema: event_slug, title, category, tags, start_time, end_time, created_at
    
    Args:
        markets_raw: List of raw market dicts from Dome API
        existing_event_slugs: Set of event_slugs that already exist in BigQuery
    """
    events = []
    seen_event_slugs = set()
    
    for market in markets_raw:
        event_slug = market.get('event_slug')
        if not event_slug or event_slug in existing_event_slugs or event_slug in seen_event_slugs:
            continue
        
        seen_event_slugs.add(event_slug)
        
        # Extract category from tags (first tag is often the category)
        tags = market.get('tags', [])
        category = tags[0] if isinstance(tags, list) and len(tags) > 0 else None
        
        # Convert timestamps
        def to_timestamp(unix_seconds):
            if unix_seconds and isinstance(unix_seconds, (int, float)):
                dt = datetime.fromtimestamp(unix_seconds)
                return dt.strftime('%Y-%m-%d %H:%M:%S')
            return None
        
        event = {
            'event_slug': event_slug,
            'title': market.get('title'),  # Market title, may need event-specific title
            'category': category,
            'tags': json.dumps(tags) if tags else None,  # BigQuery expects JSON string
            'start_time': to_timestamp(market.get('start_time')),
            'end_time': to_timestamp(market.get('end_time')),
            # created_at is auto-generated by BigQuery
        }
        events.append(event)
    
    return events

def ensure_staging_table_exists(client):
    """Creates the staging table if it doesn't exist."""
    try:
        client.get_table(TRADES_STAGING_TABLE)
        print(f"Staging table {TRADES_STAGING_TABLE} already exists", flush=True)
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
        # Use clustering instead of partitioning to avoid quota
        table.clustering_fields = ["wallet_address", "timestamp"]
        table.description = "Staging table for backfill. No partitioning to avoid quota limits."
        client.create_table(table)
        print(f"✅ Staging table created", flush=True)

def copy_staging_to_production(client, batch_size=1000000):
    """
    Copies data from staging table to production partitioned table.
    Uses INSERT INTO which counts as partition mods, but fewer operations.
    """
    print(f"\n{'='*80}", flush=True)
    print(f"Copying data from staging to production table...", flush=True)
    print(f"{'='*80}", flush=True)
    
    # Count rows in staging
    staging_count_query = f"SELECT COUNT(*) as cnt FROM `{TRADES_STAGING_TABLE}`"
    staging_count = list(client.query(staging_count_query).result())[0].cnt
    
    if staging_count == 0:
        print("No data in staging table to copy", flush=True)
        return
    
    print(f"Found {staging_count:,} rows in staging table", flush=True)
    
    # Copy in batches to minimize partition modifications
    # Use INSERT INTO which is more efficient than individual loads
    copy_query = f"""
    INSERT INTO `{TRADES_TABLE}`
    SELECT * FROM `{TRADES_STAGING_TABLE}`
    WHERE TRUE
    QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY timestamp DESC) = 1
    """
    
    print(f"Copying {staging_count:,} rows to production table...", flush=True)
    job = client.query(copy_query)
    job.result()
    
    print(f"✅ Copied {staging_count:,} rows to production table", flush=True)
    
    # Optionally clear staging table after successful copy
    # clear_query = f"TRUNCATE TABLE `{TRADES_STAGING_TABLE}`"
    # client.query(clear_query).result()
    # print(f"✅ Cleared staging table", flush=True)

def upload_to_bigquery(client, data, table_id, chunk_size=None):
    """
    Uploads a list of dictionaries to BigQuery via a load job.
    For very large datasets, chunks the upload to avoid quota limits.
    
    Args:
        client: BigQuery client
        data: List of dictionaries to upload
        table_id: Target table ID
        chunk_size: Maximum rows per chunk (None = upload all at once)
    """
    if not data:
        return
    
    # For very large datasets, chunk the uploads
    if chunk_size and len(data) > chunk_size:
        print(f"Large dataset detected ({len(data):,} rows). Chunking uploads into {chunk_size:,} row chunks...", flush=True)
        total_uploaded = 0
        for i in range(0, len(data), chunk_size):
            chunk = data[i:i + chunk_size]
            chunk_num = (i // chunk_size) + 1
            total_chunks = (len(data) + chunk_size - 1) // chunk_size
            print(f"  Uploading chunk {chunk_num}/{total_chunks} ({len(chunk):,} rows)...", flush=True)
            upload_to_bigquery(client, chunk, table_id, chunk_size=None)  # Recursive call without chunking
            total_uploaded += len(chunk)
        print(f"  Completed chunked upload: {total_uploaded:,} total rows", flush=True)
        return
    
    print(f"Uploading {len(data):,} rows to {table_id}...", flush=True)
    start_time = time.time()
    
    # Optimize job config for speed
    job_config = bigquery.LoadJobConfig(
        write_disposition="WRITE_APPEND",
        source_format="NEWLINE_DELIMITED_JSON",
        autodetect=False,  # Faster if schema is known
        ignore_unknown_values=False
    )
    
    job = client.load_table_from_json(data, table_id, job_config=job_config)
    job.result()  # Wait for completion
    
    elapsed = time.time() - start_time
    print(f"Upload to {table_id} complete in {elapsed:.2f}s ({len(data)/elapsed:.0f} rows/sec)", flush=True)
    
    # Add delay after BigQuery uploads to avoid partition modification quota limits
    # BigQuery has a daily limit on partition modifications for partitioned tables
    # Longer delays reduce the frequency of partition modifications
    if BIGQUERY_UPLOAD_DELAY > 0:
        print(f"  Waiting {BIGQUERY_UPLOAD_DELAY}s before next upload to avoid quota limits...", flush=True)
        time.sleep(BIGQUERY_UPLOAD_DELAY)

def main():
    """
    Main backfill function that processes trades from the Dome API.
    
    IMPORTANT: This script ONLY processes wallets that exist in the 
    polycopy_v1.traders table. It queries the traders table at startup
    and processes each wallet address found there.
    """
    if not DOME_API_KEY:
        raise ValueError("DOME_API_KEY environment variable not set.")

    print("\n" + "="*80, flush=True)
    print("STEP 1: Initializing BigQuery client...", flush=True)
    print("="*80, flush=True)
    client = get_bigquery_client()
    
    # Create staging table if using staging approach
    if USE_STAGING_TABLE and TRADES_TABLE in [TRADES_TABLE]:
        print("\n" + "="*80, flush=True)
        print("STEP 1.5: Setting up staging table (avoids partition quota)...", flush=True)
        print("="*80, flush=True)
        ensure_staging_table_exists(client)
    
    print("\n" + "="*80, flush=True)
    print("STEP 2: Initializing HTTP session...", flush=True)
    print("="*80, flush=True)
    session = get_http_session()  # Reusable HTTP session with connection pooling
    
    print("\n" + "="*80, flush=True)
    print("STEP 3: Loading existing data for deduplication...", flush=True)
    print("="*80, flush=True)
    existing_event_slugs = get_existing_ids(client, EVENTS_TABLE, "event_slug")
    existing_market_ids = get_existing_ids(client, MARKETS_TABLE, "condition_id")
    
    # CRITICAL: Load existing trade IDs to prevent duplicates
    print("Loading existing trade IDs for deduplication...", flush=True)
    existing_trade_ids = get_existing_ids(client, TRADES_STAGING_TABLE if USE_STAGING_TABLE else TRADES_TABLE, "id")
    print(f"Loaded {len(existing_trade_ids):,} existing trade IDs for deduplication.", flush=True)
    
    print(f"Loaded {len(existing_event_slugs)} existing events and {len(existing_market_ids)} existing markets.")
    
    # Get wallets that were already processed (for resume capability)
    processed_wallets = get_processed_wallets(client)
    
    # Fetch wallet addresses - either from env var or traders table
    if WALLET_ADDRESSES_ENV:
        trader_wallets = [w.strip() for w in WALLET_ADDRESSES_ENV.split(",") if w.strip()]
        print(f"Using {len(trader_wallets)} wallet addresses from WALLET_ADDRESSES environment variable.")
    else:
        print(f"Fetching wallet addresses from {TRADERS_TABLE}...")
        try:
            query_job = client.query(f"SELECT DISTINCT wallet_address FROM `{TRADERS_TABLE}` WHERE wallet_address IS NOT NULL")
            results = query_job.result()
            trader_wallets = [row['wallet_address'] for row in results if row.get('wallet_address')]
            
            if not trader_wallets:
                raise ValueError(f"No wallet addresses found in {TRADERS_TABLE}. Cannot proceed with backfill.")
            
            print(f"Found {len(trader_wallets)} unique wallet addresses from traders table to process.")
        except Exception as e:
            error_msg = f"Failed to fetch traders from {TRADERS_TABLE}: {e}"
            print(f"ERROR: {error_msg}")
            print(f"\nTo fix this, either:")
            print(f"1. Create the {TRADERS_TABLE} table in BigQuery with a 'wallet_address' column")
            print(f"2. Set the WALLET_ADDRESSES environment variable with comma-separated wallet addresses")
            raise RuntimeError(error_msg)
    
    if not trader_wallets:
        raise ValueError("No wallet addresses to process. Set WALLET_ADDRESSES env var or ensure traders table exists.")
    
    # Filter out already processed wallets
    trader_wallets_lower = {w.lower() for w in trader_wallets}
    remaining_wallets = [w for w in trader_wallets if w.lower() not in processed_wallets]
    skipped_count = len(trader_wallets) - len(remaining_wallets)
    
    print(f"\n{'='*60}")
    print(f"Resume Summary:")
    print(f"  Total wallets: {len(trader_wallets)}")
    print(f"  Already processed: {skipped_count}")
    print(f"  Remaining to process: {len(remaining_wallets)}")
    print(f"{'='*60}\n")
    
    if skipped_count > 0:
        print(f"Skipping {skipped_count} already-processed wallets. Resuming from where we left off...\n")
    
    trader_wallets = remaining_wallets
    
    if not trader_wallets:
        print("All wallets have already been processed!")
        return
    
    print(f"Processing {len(trader_wallets)} wallets.")
    print(f"Sample wallets: {trader_wallets[:5]}{'...' if len(trader_wallets) > 5 else ''}")
    print(f"\nConfiguration:")
    print(f"  - Large wallet threshold: {LARGE_WALLET_THRESHOLD:,} trades (uploads immediately)")
    print(f"  - Batch upload size: {BATCH_UPLOAD_SIZE} wallets")
    print(f"  - Memory chunk size: {IN_MEMORY_CHUNK_SIZE:,} trades")
    print(f"  - Resume capability: Enabled (skips already-processed wallets)")

    # Accumulate data across multiple wallets for batch uploads
    batch_trades = []
    batch_markets = []
    batch_events = []
    batch_wallets = []  # Track which wallets are in the current batch (wallet_address, trade_count)
    batch_newly_fetched_market_ids = set()  # Track markets we've fetched in this run
    
    start_time = time.time()
    total_trades_processed = 0

    for i, wallet in enumerate(trader_wallets):
        wallet_start = time.time()
        print(f"\n--- Processing Wallet {i+1}/{len(trader_wallets)}: {wallet} ---")
        
        wallet_trades = []
        wallet_condition_ids = set()  # Collect unique condition_ids from trades
        offset = 0
        limit = 1000  # Max limit per API docs
        pagination_key = None
        page_count = 0
        
        while True:
            # Use correct Dome API endpoint - /polymarket/orders with pagination
            base_url = "https://api.domeapi.io/v1"
            url = f"{base_url}/polymarket/orders?user={wallet}&limit={limit}"
            
            # CRITICAL: Safety check BEFORE constructing URL
            # API docs: offsets > 10K are deprecated, must use pagination_key
            # offset=10000 is the MAX allowed, offset=11000+ is rejected
            if offset is not None and offset > 10000:
                print(f"  ERROR: Invalid offset {offset} > 10000. API requires pagination_key for offsets > 10K. Stopping.", flush=True)
                break
            
            # Use pagination_key if available (required for offsets > 10K), otherwise use offset
            if pagination_key:
                url += f"&pagination_key={pagination_key}"
            elif offset is not None and offset <= 10000:
                url += f"&offset={offset}"
            else:
                # No valid pagination state - should not happen, but stop to avoid infinite loop
                print(f"  ERROR: No valid pagination state (offset={offset}, pagination_key={'present' if pagination_key else 'None'}). Stopping.", flush=True)
                break
            
            headers = {"Authorization": f"Bearer {DOME_API_KEY}", "Accept": "application/json"}
            
            try:
                response = session.get(url, headers=headers, timeout=30)
                response.raise_for_status()
                data = response.json()
                orders = data.get('orders', [])
                pagination = data.get('pagination', {})
                page_count += 1
                
                # Progress logging for large wallets
                if page_count % 10 == 0:
                    print(f"  Page {page_count}: {len(wallet_trades)} trades fetched so far...")

                for order in orders:
                    # Extract trade fields matching BigQuery schema exactly
                    # BigQuery trades schema: id, condition_id, wallet_address, timestamp, side, 
                    # price, shares_normalized, token_label, token_id, tx_hash
                    
                    condition_id = order.get('condition_id')
                    trade_id = order.get('order_hash') or order.get('tx_hash')
                    
                    # Convert timestamp from Unix seconds to TIMESTAMP format for BigQuery
                    timestamp_unix = order.get('timestamp')
                    if timestamp_unix:
                        # BigQuery TIMESTAMP expects format: YYYY-MM-DD HH:MM:SS[.SSSSSS]
                        timestamp_dt = datetime.fromtimestamp(timestamp_unix)
                        timestamp_str = timestamp_dt.strftime('%Y-%m-%d %H:%M:%S')
                    else:
                        timestamp_str = None
                    
                    # Ensure shares_normalized is float (API may return int)
                    shares_normalized = order.get('shares_normalized')
                    if shares_normalized is not None:
                        shares_normalized = float(shares_normalized)
                    
                    # Ensure price is float
                    price = order.get('price')
                    if price is not None:
                        price = float(price)
                    
                    # CRITICAL: Skip duplicate trades
                    if trade_id and trade_id in existing_trade_ids:
                        continue  # Skip duplicate trade
                    
                    clean_trade = {
                        "id": trade_id,
                        "condition_id": condition_id,
                        "wallet_address": order.get("user") or wallet,
                        "timestamp": timestamp_str,  # Converted to TIMESTAMP format
                        "side": order.get("side"),
                        "price": price,  # Ensure float
                        "shares_normalized": shares_normalized,  # Ensure float
                        "token_label": order.get("token_label"),
                        "token_id": order.get("token_id"),
                        "tx_hash": order.get("tx_hash"),
                    }
                    wallet_trades.append(clean_trade)
                    
                    # Add to existing_trade_ids to prevent duplicates within this run
                    if trade_id:
                        existing_trade_ids.add(trade_id)
                    
                    # Collect condition_id for later market/event fetching
                    if condition_id:
                        wallet_condition_ids.add(condition_id)

                # Check pagination - API requires pagination_key for offsets >= 10K
                has_more = pagination.get('has_more', False)
                new_pagination_key = pagination.get('pagination_key')
                
                if not has_more or len(orders) == 0:
                    break
                
                # Update pagination state
                # CRITICAL: Calculate next_offset FIRST to check if we need pagination_key
                if offset is not None:
                    next_offset = offset + len(orders)
                else:
                    next_offset = None
                
                # If pagination_key is provided in response, use it immediately (even if offset < 10K)
                # API requires pagination_key for offsets > 10K, but it may be provided earlier
                if new_pagination_key:
                    # Always prefer pagination_key when available
                    pagination_key = new_pagination_key
                    offset = None  # Clear offset when using pagination_key
                elif offset is not None:
                    # Calculate next offset BEFORE incrementing
                    # If next offset would exceed 10K, we MUST have pagination_key
                    if next_offset > 10000:
                        # Next offset would be > 10K, but no pagination_key provided
                        print(f"  Warning: Next offset would be {next_offset} (> 10K) without pagination_key. API requires pagination_key for offsets > 10K. Stopping.", flush=True)
                        break
                    elif next_offset == 10000:
                        # At exactly 10K, check if API provided pagination_key for next page
                        if new_pagination_key:
                            # Use pagination_key for next request (safer than offset=10000)
                            pagination_key = new_pagination_key
                            offset = None
                        else:
                            # Safe to use offset=10000 (max allowed)
                            offset = next_offset
                    else:
                        # Safe to increment offset (< 10K)
                        offset = next_offset
                elif pagination_key:
                    # Already using pagination_key, continue with it
                    # pagination_key remains unchanged, will be used in next iteration
                    pass
                else:
                    # Should not reach here, but stop to avoid infinite loop
                    print(f"  Warning: Pagination state error (offset={offset}, pagination_key={pagination_key}). Stopping.", flush=True)
                    break
                
                # Reduced rate limit delay
                if API_RATE_LIMIT_DELAY > 0:
                    time.sleep(API_RATE_LIMIT_DELAY)

            except requests.RequestException as e:
                print(f"API request failed: {e}. Will retry with exponential backoff...")
                # Retry logic is handled by the session's retry strategy
                time.sleep(RETRY_BACKOFF_BASE ** MAX_RETRIES)

        wallet_elapsed = time.time() - wallet_start
        total_trades_processed += len(wallet_trades)
        
        print(f"Wallet complete: {len(wallet_trades):,} trades in {wallet_elapsed:.2f}s ({len(wallet_trades)/wallet_elapsed:.0f} trades/sec)")
        
        # Fetch markets and events for the condition_ids found in trades
        wallet_markets = []
        wallet_events = []
        if wallet_condition_ids:
            print(f"  Fetching markets for {len(wallet_condition_ids)} unique condition_ids...", flush=True)
            wallet_markets, raw_markets = fetch_markets_by_condition_ids(session, list(wallet_condition_ids), existing_market_ids)
            print(f"  Fetched {len(wallet_markets)} markets", flush=True)
            
            # Extract events from raw markets
            if raw_markets:
                wallet_events = extract_events_from_markets(raw_markets, existing_event_slugs)
                print(f"  Extracted {len(wallet_events)} events", flush=True)
                # Update existing_event_slugs to avoid duplicates
                for event in wallet_events:
                    existing_event_slugs.add(event.get('event_slug'))
        
        # For large wallets, upload immediately to avoid memory issues
        # Very large wallets (100K+ trades) will be chunked to avoid quota limits
        if len(wallet_trades) >= LARGE_WALLET_THRESHOLD:
            print(f"  Large wallet detected ({len(wallet_trades):,} trades). Uploading immediately...")
            # Chunk very large uploads to avoid partition modification quota
            chunk_size = BIGQUERY_CHUNK_SIZE if len(wallet_trades) > BIGQUERY_CHUNK_SIZE else None
            upload_to_bigquery(client, wallet_events, EVENTS_TABLE)
            upload_to_bigquery(client, wallet_markets, MARKETS_TABLE)
            # Use staging table for trades to avoid partition modification quota
            target_trades_table = TRADES_STAGING_TABLE if USE_STAGING_TABLE else TRADES_TABLE
            upload_to_bigquery(client, wallet_trades, target_trades_table, chunk_size=chunk_size)
            print(f"  Upload complete for wallet {i+1}/{len(trader_wallets)}")
            # CRITICAL: Mark wallet as completed ONLY AFTER successful upload
            mark_wallet_complete(client, wallet, len(wallet_trades))
        else:
            # Add wallet data to batch for smaller wallets
            batch_events.extend(wallet_events)
            batch_markets.extend(wallet_markets)
            batch_trades.extend(wallet_trades)
            batch_wallets.append((wallet, len(wallet_trades)))  # Track wallet and trade count
        
        # Check if batch is getting too large in memory
        if len(batch_trades) >= IN_MEMORY_CHUNK_SIZE:
            print(f"\n--- Memory threshold reached ({len(batch_trades):,} trades). Uploading batch... ---")
            # Chunk very large batches to avoid quota limits
            chunk_size = BIGQUERY_CHUNK_SIZE if len(batch_trades) > BIGQUERY_CHUNK_SIZE else None
            upload_to_bigquery(client, batch_events, EVENTS_TABLE)
            upload_to_bigquery(client, batch_markets, MARKETS_TABLE)
            # Use staging table for trades to avoid partition modification quota
            target_trades_table = TRADES_STAGING_TABLE if USE_STAGING_TABLE else TRADES_TABLE
            upload_to_bigquery(client, batch_trades, target_trades_table, chunk_size=chunk_size)
            # CRITICAL: Mark all wallets in this batch as completed ONLY AFTER successful upload
            for wallet_addr, trade_count in batch_wallets:
                mark_wallet_complete(client, wallet_addr, trade_count)
            batch_events, batch_markets, batch_trades, batch_wallets = [], [], [], []
            print(f"Batch cleared. Continuing...")

        # Batch upload every N wallets or at the end
        if (i + 1) % BATCH_UPLOAD_SIZE == 0 or (i + 1) == len(trader_wallets):
            if len(batch_trades) > 0:  # Only upload if there's data
                print(f"\n--- Batch Upload ({i+1}/{len(trader_wallets)} wallets processed) ---")
                # Chunk very large batches to avoid quota limits
                chunk_size = BIGQUERY_CHUNK_SIZE if len(batch_trades) > BIGQUERY_CHUNK_SIZE else None
                upload_to_bigquery(client, batch_events, EVENTS_TABLE)
                upload_to_bigquery(client, batch_markets, MARKETS_TABLE)
                # Use staging table for trades to avoid partition modification quota
                target_trades_table = TRADES_STAGING_TABLE if USE_STAGING_TABLE else TRADES_TABLE
                upload_to_bigquery(client, batch_trades, target_trades_table, chunk_size=chunk_size)
                # CRITICAL: Mark all wallets in this batch as completed ONLY AFTER successful upload
                for wallet_addr, trade_count in batch_wallets:
                    mark_wallet_complete(client, wallet_addr, trade_count)
                batch_events, batch_markets, batch_trades, batch_wallets = [], [], [], []
                print(f"Batch cleared. Continuing...")
    
    total_elapsed = time.time() - start_time
    print(f"\n--- Backfill Complete! ---")
    print(f"Total: {total_trades_processed:,} trades processed in {total_elapsed:.2f}s")
    print(f"Average: {total_trades_processed/total_elapsed:.0f} trades/sec")
    
    # If using staging table, copy to production at the end
    if USE_STAGING_TABLE:
        print(f"\n{'='*80}", flush=True)
        print("Final Step: Copying staging data to production table...", flush=True)
        print(f"{'='*80}", flush=True)
        copy_staging_to_production(client)
        print(f"\n✅ All data copied to production table!", flush=True)

if __name__ == "__main__":
    # Immediate startup logging for Cloud Run visibility
    print("=" * 80, flush=True)
    print("Starting Dome API Backfill Job", flush=True)
    print("=" * 80, flush=True)
    print(f"Python version: {sys.version}", flush=True)
    print(f"Working directory: {os.getcwd()}", flush=True)
    print(f"DOME_API_KEY present: {bool(DOME_API_KEY)}", flush=True)
    
    try:
        main()
    except Exception as e:
        print(f"\n{'='*80}", flush=True)
        print(f"FATAL ERROR: {type(e).__name__}: {e}", flush=True)
        print(f"{'='*80}", flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)
