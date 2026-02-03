#!/usr/bin/env python3
"""
Test script to verify stats sync works for a single wallet.
Run this once BigQuery quota resets to verify the code works.
"""

import os
import sys
from dotenv import load_dotenv
load_dotenv('.env.local')

# Import the sync module
sys.path.insert(0, '.')
from sync_trader_stats_from_bigquery import (
    get_bigquery_client,
    get_supabase_client,
    calculate_global_stats,
    calculate_profile_stats,
    upsert_global_stats,
    upsert_profile_stats
)

def test_single_wallet(wallet_address: str):
    """Test stats calculation and upsert for a single wallet."""
    print(f"Testing wallet: {wallet_address}")
    print("=" * 80)
    
    bq_client = get_bigquery_client()
    supabase_client = get_supabase_client()
    
    if not supabase_client:
        print("❌ Supabase client not initialized")
        return False
    
    # Calculate global stats
    print("\n1. Calculating global stats...")
    try:
        global_stats = calculate_global_stats(bq_client, wallet_address)
        if global_stats:
            print(f"   ✅ Global stats calculated: {global_stats.get('L_count', 0)} lifetime trades")
            print(f"   Keys: {list(global_stats.keys())[:5]}...")
            
            # Try to upsert
            print("\n2. Upserting global stats...")
            result = upsert_global_stats(supabase_client, global_stats)
            if result:
                print("   ✅ Global stats upserted successfully!")
            else:
                print("   ❌ Failed to upsert global stats")
                return False
        else:
            print("   ⚠️  No global stats returned (might be quota error)")
            return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        if 'quota' in str(e).lower():
            print("   ⚠️  BigQuery quota exceeded - wait for reset")
        return False
    
    # Calculate profile stats
    print("\n3. Calculating profile stats...")
    try:
        profile_stats = calculate_profile_stats(bq_client, wallet_address)
        if profile_stats:
            print(f"   ✅ Profile stats calculated: {len(profile_stats)} profile groups")
            print(f"   Sample keys: {list(profile_stats[0].keys())[:5]}...")
            
            # Check for bet_structure key
            if 'bet_structure' in profile_stats[0]:
                print("   ⚠️  WARNING: Found 'bet_structure' key in profile stats!")
            if 'structure' in profile_stats[0]:
                print("   ✅ Found 'structure' key")
            
            # Try to upsert
            print("\n4. Upserting profile stats...")
            result = upsert_profile_stats(supabase_client, profile_stats)
            if result:
                print("   ✅ Profile stats upserted successfully!")
            else:
                print("   ❌ Failed to upsert profile stats")
                return False
        else:
            print("   ⚠️  No profile stats returned")
    except Exception as e:
        print(f"   ❌ Error: {e}")
        if 'quota' in str(e).lower():
            print("   ⚠️  BigQuery quota exceeded - wait for reset")
        return False
    
    print("\n" + "=" * 80)
    print("✅ Test completed successfully!")
    return True

if __name__ == "__main__":
    # Test with a wallet that has trades
    test_wallet = sys.argv[1] if len(sys.argv) > 1 else "0x37e4728b"
    test_single_wallet(test_wallet)
