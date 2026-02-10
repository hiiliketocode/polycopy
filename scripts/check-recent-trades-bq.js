#!/usr/bin/env node
/**
 * Quick BigQuery check: recent trade timestamps and last sync checkpoint.
 * Loads .env.local and uses GOOGLE_APPLICATION_CREDENTIALS_JSON or ADC.
 * Run: node scripts/check-recent-trades-bq.js
 */
require('dotenv').config({ path: '.env.local' });
const { BigQuery } = require('@google-cloud/bigquery');

const PROJECT_ID = 'gen-lang-client-0299056258';
const DATASET = 'polycopy_v1';
const TRADES = `\`${PROJECT_ID}.${DATASET}.trades\``;
const CHECKPOINT = `\`${PROJECT_ID}.${DATASET}.daily_sync_checkpoint\``;

function getClient() {
  const creds = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (creds) {
    return new BigQuery({
      projectId: PROJECT_ID,
      credentials: JSON.parse(creds),
    });
  }
  return new BigQuery({ projectId: PROJECT_ID });
}

async function main() {
  const client = getClient();
  const out = { ok: true, latest_trade: null, minutes_ago: null, last_sync: null, minutes_since_sync: null, recent_timestamps: [], checkpoint: null };

  try {
    const [latestRow] = await client.query({
      query: `SELECT MAX(timestamp) AS latest_trade, TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(timestamp), MINUTE) AS minutes_ago FROM ${TRADES}`,
    });
    const r = latestRow && latestRow[0];
    if (r) {
      out.latest_trade = r.latest_trade && (r.latest_trade.value ? new Date(r.latest_trade.value).toISOString() : String(r.latest_trade));
      out.minutes_ago = r.minutes_ago != null ? Number(r.minutes_ago) : null;
    }

    const [checkpointRows] = await client.query({
      query: `SELECT last_sync_time, trades_fetched, TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), last_sync_time, MINUTE) AS minutes_since_sync FROM ${CHECKPOINT} ORDER BY last_sync_time DESC LIMIT 1`,
    });
    const cp = checkpointRows && checkpointRows[0];
    if (cp) {
      out.last_sync = cp.last_sync_time && (cp.last_sync_time.value ? new Date(cp.last_sync_time.value).toISOString() : String(cp.last_sync_time));
      out.minutes_since_sync = cp.minutes_since_sync != null ? Number(cp.minutes_since_sync) : null;
      out.checkpoint = { trades_fetched: cp.trades_fetched };
    }

    const [recentRows] = await client.query({
      query: `SELECT timestamp FROM ${TRADES} ORDER BY timestamp DESC LIMIT 10`,
    });
    out.recent_timestamps = (recentRows || []).map((row) => {
      const t = row.timestamp;
      return t && (t.value ? new Date(t.value).toISOString() : String(t));
    });
  } catch (e) {
    out.ok = false;
    out.error = e.message || String(e);
  }
  console.log(JSON.stringify(out, null, 2));
}

main();
