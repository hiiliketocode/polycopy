import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';

/**
 * POST /api/ft/resolve
 *
 * Checks for resolved markets and updates FT order outcomes.
 * Admin only (or cron with CRON_SECRET).
 *
 * Resolution logic (price-based):
 * - Our outcome's price >= 0.99 ($1) → WON
 * - Our outcome's price <= 0.01 (1¢) → LOST
 * - Otherwise → keep OPEN (pending)
 * Does not require market.closed; uses prices as source of truth.
 *
 * Flow:
 * 1. Get all OPEN FT orders
 * 2. Fetch markets from Polymarket API
 * 3. Resolve orders where prices show clear outcome ($1 vs 1¢)
 * 4. Update wallet stats
 */
export async function POST(request: Request) {
  const authError = await requireAdminOrCron(request);
  if (authError) return authError;

  try {
    const supabase = createAdminServiceClient();
    const now = new Date();
    
    console.log('[ft/resolve] Starting resolution check at', now.toISOString());
    
    // 1. Get all OPEN FT orders (paginated - PostgREST often caps at 1000/request)
    const PAGE_SIZE = 1000;
    const openOrders: Record<string, unknown>[] = [];
    let offset = 0;
    let ordersError: { message: string } | null = null;
    while (true) {
      const { data: page, error } = await supabase
        .from('ft_orders')
        .select('*')
        .eq('outcome', 'OPEN')
        .order('order_time', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) {
        ordersError = error;
        break;
      }
      if (!page || page.length === 0) break;
      openOrders.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    if (ordersError) {
      console.error('[ft/resolve] Error fetching orders:', ordersError);
      return NextResponse.json(
        { success: false, error: ordersError.message },
        { status: 500 }
      );
    }

    if (openOrders.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No open orders to check',
        open_orders: 0
      });
    }
    
    console.log(`[ft/resolve] Found ${openOrders.length} open orders to check`);
    
    // 2. Get unique condition_ids
    const conditionIds = [...new Set(openOrders.map(o => o.condition_id).filter(Boolean))];
    
    // Helper: extract label from outcome (string or object like {LABEL:"Yes"})
    const outcomeLabel = (o: unknown): string => {
      if (typeof o === 'string') return o.trim().toUpperCase();
      if (o && typeof o === 'object') {
        const obj = o as { LABEL?: string; label?: string };
        return (obj.LABEL || obj.label || '').trim().toUpperCase();
      }
      return '';
    };

    // Helper: normalize for comparison (handles Yes/YES, No/NO, etc.)
    const normalize = (s: string | null | undefined) => (s || '').trim().toUpperCase();

    // Helper: do labels match? (case-insensitive, trimmed)
    const labelsMatch = (a: string, b: string) => normalize(a) === normalize(b);

    // 3. Fetch markets from Polymarket API - use price-based resolution ($1 and 1¢ thresholds)
    // Resolve when: our outcome's price >= 0.99 (WON) or <= 0.01 (LOST). Keep pending otherwise.
    const resolutionMap = new Map<string, { winningLabel: string; outcomes: string[]; prices: number[] }>();
    const BATCH_SIZE = 20;

    const WIN_THRESHOLD = 0.99;   // $1 or 100¢ - outcome has won
    const LOSE_THRESHOLD = 0.01;  // 1¢ or below - outcome has lost

    console.log(`[ft/resolve] Checking ${conditionIds.length} unique condition IDs (price-based: ≥${WIN_THRESHOLD}=WON, ≤${LOSE_THRESHOLD}=LOST)`);

    for (let i = 0; i < conditionIds.length; i += BATCH_SIZE) {
      const batch = conditionIds.slice(i, i + BATCH_SIZE);
      try {
        const params = batch.map(id => `condition_ids=${id}`).join('&');
        const url = `https://gamma-api.polymarket.com/markets?${params}`;
        const response = await fetch(url, { headers: { 'Accept': 'application/json' } });

        if (response.ok) {
          const markets = await response.json();
          for (const market of markets) {
            const cid = market.conditionId || market.condition_id;
            if (!cid) continue;

            let outcomes: (string | { LABEL?: string; label?: string })[] = [];
            let prices: number[] = [];
            try {
              outcomes = (typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes || []) as (string | { LABEL?: string; label?: string })[];
              const rawPrices = typeof market.outcomePrices === 'string' ? JSON.parse(market.outcomePrices) : market.outcomePrices || [];
              prices = rawPrices.map((p: unknown) => parseFloat(String(p)));
            } catch {
              continue;
            }
            if (outcomes.length === 0 || prices.length === 0) continue;

            // Handle prices in cents (0-100) vs 0-1
            const maxRaw = Math.max(...prices);
            if (maxRaw > 1) prices = prices.map(p => p / 100);

            const maxPrice = Math.max(...prices);
            const minPrice = Math.min(...prices);
            const maxPriceIdx = prices.indexOf(maxPrice);

            // Resolve only when prices show clear outcome: winner at $1, loser at 1¢ or below
            // Keep pending if prices haven't settled (e.g. 0.95/0.05 is still settling)
            const hasClearWinner = maxPrice >= WIN_THRESHOLD;
            const hasClearLoser = minPrice <= LOSE_THRESHOLD;
            if (!hasClearWinner || !hasClearLoser) continue;

            const winningLabel = outcomeLabel(outcomes[maxPriceIdx]);
            const outcomeLabels = outcomes.map(outcomeLabel);
            resolutionMap.set(cid, { winningLabel, outcomes: outcomeLabels, prices });
            console.log(`[ft/resolve] ✓ ${cid.slice(0,10)}... prices=${prices.map(p => p.toFixed(2)).join(',')} → winner=${winningLabel}`);
          }
        }
      } catch (err) {
        console.error(`[ft/resolve] Error fetching batch:`, err);
      }
    }

    console.log(`[ft/resolve] Found ${resolutionMap.size} markets with clear price resolution`);
    
    // 4. Update resolved orders - use our outcome's price for WON/LOST
    let resolved = 0;
    let won = 0;
    let lost = 0;
    const errors: string[] = [];

    for (const order of openOrders) {
      if (!order.condition_id) continue;

      const marketData = resolutionMap.get(order.condition_id);
      if (!marketData) continue; // Market not yet resolved (prices not at $1/1¢)

      const { winningLabel, outcomes: outcomeLabels, prices } = marketData;

      // Find our outcome's index by matching token_label (case-insensitive)
      let ourIdx = outcomeLabels.findIndex((l) => labelsMatch(l, order.token_label || 'YES'));
      if (ourIdx < 0 && outcomeLabels.length === 2) {
        // Binary fallback: map Yes/No to common orderings
        const tok = normalize(order.token_label || 'YES');
        const yesIdx = outcomeLabels.findIndex((l) => normalize(l) === 'YES' || normalize(l) === 'Y');
        const noIdx = outcomeLabels.findIndex((l) => normalize(l) === 'NO' || normalize(l) === 'N');
        if (tok === 'YES' && yesIdx >= 0) ourIdx = yesIdx;
        else if (tok === 'NO' && noIdx >= 0) ourIdx = noIdx;
        else if (tok === 'YES' && yesIdx < 0) ourIdx = 0; // Assume first is Yes
        else if (tok === 'NO' && noIdx < 0) ourIdx = 1;   // Assume second is No
      }
      if (ourIdx < 0) continue; // Can't match our outcome, skip (keep pending)

      const ourPrice = prices[ourIdx] ?? -1;

      // Price-based: our outcome at $1 → WON, at 1¢ or below → LOST
      let outcome: 'WON' | 'LOST';
      if (ourPrice >= WIN_THRESHOLD) outcome = 'WON';
      else if (ourPrice <= LOSE_THRESHOLD) outcome = 'LOST';
      else continue; // Price in between, keep pending

      const side = (order.side || 'BUY').toUpperCase();

      let pnl: number;
      if (side === 'BUY') {
        if (outcome === 'WON') {
          pnl = order.entry_price > 0 ? order.size * (1 - order.entry_price) / order.entry_price : 0;
        } else {
          pnl = -order.size;
        }
      } else {
        if (outcome === 'WON') pnl = order.size * order.entry_price;
        else pnl = -order.size * (1 - order.entry_price);
      }
      
      // Update the order
      const { error: updateError } = await supabase
        .from('ft_orders')
        .update({
          outcome,
          winning_label: winningLabel,
          pnl,
          resolved_time: now.toISOString()
        })
        .eq('order_id', order.order_id);
      
      if (updateError) {
        errors.push(`Failed to update order ${order.order_id}: ${updateError.message}`);
      } else {
        resolved++;
        if (outcome === 'WON') won++;
        if (outcome === 'LOST') lost++;
      }
    }
    
    console.log(`[ft/resolve] Resolved ${resolved} orders (${won} won, ${lost} lost)`);
    
    // 5. Update wallet stats
    const walletIds = [...new Set(openOrders.map(o => o.wallet_id))];
    
    for (const walletId of walletIds) {
      // Get updated stats (all orders for this wallet, paginated)
      const orders: { outcome: string; pnl?: number; size?: number }[] = [];
      let ordOffset = 0;
      while (true) {
        const { data: ordPage, error: ordErr } = await supabase
          .from('ft_orders')
          .select('outcome, pnl, size')
          .eq('wallet_id', walletId)
          .order('order_id', { ascending: true })
          .range(ordOffset, ordOffset + PAGE_SIZE - 1);
        if (ordErr || !ordPage) break;
        if (ordPage.length === 0) break;
        orders.push(...ordPage);
        if (ordPage.length < PAGE_SIZE) break;
        ordOffset += PAGE_SIZE;
      }
      if (orders.length === 0) continue;
      
      const totalTrades = orders.length;
      const openPositions = orders.filter(o => o.outcome === 'OPEN').length;
      const totalPnl = orders
        .filter(o => o.outcome !== 'OPEN')
        .reduce((sum, o) => sum + (o.pnl || 0), 0);
      
      const { data: wallet } = await supabase
        .from('ft_wallets')
        .select('starting_balance')
        .eq('wallet_id', walletId)
        .single();
      
      const startingBalance = wallet?.starting_balance || 1000;
      
      await supabase
        .from('ft_wallets')
        .update({
          total_trades: totalTrades,
          open_positions: openPositions,
          total_pnl: totalPnl,
          current_balance: startingBalance + totalPnl,
          updated_at: now.toISOString()
        })
        .eq('wallet_id', walletId);
    }
    
    return NextResponse.json({
      success: true,
      resolved_at: now.toISOString(),
      open_orders_checked: openOrders.length,
      markets_resolved: resolutionMap.size,
      orders_resolved: resolved,
      won,
      lost,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('[ft/resolve] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Resolution check failed', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const supabase = createAdminServiceClient();
    
    // Get summary of open positions
    const { data: openOrders, error } = await supabase
      .from('ft_orders')
      .select('wallet_id, market_title, market_end_time, entry_price')
      .eq('outcome', 'OPEN')
      .order('market_end_time', { ascending: true })
      .limit(50);
    
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }
    
    // Group by wallet
    const byWallet: Record<string, number> = {};
    for (const order of openOrders || []) {
      byWallet[order.wallet_id] = (byWallet[order.wallet_id] || 0) + 1;
    }
    
    return NextResponse.json({
      success: true,
      open_positions: openOrders?.length || 0,
      by_wallet: byWallet,
      upcoming_resolutions: openOrders?.slice(0, 10).map(o => ({
        wallet: o.wallet_id,
        market: o.market_title?.substring(0, 50),
        ends: o.market_end_time,
        price: o.entry_price
      })),
      message: 'POST to check and resolve positions'
    });
    
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
