/**
 * Structured Logger for Live Trading
 *
 * Features:
 * - trace_id: correlate all logs for a single trade execution
 * - execution_id: correlate all logs for a single cron run
 * - stage: label which step of the pipeline we're in
 * - elapsed_ms: time since the trace started
 * - Non-blocking DB writes (fire-and-forget)
 *
 * Stages (in execution order):
 *   EXECUTION_START → STRATEGY_START → COOLDOWN_PROCESS → FT_QUERY →
 *   TOKEN_RESOLVE → CASH_CHECK → RISK_CHECK → ORDER_PLACE → ORDER_POLL →
 *   ORDER_RESULT → STRATEGY_END → EXECUTION_END
 */

import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminServiceClient } from '@/lib/admin';

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export type LogStage =
    | 'EXECUTION_START'
    | 'EXECUTION_END'
    | 'STRATEGY_START'
    | 'STRATEGY_END'
    | 'COOLDOWN_PROCESS'
    | 'FT_QUERY'
    | 'TOKEN_RESOLVE'
    | 'CASH_CHECK'
    | 'RISK_CHECK'
    | 'ORDER_PREP'
    | 'ORDER_PLACE'
    | 'ORDER_POLL'
    | 'ORDER_RESULT'
    | 'SELL_DETECT'
    | 'SELL_EXECUTE'
    | 'RESOLVE'
    | 'DAILY_RESET'
    | 'ERROR'
    | string;

interface LogContext {
    trace_id: string;
    execution_id: string;
    strategy_id?: string;
    ft_wallet_id?: string;
    ft_order_id?: string;
    lt_order_id?: string;
    order_id?: string;
    trace_start_ms: number;
}

// ──────────────────────────────────────────────────────────────────────
// Logger Class
// ──────────────────────────────────────────────────────────────────────

export class LTLogger {
    private ctx: LogContext;
    private supabase: SupabaseClient;

    constructor(executionId: string, supabase?: SupabaseClient) {
        this.ctx = {
            trace_id: randomUUID(),
            execution_id: executionId,
            trace_start_ms: Date.now(),
        };
        this.supabase = supabase || createAdminServiceClient();
    }

    /**
     * Create a child logger with additional context.
     * Shares the same execution_id but gets a new trace_id.
     */
    forTrade(overrides: Partial<Omit<LogContext, 'execution_id' | 'trace_start_ms'>>): LTLogger {
        const child = new LTLogger(this.ctx.execution_id, this.supabase);
        child.ctx = {
            ...this.ctx,
            trace_id: randomUUID(),
            trace_start_ms: Date.now(),
            ...overrides,
        };
        return child;
    }

    /** Create a child logger with same trace but added context. */
    withContext(overrides: Partial<Pick<LogContext, 'strategy_id' | 'ft_wallet_id' | 'ft_order_id' | 'lt_order_id' | 'order_id'>>): LTLogger {
        const child = new LTLogger(this.ctx.execution_id, this.supabase);
        child.ctx = { ...this.ctx, ...overrides };
        return child;
    }

    get traceId(): string {
        return this.ctx.trace_id;
    }

    get executionId(): string {
        return this.ctx.execution_id;
    }

    // ── Core log method ──

    async log(
        level: LogLevel,
        stage: LogStage,
        message: string,
        extra?: Record<string, unknown>,
    ): Promise<void> {
        const elapsed_ms = Date.now() - this.ctx.trace_start_ms;

        // Console output (always)
        const icon = { trace: '🔍', debug: '🐛', info: 'ℹ️ ', warn: '⚠️ ', error: '❌' }[level];
        const traceShort = this.ctx.trace_id.slice(0, 8);
        const prefix = `${icon} [${traceShort}] [+${elapsed_ms}ms] [${stage}]`;
        const extraStr = extra ? ` ${JSON.stringify(extra)}` : '';
        console.log(`${prefix} ${message}${extraStr}`);

        // DB persist (fire-and-forget)
        this.persist(level, stage, message, elapsed_ms, extra).catch((err) => {
            console.error('[LTLogger] persist failed:', err);
        });
    }

    private async persist(
        level: LogLevel,
        stage: LogStage,
        message: string,
        elapsed_ms: number,
        extra?: Record<string, unknown>,
    ): Promise<void> {
        await this.supabase.from('lt_execute_logs').insert({
            level,
            stage,
            message,
            trace_id: this.ctx.trace_id,
            execution_id: this.ctx.execution_id,
            strategy_id: this.ctx.strategy_id ?? null,
            ft_wallet_id: this.ctx.ft_wallet_id ?? null,
            ft_order_id: this.ctx.ft_order_id ?? null,
            lt_order_id: this.ctx.lt_order_id ?? null,
            order_id: this.ctx.order_id ?? null,
            elapsed_ms,
            extra: extra ?? null,
        });
    }

    // ── Convenience methods ──

    trace(stage: LogStage, message: string, extra?: Record<string, unknown>): Promise<void> {
        return this.log('trace', stage, message, extra);
    }

    debug(stage: LogStage, message: string, extra?: Record<string, unknown>): Promise<void> {
        return this.log('debug', stage, message, extra);
    }

    info(stage: LogStage, message: string, extra?: Record<string, unknown>): Promise<void> {
        return this.log('info', stage, message, extra);
    }

    warn(stage: LogStage, message: string, extra?: Record<string, unknown>): Promise<void> {
        return this.log('warn', stage, message, extra);
    }

    error(stage: LogStage, message: string, extra?: Record<string, unknown>): Promise<void> {
        return this.log('error', stage, message, extra);
    }
}

// ──────────────────────────────────────────────────────────────────────
// Factory
// ──────────────────────────────────────────────────────────────────────

/** Create a new logger for an LT execution run. */
export function createLTLogger(supabase?: SupabaseClient): LTLogger {
    const executionId = randomUUID();
    return new LTLogger(executionId, supabase);
}
