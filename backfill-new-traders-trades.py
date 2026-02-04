#!/usr/bin/env python3
"""
Backfill trades and markets for new wallets in the traders table.

This script:
1. Finds wallets in traders table that don't have trades yet
2. Fetches ALL trades for these wallets (full history)
3. Fetches markets and events for all condition_ids found
4. Loads everything to BigQuery with deduplication
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

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv('.env.local')
except ImportError:
    pass

# Force unbuffered output
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
BATCH_SIZE = 100  # Dome API limit for condition_ids
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 2

if not DOME_API_KEY:
    print("❌ Error: DOME_API_KEY not set", flush=True)
    sys.exit(1)

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
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session

def find_wallets_without_trades(client: bigquery.Client) -> List[str]:
    """Finds wallets in traders table that don't have trades."""
    query = f"""
    SELECT 
        t.wallet_address
    FROM `{TRADERS_TABLE}` t
    LEFT JOIN `{TRADES_TABLE}` tr 
        ON LOWER(t.wallet_address) = LOWER(tr.wallet_address)
    GROUP BY t.wallet_address
    HAVING COUNT(tr.wallet_address) = 0
    ORDER BY t.wallet_address
    """
    
    print("🔍 Finding wallets without trades...", flush=True)
    results = list(client.query(query).result())
    wallets = [row.wallet_address for row in results]
    print(f"✅ Found {len(wallets)} wallets without trades", flush=True)
    return wallets

def fetch_all_trades_for_wallet(session: requests.Session, wallet: str) -> List[Dict]:
    """Fetches ALL trades for a wallet (full history)."""
    all_trades = []
    base_url = "https://api.domeapi.io/v1"
    headers = {"Authorization": f"Bearer {DOME_API_KEY}", "Accept": "application/json"}
    
    # Start from beginning (no start_time)
    params = {"user": wallet, "limit": 100}
    offset = 0
    
    while True:
        params["offset"] = offset
        
        try:
            time.sleep(API_RATE_LIMIT_DELAY)
            response = session.get(f"{base_url}/polymarket/orders", headers=headers, params=params, timeout=60)
            response.raise_for_status()
            data = response.json()
            
            orders = data.get('orders', [])
            if not orders:
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
                print(f"    📊 Fetched {len(all_trades)} trades so far...", flush=True)
        
        except Exception as e:
            print(f"    ⚠️  Error fetching trades: {e}", flush=True)
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
    
    # Generate ID from order_hash or tx_hash
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

def load_trades_to_bigquery(client: bigquery.Client, trades: List[Dict]) -> bool:
    """Loads trades using MERGE with deduplication."""
    if not trades:
        return True
    
    try:
        temp_table_id = f"{TRADES_TABLE}_temp_{int(time.time() * 1000000)}"
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
            print(f"  ⚠️  No valid trades after filtering", flush=True)
            client.delete_table(temp_table_id)
            return False
        
        # Insert into temp table using JSON
        job_config = bigquery.LoadJobConfig(
            write_disposition="WRITE_TRUNCATE",
            source_format="NEWLINE_DELIMITED_JSON",
            autodetect=False
        )
        
        job = client.load_table_from_json(valid_trades, temp_table_id, job_config=job_config)
        job.result()
        
        # MERGE from temp to production with deduplication
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
        
        client.query(merge_query).result()
        
        # Cleanup temp table
        client.delete_table(temp_table_id)
        
        return True
    except Exception as e:
        print(f"  ❌ Error loading trades: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return False

# Import classification and mapping functions from daily-sync-trades-markets.py
def classify_market(market: Dict) -> Dict[str, Optional[str]]:
    """Classify market - same logic as daily sync."""
    import re
    
    title = (market.get('title') or '').lower()
    description = (market.get('description') or '').lower()
    tags = market.get('tags', [])
    
    # Normalize tags
    tag_texts = []
    if isinstance(tags, list):
        tag_texts = [str(t).lower().strip() for t in tags if t and str(t).lower().strip() not in ['none', 'null', '']]
    elif isinstance(tags, str):
        try:
            if tags.strip().startswith('[') or tags.strip().startswith('{'):
                tags_parsed = json.loads(tags)
                if isinstance(tags_parsed, list):
                    tag_texts = [str(t).lower().strip() for t in tags_parsed if t and str(t).lower().strip() not in ['none', 'null', '']]
                elif isinstance(tags_parsed, dict):
                    tag_texts = [str(v).lower().strip() for v in tags_parsed.values() if v and str(v).lower().strip() not in ['none', 'null', '']]
            else:
                tag_lower = tags.lower().strip()
                if tag_lower not in ['none', 'null', '']:
                    tag_texts = [tag_lower]
        except:
            tag_lower = tags.lower().strip()
            if tag_lower not in ['none', 'null', '']:
                tag_texts = [tag_lower]
    
    market_text = ' '.join([title, description] + tag_texts)
    tag_lower_list = [t.lower() for t in tag_texts]
    
    # Esports first (more specific)
    esports_tags = ['esports', 'gaming', 'league', 'tournament', 'video game', 'counter-strike', 'cs:', 'honor of kings', 'dota', 'lol', 'league of legends']
    esports_title_patterns = ['counter-strike', 'cs:', 'honor of kings', 'dota', 'lol', 'league of legends', 'bo3', 'bo5', 'bo7', 'game 1', 'game 2', 'game 3']
    if any(est in tag_lower_list for est in esports_tags) or any(est in market_text for est in esports_tags) or any(pattern in title.lower() for pattern in esports_title_patterns):
        market_type = 'ESPORTS'
    # Sports
    elif any(st in tag_lower_list for st in ['sport', 'sports', 'nba', 'nfl', 'nhl', 'mlb', 'soccer', 'football', 'basketball', 'tennis', 'golf', 'baseball', 'hockey']) or any(st in market_text for st in ['sport', 'sports', 'nba', 'nfl', 'nhl', 'mlb', 'soccer', 'football', 'basketball', 'tennis', 'golf', 'baseball', 'hockey']) or any(pattern in title.lower() for pattern in [' vs ', ' vs. ', 'fc', 'fc vs', 'o/u', 'over/under', 'both teams to score', 'draw', 'league', 'championship', 'premier league', 'ligue 1', 'serie a', 'bundesliga']):
        market_type = 'SPORTS'
    # Crypto
    elif any(ct in tag_lower_list for ct in ['crypto', 'bitcoin', 'ethereum', 'btc', 'eth', 'blockchain', 'cryptocurrency']) or any(ct in market_text for ct in ['crypto', 'bitcoin', 'ethereum', 'btc', 'eth', 'blockchain']):
        market_type = 'CRYPTO'
    # Politics
    elif any(pt in tag_lower_list for pt in ['politics', 'election', 'president', 'congress', 'senate', 'political']) or any(pt in market_text for pt in ['politics', 'election', 'president', 'congress', 'senate']):
        market_type = 'POLITICS'
    # Finance
    elif any(ft in tag_lower_list for ft in ['finance', 'stock', 'nasdaq', 'sp500', 'dow', 'tech', 'big tech', 'financial', 'trading', 'technology', 'economy', 'gdp', 'forex', 'earnings', 'macro indicators', 'exchange rate', 'dollar', 'currency']) or any(ft in market_text for ft in ['finance', 'stock', 'nasdaq', 'sp500', 'dow', 'trading', 'economy', 'gdp', 'forex', 'earnings']):
        market_type = 'FINANCE'
    # Entertainment
    elif any(et in tag_lower_list for et in ['entertainment', 'movie', 'tv', 'music', 'celebrity', 'culture', 'media']) or any(et in market_text for et in ['entertainment', 'movie', 'tv', 'music', 'celebrity']):
        market_type = 'ENTERTAINMENT'
    # Weather
    elif any(wt in tag_lower_list for wt in ['weather', 'climate', 'temperature']) or any(wt in market_text for wt in ['weather', 'climate', 'temperature']):
        market_type = 'WEATHER'
    else:
        market_type = None
    
    # Subtype classification
    market_subtype = None
    if market_type == 'SPORTS':
        if 'nba' in market_text or 'basketball' in market_text or 'nba' in tag_lower_list:
            market_subtype = 'NBA'
        elif 'nfl' in market_text or ('football' in market_text and 'soccer' not in market_text) or 'nfl' in tag_lower_list:
            market_subtype = 'NFL'
        elif 'nhl' in market_text or 'hockey' in market_text or 'nhl' in tag_lower_list:
            market_subtype = 'NHL'
        elif 'mlb' in market_text or 'baseball' in market_text or 'mlb' in tag_lower_list:
            market_subtype = 'MLB'
        elif 'soccer' in market_text or 'soccer' in tag_lower_list:
            market_subtype = 'SOCCER'
        elif 'tennis' in market_text or 'tennis' in tag_lower_list:
            market_subtype = 'TENNIS'
        else:
            market_subtype = 'SPORTS'
    elif market_type == 'CRYPTO':
        if 'bitcoin' in market_text or 'btc' in market_text or 'bitcoin' in tag_lower_list:
            market_subtype = 'BITCOIN'
        elif 'ethereum' in market_text or 'eth' in market_text or 'ethereum' in tag_lower_list:
            market_subtype = 'ETHEREUM'
        else:
            market_subtype = 'CRYPTO'
    elif market_type == 'POLITICS':
        if 'election' in market_text or 'president' in market_text or 'election' in tag_lower_list:
            market_subtype = 'ELECTION'
        else:
            market_subtype = 'POLITICS'
    elif market_type == 'FINANCE':
        if any(tt in tag_lower_list for tt in ['tech', 'big tech', 'technology']):
            market_subtype = 'TECH'
        else:
            market_subtype = 'FINANCE'
    elif market_type == 'ENTERTAINMENT':
        if 'culture' in tag_lower_list:
            market_subtype = 'CULTURE'
        elif any(mt in tag_lower_list for mt in ['movie', 'film']):
            market_subtype = 'MOVIES'
        elif any(mt in tag_lower_list for mt in ['music', 'song']):
            market_subtype = 'MUSIC'
        else:
            market_subtype = 'ENTERTAINMENT'
    
    # Bet structure
    bet_structure = 'STANDARD'
    title_lower = title.lower()
    if 'over' in title_lower or 'under' in title_lower or 'o/u' in title_lower:
        bet_structure = 'OVER_UNDER'
    elif 'spread' in title_lower or 'handicap' in title_lower:
        bet_structure = 'SPREAD'
    elif title_lower.startswith('will ') or 'winner' in title_lower:
        bet_structure = 'YES_NO'
    elif 'prop' in title_lower:
        bet_structure = 'PROP'
    elif 'head' in title_lower and 'head' in title_lower:
        bet_structure = 'HEAD_TO_HEAD'
    
    return {
        'market_type': market_type,
        'market_subtype': market_subtype,
        'bet_structure': bet_structure
    }

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
    
    classification = classify_market(market)
    
    return {
        'condition_id': market.get('condition_id'),
        'event_slug': market.get('event_slug'),
        'market_slug': market.get('market_slug'),
        'bet_structure': market.get('bet_structure') or classification.get('bet_structure'),
        'market_subtype': market.get('market_subtype') or classification.get('market_subtype'),
        'market_type': market.get('market_type') or classification.get('market_type'),
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
            response = session.get(url, headers=headers, timeout=60)
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
                print(f"  📊 Batch {batch_num}/{total_batches}: Fetched {len(markets)} markets", flush=True)
        
        except Exception as e:
            print(f"  ⚠️  Error fetching batch {batch_num}: {e}", flush=True)
            continue
    
    return all_markets_mapped, all_markets_raw

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
        
        job = client.load_table_from_json(markets, temp_table_id, job_config=job_config)
        job.result()
        
        # MERGE
        merge_query = f"""
        MERGE `{MARKETS_TABLE}` AS target
        USING (
            SELECT *
            FROM `{temp_table_id}`
            QUALIFY ROW_NUMBER() OVER (PARTITION BY condition_id ORDER BY condition_id DESC) = 1
        ) AS source
        ON target.condition_id = source.condition_id
        WHEN MATCHED THEN
            UPDATE SET
                event_slug = source.event_slug,
                market_slug = source.market_slug,
                bet_structure = COALESCE(source.bet_structure, target.bet_structure),
                market_subtype = COALESCE(source.market_subtype, target.market_subtype),
                market_type = COALESCE(source.market_type, target.market_type),
                liquidity = source.liquidity,
                status = source.status,
                winning_label = source.winning_label,
                winning_id = source.winning_id,
                title = COALESCE(source.title, target.title),
                description = COALESCE(source.description, target.description),
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
                side_a = COALESCE(source.side_a, target.side_a),
                side_b = COALESCE(source.side_b, target.side_b),
                tags = COALESCE(source.tags, target.tags)
        WHEN NOT MATCHED THEN
            INSERT ROW
        """
        
        client.query(merge_query).result()
        client.delete_table(temp_table_id)
        
        return True
    except Exception as e:
        print(f"  ❌ Error loading markets: {e}", flush=True)
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
        
        job = client.load_table_from_json(events, temp_table_id, job_config=job_config)
        job.result()
        
        # MERGE
        merge_query = f"""
        MERGE `{EVENTS_TABLE}` AS target
        USING `{temp_table_id}` AS source
        ON target.event_slug = source.event_slug
        WHEN MATCHED THEN
            UPDATE SET
                title = COALESCE(source.title, target.title),
                category = COALESCE(source.category, target.category),
                tags = COALESCE(source.tags, target.tags),
                start_time = source.start_time,
                end_time = source.end_time
        WHEN NOT MATCHED THEN
            INSERT ROW
        """
        
        client.query(merge_query).result()
        client.delete_table(temp_table_id)
        
        return True
    except Exception as e:
        print(f"  ❌ Error loading events: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return False

def main():
    print("=" * 80)
    print("  BACKFILL TRADES FOR NEW TRADERS")
    print("=" * 80)
    print(f"Timestamp: {datetime.now().isoformat()}")
    print()
    
    client = get_bigquery_client()
    session = get_http_session()
    
    # Find wallets without trades
    wallets = find_wallets_without_trades(client)
    
    if not wallets:
        print("✅ No wallets need backfilling!", flush=True)
        return
    
    print(f"\n🚀 Starting backfill for {len(wallets)} wallets...\n", flush=True)
    
    total_trades = 0
    total_markets = 0
    total_events = 0
    all_condition_ids = set()
    
    for i, wallet in enumerate(wallets, 1):
        print(f"[{i}/{len(wallets)}] Processing wallet: {wallet}", flush=True)
        
        # Fetch all trades
        trades = fetch_all_trades_for_wallet(session, wallet)
        
        if not trades:
            print(f"  ⏭️  No trades found", flush=True)
            continue
        
        print(f"  📊 Found {len(trades)} trades", flush=True)
        
        # Map trades
        mapped_trades = [map_trade_to_schema(trade, wallet) for trade in trades]
        
        # Load trades
        if load_trades_to_bigquery(client, mapped_trades):
            total_trades += len(mapped_trades)
            print(f"  ✅ Loaded {len(mapped_trades)} trades", flush=True)
            
            # Collect condition_ids
            for trade in mapped_trades:
                if trade.get('condition_id'):
                    all_condition_ids.add(trade['condition_id'])
        else:
            print(f"  ❌ Failed to load trades", flush=True)
        
        print()
    
    # Fetch and load markets and events
    if all_condition_ids:
        condition_ids_list = list(all_condition_ids)
        print(f"\n📊 Fetching markets for {len(condition_ids_list)} condition_ids...", flush=True)
        
        markets_mapped, markets_raw = fetch_markets_by_condition_ids(session, condition_ids_list)
        
        if markets_mapped:
            if load_markets_to_bigquery(client, markets_mapped):
                total_markets = len(markets_mapped)
                print(f"✅ Loaded {total_markets} markets", flush=True)
        
        # Extract and load events
        events = extract_events_from_markets(markets_raw)
        if events:
            if load_events_to_bigquery(client, events):
                total_events = len(events)
                print(f"✅ Loaded {total_events} events", flush=True)
    
    print("\n" + "=" * 80)
    print("  BACKFILL COMPLETE")
    print("=" * 80)
    print(f"Wallets processed: {len(wallets)}")
    print(f"Trades loaded: {total_trades:,}")
    print(f"Markets loaded: {total_markets:,}")
    print(f"Events loaded: {total_events:,}")
    print()

if __name__ == "__main__":
    main()
