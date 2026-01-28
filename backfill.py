import os
import time
import requests
from google.cloud import bigquery

# --- CONFIGURATION ---
PROJECT_ID = "gen-lang-client-0299056258"
DOME_API_KEY = os.getenv("DOME_API_KEY")

TRADERS_TABLE = f"{PROJECT_ID}.polycopy_v1.traders"
EVENTS_TABLE = f"{PROJECT_ID}.polycopy_v1.events"
MARKETS_TABLE = f"{PROJECT_ID}.polycopy_v1.markets"
TRADES_TABLE = f"{PROJECT_ID}.polycopy_v1.trades"

def get_bigquery_client():
    """Initializes BigQuery client using Application Default Credentials."""
    return bigquery.Client(project=PROJECT_ID)

def get_existing_ids(client, table_id, column_name):
    """Fetches all existing IDs from a table to prevent duplicates."""
    print(f"Fetching existing IDs from {table_id}...")
    try:
        query = f"SELECT DISTINCT {column_name} FROM `{table_id}`"
        results = client.query(query).result()
        return {row[column_name] for row in results}
    except Exception:
        print(f"Table {table_id} not found or empty. Starting fresh.")
        return set()

def upload_to_bigquery(client, data, table_id):
    """Uploads a list of dictionaries to BigQuery via a load job."""
    if not data:
        return
    
    print(f"Uploading {len(data)} rows to {table_id}...")
    job_config = bigquery.LoadJobConfig(write_disposition="WRITE_APPEND", source_format="NEWLINE_DELIMITED_JSON")
    job = client.load_table_from_json(data, table_id, job_config=job_config)
    job.result()
    print(f"Upload to {table_id} complete.")

def main():
    if not DOME_API_KEY:
        raise ValueError("DOME_API_KEY environment variable not set.")

    client = get_bigquery_client()

    existing_event_slugs = get_existing_ids(client, EVENTS_TABLE, "event_slug")
    existing_market_ids = get_existing_ids(client, MARKETS_TABLE, "condition_id")
    
    trader_wallets = [row['wallet_address'] for row in client.query(f"SELECT wallet_address FROM `{TRADERS_TABLE}`").result()]
    print(f"Found {len(trader_wallets)} traders to process.")

    for i, wallet in enumerate(trader_wallets):
        print(f"\n--- Processing Wallet {i+1}/{len(trader_wallets)}: {wallet} ---")
        
        all_trades, all_markets, all_events = [], [], []
        newly_fetched_market_ids = set()
        newly_fetched_event_slugs = set()
        cursor = None

        while True:
            url = f"https://api.dome.watch/trade-history?wallet_address={wallet}" + (f"&cursor={cursor}" if cursor else "")
            headers = {"Authorization": f"Bearer {DOME_API_KEY}"}
            
            try:
                response = requests.get(url, headers=headers, timeout=30)
                response.raise_for_status()
                data = response.json()
                trades = data.get('trades', [])

                for trade in trades:
                    market = trade.get('market', {})
                    event = market.get('event', {})
                    
                    if market.get('condition_id') and market['condition_id'] not in existing_market_ids and market['condition_id'] not in newly_fetched_market_ids:
                        all_markets.append(market)
                        newly_fetched_market_ids.add(market['condition_id'])
                        
                        if event.get('slug') and event['slug'] not in existing_event_slugs and event['slug'] not in newly_fetched_event_slugs:
                            all_events.append(event)
                            newly_fetched_event_slugs.add(event['slug'])
                    
                    # We only need specific fields for the trades table
                    clean_trade = {
                        "id": trade.get("id"),
                        "condition_id": trade.get("condition_id"),
                        "wallet_address": trade.get("wallet_address"),
                        "timestamp": trade.get("timestamp"),
                        "side": trade.get("side"),
                        "price": trade.get("price"),
                        "shares_normalized": trade.get("shares_normalized"),
                        "token_label": trade.get("token_label"),
                        "token_id": trade.get("token_id"),
                        "tx_hash": trade.get("tx_hash"),
                    }
                    all_trades.append(clean_trade)

                print(f"Fetched {len(trades)} trades... Total for this wallet: {len(all_trades)}")
                
                cursor = data.get('next_cursor')
                if not cursor:
                    break
                
                time.sleep(0.5)

            except requests.RequestException as e:
                print(f"API request failed: {e}. Retrying in 10 seconds...")
                time.sleep(10)

        # Batch upload to BigQuery
        upload_to_bigquery(client, all_events, EVENTS_TABLE)
        upload_to_bigquery(client, all_markets, MARKETS_TABLE)
        upload_to_bigquery(client, all_trades, TRADES_TABLE)
    
    print("\n--- Backfill Complete! ---")

if __name__ == "__main__":
    main()
