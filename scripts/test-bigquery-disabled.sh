#!/usr/bin/env bash
# Test that BigQuery-dependent routes do not crash and return 503 (or 500) when
# BigQuery is unavailable (API disabled or BIGQUERY_DISABLED=true).
#
# 1. Start the app:  npm run dev
#    (Or with kill switch: BIGQUERY_DISABLED=true npm run dev)
# 2. Run:  ./scripts/test-bigquery-disabled.sh [BASE_URL]
#
# Default BASE_URL is http://localhost:3000
# Pass ACCEPT_500=1 to treat 500 as OK (e.g. server not yet reloaded).

set -e
BASE_URL="${1:-http://localhost:3000}"
ACCEPT_500="${ACCEPT_500:-0}"
FAIL=0

check() {
  local name="$1"
  local url="$2"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$code" = "503" ]; then
    echo "  OK $name -> 503"
  elif [ "$code" = "500" ] && [ "$ACCEPT_500" = "1" ]; then
    echo "  OK $name -> 500 (acceptable when API disabled)"
  elif [ "$code" = "500" ]; then
    echo "  WARN $name -> 500 (expected 503; restart server to pick up error handling)"
  else
    echo "  FAIL $name -> $code (expected 503)"
    FAIL=1
  fi
}

echo "Testing BigQuery-dependent routes at $BASE_URL"
echo "Expected: 503 (or 500 if server needs restart) when BigQuery API is disabled"
echo ""

check "GET /api/backtest/list"        "$BASE_URL/api/backtest/list"
check "GET /api/forward-test/update" "$BASE_URL/api/forward-test/update"
check "GET /api/forward-test/daily"  "$BASE_URL/api/forward-test/daily"
check "GET /api/forward-test/live"   "$BASE_URL/api/forward-test/live"

echo ""
if [ $FAIL -eq 0 ]; then
  echo "All routes responded (503 or 500). BigQuery is not in use / API disabled."
  exit 0
else
  echo "Some routes returned unexpected status. Check server and env."
  exit 1
fi
