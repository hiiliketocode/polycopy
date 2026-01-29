#!/usr/bin/env python3
"""
Create BigQuery Data Transfer Service config using Application Default Credentials
"""

import json
import subprocess
import sys

PROJECT_ID = "gen-lang-client-0299056258"
DATASET_ID = "polycopy_v1"
TABLE_ID = "trades_staging"
GCS_BUCKET = f"{PROJECT_ID}-backfill-temp"
SOURCE_URI = f"gs://{GCS_BUCKET}/trades/*.jsonl"

def create_dts_via_python_library():
    """Create DTS config using Python library"""
    try:
        from google.cloud import bigquery_datatransfer
        
        client = bigquery_datatransfer.DataTransferServiceClient()
        parent = f"projects/{PROJECT_ID}/locations/us"
        
        transfer_config = bigquery_datatransfer.TransferConfig(
            display_name="GCS to Trades Staging",
            data_source_id="google_cloud_storage",
            destination_dataset_id=DATASET_ID,
            params={
                "data_path_template": SOURCE_URI,
                "destination_table_name_template": TABLE_ID,
                "file_format": "NEWLINE_DELIMITED_JSON",
                "write_disposition": "WRITE_APPEND",
                "max_bad_records": "0",
            },
            schedule_options=bigquery_datatransfer.ScheduleOptions(
                disable_auto_scheduling=True
            ),
        )
        
        print("Creating DTS transfer config...")
        print(f"  Source: {SOURCE_URI}")
        print(f"  Destination: {DATASET_ID}.{TABLE_ID}")
        print()
        
        config = client.create_transfer_config(
            parent=parent,
            transfer_config=transfer_config,
        )
        
        print(f"✅ Created transfer config!")
        print(f"   Name: {config.name}")
        return config.name
        
    except Exception as e:
        if "already exists" in str(e).lower() or "409" in str(e):
            print("⚠️  Transfer config may already exist")
            # Try to find it
            try:
                list_configs = client.list_transfer_configs(parent=parent)
                for cfg in list_configs:
                    if cfg.display_name == "GCS to Trades Staging":
                        print(f"   Found existing: {cfg.name}")
                        return cfg.name
            except:
                pass
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return None

def create_dts_via_gcloud():
    """Create DTS config using gcloud REST API with service account"""
    
    # Get default compute service account
    service_account = f"{PROJECT_ID}@appspot.gserviceaccount.com"
    
    # Use gcloud to call the REST API directly
    params = {
        "data_path_template": SOURCE_URI,
        "destination_table_name_template": TABLE_ID,
        "file_format": "NEWLINE_DELIMITED_JSON",
        "write_disposition": "WRITE_APPEND",
        "max_bad_records": "0"
    }
    
    config = {
        "displayName": "GCS to Trades Staging",
        "dataSourceId": "google_cloud_storage",
        "destinationDatasetId": DATASET_ID,
        "params": params,
        "scheduleOptions": {
            "disableAutoScheduling": True
        },
        "serviceAccountName": service_account
    }
    
    print("Creating DTS transfer config...")
    print(f"  Source: {SOURCE_URI}")
    print(f"  Destination: {DATASET_ID}.{TABLE_ID}")
    print(f"  Service Account: {service_account}")
    print()
    
    # Use gcloud to make REST API call
    url = f"https://bigquerydatatransfer.googleapis.com/v1/projects/{PROJECT_ID}/locations/us/transferConfigs"
    
    cmd = [
        "gcloud", "auth", "application-default", "print-access-token"
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        access_token = result.stdout.strip()
        
        import requests
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        response = requests.post(url, headers=headers, json=config)
        
        if response.status_code == 200:
            transfer_config = response.json()
            print(f"✅ Created transfer config!")
            print(f"   Name: {transfer_config.get('name', 'N/A')}")
            return transfer_config.get('name')
        elif response.status_code == 409:
            print("⚠️  Transfer config already exists")
            # Try to get existing config
            print("   Fetching existing configs...")
            list_url = f"https://bigquerydatatransfer.googleapis.com/v1/projects/{PROJECT_ID}/locations/us/transferConfigs"
            list_response = requests.get(list_url, headers=headers)
            if list_response.status_code == 200:
                configs = list_response.json().get('transferConfigs', [])
                for cfg in configs:
                    if cfg.get('displayName') == "GCS to Trades Staging":
                        print(f"   Found: {cfg.get('name')}")
                        return cfg.get('name')
            return None
        else:
            print(f"❌ Error: {response.status_code}")
            print(f"   {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return None


def run_transfer(transfer_config_name: str):
    """Run the transfer manually"""
    import requests
    
    url = f"https://bigquerydatatransfer.googleapis.com/v1/{transfer_config_name}:startManualRuns"
    
    cmd = ["gcloud", "auth", "application-default", "print-access-token"]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    access_token = result.stdout.strip()
    
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    payload = {}
    
    print(f"Triggering transfer: {transfer_config_name}")
    response = requests.post(url, headers=headers, json=payload)
    
    if response.status_code == 200:
        result = response.json()
        if result.get('runs'):
            run = result['runs'][0]
            print(f"✅ Transfer started!")
            print(f"   Run: {run.get('name')}")
            return run.get('name')
    else:
        print(f"❌ Error: {response.status_code}")
        print(f"   {response.text}")
        return None


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "run":
        # Run transfer
        transfer_name = f"projects/{PROJECT_ID}/locations/us/transferConfigs/gcs-to-trades-staging"
        run_transfer(transfer_name)
    else:
        # Try Python library first, fallback to REST API
        transfer_name = None
        try:
            transfer_name = create_dts_via_python_library()
        except ImportError:
            print("Python library not available, trying REST API...")
            transfer_name = create_dts_via_gcloud()
        
        if transfer_name:
            print()
            print("=" * 80)
            print("✅ Setup complete!")
            print("=" * 80)
            print()
            print("To run the transfer manually:")
            print(f"  python create-dts-config.py run")
            print()
            print("Triggering transfer now...")
            run_transfer(transfer_name)
        else:
            print()
            print("=" * 80)
            print("⚠️  Could not create DTS config automatically")
            print("=" * 80)
            print()
            print("Please create it via Console:")
            print("  https://console.cloud.google.com/bigquery/transfers?project=gen-lang-client-0299056258")
            print()
            print("Settings:")
            print(f"  Source URI: {SOURCE_URI}")
            print(f"  Destination: {DATASET_ID}.{TABLE_ID}")
            print("  Format: JSON (Newline delimited)")
            print("  Write: Append to table")
