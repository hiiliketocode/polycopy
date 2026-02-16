#!/bin/bash
# Test the new trading system components.
# Requires: CRON_SECRET in env, or pass as first arg.
# Usage: ./scripts/test-trading-system.sh [CRON_SECRET]
# Or: CRON_SECRET=xxx ./scripts/test-trading-system.sh

set -e
BASE="${POLYCOPY_API_URL:-https://polycopy.app}"
SECRET="${1:-$CRON_SECRET}"

if [ -z "$SECRET" ]; then
  echo "⚠ CRON_SECRET required. Set env or pass as arg: ./scripts/test-trading-system.sh YOUR_SECRET"
  exit 1
fi

echo "=== Trading System Tests ==="
echo "Base URL: $BASE"
echo ""

# 1. Worker health
echo "1. Worker health (polycopy-trade-stream.fly.dev)..."
WORKER_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://polycopy-trade-stream.fly.dev/ || echo "000")
if [ "$WORKER_STATUS" = "200" ]; then
  echo "   ✓ Worker healthy (200)"
else
  echo "   ✗ Worker returned $WORKER_STATUS"
fi

# 2. Target traders API
echo ""
echo "2. GET /api/ft/target-traders..."
TARGET_RES=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $SECRET" "$BASE/api/ft/target-traders")
TARGET_HTTP=$(echo "$TARGET_RES" | tail -1)
TARGET_BODY=$(echo "$TARGET_RES" | sed '$d')
if [ "$TARGET_HTTP" = "200" ]; then
  COUNT=$(echo "$TARGET_BODY" | grep -o '"count":[0-9]*' | cut -d: -f2)
  echo "   ✓ Target traders OK (count=$COUNT)"
else
  echo "   ✗ Target traders returned $TARGET_HTTP"
  echo "$TARGET_BODY" | head -3
fi

# 3. MCP strategies API
echo ""
echo "3. GET /api/mcp/strategies..."
MCP_RES=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $SECRET" "$BASE/api/mcp/strategies")
MCP_HTTP=$(echo "$MCP_RES" | tail -1)
MCP_BODY=$(echo "$MCP_RES" | sed '$d')
if [ "$MCP_HTTP" = "200" ]; then
  STRAT_COUNT=$(echo "$MCP_BODY" | grep -o '"strategies_count":[0-9]*' | cut -d: -f2)
  echo "   ✓ MCP strategies OK (strategies_count=$STRAT_COUNT)"
else
  echo "   ✗ MCP strategies returned $MCP_HTTP"
  echo "$MCP_BODY" | head -3
fi

# 4. Sync-trade (POST - dry run, will likely return early if no matching trade)
echo ""
echo "4. POST /api/ft/sync-trade (invalid trade - expect 400 or early return)..."
SYNC_RES=$(curl -s -w "\n%{http_code}" -X POST -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" \
  -d '{"trade":{"proxyWallet":"0x0000000000000000000000000000000000000000","conditionId":"0x0","side":"BUY","price":0.5,"size":10}}' \
  "$BASE/api/ft/sync-trade")
SYNC_HTTP=$(echo "$SYNC_RES" | tail -1)
if [ "$SYNC_HTTP" = "200" ] || [ "$SYNC_HTTP" = "400" ]; then
  echo "   ✓ Sync-trade endpoint reachable ($SYNC_HTTP)"
else
  echo "   ✗ Sync-trade returned $SYNC_HTTP"
fi

echo ""
echo "=== Done ==="
