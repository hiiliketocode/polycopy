#!/bin/bash

# Force refresh Supabase PostgREST schema cache via API
# This might require admin access

set -e

# Load env vars
export $(grep -v '^#' .env.local | grep -v '^$' | xargs)

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}"
SUPABASE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
    echo "Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
    exit 1
fi

echo "Attempting to refresh PostgREST schema cache..."

# Method 1: Try NOTIFY via REST API
curl -X POST "${SUPABASE_URL}/rest/v1/rpc/notify" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"channel": "pgrst", "payload": "reload schema"}' \
  2>&1 || echo "Method 1 failed (might not be available)"

echo ""
echo "If that didn't work, try:"
echo "1. Wait 5-10 minutes for auto-refresh"
echo "2. Or recreate tables using verify-and-fix-stats-tables.sql"
echo "3. Or restart PostgREST via Supabase Dashboard → Settings → API"
