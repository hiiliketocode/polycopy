#!/usr/bin/env python3
"""
Simple backfill - update all markets missing classifications in batches.
"""

import os
import sys
import json
import time
from datetime import datetime
from google.cloud import bigquery
from dotenv import load_dotenv

load_dotenv('.env.local')

PROJECT_ID = "gen-lang-client-0299056258"
DATASET = "polycopy_v1"
MARKETS_TABLE = f"{PROJECT_ID}.{DATASET}.markets"

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

def classify_market(market: dict) -> dict:
    """Classify market - same logic as daily sync."""
    import re
    
    title = (market.get('title') or '').lower()
    description = (market.get('description') or '').lower()
    tags = market.get('tags', [])
    
    # Normalize tags - handle JSON string, list, or dict
    tag_texts = []
    if isinstance(tags, str):
        # Try to parse as JSON first
        if tags.strip().startswith('[') or tags.strip().startswith('{'):
            try:
                tags_parsed = json.loads(tags)
                if isinstance(tags_parsed, list):
                    tag_texts = [str(t).lower().strip() for t in tags_parsed if t and str(t).lower().strip() not in ['none', 'null', '']]
                elif isinstance(tags_parsed, dict):
                    tag_texts = [str(v).lower().strip() for v in tags_parsed.values() if v and str(v).lower().strip() not in ['none', 'null', '']]
            except:
                # If JSON parse fails, treat as single tag
                tag_lower = tags.lower().strip()
                if tag_lower not in ['none', 'null', '']:
                    tag_texts = [tag_lower]
        else:
            # Not JSON, treat as single tag
            tag_lower = tags.lower().strip()
            if tag_lower not in ['none', 'null', '']:
                tag_texts = [tag_lower]
    elif isinstance(tags, list):
        tag_texts = [str(t).lower().strip() for t in tags if t and str(t).lower().strip() not in ['none', 'null', '']]
    elif isinstance(tags, dict):
        tag_texts = [str(v).lower().strip() for v in tags.values() if v and str(v).lower().strip() not in ['none', 'null', '']]
    
    market_text = ' '.join([title, description] + tag_texts)
    
    # Classify market_type - check both tags and title/description
    market_type = None
    
    # Check tags first (more reliable)
    tag_lower_list = [t.lower() for t in tag_texts]
    
    # Esports tags (check BEFORE sports since esports is more specific)
    esports_tags = ['esports', 'gaming', 'league', 'tournament', 'video game', 'counter-strike', 'cs:', 'honor of kings', 'dota', 'lol', 'league of legends']
    esports_title_patterns = ['counter-strike', 'cs:', 'honor of kings', 'dota', 'lol', 'league of legends', 'bo3', 'bo5', 'bo7', 'game 1', 'game 2', 'game 3']
    if any(est in tag_lower_list for est in esports_tags) or any(est in market_text for est in esports_tags) or any(pattern in title.lower() for pattern in esports_title_patterns):
        market_type = 'ESPORTS'
    # Sports tags and title patterns
    elif any(st in tag_lower_list for st in ['sport', 'sports', 'nba', 'nfl', 'nhl', 'mlb', 'soccer', 'football', 'basketball', 'tennis', 'golf', 'baseball', 'hockey']) or any(st in market_text for st in ['sport', 'sports', 'nba', 'nfl', 'nhl', 'mlb', 'soccer', 'football', 'basketball', 'tennis', 'golf', 'baseball', 'hockey']) or any(pattern in title.lower() for pattern in [' vs ', ' vs. ', 'fc', 'fc vs', 'o/u', 'over/under', 'both teams to score', 'draw', 'league', 'championship', 'premier league', 'ligue 1', 'serie a', 'bundesliga']):
        market_type = 'SPORTS'
    # Crypto tags
    elif any(ct in tag_lower_list for ct in ['crypto', 'bitcoin', 'ethereum', 'btc', 'eth', 'blockchain', 'cryptocurrency']) or any(ct in market_text for ct in ['crypto', 'bitcoin', 'ethereum', 'btc', 'eth', 'blockchain']):
        market_type = 'CRYPTO'
    # Politics tags
    elif any(pt in tag_lower_list for pt in ['politics', 'election', 'president', 'congress', 'senate', 'political']) or any(pt in market_text for pt in ['politics', 'election', 'president', 'congress', 'senate']):
        market_type = 'POLITICS'
    # Finance/Tech tags (Tech, Big Tech, Finance, Stock Market, Economy, GDP, Forex, etc.)
    elif any(ft in tag_lower_list for ft in ['finance', 'stock', 'nasdaq', 'sp500', 'dow', 'tech', 'big tech', 'financial', 'trading', 'economy', 'gdp', 'forex', 'earnings', 'macro indicators', 'exchange rate', 'dollar', 'currency']) or any(ft in market_text for ft in ['finance', 'stock', 'nasdaq', 'sp500', 'dow', 'trading', 'economy', 'gdp', 'forex', 'earnings']):
        market_type = 'FINANCE'
    # Entertainment tags
    elif any(et in tag_lower_list for et in ['entertainment', 'movie', 'tv', 'music', 'celebrity', 'culture', 'media']) or any(et in market_text for et in ['entertainment', 'movie', 'tv', 'music', 'celebrity']):
        market_type = 'ENTERTAINMENT'
    # Weather tags
    elif any(wt in tag_lower_list for wt in ['weather', 'climate', 'temperature']) or any(wt in market_text for wt in ['weather', 'climate', 'temperature']):
        market_type = 'WEATHER'
    
    # Classify market_subtype
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
        # Tech/Big Tech markets
        if any(tt in tag_lower_list for tt in ['tech', 'big tech', 'technology']):
            market_subtype = 'TECH'
        else:
            market_subtype = 'FINANCE'
    elif market_type == 'ENTERTAINMENT':
        # Culture, Media, etc.
        if 'culture' in tag_lower_list:
            market_subtype = 'CULTURE'
        elif any(mt in tag_lower_list for mt in ['movie', 'film']):
            market_subtype = 'MOVIES'
        elif any(mt in tag_lower_list for mt in ['music', 'song']):
            market_subtype = 'MUSIC'
        else:
            market_subtype = 'ENTERTAINMENT'
    
    # Classify bet_structure
    bet_structure = 'STANDARD'  # Default
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

def main():
    client = bigquery.Client(project=PROJECT_ID)
    
    print("=" * 80)
    print("  SIMPLE CLASSIFICATION BACKFILL")
    print("=" * 80)
    print(f"Timestamp: {datetime.now().isoformat()}")
    print()
    
    # Process in batches using MERGE
    BATCH_SIZE = 5000
    total_updated = 0
    
    while True:
        # Fetch batch of markets needing classification
        fetch_query = f"""
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
          AND (market_type IS NULL OR market_subtype IS NULL OR bet_structure IS NULL)
        LIMIT {BATCH_SIZE}
        """
        
        markets = list(client.query(fetch_query).result())
        
        if not markets:
            break
        
        print(f"Processing {len(markets)} markets...", flush=True)
        
        # Classify and prepare updates
        updates = []
        for row in markets:
            market = {
                'condition_id': row.condition_id,
                'title': row.title,
                'description': row.description,
                'tags': row.tags,
            }
            
            classification = classify_market(market)
            
            update = {'condition_id': row.condition_id}
            if not row.market_type and classification.get('market_type'):
                update['market_type'] = classification['market_type']
            if not row.market_subtype and classification.get('market_subtype'):
                update['market_subtype'] = classification['market_subtype']
            if not row.bet_structure and classification.get('bet_structure'):
                update['bet_structure'] = classification['bet_structure']
            
            if len(update) > 1:
                updates.append(update)
        
        if not updates:
            print(f"  No updates needed for this batch", flush=True)
            continue
        
        # Update using MERGE
        temp_table_id = f"{MARKETS_TABLE}_classify_{int(time.time() * 1000000)}"
        
        try:
            schema = [
                bigquery.SchemaField('condition_id', 'STRING', mode='REQUIRED'),
                bigquery.SchemaField('market_type', 'STRING', mode='NULLABLE'),
                bigquery.SchemaField('market_subtype', 'STRING', mode='NULLABLE'),
                bigquery.SchemaField('bet_structure', 'STRING', mode='NULLABLE'),
            ]
            
            temp_table = bigquery.Table(temp_table_id, schema=schema)
            client.create_table(temp_table)
            
            rows_to_insert = []
            for update in updates:
                rows_to_insert.append({
                    'condition_id': update['condition_id'],
                    'market_type': update.get('market_type'),
                    'market_subtype': update.get('market_subtype'),
                    'bet_structure': update.get('bet_structure'),
                })
            
            job_config = bigquery.LoadJobConfig(
                write_disposition="WRITE_TRUNCATE",
                source_format="NEWLINE_DELIMITED_JSON",
                autodetect=False
            )
            load_job = client.load_table_from_json(rows_to_insert, temp_table_id, job_config=job_config)
            load_job.result()
            
            # Deduplicate temp table first (in case of duplicates)
            merge_query = f"""
            MERGE `{MARKETS_TABLE}` AS target
            USING (
                SELECT *
                FROM `{temp_table_id}`
                QUALIFY ROW_NUMBER() OVER (PARTITION BY condition_id ORDER BY condition_id) = 1
            ) AS source
            ON target.condition_id = source.condition_id
            WHEN MATCHED THEN UPDATE SET
                market_type = COALESCE(source.market_type, target.market_type),
                market_subtype = COALESCE(source.market_subtype, target.market_subtype),
                bet_structure = COALESCE(source.bet_structure, target.bet_structure)
            """
            
            merge_job = client.query(merge_query)
            merge_job.result()
            
            client.delete_table(temp_table_id)
            
            total_updated += len(updates)
            print(f"  ✅ Updated {len(updates)} markets (total: {total_updated:,})", flush=True)
            
        except Exception as e:
            print(f"  ❌ Error: {e}", flush=True)
            import traceback
            traceback.print_exc()
            try:
                client.delete_table(temp_table_id)
            except:
                pass
    
    print()
    print("=" * 80)
    print("✅ Backfill complete!")
    print(f"Total updated: {total_updated:,}")
    print("=" * 80)
    
    # Final status
    result = list(client.query(f"""
        SELECT 
            COUNT(*) as total,
            COUNT(market_type) as with_type,
            COUNT(market_subtype) as with_subtype,
            COUNT(bet_structure) as with_structure
        FROM `{MARKETS_TABLE}`
        WHERE condition_id IS NOT NULL
    """).result())[0]
    
    print()
    print("Final status:")
    print(f"  With market_type: {result.with_type:,} ({result.with_type/result.total*100:.1f}%)")
    print(f"  With market_subtype: {result.with_subtype:,} ({result.with_subtype/result.total*100:.1f}%)")
    print(f"  With bet_structure: {result.with_structure:,} ({result.with_structure/result.total*100:.1f}%)")

if __name__ == "__main__":
    main()
