#!/usr/bin/env python3
"""
Audit market classification to identify gaps and improve heuristics.
"""

from google.cloud import bigquery
from dotenv import load_dotenv
import json
from collections import Counter, defaultdict
load_dotenv('.env.local')

client = bigquery.Client(project='gen-lang-client-0299056258')

print("="*80)
print("MARKET CLASSIFICATION AUDIT")
print("="*80)

# Get classified markets to build tag->type mapping
print("\n1. Building tag->type mapping from classified markets...")
query1 = '''
SELECT 
    tags,
    market_type,
    market_subtype
FROM `gen-lang-client-0299056258.polycopy_v1.markets`
WHERE condition_id IS NOT NULL
  AND market_type IS NOT NULL
  AND tags IS NOT NULL
LIMIT 50000
'''
results1 = list(client.query(query1).result())
print(f"   Processed {len(results1)} classified markets")

tag_to_types = defaultdict(set)
tag_counts_classified = Counter()

for row in results1:
    tags = row.tags
    if tags:
        # Tags come as string from BigQuery JSON column
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
            if tag_lower:
                tag_to_types[tag_lower].add(row.market_type)
                tag_counts_classified[tag_lower] += 1

print(f"   Found {len(tag_to_types)} unique tags in classified markets")

# Get unclassified markets
print("\n2. Analyzing unclassified markets...")
query2 = '''
SELECT 
    tags,
    title
FROM `gen-lang-client-0299056258.polycopy_v1.markets`
WHERE condition_id IS NOT NULL
  AND market_type IS NULL
  AND tags IS NOT NULL
LIMIT 50000
'''
results2 = list(client.query(query2).result())
print(f"   Processed {len(results2)} unclassified markets")

tag_counts_unclassified = Counter()
tag_examples = {}
missing_classifications = defaultdict(lambda: {'count': 0, 'should_be': set(), 'examples': []})

for row in results2:
    tags = row.tags
    title = row.title[:60] if row.title else 'No title'
    
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
            if tag_lower:
                tag_counts_unclassified[tag_lower] += 1
                if tag_lower not in tag_examples:
                    tag_examples[tag_lower] = title
                
                # Check if this tag exists in classified markets
                if tag_lower in tag_to_types:
                    missing_classifications[tag_lower]['count'] += 1
                    missing_classifications[tag_lower]['should_be'].update(tag_to_types[tag_lower])
                    if len(missing_classifications[tag_lower]['examples']) < 3:
                        missing_classifications[tag_lower]['examples'].append(title)

print(f"   Found {len(tag_counts_unclassified)} unique tags in unclassified markets")

# Report findings
print("\n" + "="*80)
print("FINDINGS:")
print("="*80)

print("\n3. Tags in UNCLASSIFIED markets that exist in CLASSIFIED (MISSING CLASSIFICATIONS):")
print("-"*80)
sorted_missing = sorted(missing_classifications.items(), key=lambda x: x[1]['count'], reverse=True)
for tag, data in sorted_missing[:30]:
    types_str = ', '.join(sorted(data['should_be']))
    example = data['examples'][0] if data['examples'] else tag_examples.get(tag, 'N/A')
    print(f"{tag:30s} ({data['count']:5,} markets) -> Should be: {types_str:15s}")
    print(f"  Example: {example}")

# Find new tags
print("\n4. Tags ONLY in UNCLASSIFIED markets (new tags to handle):")
print("-"*80)
new_tags = []
for tag in tag_counts_unclassified:
    if tag not in tag_to_types:
        new_tags.append((tag, tag_counts_unclassified[tag]))

new_tags.sort(key=lambda x: x[1], reverse=True)
for tag, count in new_tags[:30]:
    example = tag_examples.get(tag, 'N/A')
    print(f"{tag:30s} ({count:5,} markets) | Example: {example}")

# Generate recommendations
print("\n" + "="*80)
print("RECOMMENDATIONS:")
print("="*80)

# Common tags that should be classified
recommendations = {
    'SPORTS': ['sports', 'nfl', 'nba', 'nhl', 'mlb', 'soccer', 'football', 'basketball', 'tennis', 'baseball', 'hockey', 'games'],
    'CRYPTO': ['crypto', 'crypto prices', 'xrp', 'ripple', 'ethereum', 'bitcoin', 'btc', 'eth', 'dogecoin', 'solana'],
    'ESPORTS': ['esports', 'cs2', 'counter-strike', 'dota', 'lol', 'league of legends', 'valorant', 'starcraft'],
    'POLITICS': ['politics', 'election', 'president', 'trump', 'congress', 'senate'],
    'FINANCE': ['finance', 'stock', 'stocks', 'equities', 'nasdaq', 'sp500', 'dow', 'tsla'],
    'ENTERTAINMENT': ['entertainment', 'movie', 'movies', 'tv', 'music', 'culture', 'reality tv'],
    'WEATHER': ['weather', 'climate', 'temperature']
}

print("\n5. Suggested tag additions to classification logic:")
print("-"*80)
for market_type, tags_list in recommendations.items():
    missing = [t for t in tags_list if t not in tag_to_types or tag_counts_unclassified.get(t, 0) > 0]
    if missing:
        print(f"\n{market_type}:")
        for tag in missing[:10]:
            unclassified_count = tag_counts_unclassified.get(tag, 0)
            if unclassified_count > 0:
                print(f"  - '{tag}' ({unclassified_count:,} unclassified markets)")

print("\n" + "="*80)
print("AUDIT COMPLETE")
print("="*80)
