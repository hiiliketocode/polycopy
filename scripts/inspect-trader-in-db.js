#!/usr/bin/env node

/**
 * Inspect a wallet in the traders DB and on Polymarket leaderboard.
 * Usage: node scripts/inspect-trader-in-db.js 0x1839e2f71a9e0693b16100f13fdc1613008ece53
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

const wallet = process.argv[2]
if (!wallet) {
  console.error('Usage: node scripts/inspect-trader-in-db.js <wallet_address>')
  process.exit(1)
}

const normalized = wallet.toLowerCase().trim()

async function inspect() {
  console.log('\n🔍 Inspecting wallet in traders DB:', normalized, '\n')

  // 1. traders row
  const { data: trader, error: traderErr } = await supabase
    .from('traders')
    .select('*')
    .eq('wallet_address', normalized)
    .maybeSingle()

  if (traderErr) {
    console.error('❌ Error fetching traders:', traderErr.message)
    return
  }
  if (!trader) {
    console.log('📭 Not in traders table.')
  } else {
    console.log('✅ traders row:')
    console.log('   id:', trader.id)
    console.log('   wallet_address:', trader.wallet_address)
    console.log('   display_name:', trader.display_name ?? '(none)')
    console.log('   is_active:', trader.is_active ?? false)
    console.log('   pnl:', trader.pnl ?? '(none)')
    console.log('   volume:', trader.volume ?? '(none)')
    console.log('   roi:', trader.roi ?? '(none)')
    console.log('   rank:', trader.rank ?? '(none)')
    console.log('   total_trades:', trader.total_trades ?? '(none)')
    console.log('   win_rate:', trader.win_rate ?? '(none)')
    console.log('   created_at:', trader.created_at ?? '(none)')
    console.log('   updated_at:', trader.updated_at ?? '(none)')
  }

  // 2. trader_global_stats
  const { data: stats, error: statsErr } = await supabase
    .from('trader_global_stats')
    .select('*')
    .eq('wallet_address', normalized)
    .maybeSingle()

  if (statsErr) {
    console.log('\n⚠️  trader_global_stats error (table may not exist):', statsErr.message)
  } else if (!stats) {
    console.log('\n📭 No trader_global_stats row.')
  } else {
    console.log('\n✅ trader_global_stats:')
    console.log('   l_win_rate:', stats.l_win_rate ?? '(none)')
    console.log('   d30_win_rate:', stats.d30_win_rate ?? '(none)')
    console.log('   l_count:', stats.l_count ?? '(none)')
    console.log('   d30_count:', stats.d30_count ?? '(none)')
    console.log('   l_avg_trade_size_usd:', stats.l_avg_trade_size_usd ?? '(none)')
  }

  // 3. Polymarket leaderboard (user= lookup; VOL = how leaderboard cron fills traders)
  console.log('\n📡 Polymarket leaderboard (user lookup):')
  for (const orderBy of ['VOL', 'PNL']) {
    try {
      const url = `https://data-api.polymarket.com/v1/leaderboard?timePeriod=all&orderBy=${orderBy}&limit=1&offset=0&category=overall&user=${normalized}`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Polycopy/1.0)' },
        cache: 'no-store'
      })
      if (!res.ok) {
        console.log(`   ${orderBy}: API error`, res.status)
        continue
      }
      const entries = await res.json()
      const list = Array.isArray(entries) ? entries : []
      if (list.length === 0) {
        console.log(`   ${orderBy}: Not in leaderboard (or not in top rankings).`)
        continue
      }
      const e = list[0]
      console.log(`   By ${orderBy}: rank=${e.rank ?? 'N/A'}  pnl=${e.pnl ?? 'N/A'}  vol=${e.vol ?? 'N/A'}  win_rate=${e.win_rate ?? e.win_rate ?? 'N/A'}  total_trades=${e.total_trades ?? e.total_trades ?? 'N/A'}`)
    } catch (err) {
      console.log(`   ${orderBy}: Error`, err.message)
    }
  }
  console.log('   (Cron sync uses top 1000 by VOL; if they appear by VOL they were likely added that way.)')

  // 4. Is this wallet a PolyCopy user? (profiles, turnkey_wallets, clob_credentials)
  console.log('\n👤 Is this wallet a PolyCopy user?')
  let isUser = false
  const { data: profileByTrading } = await supabase
    .from('profiles')
    .select('id, email, trading_wallet_address, created_at')
    .ilike('trading_wallet_address', normalized)
    .maybeSingle()
  const { data: profileByWallet } = await supabase
    .from('profiles')
    .select('id, email, wallet_address, created_at')
    .ilike('wallet_address', normalized)
    .maybeSingle()
  const profile = profileByTrading || profileByWallet
  if (profile) {
    isUser = true
    console.log('   ✅ Yes — found in profiles:')
    console.log('      id:', profile.id)
    console.log('      email:', profile.email ?? '(none)')
    console.log('      created_at:', profile.created_at ?? '(none)')
  }
  const { data: twByPoly } = await supabase
    .from('turnkey_wallets')
    .select('id, user_id, polymarket_account_address, eoa_address, created_at')
    .ilike('polymarket_account_address', normalized)
  const { data: twByEoa } = await supabase
    .from('turnkey_wallets')
    .select('id, user_id, polymarket_account_address, eoa_address, created_at')
    .ilike('eoa_address', normalized)
  const twRows = [...(twByPoly || []), ...(twByEoa || [])].filter((r, i, a) => a.findIndex(x => x.id === r.id) === i)
  if (twRows.length > 0) {
    isUser = true
    console.log('   ✅ Yes — found in turnkey_wallets:')
    twRows.forEach((tw, i) => console.log(`      [${i}] user_id=${tw.user_id}  polymarket=${tw.polymarket_account_address ?? 'N/A'}  eoa=${tw.eoa_address ?? 'N/A'}  created=${tw.created_at ?? 'N/A'}`))
  }
  const { data: clobRows } = await supabase
    .from('clob_credentials')
    .select('user_id, polymarket_account_address, created_at')
    .ilike('polymarket_account_address', normalized)
  if (clobRows && clobRows.length > 0) {
    isUser = true
    console.log('   ✅ Yes — found in clob_credentials:')
    clobRows.forEach((c, i) => console.log(`      [${i}] user_id=${c.user_id}  polymarket=${c.polymarket_account_address ?? 'N/A'}  created=${c.created_at ?? 'N/A'}`))
  }
  if (!isUser) {
    console.log('   📭 No — not in profiles, turnkey_wallets, or clob_credentials.')
  }

  console.log('\n💡 See docs/investigation-wallet-in-traders-db.md for how wallets get into the DB and options (e.g. set is_active=false).\n')
}

inspect().catch((err) => {
  console.error(err)
  process.exit(1)
})
