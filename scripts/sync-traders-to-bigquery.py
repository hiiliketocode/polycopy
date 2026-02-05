#!/usr/bin/env python3

"""
Sync all wallet addresses from Supabase traders table to BigQuery traders table
"""

import os
import sys
from supabase import create_client, Client
from google.cloud import bigquery
from dotenv import load_dotenv

load_dotenv('.env.local')

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
PROJECT_ID = 'gen-lang-client-0299056258'
DATASET = 'polycopy_v1'
TABLE = 'traders'

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
bq_client = bigquery.Client(project=PROJECT_ID)

def main():
    print('=' * 60)
    print('🔄 Syncing traders from Supabase to BigQuery')
    print('=' * 60)
    
    # Fetch all wallet addresses from Supabase (handle pagination)
    print('\n📊 Fetching wallet addresses from Supabase...')
    response = supabase.table('traders').select('wallet_address', count='exact').not_.is_('wallet_address', 'null').execute()
    
    # Get all pages if needed
    traders = []
    total_count = response.count if response.count else len(response.data or [])
    
    if total_count > 1000:
        # Fetch in batches
        print(f"  📊 Fetching {total_count} traders in batches...")
        for offset in range(0, total_count, 1000):
            batch = supabase.table('traders').select('wallet_address').not_.is_('wallet_address', 'null').range(offset, min(offset + 999, total_count - 1)).execute()
            traders.extend(batch.data or [])
            if (offset // 1000 + 1) % 5 == 0:
                print(f"     Fetched {len(traders)}/{total_count}...")
    else:
        traders = response.data or []
    
    if not traders:
        print('⚠️  No traders found in Supabase')
        return
    
    # Extract unique wallet addresses
    wallets = list(set([t['wallet_address'].lower().strip() for t in traders if t.get('wallet_address')]))
    print(f'✅ Found {len(wallets)} unique wallet addresses')
    
    if not wallets:
        print('⚠️  No valid wallet addresses found')
        return
    
    # Check existing wallets in BigQuery
    print('\n📊 Checking existing wallets in BigQuery...')
    table_id = f'{PROJECT_ID}.{DATASET}.{TABLE}'
    existing_wallets = set()
    
    try:
        query = f"SELECT DISTINCT wallet_address FROM `{table_id}`"
        results = bq_client.query(query).result()
        existing_wallets = {row.wallet_address.lower() for row in results if row.wallet_address}
    except Exception as e:
        print(f'ℹ️  No existing wallets found (or table is empty): {e}')
    
    # Filter out wallets that already exist
    new_wallets = [w for w in wallets if w.lower() not in existing_wallets]
    print(f'📊 New wallets to insert: {len(new_wallets)}')
    print(f'📊 Already in BigQuery: {len(wallets) - len(new_wallets)}')
    
    if not new_wallets:
        print('\n✅ All wallets already synced to BigQuery!')
        return
    
    # Insert in batches
    BATCH_SIZE = 1000
    inserted = 0
    
    for i in range(0, len(new_wallets), BATCH_SIZE):
        batch = new_wallets[i:i + BATCH_SIZE]
        rows_to_insert = [{'wallet_address': w} for w in batch]
        
        print(f'\n📤 Inserting batch {i // BATCH_SIZE + 1} ({len(batch)} wallets)...')
        
        try:
            errors = bq_client.insert_rows_json(table_id, rows_to_insert)
            if errors:
                print(f'❌ Errors inserting batch: {errors}')
                raise Exception(f'Insert errors: {errors}')
            
            inserted += len(batch)
            print(f'✅ Inserted {len(batch)} wallets ({inserted}/{len(new_wallets)} total)')
        except Exception as e:
            print(f'❌ Error inserting batch: {e}')
            raise
    
    print('\n' + '=' * 60)
    print(f'✅ Successfully synced {inserted} wallet addresses to BigQuery!')
    print(f'📊 Total wallets in BigQuery: {len(wallets)}')
    print('=' * 60)

if __name__ == '__main__':
    main()
