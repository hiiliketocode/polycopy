#!/usr/bin/env node

/**
 * Diagnose LT state after DB outage.
 * Checks: lt_strategies capital, lt_orders counts, lt_cooldown_queue.
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  console.log('=== LT DIAGNOSTIC ===\n')

  // 1. Check all strategies
  const { data: strategies, error: stratErr } = await supabase
    .from('lt_strategies')
    .select('strategy_id, display_name, initial_capital, available_cash, locked_capital, cooldown_capital, daily_spent_usd, current_drawdown_pct, is_active, is_paused')
    .order('created_at', { ascending: false })

  if (stratErr) {
    console.error('Error fetching strategies:', stratErr.message)
    return
  }

  console.log(`Found ${strategies.length} LT strategies\n`)

  for (const s of strategies) {
    const equity = Number(s.available_cash) + Number(s.locked_capital) + Number(s.cooldown_capital)
    console.log(`--- ${s.strategy_id} (${s.display_name}) ---`)
    console.log(`  Status: ${s.is_active ? (s.is_paused ? 'PAUSED' : 'ACTIVE') : 'INACTIVE'}`)
    console.log(`  Initial: $${s.initial_capital}  |  Equity: $${equity.toFixed(2)}`)
    console.log(`  Available: $${s.available_cash}  |  Locked: $${s.locked_capital}  |  Cooldown: $${s.cooldown_capital}`)
    console.log(`  Daily Spent: $${s.daily_spent_usd}  |  Drawdown: ${(Number(s.current_drawdown_pct) * 100).toFixed(2)}%`)

    // Count orders by status
    const { data: orders, error: ordErr } = await supabase
      .from('lt_orders')
      .select('status, outcome')
      .eq('strategy_id', s.strategy_id)

    let total = 0, open = 0, won = 0, lost = 0, pending = 0, filled = 0, rejected = 0, cancelled = 0
    if (ordErr) {
      console.log(`  Orders: ERROR - ${ordErr.message}`)
    } else {
      total = orders.length
      open = orders.filter(o => o.outcome === 'OPEN').length
      won = orders.filter(o => o.outcome === 'WON').length
      lost = orders.filter(o => o.outcome === 'LOST').length
      pending = orders.filter(o => o.status === 'PENDING').length
      filled = orders.filter(o => o.status === 'FILLED').length
      rejected = orders.filter(o => o.status === 'REJECTED').length
      cancelled = orders.filter(o => o.status === 'CANCELLED').length
      console.log(`  Orders: ${total} total (${open} open, ${won} won, ${lost} lost, ${pending} pending, ${filled} filled, ${rejected} rejected, ${cancelled} cancelled)`)
    }

    // Check cooldown queue
    const { data: cooldowns } = await supabase
      .from('lt_cooldown_queue')
      .select('id, amount, released_at')
      .eq('strategy_id', s.strategy_id)

    const unreleased = (cooldowns || []).filter(c => !c.released_at)
    const releasedCount = (cooldowns || []).filter(c => c.released_at).length
    const unreleasedTotal = unreleased.reduce((sum, c) => sum + Number(c.amount), 0)
    console.log(`  Cooldown queue: ${(cooldowns || []).length} entries (${unreleased.length} unreleased = $${unreleasedTotal.toFixed(2)}, ${releasedCount} released)`)

    // Flag issues
    const issues = []
    if (Number(s.locked_capital) > 0 && open === 0 && pending === 0 && !ordErr) {
      issues.push(`STUCK LOCKED: $${s.locked_capital} locked but 0 open/pending orders`)
    }
    if (Number(s.cooldown_capital) > 0 && unreleased.length === 0) {
      issues.push(`STUCK COOLDOWN: $${s.cooldown_capital} in cooldown but 0 queue entries`)
    }
    if (Math.abs(equity - Number(s.initial_capital)) > 0.01 && total === 0 && !ordErr) {
      issues.push(`EQUITY DRIFT: equity $${equity.toFixed(2)} != initial $${s.initial_capital} but 0 orders`)
    }
    if (total > 500 && rejected > 400) {
      issues.push(`QUERY OVERFLOW: ${rejected} rejected orders will crowd out ${filled} filled in 500-row limit`)
    }
    if (issues.length > 0) {
      console.log(`  ⚠️  ISSUES:`)
      issues.forEach(i => console.log(`     - ${i}`))
    } else {
      console.log(`  ✓ No issues detected`)
    }
    console.log()
  }

  // Global lt_orders count
  const { count: totalOrders } = await supabase
    .from('lt_orders')
    .select('*', { count: 'exact', head: true })
  console.log(`=== Total lt_orders in DB: ${totalOrders} ===`)

  // Global cooldown queue
  const { count: totalCooldowns } = await supabase
    .from('lt_cooldown_queue')
    .select('*', { count: 'exact', head: true })
  console.log(`=== Total lt_cooldown_queue entries: ${totalCooldowns} ===`)
}

main().catch(console.error)
