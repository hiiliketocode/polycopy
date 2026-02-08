'use client'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Info, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useEffect, useState, useMemo, ReactElement } from 'react'

interface PredictionStatsProps {
  walletAddress: string
  conditionId: string
  price: number
  size: number
  marketTitle?: string
  marketCategory?: string
  marketTags?: string[] | null
  marketSubtype?: string // niche (market_subtype from DB) - use immediately if provided
  betStructure?: string // bet_structure from DB - use immediately if provided
  isAdmin?: boolean
  // Fire badge props - shown as icons next to values
  fireReasons?: string[]
  fireWinRate?: number | null
  fireRoi?: number | null
  fireConviction?: number | null
}

interface StatsData {
  // Trade type stats (this trade type) - for selected time period
  profile_L_win_rate?: number
  profile_L_avg_pnl_per_trade_usd?: number
  profile_L_roi_pct?: number
  profile_current_win_streak?: number
  profile_L_count?: number  // Count for selected time period
  global_trade_count?: number  // Count for selected time period
  
  // Lifetime counts (for "All: X" display, always shows lifetime)
  lifetime_profile_count?: number
  lifetime_global_trade_count?: number
  
  // All trades stats
  global_L_win_rate?: number
  global_L_avg_pnl_per_trade_usd?: number
  global_L_roi_pct?: number
  global_current_win_streak?: number
  
  // Trade classification
  trade_profile?: string | null
  data_source?: string
  
  // (Conviction removed from display; kept for possible future use)
  current_market_exposure?: number
  current_trade_size?: number
  global_L_avg_pos_size_usd?: number
  global_L_avg_trade_size_usd?: number
  profile_L_avg_trade_size_usd?: number
}

type TimePeriod = '7d' | '30d' | 'all'

export function PredictionStats({ 
  walletAddress, 
  conditionId, 
  price, 
  size,
  marketTitle = '',
  marketCategory,
  marketTags,
  marketSubtype: propMarketSubtype, // niche from feed (already classified)
  betStructure: propBetStructure, // bet_structure from feed (already classified)
  isAdmin = false,
  fireReasons,
  fireWinRate,
  fireRoi,
  fireConviction,
}: PredictionStatsProps) {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resolvedNiche, setResolvedNiche] = useState<string | null>(null)
  const [resolvedBetStructure, setResolvedBetStructure] = useState<string>('STANDARD')
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('30d')
  
  // Store raw API response so we can re-render with different time periods without refetching
  const [rawGlobalStats, setRawGlobalStats] = useState<any>(null)
  const [rawProfileStats, setRawProfileStats] = useState<any[]>([])

  // Helper: fetch with timeout to avoid hanging UI on slow endpoints
  const fetchWithTimeout = async (url: string, opts: RequestInit = {}, timeoutMs = 15000) => {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...opts, signal: controller.signal })
      return res
    } catch (err: any) {
      // Swallow aborts; surface other errors
      if (err?.name === 'AbortError') {
        console.warn('[PredictionStats] fetchWithTimeout aborted', { url, timeoutMs })
        return null
      }
      throw err
    } finally {
      clearTimeout(id)
    }
  }

  const normalizeKey = (value: string | null | undefined) => {
    return (value || '')
      .toString()
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_')
      .replace(/__+/g, '_')
  }

  // Selection vs. display thresholds:
  // - selection: use any available profile row (>=1 trade) so we surface data instead of falling back
  // - display badge: still flag low sample when <5 trades
  const MIN_TRADES_SELECTION = 1
  const LOW_SAMPLE_THRESHOLD = 5

  // Helper to get the appropriate field based on time period
  const getTimePeriodPrefix = (period: TimePeriod): string => {
    switch (period) {
      case '7d': return 'd7'
      case '30d': return 'd30'
      case 'all': return 'l'
    }
  }

  // Helper: pick the first finite number in a list (case-insensitive fields supported upstream)
  const pickNumber = (...values: Array<number | string | null | undefined>) => {
    for (const v of values) {
      const n = typeof v === 'string' ? Number(v) : v
      if (n !== null && n !== undefined && Number.isFinite(n)) return n as number
    }
    return null
  }

  const normalizeBracket = (value: string | null | undefined) => {
    const k = normalizeKey(value)
    if (['FAVORITE', 'FAV', 'FAVORITE_TEAM'].includes(k)) return 'HIGH'
    if (['UNDERDOG', 'DOG'].includes(k)) return 'LOW'
    if (['EVEN_MONEY', 'EVEN', 'EVENMONEY'].includes(k)) return 'MID'
    return k
  }

  // Determine price bracket (entry price → underdog / even / favorite)
  const priceBracket = useMemo(() => {
    if (price < 0.4) return 'UNDERDOG'
    if (price > 0.6) return 'FAVORITE'
    return 'EVEN'
  }, [price])

  // Determine bet structure from title
  // NOTE: Must match profile_stats structures: YES_NO, STANDARD, OVER_UNDER, SPREAD
  const betStructure = useMemo(() => {
    const titleLower = (marketTitle || '').toLowerCase()
    if (titleLower.includes('over') || titleLower.includes('under') || titleLower.includes('o/u')) return 'OVER_UNDER'
    if (titleLower.includes('spread') || titleLower.includes('handicap')) return 'SPREAD'
    // "Will X happen?" questions are YES/NO bets
    if (titleLower.includes('will') || titleLower.includes('winner')) return 'YES_NO'
    return 'STANDARD'
  }, [marketTitle])

    // Determine niche from semantic_mapping only (no fallbacks)
  const niche = useMemo(() => {
    // Semantic mapping handled in effect; return null to signal lookup when tags exist
    if (marketTags && marketTags.length > 0) return null
    // No fallback - rely entirely on semantic_mapping via useEffect
    return null
  }, [marketTags])

  // Track previous wallet/conditionId to detect if only timePeriod changed
  const [lastFetchKey, setLastFetchKey] = useState<string>('')
  
  useEffect(() => {
    if (!walletAddress || !conditionId) return

    const currentFetchKey = `${walletAddress}-${conditionId}`
    const onlyTimePeriodChanged = lastFetchKey === currentFetchKey && rawGlobalStats !== null

    const fetchStats = async () => {
      // Don't show loading spinner if we're just reprocessing existing data for a new time period
      if (!onlyTimePeriodChanged) {
        setLoading(true)
      }
      setError(null)

      console.log('[PredictionStats] fetchStats called', {
        conditionId: conditionId.substring(0, 20) + '...',
        propMarketSubtype,
        propBetStructure,
        hasMarketTags: !!marketTags,
        marketTagsLength: Array.isArray(marketTags) ? marketTags.length : 0,
        timePeriod,
        onlyTimePeriodChanged,
        timestamp: new Date().toISOString(),
      })

      try {
        const wallet = walletAddress.toLowerCase()
        const tradeTotal = price * size

        // Fetch market data from database to get classification
        // PRIORITY: Use props if provided (already classified by feed)
        let finalNiche = propMarketSubtype ? propMarketSubtype.toUpperCase() : (niche || null)
        let finalBetStructure = propBetStructure ? propBetStructure.toUpperCase() : betStructure
        
        console.log('[PredictionStats] Classification resolved', {
          finalNiche,
          finalBetStructure,
          fromProps: !!(propMarketSubtype && propBetStructure),
        })
        
        // If props are provided, we already have classification - skip DB query and semantic_mapping
        const hasClassificationFromProps = !!(propMarketSubtype && propBetStructure)
        
        // Market data (tags, market_subtype, bet_structure) is batch-fetched in feed page
        // But tags might still be missing if market doesn't exist in DB yet
        // So we'll try props first, then fallback to DB query, then use title
        
        // Helper function to normalize tags from various sources
        const normalizeTags = (source: any): string[] => {
          if (!source) return [];
          
          // Handle arrays
          if (Array.isArray(source)) {
            return source
              .map((t: any) => {
                if (typeof t === 'object' && t !== null) {
                  return t.name || t.tag || t.value || String(t);
                }
                return String(t);
              })
              .map((t: string) => t.trim().toLowerCase())
              .filter((t: string) => t.length > 0 && t !== 'null' && t !== 'undefined');
          }
          
          // Handle strings (could be JSON)
          if (typeof source === 'string' && source.trim()) {
            try {
              const parsed = JSON.parse(source);
              return normalizeTags(parsed);
            } catch {
              const trimmed = source.trim().toLowerCase();
              return trimmed.length > 0 ? [trimmed] : [];
            }
          }
          
          // Handle objects
          if (typeof source === 'object' && source !== null) {
            if (source.tags && Array.isArray(source.tags)) {
              return normalizeTags(source.tags);
            }
            if (source.data && Array.isArray(source.data)) {
              return normalizeTags(source.data);
            }
          }
          
          return [];
        };
        
        // Collect tags: Priority 1 = props, Priority 2 = DB query, Priority 3 = title extraction
        let tagsToUse: string[] = [];
        
        // Priority 1: Use tags from props (batch-fetched by feed)
        if (marketTags) {
          tagsToUse = normalizeTags(marketTags);
        }
        
        // Priority 2: If no tags from props AND no classification from props, fetch from DB
        let dbMarketData: any = null;
        if (tagsToUse.length === 0 && conditionId && !hasClassificationFromProps) {
          try {
            const { data: dbMarket, error: dbError } = await supabase
              .from('markets')
              .select('tags, raw_dome, market_subtype, bet_structure')
              .eq('condition_id', conditionId)
              .maybeSingle();
            
            dbMarketData = dbMarket; // Store for later use
            
            if (!dbError && dbMarket) {
              // PRIORITY: Use market_subtype from DB if available (already classified)
              if (dbMarket.market_subtype && !finalNiche) {
                finalNiche = (dbMarket.market_subtype || '').trim().toUpperCase() || null;
              }
              
              // Try tags column first
              if (dbMarket.tags) {
                tagsToUse = normalizeTags(dbMarket.tags);
              }
              
              // Fallback to raw_dome if tags missing
              if (tagsToUse.length === 0 && dbMarket.raw_dome) {
                try {
                  const rawDome = typeof dbMarket.raw_dome === 'string' 
                    ? JSON.parse(dbMarket.raw_dome) 
                    : dbMarket.raw_dome;
                  if (rawDome?.tags) {
                    tagsToUse = normalizeTags(rawDome.tags);
                  }
                } catch {
                  // Ignore parse errors
                }
              }
              
              // If still no tags, market needs to be ensured - trigger ensure API
              if (tagsToUse.length === 0 && conditionId && conditionId.startsWith('0x')) {
                console.warn(`[PredictionStats] Market ${conditionId} exists but has no tags - triggering ensure`);
                // Trigger ensure in background (don't await)
                fetch(`/api/markets/ensure?conditionId=${encodeURIComponent(conditionId)}`, { cache: 'no-store' })
                  .catch((err) => console.warn(`[PredictionStats] Failed to ensure market:`, err));
              }
            } else if (!dbMarket && conditionId && conditionId.startsWith('0x')) {
              // Market doesn't exist - trigger ensure
              console.warn(`[PredictionStats] Market ${conditionId} not in DB - triggering ensure`);
              fetch(`/api/markets/ensure?conditionId=${encodeURIComponent(conditionId)}`, { cache: 'no-store' })
                .catch((err) => console.warn(`[PredictionStats] Failed to ensure market:`, err));
            }
          } catch (err) {
            console.warn('[PredictionStats] Error fetching tags from DB:', err);
          }
        }
        
        // De-dupe tags
        tagsToUse = Array.from(new Set(tagsToUse));
        
        // Log summary only if no tags found (for debugging)
        if (tagsToUse.length === 0 && process.env.NODE_ENV === 'development') {
          console.warn('[PredictionStats] No tags collected:', {
            conditionId,
            hasPropsTags: !!marketTags,
            marketTitle: marketTitle?.substring(0, 50),
          });
        }

        // Semantic mapping lookup (primary niche resolver)
        // SKIP if we already have classification from props
        if (tagsToUse.length > 0 && !hasClassificationFromProps) {
          try {
            // Try case-sensitive match first (tags are already normalized to lowercase)
            let { data: mappings, error: mappingError } = await supabase
              .from('semantic_mapping')
              .select('clean_niche, type, specificity_score, original_tag')
              .in('original_tag', tagsToUse)

            // If no matches, try case-insensitive for each tag (collect ALL matches)
            if ((!mappings || mappings.length === 0) && tagsToUse.length > 0) {
              // Query all tags in parallel and collect ALL results
              const ciQueries = tagsToUse.map(tag => 
                supabase
                  .from('semantic_mapping')
                  .select('clean_niche, type, specificity_score, original_tag')
                  .ilike('original_tag', tag)
              )
              const ciResults = await Promise.all(ciQueries)
              
              // Collect all matches from all queries
              const allCiMappings: any[] = [];
              for (const result of ciResults) {
                if (!result.error && result.data && result.data.length > 0) {
                  allCiMappings.push(...result.data);
                }
              }
              
              if (allCiMappings.length > 0) {
                mappings = allCiMappings;
              }
            }

            if (mappingError) {
              console.warn('[PredictionStats] Error querying semantic_mapping:', mappingError)
            }

            if (mappings && mappings.length > 0) {
              // Sort by specificity_score (lower is more specific)
              mappings.sort((a: any, b: any) => (a.specificity_score || 99) - (b.specificity_score || 99))
              finalNiche = (mappings[0].clean_niche || '').toUpperCase() || null
            }
          } catch (err) {
            // Silent fail - continue without niche
            if (process.env.NODE_ENV === 'development') {
              console.warn('[PredictionStats] Error during semantic mapping lookup:', err);
            }
          }
        }
        
        console.log('[PredictionStats] Final classification before fallback:', {
          finalNiche,
          finalBetStructure,
          priceBracket,
        })
        
        // Fallback: Use market_subtype from DB if semantic mapping failed (already fetched above)
        // SKIP if we already have classification from props
        if (!finalNiche && !hasClassificationFromProps && dbMarketData?.market_subtype) {
          finalNiche = (dbMarketData.market_subtype || '').trim().toUpperCase() || null;
        }
        
        // Last resort: Query DB again if we don't have dbMarketData and no props (shouldn't happen, but safety check)
        if (!finalNiche && !hasClassificationFromProps && conditionId && !dbMarketData) {
          try {
            const { data: dbMarket } = await supabase
              .from('markets')
              .select('market_subtype')
              .eq('condition_id', conditionId)
              .maybeSingle();
            
            if (dbMarket?.market_subtype) {
              finalNiche = (dbMarket.market_subtype || '').trim().toUpperCase() || null;
            }
          } catch (err) {
            // Non-fatal - continue without niche
          }
        }
        if (!finalBetStructure) {
          console.warn('[PredictionStats] No bet structure found, defaulting to STANDARD')
          finalBetStructure = 'STANDARD'
        }
        
        console.log('[PredictionStats] Final classification:', {
          finalNiche,
          finalBetStructure,
          priceBracket,
        })

        // Fetch stats via API route (uses service role key, bypasses RLS)
        // Skip fetch if we're just changing time period and have cached data
        let globalStats: any = null
        let profileStats: any[] = []
        
        if (onlyTimePeriodChanged && rawGlobalStats !== null) {
          console.log('[PredictionStats] Using cached raw stats for time period change')
          globalStats = rawGlobalStats
          profileStats = rawProfileStats
        } else {
          try {
            console.log('[PredictionStats] Fetching trader stats for wallet:', wallet)
            const response = await fetch(`/api/trader/stats?wallet=${encodeURIComponent(wallet)}`)
            
            if (!response.ok) {
              const errorText = await response.text()
              console.error('[PredictionStats] ❌ API route error:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText,
              })
              throw new Error(`Stats API failed: ${response.status} ${response.statusText}`)
            }
            
            const data = await response.json()
            globalStats = data.global || null
            profileStats = data.profiles || []
            
            // Update the fetch key after successful fetch
            setLastFetchKey(currentFetchKey)
            
            console.log('[PredictionStats] Stats API response:', {
              wallet: wallet,
              hasGlobalStats: !!globalStats,
              globalStatsKeys: globalStats ? Object.keys(globalStats) : [],
              profileStatsCount: profileStats.length,
              globalStatsSample: globalStats ? {
                l_win_rate: globalStats.l_win_rate,
                d30_win_rate: globalStats.d30_win_rate,
                d7_win_rate: globalStats.d7_win_rate,
                l_count: globalStats.l_count,
                d30_count: globalStats.d30_count,
                d7_count: globalStats.d7_count,
              } : null,
            })
          } catch (statsErr: any) {
            console.error('[PredictionStats] ❌ Stats fetch failed', statsErr)
            setError('Trader insights unavailable')
            // Don't set empty stats - let component show error state
            setStats(null)
            setLoading(false)
            return
          }
        }

        // Store raw stats for time period switching
        setRawGlobalStats(globalStats)
        setRawProfileStats(profileStats)
        
        // Normalize global stats - sync script writes lowercase fields from BigQuery
        console.log('[PredictionStats] Available globalStats fields:', globalStats ? Object.keys(globalStats) : 'null')
        console.log('[PredictionStats] Raw globalStats values:', globalStats)
        
        // Helper to pick stats based on time period
        // Priority: selected period → fallback to lifetime
        const prefix = getTimePeriodPrefix(timePeriod)
        const lifetimePrefix = 'l'
        
        const globalWinRate = pickNumber(
          globalStats?.[`${prefix}_win_rate`], globalStats?.[`${prefix.toUpperCase()}_win_rate`],
          globalStats?.[`${lifetimePrefix}_win_rate`], globalStats?.[`${lifetimePrefix.toUpperCase()}_win_rate`],
          globalStats?.global_win_rate,
        )

        const globalRoiPct = pickNumber(
          globalStats?.[`${prefix}_total_roi_pct`], globalStats?.[`${prefix.toUpperCase()}_total_roi_pct`],
          globalStats?.[`${lifetimePrefix}_total_roi_pct`], globalStats?.[`${lifetimePrefix.toUpperCase()}_total_roi_pct`],
          globalStats?.global_roi_pct,
        )

        const globalAvgPnlUsd = pickNumber(
          globalStats?.[`${prefix}_avg_pnl_trade_usd`], globalStats?.[`${prefix.toUpperCase()}_avg_pnl_trade_usd`],
          globalStats?.[`${lifetimePrefix}_avg_pnl_trade_usd`], globalStats?.[`${lifetimePrefix.toUpperCase()}_avg_pnl_trade_usd`],
        )

        const globalAvgTradeSizeUsd = pickNumber(
          globalStats?.[`${prefix}_avg_trade_size_usd`], globalStats?.[`${prefix.toUpperCase()}_avg_trade_size_usd`],
          globalStats?.[`${lifetimePrefix}_avg_trade_size_usd`], globalStats?.[`${lifetimePrefix.toUpperCase()}_avg_trade_size_usd`],
          globalStats?.avg_bet_size_usdc,
        )

        // FIX: Always use the selected period's count, NOT lifetime fallback
        // This prevents the 7D > 30D display bug where 7D falls back to lifetime
        const globalTradeCount = pickNumber(
          globalStats?.[`${prefix}_count`], globalStats?.[`${prefix.toUpperCase()}_count`]
        ) ?? 0  // Default to 0 if selected period has no data, don't fallback to lifetime
        
        // Keep lifetime count separately for "All: X" display
        const lifetimeGlobalTradeCount = pickNumber(
          globalStats?.[`${lifetimePrefix}_count`], globalStats?.[`${lifetimePrefix.toUpperCase()}_count`],
          globalStats?.total_lifetime_trades,
        ) ?? 0

        // Position size - sync script writes l_avg_pos_size_usd
        const globalAvgPosSizeUsd = pickNumber(
          globalStats?.l_avg_pos_size_usd, globalStats?.L_avg_pos_size_usd, // From sync script
        ) ?? globalAvgTradeSizeUsd ?? null
        
        console.log('[PredictionStats] Extracted global stats for period:', timePeriod, {
          globalWinRate,
          globalRoiPct,
          globalAvgPnlUsd,
          globalAvgTradeSizeUsd,
          globalTradeCount,
          globalAvgPosSizeUsd,
          found_d7_win_rate: globalStats?.d7_win_rate,
          found_d30_win_rate: globalStats?.d30_win_rate,
          found_l_win_rate: globalStats?.l_win_rate,
        })

        // NOTE: Previously we capped averages at 5x current trade size to prevent "artificially low"
        // conviction scores. This was WRONG - it destroyed data integrity by:
        // 1. Making conviction inconsistent with avg_pnl and ROI calculations
        // 2. Hiding the true conviction ratio (which IS meaningful when low)
        // 
        // If a whale's avg trade is $4,000 and they make a $148 bet, conviction IS 0.04x and
        // that's valuable info - it means they're not very committed to this specific trade.
        // 
        // The fix for displaying very low values is in formatMultiplier() showing "<0.01x" etc.,
        // NOT by falsifying the underlying math.

        console.log('[PredictionStats] Average size calculation:', {
          tradeTotal,
          globalAvgTradeSizeUsd,
          globalAvgPosSizeUsd,
        })

        // Waterfall logic: find best matching profile
        const finalNicheKey = normalizeKey(finalNiche)
        const finalBetStructureKey = normalizeKey(finalBetStructure)
        const priceBracketKey = normalizeKey(priceBracket)
        const normalizeProfile = (p: any) => {
          const nicheVal = normalizeKey(p.final_niche)
          const structureVal = normalizeKey(p.bet_structure || p.structure)
          const bracketVal = normalizeBracket(p.price_bracket || p.bracket)

          // Get counts for each period
          const d7Count = pickNumber(p.d7_count, p.D7_count)
          const d30Count = pickNumber(p.d30_count, p.D30_count)
          const lCount = pickNumber(p.trade_count, p.l_count, p.L_count)
          
          // Get resolved counts (for proper ROI calculation)
          const d7ResolvedCount = pickNumber(p.d7_resolved_count, p.D7_resolved_count)
          const d30ResolvedCount = pickNumber(p.d30_resolved_count, p.D30_resolved_count)
          const lResolvedCount = pickNumber(p.l_resolved_count, p.L_resolved_count)
          
          // Determine which period to use based on selected time period
          // FIX: Trade count should ALWAYS match the selected period (no fallback!)
          // Stats can fallback to lifetime, but counts should not - this prevents 7D > 30D bugs
          let usePrefix: string
          let tradeCount: number
          let resolvedCount: number
          let windowLabel: string
          let hasDataForPeriod: boolean
          
          if (timePeriod === '7d') {
            usePrefix = 'd7'
            tradeCount = d7Count ?? 0  // Always use d7 count, even if 0
            resolvedCount = d7ResolvedCount ?? 0
            windowLabel = '7d'
            hasDataForPeriod = d7Count !== null && d7Count !== undefined && d7Count >= MIN_TRADES_SELECTION
          } else if (timePeriod === '30d') {
            usePrefix = 'd30'
            tradeCount = d30Count ?? 0  // Always use d30 count, even if 0
            resolvedCount = d30ResolvedCount ?? 0
            windowLabel = '30d'
            hasDataForPeriod = d30Count !== null && d30Count !== undefined && d30Count >= MIN_TRADES_SELECTION
          } else {
            // 'all' = lifetime
            usePrefix = 'l'
            tradeCount = lCount ?? 0
            resolvedCount = lResolvedCount ?? 0
            windowLabel = 'lifetime'
            hasDataForPeriod = lCount !== null && lCount !== undefined && lCount >= MIN_TRADES_SELECTION
          }

          // FIX: Get ALL stats from the SAME time period (no mixing!)
          // Only fall back to lifetime if the selected period doesn't exist AT ALL
          const winRate = pickNumber(
            p[`${usePrefix}_win_rate`], p[`${usePrefix.toUpperCase()}_win_rate`]
          ) ?? pickNumber(p.l_win_rate, p.L_win_rate, p.win_rate)

          const roiPct = pickNumber(
            p[`${usePrefix}_total_roi_pct`], p[`${usePrefix.toUpperCase()}_total_roi_pct`]
          ) ?? pickNumber(p.l_total_roi_pct, p.L_total_roi_pct, p.roi_pct)

          const avgPnlUsd = pickNumber(
            p[`${usePrefix}_avg_pnl_trade_usd`], p[`${usePrefix.toUpperCase()}_avg_pnl_trade_usd`]
          ) ?? pickNumber(p.l_avg_pnl_trade_usd, p.L_avg_pnl_trade_usd, p.avg_pnl_trade_usd)

          const avgTradeSizeUsd = pickNumber(
            p[`${usePrefix}_avg_trade_size_usd`], p[`${usePrefix.toUpperCase()}_avg_trade_size_usd`]
          ) ?? pickNumber(p.l_avg_trade_size_usd, p.L_avg_trade_size_usd)

          // Get total PnL and resolved invested (for proper aggregation)
          const totalPnlUsd = pickNumber(
            p[`${usePrefix}_total_pnl_usd`], p[`${usePrefix.toUpperCase()}_total_pnl_usd`]
          ) ?? pickNumber(p.l_total_pnl_usd, p.L_total_pnl_usd)

          const resolvedInvestedUsd = pickNumber(
            p[`${usePrefix}_resolved_invested_usd`], p[`${usePrefix.toUpperCase()}_resolved_invested_usd`]
          ) ?? pickNumber(p.l_resolved_invested_usd, p.L_resolved_invested_usd)

          return {
            niche: nicheVal,
            structure: structureVal,
            bracket: bracketVal,
            win_rate: winRate ?? 0.5,
            roi_pct: roiPct ?? 0,
            avg_pnl_usd: avgPnlUsd ?? 0,
            avg_trade_size_usd: avgTradeSizeUsd ?? null,
            trade_count: tradeCount,
            resolved_count: resolvedCount,
            // Store totals for proper aggregation (if available from updated BigQuery tables)
            total_pnl_usd: totalPnlUsd ?? null,
            resolved_invested_usd: resolvedInvestedUsd ?? null,
            window: windowLabel,
            has_data_for_period: hasDataForPeriod,  // Track if this period actually has sufficient data
          }
        }

        const normalizedProfiles = (profileStats || []).map(normalizeProfile)

        let profileResult: any = null
        let dataSource = 'Global Fallback'
        let tradeProfile = `${finalNicheKey}_${finalBetStructureKey}_${priceBracketKey}`

        if (normalizedProfiles.length > 0) {
          const level1 = normalizedProfiles.find((p: any) =>
            p.niche === finalNicheKey &&
            p.structure === finalBetStructureKey &&
            p.bracket === priceBracketKey
          )

          const assignIfValid = (candidate: any, label: string, profileLabel: string) => {
            if (candidate && candidate.trade_count >= MIN_TRADES_SELECTION) {
              profileResult = candidate
              dataSource = `${label}${candidate.window === '30d' ? ' (30d)' : ''}`
              tradeProfile = profileLabel
              return true
            }
            return false
          }

          // Helper to aggregate multiple profiles correctly
          // FIX: Use total_pnl for BOTH avg_pnl and ROI to ensure sign consistency
          const aggregateProfiles = (profiles: any[]) => {
            const agg = profiles.reduce((acc: any, p: any) => {
              acc.trade_count += p.trade_count
              // Only count resolved trades that actually have resolved_count > 0
              const resolvedCount = p.resolved_count ?? 0
              acc.resolved_count += resolvedCount
              acc.win_weighted += p.win_rate * p.trade_count
              // FIX: Weight pnl by resolved_count only (not trade_count fallback)
              // This ensures profiles with no resolved trades don't affect the average
              if (resolvedCount > 0) {
                acc.pnl_weighted += p.avg_pnl_usd * resolvedCount
              }
              acc.trade_size_weighted += (p.avg_trade_size_usd ?? 0) * p.trade_count
              acc.window30d = acc.window30d || p.window === '30d'
              
              // Sum totals if available (from updated BigQuery tables)
              if (p.total_pnl_usd !== null && p.total_pnl_usd !== undefined) {
                acc.total_pnl_usd += p.total_pnl_usd
                acc.has_totals = true
              }
              if (p.resolved_invested_usd !== null && p.resolved_invested_usd !== undefined) {
                acc.resolved_invested_usd += p.resolved_invested_usd
                acc.has_totals = true
              }
              return acc
            }, { 
              trade_count: 0, 
              resolved_count: 0,
              win_weighted: 0, 
              pnl_weighted: 0, 
              trade_size_weighted: 0, 
              total_pnl_usd: 0,
              resolved_invested_usd: 0,
              has_totals: false,
              window30d: false 
            })

            // Calculate both metrics using total_pnl to ensure sign consistency
            // Note: ROI is stored as DECIMAL (0.15 = 15%), frontend multiplies by 100 for display
            let roiPct: number
            let avgPnlUsd: number
            
            if (agg.has_totals && agg.resolved_invested_usd > 0) {
              // BEST: Use total_pnl directly for both metrics (guaranteed consistent signs)
              roiPct = agg.total_pnl_usd / agg.resolved_invested_usd
              // avg_pnl = total_pnl / resolved_count (same numerator as ROI = same sign)
              avgPnlUsd = agg.resolved_count > 0 ? agg.total_pnl_usd / agg.resolved_count : 0
            } else if (agg.resolved_count > 0) {
              // FALLBACK: Use weighted average, but divide by resolved_count (not trade_count!)
              avgPnlUsd = agg.pnl_weighted / agg.resolved_count
              // Estimate ROI from avg_pnl / avg_trade_size
              const avgTradeSize = agg.trade_count > 0 && agg.trade_size_weighted > 0 
                ? agg.trade_size_weighted / agg.trade_count 
                : null
              roiPct = avgTradeSize && avgTradeSize > 0 ? avgPnlUsd / avgTradeSize : 0
            } else {
              // No resolved trades - return zeros
              avgPnlUsd = 0
              roiPct = 0
            }

            return {
              trade_count: agg.trade_count,
              resolved_count: agg.resolved_count,
              win_rate: agg.trade_count > 0 ? agg.win_weighted / agg.trade_count : 0.5,
              roi_pct: roiPct,
              avg_pnl_usd: avgPnlUsd,
              avg_trade_size_usd: agg.trade_count > 0 && agg.trade_size_weighted > 0 
                ? agg.trade_size_weighted / agg.trade_count 
                : null,
              window: agg.window30d ? '30d' : 'lifetime',
            }
          }

          if (!assignIfValid(level1, 'Specific Profile', `${finalNicheKey}_${finalBetStructureKey}_${priceBracketKey}`)) {
            const level2Matches = normalizedProfiles.filter((p: any) =>
              p.niche === finalNicheKey && p.structure === finalBetStructureKey
            )
            if (level2Matches.length > 0) {
              const aggregated = aggregateProfiles(level2Matches)
              if (assignIfValid(aggregated, 'Structure-Specific', `${finalNicheKey}_${finalBetStructureKey}`)) {
                // assigned
              }
            }

            if (!profileResult) {
              const level3Matches = normalizedProfiles.filter((p: any) => p.niche === finalNicheKey)
              if (level3Matches.length > 0) {
                const aggregated = aggregateProfiles(level3Matches)
                assignIfValid(aggregated, 'Niche-Specific', finalNicheKey)
              }
            }
          }
        }

        // Use profile stats if found, otherwise use global stats (with defaults)
        // Always provide defaults so we always have data to show
        const profileWinRate = profileResult?.win_rate ?? globalWinRate
        const profileRoiPct = profileResult?.roi_pct ?? globalRoiPct
        const profileAvgPnlUsd = profileResult?.avg_pnl_usd ?? globalAvgPnlUsd // Use global if profile missing
        const profileCount = profileResult?.trade_count ?? globalTradeCount
        // Use profile-specific average trade size when available, fallback to global
        const profileAvgTradeSizeUsd = profileResult?.avg_trade_size_usd ?? null
        const avgBetSize = profileAvgTradeSizeUsd ?? globalAvgPosSizeUsd ?? globalAvgTradeSizeUsd ?? tradeTotal

        console.log('[PredictionStats] Data fetched:', {
          wallet,
          finalNiche,
          finalBetStructure,
          priceBracket,
          globalStats: { exists: !!globalStats, win_rate: globalWinRate, roi_pct: globalRoiPct, total_trades: globalTradeCount, avg_bet_size: avgBetSize },
          profileResult: {
            exists: !!profileResult,
            win_rate: profileResult?.win_rate,
            roi_pct: profileResult?.roi_pct,
            trade_count: profileResult?.trade_count,
          },
          profileStatsCount: normalizedProfiles.length || 0,
          dataSource,
          tradeProfile,
        })

        // Calculate avg PnL per trade
        // FIX: Use direct value if available (even if 0), only fallback if truly missing
        // This ensures avg_pnl and roi_pct stay consistent since both derive from total_pnl
        const profileAvgPnl = profileAvgPnlUsd !== null && profileAvgPnlUsd !== undefined
          ? profileAvgPnlUsd
          : (avgBetSize !== null && avgBetSize !== undefined && avgBetSize > 0 && profileRoiPct !== null && profileRoiPct !== undefined
            ? avgBetSize * profileRoiPct
            : null)
        const globalAvgPnl = globalAvgPnlUsd !== null && globalAvgPnlUsd !== undefined
          ? globalAvgPnlUsd
          : (globalAvgTradeSizeUsd !== null && globalAvgTradeSizeUsd !== undefined && globalAvgTradeSizeUsd > 0 && globalRoiPct !== null && globalRoiPct !== undefined
            ? globalAvgTradeSizeUsd * globalRoiPct
            : null)

        // Calculate current exposure (sum of all positions in this market)
        // For now, use current trade size as exposure
        const currentExposure = tradeTotal

        // Calculate lifetime profile count from raw profile stats
        const lifetimeProfileCount = normalizedProfiles.length > 0
          ? normalizedProfiles
              .filter((p: any) => p.niche === finalNicheKey)
              .reduce((sum: number, p: any) => {
                // Get lifetime count from raw profile data
                const rawProfile = (profileStats || []).find((raw: any) => 
                  normalizeKey(raw.final_niche) === p.niche &&
                  normalizeKey(raw.bet_structure || raw.structure) === p.structure &&
                  normalizeBracket(raw.price_bracket || raw.bracket) === p.bracket
                )
                const lCount = pickNumber(rawProfile?.l_count, rawProfile?.L_count, rawProfile?.trade_count)
                return sum + (lCount ?? 0)
              }, 0)
          : 0

        const statsData: StatsData = {
          profile_L_win_rate: profileWinRate !== null ? profileWinRate : undefined,
          global_L_win_rate: globalWinRate !== null ? globalWinRate : undefined,
          profile_L_avg_pnl_per_trade_usd: profileAvgPnl !== null ? profileAvgPnl : undefined,
          global_L_avg_pnl_per_trade_usd: globalAvgPnl !== null ? globalAvgPnl : undefined,
          // ROI values in DB are stored as decimals (e.g., 0.03 = 3%), keep as-is
          profile_L_roi_pct: profileRoiPct !== null ? profileRoiPct : undefined,
          global_L_roi_pct: globalRoiPct !== null ? globalRoiPct : undefined,
          profile_current_win_streak: 0, // Would need to query recent trades
          global_current_win_streak: 0,
          profile_L_count: profileCount ?? 0,  // Selected time period count
          global_trade_count: globalTradeCount ?? 0,  // Selected time period count
          // Lifetime counts for "All: X" display
          lifetime_profile_count: lifetimeProfileCount,
          lifetime_global_trade_count: lifetimeGlobalTradeCount,
          trade_profile: tradeProfile,
          data_source: dataSource,
          current_market_exposure: currentExposure,
          current_trade_size: tradeTotal,
          global_L_avg_pos_size_usd: globalAvgPosSizeUsd !== null ? globalAvgPosSizeUsd : undefined,
          global_L_avg_trade_size_usd: globalAvgTradeSizeUsd !== null ? globalAvgTradeSizeUsd : undefined,
          profile_L_avg_trade_size_usd: profileAvgTradeSizeUsd !== null ? profileAvgTradeSizeUsd : undefined,
        }

        console.log('[PredictionStats] Setting stats:', {
          profile_L_win_rate: statsData.profile_L_win_rate,
          global_L_win_rate: statsData.global_L_win_rate,
          profile_L_count: statsData.profile_L_count,
          profile_L_avg_pnl_per_trade_usd: statsData.profile_L_avg_pnl_per_trade_usd,
          global_L_avg_pnl_per_trade_usd: statsData.global_L_avg_pnl_per_trade_usd,
          profile_L_roi_pct: statsData.profile_L_roi_pct,
          global_L_roi_pct: statsData.global_L_roi_pct,
          // Conviction calculation inputs
          current_market_exposure: statsData.current_market_exposure,
          current_trade_size: statsData.current_trade_size,
          global_L_avg_pos_size_usd: statsData.global_L_avg_pos_size_usd,
          global_L_avg_trade_size_usd: statsData.global_L_avg_trade_size_usd,
          // Raw values from globalStats
          raw_avg_bet_size_usdc: globalStats?.avg_bet_size_usdc,
          raw_l_avg_pos_size_usd: globalStats?.l_avg_pos_size_usd,
          raw_l_avg_trade_size_usd: globalStats?.l_avg_trade_size_usd,
          raw_d30_avg_trade_size_usd: globalStats?.d30_avg_trade_size_usd,
        })

        console.log('[PredictionStats] ✅ About to setStats with data:', {
          hasProfileWinRate: statsData.profile_L_win_rate !== undefined,
          hasGlobalWinRate: statsData.global_L_win_rate !== undefined,
          hasProfileCount: (statsData.profile_L_count ?? 0) > 0,
          hasGlobalCount: (statsData.global_trade_count ?? 0) > 0,
          profileWinRate: statsData.profile_L_win_rate,
          globalWinRate: statsData.global_L_win_rate,
          profileCount: statsData.profile_L_count,
          globalCount: statsData.global_trade_count,
        })
        
        setStats(statsData)
        setResolvedNiche(finalNiche)
        setResolvedBetStructure(finalBetStructure)
        
        console.log('[PredictionStats] ✅ Stats set, setting loading to false')
      } catch (err: any) {
        console.error('[PredictionStats] ❌ Error:', err)
        console.error('[PredictionStats] Error stack:', err?.stack)
        setError(err?.message || 'Failed to load stats')
        // Even on error, set default stats so UI doesn't break
        setStats({
          profile_L_win_rate: undefined,
          global_L_win_rate: undefined,
          profile_L_avg_pnl_per_trade_usd: undefined,
          global_L_avg_pnl_per_trade_usd: undefined,
          profile_L_roi_pct: undefined,
          global_L_roi_pct: undefined,
          profile_current_win_streak: 0,
          global_current_win_streak: 0,
          profile_L_count: 0,
          global_trade_count: 0,
          trade_profile: `${(resolvedNiche || niche || 'OTHER')}_${resolvedBetStructure || betStructure}_${priceBracket}`,
          data_source: 'Error - No Data',
          current_market_exposure: price * size,
          current_trade_size: price * size,
          // Don't set averages to current trade size - that would make conviction always 1.0x
          // Leave as undefined so conviction shows N/A
          global_L_avg_pos_size_usd: undefined,
          global_L_avg_trade_size_usd: undefined,
        } as StatsData)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [walletAddress, conditionId, price, size, priceBracket, marketTags, marketTitle, marketCategory, isAdmin, propMarketSubtype, propBetStructure, timePeriod])

  // Only show N/A if stats is null or if we truly have no data
  // Since we always set trade_profile and use defaults, we should always have data
  const hasInsufficientData =
    !stats ||
    ((stats.profile_L_count ?? 0) === 0 && (stats.global_trade_count ?? 0) === 0)
  // Low sample size only applies to profile-specific data, not global fallback
  const hasLowSampleSize = stats && 
    stats.data_source !== 'Global Fallback' &&
    (stats.profile_L_count ?? 0) > 0 && 
    (stats.profile_L_count ?? 0) < LOW_SAMPLE_THRESHOLD

  // Format helpers - standardized decimal places:
  // - Currency/PnL: 2 decimal places (+$39.29)
  // - ROI/Percentage: 1 decimal place (+15.3%)
  // - Win Rate: 1 decimal place (59.3%)
  // - Multiplier: 2 decimal places (1.25x)
  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A'
    const sign = value >= 0 ? '+' : '-'
    return `${sign}$${Math.abs(value).toFixed(2)}`
  }

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A'
    const sign = value >= 0 ? '+' : '-'
    return `${sign}${Math.abs(value).toFixed(1)}`  // 1 decimal place for ROI
  }

  const formatInteger = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '0'
    return Math.trunc(value).toLocaleString()
  }

  const formatMultiplier = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return 'N/A'
    // Show "<0.01" for very small positive values instead of "0.00"
    if (value > 0 && value < 0.01) return '<0.01'
    return value.toFixed(2)
  }

  const formatTradeType = (profile: string | null | undefined) => {
    if (!profile) return 'N/A'
    return profile.split('_').join(' · ')
  }

  // Extract values with fallbacks
  const tradeTypeWinRate = stats?.profile_L_win_rate ?? null
  const allTradesWinRate = stats?.global_L_win_rate ?? null
  const tradeTypeAvgPnl = stats?.profile_L_avg_pnl_per_trade_usd ?? null
  const allTradesAvgPnl = stats?.global_L_avg_pnl_per_trade_usd ?? null
  const tradeTypeRoiPct = stats?.profile_L_roi_pct ?? null
  const allTradesRoiPct = stats?.global_L_roi_pct ?? null
  const tradeTypeStreak = stats?.profile_current_win_streak ?? 0
  const allTradesStreak = stats?.global_current_win_streak ?? 0
  const profileCount = stats?.profile_L_count ?? 0
  const globalTradeCount = stats?.global_trade_count ?? 0
  // Conviction calculation: current size / historical average
  // Use profile-specific average trade size when available (to match profile-specific PnL/ROI),
  // otherwise fallback to global average position size or trade size
  // If average is missing or zero, conviction can't be calculated
  const profileAvgTradeSize = stats?.profile_L_avg_trade_size_usd ?? null
  const avgSizeForConviction = profileAvgTradeSize ?? stats?.global_L_avg_pos_size_usd ?? stats?.global_L_avg_trade_size_usd ?? null
  
  const positionConviction = stats?.current_market_exposure && avgSizeForConviction && avgSizeForConviction > 0
    ? stats.current_market_exposure / avgSizeForConviction
    : null
  const tradeConviction = stats?.current_trade_size && avgSizeForConviction && avgSizeForConviction > 0
    ? stats.current_trade_size / avgSizeForConviction
    : null

  // Debug logging for conviction calculation
  if (stats) {
    console.log('[PredictionStats] Conviction calculation:', {
      current_market_exposure: stats.current_market_exposure,
      current_trade_size: stats.current_trade_size,
      profile_L_avg_trade_size_usd: stats.profile_L_avg_trade_size_usd,
      global_L_avg_pos_size_usd: stats.global_L_avg_pos_size_usd,
      global_L_avg_trade_size_usd: stats.global_L_avg_trade_size_usd,
      avgSizeForConviction,
      positionConviction,
      tradeConviction,
      usingProfileAvg: profileAvgTradeSize !== null,
      // Check if averages seem too high
      avgTooHigh: avgSizeForConviction && stats.current_market_exposure 
        ? avgSizeForConviction > stats.current_market_exposure * 2 
        : null,
    })
  }
  // Win rate display - 1 decimal place (59.3%)
  const safeWinRateDisplay = (value: number | null | undefined) =>
    value === null || value === undefined ? 'N/A' : `${(value * 100).toFixed(1)}%`

  // Check if a fire reason is present
  const hasFireReason = (reason: string) => fireReasons?.includes(reason) ?? false

  // Fire icon component for inline display
  const FireIcon = ({ reason, value }: { reason: string; value?: string }) => {
    if (!hasFireReason(reason)) return null
    return (
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center text-amber-500 cursor-help ml-1">
            <span className="text-sm">🔥</span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs z-50" side="top" sideOffset={5}>
          <p className="text-xs font-medium">
            {reason === 'win_rate' && `High Win Rate${fireWinRate !== null && fireWinRate !== undefined ? `: ${(fireWinRate * 100).toFixed(0)}%` : ''}`}
            {reason === 'roi' && `High ROI${fireRoi !== null && fireRoi !== undefined ? `: ${(fireRoi * 100).toFixed(0)}%` : ''}`}
            {reason === 'conviction' && `High Conviction${fireConviction !== null && fireConviction !== undefined ? `: ${fireConviction.toFixed(1)}x` : ''}`}
          </p>
        </TooltipContent>
      </Tooltip>
    )
  }

  if (!isAdmin) {
    return null
  }

  if (loading) {
    return (
      <div className="mt-4 mb-4">
        <div className="border border-slate-200 rounded-lg px-4 py-3 bg-slate-50/50">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
            <p className="text-xs text-slate-600 font-medium">Loading insights...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="mt-4 mb-4">
        <div className="border border-red-200 rounded-lg px-4 py-3 bg-red-50/50">
          <p className="text-xs text-red-600 font-medium">{error || 'Failed to load insights'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4 mb-4">
      {/* Header */}
      <div className="mb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 flex-wrap">
            <span>Trader Insights</span>
            <div className="inline-flex flex-wrap gap-1">
              <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[11px] font-medium">
                Niche: {(resolvedNiche || stats.trade_profile?.split('_')?.[0] || 'other')?.toString().toLowerCase() || 'other'}
              </span>
              <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[11px] font-medium">
                Bet: {(resolvedBetStructure || stats.trade_profile?.split('_')?.[1])?.toString().toLowerCase() ?? 'standard'}
              </span>
              <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[11px] font-medium">
                Price: {(priceBracket || stats.trade_profile?.split('_')?.[2])?.toString().toLowerCase() ?? 'even'}
              </span>
            </div>
          </h3>
          
          {/* Time Period Toggle */}
          <div className="inline-flex rounded-md shadow-sm" role="group">
            <button
              type="button"
              onClick={() => setTimePeriod('7d')}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded-l-md border transition-colors",
                timePeriod === '7d'
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              )}
            >
              7D
            </button>
            <button
              type="button"
              onClick={() => setTimePeriod('30d')}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium border-t border-b transition-colors",
                timePeriod === '30d'
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              )}
            >
              30D
            </button>
            <button
              type="button"
              onClick={() => setTimePeriod('all')}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded-r-md border transition-colors",
                timePeriod === 'all'
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              )}
            >
              All
            </button>
          </div>
        </div>
      </div>

      {/* Trader Insight Stats Card */}
      {(() => {
        const showStreakCard = tradeTypeStreak >= 2 || allTradesStreak >= 2
        const cards: ReactElement[] = []

        cards.push(
          <div key="trade-count" className="text-center md:border-l border-slate-200 first:border-l-0">
            <div className="flex items-center justify-center gap-1 mb-1">
              <p className="text-xs text-slate-500 font-medium">Trades</p>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button type="button" className="cursor-help focus:outline-none" aria-label="Trade Count information">
                    <Info className="h-3 w-3 text-slate-400 hover:text-slate-600 transition-colors" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs z-50" side="top" sideOffset={5}>
                  <p className="text-xs">
                    Number of trades for this trade type vs. all trades.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-sm md:text-base font-semibold text-slate-900 mb-0.5 tabular-nums">
              {formatInteger(profileCount)}
            </p>
            <p className="text-[10px] text-slate-500 font-medium">(All: {formatInteger(stats?.lifetime_global_trade_count ?? globalTradeCount)})</p>
          </div>
        )

        cards.push(
          <div key="win-rate" className="text-center md:border-l border-slate-200">
            <div className="flex items-center justify-center gap-1 mb-1">
              <p className="text-xs text-slate-500 font-medium">Win Rate</p>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button type="button" className="cursor-help focus:outline-none" aria-label="Win Rate information">
                    <Info className="h-3 w-3 text-slate-400 hover:text-slate-600 transition-colors" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs z-50" side="top" sideOffset={5}>
                  <p className="text-xs">
                    Trader's accuracy for this trade type vs. all trades.
                  </p>
                </TooltipContent>
              </Tooltip>
              <FireIcon reason="win_rate" />
            </div>
            <p className={cn(
              "text-sm md:text-base font-semibold text-slate-900 tabular-nums mb-0.5",
              hasInsufficientData && "opacity-50",
              hasLowSampleSize && "opacity-75"
            )}>
              {hasInsufficientData ? 'N/A' : safeWinRateDisplay(tradeTypeWinRate)}
            </p>
            {hasLowSampleSize && <p className="text-[9px] text-amber-600 font-medium mt-0.5">Low sample</p>}
            <p className="text-[10px] text-slate-500 font-medium">
              ({safeWinRateDisplay(allTradesWinRate)} all)
            </p>
          </div>
        )

        cards.push(
          <div key="avg-pnl" className="text-center md:border-l border-slate-200">
            <div className="flex items-center justify-center gap-1 mb-1">
              <p className="text-xs text-slate-500 font-medium">Ave PnL</p>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button type="button" className="cursor-help focus:outline-none" aria-label="Average PnL information">
                    <Info className="h-3 w-3 text-slate-400 hover:text-slate-600 transition-colors" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs z-50" side="top" sideOffset={5}>
                  <p className="text-xs">
                    Average profit per trade ($ and %) for this trade type.
                  </p>
                </TooltipContent>
              </Tooltip>
              <FireIcon reason="roi" />
            </div>
            <p className={cn(
              "text-sm md:text-base font-semibold tabular-nums mb-0.5",
              (tradeTypeAvgPnl ?? 0) >= 0 ? "text-emerald-600" : "text-red-600",
              hasInsufficientData && "opacity-50",
              hasLowSampleSize && "opacity-75"
            )}>
              {hasInsufficientData ? 'N/A' : `${formatCurrency(tradeTypeAvgPnl ?? 0)} (${formatPercent((tradeTypeRoiPct ?? 0) * 100)}%)`}
            </p>
            {hasLowSampleSize && <p className="text-[9px] text-amber-600 font-medium mt-0.5">Low sample</p>}
            <p className="text-[10px] text-slate-500 font-medium">
              ({formatCurrency(allTradesAvgPnl)} / {formatPercent((allTradesRoiPct ?? 0) * 100)}% all)
            </p>
          </div>
        )

        // Conviction card (always shown), slight spacing via padding
        cards.push(
          <div key="conviction" className="text-center md:border-l border-slate-200 md:pl-4">
            <div className="flex items-center justify-center gap-1 mb-1">
              <p className="text-xs text-slate-500 font-medium">Conviction</p>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button type="button" className="cursor-help focus:outline-none" aria-label="Conviction information">
                    <Info className="h-3 w-3 text-slate-400 hover:text-slate-600 transition-colors" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs z-50" side="top" sideOffset={5}>
                  <p className="text-xs">
                    Relative sizing: current position / historical average position and trade size.
                  </p>
                </TooltipContent>
              </Tooltip>
              <FireIcon reason="conviction" />
            </div>
            <p className={cn(
              "text-sm md:text-base font-semibold text-slate-900 tabular-nums mb-0.5",
              hasInsufficientData && "opacity-50",
              hasLowSampleSize && "opacity-75"
            )}>
              {hasInsufficientData ? 'N/A' : positionConviction !== null ? `${formatMultiplier(positionConviction)}x` : 'N/A'}
            </p>
            {hasLowSampleSize && <p className="text-[9px] text-amber-600 font-medium mt-0.5">Low sample</p>}
            <p className="text-[10px] text-slate-500 font-medium">
              ({tradeConviction !== null ? `${formatMultiplier(tradeConviction)}x` : 'N/A'} all)
            </p>
          </div>
        )

        if (showStreakCard) {
          cards.push(
            <div key="win-streak" className="text-center md:border-l border-slate-200">
              <div className="flex items-center justify-center gap-1 mb-1">
                <p className="text-xs text-slate-500 font-medium">Win Streak</p>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <button type="button" className="cursor-help focus:outline-none" aria-label="Win Streak information">
                      <Info className="h-3 w-3 text-slate-400 hover:text-slate-600 transition-colors" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs z-50" side="top" sideOffset={5}>
                    <p className="text-xs">
                      Current consecutive wins for this trade type vs. all trades.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className={cn(
                "text-sm md:text-base font-semibold text-slate-900 tabular-nums mb-0.5",
                hasInsufficientData && "opacity-50",
                hasLowSampleSize && "opacity-75"
              )}>
                {hasInsufficientData ? 'N/A' : `🔥 ${tradeTypeStreak} Wins`}
              </p>
              {hasLowSampleSize && <p className="text-[9px] text-amber-600 font-medium mt-0.5">Low sample</p>}
              <p className="text-[10px] text-slate-500 font-medium">
                (🔥 {allTradesStreak} all)
              </p>
            </div>
          )
        }

        const mdColsClass = {
          4: 'md:grid-cols-4',
          5: 'md:grid-cols-5',
          6: 'md:grid-cols-6',
          7: 'md:grid-cols-6 md:[&>*:last-child]:col-span-2',
        }[cards.length] || 'md:grid-cols-4'

        return (
          <div className="border border-slate-200 rounded-lg px-4 py-3 bg-slate-50/50">
            <div className={`grid grid-cols-2 ${mdColsClass} gap-3 relative`}>
              {cards}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
