/**
 * Live Trading Executor
 * Executes real trades following FT strategy signals with risk management
 */

import { createAdminServiceClient } from '@/lib/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthedClobClientForUserAnyWallet } from '@/lib/polymarket/authed-client';
import { roundDownToStep } from '@/lib/polymarket/sizing';
import { checkRiskRules, updateRiskStateAfterTrade, type TradeSignal } from './risk-manager';
import { type EnrichedTrade, calculateBetSize as sharedCalculateBetSize, getSourceTradeId } from '@/lib/ft-sync/shared-logic';

export interface LTStrategy {
    strategy_id: string;
    ft_wallet_id: string;
    user_id: string;
    wallet_address: string;
    is_active: boolean;
    is_paused: boolean;
    launched_at: string | null;
    starting_capital: number;
    slippage_tolerance_pct: number;
    order_type: string;
    min_order_size_usd: number;
    max_order_size_usd: number;
    last_sync_time: string | null;
}

export interface ExecutionResult {
    success: boolean;
    lt_order_id?: string;
    order_id?: string;
    error?: string;
    riskCheckPassed: boolean;
    riskCheckReason?: string;
}

/**
 * Get active LT strategies
 */
export async function getActiveStrategies(
    supabase: SupabaseClient
): Promise<LTStrategy[]> {
    const { data, error } = await supabase
        .from('lt_strategies')
        .select('*')
        .eq('is_active', true)
        .eq('is_paused', false);

    if (error || !data) {
        return [];
    }

    return data as LTStrategy[];
}

/**
 * Get FT wallet config for a strategy
 */
export async function getFTWalletConfig(
    supabase: SupabaseClient,
    ftWalletId: string
): Promise<any | null> {
    const { data, error } = await supabase
        .from('ft_wallets')
        .select('*')
        .eq('wallet_id', ftWalletId)
        .single();

    if (error || !data) {
        return null;
    }

    return data;
}

// Bet size calculation is now imported from shared-logic.ts

/**
 * Execute a trade for a strategy
 */
export async function executeTrade(
    supabase: SupabaseClient,
    strategy: LTStrategy,
    trade: EnrichedTrade,
    ftWallet: any,
    ftOrderId?: string
): Promise<ExecutionResult> {
    const signalTime = Date.now();
    const price = Number(trade.price || 0);
    const priceWithSlippage = Math.min(0.9999, price * (1 + strategy.slippage_tolerance_pct / 100));
    const traderWinRate = trade.traderWinRate;
    const edge = traderWinRate - priceWithSlippage;

    // Calculate bet size (same as FT) - use shared function
    const riskState = await import('./risk-manager').then(m => m.getRiskState(supabase, strategy.strategy_id));
    const effectiveBankroll = riskState?.current_equity || strategy.starting_capital;
    const betSize = sharedCalculateBetSize(ftWallet, traderWinRate, price, edge, trade.conviction, effectiveBankroll);

    // Risk check
    const sourceTradeId = getSourceTradeId({
        id: trade.id,
        transactionHash: trade.transactionHash,
        traderWallet: trade.traderWallet,
        conditionId: trade.conditionId,
        timestamp: trade.timestamp,
    });

    const riskCheck = await checkRiskRules(supabase, strategy.strategy_id, {
        condition_id: trade.conditionId || '',
        price,
        size: betSize,
        source_trade_id: sourceTradeId,
    });

    if (!riskCheck.allowed) {
        return {
            success: false,
            error: riskCheck.reason,
            riskCheckPassed: false,
            riskCheckReason: riskCheck.reason,
        };
    }

    // Check if already executed
    const { data: existing } = await supabase
        .from('lt_orders')
        .select('lt_order_id')
        .eq('strategy_id', strategy.strategy_id)
        .eq('source_trade_id', sourceTradeId)
        .limit(1);

    if (existing && existing.length > 0) {
        return {
            success: false,
            error: 'Trade already executed',
            riskCheckPassed: true,
        };
    }

    // Get token ID
    const tokenId = trade.conditionId || '';
    if (!tokenId) {
        return {
            success: false,
            error: 'Missing condition_id',
            riskCheckPassed: true,
        };
    }

    // Calculate order size
    const sizeContracts = betSize / price;
    const roundedPrice = roundDownToStep(price, 0.01);
    const roundedSize = roundDownToStep(sizeContracts, 0.01);

    // Place order
    try {
        const { client, signatureType } = await getAuthedClobClientForUserAnyWallet(strategy.user_id);
        const order = await client.createOrder(
            {
                tokenID: tokenId,
                price: roundedPrice,
                size: roundedSize,
                side: 'BUY' as any,
            },
            { signatureType } as any
        );

        const rawResult = await client.postOrder(order, (strategy.order_type || 'GTC') as any, false);

        // Get order ID from result
        const orderId = rawResult?.orderID || rawResult?.order_id || null;
        if (!orderId) {
            throw new Error('No order ID returned from CLOB');
        }

        // Find order in orders table
        const { data: orderRecord } = await supabase
            .from('orders')
            .select('order_id')
            .eq('polymarket_order_id', orderId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        const finalOrderId = orderRecord?.order_id || orderId;

        // Calculate execution metrics
        const executionLatency = Date.now() - signalTime;
        const executedPrice = roundedPrice; // Will be updated when fill occurs
        const executedSize = roundedSize; // Will be updated when fill occurs
        const slippage = price > 0 ? (executedPrice - price) / price : 0;

        // Create LT order record
        const { data: ltOrder, error: ltError } = await supabase
            .from('lt_orders')
            .insert({
                strategy_id: strategy.strategy_id,
                ft_order_id: ftOrderId || null,
                order_id: finalOrderId,
                polymarket_order_id: orderId,
                source_trade_id: sourceTradeId,
                trader_address: trade.traderWallet,
                condition_id: trade.conditionId,
                market_slug: trade.slug || null,
                market_title: trade.title || null,
                token_label: (trade.outcome || 'YES').toUpperCase(),
                signal_price: price,
                signal_size_usd: betSize,
                executed_price: executedPrice,
                executed_size: executedSize,
                order_placed_at: new Date().toISOString(),
                slippage_pct: slippage,
                fill_rate: 1.0, // Will be updated on fill
                execution_latency_ms: executionLatency,
                risk_check_passed: true,
                status: 'PENDING',
                outcome: 'OPEN',
                ft_entry_price: priceWithSlippage,
                ft_size: betSize,
            })
            .select('lt_order_id')
            .single();

        if (ltError || !ltOrder) {
            throw new Error(`Failed to create LT order: ${ltError?.message}`);
        }

        // Update orders table with LT metadata
        await supabase
            .from('orders')
            .update({
                lt_strategy_id: strategy.strategy_id,
                lt_order_id: ltOrder.lt_order_id,
                signal_price: price,
                signal_size_usd: betSize,
            })
            .eq('order_id', finalOrderId);

        // Update risk state
        await updateRiskStateAfterTrade(supabase, strategy.strategy_id, betSize, null);

        return {
            success: true,
            lt_order_id: ltOrder.lt_order_id,
            order_id: finalOrderId,
            riskCheckPassed: true,
        };
    } catch (error: any) {
        console.error('[LT Executor] Order placement failed:', error);
        return {
            success: false,
            error: error?.message || 'Order placement failed',
            riskCheckPassed: true,
        };
    }
}
