/**
 * Verify an LT order against the Polymarket CLOB (public trades + getOrder).
 * Use this to confirm whether a large executed_size_usd in our DB actually
 * exists on the CLOB for the user's wallet.
 *
 * Usage: npx tsx scripts/verify-lt-order-clob.ts <order_id>
 * Example: npx tsx scripts/verify-lt-order-clob.ts 0xceefb063a81180bb1ebfb68e525520b2b3b6e69bc8ba153c5188bd07bc5a93e2
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const orderId = process.argv[2]?.trim();
if (!orderId) {
  console.error('Usage: npx tsx scripts/verify-lt-order-clob.ts <order_id>');
  process.exit(1);
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Load lt_order by order_id
  const { data: ltOrder, error: orderError } = await supabase
    .from('lt_orders')
    .select(
      'lt_order_id, user_id, order_id, strategy_id, signal_size_usd, executed_size_usd, executed_price, shares_bought, condition_id, market_title, token_label, status'
    )
    .eq('order_id', orderId)
    .maybeSingle();

  if (orderError || !ltOrder) {
    console.error('LT order not found for order_id:', orderId, orderError?.message || '');
    process.exit(1);
  }

  console.log('--- DB (lt_orders) ---');
  console.log('  strategy_id:', ltOrder.strategy_id);
  console.log('  market_title:', ltOrder.market_title);
  console.log('  token_label:', ltOrder.token_label);
  console.log('  signal_size_usd:', ltOrder.signal_size_usd);
  console.log('  executed_size_usd:', ltOrder.executed_size_usd);
  console.log('  executed_price:', ltOrder.executed_price);
  console.log('  shares_bought:', ltOrder.shares_bought);
  console.log('  condition_id:', ltOrder.condition_id);
  console.log('  status:', ltOrder.status);

  const userId = ltOrder.user_id;
  if (!userId) {
    console.error('LT order has no user_id');
    process.exit(1);
  }

  // 2) Get user's Polymarket wallet
  const { data: walletRow } = await supabase
    .from('turnkey_wallets')
    .select('polymarket_account_address')
    .eq('user_id', userId)
    .not('polymarket_account_address', 'is', null)
    .limit(1)
    .maybeSingle();

  const wallet = (walletRow as any)?.polymarket_account_address;
  if (!wallet) {
    console.error('No Polymarket wallet found for user_id:', userId);
    process.exit(1);
  }
  const walletLower = wallet.toLowerCase();
  console.log('\n--- Wallet ---');
  console.log('  user_id:', userId);
  console.log('  polymarket_account_address:', wallet);

  // 3) Public CLOB trades for this wallet (no auth – truth from CLOB)
  console.log('\n--- CLOB public trades (GET /trades?user=...) ---');
  let clobTrades: any[] = [];
  try {
    const res = await fetch(
      `https://clob.polymarket.com/trades?user=${walletLower}&limit=200`,
      { headers: { 'User-Agent': 'Polycopy' }, cache: 'no-store' }
    );
    if (res.ok) {
      const data = await res.json();
      clobTrades = data.data ?? data.trades ?? (Array.isArray(data) ? data : []);
    } else {
      console.log('  CLOB trades API error:', res.status, await res.text());
    }
  } catch (e: any) {
    console.log('  Fetch error:', e?.message);
  }

  console.log('  Total trades returned for wallet:', clobTrades.length);

  // Filter by market (condition_id). CLOB trade may have "market" or "condition_id"
  const conditionId = ltOrder.condition_id;
  const tradesForMarket = (clobTrades as any[]).filter(
    (t: any) =>
      (t.market && t.market.toLowerCase() === conditionId?.toLowerCase()) ||
      (t.condition_id && t.condition_id.toLowerCase() === conditionId?.toLowerCase())
  );

  let clobSumUsd = 0;
  for (const t of tradesForMarket) {
    const size = parseFloat(t.size ?? t.amount ?? 0) || 0;
    const price = parseFloat(t.price ?? 0) || 0;
    clobSumUsd += size * price;
  }
  console.log('  Trades for this market (condition_id):', tradesForMarket.length);
  console.log('  Sum(size × price) on CLOB for this market:', clobSumUsd.toFixed(2), 'USD');
  if (tradesForMarket.length > 0) {
    console.log('  Sample trade:', JSON.stringify(tradesForMarket[0], null, 2));
  }

  // 4) getOrder with user auth (optional – confirms order exists and belongs to this user)
  console.log('\n--- CLOB getOrder (authenticated) ---');
  let clobOrder: any = null;
  try {
    const { getAuthedClobClientForUserAnyWallet } = await import('../lib/polymarket/authed-client');
    const { requireEvomiProxyAgent } = await import('../lib/evomi/proxy');
    try {
      await requireEvomiProxyAgent('verify-lt-order-clob');
    } catch {
      // ignore
    }
    const { client } = await getAuthedClobClientForUserAnyWallet(userId);
    clobOrder = await client.getOrder(orderId);
  } catch (e: any) {
    console.log('  getOrder failed:', e?.message || e);
  }

  if (clobOrder) {
    const price = parseFloat(clobOrder.price || 0) || 0;
    const sizeMatched = parseFloat(clobOrder.size_matched || 0) || 0;
    const impliedUsd = sizeMatched * price;
    console.log('  Order found on CLOB.');
    console.log('  price:', clobOrder.price);
    console.log('  size_matched:', clobOrder.size_matched);
    console.log('  implied USD (size_matched × price):', impliedUsd.toFixed(2));
    console.log('  market:', clobOrder.market);
    console.log('  maker_address:', clobOrder.maker_address);
    console.log('  associate_trades:', clobOrder.associate_trades?.length ?? 0, 'trades');
  } else {
    console.log('  Order NOT found for this user on CLOB (404 or error).');
  }

  // 5) Verdict
  const dbExecuted = Number(ltOrder.executed_size_usd) || 0;
  console.log('\n--- Verdict ---');
  if (clobSumUsd < dbExecuted * 0.5 && dbExecuted > 100) {
    console.log('  ⚠️  CLOB trades for this market sum to $' + clobSumUsd.toFixed(2) + ', but DB has executed_size_usd $' + dbExecuted.toFixed(2) + '.');
    console.log('  Likely our DB is wrong (e.g. limit-price fallback for NO token inflated cost).');
  } else if (clobOrder) {
    const implied = parseFloat(clobOrder.size_matched || 0) * parseFloat(clobOrder.price || 0);
    if (Math.abs(implied - dbExecuted) > 1) {
      console.log('  DB executed_size_usd', dbExecuted.toFixed(2), 'vs CLOB order implied', implied.toFixed(2), '— check NO/YES price convention.');
    } else {
      console.log('  DB and CLOB order implied USD are in line.');
    }
  } else {
    console.log('  Could not confirm order on CLOB; compare CLOB trades sum above to DB executed_size_usd.');
  }
}

main().catch((err) => {
  console.error('Error:', err?.message || err);
  process.exit(1);
});
