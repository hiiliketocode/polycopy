import { NextRequest, NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

/**
 * GET /api/v2/feed/trades
 *
 * Returns recent trades from followed traders, backed by the trades_public table.
 * Enriches with market metadata (tags, market_subtype, bet_structure) from the markets table.
 * Replaces the per-trader Polymarket Data API polling that the feed page previously did.
 *
 * Query params:
 *   limit  – max trades to return (default 100, max 200)
 *   before – ISO timestamp cursor for pagination (trades older than this)
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const supabase = createAdminServiceClient();
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get('limit')) || DEFAULT_LIMIT, MAX_LIMIT);
    const before = searchParams.get('before');

    // 1. Get followed wallets
    const { data: follows, error: followsErr } = await supabase
      .from('follows')
      .select('trader_wallet')
      .eq('user_id', userId);

    if (followsErr) {
      return NextResponse.json({ error: 'Failed to fetch follows' }, { status: 500 });
    }
    if (!follows || follows.length === 0) {
      return NextResponse.json({ trades: [], traderNames: {}, followingCount: 0 });
    }

    const wallets = [...new Set(follows.map((f) => f.trader_wallet.toLowerCase()))];

    // 2. Fetch recent trades from trades_public
    let tradesQuery = supabase
      .from('trades_public')
      .select(
        'trade_id, trader_wallet, condition_id, market_slug, event_slug, market_title, side, outcome, outcome_index, size, price, trade_timestamp, asset, transaction_hash, raw',
      )
      .in('trader_wallet', wallets)
      .order('trade_timestamp', { ascending: false })
      .limit(limit);

    if (before) {
      tradesQuery = tradesQuery.lt('trade_timestamp', before);
    }

    const { data: trades, error: tradesErr } = await tradesQuery;
    if (tradesErr) {
      console.error('[v2/feed/trades] trades_public query error:', tradesErr.message);
      return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
    }

    if (!trades || trades.length === 0) {
      return NextResponse.json({ trades: [], traderNames: {}, followingCount: wallets.length });
    }

    // 3. Batch-fetch market metadata for enrichment
    const conditionIds = [...new Set(trades.map((t) => t.condition_id).filter(Boolean))];
    const marketDataMap = new Map<
      string,
      { tags: string[] | null; market_subtype: string | null; bet_structure: string | null }
    >();

    if (conditionIds.length > 0) {
      const { data: markets } = await supabase
        .from('markets')
        .select('condition_id, tags, market_subtype, final_niche, bet_structure')
        .in('condition_id', conditionIds.slice(0, 1000));

      if (markets) {
        for (const m of markets) {
          if (!m.condition_id) continue;
          let tags: string[] | null = null;
          if (Array.isArray(m.tags) && m.tags.length > 0) {
            tags = m.tags
              .map((t: unknown) => {
                if (typeof t === 'object' && t !== null) {
                  return (t as Record<string, string>).name || String(t);
                }
                return String(t);
              })
              .map((t: string) => t.trim().toLowerCase())
              .filter((t: string) => t.length > 0 && t !== 'null');
          }
          marketDataMap.set(m.condition_id, {
            tags: tags && tags.length > 0 ? tags : null,
            market_subtype: m.market_subtype || m.final_niche || null,
            bet_structure: m.bet_structure || null,
          });
        }
      }
    }

    // 4. Fetch trader display names from the leaderboard cache or traders table
    const uniqueWallets = [...new Set(trades.map((t) => t.trader_wallet))];
    const traderNames: Record<string, string> = {};

    const { data: traderRows } = await supabase
      .from('traders')
      .select('wallet_address, display_name')
      .in('wallet_address', uniqueWallets);

    if (traderRows) {
      for (const t of traderRows) {
        if (t.display_name) {
          traderNames[t.wallet_address] = t.display_name;
        }
      }
    }

    // 5. Format trades in a shape compatible with the feed page's processTrades
    const enrichedTrades = trades.map((t) => {
      const marketData = t.condition_id ? marketDataMap.get(t.condition_id) : null;
      const raw = (t.raw || {}) as Record<string, unknown>;

      return {
        conditionId: t.condition_id,
        slug: t.market_slug || raw.slug || '',
        eventSlug: t.event_slug || raw.eventSlug || '',
        title: t.market_title || raw.title || '',
        side: t.side || 'BUY',
        outcome: t.outcome || 'YES',
        size: t.size,
        price: t.price,
        timestamp: t.trade_timestamp
          ? Math.floor(new Date(t.trade_timestamp).getTime() / 1000)
          : Math.floor(Date.now() / 1000),
        transactionHash: t.transaction_hash || t.trade_id,
        asset: t.asset || raw.asset || '',
        _followedWallet: t.trader_wallet,
        // Market enrichment from DB
        _dbTags: marketData?.tags || null,
        _dbMarketSubtype: marketData?.market_subtype || null,
        _dbBetStructure: marketData?.bet_structure || null,
      };
    });

    return NextResponse.json({
      trades: enrichedTrades,
      traderNames,
      followingCount: wallets.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[v2/feed/trades] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
