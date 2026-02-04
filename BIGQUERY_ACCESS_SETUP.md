# How to Give Your Cofounder Access to BigQuery

## Quick Steps

### Option 1: Add via Google Cloud Console (Recommended)

1. **Go to Google Cloud Console**
   - Navigate to: https://console.cloud.google.com/
   - Make sure you're in the project: `gen-lang-client-0299056258`

2. **Open IAM & Admin**
   - Click the hamburger menu (☰) in the top left
   - Go to **IAM & Admin** → **IAM**

3. **Add Your Cofounder**
   - Click **Grant Access** (or **+ ADD** button)
   - Enter your cofounder's **Google account email address**
   - Click **Select a role**

4. **Choose Appropriate Role**
   
   **For Read-Only Access (Recommended for analysts):**
   - Search for and select: **BigQuery Data Viewer**
   - This allows them to:
     - View datasets and tables
     - Run queries
     - Export data
     - But NOT modify or delete data

   **For Query Access Only:**
   - Search for and select: **BigQuery Job User**
   - This allows them to:
     - Run queries
     - But NOT view data without explicit dataset permissions

   **For Full Read/Write Access:**
   - Search for and select: **BigQuery Data Editor**
   - This allows them to:
     - View and query data
     - Create/update/delete tables
     - Modify datasets
     - ⚠️ Use with caution!

   **For Admin Access:**
   - Search for and select: **BigQuery Admin**
   - Full control over BigQuery resources
   - ⚠️ Only grant if absolutely necessary

5. **Save**
   - Click **Save**
   - Your cofounder will receive an email notification

### Option 2: Grant Dataset-Specific Access

If you want to limit access to only the `polycopy_v1` dataset:

1. **Go to BigQuery Console**
   - Navigate to: https://console.cloud.google.com/bigquery
   - Select project: `gen-lang-client-0299056258`

2. **Select the Dataset**
   - In the left sidebar, expand your project
   - Click on the dataset: `polycopy_v1`
   - Click the **Sharing** icon (👤) or **SHARING** tab

3. **Add Dataset Access**
   - Click **Add Principal**
   - Enter your cofounder's email
   - Select role:
     - **BigQuery Data Viewer** - Read-only
     - **BigQuery Data Editor** - Read/Write
   - Click **Save**

### Option 3: Using gcloud CLI

If you prefer command line:

```bash
# Install gcloud CLI if not already installed
# https://cloud.google.com/sdk/docs/install

# Authenticate
gcloud auth login

# Set the project
gcloud config set project gen-lang-client-0299056258

# Grant BigQuery Data Viewer role (read-only)
gcloud projects add-iam-policy-binding gen-lang-client-0299056258 \
  --member="user:cofounder@example.com" \
  --role="roles/bigquery.dataViewer"

# Grant BigQuery Job User role (can run queries)
gcloud projects add-iam-policy-binding gen-lang-client-0299056258 \
  --member="user:cofounder@example.com" \
  --role="roles/bigquery.jobUser"

# For dataset-specific access only:
bq add-iam-policy-binding \
  --member="user:cofounder@example.com" \
  --role="roles/bigquery.dataViewer" \
  gen-lang-client-0299056258:polycopy_v1
```

## Recommended Setup

For most use cases, grant these two roles:

1. **BigQuery Data Viewer** (`roles/bigquery.dataViewer`)
   - Allows reading data and running queries

2. **BigQuery Job User** (`roles/bigquery.jobUser`)
   - Allows creating and running query jobs

## What Your Cofounder Needs to Do

After you grant access, your cofounder should:

1. **Accept the invitation** (if sent via email)

2. **Access BigQuery Console**
   - Go to: https://console.cloud.google.com/bigquery
   - Make sure they're logged in with the Google account you added
   - Select project: `gen-lang-client-0299056258`

3. **Verify Access**
   - They should see the `polycopy_v1` dataset in the left sidebar
   - They can run queries like:
     ```sql
     SELECT COUNT(*) 
     FROM `gen-lang-client-0299056258.polycopy_v1.trades`
     LIMIT 10;
     ```

## For Cursor IDE / API Access (Service Account JSON Key)

To give your cofounder API access so they can use BigQuery in Cursor:

### Step 1: Create a Service Account (You Do This)

1. **Go to Google Cloud Console**
   - Navigate to: https://console.cloud.google.com/
   - Select project: `gen-lang-client-0299056258`

2. **Create Service Account**
   - Go to **IAM & Admin** → **Service Accounts**
   - Click **Create Service Account**
   - Name: `cursor-cofounder-access` (or similar)
   - Description: `Service account for Cursor IDE BigQuery access`
   - Click **Create and Continue**

3. **Grant Permissions**
   - Add these roles:
     - **BigQuery Data Viewer** - Read data and run queries
     - **BigQuery Job User** - Create and run query jobs
   - Click **Continue** → **Done**

4. **Create and Download JSON Key**
   - Click on the service account you just created
   - Go to **Keys** tab
   - Click **Add Key** → **Create new key**
   - Select **JSON** format
   - Click **Create** - This downloads a JSON file
   - **⚠️ Keep this file secure!** Share it securely with your cofounder (use encrypted file sharing, not email)

### Step 2: Your Cofounder Sets Up Cursor

1. **Save the JSON Key File**
   - Save the downloaded JSON file securely (e.g., `~/.config/gcloud/polycopy-bigquery-key.json`)
   - **Never commit this file to git!**

2. **Set Environment Variable (Recommended)**
   
   **macOS/Linux:**
   ```bash
   # Add to ~/.zshrc or ~/.bashrc
   export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/gcloud/polycopy-bigquery-key.json"
   
   # Or for this session only:
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/polycopy-bigquery-key.json"
   ```

   **Windows:**
   ```powershell
   # PowerShell
   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\polycopy-bigquery-key.json"
   
   # Or set permanently:
   [System.Environment]::SetEnvironmentVariable('GOOGLE_APPLICATION_CREDENTIALS', 'C:\path\to\polycopy-bigquery-key.json', 'User')
   ```

3. **Restart Cursor**
   - Close and reopen Cursor so it picks up the environment variable

4. **Test in Cursor**
   - Create a Python file and test:
   ```python
   from google.cloud import bigquery
   
   client = bigquery.Client(project='gen-lang-client-0299056258')
   query = "SELECT COUNT(*) as count FROM `gen-lang-client-0299056258.polycopy_v1.trades`"
   results = client.query(query).result()
   for row in results:
       print(f"Total trades: {row.count}")
   ```

### Alternative: Use Application Default Credentials

If your cofounder prefers using their personal Google account:

1. **Install Google Cloud SDK**
   ```bash
   # macOS
   brew install google-cloud-sdk
   ```

2. **Authenticate**
   ```bash
   gcloud auth application-default login
   ```

3. **Set Project**
   ```bash
   gcloud config set project gen-lang-client-0299056258
   ```

4. **Cursor will automatically use these credentials**

### For Cursor AI Features with BigQuery

Cursor's AI features can use BigQuery if:
- The `GOOGLE_APPLICATION_CREDENTIALS` environment variable is set
- Or Application Default Credentials are configured
- The credentials have the necessary BigQuery permissions

Cursor will automatically detect and use these credentials when you reference BigQuery in your code.

## For Local Development (Python Scripts)

If your cofounder wants to run Python scripts locally:

1. **Install Google Cloud SDK**
   ```bash
   # macOS
   brew install google-cloud-sdk
   
   # Or download from: https://cloud.google.com/sdk/docs/install
   ```

2. **Authenticate** (if using personal account)
   ```bash
   gcloud auth application-default login
   ```

   **OR** set the service account JSON:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
   ```

3. **Set Project**
   ```bash
   gcloud config set project gen-lang-client-0299056258
   ```

4. **Install Python Library**
   ```bash
   pip install google-cloud-bigquery
   ```

5. **Test Access**
   ```python
   from google.cloud import bigquery
   
   client = bigquery.Client(project='gen-lang-client-0299056258')
   query = "SELECT COUNT(*) as count FROM `gen-lang-client-0299056258.polycopy_v1.trades`"
   results = client.query(query).result()
   for row in results:
       print(f"Total trades: {row.count}")
   ```

## Troubleshooting

### "Permission Denied" Errors

- **Check IAM roles**: Make sure the correct roles are assigned
- **Wait a few minutes**: IAM changes can take 1-2 minutes to propagate
- **Check project**: Ensure they're accessing the correct project (`gen-lang-client-0299056258`)
- **Check email**: Verify the email address is correct and matches their Google account

### Can't See Dataset

- **Refresh browser**: Hard refresh (Cmd+Shift+R or Ctrl+Shift+R)
- **Check dataset permissions**: They might need dataset-level permissions in addition to project-level
- **Verify project selection**: Make sure they've selected the correct project in BigQuery console

### Query Errors

- **Check quota**: BigQuery has query quotas that might be exhausted
- **Check billing**: Ensure the project has billing enabled (if required)
- **Check table names**: Verify table names match exactly (case-sensitive)

## Security Best Practices

1. **Principle of Least Privilege**: Only grant the minimum permissions needed
2. **Use Dataset-Level Permissions**: When possible, grant access to specific datasets rather than the entire project
3. **Regular Audits**: Periodically review who has access and remove unnecessary permissions
4. **Monitor Usage**: Check BigQuery audit logs to see who's accessing what

## Project Information

- **Project ID**: `gen-lang-client-0299056258`
- **Dataset**: `polycopy_v1`
- **Main Tables**:
  - `trades`
  - `markets`
  - `trader_profile_stats`
  - `trader_global_stats`

## Quick Reference: Service Account Setup for Cursor

**TL;DR for giving your cofounder Cursor access:**

1. **You create service account:**
   - Google Cloud Console → IAM & Admin → Service Accounts → Create
   - Grant: `BigQuery Data Viewer` + `BigQuery Job User`
   - Create JSON key → Download → Share securely

2. **Cofounder sets up:**
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json"
   ```
   - Restart Cursor
   - Done! Cursor can now access BigQuery

## Additional Resources

- [BigQuery IAM Documentation](https://cloud.google.com/bigquery/docs/access-control)
- [BigQuery Roles Reference](https://cloud.google.com/bigquery/docs/access-control#roles)
- [Google Cloud IAM Guide](https://cloud.google.com/iam/docs/overview)
- [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials)
- [Service Account Best Practices](https://cloud.google.com/iam/docs/best-practices-service-accounts)
