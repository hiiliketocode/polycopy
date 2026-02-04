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
}

interface StatsData {
  // Trade type stats (this trade type)
  profile_L_win_rate?: number
  profile_L_avg_pnl_per_trade_usd?: number
  profile_L_roi_pct?: number
  profile_current_win_streak?: number
  profile_L_count?: number
  global_trade_count?: number
  
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
}

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
}: PredictionStatsProps) {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resolvedNiche, setResolvedNiche] = useState<string | null>(null)
  const [resolvedBetStructure, setResolvedBetStructure] = useState<string>('STANDARD')

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
  const betStructure = useMemo(() => {
    const titleLower = (marketTitle || '').toLowerCase()
    if (titleLower.includes('over') || titleLower.includes('under') || titleLower.includes('o/u')) return 'OVER_UNDER'
    if (titleLower.includes('spread') || titleLower.includes('handicap')) return 'SPREAD'
    if (titleLower.includes('will') || titleLower.includes('winner')) return 'WINNER'
    return 'STANDARD'
  }, [marketTitle])

    // Determine niche from semantic_mapping only (no fallbacks)
  const niche = useMemo(() => {
    // Semantic mapping handled in effect; return null to signal lookup when tags exist
    if (marketTags && marketTags.length > 0) return null
    // No fallback - rely entirely on semantic_mapping via useEffect
    return null
  }, [marketTags])

  useEffect(() => {
    if (!walletAddress || !conditionId) return

    const fetchStats = async () => {
      setLoading(true)
      setError(null)

      console.log('[PredictionStats] fetchStats called', {
        conditionId: conditionId.substring(0, 20) + '...',
        propMarketSubtype,
        propBetStructure,
        hasMarketTags: !!marketTags,
        marketTagsLength: Array.isArray(marketTags) ? marketTags.length : 0,
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

        // Fetch global stats directly from Supabase - skip API route for speed
        let globalStats: any = null
        let profileStats: any[] = []
        try {
          console.log('[PredictionStats] Fetching trader stats for wallet:', wallet)
          const [{ data: g, error: gErr }, { data: p, error: pErr }] = await Promise.all([
            supabase.from('trader_global_stats').select('*').eq('wallet_address', wallet).maybeSingle(),
            supabase.from('trader_profile_stats').select('*').eq('wallet_address', wallet),
          ])
          
          console.log('[PredictionStats] Global stats query result:', {
            hasData: !!g,
            data: g,
            error: gErr,
            errorCode: gErr?.code,
            errorMessage: gErr?.message,
          })
          console.log('[PredictionStats] Profile stats query result:', {
            count: p?.length || 0,
            error: pErr,
            errorCode: pErr?.code,
            errorMessage: pErr?.message,
          })
          
          if (gErr) {
            console.error('[PredictionStats] Error fetching global stats:', gErr)
          }
          if (pErr) {
            console.error('[PredictionStats] Error fetching profile stats:', pErr)
          }
          
          globalStats = g || null
          profileStats = p || []
          
          console.log('[PredictionStats] Processed stats:', {
            globalStatsExists: !!globalStats,
            globalStatsKeys: globalStats ? Object.keys(globalStats) : [],
            profileStatsCount: profileStats.length,
          })
        } catch (statsErr: any) {
          console.error('[PredictionStats] stats fetch failed', statsErr)
          setError('Trader insights unavailable')
          // Don't set empty stats - let component show error state
          setStats(null)
          setLoading(false)
          return
        }

        // Normalize global stats - sync script writes lowercase fields from BigQuery
        console.log('[PredictionStats] Available globalStats fields:', globalStats ? Object.keys(globalStats) : 'null')
        console.log('[PredictionStats] Raw globalStats values:', globalStats)
        
        // Sync script writes: l_win_rate, d30_win_rate, l_total_roi_pct, l_count, l_avg_trade_size_usd
        // Table schema shows: global_win_rate, global_roi_pct, total_lifetime_trades, avg_bet_size_usdc
        // Check BOTH sets of field names to handle either case
        const globalWinRate = pickNumber(
          // Fields from sync script (BigQuery → Supabase)
          globalStats?.d30_win_rate, globalStats?.D30_win_rate, // 30-day preferred
          globalStats?.l_win_rate, globalStats?.L_win_rate, // lifetime fallback
          // Fields from table schema
          globalStats?.recent_win_rate, // 30-day from schema
          globalStats?.global_win_rate, // lifetime from schema
        )

        const globalRoiPct = pickNumber(
          // Fields from sync script
          globalStats?.d30_total_roi_pct, globalStats?.D30_total_roi_pct, // 30-day preferred
          globalStats?.l_total_roi_pct, globalStats?.L_total_roi_pct, // lifetime fallback
          // Fields from table schema
          globalStats?.global_roi_pct,
        )

        const globalAvgPnlUsd = pickNumber(
          // Fields from sync script
          globalStats?.d30_avg_pnl_trade_usd, globalStats?.D30_avg_pnl_trade_usd,
          globalStats?.l_avg_pnl_trade_usd, globalStats?.L_avg_pnl_trade_usd,
        )

        // Trade size - sync script writes l_avg_trade_size_usd, table schema has avg_bet_size_usdc
        const globalAvgTradeSizeUsd = pickNumber(
          // Fields from sync script
          globalStats?.d30_avg_trade_size_usd, globalStats?.D30_avg_trade_size_usd, // 30-day preferred
          globalStats?.l_avg_trade_size_usd, globalStats?.L_avg_trade_size_usd, // lifetime fallback
          // Fields from table schema
          globalStats?.avg_bet_size_usdc,
        )

        const globalTradeCount = pickNumber(
          // Fields from sync script
          globalStats?.d30_count, globalStats?.D30_count, // 30-day preferred
          globalStats?.l_count, globalStats?.L_count, // lifetime fallback
          // Fields from table schema
          globalStats?.total_lifetime_trades,
        )

        // Position size - sync script writes l_avg_pos_size_usd
        const globalAvgPosSizeUsd = pickNumber(
          globalStats?.l_avg_pos_size_usd, globalStats?.L_avg_pos_size_usd, // From sync script
        ) ?? globalAvgTradeSizeUsd ?? null
        
        console.log('[PredictionStats] Extracted global stats:', {
          globalWinRate,
          globalRoiPct,
          globalAvgPnlUsd,
          globalAvgTradeSizeUsd,
          globalTradeCount,
          globalAvgPosSizeUsd,
          // Debug: show what we found
          found_l_win_rate: globalStats?.l_win_rate,
          found_d30_win_rate: globalStats?.d30_win_rate,
          found_l_total_roi_pct: globalStats?.l_total_roi_pct,
          found_l_count: globalStats?.l_count,
          found_l_avg_trade_size_usd: globalStats?.l_avg_trade_size_usd,
          found_avg_bet_size_usdc: globalStats?.avg_bet_size_usdc,
        })

        // Safety check: if averages seem unreasonably high compared to current trade, cap them
        // This prevents inflated averages from making conviction appear artificially low
        const MAX_REASONABLE_AVG_MULTIPLIER = 5.0 // Don't let avg be more than 5x current trade
        const cappedAvgTradeSize = globalAvgTradeSizeUsd && tradeTotal > 0 && globalAvgTradeSizeUsd > tradeTotal * MAX_REASONABLE_AVG_MULTIPLIER
          ? tradeTotal * MAX_REASONABLE_AVG_MULTIPLIER
          : globalAvgTradeSizeUsd
        const cappedAvgPosSize = globalAvgPosSizeUsd && tradeTotal > 0 && globalAvgPosSizeUsd > tradeTotal * MAX_REASONABLE_AVG_MULTIPLIER
          ? tradeTotal * MAX_REASONABLE_AVG_MULTIPLIER
          : globalAvgPosSizeUsd

        console.log('[PredictionStats] Average size calculation:', {
          tradeTotal,
          globalAvgTradeSizeUsd,
          globalAvgPosSizeUsd,
          cappedAvgTradeSize,
          cappedAvgPosSize,
          wasCapped: globalAvgTradeSizeUsd !== cappedAvgTradeSize || globalAvgPosSizeUsd !== cappedAvgPosSize,
        })

        // Waterfall logic: find best matching profile
        const finalNicheKey = normalizeKey(finalNiche)
        const finalBetStructureKey = normalizeKey(finalBetStructure)
        const priceBracketKey = normalizeKey(priceBracket)
        const normalizeProfile = (p: any) => {
          const nicheVal = normalizeKey(p.final_niche)
          const structureVal = normalizeKey(p.bet_structure || p.structure)
          const bracketVal = normalizeBracket(p.price_bracket || p.bracket)

          const d30Count = pickNumber(p.d30_count, p.D30_count)
          const lCount = pickNumber(p.trade_count, p.l_count, p.L_count)
          const use30 = d30Count !== null && d30Count !== undefined && d30Count >= MIN_TRADES_SELECTION
          const tradeCount = use30 ? d30Count! : (lCount ?? 0)

          const winRate = use30
            ? pickNumber(p.d30_win_rate, p.D30_win_rate)
            : pickNumber(p.win_rate, p.l_win_rate, p.L_win_rate)

          const roiPct = use30
            ? pickNumber(p.d30_total_roi_pct, p.D30_total_roi_pct, p.d30_roi_pct)
            : pickNumber(p.roi_pct, p.l_roi_pct, p.L_roi_pct, p.l_total_roi_pct, p.L_total_roi_pct)

          const avgPnlUsd = use30
            ? pickNumber(p.d30_avg_pnl_trade_usd, p.D30_avg_pnl_trade_usd)
            : pickNumber(p.l_avg_pnl_trade_usd, p.avg_pnl_trade_usd, p.L_avg_pnl_trade_usd)

          return {
            niche: nicheVal,
            structure: structureVal,
            bracket: bracketVal,
            win_rate: winRate ?? 0.5,
            roi_pct: roiPct ?? 0,
            avg_pnl_usd: avgPnlUsd ?? 0,
            trade_count: tradeCount,
            window: use30 ? '30d' : 'lifetime',
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

          if (!assignIfValid(level1, 'Specific Profile', `${finalNicheKey}_${finalBetStructureKey}_${priceBracketKey}`)) {
            const level2Matches = normalizedProfiles.filter((p: any) =>
              p.niche === finalNicheKey && p.structure === finalBetStructureKey
            )
            if (level2Matches.length > 0) {
              const agg = level2Matches.reduce((acc: any, p: any) => {
                acc.trade_count += p.trade_count
                acc.win_weighted += p.win_rate * p.trade_count
                acc.roi_weighted += p.roi_pct * p.trade_count
                acc.pnl_weighted += p.avg_pnl_usd * p.trade_count
                acc.window30d = acc.window30d || p.window === '30d'
                return acc
              }, { trade_count: 0, win_weighted: 0, roi_weighted: 0, pnl_weighted: 0, window30d: false })

              if (assignIfValid({
                trade_count: agg.trade_count,
                win_rate: agg.trade_count > 0 ? agg.win_weighted / agg.trade_count : 0.5,
                roi_pct: agg.trade_count > 0 ? agg.roi_weighted / agg.trade_count : 0,
                avg_pnl_usd: agg.trade_count > 0 ? agg.pnl_weighted / agg.trade_count : 0,
                window: agg.window30d ? '30d' : 'lifetime',
              }, 'Structure-Specific', `${finalNicheKey}_${finalBetStructureKey}`)) {
                // assigned
              }
            }

            if (!profileResult) {
              const level3Matches = normalizedProfiles.filter((p: any) => p.niche === finalNicheKey)
              if (level3Matches.length > 0) {
                const agg = level3Matches.reduce((acc: any, p: any) => {
                  acc.trade_count += p.trade_count
                  acc.win_weighted += p.win_rate * p.trade_count
                  acc.roi_weighted += p.roi_pct * p.trade_count
                  acc.pnl_weighted += p.avg_pnl_usd * p.trade_count
                  acc.window30d = acc.window30d || p.window === '30d'
                  return acc
                }, { trade_count: 0, win_weighted: 0, roi_weighted: 0, pnl_weighted: 0, window30d: false })

                assignIfValid({
                  trade_count: agg.trade_count,
                  win_rate: agg.trade_count > 0 ? agg.win_weighted / agg.trade_count : 0.5,
                  roi_pct: agg.trade_count > 0 ? agg.roi_weighted / agg.trade_count : 0,
                  avg_pnl_usd: agg.trade_count > 0 ? agg.pnl_weighted / agg.trade_count : 0,
                  window: agg.window30d ? '30d' : 'lifetime',
                }, 'Niche-Specific', finalNicheKey)
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
        const avgBetSize = globalAvgPosSizeUsd || globalAvgTradeSizeUsd || tradeTotal

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

        // Calculate avg PnL per trade (prefer direct column, fallback to ROI * avg bet size)
        const profileAvgPnl = profileAvgPnlUsd !== null && profileAvgPnlUsd !== undefined && profileAvgPnlUsd !== 0
          ? profileAvgPnlUsd
          : (avgBetSize !== null && avgBetSize !== undefined && avgBetSize > 0 && profileRoiPct !== null && profileRoiPct !== undefined
            ? avgBetSize * profileRoiPct
            : null)
        const globalAvgPnl = globalAvgPnlUsd !== null && globalAvgPnlUsd !== undefined && globalAvgPnlUsd !== 0
          ? globalAvgPnlUsd
          : (globalAvgTradeSizeUsd !== null && globalAvgTradeSizeUsd !== undefined && globalAvgTradeSizeUsd > 0 && globalRoiPct !== null && globalRoiPct !== undefined
            ? globalAvgTradeSizeUsd * globalRoiPct
            : null)

        // Calculate current exposure (sum of all positions in this market)
        // For now, use current trade size as exposure
        const currentExposure = tradeTotal

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
          profile_L_count: profileCount ?? 0,
          global_trade_count: globalTradeCount ?? 0,
          trade_profile: tradeProfile,
          data_source: dataSource,
          current_market_exposure: currentExposure,
          current_trade_size: tradeTotal,
          global_L_avg_pos_size_usd: cappedAvgPosSize !== null ? cappedAvgPosSize : undefined,
          global_L_avg_trade_size_usd: cappedAvgTradeSize !== null ? cappedAvgTradeSize : undefined,
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

        setStats(statsData)
      } catch (err: any) {
        console.error('[PredictionStats] Error:', err)
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
  }, [walletAddress, conditionId, price, size, priceBracket, marketTags, marketTitle, marketCategory, isAdmin, propMarketSubtype, propBetStructure])

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

  // Format helpers
  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A'
    const sign = value >= 0 ? '+' : '-'
    return `${sign}$${Math.abs(value).toFixed(2)}`
  }

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A'
    const sign = value >= 0 ? '+' : '-'
    return `${sign}${Math.abs(value).toFixed(2)}`
  }

  const formatInteger = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '0'
    return Math.trunc(value).toLocaleString()
  }

  const formatMultiplier = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return 'N/A'
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
  // If average is missing or zero, conviction can't be calculated
  const positionConviction = stats?.current_market_exposure && stats?.global_L_avg_pos_size_usd && stats.global_L_avg_pos_size_usd > 0
    ? stats.current_market_exposure / stats.global_L_avg_pos_size_usd
    : null
  const tradeConviction = stats?.current_trade_size && stats?.global_L_avg_trade_size_usd && stats?.global_L_avg_trade_size_usd > 0
    ? stats.current_trade_size / stats.global_L_avg_trade_size_usd
    : null

  // Debug logging for conviction calculation
  if (stats) {
    console.log('[PredictionStats] Conviction calculation:', {
      current_market_exposure: stats.current_market_exposure,
      current_trade_size: stats.current_trade_size,
      global_L_avg_pos_size_usd: stats.global_L_avg_pos_size_usd,
      global_L_avg_trade_size_usd: stats.global_L_avg_trade_size_usd,
      positionConviction,
      tradeConviction,
      // Check if averages seem too high
      posAvgTooHigh: stats.global_L_avg_pos_size_usd && stats.current_market_exposure 
        ? stats.global_L_avg_pos_size_usd > stats.current_market_exposure * 2 
        : null,
      tradeAvgTooHigh: stats.global_L_avg_trade_size_usd && stats.current_trade_size
        ? stats.global_L_avg_trade_size_usd > stats.current_trade_size * 2
        : null,
    })
  }
  const safeWinRateDisplay = (value: number | null | undefined) =>
    value === null || value === undefined ? 'N/A' : `${(value * 100).toFixed(2)}%`

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
            <p className="text-[10px] text-slate-500 font-medium">(All: {formatInteger(globalTradeCount)})</p>
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
          <div key="avg-pnl-usd" className="text-center md:border-l border-slate-200">
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
                    Average dollar profit per trade for this type.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className={cn(
              "text-sm md:text-base font-semibold tabular-nums mb-0.5",
              (tradeTypeAvgPnl ?? 0) >= 0 ? "text-emerald-600" : "text-red-600",
              hasInsufficientData && "opacity-50",
              hasLowSampleSize && "opacity-75"
            )}>
              {hasInsufficientData ? 'N/A' : formatCurrency(tradeTypeAvgPnl ?? 0)}
            </p>
            {hasLowSampleSize && <p className="text-[9px] text-amber-600 font-medium mt-0.5">Low sample</p>}
            <p className="text-[10px] text-slate-500 font-medium">
              ({formatCurrency(allTradesAvgPnl)} all)
            </p>
          </div>
        )

        cards.push(
          <div key="avg-pnl-pct" className="text-center md:border-l border-slate-200">
            <div className="flex items-center justify-center gap-1 mb-1">
              <p className="text-xs text-slate-500 font-medium">Ave PnL</p>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button type="button" className="cursor-help focus:outline-none" aria-label="Average ROI information">
                    <Info className="h-3 w-3 text-slate-400 hover:text-slate-600 transition-colors" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs z-50" side="top" sideOffset={5}>
                  <p className="text-xs">
                    Average ROI (%) for this trade type.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className={cn(
              "text-sm md:text-base font-semibold tabular-nums mb-0.5",
              (tradeTypeRoiPct ?? 0) >= 0 ? "text-emerald-600" : "text-red-600",
              hasInsufficientData && "opacity-50",
              hasLowSampleSize && "opacity-75"
            )}>
              {hasInsufficientData ? 'N/A' : `${formatPercent((tradeTypeRoiPct ?? 0) * 100)}%`}
            </p>
            {hasLowSampleSize && <p className="text-[9px] text-amber-600 font-medium mt-0.5">Low sample</p>}
            <p className="text-[10px] text-slate-500 font-medium">
              ({formatPercent((allTradesRoiPct ?? 0) * 100)}% all)
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
