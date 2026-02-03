#!/usr/bin/env python3
"""
Quick test script to verify Dome API trade fetching works correctly.
Tests the API call with correct parameters before the next scheduled run.
"""

import os
import sys
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Load environment variables
load_dotenv('.env.local')

DOME_API_KEY = os.getenv("DOME_API_KEY")
if not DOME_API_KEY:
    print("❌ Error: DOME_API_KEY not found in .env.local")
    sys.exit(1)

# Get a test wallet - try to get from command line or use default
if len(sys.argv) > 1:
    TEST_WALLET = sys.argv[1]
else:
    TEST_WALLET = "0x011f2d377e56119fb09196dffb0948ae55711122"  # Default test wallet

# Calculate since timestamp (24 hours ago)
since = datetime.now() - timedelta(hours=24)
since_timestamp = int(since.timestamp())

print("=" * 80)
print("Testing Dome API Trade Fetching")
print("=" * 80)
print()
print(f"API Key: {DOME_API_KEY[:10]}...")
print(f"Test Wallet: {TEST_WALLET}")
print(f"Since: {since.isoformat()} ({since_timestamp})")
print()

# Test 1: Old way (wrong parameters)
print("Test 1: OLD WAY (wrong parameters - wallet + since)")
print("-" * 80)
try:
    base_url = "https://api.domeapi.io/v1"
    headers = {"Authorization": f"Bearer {DOME_API_KEY}", "Accept": "application/json"}
    params_old = {"wallet": TEST_WALLET, "limit": 100, "since": since_timestamp}
    
    response = requests.get(f"{base_url}/polymarket/orders", headers=headers, params=params_old, timeout=30)
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        orders_old = data.get('orders', []) or data.get('results', [])
        print(f"Orders found: {len(orders_old)}")
        if orders_old:
            print(f"First order keys: {list(orders_old[0].keys())}")
    else:
        print(f"Error: {response.text[:200]}")
except Exception as e:
    print(f"Error: {e}")
print()

# Test 2: New way (correct parameters)
print("Test 2: NEW WAY (correct parameters - user + start_time)")
print("-" * 80)
try:
    params_new = {"user": TEST_WALLET, "limit": 100, "start_time": since_timestamp}
    
    response = requests.get(f"{base_url}/polymarket/orders", headers=headers, params=params_new, timeout=30)
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        
        orders_new = data.get('orders', [])
        if not orders_new:
            orders_new = data.get('results', [])
        
        print(f"Orders found: {len(orders_new)}")
        
        if orders_new:
            print(f"\nFirst order sample:")
            first_order = orders_new[0]
            for key, value in list(first_order.items())[:10]:
                print(f"  {key}: {value}")
            
            # Check pagination
            pagination = data.get('pagination', {})
            print(f"\nPagination info:")
            print(f"  has_more: {pagination.get('has_more', 'N/A')}")
            print(f"  total: {pagination.get('total', 'N/A')}")
        else:
            print("⚠️  No orders returned (might be normal if wallet has no recent trades)")
            print(f"Full response sample: {str(data)[:500]}")
    else:
        print(f"Error: {response.text[:200]}")
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
print()

# Test 3: Test with the provided wallet (or default)
print("Test 3: Testing with provided wallet")
print("-" * 80)
print(f"Using wallet: {TEST_WALLET}")

# Test with old parameters
print("\n3a. OLD parameters (wallet + since):")
params_old = {"wallet": TEST_WALLET, "limit": 10, "since": since_timestamp}
response = requests.get(f"{base_url}/polymarket/orders", headers=headers, params=params_old, timeout=30)
if response.status_code == 200:
    data = response.json()
    orders_old = data.get('orders', []) or data.get('results', [])
    print(f"  ✅ Orders found: {len(orders_old)}")
    if orders_old:
        print(f"  Sample timestamp: {orders_old[0].get('timestamp')}")
else:
    print(f"  ❌ Error: {response.status_code}")

# Test with new parameters  
print("\n3b. NEW parameters (user + start_time):")
params_new = {"user": TEST_WALLET, "limit": 10, "start_time": since_timestamp}
response = requests.get(f"{base_url}/polymarket/orders", headers=headers, params=params_new, timeout=30)
if response.status_code == 200:
    data = response.json()
    orders_new = data.get('orders', []) or data.get('results', [])
    print(f"  ✅ Orders found: {len(orders_new)}")
    if orders_new:
        print(f"  Sample timestamp: {orders_new[0].get('timestamp')}")
        print(f"  Response format: {list(data.keys())}")
else:
    print(f"  ❌ Error: {response.status_code} - {response.text[:200]}")

# Test without time filter (get recent trades)
print("\n3c. Testing WITHOUT time filter (get all recent):")
params_no_time = {"user": TEST_WALLET, "limit": 10}
response = requests.get(f"{base_url}/polymarket/orders", headers=headers, params=params_no_time, timeout=30)
if response.status_code == 200:
    data = response.json()
    orders_no_time = data.get('orders', []) or data.get('results', [])
    print(f"  ✅ Orders found: {len(orders_no_time)}")
    if orders_no_time:
        print(f"  Most recent timestamp: {orders_no_time[0].get('timestamp')}")
        print(f"  Trade ID: {orders_no_time[0].get('id')}")
        print(f"  Condition ID: {orders_no_time[0].get('condition_id')}")
else:
    print(f"  ❌ Error: {response.status_code}")

print()
print("=" * 80)
print("Test Complete!")
print("=" * 80)
print()
print("If Test 2 shows orders but Test 1 doesn't, the fix is working!")
print("Check the response format to ensure it matches what the script expects.")
