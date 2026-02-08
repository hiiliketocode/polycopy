import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/ft/wallets/[id]
 * 
 * Returns detailed information about a specific FT wallet including:
 * - Wallet info and stats
 * - Open positions
 * - Recent trades
 * - Daily PnL history
 * Admin only.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { id: walletId } = await params;
    const supabase = createAdminServiceClient();
    
    // 1. Get wallet info
    const { data: wallet, error: walletError } = await supabase
      .from('ft_wallets')
      .select('*')
      .eq('wallet_id', walletId)
      .single();
    
    if (walletError || !wallet) {
      return NextResponse.json(
        { success: false, error: 'Wallet not found' },
        { status: 404 }
      );
    }
    
    // 2. Get all orders for this wallet (paginated - PostgREST often caps at 1000/request)
    type FTOrder = { outcome?: string; pnl?: number; condition_id?: string; trader_address?: string; token_label?: string; entry_price?: number; size?: number; market_end_time?: string; order_time?: string | Date; resolved_time?: string; market_title?: string; [k: string]: unknown };
    const PAGE_SIZE = 1000;
    const allOrders: FTOrder[] = [];
    let offset = 0;
    while (true) {
      const { data: page, error } = await supabase
        .from('ft_orders')
        .select('*')
        .eq('wallet_id', walletId)
        .order('order_time', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) {
        console.error('[ft/wallets/id] Error fetching orders:', error);
        break;
      }
      if (!page || page.length === 0) break;
      allOrders.push(...(page as FTOrder[]));
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    
    // 2b. Look up trader display names from traders table
    const uniqueTraderAddresses = [...new Set(
      allOrders.map(o => o.trader_address).filter(Boolean)
    )] as string[];
    const traderNameMap = new Map<string, string>();
    if (uniqueTraderAddresses.length > 0) {
      const { data: traderRows } = await supabase
        .from('traders')
        .select('wallet_address, display_name, username')
        .in('wallet_address', uniqueTraderAddresses.map((w: string) => w.toLowerCase()));
      for (const t of traderRows || []) {
        const addr = (t.wallet_address || '').toLowerCase();
        const name = t.display_name;
        if (addr && name) traderNameMap.set(addr, name);
      }
    }
    const getTraderName = (addr?: string | null) =>
      addr ? (traderNameMap.get(addr.toLowerCase()) ?? null) : null;
    
    // 3. Calculate basic stats (unrealized will be added after price fetch)
    const openOrders = allOrders.filter(o => o.outcome === 'OPEN');
    const resolvedOrders = allOrders.filter(o => o.outcome !== 'OPEN');
    const wonOrders = allOrders.filter(o => o.outcome === 'WON');
    const lostOrders = allOrders.filter(o => o.outcome === 'LOST');
    
    const realizedPnl = resolvedOrders.reduce((sum, o) => sum + (o.pnl || 0), 0);
    
    // 4. Fetch current prices for open positions from markets table AND refresh from Polymarket
    const openConditionIds = [...new Set(openOrders.map(o => o.condition_id).filter((id): id is string => !!id))];
    
    const priceMap = new Map<string, { currentPrice: number | null; outcomes: string[] | null; outcomePrices: number[] | null }>();
    
    if (openConditionIds.length > 0) {
      // First, try to get from cache
      const { data: markets } = await supabase
        .from('markets')
        .select('condition_id, outcome_prices, last_price_updated_at, closed')
        .in('condition_id', openConditionIds);
      
      const marketsWithPrices = new Set<string>();
      
      // Use cached prices whenever available (stale is better than nothing for PnL display)
      if (markets) {
        for (const market of markets) {
          const outcomes = market.outcome_prices?.outcomes ?? 
                          market.outcome_prices?.labels ?? 
                          market.outcome_prices?.choices ?? null;
          const outcomePrices = market.outcome_prices?.outcomePrices ?? 
                               market.outcome_prices?.prices ?? 
                               market.outcome_prices?.probabilities ?? null;
          
          if (outcomes && outcomePrices) {
            priceMap.set(market.condition_id, {
              currentPrice: null,
              outcomes: outcomes,
              outcomePrices: outcomePrices
            });
            marketsWithPrices.add(market.condition_id);
          }
        }
      }
      
      // Fetch fresh prices for markets without cached prices (batches of 30, up to 150 for single-wallet view)
      const allNeedingPrices = openConditionIds.filter(id => !marketsWithPrices.has(id));
      const PRICE_BATCH_SIZE = 30;
      const MAX_PRICE_FETCHES = 150;

      if (allNeedingPrices.length > 0) {
        console.log(`[ft/wallet/${walletId}] Fetching fresh prices for ${Math.min(allNeedingPrices.length, MAX_PRICE_FETCHES)} markets`);
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

        const parseOutcomes = (outcomes: unknown): string[] | null => {
          if (Array.isArray(outcomes)) return outcomes.map(o => typeof o === 'string' ? o : (o as { LABEL?: string; label?: string })?.LABEL ?? (o as { label?: string })?.label ?? String(o ?? ''));
          return null;
        };
        const parsePrices = (prices: unknown): number[] | null => {
          if (Array.isArray(prices)) return prices.map(p => { const n = typeof p === 'string' ? parseFloat(p) : Number(p); return Number.isFinite(n) ? n : 0; });
          return null;
        };

        for (let offset = 0; offset < Math.min(allNeedingPrices.length, MAX_PRICE_FETCHES); offset += PRICE_BATCH_SIZE) {
          const batch = allNeedingPrices.slice(offset, offset + PRICE_BATCH_SIZE);
          await Promise.all(batch.map(async (conditionId) => {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(
              `${baseUrl}/api/polymarket/price?conditionId=${conditionId}`,
              { signal: controller.signal }
            );
            clearTimeout(timeout);
            
            if (res.ok) {
              const json = await res.json();
              const outcomes = json?.market?.outcomes ?? json?.market?.labels;
              const outcomePrices = json?.market?.outcomePrices ?? json?.market?.prices;
              const parsedOutcomes = parseOutcomes(outcomes);
              const parsedPrices = parsePrices(outcomePrices);
              if (parsedOutcomes && parsedPrices) {
                await supabase.from('markets').upsert({
                  condition_id: conditionId,
                  outcome_prices: { outcomes: parsedOutcomes, outcomePrices: parsedPrices },
                  last_price_updated_at: new Date().toISOString(),
                }, { onConflict: 'condition_id' });
                priceMap.set(conditionId, { currentPrice: null, outcomes: parsedOutcomes, outcomePrices: parsedPrices });
                return;
              }
            }
            
            // Fallback: Gamma API by condition_id when price API fails
            try {
              const gammaController = new AbortController();
              const gammaTimeout = setTimeout(() => gammaController.abort(), 3000);
              const gammaRes = await fetch(
                `https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`,
                { cache: 'no-store', signal: gammaController.signal }
              );
              clearTimeout(gammaTimeout);
              if (gammaRes.ok) {
                const gammaData = await gammaRes.json();
                const m = Array.isArray(gammaData) && gammaData.length > 0 ? gammaData[0] : null;
                if (m) {
                  let outcomes = m.outcomes ?? m.labels;
                  let prices = m.outcomePrices ?? m.prices;
                  if (typeof outcomes === 'string') { try { outcomes = JSON.parse(outcomes); } catch { outcomes = null; } }
                  if (typeof prices === 'string') { try { prices = JSON.parse(prices); } catch { prices = null; } }
                  const parsedOutcomes = parseOutcomes(outcomes);
                  const parsedPrices = parsePrices(prices);
                  if (parsedOutcomes && parsedPrices) {
                    await supabase.from('markets').upsert({
                      condition_id: conditionId,
                      outcome_prices: { outcomes: parsedOutcomes, outcomePrices: parsedPrices },
                      last_price_updated_at: new Date().toISOString(),
                    }, { onConflict: 'condition_id' });
                    priceMap.set(conditionId, { currentPrice: null, outcomes: parsedOutcomes, outcomePrices: parsedPrices });
                  }
                }
              }
            } catch (gammaErr) {
              console.warn(`[ft/wallet/${walletId}] Gamma fallback failed for ${conditionId}:`, gammaErr);
            }
          } catch (err) {
            console.warn(`[ft/wallet/${walletId}] Failed to fetch price for ${conditionId}:`, err);
          }
        }));
        }
      }
    }
    
    // Fetch market status from Gamma for ALL open positions (closed, completed_time, game_start_time)
    const statusMap = new Map<string, { closed: boolean; completedTime: string | null; gameStartTime: string | null; endTime: string | null }>();
    const STATUS_BATCH = 30;
    for (let i = 0; i < openConditionIds.length; i += STATUS_BATCH) {
        const batch = openConditionIds.slice(i, i + STATUS_BATCH);
        try {
          const params = batch.map(id => `condition_ids=${id}`).join('&');
          const gammaRes = await fetch(`https://gamma-api.polymarket.com/markets?${params}`, { cache: 'no-store' });
          if (gammaRes.ok) {
            const arr = await gammaRes.json();
            for (const m of Array.isArray(arr) ? arr : []) {
              const cid = m.conditionId || m.condition_id;
              if (!cid) continue;
              const gameStart = m.gameStartTime || m.game_start_time || m.startDate || m.start_date;
              const endTime = m.endDate || m.end_date || m.endTime;
              const completedTime = m.completedTime || m.completed_time || null;
              statusMap.set(cid, {
                closed: m.closed === true,
                completedTime: completedTime ? (typeof completedTime === 'string' ? completedTime : new Date(completedTime).toISOString()) : null,
                gameStartTime: gameStart ? (typeof gameStart === 'string' ? gameStart : new Date(gameStart).toISOString()) : null,
                endTime: endTime ? (typeof endTime === 'string' ? endTime : new Date(endTime).toISOString()) : null
              });
            }
          }
        } catch (err) {
          console.warn(`[ft/wallet/${walletId}] Gamma status fetch failed:`, err);
        }
      }
    
    // Helper to compute "Resolves" label from market status (distinguish Live vs Awaiting resolution)
    const computeResolvesLabel = (
        conditionId: string,
        marketEndTime: string | null | undefined,
        currentPrice: number | null
      ): string => {
        const status = statusMap.get(conditionId ?? '');
        const now = Date.now();
        const gameStart = status?.gameStartTime ? new Date(status.gameStartTime).getTime() : null;
        const completed = status?.completedTime ? new Date(status.completedTime).getTime() : null;
        const endTime = status?.endTime ? new Date(status.endTime).getTime() : (marketEndTime ? new Date(marketEndTime).getTime() : null);
        const priceSettled = currentPrice != null && (currentPrice >= 0.99 || currentPrice <= 0.01);
        
        // Sports: game_start_time exists → use completed_time and game_start for live/ended
        if (gameStart != null) {
          if (completed != null) {
            return priceSettled ? 'Resolved' : 'Awaiting resolution';
          }
          if (now >= gameStart) {
            return 'Live';
          }
          const mins = Math.round((gameStart - now) / 60000);
          if (mins < 60) return `${mins}m`;
          const h = Math.floor(mins / 60);
          const m = Math.round(mins % 60);
          return m > 0 ? `${h}h ${m}m` : `${h}h`;
        }
        
        // Non-sports: use end_time
        if (endTime == null) return '-';
        const minsToEnd = Math.round((endTime - now) / 60000);
        if (minsToEnd < 0) {
          return status?.closed && !priceSettled ? 'Awaiting resolution' : priceSettled ? 'Resolved' : 'Awaiting resolution';
        }
        if (minsToEnd < 60) return `${minsToEnd}m`;
        const hours = Math.floor(minsToEnd / 60);
        const mins = Math.round(minsToEnd % 60);
        if (minsToEnd < 1440) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
        const days = Math.floor(minsToEnd / 1440);
        const h = Math.floor((minsToEnd % 1440) / 60);
        return h > 0 ? `${days}d ${h}h` : `${days}d`;
      };
    
    // Helper to extract label from outcome (string or object like {LABEL: "X"})
    const outcomeLabel = (o: unknown): string => {
      if (typeof o === 'string') return o;
      if (o && typeof o === 'object' && 'LABEL' in o) return String((o as { LABEL?: string }).LABEL ?? '');
      if (o && typeof o === 'object' && 'label' in o) return String((o as { label?: string }).label ?? '');
      return String(o ?? '');
    };
    // Helper to find price for a specific outcome
    const findOutcomePrice = (conditionId: string, tokenLabel: string): number | null => {
      const market = priceMap.get(conditionId);
      if (!market || !market.outcomes || !market.outcomePrices) {
        return null;
      }
      
      const normalizedLabel = tokenLabel?.toLowerCase().trim();
      
      // Try exact match first (handle both string and object outcomes)
      let idx = market.outcomes.findIndex(o => outcomeLabel(o)?.toLowerCase().trim() === normalizedLabel);
      
      // Fallback: For binary markets, YES is often index 0, NO is index 1
      if (idx < 0 && market.outcomes.length === 2) {
        const outcomesLower = market.outcomes.map(o => outcomeLabel(o)?.toLowerCase().trim());
        if (normalizedLabel === 'yes') {
          idx = outcomesLower.indexOf('yes');
          if (idx < 0) idx = 0; // Fallback to first outcome
        } else if (normalizedLabel === 'no') {
          idx = outcomesLower.indexOf('no');
          if (idx < 0) idx = 1; // Fallback to second outcome
        }
      }
      
      if (idx >= 0 && market.outcomePrices[idx] !== undefined && market.outcomePrices[idx] !== null) {
        // Prices might be strings from the API
        const rawPrice = market.outcomePrices[idx];
        const price = typeof rawPrice === 'string' ? parseFloat(rawPrice) : Number(rawPrice);
        return Number.isFinite(price) ? price : null;
      }
      
      return null;
    };
    
    // 5. Open positions with current prices and unrealized P&L
    console.log(`[ft/wallet/${walletId}] Processing ${openOrders.length} open positions, ${priceMap.size} markets with prices`);
    
    let totalUnrealizedPnl = 0;
    let priceFoundCount = 0;
    let priceMissingCount = 0;
    
    const open_positions = openOrders.map(o => {
      const currentPrice = findOutcomePrice(o.condition_id ?? '', (o.token_label as string) || 'YES');
      
      if (currentPrice !== null) {
        priceFoundCount++;
      } else {
        priceMissingCount++;
        const market = priceMap.get(o.condition_id ?? '');
        console.log(`[ft/wallet/${walletId}] No price for condition=${o.condition_id?.slice(0,10)}... token=${o.token_label}, market exists: ${!!market}, outcomes: ${market?.outcomes?.join(',')}, prices: ${market?.outcomePrices?.join(',')}`);
      }
      
      // Calculate unrealized P&L
      // shares = size / entry_price (how many outcome tokens we own)
      // currentValue = shares * currentPrice
      // unrealizedPnl = currentValue - size (our cost)
      let unrealizedPnl: number | null = null;
      if (currentPrice !== null && o.entry_price && o.size) {
        const shares = o.size / o.entry_price;
        const currentValue = shares * currentPrice;
        unrealizedPnl = currentValue - o.size;
        totalUnrealizedPnl += unrealizedPnl;
      }
      
      return {
        ...o,
        current_price: currentPrice,
        unrealized_pnl: unrealizedPnl,
        minutes_to_resolution: o.market_end_time 
          ? Math.round((new Date(o.market_end_time).getTime() - Date.now()) / (1000 * 60))
          : null,
        resolves_label: computeResolvesLabel(o.condition_id ?? '', o.market_end_time, currentPrice),
        trader_name: getTraderName(o.trader_address),
        order_time: o.order_time ? { value: typeof o.order_time === 'string' ? o.order_time : new Date(o.order_time).toISOString() } : null
      };
    });
    
    console.log(`[ft/wallet/${walletId}] Price lookup results: found=${priceFoundCount}, missing=${priceMissingCount}, unrealized_pnl=${totalUnrealizedPnl.toFixed(2)}`);

    const startingBalance = Number(wallet.starting_balance) || 1000;
    const resolvedWithTime = resolvedOrders.filter(o => o.resolved_time);
    const sortedResolved = [...resolvedWithTime].sort(
      (a, b) => new Date(a.resolved_time!).getTime() - new Date(b.resolved_time!).getTime()
    );
    let peak = startingBalance;
    let equity = startingBalance;
    let maxDrawdownUsd = 0;
    for (const o of sortedResolved) {
      equity += o.pnl || 0;
      if (equity > peak) peak = equity;
      const drawdown = peak - equity;
      if (drawdown > maxDrawdownUsd) maxDrawdownUsd = drawdown;
    }
    const maxDrawdownPct = peak > 0 ? (maxDrawdownUsd / peak) * 100 : 0;
    const pnls = resolvedOrders.map(o => o.pnl).filter((p): p is number => typeof p === 'number' && Number.isFinite(p));
    let sharpeRatio: number | null = null;
    if (pnls.length >= 2) {
      const mean = pnls.reduce((s, p) => s + p, 0) / pnls.length;
      const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / (pnls.length - 1);
      const std = Math.sqrt(variance);
      if (std > 0) sharpeRatio = mean / std;
    }

    // Build full stats object now that we have unrealized P&L
    const stats = {
      total_trades: allOrders.length,
      open_positions: openOrders.length,
      won: wonOrders.length,
      lost: lostOrders.length,
      win_rate: resolvedOrders.length > 0 
        ? wonOrders.length / resolvedOrders.length 
        : null,
      realized_pnl: realizedPnl,
      unrealized_pnl: totalUnrealizedPnl,
      total_pnl: realizedPnl + totalUnrealizedPnl,
      open_exposure: openOrders.reduce((sum, o) => sum + (o.size || 0), 0),
      avg_entry_price: allOrders.length > 0
        ? allOrders.reduce((sum, o) => sum + (o.entry_price || 0), 0) / allOrders.length
        : null,
      avg_win: wonOrders.length > 0
        ? wonOrders.reduce((sum, o) => sum + (o.pnl || 0), 0) / wonOrders.length
        : null,
      avg_loss: lostOrders.length > 0
        ? lostOrders.reduce((sum, o) => sum + (o.pnl || 0), 0) / lostOrders.length
        : null,
      last_trade: allOrders.length > 0 ? { value: allOrders[0].order_time } : null,
      first_trade: allOrders.length > 0 ? { value: allOrders[allOrders.length - 1].order_time } : null,
      max_drawdown_usd: maxDrawdownUsd,
      max_drawdown_pct: maxDrawdownPct,
      sharpe_ratio: sharpeRatio
    };

    // 6. Recent resolved trades (include trader_name, order_time, trader_address)
    const recent_trades = resolvedOrders.slice(0, 50).map((o) => ({
      ...o,
      trader_address: o.trader_address,
      trader_name: getTraderName(o.trader_address),
      order_time: o.order_time ? { value: typeof o.order_time === 'string' ? o.order_time : new Date(o.order_time).toISOString() } : null,
      resolved_time: o.resolved_time ? { value: typeof o.resolved_time === 'string' ? o.resolved_time : new Date(o.resolved_time).toISOString() } : null
    }));
    
    // 6. Daily PnL history
    const dailyPnlMap = new Map<string, { trades: number; won: number; lost: number; pnl: number }>();
    for (const order of resolvedOrders) {
      if (!order.resolved_time) continue;
      const date = new Date(order.resolved_time).toISOString().split('T')[0];
      const existing = dailyPnlMap.get(date) || { trades: 0, won: 0, lost: 0, pnl: 0 };
      existing.trades++;
      if (order.outcome === 'WON') existing.won++;
      if (order.outcome === 'LOST') existing.lost++;
      existing.pnl += order.pnl || 0;
      dailyPnlMap.set(date, existing);
    }
    
    // Convert to array and calculate cumulative
    const sortedDates = Array.from(dailyPnlMap.keys()).sort();
    let cumulative = 0;
    const daily_pnl = sortedDates.map(date => {
      const day = dailyPnlMap.get(date)!;
      cumulative += day.pnl;
      return {
        date,
        trades: day.trades,
        won: day.won,
        lost: day.lost,
        win_rate: day.trades > 0 ? day.won / day.trades : null,
        daily_pnl: day.pnl,
        cumulative_pnl: cumulative
      };
    });
    
    // 7. Performance by category
    const categoryMap = new Map<string, { trades: number; won: number; lost: number; pnl: number; total_price: number }>();
    for (const order of resolvedOrders) {
      const title = (order.market_title || '').toLowerCase();
      let category = 'Other';
      if (title.includes('bitcoin') || title.includes('btc')) category = 'Crypto - BTC';
      else if (title.includes('ethereum') || title.includes('eth')) category = 'Crypto - ETH';
      else if (title.includes('solana') || title.includes('sol')) category = 'Crypto - SOL';
      else if (title.includes('trump')) category = 'Politics - Trump';
      else if (title.includes('temperature') || title.includes('weather')) category = 'Weather';
      else if (title.includes('nba') || title.includes('nfl') || title.includes('mlb')) category = 'Sports';
      
      const existing = categoryMap.get(category) || { trades: 0, won: 0, lost: 0, pnl: 0, total_price: 0 };
      existing.trades++;
      if (order.outcome === 'WON') existing.won++;
      if (order.outcome === 'LOST') existing.lost++;
      existing.pnl += order.pnl || 0;
      existing.total_price += order.entry_price || 0;
      categoryMap.set(category, existing);
    }
    
    const performance_by_category = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        trades: data.trades,
        won: data.won,
        lost: data.lost,
        win_rate: data.trades > 0 ? data.won / data.trades : null,
        total_pnl: data.pnl,
        avg_entry_price: data.trades > 0 ? data.total_price / data.trades : null
      }))
      .sort((a, b) => b.total_pnl - a.total_pnl);
    
    // Calculate test status
    const now = new Date();
    const startDate = new Date(wallet.start_date);
    const endDate = new Date(wallet.end_date);
    
    let test_status: 'ACTIVE' | 'ENDED' | 'SCHEDULED';
    if (endDate < now) {
      test_status = 'ENDED';
    } else if (startDate > now) {
      test_status = 'SCHEDULED';
    } else {
      test_status = 'ACTIVE';
    }
    
    const hours_remaining = Math.max(0, (endDate.getTime() - now.getTime()) / (1000 * 60 * 60));

    // Starting balance: use DB value; self-heal if cash would be negative (mirrors migration 20260325)
    let effectiveStartingBalance = Number(wallet.starting_balance) || 1000;
    const rawCash = effectiveStartingBalance + stats.realized_pnl - stats.open_exposure;
    if (rawCash < 0) {
      const addAmount = Math.ceil(Math.abs(rawCash)) + 10;
      effectiveStartingBalance += addAmount;
      await supabase
        .from('ft_wallets')
        .update({
          starting_balance: effectiveStartingBalance,
          updated_at: now.toISOString(),
        })
        .eq('wallet_id', walletId);
    }

    // Cash available = starting balance + realized P&L - open exposure (clamped to 0)
    const cashAvailable = Math.max(0, effectiveStartingBalance + stats.realized_pnl - stats.open_exposure);

    return NextResponse.json({
      success: true,
      wallet: {
        ...wallet,
        starting_balance: effectiveStartingBalance,
        current_balance: effectiveStartingBalance + stats.realized_pnl + stats.unrealized_pnl,
        cash_available: cashAvailable,
        trades_seen: wallet.trades_seen || 0,
        trades_skipped: wallet.trades_skipped || 0,
        allocation_method: wallet.allocation_method || 'KELLY',
        kelly_fraction: wallet.kelly_fraction ?? 0.25,
        min_bet: wallet.min_bet ?? 0.50,
        max_bet: wallet.max_bet ?? 10.00,
        start_date: { value: wallet.start_date },
        end_date: { value: wallet.end_date },
        last_sync_time: wallet.last_sync_time ? { value: wallet.last_sync_time } : null,
        test_status,
        hours_remaining
      },
      stats,
      open_positions,
      recent_trades,
      daily_pnl,
      performance_by_category,
      fetched_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[ft/wallets/id] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch wallet details' },
      { status: 500 }
    );
  }
}
