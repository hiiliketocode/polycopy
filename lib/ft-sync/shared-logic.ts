/**
 * Shared Trade Evaluation Logic
 * Used by both Forward Testing (FT) and Live Trading (LT)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getPolyScore } from '@/lib/polyscore/get-polyscore';

export const FT_SLIPPAGE_PCT = 0.003; // 0.3% - from empirical analysis of real copy trades

export type PolymarketTrade = {
    id?: string;
    transactionHash?: string;
    asset?: string;
    conditionId?: string;
    title?: string;
    slug?: string;
    outcome?: string; // YES or NO
    side?: string;    // BUY or SELL
    size?: number | string;
    price?: number | string;
    timestamp?: number | string;
    proxyWallet?: string;
};

export type ExtendedFilters = {
    min_trader_win_rate?: number;
    max_trader_win_rate?: number;
    max_conviction?: number;
    max_edge?: number;
    market_categories?: string[];
    min_original_trade_usd?: number;
    max_original_trade_usd?: number;
    trader_pool?: 'top_pnl' | 'top_wr' | 'high_volume' | 'newcomers';
    target_trader?: string;
    target_traders?: string[];
    target_trader_name?: string;
    trade_live_only?: boolean;
};

export type FTWallet = {
    wallet_id: string;
    model_threshold: number | null;
    price_min: number;
    price_max: number;
    min_edge: number;
    use_model: boolean;
    bet_size: number;
    bet_allocation_weight: number;
    allocation_method: 'FIXED' | 'KELLY' | 'EDGE_SCALED' | 'TIERED' | 'CONFIDENCE' | 'CONVICTION' | 'ML_SCALED';
    kelly_fraction: number;
    min_bet: number;
    max_bet: number;
    starting_balance: number;
    current_balance: number;
    is_active: boolean;
    start_date: string;
    end_date: string;
    last_sync_time: string | null;
    min_trader_resolved_count: number;
    min_conviction: number;
    detailed_description?: string;
    market_categories?: string[] | null;
};

export type EnrichedTrade = PolymarketTrade & {
    traderWallet: string;
    traderWinRate: number;
    traderTradeCount: number;
    traderAvgTradeSize: number;
    tradeValue: number;
    conviction: number;
};

export type MarketInfo = {
    endTime: Date | null;
    closed: boolean;
    resolved: boolean;
    title?: string;
    slug?: string;
    outcome_prices?: number[] | string;
    outcomes?: string[];
    tags?: string[] | unknown;
    end_time?: string;
    start_time?: string;
    game_start_time?: string | null;
};

export type TradeEvaluationResult = {
    qualifies: boolean;
    reason?: string;
    betSize?: number;
    priceWithSlippage?: number;
    edge?: number;
    modelProbability?: number | null;
};

/**
 * Generate unique trade ID for deduplication
 */
export function getSourceTradeId(trade: {
    id?: string;
    transactionHash?: string;
    traderWallet?: string;
    conditionId?: string;
    timestamp?: string | number;
}): string {
    if (trade.id && String(trade.id).trim()) return String(trade.id).trim();
    if (trade.transactionHash && String(trade.transactionHash).trim()) return String(trade.transactionHash).trim();
    return `${trade.traderWallet || ''}-${trade.conditionId || ''}-${trade.timestamp || ''}`;
}

/**
 * Parse extended filters from detailed_description JSON
 */
export function parseExtendedFilters(wallet: FTWallet): ExtendedFilters {
    if (!wallet.detailed_description) return {};
    try {
        return JSON.parse(wallet.detailed_description);
    } catch {
        return {};
    }
}

/**
 * Calculate bet size based on allocation method
 */
export function calculateBetSize(
    wallet: FTWallet,
    traderWinRate: number,
    entryPrice: number,
    edge: number,
    conviction: number,
    effectiveBankroll?: number,
    modelProbability?: number | null
): number {
    const method = wallet.allocation_method || 'FIXED';
    const minBet = wallet.min_bet || 0.50;
    const maxBet = wallet.max_bet || 10.00;

    let betSize: number;

    switch (method) {
        case 'KELLY': {
            if (entryPrice >= 0.99) {
                betSize = minBet;
                break;
            }
            const kellyFraction = wallet.kelly_fraction || 0.25;
            const bankroll = effectiveBankroll ?? wallet.current_balance ?? wallet.starting_balance ?? 1000;
            const fullKelly = edge / (1 - entryPrice);
            const kellyBet = bankroll * fullKelly * kellyFraction;
            betSize = kellyBet;
            break;
        }
        case 'EDGE_SCALED': {
            const baseBet = wallet.bet_size * (wallet.bet_allocation_weight || 1.0);
            const scaleFactor = 5;
            betSize = baseBet * (1 + edge * scaleFactor);
            break;
        }
        case 'TIERED': {
            const baseBet = wallet.bet_size * (wallet.bet_allocation_weight || 1.0);
            if (edge >= 0.15) {
                betSize = baseBet * 2.0;
            } else if (edge >= 0.10) {
                betSize = baseBet * 1.5;
            } else if (edge >= 0.05) {
                betSize = baseBet * 1.0;
            } else {
                betSize = baseBet * 0.5;
            }
            break;
        }
        case 'CONVICTION': {
            const baseBet = wallet.bet_size * (wallet.bet_allocation_weight || 1.0);
            const convictionMultiplier = Math.min(Math.max(conviction, 0.5), 3.0);
            betSize = baseBet * convictionMultiplier;
            break;
        }
        case 'ML_SCALED': {
            const baseBet = wallet.bet_size * (wallet.bet_allocation_weight || 1.0);
            const ml = modelProbability ?? 0.55;
            const mlMult = Math.min(Math.max(0.5 + (ml - 0.5), 0.5), 2.0);
            betSize = baseBet * mlMult;
            break;
        }
        case 'CONFIDENCE': {
            const baseBet = wallet.bet_size * (wallet.bet_allocation_weight || 1.0);
            const edgeScore = Math.min(edge / 0.20, 1);
            const wrScore = Math.min((traderWinRate - 0.50) / 0.30, 1);
            const convictionScore = Math.min((conviction - 0.5) / 2.5, 1);
            const confidenceScore = (edgeScore * 0.4) + (convictionScore * 0.3) + (wrScore * 0.3);
            betSize = baseBet * (0.5 + confidenceScore * 1.5);
            break;
        }
        case 'FIXED':
        default: {
            betSize = wallet.bet_size * (wallet.bet_allocation_weight || 1.0);
            break;
        }
    }

    betSize = Math.max(minBet, Math.min(maxBet, betSize));
    return Math.round(betSize * 100) / 100;
}

/**
 * Parse timestamp from various formats
 */
export function parseTimestamp(value: number | string | undefined): Date | null {
    if (value === undefined || value === null) return null;
    let ts = Number(value);
    if (!Number.isFinite(ts)) return null;
    if (ts < 10000000000) ts *= 1000; // Convert seconds to ms
    const date = new Date(ts);
    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Evaluate if a trade qualifies for a wallet strategy
 */
export async function evaluateTrade(
    trade: EnrichedTrade,
    wallet: FTWallet,
    market: MarketInfo | null,
    now: Date,
    lastSyncTime: Date,
    effectiveBankroll: number,
    mlScoreCache?: Map<string, number | null>,
    serviceRoleKey?: string
): Promise<TradeEvaluationResult> {
    const tradeTime = parseTimestamp(trade.timestamp);
    if (!tradeTime || tradeTime <= lastSyncTime) {
        return { qualifies: false, reason: 'trade_too_old' };
    }

    // Market checks
    if (!market) {
        return { qualifies: false, reason: 'market_not_found' };
    }
    if (market.resolved || market.closed) {
        return { qualifies: false, reason: 'market_resolved' };
    }
    if (market.endTime && tradeTime >= market.endTime) {
        return { qualifies: false, reason: 'after_market_end' };
    }

    // Parse extended filters
    const extFilters = parseExtendedFilters(wallet);

    // Trade live only check
    if (extFilters.trade_live_only) {
        const gameStartIso = market.game_start_time || market.start_time;
        if (!gameStartIso) {
            return { qualifies: false, reason: 'no_game_start_time' };
        }
        const gameStart = new Date(gameStartIso);
        if (now < gameStart) {
            return { qualifies: false, reason: 'pre_game' };
        }
    }

    // Target trader filter
    const targetTrader = extFilters.target_trader;
    const targetTraders = extFilters.target_traders;
    if (targetTrader || (targetTraders && targetTraders.length > 0)) {
        const traderWallet = (trade.traderWallet || '').toLowerCase();
        const allowed = targetTrader
            ? traderWallet === targetTrader.toLowerCase()
            : targetTraders!.some(t => traderWallet === (t || '').toLowerCase());
        if (!allowed) {
            return { qualifies: false, reason: 'not_target_trader' };
        }
    }

    // Price and edge calculations
    const price = Number(trade.price || 0);
    const priceWithSlippage = Math.min(0.9999, price * (1 + FT_SLIPPAGE_PCT));
    const traderWinRate = trade.traderWinRate;
    const edge = traderWinRate - priceWithSlippage;

    // Price range check
    if (price < wallet.price_min || price > wallet.price_max) {
        return { qualifies: false, reason: 'price_out_of_range' };
    }

    // Win rate check
    const minWinRate = extFilters.min_trader_win_rate ??
        (wallet.use_model ? 0 : (wallet.model_threshold ?? 0));
    if (traderWinRate < minWinRate) {
        return { qualifies: false, reason: 'low_win_rate' };
    }

    // Edge check
    if (edge < wallet.min_edge) {
        return { qualifies: false, reason: 'insufficient_edge' };
    }

    // Trade count check
    if (trade.traderTradeCount < (wallet.min_trader_resolved_count || 30)) {
        return { qualifies: false, reason: 'low_trade_count' };
    }

    // Conviction check
    const minConviction = wallet.min_conviction || 0;
    if (minConviction > 0 && trade.conviction < minConviction) {
        return { qualifies: false, reason: 'low_conviction' };
    }

    // Extended filter checks
    if (extFilters.max_trader_win_rate !== undefined && traderWinRate > extFilters.max_trader_win_rate) {
        return { qualifies: false, reason: 'high_win_rate' };
    }
    if (extFilters.max_edge !== undefined && edge > extFilters.max_edge) {
        return { qualifies: false, reason: 'high_edge' };
    }
    if (extFilters.max_conviction !== undefined && trade.conviction > extFilters.max_conviction) {
        return { qualifies: false, reason: 'high_conviction' };
    }

    // Market category check
    const marketCats = extFilters.market_categories?.length
        ? extFilters.market_categories
        : (wallet.market_categories?.length ? wallet.market_categories : null);
    if (marketCats && marketCats.length > 0) {
        const titleLower = (trade.title || '').toLowerCase();
        const matchesCategory = marketCats.some(cat =>
            titleLower.includes((cat || '').toLowerCase())
        );
        if (!matchesCategory) {
            return { qualifies: false, reason: 'wrong_category' };
        }
    }

    // Original trade size check
    const originalTradeSize = Number(trade.size || 0);
    if (extFilters.min_original_trade_usd !== undefined && originalTradeSize < extFilters.min_original_trade_usd) {
        return { qualifies: false, reason: 'trade_too_small' };
    }
    if (extFilters.max_original_trade_usd !== undefined && originalTradeSize > extFilters.max_original_trade_usd) {
        return { qualifies: false, reason: 'trade_too_large' };
    }

    // ML model check (if use_model is true)
    let modelProbability: number | null = null;
    if (wallet.use_model && wallet.model_threshold != null) {
        const sourceTradeId = getSourceTradeId(trade);
        
        // Check cache first
        if (mlScoreCache?.has(sourceTradeId)) {
            modelProbability = mlScoreCache.get(sourceTradeId) ?? null;
        } else {
            // Fetch ML score
            try {
                let outcomes = market.outcomes || ['Yes', 'No'];
                let outcomePrices = market.outcome_prices;
                if (typeof outcomes === 'string') {
                    try { outcomes = JSON.parse(outcomes); } catch { outcomes = ['Yes', 'No']; }
                }
                if (typeof outcomePrices === 'string') {
                    try { outcomePrices = JSON.parse(outcomePrices); } catch { outcomePrices = [0.5, 0.5]; }
                }
                const outcomesArr = Array.isArray(outcomes) ? outcomes : ['Yes', 'No'];
                const pricesArr = Array.isArray(outcomePrices) ? outcomePrices.map((p: unknown) => Number(p) || 0.5) : [0.5, 0.5];
                const tokenIdx = outcomesArr.findIndex((o: string) => (o || '').toLowerCase() === (trade.outcome || 'YES').toLowerCase());
                const currentPrice = pricesArr[tokenIdx >= 0 ? tokenIdx : 0] ?? 0.5;
                const shares = price > 0 ? effectiveBankroll / price : 0;

                const polyScoreResponse = await getPolyScore({
                    original_trade: {
                        wallet_address: trade.traderWallet,
                        condition_id: trade.conditionId || '',
                        side: (trade.side || 'BUY') as 'BUY' | 'SELL',
                        price,
                        shares_normalized: shares,
                        timestamp: tradeTime.toISOString()
                    },
                    market_context: {
                        current_price: currentPrice,
                        current_timestamp: now.toISOString(),
                        market_title: market.title || trade.title || '',
                        market_tags: market.tags ? JSON.stringify(market.tags) : null,
                        market_end_time_unix: market.endTime ? Math.floor(market.endTime.getTime() / 1000) : null,
                        market_start_time_unix: market.start_time ? Math.floor(new Date(market.start_time).getTime() / 1000) : null,
                        token_label: trade.outcome || 'YES'
                    },
                    user_slippage: 0.3
                }, serviceRoleKey);

                if (polyScoreResponse.success) {
                    if (polyScoreResponse.prediction?.probability) {
                        modelProbability = polyScoreResponse.prediction.probability;
                    } else if (polyScoreResponse.valuation?.ai_fair_value) {
                        modelProbability = polyScoreResponse.valuation.ai_fair_value;
                    } else if (polyScoreResponse.analysis?.prediction_stats?.ai_fair_value) {
                        modelProbability = polyScoreResponse.analysis.prediction_stats.ai_fair_value;
                    }
                    if (modelProbability != null && modelProbability > 1) {
                        modelProbability = modelProbability / 100;
                    }
                }
                
                if (mlScoreCache) {
                    mlScoreCache.set(sourceTradeId, modelProbability);
                }
            } catch (mlErr: unknown) {
                console.warn(`[Trade Evaluation] ML check failed:`, mlErr);
                return { qualifies: false, reason: 'ml_unavailable' };
            }
        }

        if (modelProbability == null || modelProbability < wallet.model_threshold) {
            return {
                qualifies: false,
                reason: modelProbability == null ? 'ml_unavailable' : 'low_ml_score',
            };
        }
    }

    // Calculate bet size
    const betSize = calculateBetSize(wallet, traderWinRate, price, edge, trade.conviction, effectiveBankroll);

    // Cash check
    if (effectiveBankroll < betSize || effectiveBankroll <= 0) {
        return { qualifies: false, reason: 'insufficient_cash' };
    }

    return {
        qualifies: true,
        betSize,
        priceWithSlippage,
        edge,
        modelProbability,
    };
}
