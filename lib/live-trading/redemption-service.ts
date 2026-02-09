/**
 * Redemption Service for Live Trading
 * Handles auto-redemption of winning positions and confirmation of losses
 * 
 * Note: No official CLOB API endpoint exists for redemption (feature request #139)
 * For EOA wallets: Use Conditional Tokens contract directly
 * For Safe wallets: Use relayer client or wait for official API
 */

import { createAdminServiceClient } from '@/lib/admin';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface RedemptionRecord {
    redemption_id: string;
    lt_order_id: string;
    strategy_id: string;
    order_id: string;
    condition_id: string;
    market_resolved_at: string | null;
    winning_outcome: string | null;
    user_outcome: string | null;
    redemption_type: 'WINNER' | 'LOSER';
    redemption_status: 'PENDING' | 'REDEEMING' | 'REDEEMED' | 'FAILED';
    redemption_tx_hash: string | null;
    redemption_amount_usd: number | null;
    redemption_attempts: number;
    last_attempt_at: string | null;
    last_error: string | null;
    created_at: string;
    redeemed_at: string | null;
}

/**
 * Get pending redemptions
 */
export async function getPendingRedemptions(
    supabase: SupabaseClient,
    limit: number = 100
): Promise<RedemptionRecord[]> {
    const { data, error } = await supabase
        .from('lt_redemptions')
        .select('*')
        .eq('redemption_status', 'PENDING')
        .order('created_at', { ascending: true })
        .limit(limit);

    if (error || !data) {
        return [];
    }

    return data as RedemptionRecord[];
}

/**
 * Create redemption record for a resolved position
 */
export async function createRedemptionRecord(
    supabase: SupabaseClient,
    params: {
        lt_order_id: string;
        strategy_id: string;
        order_id: string;
        condition_id: string;
        market_resolved_at: string;
        winning_outcome: string;
        user_outcome: string;
    }
): Promise<string | null> {
    const isWinner = params.winning_outcome === params.user_outcome;
    const redemptionType = isWinner ? 'WINNER' : 'LOSER';

    const { data, error } = await supabase
        .from('lt_redemptions')
        .insert({
            lt_order_id: params.lt_order_id,
            strategy_id: params.strategy_id,
            order_id: params.order_id,
            condition_id: params.condition_id,
            market_resolved_at: params.market_resolved_at,
            winning_outcome: params.winning_outcome,
            user_outcome: params.user_outcome,
            redemption_type: redemptionType,
            redemption_status: 'PENDING',
        })
        .select('redemption_id')
        .single();

    if (error || !data) {
        console.error('[Redemption] Failed to create redemption record:', error);
        return null;
    }

    // Update lt_order with redemption_id
    await supabase
        .from('lt_orders')
        .update({ redemption_id: data.redemption_id })
        .eq('lt_order_id', params.lt_order_id);

    return data.redemption_id;
}

/**
 * Update redemption status
 */
export async function updateRedemptionStatus(
    supabase: SupabaseClient,
    redemptionId: string,
    updates: {
        redemption_status?: 'PENDING' | 'REDEEMING' | 'REDEEMED' | 'FAILED';
        redemption_tx_hash?: string;
        redemption_amount_usd?: number;
        redemption_attempts?: number;
        last_attempt_at?: string;
        last_error?: string;
        redeemed_at?: string;
    }
): Promise<void> {
    await supabase
        .from('lt_redemptions')
        .update(updates)
        .eq('redemption_id', redemptionId);
}

/**
 * Get redemption record by lt_order_id
 */
export async function getRedemptionByOrderId(
    supabase: SupabaseClient,
    ltOrderId: string
): Promise<RedemptionRecord | null> {
    const { data, error } = await supabase
        .from('lt_redemptions')
        .select('*')
        .eq('lt_order_id', ltOrderId)
        .single();

    if (error || !data) {
        return null;
    }

    return data as RedemptionRecord;
}

/**
 * Process redemptions (called by cron)
 * This checks for resolved markets and creates redemption records
 */
export async function processRedemptions(
    supabase: SupabaseClient
): Promise<{ processed: number; created: number; errors: number }> {
    let processed = 0;
    let created = 0;
    let errors = 0;

    // Get all OPEN LT orders
    const { data: openOrders, error: ordersError } = await supabase
        .from('lt_orders')
        .select('*')
        .eq('outcome', 'OPEN')
        .is('redemption_id', null);

    if (ordersError || !openOrders) {
        console.error('[Redemption] Failed to fetch open orders:', ordersError);
        return { processed: 0, created: 0, errors: 1 };
    }

    // Group by condition_id to batch market checks
    const conditionIds = [...new Set(openOrders.map(o => o.condition_id).filter(Boolean))];

    // Check market resolution for each condition
    for (const conditionId of conditionIds) {
        try {
            // Fetch market from Polymarket API
            const marketResponse = await fetch(
                `https://gamma-api.polymarket.com/markets?condition_ids=${conditionId}`,
                { headers: { 'Accept': 'application/json' } }
            );

            if (!marketResponse.ok) {
                errors++;
                continue;
            }

            const markets = await marketResponse.json();
            const market = Array.isArray(markets) ? markets[0] : markets;

            if (!market) {
                continue;
            }

            // Check if market is resolved
            const isResolved = market.closed || market.resolvedOutcome || market.winningOutcome;
            if (!isResolved) {
                continue;
            }

            // Get winning outcome
            let winningOutcome: string | null = null;
            if (market.resolvedOutcome) {
                winningOutcome = market.resolvedOutcome.toUpperCase();
            } else if (market.winningOutcome) {
                winningOutcome = market.winningOutcome.toUpperCase();
            } else if (market.outcomePrices) {
                // Determine winner from prices (price >= 0.99 = winner)
                const prices = Array.isArray(market.outcomePrices)
                    ? market.outcomePrices.map((p: any) => parseFloat(p))
                    : [];
                const winnerIndex = prices.findIndex((p: number) => p >= 0.99);
                if (winnerIndex >= 0 && market.outcomes) {
                    const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
                    winningOutcome = outcomes[winnerIndex]?.toUpperCase() || null;
                }
            }

            if (!winningOutcome) {
                continue;
            }

            // Find orders for this market
            const ordersForMarket = openOrders.filter(o => o.condition_id === conditionId);

            for (const order of ordersForMarket) {
                processed++;

                // Check if redemption already exists
                const existing = await getRedemptionByOrderId(supabase, order.lt_order_id);
                if (existing) {
                    continue;
                }

                // Normalize outcomes for comparison
                const userOutcome = (order.token_label || 'YES').toUpperCase();
                const normalizedWinning = winningOutcome === 'YES' || winningOutcome === 'Y' ? 'YES' : 'NO';
                const normalizedUser = userOutcome === 'YES' || userOutcome === 'Y' ? 'YES' : 'NO';

                // Create redemption record
                const redemptionId = await createRedemptionRecord(supabase, {
                    lt_order_id: order.lt_order_id,
                    strategy_id: order.strategy_id,
                    order_id: order.order_id,
                    condition_id: conditionId,
                    market_resolved_at: new Date().toISOString(),
                    winning_outcome: normalizedWinning,
                    user_outcome: normalizedUser,
                });

                if (redemptionId) {
                    created++;
                } else {
                    errors++;
                }
            }
        } catch (error: any) {
            console.error(`[Redemption] Error processing condition ${conditionId}:`, error);
            errors++;
        }
    }

    return { processed, created, errors };
}

/**
 * Attempt to redeem a winning position
 * 
 * Note: This is a placeholder. Actual redemption requires:
 * - For EOA: Direct Conditional Tokens contract call
 * - For Safe: Relayer client or official API endpoint
 * 
 * For now, this just marks the redemption as attempted and logs the need
 */
export async function attemptRedemption(
    supabase: SupabaseClient,
    redemption: RedemptionRecord,
    walletAddress: string,
    walletType: 'EOA' | 'SAFE' = 'EOA'
): Promise<{ success: boolean; txHash?: string; error?: string }> {
    // Update status to REDEEMING
    await updateRedemptionStatus(supabase, redemption.redemption_id, {
        redemption_status: 'REDEEMING',
        redemption_attempts: redemption.redemption_attempts + 1,
        last_attempt_at: new Date().toISOString(),
    });

    // Only attempt redemption for winners
    if (redemption.redemption_type !== 'WINNER') {
        // For losers, just confirm (no transaction needed)
        await updateRedemptionStatus(supabase, redemption.redemption_id, {
            redemption_status: 'REDEEMED',
            redeemed_at: new Date().toISOString(),
        });
        return { success: true };
    }

    // TODO: Implement actual redemption
    // For EOA wallets:
    // - Use Conditional Tokens contract: redeemPositions(conditionId, [outcomeIndex], [balance])
    // - Requires Web3 provider and signer
    // 
    // For Safe wallets:
    // - Use relayer client or wait for official API
    // - Requires Safe SDK

    // For now, mark as failed with instruction
    const error = walletType === 'SAFE'
        ? 'Safe wallet redemption requires relayer client (not yet implemented)'
        : 'EOA wallet redemption requires Web3 contract interaction (not yet implemented)';

    await updateRedemptionStatus(supabase, redemption.redemption_id, {
        redemption_status: 'FAILED',
        last_error: error,
    });

    console.warn(`[Redemption] Redemption not yet implemented for ${walletType} wallet:`, {
        redemption_id: redemption.redemption_id,
        wallet_address: walletAddress,
        condition_id: redemption.condition_id,
    });

    return { success: false, error };
}

/**
 * Process pending redemptions (called by cron)
 */
export async function processPendingRedemptions(
    supabase: SupabaseClient
): Promise<{ attempted: number; succeeded: number; failed: number }> {
    const pending = await getPendingRedemptions(supabase, 50);
    let attempted = 0;
    let succeeded = 0;
    let failed = 0;

    for (const redemption of pending) {
        // Get strategy to find wallet address
        const { data: strategy } = await supabase
            .from('lt_strategies')
            .select('wallet_address')
            .eq('strategy_id', redemption.strategy_id)
            .single();

        if (!strategy) {
            failed++;
            continue;
        }

        // Determine wallet type (simplified - would need actual check)
        // For now, assume EOA (can be enhanced later)
        const walletType: 'EOA' | 'SAFE' = 'EOA';

        attempted++;
        const result = await attemptRedemption(
            supabase,
            redemption,
            strategy.wallet_address,
            walletType
        );

        if (result.success) {
            succeeded++;
        } else {
            failed++;
        }
    }

    return { attempted, succeeded, failed };
}
