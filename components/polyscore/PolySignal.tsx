'use client'

import { useState, useMemo, useEffect } from 'react'
import { 
  ChevronDown, ChevronUp, TrendingUp, TrendingDown, Target, Zap, Brain, 
  AlertTriangle, CheckCircle, XCircle, Info, BarChart3, DollarSign,
  Activity, Clock, Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { PolyScoreResponse } from '@/lib/polyscore/get-polyscore'

interface PolySignalProps {
  data: PolyScoreResponse | null
  loading?: boolean
  entryPrice?: number // Price trader entered at
  currentPrice?: number // Current market price (for detecting price movements)
  walletAddress?: string // Wallet to fetch stats for
  tradeSize?: number // Size of the trade in shares
  // Niche from feed/DB - MUST match PredictionStats source for consistency
  marketSubtype?: string // niche (market_subtype from DB)
  // Server-side pre-computed values (from fire feed) - if provided, skip client-side refetch
  serverRecommendation?: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'AVOID' | 'TOXIC'
  serverScore?: number
}

// Stats fetched from trader API
interface TraderStats {
  globalWinRate: number | null
  profileWinRate: number | null
  globalRoiPct: number | null
  profileRoiPct: number | null
  globalTrades: number
  profileTrades: number
  avgBetSizeUsd: number | null  // Global avg trade size
  profileAvgTradeSize: number | null  // Profile-specific avg trade size for conviction
  profileAvgPnl: number | null
  globalAvgPnl: number | null
}

// ============================================================================
// TYPES
// ============================================================================

type Recommendation = 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'AVOID' | 'TOXIC'

interface ScoreFactor {
  name: string
  icon: typeof TrendingUp
  value: number // Contribution to score
  maxValue: number // Max possible contribution
  weight: string // Display weight
  label: string // Human readable status
  detail: string // Explanation
  sentiment: 'positive' | 'neutral' | 'negative'
}

interface InsightData {
  // Trade classification
  niche: string | null
  tradeProfile: string | null
  
  // Counts
  profileTrades: number
  globalTrades: number
  
  // Win rates
  profileWinRate: number | null
  globalWinRate: number | null
  
  // PnL / ROI
  profileRoiPct: number | null
  globalRoiPct: number | null
  profileAvgPnl: number | null
  globalAvgPnl: number | null
  
  // Conviction
  convictionMultiplier: number | null
  positionConviction: number | null
  tradeConviction: number | null
  exposureUsd: number | null
  zScore: number
  isOutlier: boolean
  
  // Momentum
  isHot: boolean
  currentStreak: number
  recentWinRate: number | null
  
  // Tactical
  isHedging: boolean
  isChasing: boolean
  isAveragingDown: boolean
  timing: string | null
  minutesToStart: number | null
  
  // AI Values
  aiWinProb: number
  aiEdgePct: number
}

interface PriceMovement {
  direction: 'up' | 'down' | 'stable'
  percent: number
  isMajor: boolean // >20% move
  isExtreme: boolean // >50% move
  implication: string
}

interface SignalResult {
  score: number
  recommendation: Recommendation
  headline: string
  factors: ScoreFactor[]
  redFlags: string[]
  greenFlags: string[]
  priceMovement: PriceMovement | null
  insights: InsightData
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const RECOMMENDATION_CONFIG: Record<Recommendation, {
  label: string
  color: string
  bgColor: string
  borderColor: string
  textColor: string
}> = {
  STRONG_BUY: {
    label: 'Strong Buy',
    color: 'emerald',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-300',
    textColor: 'text-emerald-700',
  },
  BUY: {
    label: 'Buy',
    color: 'green',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-300',
    textColor: 'text-green-700',
  },
  NEUTRAL: {
    label: 'Neutral',
    color: 'slate',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-300',
    textColor: 'text-slate-700',
  },
  AVOID: {
    label: 'Avoid',
    color: 'amber',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-300',
    textColor: 'text-amber-700',
  },
  TOXIC: {
    label: 'Toxic',
    color: 'red',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    textColor: 'text-red-700',
  },
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A'
  const sign = value >= 0 ? '+' : '-'
  return `${sign}$${Math.abs(value).toFixed(2)}`
}

function formatMultiplier(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A'
  if (value < 0.01) return '<0.01x'
  return `${value.toFixed(2)}x`
}

// ============================================================================
// SCORING ALGORITHM
// ============================================================================

function calculateSignal(
  data: PolyScoreResponse,
  entryPrice?: number,
  currentPrice?: number,
  traderStats?: TraderStats | null,
  tradeSize?: number,
  marketSubtype?: string  // Pass through for consistent niche display
): SignalResult {
  const factors: ScoreFactor[] = []
  const redFlags: string[] = []
  const greenFlags: string[] = []
  
  // ============================================================================
  // EXTRACT ALL AVAILABLE DATA
  // Prioritize trader stats fetched from API over PolyScoreResponse data
  // ============================================================================
  
  const stats = data.analysis?.prediction_stats
  const drawer = data.drawer
  const tactical = drawer?.tactical
  
  // AI predictions
  const aiWinProb = data.valuation?.ai_fair_value ?? data.prediction?.probability ?? 0.5
  const price = entryPrice ?? data.valuation?.estimated_fill ?? data.valuation?.spot_price ?? aiWinProb
  const spotPrice = currentPrice ?? data.valuation?.spot_price ?? price
  
  // Calculate trade value and conviction from fetched stats
  // Use profile-specific avg trade size for conviction (same as PredictionStats)
  const tradeValue = (entryPrice && tradeSize) ? entryPrice * tradeSize : (stats?.exposure ?? 0)
  // Prefer profile-specific avg trade size, fallback to global
  const avgSizeForConviction = traderStats?.profileAvgTradeSize ?? traderStats?.avgBetSizeUsd ?? null
  const calculatedConviction = (tradeValue > 0 && avgSizeForConviction && avgSizeForConviction > 0) 
    ? tradeValue / avgSizeForConviction 
    : (stats?.conviction_multiplier ?? null)
  
  // Build comprehensive insights object - USE FETCHED TRADER STATS
  const insights: InsightData = {
    // PRIORITY: Use marketSubtype prop (same source as PredictionStats) for consistent niche display
    niche: marketSubtype?.toUpperCase() || (data.analysis?.niche_name ?? null),
    tradeProfile: stats?.trade_profile ?? null,
    
    // PRIORITY: Use fetched trader stats, fallback to PolyScoreResponse data
    profileTrades: traderStats?.profileTrades ?? stats?.profile_trades_count ?? stats?.trade_count ?? drawer?.competency?.total_trades ?? 0,
    globalTrades: traderStats?.globalTrades ?? stats?.global_trades_total ?? 0,
    
    profileWinRate: traderStats?.profileWinRate ?? stats?.profile_win_rate ?? stats?.trader_win_rate ?? drawer?.competency?.niche_win_rate ?? null,
    globalWinRate: traderStats?.globalWinRate ?? stats?.global_win_rate ?? drawer?.competency?.global_win_rate ?? null,
    
    profileRoiPct: traderStats?.profileRoiPct ?? stats?.profile_roi_pct ?? stats?.trader_historical_roi_pct ?? null,
    globalRoiPct: traderStats?.globalRoiPct ?? stats?.global_roi_pct ?? null,
    profileAvgPnl: traderStats?.profileAvgPnl ?? stats?.profile_avg_usd ?? null,
    globalAvgPnl: traderStats?.globalAvgPnl ?? stats?.global_avg_usd ?? null,
    
    convictionMultiplier: calculatedConviction,
    positionConviction: calculatedConviction,
    tradeConviction: calculatedConviction,
    exposureUsd: tradeValue > 0 ? tradeValue : (stats?.exposure ?? drawer?.conviction?.total_exposure_usd ?? null),
    zScore: drawer?.conviction?.z_score ?? data.analysis?.debug?.z_score ?? 0,
    isOutlier: drawer?.conviction?.is_outlier ?? (calculatedConviction !== null && calculatedConviction >= 2.5),
    
    isHot: drawer?.momentum?.is_hot ?? false,
    currentStreak: drawer?.momentum?.current_streak ?? 0,
    recentWinRate: drawer?.momentum?.recent_win_rate ?? null,
    
    isHedging: tactical?.is_hedged ?? false,
    isChasing: tactical?.is_chasing ?? false,
    isAveragingDown: tactical?.is_avg_down ?? false,
    timing: tactical?.timing ?? null,
    minutesToStart: tactical?.minutes_to_start ?? null,
    
    aiWinProb: aiWinProb,
    aiEdgePct: data.valuation?.real_edge_pct ?? ((aiWinProb - price) * 100),
  }
  
  // ============================================================================
  // PRICE MOVEMENT DETECTION
  // Detect if market has moved significantly since entry
  // ============================================================================
  
  let priceMovement: PriceMovement | null = null
  
  if (entryPrice && currentPrice && entryPrice > 0) {
    const movePct = ((currentPrice - entryPrice) / entryPrice) * 100
    const absMove = Math.abs(movePct)
    
    if (absMove > 5) { // Only flag moves > 5%
      const direction = movePct > 0 ? 'up' : 'down'
      const isMajor = absMove > 20
      const isExtreme = absMove > 50
      
      let implication: string
      if (direction === 'down') {
        if (isExtreme) {
          implication = 'Position likely losing badly - market moved against trade'
          redFlags.push(`Price crashed ${absMove.toFixed(0)}% since entry`)
        } else if (isMajor) {
          implication = 'Significant price drop - trade may be underwater'
          redFlags.push(`Price down ${absMove.toFixed(0)}% since entry`)
        } else {
          implication = 'Price has declined since entry'
        }
      } else {
        if (isExtreme) {
          implication = 'Position likely profitable - strong market move in favor'
          greenFlags.push(`Price up ${absMove.toFixed(0)}% since entry`)
        } else if (isMajor) {
          implication = 'Good price movement - trade looking favorable'
          greenFlags.push(`Price up ${absMove.toFixed(0)}%`)
        } else {
          implication = 'Price has increased since entry'
        }
      }
      
      priceMovement = {
        direction,
        percent: movePct,
        isMajor,
        isExtreme,
        implication,
      }
    }
  }
  
  // ============================================================================
  // FACTOR 1: EDGE (50% weight)
  // The core ROI opportunity - AI win prob vs entry price
  // ============================================================================
  
  // Use entry price for edge calculation (what they paid, not current price)
  const rawEdge = (aiWinProb - price) * 100
  
  // Edge scoring: -15% → -25pts, 0% → 0pts, +15% → +25pts
  const edgeContribution = Math.max(-25, Math.min(25, rawEdge * (25 / 15)))
  
  let edgeLabel: string
  let edgeSentiment: 'positive' | 'neutral' | 'negative'
  
  if (rawEdge >= 10) {
    edgeLabel = 'Strong value'
    edgeSentiment = 'positive'
    if (!priceMovement?.isExtreme || priceMovement.direction === 'up') {
      greenFlags.push(`${rawEdge.toFixed(0)}% edge`)
    }
  } else if (rawEdge >= 3) {
    edgeLabel = 'Good value'
    edgeSentiment = 'positive'
  } else if (rawEdge >= -3) {
    edgeLabel = 'Fair price'
    edgeSentiment = 'neutral'
  } else if (rawEdge >= -10) {
    edgeLabel = 'Overpaying'
    edgeSentiment = 'negative'
    redFlags.push(`${Math.abs(rawEdge).toFixed(0)}% above fair value`)
  } else {
    edgeLabel = 'Severely overpaying'
    edgeSentiment = 'negative'
    redFlags.push(`${Math.abs(rawEdge).toFixed(0)}% premium - negative EV`)
  }
  
  factors.push({
    name: 'Edge',
    icon: TrendingUp,
    value: edgeContribution,
    maxValue: 25,
    weight: '50%',
    label: edgeLabel,
    detail: `AI: ${(aiWinProb * 100).toFixed(0)}% prob @ ${(price * 100).toFixed(0)}¢ → ${rawEdge >= 0 ? '+' : ''}${rawEdge.toFixed(1)}% expected ROI`,
    sentiment: edgeSentiment,
  })
  
  // ============================================================================
  // FACTOR 2: CONVICTION (25% weight) - INCREASED from 15%
  // How confident is the trader in this specific bet?
  // ============================================================================
  
  const convictionMult = insights.convictionMultiplier ?? 1
  const zScore = insights.zScore
  const isOutlier = insights.isOutlier
  
  // Conviction scoring: 0.5x → -12pts, 1x → 0pts, 2x+ → +20pts
  let convictionContribution = 0
  
  if (isOutlier || zScore > 2.5 || convictionMult >= 2.5) {
    convictionContribution = 20
  } else if (zScore > 1.5 || convictionMult >= 2) {
    convictionContribution = 15
  } else if (zScore > 1 || convictionMult >= 1.5) {
    convictionContribution = 10
  } else if (convictionMult >= 1.2) {
    convictionContribution = 5
  } else if (convictionMult < 0.5) {
    convictionContribution = -12
  } else if (convictionMult < 0.7) {
    convictionContribution = -6
  }
  
  let convictionLabel: string
  let convictionSentiment: 'positive' | 'neutral' | 'negative'
  let convictionDetail: string
  
  if (isOutlier || convictionMult >= 2.5) {
    convictionLabel = 'Extreme conviction'
    convictionSentiment = 'positive'
    convictionDetail = `${convictionMult?.toFixed(1) ?? '2.5+'}x normal size (outlier bet)`
    greenFlags.push('Unusually large position')
  } else if (convictionMult >= 2) {
    convictionLabel = 'High conviction'
    convictionSentiment = 'positive'
    convictionDetail = `${convictionMult.toFixed(1)}x their average bet`
    greenFlags.push('High conviction bet')
  } else if (convictionMult >= 1.5) {
    convictionLabel = 'Above normal'
    convictionSentiment = 'positive'
    convictionDetail = `${convictionMult.toFixed(1)}x normal size`
  } else if (convictionMult >= 0.7) {
    convictionLabel = 'Normal'
    convictionSentiment = 'neutral'
    convictionDetail = 'Standard bet size for this trader'
  } else if (convictionMult >= 0.5) {
    convictionLabel = 'Below normal'
    convictionSentiment = 'negative'
    convictionDetail = `Only ${convictionMult.toFixed(1)}x their normal size`
  } else {
    convictionLabel = 'Low conviction'
    convictionSentiment = 'negative'
    convictionDetail = `Tiny bet (${convictionMult?.toFixed(2) ?? '<0.5'}x normal)`
    redFlags.push('Very small bet - low confidence')
  }
  
  factors.push({
    name: 'Conviction',
    icon: Zap,
    value: convictionContribution,
    maxValue: 20,
    weight: '25%',
    label: convictionLabel,
    detail: convictionDetail,
    sentiment: convictionSentiment,
  })
  
  // ============================================================================
  // FACTOR 3: SKILL (15% weight) - DECREASED from 25%
  // Trader's demonstrated ability in this niche
  // ============================================================================
  
  const nicheWinRate = insights.profileWinRate ?? 0.5
  const totalTrades = insights.profileTrades
  
  // Skill scoring: 45% → -10pts, 50% → 0pts, 60% → +15pts
  const skillDelta = (nicheWinRate - 0.50) * 100
  const skillContribution = Math.max(-10, Math.min(15, skillDelta * 1.5))
  
  let skillLabel: string
  let skillSentiment: 'positive' | 'neutral' | 'negative'
  let skillDetail: string
  
  if (totalTrades < 5) {
    skillLabel = 'Unproven'
    skillSentiment = 'neutral'
    skillDetail = `Only ${totalTrades} trades in ${insights.niche || 'this niche'}`
    redFlags.push('Limited track record')
  } else if (nicheWinRate >= 0.60) {
    skillLabel = 'Expert'
    skillSentiment = 'positive'
    skillDetail = `${(nicheWinRate * 100).toFixed(0)}% win rate (${totalTrades} trades)`
    greenFlags.push('Niche expert')
  } else if (nicheWinRate >= 0.55) {
    skillLabel = 'Above average'
    skillSentiment = 'positive'
    skillDetail = `${(nicheWinRate * 100).toFixed(0)}% win rate in niche`
  } else if (nicheWinRate >= 0.48) {
    skillLabel = 'Average'
    skillSentiment = 'neutral'
    skillDetail = `${(nicheWinRate * 100).toFixed(0)}% win rate`
  } else {
    skillLabel = 'Below average'
    skillSentiment = 'negative'
    skillDetail = `${(nicheWinRate * 100).toFixed(0)}% win rate - losing in this niche`
    if (totalTrades >= 10) redFlags.push('Weak niche performance')
  }
  
  factors.push({
    name: 'Skill',
    icon: Target,
    value: skillContribution,
    maxValue: 15,
    weight: '15%',
    label: skillLabel,
    detail: skillDetail,
    sentiment: skillSentiment,
  })
  
  // ============================================================================
  // FACTOR 4: CONTEXT (10% weight)
  // Momentum, tactical signals, and other context
  // ============================================================================
  
  let contextContribution = 0
  const contextItems: string[] = []
  
  // Positive context
  if (insights.isHot) {
    contextContribution += 5
    greenFlags.push(`🔥 Hot streak (${insights.currentStreak} wins)`)
    contextItems.push('+5 hot streak')
  }
  
  if (insights.isAveragingDown) {
    contextContribution += 3
    greenFlags.push('Averaging down')
    contextItems.push('+3 averaging down')
  }
  
  if (totalTrades >= 30) {
    contextContribution += 3
    contextItems.push('+3 proven track record')
  }
  
  // Negative context
  if (insights.isHedging) {
    contextContribution -= 15
    redFlags.push('⚠️ Hedging - betting both sides')
    contextItems.push('-15 hedging')
  }
  
  if (insights.isChasing) {
    contextContribution -= 5
    redFlags.push('Chasing price')
    contextItems.push('-5 chasing')
  }
  
  if (totalTrades < 5) {
    contextContribution -= 5
    contextItems.push('-5 low sample')
  }
  
  // Price movement penalty (if extreme and negative)
  if (priceMovement?.isExtreme && priceMovement.direction === 'down') {
    contextContribution -= 10
    contextItems.push('-10 price crashed')
  } else if (priceMovement?.isMajor && priceMovement.direction === 'down') {
    contextContribution -= 5
    contextItems.push('-5 price dropped')
  }
  
  const contextLabel = contextContribution > 3 ? 'Favorable' : 
                       contextContribution < -3 ? 'Concerning' : 'Neutral'
  const contextSentiment = contextContribution > 3 ? 'positive' as const : 
                           contextContribution < -3 ? 'negative' as const : 'neutral' as const
  
  factors.push({
    name: 'Context',
    icon: Brain,
    value: Math.max(-10, Math.min(10, contextContribution)),
    maxValue: 10,
    weight: '10%',
    label: contextLabel,
    detail: contextItems.length > 0 ? contextItems.join(', ') : 'No exceptional signals',
    sentiment: contextSentiment,
  })
  
  // ============================================================================
  // FINAL SCORE CALCULATION
  // Base: 50, then add weighted contributions
  // ============================================================================
  
  const totalContribution = 
    edgeContribution + 
    convictionContribution + 
    skillContribution + 
    Math.max(-10, Math.min(10, contextContribution))
  
  const finalScore = Math.max(0, Math.min(100, 50 + totalContribution))
  
  // ============================================================================
  // RECOMMENDATION LOGIC
  // ============================================================================
  
  let recommendation: Recommendation
  let headline: string
  
  // Hard overrides for extreme cases
  if (insights.isHedging && rawEdge < 0) {
    recommendation = 'TOXIC'
    headline = 'Hedged position with negative expected value'
  } else if (priceMovement?.isExtreme && priceMovement.direction === 'down') {
    recommendation = 'AVOID'
    headline = `Price crashed ${Math.abs(priceMovement.percent).toFixed(0)}% - market moved against trade`
  } else if (rawEdge < -15) {
    recommendation = 'TOXIC'
    headline = `Severely overpaying (${Math.abs(rawEdge).toFixed(0)}% above fair value)`
  } else if (nicheWinRate < 0.40 && totalTrades >= 15) {
    recommendation = 'TOXIC'
    headline = `Proven losing trader (${(nicheWinRate * 100).toFixed(0)}% win rate)`
  }
  // Score-based recommendations
  else if (finalScore >= 75) {
    recommendation = 'STRONG_BUY'
    if (rawEdge >= 10 && convictionMult >= 1.5) {
      headline = `${rawEdge.toFixed(0)}% edge with ${convictionMult.toFixed(1)}x conviction`
    } else if (rawEdge >= 10 && nicheWinRate >= 0.55) {
      headline = `${(nicheWinRate * 100).toFixed(0)}% niche expert buying ${rawEdge.toFixed(0)}% below fair value`
    } else if (convictionMult >= 2) {
      headline = `High conviction bet (${convictionMult.toFixed(1)}x) with positive edge`
    } else {
      headline = 'Multiple strong signals aligned'
    }
  } else if (finalScore >= 60) {
    recommendation = 'BUY'
    if (rawEdge >= 5) {
      headline = `Positive edge: ${rawEdge.toFixed(0)}% expected ROI opportunity`
    } else if (convictionMult >= 1.5) {
      headline = `Above-average conviction (${convictionMult.toFixed(1)}x) at fair price`
    } else if (nicheWinRate >= 0.55) {
      headline = `Above average trader (${(nicheWinRate * 100).toFixed(0)}% win rate)`
    } else {
      headline = 'Favorable risk/reward profile'
    }
  } else if (finalScore >= 45) {
    recommendation = 'NEUTRAL'
    if (totalTrades < 5) {
      headline = 'Limited data - track record unproven'
    } else if (Math.abs(rawEdge) < 3) {
      headline = 'Fair odds - no significant edge detected'
    } else if (priceMovement?.direction === 'down') {
      headline = 'Mixed signals - price has declined since entry'
    } else {
      headline = 'Mixed signals - use your own judgment'
    }
  } else if (finalScore >= 30) {
    recommendation = 'AVOID'
    if (rawEdge < -5) {
      headline = `Overpaying by ${Math.abs(rawEdge).toFixed(0)}% - negative expected value`
    } else if (nicheWinRate < 0.48 && totalTrades >= 10) {
      headline = `Below average track record (${(nicheWinRate * 100).toFixed(0)}%)`
    } else if (convictionMult < 0.5) {
      headline = 'Very low conviction - trader not confident'
    } else {
      headline = 'Unfavorable risk/reward'
    }
  } else {
    recommendation = 'TOXIC'
    headline = redFlags[0] || 'Multiple serious concerns identified'
  }
  
  return {
    score: Math.round(finalScore),
    recommendation,
    headline,
    factors,
    redFlags,
    greenFlags,
    priceMovement,
    insights,
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PolySignal({ data, loading, entryPrice, currentPrice, walletAddress, tradeSize, marketSubtype, serverRecommendation, serverScore }: PolySignalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [traderStats, setTraderStats] = useState<TraderStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  
  // Fetch trader stats when we have a wallet address
  useEffect(() => {
    if (!walletAddress) return
    
    const fetchStats = async () => {
      setStatsLoading(true)
      try {
        const response = await fetch(`/api/trader/stats?wallet=${encodeURIComponent(walletAddress.toLowerCase())}`)
        if (!response.ok) {
          console.error('[PolySignal] Failed to fetch trader stats:', response.status)
          return
        }
        
        const apiData = await response.json()
        const globalStats = apiData.global || null
        const profileStats = apiData.profiles || []
        
        // Helper to pick first finite number
        const pickNumber = (...values: Array<number | string | null | undefined>) => {
          for (const v of values) {
            const n = typeof v === 'string' ? Number(v) : v
            if (n !== null && n !== undefined && Number.isFinite(n)) return n
          }
          return null
        }
        
        // Extract global stats (prefer 30d, fallback to lifetime)
        const globalWinRate = pickNumber(
          globalStats?.d30_win_rate, globalStats?.l_win_rate
        )
        const globalRoiPct = pickNumber(
          globalStats?.d30_total_roi_pct, globalStats?.l_total_roi_pct
        )
        const globalTrades = pickNumber(
          globalStats?.d30_count, globalStats?.l_count
        ) ?? 0
        const avgBetSizeUsd = pickNumber(
          globalStats?.d30_avg_trade_size_usd, 
          globalStats?.l_avg_trade_size_usd,
          globalStats?.l_avg_pos_size_usd
        )
        const globalAvgPnl = pickNumber(
          globalStats?.d30_avg_pnl_trade_usd, globalStats?.l_avg_pnl_trade_usd
        )
        
        // Try to find and AGGREGATE all matching niche profiles (same as PredictionStats)
        // PRIORITY: Use marketSubtype prop (same source as PredictionStats) for consistency
        // Fallback to AI model's niche_name only if prop not provided
        const rawNiche = marketSubtype?.toUpperCase() || data?.analysis?.niche_name?.toUpperCase()
        
        // Normalize niche key same way as PredictionStats: trim, uppercase, replace spaces/hyphens with underscores
        const normalizeKey = (value: string | null | undefined) => {
          return (value || '')
            .toString()
            .trim()
            .toUpperCase()
            .replace(/[\s-]+/g, '_')
            .replace(/__+/g, '_')
        }
        const niche = normalizeKey(rawNiche)
        let usedNiche: string | null = null
        
        // Find ALL profiles matching the niche EXACTLY (same as PredictionStats level 3)
        // No loose matching - exact niche match only to prevent "NBA" matching "WNBA"
        const matchingProfiles = niche && profileStats.length > 0
          ? profileStats.filter((p: any) => {
              const profileNiche = normalizeKey(p.final_niche)
              return profileNiche === niche
            })
          : []
        
        // Aggregate all matching profiles (same logic as PredictionStats)
        let aggregatedStats: any = null
        if (matchingProfiles.length > 0) {
          const agg = matchingProfiles.reduce((acc: any, p: any) => {
            const count = pickNumber(p.d30_count, p.l_count, p.trade_count) ?? 0
            const winRate = pickNumber(p.d30_win_rate, p.l_win_rate) ?? 0.5
            const roiPct = pickNumber(p.d30_total_roi_pct, p.l_total_roi_pct) ?? 0
            const avgPnl = pickNumber(p.d30_avg_pnl_trade_usd, p.l_avg_pnl_trade_usd) ?? 0
            const avgTradeSize = pickNumber(p.d30_avg_trade_size_usd, p.l_avg_trade_size_usd) ?? 0
            
            acc.totalTrades += count
            acc.winWeighted += winRate * count
            acc.roiWeighted += roiPct * count
            acc.pnlWeighted += avgPnl * count
            acc.sizeWeighted += avgTradeSize * count
            return acc
          }, { totalTrades: 0, winWeighted: 0, roiWeighted: 0, pnlWeighted: 0, sizeWeighted: 0 })
          
          if (agg.totalTrades > 0) {
            aggregatedStats = {
              tradeCount: agg.totalTrades,
              winRate: agg.winWeighted / agg.totalTrades,
              roiPct: agg.roiWeighted / agg.totalTrades,
              avgPnl: agg.pnlWeighted / agg.totalTrades,
              avgTradeSize: agg.sizeWeighted / agg.totalTrades,
            }
            usedNiche = niche ?? null
          }
        }
        
        // Check if aggregated niche stats have enough trades to be reliable (min 10)
        const nicheTradeCount = aggregatedStats?.tradeCount ?? 0
        const MIN_RELIABLE_TRADES = 10
        const useNicheStats = aggregatedStats && nicheTradeCount >= MIN_RELIABLE_TRADES
        
        const profileWinRate = useNicheStats ? aggregatedStats.winRate : globalWinRate
        const profileRoiPct = useNicheStats ? aggregatedStats.roiPct : globalRoiPct
        const profileTrades = useNicheStats ? nicheTradeCount : globalTrades
        const profileAvgPnl = useNicheStats ? aggregatedStats.avgPnl : globalAvgPnl
        const profileAvgTradeSize = useNicheStats ? aggregatedStats.avgTradeSize : null
        
        console.log('[PolySignal] Fetched trader stats (aggregated):', {
          wallet: walletAddress.slice(0, 10),
          globalWinRate,
          profileWinRate,
          globalRoiPct,
          profileRoiPct,
          globalTrades,
          profileTrades,
          avgBetSizeUsd,
          profileAvgTradeSize,
          niche,
          matchingProfilesCount: matchingProfiles.length,
          useNicheStats,
        })
        
        setTraderStats({
          globalWinRate,
          profileWinRate,
          globalRoiPct,
          profileRoiPct,
          globalTrades,
          profileTrades,
          avgBetSizeUsd,
          profileAvgTradeSize,
          profileAvgPnl,
          globalAvgPnl,
        })
      } catch (err) {
        console.error('[PolySignal] Error fetching stats:', err)
      } finally {
        setStatsLoading(false)
      }
    }
    
    fetchStats()
  }, [walletAddress, marketSubtype, data?.analysis?.niche_name])
  
  const signal = useMemo(() => {
    if (!data) return null
    
    // Calculate signal from local data (includes price movement detection)
    const calculatedSignal = calculateSignal(data, entryPrice, currentPrice, traderStats, tradeSize, marketSubtype)
    
    // If server provided a recommendation (from fire feed), use it as base
    // BUT still apply critical overrides like price crashes
    if (serverRecommendation && serverScore !== undefined) {
      // Check for severe price movement that should override server recommendation
      const hasSeverePriceCrash = calculatedSignal.priceMovement?.isExtreme && 
                                   calculatedSignal.priceMovement?.direction === 'down'
      const hasMajorPriceDrop = calculatedSignal.priceMovement?.isMajor && 
                                 calculatedSignal.priceMovement?.direction === 'down'
      
      // If price crashed significantly, downgrade the recommendation
      if (hasSeverePriceCrash) {
        return {
          ...calculatedSignal,
          score: Math.min(serverScore, 40), // Cap score at 40 for extreme crash
          recommendation: 'AVOID' as const,
          headline: `Price crashed ${Math.abs(calculatedSignal.priceMovement!.percent).toFixed(0)}% - market moved against trade`,
        }
      }
      
      if (hasMajorPriceDrop && serverRecommendation !== 'AVOID' && serverRecommendation !== 'TOXIC') {
        return {
          ...calculatedSignal,
          score: Math.min(serverScore, 55), // Cap score for major drop
          recommendation: 'NEUTRAL' as const,
          headline: `Price dropped ${Math.abs(calculatedSignal.priceMovement!.percent).toFixed(0)}% since entry - proceed with caution`,
        }
      }
      
      // No severe price movement - use server values
      return {
        ...calculatedSignal,
        score: serverScore,
        recommendation: serverRecommendation,
        headline: calculatedSignal.headline,
      }
    }
    
    return calculatedSignal
  }, [data, entryPrice, currentPrice, traderStats, tradeSize, serverRecommendation, serverScore])
  
  // Loading state
  if (loading) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-100 border border-slate-200">
        <div className="w-5 h-5 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
        <span className="text-sm font-medium text-slate-600">Analyzing trade...</span>
      </div>
    )
  }
  
  // No data state
  if (!data || !signal) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
        <Brain className="w-5 h-5 text-slate-400" />
        <span className="text-sm text-slate-500">Analysis unavailable</span>
      </div>
    )
  }
  
  const config = RECOMMENDATION_CONFIG[signal.recommendation]
  const { insights, priceMovement } = signal
  
  return (
    <TooltipProvider>
      <div className="w-full">
        {/* Main Badge */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all",
            "hover:shadow-md active:scale-[0.99] cursor-pointer",
            config.bgColor,
            config.borderColor
          )}
        >
          {/* Score Circle */}
          <div className={cn(
            "flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center",
            "font-bold text-lg text-white shadow-sm",
            signal.recommendation === 'STRONG_BUY' && "bg-emerald-500",
            signal.recommendation === 'BUY' && "bg-green-500",
            signal.recommendation === 'NEUTRAL' && "bg-slate-500",
            signal.recommendation === 'AVOID' && "bg-amber-500",
            signal.recommendation === 'TOXIC' && "bg-red-500"
          )}>
            {signal.score}
          </div>
          
          {/* Recommendation + Headline */}
          <div className="flex-1 text-left min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-sm font-bold uppercase tracking-wide", config.textColor)}>
                {config.label}
              </span>
              {signal.greenFlags.length > 0 && (
                <span className="text-xs text-emerald-600 font-medium">✓{signal.greenFlags.length}</span>
              )}
              {signal.redFlags.length > 0 && (
                <span className="text-xs text-red-600 font-medium">⚠{signal.redFlags.length}</span>
              )}
              {priceMovement && (
                <span className={cn(
                  "text-xs font-medium px-1.5 py-0.5 rounded",
                  priceMovement.direction === 'down' 
                    ? "bg-red-100 text-red-700" 
                    : "bg-emerald-100 text-emerald-700"
                )}>
                  {priceMovement.direction === 'up' ? '↑' : '↓'}{Math.abs(priceMovement.percent).toFixed(0)}%
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">
              {signal.headline}
            </p>
          </div>
          
          {/* Expand */}
          <div className={cn("flex-shrink-0", config.textColor)}>
            {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </button>
        
        {/* Expanded Drawer */}
        {isOpen && (
          <div className="mt-2 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
            
            {/* Price Movement Alert (if significant) */}
            {priceMovement && priceMovement.isMajor && (
              <div className={cn(
                "px-4 py-2 flex items-center gap-2 text-sm",
                priceMovement.direction === 'down' 
                  ? "bg-red-50 text-red-800 border-b border-red-100" 
                  : "bg-emerald-50 text-emerald-800 border-b border-emerald-100"
              )}>
                {priceMovement.direction === 'down' ? (
                  <TrendingDown className="w-4 h-4" />
                ) : (
                  <TrendingUp className="w-4 h-4" />
                )}
                <span className="font-medium">
                  Price {priceMovement.direction === 'down' ? 'dropped' : 'increased'} {Math.abs(priceMovement.percent).toFixed(0)}% since entry
                </span>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-3.5 h-3.5 opacity-60" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs max-w-xs">{priceMovement.implication}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
            
            {/* Score Factors */}
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Score Breakdown
                </span>
                <span className="text-sm font-bold text-slate-900">{signal.score}/100</span>
              </div>
              
              <div className="space-y-3">
                {signal.factors.map((factor) => {
                  const Icon = factor.icon
                  return (
                    <div key={factor.name} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-xs font-semibold text-slate-700">{factor.name}</span>
                          <span className="text-[10px] text-slate-400">({factor.weight})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-xs font-medium",
                            factor.sentiment === 'positive' && "text-emerald-600",
                            factor.sentiment === 'negative' && "text-red-600",
                            factor.sentiment === 'neutral' && "text-slate-600"
                          )}>
                            {factor.label}
                          </span>
                          <span className={cn(
                            "text-xs font-bold w-8 text-right",
                            factor.value > 0 && "text-emerald-600",
                            factor.value < 0 && "text-red-600",
                            factor.value === 0 && "text-slate-500"
                          )}>
                            {factor.value > 0 ? '+' : ''}{factor.value.toFixed(0)}
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 pl-5">{factor.detail}</p>
                    </div>
                  )
                })}
              </div>
            </div>
            
            {/* Trader Insights Grid */}
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Trader Insights
                </span>
                {insights.niche && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                    {insights.niche}
                  </span>
                )}
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Trades Count */}
                <div className="text-center p-2 rounded-lg bg-slate-50">
                  <p className="text-[10px] text-slate-500 font-medium mb-0.5">Niche Trades</p>
                  <p className="text-sm font-bold text-slate-900">
                    {insights.profileTrades}
                  </p>
                  <p className="text-[9px] text-slate-400">
                    (All: {insights.globalTrades || 'N/A'})
                  </p>
                </div>
                
                {/* Win Rate */}
                <div className="text-center p-2 rounded-lg bg-slate-50">
                  <p className="text-[10px] text-slate-500 font-medium mb-0.5">Win Rate</p>
                  <p className={cn(
                    "text-sm font-bold",
                    (insights.profileWinRate ?? 0) >= 0.55 ? "text-emerald-600" :
                    (insights.profileWinRate ?? 0) < 0.48 ? "text-red-600" : "text-slate-900"
                  )}>
                    {insights.profileWinRate !== null 
                      ? `${(insights.profileWinRate * 100).toFixed(0)}%` 
                      : 'N/A'}
                  </p>
                  <p className="text-[9px] text-slate-400">
                    (All: {insights.globalWinRate !== null ? `${(insights.globalWinRate * 100).toFixed(0)}%` : 'N/A'})
                  </p>
                </div>
                
                {/* ROI */}
                <div className="text-center p-2 rounded-lg bg-slate-50">
                  <p className="text-[10px] text-slate-500 font-medium mb-0.5">Avg ROI</p>
                  <p className={cn(
                    "text-sm font-bold",
                    (insights.profileRoiPct ?? 0) > 0 ? "text-emerald-600" :
                    (insights.profileRoiPct ?? 0) < 0 ? "text-red-600" : "text-slate-900"
                  )}>
                    {insights.profileRoiPct !== null 
                      ? formatPercent(insights.profileRoiPct * 100)
                      : 'N/A'}
                  </p>
                  <p className="text-[9px] text-slate-400">
                    ({insights.profileAvgPnl !== null ? formatCurrency(insights.profileAvgPnl) : 'N/A'}/trade)
                  </p>
                </div>
                
                {/* Conviction */}
                <div className="text-center p-2 rounded-lg bg-slate-50">
                  <p className="text-[10px] text-slate-500 font-medium mb-0.5">Conviction</p>
                  <p className={cn(
                    "text-sm font-bold",
                    (insights.convictionMultiplier ?? 1) >= 1.5 ? "text-emerald-600" :
                    (insights.convictionMultiplier ?? 1) < 0.5 ? "text-red-600" : "text-slate-900"
                  )}>
                    {formatMultiplier(insights.convictionMultiplier)}
                  </p>
                  <p className="text-[9px] text-slate-400">
                    {insights.exposureUsd ? `$${insights.exposureUsd.toFixed(0)} exposure` : 'vs avg'}
                  </p>
                </div>
              </div>
              
              {/* Additional Insights Row */}
              <div className="grid grid-cols-3 gap-2 mt-2">
                {/* Momentum */}
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-slate-50">
                  <Activity className="w-3 h-3 text-slate-400" />
                  <div>
                    <p className="text-[9px] text-slate-500">Momentum</p>
                    <p className={cn(
                      "text-[11px] font-semibold",
                      insights.isHot ? "text-amber-600" : "text-slate-700"
                    )}>
                      {insights.isHot ? `🔥 ${insights.currentStreak} streak` : 'Normal'}
                    </p>
                  </div>
                </div>
                
                {/* AI Edge */}
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-slate-50">
                  <Brain className="w-3 h-3 text-slate-400" />
                  <div>
                    <p className="text-[9px] text-slate-500">AI Edge</p>
                    <p className={cn(
                      "text-[11px] font-semibold",
                      insights.aiEdgePct > 5 ? "text-emerald-600" :
                      insights.aiEdgePct < -5 ? "text-red-600" : "text-slate-700"
                    )}>
                      {insights.aiEdgePct >= 0 ? '+' : ''}{insights.aiEdgePct.toFixed(1)}%
                    </p>
                  </div>
                </div>
                
                {/* Timing */}
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-slate-50">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <div>
                    <p className="text-[9px] text-slate-500">Timing</p>
                    <p className="text-[11px] font-semibold text-slate-700 truncate">
                      {insights.timing || 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Flags */}
            {(signal.greenFlags.length > 0 || signal.redFlags.length > 0) && (
              <div className="px-4 py-3 border-b border-slate-100">
                {signal.greenFlags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {signal.greenFlags.map((flag, idx) => (
                      <span
                        key={`green-${idx}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
                      >
                        <CheckCircle className="w-2.5 h-2.5" />
                        {flag}
                      </span>
                    ))}
                  </div>
                )}
                {signal.redFlags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {signal.redFlags.map((flag, idx) => (
                      <span
                        key={`red-${idx}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700 border border-red-200"
                      >
                        <AlertTriangle className="w-2.5 h-2.5" />
                        {flag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* Footer */}
            <div className="px-4 py-2 bg-slate-50">
              <p className="text-[10px] text-slate-400 text-center">
                PolySignal v2 • Edge (50%) + Conviction (25%) + Skill (15%) + Context (10%)
              </p>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
