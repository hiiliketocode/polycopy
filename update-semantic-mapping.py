#!/usr/bin/env python3
"""
Update semantic_mapping table in Supabase based on tag->type/subtype mappings
from classified markets in BigQuery.

This ensures semantic_mapping matches the actual classifications we're using.
"""

import os
import sys
from supabase import create_client
from google.cloud import bigquery
from dotenv import load_dotenv
import json
from collections import defaultdict

load_dotenv('.env.local')

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
PROJECT_ID = "gen-lang-client-0299056258"

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Error: Missing Supabase credentials")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def build_tag_mappings_from_bigquery():
    """Build tag -> type/subtype mappings from classified markets."""
    print("Building tag mappings from BigQuery classified markets...")
    client = bigquery.Client(project=PROJECT_ID)
    
    query = '''
    SELECT 
        tags,
        market_type,
        market_subtype
    FROM `gen-lang-client-0299056258.polycopy_v1.markets`
    WHERE condition_id IS NOT NULL
      AND market_type IS NOT NULL
      AND tags IS NOT NULL
    LIMIT 100000
    '''
    results = list(client.query(query).result())
    print(f"Processed {len(results)} classified markets")
    
    # Build mappings: tag -> (type, subtype, count)
    tag_mappings = defaultdict(lambda: {'types': defaultdict(int), 'subtypes': defaultdict(int), 'total': 0})
    
    for row in results:
        tags = row.tags
        if tags:
            if isinstance(tags, str):
                try:
                    tags_list = json.loads(tags)
                except:
                    tags_list = [tags]
            elif isinstance(tags, list):
                tags_list = tags
            else:
                continue
            
            for tag in tags_list:
                tag_lower = str(tag).lower().strip()
                if tag_lower and tag_lower not in ['none', 'null', '']:
                    tag_mappings[tag_lower]['types'][row.market_type] += 1
                    if row.market_subtype:
                        tag_mappings[tag_lower]['subtypes'][row.market_subtype] += 1
                    tag_mappings[tag_lower]['total'] += 1
    
    # Find most common type/subtype for each tag
    tag_to_classification = {}
    for tag, data in tag_mappings.items():
        if data['types']:
            # Get most common type
            most_common_type = max(data['types'].items(), key=lambda x: x[1])[0]
            # Get most common subtype
            most_common_subtype = max(data['subtypes'].items(), key=lambda x: x[1])[0] if data['subtypes'] else None
            
            tag_to_classification[tag] = {
                'type': most_common_type,
                'subtype': most_common_subtype,
                'count': data['total']
            }
    
    return tag_to_classification

def get_existing_mappings():
    """Get existing semantic_mapping records."""
    result = supabase.table('semantic_mapping').select('*').execute()
    existing = {}
    for row in result.data:
        tag = row.get('original_tag', '').lower().strip()
        if tag:
            existing[tag] = row
    return existing

def update_semantic_mapping():
    """Update semantic_mapping table."""
    print("="*80)
    print("UPDATE SEMANTIC_MAPPING TABLE")
    print("="*80)
    
    # Get tag mappings from BigQuery
    tag_mappings = build_tag_mappings_from_bigquery()
    print(f"\nFound {len(tag_mappings)} unique tags with classifications")
    
    # Get existing mappings
    existing = get_existing_mappings()
    print(f"Found {len(existing)} existing mappings in semantic_mapping")
    
    # Prepare updates/inserts
    to_insert = []
    to_update = []
    conflicts = []
    
    for tag, info in tag_mappings.items():
        if tag in existing:
            existing_row = existing[tag]
            existing_type = existing_row.get('type', '').upper()
            existing_niche = existing_row.get('clean_niche', '').upper()
            new_type = info['type'].upper()
            new_subtype = (info['subtype'] or '').upper()
            
            # Check for conflicts
            if existing_type != new_type:
                conflicts.append({
                    'tag': tag,
                    'existing_type': existing_type,
                    'new_type': new_type,
                    'count': info['count']
                })
            else:
                # Update if subtype changed or missing
                if existing_niche != new_subtype:
                    to_update.append({
                        'original_tag': tag,
                        'clean_niche': new_subtype or None,
                        'subtype': new_subtype or None,
                        'type': new_type,
                        'specificity_score': 1  # High specificity (exact match)
                    })
        else:
            # New mapping
            to_insert.append({
                'original_tag': tag,
                'clean_niche': info['subtype'] or None,
                'subtype': info['subtype'] or None,
                'type': info['type'],
                'specificity_score': 1  # High specificity (exact match)
            })
    
    print(f"\n📊 Summary:")
    print(f"  New mappings to insert: {len(to_insert)}")
    print(f"  Existing mappings to update: {len(to_update)}")
    print(f"  Conflicts (different types): {len(conflicts)}")
    
    if conflicts:
        print(f"\n⚠️  CONFLICTS (existing type differs from new type):")
        print("="*80)
        for conflict in sorted(conflicts, key=lambda x: x['count'], reverse=True)[:20]:
            print(f"  {conflict['tag']:30s} | Existing: {conflict['existing_type']:15s} | New: {conflict['new_type']:15s} ({conflict['count']:,} markets)")
        print("\n⚠️  These will NOT be updated to avoid conflicts.")
    
    # Insert new mappings
    if to_insert:
        print(f"\n📤 Inserting {len(to_insert)} new mappings...")
        BATCH_SIZE = 100
        inserted = 0
        for i in range(0, len(to_insert), BATCH_SIZE):
            batch = to_insert[i:i + BATCH_SIZE]
            try:
                result = supabase.table('semantic_mapping').insert(batch).execute()
                inserted += len(batch)
                if (i // BATCH_SIZE + 1) % 10 == 0:
                    print(f"  Inserted {inserted}/{len(to_insert)}...")
            except Exception as e:
                print(f"  ⚠️  Error inserting batch {i // BATCH_SIZE + 1}: {e}")
        print(f"  ✅ Inserted {inserted} new mappings")
    
    # Update existing mappings (only if no conflict)
    if to_update:
        print(f"\n📝 Updating {len(to_update)} existing mappings...")
        updated = 0
        for mapping in to_update:
            try:
                supabase.table('semantic_mapping').update({
                    'clean_niche': mapping['clean_niche'],
                    'subtype': mapping['subtype'],
                    'type': mapping['type'],
                    'specificity_score': mapping['specificity_score']
                }).eq('original_tag', mapping['original_tag']).execute()
                updated += 1
                if updated % 100 == 0:
                    print(f"  Updated {updated}/{len(to_update)}...")
            except Exception as e:
                print(f"  ⚠️  Error updating {mapping['original_tag']}: {e}")
        print(f"  ✅ Updated {updated} mappings")
    
    print("\n" + "="*80)
    print("UPDATE COMPLETE")
    print("="*80)

if __name__ == "__main__":
    update_semantic_mapping()
