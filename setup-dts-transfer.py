"""
Setup BigQuery Data Transfer Service for GCS → BigQuery transfers
This bypasses the load job quota limits.
"""

import os
from google.cloud import bigquery_datatransfer
from google.protobuf import field_mask_pb2

PROJECT_ID = "gen-lang-client-0299056258"
DATASET_ID = "polycopy_v1"
TABLE_ID = "trades_staging"
GCS_BUCKET = f"{PROJECT_ID}-backfill-temp"
SOURCE_URI = f"gs://{GCS_BUCKET}/trades/*.jsonl"

def setup_dts_transfer():
    """Create or update a BigQuery Data Transfer Service transfer"""
    client = bigquery_datatransfer.DataTransferServiceClient()
    
    parent = f"projects/{PROJECT_ID}/locations/us"
    transfer_config_id = f"gcs-to-trades-staging"
    
    # Check if transfer already exists
    try:
        existing = client.get_transfer_config(
            name=f"{parent}/transferConfigs/{transfer_config_id}"
        )
        print(f"✅ Transfer config already exists: {existing.name}")
        print(f"   Updating existing transfer...")
        
        # Update existing transfer
        update_mask = field_mask_pb2.FieldMask()
        update_mask.paths.append("destination_dataset_id")
        update_mask.paths.append("params")
        update_mask.paths.append("schedule_options")
        
        existing.destination_dataset_id = DATASET_ID
        existing.params = {
            "data_path_template": SOURCE_URI,
            "destination_table_name_template": TABLE_ID,
            "file_format": "NEWLINE_DELIMITED_JSON",
            "write_disposition": "WRITE_APPEND",
            "max_bad_records": "0",
        }
        existing.schedule_options.disable_auto_scheduling = True  # Manual runs
        
        updated = client.update_transfer_config(
            transfer_config=existing,
            update_mask=update_mask
        )
        print(f"✅ Updated transfer config: {updated.name}")
        return updated.name
        
    except Exception as e:
        if "not found" in str(e).lower():
            print(f"Creating new transfer config...")
        else:
            print(f"⚠️  Error checking existing transfer: {e}")
            print(f"   Creating new transfer config...")
    
    # Create new transfer config
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
            disable_auto_scheduling=True  # Manual runs only
        ),
    )
    
    transfer_config = client.create_transfer_config(
        parent=parent,
        transfer_config=transfer_config,
    )
    
    print(f"✅ Created transfer config: {transfer_config.name}")
    print(f"   Source: {SOURCE_URI}")
    print(f"   Destination: {DATASET_ID}.{TABLE_ID}")
    return transfer_config.name


def run_dts_transfer(transfer_config_name: str):
    """Run a DTS transfer manually"""
    client = bigquery_datatransfer.DataTransferServiceClient()
    
    run_request = bigquery_datatransfer.StartManualTransferRunsRequest(
        parent=transfer_config_name,
        requested_run_time=None,  # Run now
    )
    
    response = client.start_manual_transfer_runs(run_request)
    
    if response.runs:
        run = response.runs[0]
        print(f"✅ Started transfer run: {run.name}")
        print(f"   Run ID: {run.run_id}")
        return run.name
    else:
        print("⚠️  No runs started")
        return None


if __name__ == "__main__":
    import sys
    
    print("=" * 80)
    print("BigQuery Data Transfer Service Setup")
    print("=" * 80)
    print(f"Project: {PROJECT_ID}")
    print(f"Source: {SOURCE_URI}")
    print(f"Destination: {DATASET_ID}.{TABLE_ID}")
    print("=" * 80)
    print()
    
    if len(sys.argv) > 1 and sys.argv[1] == "run":
        # Run existing transfer
        transfer_name = f"projects/{PROJECT_ID}/locations/us/transferConfigs/gcs-to-trades-staging"
        print("Running transfer...")
        run_dts_transfer(transfer_name)
    else:
        # Setup transfer
        transfer_name = setup_dts_transfer()
        print()
        print("=" * 80)
        print("Setup complete!")
        print("=" * 80)
        print()
        print("To run the transfer manually:")
        print(f"  python setup-dts-transfer.py run")
        print()
        print("Or use gcloud:")
        print(f"  bq mk --transfer_config --data_source=google_cloud_storage \\")
        print(f"    --target_dataset={DATASET_ID} \\")
        print(f"    --display_name='GCS to Trades Staging' \\")
        print(f"    --params='{{\"data_path_template\":\"{SOURCE_URI}\",\"destination_table_name_template\":\"{TABLE_ID}\",\"file_format\":\"NEWLINE_DELIMITED_JSON\",\"write_disposition\":\"WRITE_APPEND\"}}'")
