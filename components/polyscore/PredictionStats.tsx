'use client'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Info, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useEffect, useState, useMemo } from 'react'

interface PredictionStatsProps {
  walletAddress: string
  conditionId: string
  price: number
  size: number
  marketTitle?: string
  marketCategory?: string
  marketTags?: string[] | null
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
  isAdmin = false,
}: PredictionStatsProps) {
  // Admin-only visibility
  if (!isAdmin) return null
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  // Determine price bracket
  const priceBracket = useMemo(() => {
    if (price < 0.4) return 'LOW'
    if (price > 0.6) return 'HIGH'
    return 'MID'
  }, [price])

  // Determine bet structure from title
  const betStructure = useMemo(() => {
    const titleLower = (marketTitle || '').toLowerCase()
    if (titleLower.includes('over') || titleLower.includes('under') || titleLower.includes('o/u')) return 'OVER_UNDER'
    if (titleLower.includes('spread') || titleLower.includes('handicap')) return 'SPREAD'
    if (titleLower.includes('will') || titleLower.includes('winner')) return 'WINNER'
    return 'STANDARD'
  }, [marketTitle])

  // Determine niche from tags, category, or title
  const niche = useMemo(() => {
    // Try category first
    if (marketCategory && marketCategory !== 'OTHER') {
      return marketCategory.toUpperCase()
    }
    
    // Try tags via semantic_mapping
    if (marketTags && marketTags.length > 0) {
      // We'll fetch semantic mapping in the effect
      return null // Will be determined in effect
    }
    
    // Fallback to title keywords
    const titleLower = (marketTitle || '').toLowerCase()
    if (titleLower.includes('tennis')) return 'TENNIS'
    if (titleLower.includes('nba') || titleLower.includes('basketball')) return 'NBA'
    if (titleLower.includes('nfl') || titleLower.includes('football')) return 'NFL'
    if (titleLower.includes('politics') || titleLower.includes('election')) return 'POLITICS'
    if (titleLower.includes('crypto') || titleLower.includes('bitcoin')) return 'CRYPTO'
    
    return 'OTHER'
  }, [marketCategory, marketTags, marketTitle])

  useEffect(() => {
    if (!walletAddress || !conditionId) return

    const fetchStats = async () => {
      setLoading(true)
      setError(null)

      try {
        const wallet = walletAddress.toLowerCase()
        const tradeTotal = price * size

        // Fetch market data from database to get classification
        let finalNiche = niche
        let finalBetStructure = betStructure
        
        // Use API route to ensure market exists in database
        let marketDataToUse: any = null
        
        try {
          const apiUrl = `/api/markets/ensure?conditionId=${encodeURIComponent(conditionId)}`
          // Fire-and-forget with timeout; don't block stats on slow ensure
          fetchWithTimeout(apiUrl, { cache: 'no-store' }, 5000)
            .then(async (resp) => {
              if (resp && resp.ok) {
                const ensureData = await resp.json().catch(() => null)
                if (ensureData?.found && ensureData.market) {
                  marketDataToUse = ensureData.market
                }
              }
            })
            .catch(() => {})
        } catch {
          // ignore ensure failure
        }

        console.log('[PredictionStats] Market data to use:', {
          conditionId,
          marketExists: !!marketDataToUse,
          market_subtype: marketDataToUse?.market_subtype,
          bet_structure: marketDataToUse?.bet_structure,
          tags: marketDataToUse?.tags,
          tagsType: typeof marketDataToUse?.tags,
          tagsLength: Array.isArray(marketDataToUse?.tags) ? marketDataToUse.tags.length : 0,
          title: marketDataToUse?.title,
        })

        // Use market_subtype from database if available
        if (marketDataToUse?.market_subtype && marketDataToUse.market_subtype.trim().length > 0) {
          finalNiche = marketDataToUse.market_subtype.trim().toUpperCase()
          console.log('[PredictionStats] Using market_subtype:', finalNiche)
        } else {
          // Get tags from database (JSONB array) or from props
          let tagsToUse: string[] = []
          
          // First try database tags (JSONB array)
          // Match edge function logic: convert to lowercase and trim
          if (marketDataToUse?.tags) {
            if (Array.isArray(marketDataToUse.tags)) {
              tagsToUse = marketDataToUse.tags
                .map((t: any) => {
                  const tagStr = typeof t === 'string' ? t : String(t)
                  return tagStr.toLowerCase().trim()
                })
                .filter((t: string) => t.length > 0)
            } else if (typeof marketDataToUse.tags === 'string') {
              try {
                const parsed = JSON.parse(marketDataToUse.tags)
                if (Array.isArray(parsed)) {
                  tagsToUse = parsed
                    .map((t: any) => {
                      const tagStr = typeof t === 'string' ? t : String(t)
                      return tagStr.toLowerCase().trim()
                    })
                    .filter((t: string) => t.length > 0)
                }
              } catch {
                // Not JSON, treat as single tag
                tagsToUse = [marketDataToUse.tags.toLowerCase().trim()].filter((t: string) => t.length > 0)
              }
            }
          }
          
          // Fallback to props if database tags are empty
          if (tagsToUse.length === 0 && marketTags && marketTags.length > 0) {
            tagsToUse = marketTags
              .map((t: any) => {
                const tagStr = typeof t === 'string' ? t : String(t)
                return tagStr.toLowerCase().trim()
              })
              .filter((t: string) => t.length > 0)
          }
          
          console.log('[PredictionStats] Tags to use for semantic_mapping (lowercase, trimmed):', {
            tags: tagsToUse,
            count: tagsToUse.length,
          })
          
          // Look up niche from semantic_mapping using tags (exactly like edge function)
          if (tagsToUse.length > 0) {
            console.log('[PredictionStats] Querying semantic_mapping table with cleanTags:', tagsToUse)
            
            // Query semantic_mapping - tags are already lowercase (matching edge function)
            const { data: mappings, error: mappingError } = await supabase
              .from('semantic_mapping')
              .select('clean_niche, specificity_score, original_tag')
              .in('original_tag', tagsToUse)
            
            console.log('[PredictionStats] Semantic mapping query result:', {
              hasError: !!mappingError,
              errorMessage: mappingError?.message,
              errorCode: mappingError?.code,
              errorDetails: mappingError?.details,
              mappingsFound: mappings?.length || 0,
              mappings: mappings,
            })
            
            if (mappingError) {
              console.error('[PredictionStats] Error querying semantic_mapping:', {
                error: mappingError,
                message: mappingError.message,
                code: mappingError.code,
                details: mappingError.details,
                hint: mappingError.hint,
              })
            }
            
            if (mappings && mappings.length > 0) {
              console.log('[PredictionStats] Found mappings, sorting by specificity_score')
              mappings.sort((a: any, b: any) => (a.specificity_score || 99) - (b.specificity_score || 99))
              console.log('[PredictionStats] Sorted mappings:', mappings.map((m: any) => ({
                original_tag: m.original_tag,
                clean_niche: m.clean_niche,
                specificity_score: m.specificity_score,
              })))
              
              finalNiche = mappings[0].clean_niche || null
              console.log('[PredictionStats] ✅ Selected niche from semantic_mapping:', {
                niche: finalNiche,
                fromTag: mappings[0].original_tag,
                specificity: mappings[0].specificity_score,
              })
            } else {
              console.warn('[PredictionStats] ⚠️ No mappings found for tags:', {
                tagsQueried: tagsToUse,
                suggestion: 'Check semantic_mapping table for these tag values',
              })
            }
          } else {
            console.warn('[PredictionStats] No tags to query semantic_mapping')
          }
          
          // If still no niche from semantic_mapping, log why
          if (!finalNiche && tagsToUse.length > 0) {
            console.warn('[PredictionStats] No niche found from semantic_mapping despite having tags:', {
              tagsQueried: tagsToUse,
              tagsCount: tagsToUse.length,
              suggestion: 'Check if semantic_mapping table has entries for these tags',
            })
          }
        }
        
        // Use bet_structure from database if available
        if (marketDataToUse?.bet_structure && marketDataToUse.bet_structure.trim().length > 0) {
          finalBetStructure = marketDataToUse.bet_structure.trim().toUpperCase()
        }
        
        console.log('[PredictionStats] Final classification before fallback:', {
          finalNiche,
          finalBetStructure,
          priceBracket,
        })
        
        if (!finalNiche) {
          console.warn('[PredictionStats] No niche found, defaulting to OTHER')
          finalNiche = 'OTHER'
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

        // Fetch global stats
        // Use service-role API proxy to avoid RLS / PostgREST cache issues
        let globalStats: any = null
        let profileStats: any[] = []
        try {
          const statsResp = await fetch(`/api/trader/stats?wallet=${encodeURIComponent(wallet)}`, { cache: 'no-store' })
          if (!statsResp.ok) {
            const txt = await statsResp.text().catch(() => '')
            throw new Error(`/api/trader/stats ${statsResp.status}: ${txt.slice(0,200)}`)
          }
          const json = await statsResp.json()
          globalStats = json.global || null
          profileStats = json.profiles || []
        } catch (statsErr: any) {
          console.error('[PredictionStats] stats fetch failed', statsErr)
          setError('Trader insights unavailable')
          setLoading(false)
          return
        }

        // Normalize global stats with 30d preference
        const globalWinRate = pickNumber(
          globalStats?.d30_win_rate, globalStats?.D30_win_rate,
          globalStats?.recent_win_rate,
          globalStats?.l_win_rate, globalStats?.L_win_rate,
          globalStats?.global_win_rate,
        ) ?? 0.5

        const globalRoiPct = pickNumber(
          globalStats?.d30_total_roi_pct, globalStats?.D30_total_roi_pct,
          globalStats?.l_total_roi_pct, globalStats?.L_total_roi_pct,
          globalStats?.global_roi_pct,
        ) ?? 0

        const globalAvgPnlUsd = pickNumber(
          globalStats?.d30_avg_pnl_trade_usd, globalStats?.D30_avg_pnl_trade_usd,
          globalStats?.l_avg_pnl_trade_usd, globalStats?.L_avg_pnl_trade_usd,
        ) ?? 0

        const globalAvgTradeSizeUsd = pickNumber(
          globalStats?.d30_avg_trade_size_usd, globalStats?.D30_avg_trade_size_usd,
          globalStats?.l_avg_trade_size_usd, globalStats?.L_avg_trade_size_usd,
          globalStats?.avg_bet_size_usdc,
        ) ?? tradeTotal

        const globalTradeCount = pickNumber(
          globalStats?.d30_count, globalStats?.D30_count,
          globalStats?.l_count, globalStats?.L_count,
          globalStats?.total_lifetime_trades,
        ) ?? 0

        const globalAvgPosSizeUsd = pickNumber(
          globalStats?.l_avg_pos_size_usd,
          globalStats?.avg_bet_size_usdc,
        ) ?? globalAvgTradeSizeUsd

        // Waterfall logic: find best matching profile
        const finalNicheKey = normalizeKey(finalNiche)
        const finalBetStructureKey = normalizeKey(finalBetStructure)
        const priceBracketKey = normalizeBracket(priceBracket)
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
        const profileAvgPnlUsd = profileResult?.avg_pnl_usd ?? 0
        const profileCount = profileResult?.trade_count ?? globalTradeCount
        const avgBetSize = globalAvgPosSizeUsd || tradeTotal

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
        const profileAvgPnl = profileAvgPnlUsd !== 0
          ? profileAvgPnlUsd
          : (avgBetSize > 0 && profileRoiPct !== 0 ? avgBetSize * (profileRoiPct / 100) : 0)
        const globalAvgPnl = globalAvgPnlUsd !== 0
          ? globalAvgPnlUsd
          : (globalAvgTradeSizeUsd > 0 && globalRoiPct !== 0 ? globalAvgTradeSizeUsd * (globalRoiPct / 100) : 0)

        // Calculate current exposure (sum of all positions in this market)
        // For now, use current trade size as exposure
        const currentExposure = tradeTotal

        const statsData: StatsData = {
          profile_L_win_rate: profileWinRate,
          global_L_win_rate: globalWinRate,
          profile_L_avg_pnl_per_trade_usd: profileAvgPnl,
          global_L_avg_pnl_per_trade_usd: globalAvgPnl,
          profile_L_roi_pct: profileRoiPct / 100, // Convert percentage to decimal
          global_L_roi_pct: globalRoiPct / 100,
          profile_current_win_streak: 0, // Would need to query recent trades
          global_current_win_streak: 0,
          profile_L_count: profileCount,
          global_trade_count: globalTradeCount,
          trade_profile: tradeProfile,
          data_source: dataSource,
          current_market_exposure: currentExposure,
          current_trade_size: tradeTotal,
          global_L_avg_pos_size_usd: globalAvgPosSizeUsd,
          global_L_avg_trade_size_usd: globalAvgTradeSizeUsd,
        }

        console.log('[PredictionStats] Setting stats:', {
          profile_L_win_rate: statsData.profile_L_win_rate,
          global_L_win_rate: statsData.global_L_win_rate,
          profile_L_count: statsData.profile_L_count,
          profile_L_avg_pnl_per_trade_usd: statsData.profile_L_avg_pnl_per_trade_usd,
          global_L_avg_pnl_per_trade_usd: statsData.global_L_avg_pnl_per_trade_usd,
          profile_L_roi_pct: statsData.profile_L_roi_pct,
          global_L_roi_pct: statsData.global_L_roi_pct,
        })

        setStats(statsData)
      } catch (err: any) {
        console.error('[PredictionStats] Error:', err)
        setError(err?.message || 'Failed to load stats')
        // Even on error, set default stats so UI doesn't break
        setStats({
          profile_L_win_rate: 0.5,
          global_L_win_rate: 0.5,
          profile_L_avg_pnl_per_trade_usd: 0,
          global_L_avg_pnl_per_trade_usd: 0,
          profile_L_roi_pct: 0,
          global_L_roi_pct: 0,
          profile_current_win_streak: 0,
          global_current_win_streak: 0,
          profile_L_count: 0,
          trade_profile: `${niche || 'OTHER'}_${betStructure}_${priceBracket}`,
          data_source: 'Error - Using Defaults',
          current_market_exposure: price * size,
          current_trade_size: price * size,
          global_L_avg_pos_size_usd: price * size,
          global_L_avg_trade_size_usd: price * size,
        })
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [walletAddress, conditionId, price, size, niche, betStructure, priceBracket, marketTags, marketTitle, marketCategory])

  // Only show N/A if stats is null or if we truly have no data
  // Since we always set trade_profile and use defaults, we should always have data
  const hasInsufficientData = !stats
  // Low sample size only applies to profile-specific data, not global fallback
  const hasLowSampleSize = stats && 
    stats.data_source !== 'Global Fallback' &&
    (stats.profile_L_count ?? 0) > 0 && 
    (stats.profile_L_count ?? 0) < LOW_SAMPLE_THRESHOLD

  // Format helpers
  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '$0.00'
    const sign = value >= 0 ? '+' : '-'
    return `${sign}$${Math.abs(value).toFixed(2)}`
  }

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '0.00'
    const sign = value >= 0 ? '+' : '-'
    return `${sign}${Math.abs(value).toFixed(2)}`
  }

  const formatInteger = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '0'
    return Math.trunc(value).toLocaleString()
  }

  const formatMultiplier = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return '0.00'
    return value.toFixed(2)
  }

  const formatTradeType = (profile: string | null | undefined) => {
    if (!profile) return 'N/A'
    return profile.split('_').join(' · ')
  }

  // Extract values with fallbacks
  const tradeTypeWinRate = stats?.profile_L_win_rate ?? 0
  const allTradesWinRate = stats?.global_L_win_rate ?? 0
  const tradeTypeAvgPnl = stats?.profile_L_avg_pnl_per_trade_usd ?? 0
  const allTradesAvgPnl = stats?.global_L_avg_pnl_per_trade_usd ?? 0
  const tradeTypeRoiPct = stats?.profile_L_roi_pct ?? 0
  const allTradesRoiPct = stats?.global_L_roi_pct ?? 0
  const tradeTypeStreak = stats?.profile_current_win_streak ?? 0
  const allTradesStreak = stats?.global_current_win_streak ?? 0
  const profileCount = stats?.profile_L_count ?? 0
  const globalTradeCount = stats?.global_trade_count ?? 0
  const positionConviction = stats?.current_market_exposure && stats?.global_L_avg_pos_size_usd && stats.global_L_avg_pos_size_usd > 0
    ? stats.current_market_exposure / stats.global_L_avg_pos_size_usd
    : null
  const tradeConviction = stats?.current_trade_size && stats?.global_L_avg_trade_size_usd && stats?.global_L_avg_trade_size_usd > 0
    ? stats.current_trade_size / stats.global_L_avg_trade_size_usd
    : null
  
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
              {normalizeKey(stats.trade_profile?.split('_')?.[0] || finalNiche) || 'OTHER'}
            </span>
            <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[11px] font-medium">
              {normalizeKey(stats.trade_profile?.split('_')?.[1] || betStructure)}
            </span>
            <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[11px] font-medium">
              {normalizeKey(stats.trade_profile?.split('_')?.[2] || priceBracket)}
            </span>
          </div>
        </h3>
      </div>

      {/* Trader Insight Stats Card */}
      {(() => {
        const showStreakCard = tradeTypeStreak >= 2 || allTradesStreak >= 2
        const cards: JSX.Element[] = []

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
              {hasInsufficientData ? 'N/A' : `${(tradeTypeWinRate * 100).toFixed(2)}%`}
            </p>
            {hasLowSampleSize && <p className="text-[9px] text-amber-600 font-medium mt-0.5">Low sample</p>}
            <p className="text-[10px] text-slate-500 font-medium">
              ({(allTradesWinRate * 100).toFixed(2)}% all)
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
              tradeTypeAvgPnl >= 0 ? "text-emerald-600" : "text-red-600",
              hasInsufficientData && "opacity-50",
              hasLowSampleSize && "opacity-75"
            )}>
              {hasInsufficientData ? 'N/A' : formatCurrency(tradeTypeAvgPnl)}
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
              tradeTypeRoiPct >= 0 ? "text-emerald-600" : "text-red-600",
              hasInsufficientData && "opacity-50",
              hasLowSampleSize && "opacity-75"
            )}>
              {hasInsufficientData ? 'N/A' : `${formatPercent(tradeTypeRoiPct * 100)}%`}
            </p>
            {hasLowSampleSize && <p className="text-[9px] text-amber-600 font-medium mt-0.5">Low sample</p>}
            <p className="text-[10px] text-slate-500 font-medium">
              ({formatPercent(allTradesRoiPct * 100)}% all)
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
