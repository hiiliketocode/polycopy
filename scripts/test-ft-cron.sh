#!/bin/bash
# Test FT cron jobs on production
# Usage: CRON_SECRET=your_secret ./scripts/test-ft-cron.sh
# Or: source .env.local && ./scripts/test-ft-cron.sh

BASE_URL="${NEXT_PUBLIC_SITE_URL:-https://polycopy.com}"
SECRET="${CRON_SECRET:-}"

if [ -z "$SECRET" ]; then
  echo "❌ CRON_SECRET not set. Run with: CRON_SECRET=xxx ./scripts/test-ft-cron.sh"
  echo "   Or add CRON_SECRET to .env.local and run: source .env.local 2>/dev/null; ./scripts/test-ft-cron.sh"
  exit 1
fi

echo "Testing FT crons on $BASE_URL"
echo ""

echo "1. GET /api/cron/ft-resolve"
RES=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $SECRET" "$BASE_URL/api/cron/ft-resolve")
HTTP=$(echo "$RES" | tail -n1)
BODY=$(echo "$RES" | sed '$d')
echo "   HTTP $HTTP"
echo "$BODY" | head -5
if [ "$HTTP" = "200" ]; then
  echo "   ✓ ft-resolve OK"
else
  echo "   ✗ ft-resolve failed"
fi
echo ""

echo "2. GET /api/cron/ft-sync"
RES=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $SECRET" "$BASE_URL/api/cron/ft-sync")
HTTP=$(echo "$RES" | tail -n1)
BODY=$(echo "$RES" | sed '$d')
echo "   HTTP $HTTP"
echo "$BODY" | head -5
if [ "$HTTP" = "200" ]; then
  echo "   ✓ ft-sync OK"
else
  echo "   ✗ ft-sync failed"
fi
echo ""

echo "Done."
