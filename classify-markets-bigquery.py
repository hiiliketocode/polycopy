#!/usr/bin/env python3
"""
Classify markets in BigQuery using heuristics model.

This script:
1. Adds market_type column to BigQuery markets table if missing
2. Fetches markets from BigQuery that need classification
3. Fetches market details (title, description, tags) from Dome API
4. Applies heuristics classification
5. Updates BigQuery markets table with classifications

Env:
    DOME_API_KEY: Dome API key
    GOOGLE_CLOUD_PROJECT: GCP project ID (default: gen-lang-client-0299056258)
    DATASET: BigQuery dataset (default: polycopy_v1)
    HEURISTICS_MODEL_PATH: Path to heuristics model JSON (default: ./combined_heuristics_model.json)
    BATCH_SIZE: Number of markets to process per batch (default: 100)
    API_RATE_LIMIT_DELAY: Delay between API calls in seconds (default: 0.1)
    SKIP_EXISTING: Skip markets that already have all classifications (default: true)
"""

import os
import json
import time
import re
from typing import Dict, List, Optional, Tuple
from datetime import datetime

from google.cloud import bigquery
from google.cloud.exceptions import NotFound
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Configuration
PROJECT_ID = os.getenv('GOOGLE_CLOUD_PROJECT', 'gen-lang-client-0299056258')
DATASET = os.getenv('DATASET', 'polycopy_v1')
MARKETS_TABLE = f"{PROJECT_ID}.{DATASET}.markets"
HEURISTICS_MODEL_PATH = os.getenv('HEURISTICS_MODEL_PATH', './combined_heuristics_model.json')
DOME_API_KEY = os.getenv('DOME_API_KEY')
BATCH_SIZE = int(os.getenv('BATCH_SIZE', '100'))
API_RATE_LIMIT_DELAY = float(os.getenv('API_RATE_LIMIT_DELAY', '0.1'))
SKIP_EXISTING = os.getenv('SKIP_EXISTING', 'true').lower() == 'true'

if not DOME_API_KEY:
    raise ValueError("DOME_API_KEY environment variable is required")

# Dome API configuration
DOME_API_BASE = "https://api.domeapi.io/v1"
DOME_HEADERS = {"Authorization": f"Bearer {DOME_API_KEY}"}

# Setup requests session with retry
session = requests.Session()
retry_strategy = Retry(
    total=3,
    backoff_factor=1,
    status_forcelist=[429, 500, 502, 503, 504],
)
adapter = HTTPAdapter(max_retries=retry_strategy)
session.mount("http://", adapter)
session.mount("https://", adapter)

# Load heuristics model
print(f"📄 Loading heuristics model from {HEURISTICS_MODEL_PATH}...")
with open(HEURISTICS_MODEL_PATH, 'r') as f:
    heuristics_model = json.load(f)

# Initialize BigQuery client
bq_client = bigquery.Client(project=PROJECT_ID)


def ensure_market_type_column():
    """Add market_type column to markets table if it doesn't exist"""
    try:
        table = bq_client.get_table(MARKETS_TABLE)
        schema_fields = [field.name for field in table.schema]
        
        if 'market_type' not in schema_fields:
            print("➕ Adding market_type column to markets table...")
            query = f"""
            ALTER TABLE `{MARKETS_TABLE}`
            ADD COLUMN IF NOT EXISTS market_type STRING
            """
            bq_client.query(query).result()
            print("✅ Added market_type column")
        else:
            print("✅ market_type column already exists")
    except Exception as e:
        print(f"⚠️  Error checking/adding market_type column: {e}")
        raise


def normalize_text(text: Optional[str]) -> str:
    """Normalize text for matching (lowercase, trim)"""
    if not text or not isinstance(text, str):
        return ''
    return text.lower().strip()


def extract_market_text(market: Dict) -> str:
    """Extract all text from a market for keyword matching"""
    texts = []
    
    if market.get('title'):
        texts.append(normalize_text(market['title']))
    if market.get('description'):
        texts.append(normalize_text(market['description']))
    
    # Extract tags
    tags = market.get('tags', [])
    if isinstance(tags, list):
        for tag in tags:
            if isinstance(tag, str):
                texts.append(normalize_text(tag))
            elif isinstance(tag, dict):
                for val in tag.values():
                    if isinstance(val, str):
                        texts.append(normalize_text(val))
    elif isinstance(tags, dict):
        for val in tags.values():
            if isinstance(val, str):
                texts.append(normalize_text(val))
            elif isinstance(val, list):
                for v in val:
                    if isinstance(v, str):
                        texts.append(normalize_text(v))
    
    return ' '.join(texts)


def classify_market_type(market_text: str) -> Optional[str]:
    """Classify market type based on heuristics"""
    market_type_rules = heuristics_model.get('market_type_and_subtype', {}).get('market_type_rules', {})
    
    # Score each market type based on keyword matches
    scores = {}
    
    for market_type, keywords in market_type_rules.items():
        score = 0
        for keyword in keywords:
            # Escape special regex characters
            escaped_keyword = re.escape(keyword)
            regex = re.compile(rf'\b{escaped_keyword}\b', re.IGNORECASE)
            if regex.search(market_text):
                score += 1
        
        if score > 0:
            scores[market_type] = score
    
    # Return the market type with the highest score
    if not scores:
        return None
    
    return max(scores.items(), key=lambda x: x[1])[0]


def classify_market_subtype(market_type: Optional[str], market_text: str) -> Optional[str]:
    """Classify market subtype based on market type"""
    if not market_type:
        return None
    
    subtype_keywords = heuristics_model.get('market_type_and_subtype', {}).get('subtype_keywords', {}).get(market_type)
    if not subtype_keywords:
        return None
    
    # Find the first matching subtype keyword
    for keyword, subtype in subtype_keywords.items():
        escaped_keyword = re.escape(keyword)
        regex = re.compile(rf'\b{escaped_keyword}\b', re.IGNORECASE)
        if regex.search(market_text):
            return subtype
    
    return None


def classify_bet_structure(market_text: str) -> str:
    """Classify bet structure based on heuristics"""
    classification_rules = heuristics_model.get('bet_structure', {}).get('classification_rules', {})
    
    # Check rules in order of specificity (most specific first)
    order = ['Prop', 'Yes/No', 'Over/Under', 'Spread', 'Head-to-Head', 'Multiple Choice']
    
    for bet_type in order:
        rules = classification_rules.get(bet_type)
        if not rules:
            continue
        
        # Check must_contain (for Prop)
        if 'must_contain' in rules and isinstance(rules['must_contain'], list):
            has_all = any(
                re.search(re.escape(keyword), market_text, re.IGNORECASE)
                for keyword in rules['must_contain']
            )
            
            if has_all:
                # Check must_not_contain
                if 'must_not_contain' in rules and isinstance(rules['must_not_contain'], list):
                    has_excluded = any(
                        re.search(re.escape(keyword), market_text, re.IGNORECASE)
                        for keyword in rules['must_not_contain']
                    )
                    if has_excluded:
                        continue
                return bet_type
        
        # Check starts_with (for Yes/No)
        if 'starts_with' in rules and isinstance(rules['starts_with'], list):
            if any(market_text.lower().startswith(prefix.lower()) for prefix in rules['starts_with']):
                return bet_type
        
        # Check contains
        if 'contains' in rules and isinstance(rules['contains'], list):
            if any(re.search(re.escape(keyword), market_text, re.IGNORECASE) for keyword in rules['contains']):
                return bet_type
    
    # Fallback to "Other"
    return 'Other'


def classify_market(market: Dict) -> Dict[str, Optional[str]]:
    """Classify a single market"""
    market_text = extract_market_text(market)
    if not market_text:
        return {
            'market_type': None,
            'market_subtype': None,
            'bet_structure': 'Other'
        }
    
    market_type = classify_market_type(market_text)
    market_subtype = classify_market_subtype(market_type, market_text)
    bet_structure = classify_bet_structure(market_text)
    
    return {
        'market_type': market_type,
        'market_subtype': market_subtype,
        'bet_structure': bet_structure
    }


def fetch_market_from_dome(condition_id: str) -> Optional[Dict]:
    """Fetch market details from Dome API"""
    try:
        url = f"{DOME_API_BASE}/polymarket/markets"
        params = {'condition_id': condition_id}
        
        time.sleep(API_RATE_LIMIT_DELAY)
        response = session.get(url, headers=DOME_HEADERS, params=params, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        results = data.get('results', [])
        if results:
            return results[0]
        return None
    except Exception as e:
        print(f"⚠️  Error fetching market {condition_id} from Dome API: {e}")
        return None


def update_market_classifications(updates: List[Dict]):
    """Update markets with classifications using MERGE with temp table"""
    if not updates:
        return
    
    print(f"  📝 Updating {len(updates)} markets in BigQuery...")
    
    # Create temp table
    temp_table_id = f"{MARKETS_TABLE}_temp_{int(time.time() * 1000000)}"
    temp_table = bigquery.Table(temp_table_id, schema=[
        bigquery.SchemaField('condition_id', 'STRING', mode='REQUIRED'),
        bigquery.SchemaField('market_type', 'STRING', mode='NULLABLE'),
        bigquery.SchemaField('market_subtype', 'STRING', mode='NULLABLE'),
        bigquery.SchemaField('bet_structure', 'STRING', mode='NULLABLE'),
    ])
    bq_client.create_table(temp_table)
    
    try:
        # Load updates to temp table
        job_config = bigquery.LoadJobConfig(
            write_disposition="WRITE_TRUNCATE",
            source_format="NEWLINE_DELIMITED_JSON",
            autodetect=False
        )
        
        # Prepare JSON rows
        json_rows = []
        for update in updates:
            json_rows.append({
                'condition_id': update['condition_id'],
                'market_type': update.get('market_type'),
                'market_subtype': update.get('market_subtype'),
                'bet_structure': update.get('bet_structure'),
            })
        
        load_job = bq_client.load_table_from_json(json_rows, temp_table_id, job_config=job_config)
        load_job.result()
        
        # MERGE from temp table
        merge_query = f"""
        MERGE `{MARKETS_TABLE}` AS target
        USING `{temp_table_id}` AS source
        ON target.condition_id = source.condition_id
        WHEN MATCHED THEN UPDATE SET
            market_type = source.market_type,
            market_subtype = source.market_subtype,
            bet_structure = source.bet_structure
        """
        
        job = bq_client.query(merge_query)
        job.result()
        print(f"  ✅ Successfully updated {len(updates)} markets")
    except Exception as e:
        print(f"  ❌ Error updating markets: {e}")
        raise
    finally:
        # Clean up temp table
        try:
            bq_client.delete_table(temp_table_id)
        except:
            pass


def main():
    print("=" * 70)
    print("🚀 Starting Market Classification for BigQuery")
    print("=" * 70)
    print(f"📊 Project: {PROJECT_ID}")
    print(f"📊 Dataset: {DATASET}")
    print(f"📊 Table: {MARKETS_TABLE}")
    print(f"⚙️  Batch size: {BATCH_SIZE}")
    print(f"⚙️  API rate limit delay: {API_RATE_LIMIT_DELAY}s")
    print(f"⚙️  Skip existing: {SKIP_EXISTING}")
    print()
    
    # Ensure market_type column exists
    ensure_market_type_column()
    print()
    
    # Get markets that need classification
    print("🔍 Fetching markets from BigQuery...")
    
    where_clause = ""
    if SKIP_EXISTING:
        where_clause = "WHERE market_type IS NULL OR market_subtype IS NULL OR bet_structure IS NULL"
    
    query = f"""
    SELECT condition_id, market_type, market_subtype, bet_structure
    FROM `{MARKETS_TABLE}`
    {where_clause}
    ORDER BY condition_id
    LIMIT {BATCH_SIZE * 10}  -- Fetch more to account for API failures
    """
    
    results = bq_client.query(query).result()
    markets_to_process = [dict(row) for row in results]
    
    print(f"  Found {len(markets_to_process)} markets to process")
    print()
    
    if not markets_to_process:
        print("✅ No markets need classification!")
        return
    
    # Process in batches
    processed = 0
    updated = 0
    errors = 0
    
    for i in range(0, len(markets_to_process), BATCH_SIZE):
        batch = markets_to_process[i:i + BATCH_SIZE]
        print(f"\n📦 Processing batch {i // BATCH_SIZE + 1}: {len(batch)} markets")
        
        updates = []
        for market_row in batch:
            condition_id = market_row['condition_id']
            
            # Skip if already fully classified and SKIP_EXISTING is true
            if SKIP_EXISTING:
                if (market_row.get('market_type') and 
                    market_row.get('market_subtype') and 
                    market_row.get('bet_structure')):
                    continue
            
            # Fetch market details from Dome API
            market_details = fetch_market_from_dome(condition_id)
            if not market_details:
                errors += 1
                print(f"  ⚠️  Could not fetch market {condition_id[:16]}...")
                continue
            
            # Classify market
            try:
                classification = classify_market(market_details)
                updates.append({
                    'condition_id': condition_id,
                    **classification
                })
                processed += 1
            except Exception as e:
                print(f"  ❌ Error classifying market {condition_id[:16]}...: {e}")
                errors += 1
        
        # Update BigQuery
        if updates:
            update_market_classifications(updates)
            updated += len(updates)
    
    print("\n" + "=" * 70)
    print("✨ Market Classification Complete")
    print("=" * 70)
    print(f"📊 Processed: {processed} markets")
    print(f"✅ Updated: {updated} markets")
    print(f"❌ Errors: {errors} markets")
    print("=" * 70)


if __name__ == '__main__':
    main()
