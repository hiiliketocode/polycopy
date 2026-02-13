/**
 * Paginated Supabase query helper for LT.
 *
 * Supabase defaults to returning max 1000 rows per query.
 * Any unbounded SELECT on lt_orders can silently truncate results,
 * breaking PnL calculations, dedup sets, and capital reconciliation.
 *
 * Use this helper whenever the result set could exceed 1000 rows.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const PAGE_SIZE = 1000;

/**
 * Fetch all rows matching a query, paginating through Supabase's 1000-row limit.
 *
 * @param supabase - Supabase client
 * @param table    - Table name
 * @param columns  - Columns to select
 * @param filters  - Array of filter tuples: [column, operator, value]
 *                   operator: 'eq' | 'in' | 'is' | 'gte' | 'not.is' | 'not.in'
 * @returns All matching rows
 *
 * @example
 *   const orders = await fetchAllRows(supabase, 'lt_orders', 'pnl', [
 *     ['strategy_id', 'eq', 'LT_FT_ML_LOOSE'],
 *     ['outcome', 'in', ['WON', 'LOST']],
 *   ]);
 */
export async function fetchAllRows<T = any>(
    supabase: SupabaseClient,
    table: string,
    columns: string,
    filters: Array<[string, string, any]>,
): Promise<T[]> {
    const results: T[] = [];
    let offset = 0;

    while (true) {
        let query = supabase
            .from(table)
            .select(columns)
            .range(offset, offset + PAGE_SIZE - 1);

        for (const [col, op, val] of filters) {
            switch (op) {
                case 'eq': query = query.eq(col, val); break;
                case 'in': query = query.in(col, val); break;
                case 'is': query = query.is(col, val); break;
                case 'gte': query = query.gte(col, val); break;
                case 'lte': query = query.lte(col, val); break;
                case 'not.is': query = query.not(col, 'is', val); break;
                case 'not.in': query = query.not(col, 'in', val); break;
                default: query = query.eq(col, val);
            }
        }

        const { data, error } = await query;
        if (error || !data || data.length === 0) break;

        results.push(...(data as T[]));
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }

    return results;
}
