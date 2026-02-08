#!/usr/bin/env node
/**
 * Create FT_TOP_DAILY_WINNERS and FT_TOP_7D_WINNERS strategies.
 * These strategies copy top 10 traders by realized PnL (yesterday vs last 7 days).
 * The rotate-pnl-winners cron (3am UTC) updates target_traders daily.
 *
 * Run: node scripts/init-pnl-winner-strategies.js
 * Requires: NEXT_PUBLIC_APP_URL (or defaults to localhost:3000)
 */

const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const STRATEGIES = [
  {
    wallet_id: 'FT_TOP_DAILY_WINNERS',
    display_name: 'T3 Yesterday\'s Winners',
    description: 'Top 10 traders by yesterday\'s realized PnL (from wallet_realized_pnl_daily). Target traders rotated daily at 3am UTC.',
    target_traders: [], // populated by cron
    min_trader_resolved_count: 10,
  },
  {
    wallet_id: 'FT_TOP_7D_WINNERS',
    display_name: 'T3 Last 7 Days Winners',
    description: 'Top 10 traders by realized PnL over the last 7 days. Target traders rotated daily at 3am UTC.',
    target_traders: [],
    min_trader_resolved_count: 10,
  },
]

async function createStrategy(s) {
  const body = {
    wallet_id: s.wallet_id,
    display_name: s.display_name,
    description: s.description,
    target_traders: s.target_traders,
    min_trader_resolved_count: s.min_trader_resolved_count,
    min_edge: 0,
    min_bet: 8,
    max_bet: 8,
    bet_size: 8,
    allocation_method: 'FIXED',
  }

  const res = await fetch(`${base}/api/ft/add-wallet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  if (data.success) {
    console.log(`  ✓ ${s.wallet_id}`)
  } else {
    console.log(`  ✗ ${s.wallet_id}: ${data.error || 'failed'}`)
  }
}

async function main() {
  console.log('Creating PnL-winner FT strategies (target_traders filled by 3am cron)\n')

  for (const s of STRATEGIES) {
    await createStrategy(s)
  }

  console.log('\nDone. Run the rotate-pnl-winners cron or POST /api/cron/rotate-pnl-winners to seed target_traders.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
