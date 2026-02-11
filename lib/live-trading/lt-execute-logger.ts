/**
 * LT Execute logger: writes to lt_execute_logs table for display on /lt/logs page.
 * Fire-and-forget to avoid blocking the cron.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type LtLogLevel = 'info' | 'warn' | 'error';

export async function ltLog(
    supabase: SupabaseClient,
    level: LtLogLevel,
    message: string,
    meta?: { strategy_id?: string; ft_wallet_id?: string; source_trade_id?: string; extra?: Record<string, unknown> }
): Promise<void> {
    try {
        await supabase.from('lt_execute_logs').insert({
            level,
            message,
            strategy_id: meta?.strategy_id ?? null,
            ft_wallet_id: meta?.ft_wallet_id ?? null,
            source_trade_id: meta?.source_trade_id ?? null,
            extra: meta?.extra ?? null,
        });
    } catch (err) {
        console.error('[lt-execute-logger] Failed to persist log:', err);
    }
}
