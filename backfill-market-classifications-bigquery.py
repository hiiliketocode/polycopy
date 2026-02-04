#!/usr/bin/env python3
"""
Backfill market classifications for existing markets in BigQuery.
Uses the same classification logic as daily-sync-trades-markets.py
"""

import os
import sys
import json
import time
from datetime import datetime
from typing import Dict, List, Optional
from google.cloud import bigquery
from dotenv import load_dotenv

load_dotenv('.env.local')

PROJECT_ID = "gen-lang-client-0299056258"
DATASET = "polycopy_v1"
MARKETS_TABLE = f"{PROJECT_ID}.{DATASET}.markets"

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

def classify_market(market: Dict) -> Dict[str, Optional[str]]:
    """
    Classify market with market_type, market_subtype, and bet_structure.
    Uses heuristics based on tags and title.
    """
    import re
    
    # Extract text from market
    title = (market.get('title') or '').lower()
    description = (market.get('description') or '').lower()
    tags = market.get('tags', [])
    
    # Normalize tags - handle JSON string or list
    tag_texts = []
    if isinstance(tags, str):
        try:
            tags_parsed = json.loads(tags) if tags.startswith('[') or tags.startswith('{') else [tags]
            if isinstance(tags_parsed, list):
                tag_texts = [str(t).lower() for t in tags_parsed if t]
            elif isinstance(tags_parsed, dict):
                tag_texts = [str(v).lower() for v in tags_parsed.values() if v]
        except:
            tag_texts = [tags.lower()] if tags else []
    elif isinstance(tags, list):
        tag_texts = [str(t).lower() for t in tags if t]
    elif isinstance(tags, dict):
        tag_texts = [str(v).lower() for v in tags.values() if v]
    
    market_text = ' '.join([title, description] + tag_texts)
    
    # Classify market_type from tags
    market_type = None
    if any(tag in market_text for tag in ['sport', 'nba', 'nfl', 'nhl', 'mlb', 'soccer', 'football', 'basketball', 'tennis', 'golf']):
        market_type = 'SPORTS'
    elif any(tag in market_text for tag in ['crypto', 'bitcoin', 'ethereum', 'btc', 'eth', 'blockchain']):
        market_type = 'CRYPTO'
    elif any(tag in market_text for tag in ['politics', 'election', 'president', 'congress', 'senate']):
        market_type = 'POLITICS'
    elif any(tag in market_text for tag in ['finance', 'stock', 'nasdaq', 'sp500', 'dow']):
        market_type = 'FINANCE'
    elif any(tag in market_text for tag in ['entertainment', 'movie', 'tv', 'music', 'celebrity']):
        market_type = 'ENTERTAINMENT'
    elif any(tag in market_text for tag in ['esports', 'gaming', 'league', 'tournament']):
        market_type = 'ESPORTS'
    elif any(tag in market_text for tag in ['weather', 'climate', 'temperature']):
        market_type = 'WEATHER'
    
    # Classify market_subtype (niche)
    market_subtype = None
    if market_type == 'SPORTS':
        if 'nba' in market_text or 'basketball' in market_text:
            market_subtype = 'NBA'
        elif 'nfl' in market_text or ('football' in market_text and 'soccer' not in market_text):
            market_subtype = 'NFL'
        elif 'nhl' in market_text or 'hockey' in market_text:
            market_subtype = 'NHL'
        elif 'mlb' in market_text or 'baseball' in market_text:
            market_subtype = 'MLB'
        elif 'soccer' in market_text:
            market_subtype = 'SOCCER'
        elif 'tennis' in market_text:
            market_subtype = 'TENNIS'
        else:
            market_subtype = 'SPORTS'
    elif market_type == 'CRYPTO':
        if 'bitcoin' in market_text or 'btc' in market_text:
            market_subtype = 'BITCOIN'
        elif 'ethereum' in market_text or 'eth' in market_text:
            market_subtype = 'ETHEREUM'
        else:
            market_subtype = 'CRYPTO'
    elif market_type == 'POLITICS':
        if 'election' in market_text or 'president' in market_text:
            market_subtype = 'ELECTION'
        else:
            market_subtype = 'POLITICS'
    
    # Classify bet_structure from title
    bet_structure = None
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
    else:
        bet_structure = 'STANDARD'
    
    return {
        'market_type': market_type,
        'market_subtype': market_subtype,
        'bet_structure': bet_structure
    }

def get_markets_needing_classification(client: bigquery.Client, batch_size: int = 1000) -> List[Dict]:
    """Fetch markets that need classification."""
    query = f"""
    SELECT 
        condition_id,
        title,
        description,
        tags,
        market_type,
        market_subtype,
        bet_structure
    FROM `{MARKETS_TABLE}`
    WHERE condition_id IS NOT NULL
      AND (
        market_type IS NULL 
        OR market_subtype IS NULL 
        OR bet_structure IS NULL
      )
    LIMIT {batch_size}
    """
    
    results = client.query(query).result()
    markets = []
    for row in results:
        market = {
            'condition_id': row.condition_id,
            'title': row.title,
            'description': row.description,
            'tags': row.tags,
            'market_type': row.market_type,
            'market_subtype': row.market_subtype,
            'bet_structure': row.bet_structure,
        }
        markets.append(market)
    
    return markets

def update_market_classifications(client: bigquery.Client, updates: List[Dict]) -> bool:
    """Update markets with classifications using MERGE."""
    if not updates:
        return True
    
    try:
        # Create temp table
        temp_table_id = f"{MARKETS_TABLE}_classify_temp_{int(time.time() * 1000000)}"
        
        schema = [
            bigquery.SchemaField('condition_id', 'STRING', mode='REQUIRED'),
            bigquery.SchemaField('market_type', 'STRING', mode='NULLABLE'),
            bigquery.SchemaField('market_subtype', 'STRING', mode='NULLABLE'),
            bigquery.SchemaField('bet_structure', 'STRING', mode='NULLABLE'),
        ]
        
        temp_table = bigquery.Table(temp_table_id, schema=schema)
        client.create_table(temp_table)
        
        # Prepare rows
        rows_to_insert = []
        for update in updates:
            rows_to_insert.append({
                'condition_id': update['condition_id'],
                'market_type': update.get('market_type'),
                'market_subtype': update.get('market_subtype'),
                'bet_structure': update.get('bet_structure'),
            })
        
        # Load to temp table
        job_config = bigquery.LoadJobConfig(
            write_disposition="WRITE_TRUNCATE",
            source_format="NEWLINE_DELIMITED_JSON",
            autodetect=False
        )
        load_job = client.load_table_from_json(rows_to_insert, temp_table_id, job_config=job_config)
        load_job.result()
        
        # MERGE to production
        merge_query = f"""
        MERGE `{MARKETS_TABLE}` AS target
        USING `{temp_table_id}` AS source
        ON target.condition_id = source.condition_id
        WHEN MATCHED THEN UPDATE SET
            market_type = COALESCE(source.market_type, target.market_type),
            market_subtype = COALESCE(source.market_subtype, target.market_subtype),
            bet_structure = COALESCE(source.bet_structure, target.bet_structure)
        """
        
        merge_job = client.query(merge_query)
        merge_job.result()
        
        # Cleanup
        client.delete_table(temp_table_id)
        return True
        
    except Exception as e:
        print(f"  ❌ Error updating classifications: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return False

def main():
    client = bigquery.Client(project=PROJECT_ID)
    
    print("=" * 80)
    print("  BACKFILL MARKET CLASSIFICATIONS")
    print("=" * 80)
    print(f"Timestamp: {datetime.now().isoformat()}")
    print()
    
    # Check how many markets need classification
    check_query = f"""
    SELECT 
        COUNT(*) as total,
        COUNT(market_type) as with_type,
        COUNT(market_subtype) as with_subtype,
        COUNT(bet_structure) as with_structure,
        COUNT(*) - COUNT(market_type) as missing_type,
        COUNT(*) - COUNT(market_subtype) as missing_subtype,
        COUNT(*) - COUNT(bet_structure) as missing_structure
    FROM `{MARKETS_TABLE}`
    WHERE condition_id IS NOT NULL
    """
    
    result = list(client.query(check_query).result())[0]
    print(f"Total markets: {result.total:,}")
    print(f"With market_type: {result.with_type:,} ({result.with_type/result.total*100:.1f}%)")
    print(f"With market_subtype: {result.with_subtype:,} ({result.with_subtype/result.total*100:.1f}%)")
    print(f"With bet_structure: {result.with_structure:,} ({result.with_structure/result.total*100:.1f}%)")
    print()
    print(f"Missing market_type: {result.missing_type:,}")
    print(f"Missing market_subtype: {result.missing_subtype:,}")
    print(f"Missing bet_structure: {result.missing_structure:,}")
    print()
    
    if result.missing_type == 0 and result.missing_subtype == 0 and result.missing_structure == 0:
        print("✅ All markets already have classifications!")
        return
    
    # Process in batches
    BATCH_SIZE = 1000
    total_processed = 0
    total_updated = 0
    
    print(f"Processing markets in batches of {BATCH_SIZE}...")
    print()
    
    while True:
        # Fetch batch
        markets = get_markets_needing_classification(client, BATCH_SIZE)
        
        if not markets:
            break
        
        print(f"Processing batch: {len(markets)} markets...", flush=True)
        
        # Classify markets
        updates = []
        for market in markets:
            classification = classify_market(market)
            
            # Update any missing classifications
            update = {'condition_id': market['condition_id']}
            updated = False
            
            # Always set bet_structure if missing (has default value)
            if not market.get('bet_structure') and classification.get('bet_structure'):
                update['bet_structure'] = classification['bet_structure']
                updated = True
            
            # Set market_type if missing and we have a classification
            if not market.get('market_type') and classification.get('market_type'):
                update['market_type'] = classification['market_type']
                updated = True
            
            # Set market_subtype if missing and we have a classification
            if not market.get('market_subtype') and classification.get('market_subtype'):
                update['market_subtype'] = classification['market_subtype']
                updated = True
            
            if updated:
                updates.append(update)
        
        # Update in BigQuery
        if updates:
            if update_market_classifications(client, updates):
                total_updated += len(updates)
                print(f"  ✅ Updated {len(updates)} markets", flush=True)
            else:
                print(f"  ⚠️  Failed to update batch", flush=True)
        else:
            # Debug: show why no updates (only first few batches)
            if len(markets) > 0 and total_processed < 5000:
                sample = markets[0]
                classification = classify_market(sample)
                title_str = (sample.get('title') or 'None')[:50]
                print(f"  ℹ️  Sample: title='{title_str}...', classified={classification}", flush=True)
        
        total_processed += len(markets)
        
        # Progress update
        if total_processed % 5000 == 0:
            print(f"  Progress: {total_processed:,} markets processed, {total_updated:,} updated", flush=True)
        
        # Check if we've processed all markets
        if len(markets) < BATCH_SIZE:
            break
    
    print()
    print("=" * 80)
    print("✅ Backfill complete!")
    print(f"Total processed: {total_processed:,}")
    print(f"Total updated: {total_updated:,}")
    print("=" * 80)
    
    # Final check
    final_result = list(client.query(check_query).result())[0]
    print()
    print("Final status:")
    print(f"With market_type: {final_result.with_type:,} ({final_result.with_type/final_result.total*100:.1f}%)")
    print(f"With market_subtype: {final_result.with_subtype:,} ({final_result.with_subtype/final_result.total*100:.1f}%)")
    print(f"With bet_structure: {final_result.with_structure:,} ({final_result.with_structure/final_result.total*100:.1f}%)")

if __name__ == "__main__":
    main()
