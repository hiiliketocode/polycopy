#!/usr/bin/env python3
"""
Backfill Supabase markets table with classifications from BigQuery.

This script:
1. Fetches markets from Supabase missing classifications
2. Gets classifications from BigQuery markets table
3. Updates Supabase markets table
4. Ensures market_subtype and final_niche are synced (both needed)
"""

import os
import sys
from supabase import create_client
from google.cloud import bigquery
from dotenv import load_dotenv

load_dotenv('.env.local')

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
PROJECT_ID = "gen-lang-client-0299056258"
DATASET = "polycopy_v1"

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Error: Missing Supabase credentials")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
bq_client = bigquery.Client(project=PROJECT_ID)

MARKETS_TABLE = f"{PROJECT_ID}.{DATASET}.markets"
BATCH_SIZE = 1000

def get_markets_missing_classifications(offset=0, limit=1000):
    """Get markets from Supabase missing classifications."""
    result = supabase.table('markets')\
        .select('condition_id, market_type, market_subtype, final_niche, bet_structure')\
        .or_('market_type.is.null,market_subtype.is.null,final_niche.is.null,bet_structure.is.null')\
        .range(offset, offset + limit - 1)\
        .execute()
    
    return result.data or []

def get_classifications_from_bigquery(condition_ids):
    """Get classifications from BigQuery for given condition_ids."""
    if not condition_ids:
        return {}
    
    # Split into chunks of 1000 for BigQuery IN clause limit
    classifications = {}
    for i in range(0, len(condition_ids), 1000):
        chunk = condition_ids[i:i + 1000]
        condition_ids_str = "', '".join(chunk)
        query = f"""
        SELECT 
            condition_id,
            market_type,
            market_subtype,
            bet_structure
        FROM `{MARKETS_TABLE}`
        WHERE condition_id IN ('{condition_ids_str}')
        """
        
        results = list(bq_client.query(query).result())
        
        for row in results:
            classifications[row.condition_id] = {
                'market_type': row.market_type,
                'market_subtype': row.market_subtype,
                'bet_structure': row.bet_structure,
                'final_niche': row.market_subtype  # final_niche = market_subtype
            }
    
    return classifications

def update_supabase_markets_batch(updates):
    """Update Supabase markets with classifications in batch."""
    if not updates:
        return 0
    
    updated = 0
    # Process in smaller batches to avoid timeouts
    batch_size = 100
    for i in range(0, len(updates), batch_size):
        batch = updates[i:i + batch_size]
        
        for update in batch:
            try:
                supabase.table('markets')\
                    .update({
                        'market_type': update.get('market_type'),
                        'market_subtype': update.get('market_subtype'),
                        'final_niche': update.get('final_niche'),
                        'bet_structure': update.get('bet_structure')
                    })\
                    .eq('condition_id', update['condition_id'])\
                    .execute()
                updated += 1
            except Exception as e:
                print(f"  ⚠️  Error updating {update['condition_id']}: {e}")
        
        if updated % 500 == 0:
            print(f"  Updated {updated}/{len(updates)} markets...")
    
    return updated

def main():
    print("="*80)
    print("  BACKFILL SUPABASE MARKETS CLASSIFICATIONS")
    print("="*80)
    
    total_updated = 0
    offset = 0
    batch_size = 1000
    
    while True:
        # Get markets missing classifications in batches
        print(f"\n📦 Processing batch starting at offset {offset}...")
        markets = get_markets_missing_classifications(offset=offset, limit=batch_size)
        
        if not markets:
            print("✅ No more markets need backfilling!")
            break
        
        print(f"   Found {len(markets)} markets in this batch")
        
        # Get condition_ids
        condition_ids = [m['condition_id'] for m in markets if m.get('condition_id')]
        if not condition_ids:
            break
        
        # Get classifications from BigQuery
        print(f"   Fetching classifications from BigQuery for {len(condition_ids)} markets...")
        classifications = get_classifications_from_bigquery(condition_ids)
        print(f"   Found classifications for {len(classifications)} markets")
        
        # Prepare updates
        updates = []
        for market in markets:
            condition_id = market.get('condition_id')
            if not condition_id:
                continue
            
            bq_data = classifications.get(condition_id)
            if not bq_data:
                continue
            
            # Only update fields that are missing
            update = {'condition_id': condition_id}
            
            if not market.get('market_type') and bq_data.get('market_type'):
                update['market_type'] = bq_data['market_type']
            
            if not market.get('market_subtype') and bq_data.get('market_subtype'):
                update['market_subtype'] = bq_data['market_subtype']
            
            if not market.get('final_niche') and bq_data.get('final_niche'):
                update['final_niche'] = bq_data['final_niche']
            
            if not market.get('bet_structure') and bq_data.get('bet_structure'):
                update['bet_structure'] = bq_data['bet_structure']
            
            if len(update) > 1:  # More than just condition_id
                updates.append(update)
        
        print(f"   Prepared {len(updates)} updates for this batch")
        
        # Update Supabase
        if updates:
            print(f"   Updating Supabase...")
            updated = update_supabase_markets_batch(updates)
            total_updated += updated
            print(f"   ✅ Updated {updated} markets in this batch")
        
        # Move to next batch
        offset += batch_size
        
        # If we got fewer than batch_size, we're done
        if len(markets) < batch_size:
            break
    
    print("\n" + "="*80)
    print("  BACKFILL COMPLETE")
    print("="*80)
    print(f"Total markets updated: {total_updated:,}")
    print()

if __name__ == "__main__":
    main()
