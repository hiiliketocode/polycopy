/**
 * Live Trading Executor
 * Executes real trades following FT strategy signals with risk management.
 * Uses the same place-order core as quick trades (Evomi, order_events_log, Cloudflare mitigation).
 */

import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { placeOrderCore } from '@/lib/polymarket/place-order-core';
import { roundDownToStep } from '@/lib/polymarket/sizing';
import { ensureTraderId } from '@/lib/traders/ensure-id';
import { checkRiskRules, updateRiskStateAfterTrade } from './risk-manager';
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
        console.warn(`[LT Executor] Risk check failed for ${strategy.strategy_id}: ${riskCheck.reason} (betSize=$${betSize.toFixed(2)})`);
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

    // Get token ID - must use the asset (token) ID, NOT the conditionId
    // The Polymarket CLOB API requires the token ID for trading
    const tokenId = trade.asset || '';
    if (!tokenId) {
        return {
            success: false,
            error: 'Missing token ID (asset)',
            riskCheckPassed: true,
        };
    }

    // Calculate order size and limit price with slippage (BUY: allow paying up to price * (1 + slippage))
    const sizeContracts = betSize / price;
    const slippagePct = Number(strategy.slippage_tolerance_pct ?? 5) || 5; // Default 5% for copy trading
    const priceWithSlippageForLimit = Math.min(0.9999, price * (1 + slippagePct / 100));
    
    // CRITICAL: Polymarket precision requirements:
    // Force to strings with exact decimals to prevent floating point issues
    // - Price: 2 decimals (maker amount)
    // - Size: 2 decimals (taker amount - using min to avoid errors)
    const priceStr = (Math.round(priceWithSlippageForLimit * 100) / 100).toFixed(2);
    const sizeStr = (Math.round(sizeContracts * 100) / 100).toFixed(2);
    const finalPrice = parseFloat(priceStr); // Parse back to ensure exactly 2 decimals
    const finalSize = parseFloat(sizeStr);

    // For copy trading, default to IOC (Immediate-Or-Cancel) for high fill rates
    const orderType = (strategy.order_type || 'IOC') as 'GTC' | 'FOK' | 'FAK' | 'IOC';
    
    console.log(`[LT Executor] Order params (string-enforced precision):`, {
        order_type: orderType,
        size: sizeStr,
        size_parsed: finalSize,
        price: priceStr,
        price_parsed: finalPrice,
        slippage_pct: slippagePct
    });
    const requestId = `lt_${strategy.strategy_id}_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const orderIntentId = randomUUID();

    const result = await placeOrderCore({
        supabase,
        userId: strategy.user_id,
        tokenId,
        price: finalPrice,
        size: finalSize,
        side: 'BUY',
        orderType,
        requestId,
        orderIntentId,
        useAnyWallet: true,
        conditionId: trade.conditionId || null,
        outcome: trade.outcome || null,
    });

    if (!result.success) {
        const errMsg = 'message' in result.evaluation ? result.evaluation.message : 'Order placement failed';
        console.error('[LT Executor] Order placement failed:', errMsg);
        return {
            success: false,
            error: errMsg,
            riskCheckPassed: true,
        };
    }

    const orderId = result.orderId ?? '';
    const executionLatency = Date.now() - signalTime;
    const executedPrice = finalPrice; // limit price we sent to CLOB
    const executedSize = finalSize;
    const slippage = price > 0 ? (finalPrice - price) / price : 0;

    // 1) Upsert orders row FIRST — lt_orders FK requires order_id to exist in orders
    const traderId = await ensureTraderId(supabase, strategy.wallet_address);
    const now = new Date().toISOString();
    await supabase.from('orders').upsert(
        {
            order_id: orderId,
            trader_id: traderId,
            market_id: trade.conditionId ?? null,
            outcome: (trade.outcome || 'YES').toUpperCase(),
            side: 'buy',
            order_type: orderType,
            price: finalPrice,
            size: finalSize,
            filled_size: 0,
            remaining_size: executedSize,
            status: 'open',
            created_at: now,
            updated_at: now,
            lt_strategy_id: strategy.strategy_id,
            lt_order_id: null,
            signal_price: price,
            signal_size_usd: betSize,
        },
        { onConflict: 'order_id' }
    );

    // 2) Insert lt_orders (FK to orders now satisfied)
    const { data: ltOrder, error: ltError } = await supabase
        .from('lt_orders')
        .insert({
            strategy_id: strategy.strategy_id,
            ft_order_id: ftOrderId || null,
            order_id: orderId,
            polymarket_order_id: orderId,
            source_trade_id: sourceTradeId,
            trader_address: trade.traderWallet,
            condition_id: trade.conditionId,
            market_slug: trade.slug || null,
            market_title: trade.title || null,
            token_label: (trade.outcome || 'YES').toUpperCase(),
            signal_price: price,
            signal_size_usd: betSize,
            executed_price: finalPrice,
            executed_size: finalSize,
            order_placed_at: new Date().toISOString(),
            slippage_pct: slippage,
            fill_rate: 1.0,
            execution_latency_ms: executionLatency,
            risk_check_passed: true,
            status: 'PENDING',
            outcome: 'OPEN',
            ft_entry_price: price,
            ft_size: betSize,
            is_force_test: false,
        })
        .select('lt_order_id')
        .single();

    if (ltError || !ltOrder) {
        console.error('[LT Executor] Failed to create LT order record:', ltError?.message);
        return {
            success: false,
            error: `Failed to create LT order: ${ltError?.message}`,
            riskCheckPassed: true,
        };
    }

    if (ltOrder.lt_order_id) {
        await supabase.from('orders').update({ lt_order_id: ltOrder.lt_order_id }).eq('order_id', orderId);
    }

    await updateRiskStateAfterTrade(supabase, strategy.strategy_id, betSize, null);

    return {
        success: true,
        lt_order_id: ltOrder.lt_order_id,
        order_id: orderId,
        riskCheckPassed: true,
    };
}
