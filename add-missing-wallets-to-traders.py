#!/usr/bin/env python3
"""
Add missing wallets to traders table.
These wallets have trades but are not in the traders table.
"""

from google.cloud import bigquery
from dotenv import load_dotenv

load_dotenv('.env.local')

PROJECT_ID = "gen-lang-client-0299056258"
DATASET = "polycopy_v1"
TRADERS_TABLE = f"{PROJECT_ID}.{DATASET}.traders"

# Missing wallets found in analysis
MISSING_WALLETS = [
    "0xefab18ab538127815d554d1d561266d4060be899",
    "0x740a4f70c952c9063f0d3bd4193ad3a18af889e4",
    "0xa54422a7eece2c1635e67ec73edfe1f516cf4adf",
]

def main():
    client = bigquery.Client(project=PROJECT_ID)
    
    print("=" * 80)
    print("Adding Missing Wallets to Traders Table")
    print("=" * 80)
    print()
    
    # Check which wallets are already in traders table
    print("Checking existing wallets...")
    query = f"""
    SELECT wallet_address
    FROM `{TRADERS_TABLE}`
    WHERE LOWER(wallet_address) IN ({','.join([f"'{w.lower()}'" for w in MISSING_WALLETS])})
    """
    results = client.query(query).result()
    existing = {row.wallet_address.lower() for row in results}
    
    new_wallets = [w for w in MISSING_WALLETS if w.lower() not in existing]
    
    if not new_wallets:
        print("✅ All wallets already in traders table!")
        return
    
    print(f"Found {len(new_wallets)} wallets to add:")
    for wallet in new_wallets:
        print(f"  - {wallet}")
    print()
    
    # Insert new wallets
    rows_to_insert = [{'wallet_address': w.lower().strip()} for w in new_wallets]
    
    try:
        errors = client.insert_rows_json(TRADERS_TABLE, rows_to_insert)
        if errors:
            print(f"❌ Errors inserting wallets: {errors}")
            return
        
        print(f"✅ Successfully added {len(new_wallets)} wallets to traders table!")
        print()
        print("Added wallets:")
        for wallet in new_wallets:
            print(f"  - {wallet}")
        
    except Exception as e:
        print(f"❌ Error inserting wallets: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
