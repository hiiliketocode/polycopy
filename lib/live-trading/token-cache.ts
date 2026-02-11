/**
 * Token ID Cache — In-memory + DB fallback for resolving condition_id → token_id
 *
 * Token IDs (needed for CLOB orders) rarely change. Instead of calling
 * the CLOB API every time, we cache results in memory for the lifetime
 * of the serverless function, with DB fallback.
 *
 * Lookup order:
 *   1. In-memory Map (instant)
 *   2. Supabase `markets` table (fast DB query)
 *   3. CLOB API /markets/:conditionId (network, with retry)
 *
 * On successful CLOB resolution, we store the result in memory.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LTLogger } from './lt-logger';

// ──────────────────────────────────────────────────────────────────────
// In-memory cache (lives per serverless invocation)
// ──────────────────────────────────────────────────────────────────────

const tokenCache = new Map<string, string>();  // key: `${conditionId}::${outcome}`, value: tokenId

function cacheKey(conditionId: string, outcome: string): string {
    return `${conditionId}::${(outcome || 'yes').toLowerCase()}`;
}

/** Pre-warm the cache (useful for batch operations). */
export function prewarmCache(entries: Array<{ conditionId: string; outcome: string; tokenId: string }>): void {
    for (const e of entries) {
        tokenCache.set(cacheKey(e.conditionId, e.outcome), e.tokenId);
    }
}

/** Clear cache (for testing). */
export function clearCache(): void {
    tokenCache.clear();
}

// ──────────────────────────────────────────────────────────────────────
// Resolve token ID
// ──────────────────────────────────────────────────────────────────────

/**
 * Resolve a condition_id + outcome to a CLOB token_id.
 *
 * @returns token_id string or null if resolution failed
 */
export async function resolveTokenId(
    supabase: SupabaseClient,
    conditionId: string,
    outcome: string,
    logger?: LTLogger,
): Promise<string | null> {
    const key = cacheKey(conditionId, outcome);
    const label = (outcome || 'yes').toLowerCase();

    // 1. Memory cache
    const cached = tokenCache.get(key);
    if (cached) {
        logger?.trace('TOKEN_RESOLVE', `Cache hit: ${conditionId} → ${cached}`);
        return cached;
    }

    // 2. Database fallback (markets table)
    try {
        const { data: marketRow } = await supabase
            .from('markets')
            .select('tokens')
            .eq('condition_id', conditionId)
            .maybeSingle();

        if (marketRow?.tokens) {
            let tokens = marketRow.tokens;
            if (typeof tokens === 'string') {
                try { tokens = JSON.parse(tokens); } catch { tokens = null; }
            }
            if (Array.isArray(tokens)) {
                const matched = tokens.find((t: any) => (t.outcome || '').toLowerCase() === label);
                const tokenId = matched?.token_id || tokens[0]?.token_id;
                if (tokenId) {
                    tokenCache.set(key, tokenId);
                    logger?.debug('TOKEN_RESOLVE', `DB hit: ${conditionId} → ${tokenId}`);
                    return tokenId;
                }
            }
        }
    } catch (err: any) {
        logger?.warn('TOKEN_RESOLVE', `DB lookup failed: ${err.message}`, { conditionId });
    }

    // 3. CLOB API with retry
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);

            const resp = await fetch(`https://clob.polymarket.com/markets/${conditionId}`, {
                cache: 'no-store',
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (resp.ok) {
                const clobMarket = await resp.json();
                if (Array.isArray(clobMarket?.tokens)) {
                    // Cache ALL outcomes for this market (saves future lookups)
                    for (const t of clobMarket.tokens) {
                        if (t.token_id && t.outcome) {
                            tokenCache.set(cacheKey(conditionId, t.outcome), t.token_id);
                        }
                    }

                    const matched = clobMarket.tokens.find((t: any) => (t.outcome || '').toLowerCase() === label);
                    const tokenId = matched?.token_id || clobMarket.tokens[0]?.token_id;
                    if (tokenId) {
                        logger?.debug('TOKEN_RESOLVE', `CLOB hit (attempt ${attempt}): ${conditionId} → ${tokenId}`);
                        return tokenId;
                    }
                }
            }
        } catch (err: any) {
            logger?.warn('TOKEN_RESOLVE', `CLOB attempt ${attempt}/${maxRetries} failed: ${err.message}`, { conditionId });
            if (attempt < maxRetries) {
                await new Promise((r) => setTimeout(r, 500 * attempt));
            }
        }
    }

    logger?.error('TOKEN_RESOLVE', `Failed to resolve token ID for ${conditionId} (${label})`, { conditionId, outcome: label });
    return null;
}

/**
 * Batch-resolve token IDs for multiple condition_id + outcome pairs.
 * Deduplicates and parallelizes lookups.
 */
export async function batchResolveTokenIds(
    supabase: SupabaseClient,
    pairs: Array<{ conditionId: string; outcome: string }>,
    logger?: LTLogger,
): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    // Deduplicate
    const unique = new Map<string, { conditionId: string; outcome: string }>();
    for (const p of pairs) {
        const key = cacheKey(p.conditionId, p.outcome);
        if (!unique.has(key)) {
            unique.set(key, p);
        }
    }

    // Resolve in parallel (max 5 concurrent to avoid CLOB rate limits)
    const entries = Array.from(unique.entries());
    const batchSize = 5;

    for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        const promises = batch.map(async ([key, { conditionId, outcome }]) => {
            const tokenId = await resolveTokenId(supabase, conditionId, outcome, logger);
            if (tokenId) {
                results.set(key, tokenId);
            }
        });
        await Promise.all(promises);
    }

    return results;
}
