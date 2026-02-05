# BigQuery Setup - Completed

## Authentication Status
✅ **Successfully configured and tested on Feb 4, 2026**

## Configuration Details

### Service Account
- **Email**: `brad-access@gen-lang-client-0299056258.iam.gserviceaccount.com`
- **Project ID**: `gen-lang-client-0299056258`
- **Credentials File**: `~/.config/gcloud/polycopy-key.json`

### Environment Variable
Added to `~/.zshrc`:
```bash
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/gcloud/polycopy-key.json"
```

### Available Dataset
- `polycopy_v1` - Main dataset for Polycopy data

## Usage in Python

```python
from google.cloud import bigquery

# Create a BigQuery client
client = bigquery.Client(project='gen-lang-client-0299056258')

# Example: List datasets
datasets = list(client.list_datasets())
for dataset in datasets:
    print(dataset.dataset_id)

# Example: Run a query
query = """
    SELECT *
    FROM `gen-lang-client-0299056258.polycopy_v1.your_table`
    LIMIT 10
"""
results = client.query(query)
for row in results:
    print(row)
```

## Troubleshooting

### If connection fails:
1. Verify environment variable is set:
   ```bash
   echo $GOOGLE_APPLICATION_CREDENTIALS
   ```
   Should show: `/Users/bradmichelson/.config/gcloud/polycopy-key.json`

2. Verify credentials file exists:
   ```bash
   ls -la ~/.config/gcloud/polycopy-key.json
   ```

3. Restart your terminal or Cursor to reload environment variables

### Python Version Note
The system is currently running Python 3.9.6, which is past its end of life. Consider upgrading to Python 3.10+ for better support and security updates.

## Next Steps

Now that BigQuery is set up, you can:
1. Query data from the `polycopy_v1` dataset
2. Run analytics and reports
3. Integrate BigQuery data into the Polycopy application
4. Use AI assistance in Cursor to write and execute BigQuery queries
