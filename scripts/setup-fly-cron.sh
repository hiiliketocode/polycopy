#!/bin/bash
# Setup script for Fly.io cron job (Option 1: Fly Machine approach)
# Alternative: Use GitHub Actions (see .github/workflows/sync-public-trades.yml)

set -e

APP_NAME="${FLY_APP_NAME:-polycopy}"
CRON_SECRET="${CRON_SECRET:-}"

if [ -z "$CRON_SECRET" ]; then
  echo "❌ CRON_SECRET environment variable is required"
  echo "   Get it with: flyctl secrets list -a $APP_NAME | grep CRON_SECRET"
  exit 1
fi

echo "🚀 Setting up Fly.io cron machine for $APP_NAME..."
echo ""

# Get the app URL
APP_URL="https://${APP_NAME}.fly.dev"
echo "📡 App URL: $APP_URL"
echo ""

# Create the cron machine
echo "Creating cron machine..."
flyctl machines create \
  --name cron-sync-public-trades \
  --region iad \
  --vm-size shared-cpu-1x \
  --vm-memory 256 \
  --env "APP_URL=$APP_URL" \
  --env "CRON_SECRET=$CRON_SECRET" \
  --image alpine:latest \
  --entrypoint "/bin/sh" \
  --args "-c" \
  --args "apk add --no-cache curl && while true; do curl -X GET \"\${APP_URL}/api/cron/sync-public-trades?limit=50\" -H \"Authorization: Bearer \${CRON_SECRET}\" -H \"Content-Type: application/json\" -f || echo \"Request failed at \$(date)\"; sleep 60; done" \
  -a "$APP_NAME"

echo ""
echo "✅ Cron machine created!"
echo ""
echo "📋 To check logs:"
echo "   flyctl logs -a $APP_NAME --app cron-sync-public-trades"
echo ""
echo "📋 To stop the machine:"
echo "   flyctl machines stop cron-sync-public-trades -a $APP_NAME"
echo ""
echo "📋 To destroy the machine:"
echo "   flyctl machines destroy cron-sync-public-trades -a $APP_NAME"
echo ""
echo "💡 Recommended: Use GitHub Actions instead (see .github/workflows/sync-public-trades.yml)"

