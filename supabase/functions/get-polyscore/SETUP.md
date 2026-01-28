# Quick Setup Guide: Google Cloud BigQuery Integration

This guide walks you through setting up Google Cloud credentials for the PolyScore Edge Function.

## Step 1: Create a Google Cloud Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to **IAM & Admin** → **Service Accounts**
4. Click **Create Service Account**
5. Fill in the details:
   - **Name**: `polycopy-edge-function`
   - **Description**: `Service account for Supabase Edge Function BigQuery access`
6. Click **Create and Continue**

## Step 2: Grant BigQuery Permissions

1. In the **Grant this service account access to project** section, add these roles:
   - `BigQuery Job User` - Allows creating and running queries
   - `BigQuery Data Viewer` - Allows reading data from datasets
   - `BigQuery ML User` - Allows using ML models
2. Click **Continue** → **Done**

## Step 3: Create and Download JSON Key

1. Click on the service account you just created
2. Go to the **Keys** tab
3. Click **Add Key** → **Create new key**
4. Select **JSON** format
5. Click **Create** - This will download a JSON file

**⚠️ Important**: Keep this file secure! Never commit it to version control.

## Step 4: Extract Required Information

Open the downloaded JSON file. You'll need:

1. **Project ID**: Found in the `project_id` field
2. **Full JSON**: The entire contents of the file

Example JSON structure:
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "polycopy-edge-function@your-project-id.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  ...
}
```

## Step 5: Set Supabase Environment Variables

### Option A: Using Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard
2. Navigate to **Project Settings** → **Edge Functions** → **Secrets**
3. Add the following secrets:

   **Secret 1:**
   - **Name**: `GOOGLE_CLOUD_PROJECT_ID`
   - **Value**: Your project ID (e.g., `your-project-id`)

   **Secret 2:**
   - **Name**: `GOOGLE_CLOUD_CREDENTIALS_JSON`
   - **Value**: The **entire JSON file contents** as a single string
   
   **Important**: When pasting the JSON:
   - Copy the entire JSON file contents
   - Paste it as-is (it should be a valid JSON string)
   - Make sure there are no extra quotes or escaping issues

### Option B: Using Supabase CLI

```bash
# Set project ID
supabase secrets set GOOGLE_CLOUD_PROJECT_ID=your-project-id

# Set credentials JSON (replace with your actual JSON)
supabase secrets set GOOGLE_CLOUD_CREDENTIALS_JSON='{"type":"service_account","project_id":"your-project-id",...}'
```

**Note**: When using the CLI, you may need to escape the JSON properly. For complex JSON, it's easier to use the dashboard.

## Step 6: Verify BigQuery Dataset and Model

Ensure your BigQuery project has:

1. **Dataset**: `polycopy_v1`
2. **View**: `enriched_trades_v5_final` within the dataset
3. **ML Model**: `trade_predictor_v5` within the dataset

You can verify this in the [BigQuery Console](https://console.cloud.google.com/bigquery):

```sql
-- Check dataset exists
SELECT schema_name 
FROM `your-project-id.polycopy_v1.INFORMATION_SCHEMA.SCHEMATA`
WHERE schema_name = 'polycopy_v1';

-- Check view exists
SELECT table_name 
FROM `your-project-id.polycopy_v1.INFORMATION_SCHEMA.TABLES`
WHERE table_name = 'enriched_trades_v5_final';

-- Check model exists
SELECT model_name 
FROM `your-project-id.polycopy_v1.INFORMATION_SCHEMA.MODELS`
WHERE model_name = 'trade_predictor_v5';
```

## Step 7: Test the Function

After deployment, test with a curl command:

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/get-polyscore \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "wallet_address": "0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee",
    "condition_id": "0x1b09ac075e84860496aa9e11b7b6c63aec170a955cf3ee1fa0b4f383d4ba0a8c",
    "current_price": 0.6815,
    "user_slippage": 0.05
  }'
```

## Troubleshooting

### "GOOGLE_CLOUD_PROJECT_ID environment variable is required"
- Verify the secret is set correctly in Supabase dashboard
- Check the secret name matches exactly (case-sensitive)

### "Failed to parse GOOGLE_CLOUD_CREDENTIALS_JSON"
- Ensure the entire JSON is pasted as a single string
- Verify the JSON is valid (use a JSON validator)
- Check for any extra quotes or escaping issues

### "Permission denied" or "Access Denied" errors
- Verify the service account has the required BigQuery roles
- Check that the service account email matches the one in your JSON key
- Ensure the dataset and model exist and are accessible

### "Dataset not found" or "Model not found"
- Verify the dataset name is exactly `polycopy_v1`
- Verify the view name is exactly `enriched_trades_v5_final`
- Verify the model name is exactly `trade_predictor_v5`
- Check that your BigQuery project ID matches the one in the credentials

## Security Best Practices

1. ✅ **Never commit credentials to git** - Use Supabase secrets
2. ✅ **Rotate keys regularly** - Create new keys every 90 days
3. ✅ **Use least privilege** - Only grant necessary BigQuery permissions
4. ✅ **Monitor usage** - Set up BigQuery usage alerts
5. ✅ **Use separate service accounts** - One for dev, one for production

## Cost Considerations

- BigQuery queries are billed per query
- ML predictions have additional costs
- Monitor your BigQuery usage dashboard
- Consider implementing caching for frequently requested trades
- Set up budget alerts in Google Cloud Console
