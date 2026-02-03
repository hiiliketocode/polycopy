#!/bin/bash
# Backfill subscription data with env vars loaded

# Load environment variables
if [ -f .env.local ]; then
    set -a
    source .env.local
    set +a
fi

# Run the backfill script
node scripts/backfill-subscription-data.js
