'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Target, User, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PolyScoreResponse } from '@/lib/polyscore/get-polyscore'

interface CopySignalProps {
  data: PolyScoreResponse | null
  loading?: boolean
  entryPrice?: number // The price the trader entered at
  currentPrice?: number // Current market price
}

type SignalLevel = 'COPY' | 'WATCH' | 'SKIP'

interface SignalAnalysis {
  signal: SignalLevel
  reason: string
  score: number // 0-100 for internal use
  factors: {
    value: { score: number; label: string; detail: string }
    skill: { score: number; label: string; detail: string }
    conviction: { score: number; label: string; detail: string }
  }
  warnings: string[]
}

/**
 * Calculate the copy signal using a proper scoring methodology
 * 
 * The score is NOT just win probability. It's a composite of:
 * 1. VALUE (40%): Is the current price below AI fair value?
 * 2. SKILL (40%): Does this trader have edge in this niche?
 * 3. CONVICTION (20%): Is this an above-average bet for them?
 */
function calculateSignal(
  data: PolyScoreResponse,
  entryPrice?: number,
  currentPrice?: number
): SignalAnalysis {
  const warnings: string[] = []
  
  // Extract key values
  const aiProb = data.valuation?.ai_fair_value ?? data.prediction?.probability ?? 0.5
  const spotPrice = currentPrice ?? data.valuation?.spot_price ?? entryPrice ?? aiProb
  const traderEntryPrice = entryPrice ?? data.valuation?.estimated_fill ?? spotPrice
  
  // Get trader stats
  const nicheWinRate = data.drawer?.competency?.niche_win_rate ?? 
                       data.analysis?.prediction_stats?.trader_win_rate ?? 0.5
  const globalWinRate = data.drawer?.competency?.global_win_rate ?? 0.5
  const totalTrades = data.drawer?.competency?.total_trades ?? 
                      data.analysis?.prediction_stats?.trade_count ?? 0
  
  // Get conviction data
  const zScore = data.drawer?.conviction?.z_score ?? 0
  const isOutlier = data.drawer?.conviction?.is_outlier ?? false
  const convictionMultiplier = data.analysis?.prediction_stats?.conviction_multiplier ?? 1
  
  // ============================================================================
  // FACTOR 1: VALUE (40% weight)
  // Is the current price below AI fair value?
  // ============================================================================
  
  // Simple edge calculation: AI thinks X%, price is Y%, edge = X - Y
  const trueEdge = (aiProb - spotPrice) * 100 // As percentage points
  
  // Value score: -20% edge = 0, 0% edge = 50, +20% edge = 100
  const valueScore = Math.max(0, Math.min(100, 50 + (trueEdge * 2.5)))
  
  let valueLabel: string
  let valueDetail: string
  
  if (trueEdge >= 10) {
    valueLabel = 'Great value'
    valueDetail = `${trueEdge.toFixed(0)}% below fair value`
  } else if (trueEdge >= 5) {
    valueLabel = 'Good value'
    valueDetail = `${trueEdge.toFixed(0)}% edge`
  } else if (trueEdge >= 0) {
    valueLabel = 'Fair price'
    valueDetail = 'Near AI fair value'
  } else if (trueEdge >= -5) {
    valueLabel = 'Slight premium'
    valueDetail = `${Math.abs(trueEdge).toFixed(0)}% above fair value`
  } else {
    valueLabel = 'Overpaying'
    valueDetail = `${Math.abs(trueEdge).toFixed(0)}% premium`
    warnings.push('Buying above AI fair value')
  }
  
  // ============================================================================
  // FACTOR 2: SKILL (40% weight)
  // Does this trader have demonstrated edge in this niche?
  // ============================================================================
  
  // Skill score based on niche win rate
  // 40% = 0, 50% = 50, 60% = 100
  const skillScore = Math.max(0, Math.min(100, (nicheWinRate - 0.4) * 500))
  
  let skillLabel: string
  let skillDetail: string
  
  if (totalTrades < 5) {
    skillLabel = 'Unproven'
    skillDetail = `Only ${totalTrades} trades`
    warnings.push('Low sample size')
  } else if (nicheWinRate >= 0.60) {
    skillLabel = 'Expert'
    skillDetail = `${(nicheWinRate * 100).toFixed(0)}% win rate`
  } else if (nicheWinRate >= 0.55) {
    skillLabel = 'Above average'
    skillDetail = `${(nicheWinRate * 100).toFixed(0)}% win rate`
  } else if (nicheWinRate >= 0.50) {
    skillLabel = 'Average'
    skillDetail = `${(nicheWinRate * 100).toFixed(0)}% win rate`
  } else {
    skillLabel = 'Below average'
    skillDetail = `${(nicheWinRate * 100).toFixed(0)}% win rate`
    warnings.push('Weak niche record')
  }
  
  // ============================================================================
  // FACTOR 3: CONVICTION (20% weight)
  // Is this an above-average bet for them?
  // ============================================================================
  
  // Conviction score based on z-score and multiplier
  // Normal (0x-1x) = 50, High (2x+) = 80, Outlier (3x+) = 100
  let convictionScore = 50
  if (isOutlier || zScore > 2) {
    convictionScore = 90
  } else if (zScore > 1 || convictionMultiplier > 1.5) {
    convictionScore = 70
  } else if (convictionMultiplier < 0.5) {
    convictionScore = 30
  }
  
  let convictionLabel: string
  let convictionDetail: string
  
  if (isOutlier || zScore > 2) {
    convictionLabel = 'High conviction'
    convictionDetail = `${convictionMultiplier?.toFixed(1) ?? '2+'}x normal size`
  } else if (zScore > 1 || convictionMultiplier > 1.5) {
    convictionLabel = 'Above normal'
    convictionDetail = `${convictionMultiplier?.toFixed(1) ?? '1.5'}x normal`
  } else if (convictionMultiplier < 0.5) {
    convictionLabel = 'Small bet'
    convictionDetail = `${convictionMultiplier?.toFixed(1) ?? '<0.5'}x normal`
  } else {
    convictionLabel = 'Normal size'
    convictionDetail = 'Typical bet size'
  }
  
  // ============================================================================
  // COMPOSITE SCORE & SIGNAL
  // ============================================================================
  
  // Weighted composite: Value (40%) + Skill (40%) + Conviction (20%)
  const compositeScore = Math.round(
    (valueScore * 0.4) + (skillScore * 0.4) + (convictionScore * 0.2)
  )
  
  // Check for red flags that override score
  const hasRedFlag = 
    trueEdge < -10 || // Severely overpaying
    (nicheWinRate < 0.45 && totalTrades >= 10) || // Proven loser
    data.drawer?.tactical?.is_hedged // Hedging (uncertain)
  
  // Determine signal level
  let signal: SignalLevel
  let reason: string
  
  if (hasRedFlag) {
    signal = 'SKIP'
    if (trueEdge < -10) {
      reason = `Overpaying by ${Math.abs(trueEdge).toFixed(0)}%`
    } else if (nicheWinRate < 0.45) {
      reason = `Weak track record (${(nicheWinRate * 100).toFixed(0)}% win rate)`
    } else {
      reason = 'Hedging detected - uncertain position'
    }
  } else if (compositeScore >= 65 && trueEdge >= 0 && nicheWinRate >= 0.50) {
    signal = 'COPY'
    if (trueEdge >= 5 && nicheWinRate >= 0.55) {
      reason = `${(nicheWinRate * 100).toFixed(0)}% niche expert, ${trueEdge.toFixed(0)}% edge`
    } else if (trueEdge >= 5) {
      reason = `Good value at ${trueEdge.toFixed(0)}% edge`
    } else if (nicheWinRate >= 0.55) {
      reason = `Strong ${(nicheWinRate * 100).toFixed(0)}% win rate in niche`
    } else {
      reason = 'Good overall profile'
    }
  } else if (compositeScore >= 40) {
    signal = 'WATCH'
    if (trueEdge < 0) {
      reason = 'Price slightly above fair value'
    } else if (totalTrades < 5) {
      reason = 'Limited track record'
    } else if (nicheWinRate < 0.55) {
      reason = 'Average trader, monitor for better entry'
    } else {
      reason = 'Mixed signals, proceed with caution'
    }
  } else {
    signal = 'SKIP'
    reason = 'Weak value and/or track record'
  }
  
  return {
    signal,
    reason,
    score: compositeScore,
    factors: {
      value: { score: valueScore, label: valueLabel, detail: valueDetail },
      skill: { score: skillScore, label: skillLabel, detail: skillDetail },
      conviction: { score: convictionScore, label: convictionLabel, detail: convictionDetail },
    },
    warnings,
  }
}

// Signal configuration
const SIGNAL_CONFIG = {
  COPY: {
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    icon: '✓',
    barColor: 'bg-emerald-500',
  },
  WATCH: {
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    icon: '◐',
    barColor: 'bg-amber-500',
  },
  SKIP: {
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: '✗',
    barColor: 'bg-red-500',
  },
}

export function CopySignal({ data, loading, entryPrice, currentPrice }: CopySignalProps) {
  const [isOpen, setIsOpen] = useState(false)
  
  const analysis = useMemo(() => {
    if (!data) return null
    return calculateSignal(data, entryPrice, currentPrice)
  }, [data, entryPrice, currentPrice])
  
  // Loading state
  if (loading) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200">
        <div className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" />
        <span className="text-xs font-medium text-slate-500">Analyzing...</span>
      </div>
    )
  }
  
  // No data state
  if (!data || !analysis) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
        <span className="text-xs font-medium text-slate-400">No signal</span>
      </div>
    )
  }
  
  const config = SIGNAL_CONFIG[analysis.signal]
  
  return (
    <div className="w-full">
      {/* Main Badge - Tappable */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 transition-all",
          config.bgColor,
          config.borderColor,
          "hover:shadow-md active:scale-[0.99] cursor-pointer"
        )}
      >
        {/* Signal indicator */}
        <div className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold",
          analysis.signal === 'COPY' && "bg-emerald-500 text-white",
          analysis.signal === 'WATCH' && "bg-amber-500 text-white",
          analysis.signal === 'SKIP' && "bg-red-500 text-white"
        )}>
          {config.icon}
        </div>
        
        {/* Signal text */}
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-bold uppercase tracking-wide", config.color)}>
              {analysis.signal}
            </span>
            {analysis.warnings.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                {analysis.warnings.length} warning{analysis.warnings.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">
            {analysis.reason}
          </p>
        </div>
        
        {/* Expand indicator */}
        <div className={cn("flex-shrink-0", config.color)}>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>
      
      {/* Expanded Drawer */}
      {isOpen && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Why {analysis.signal}?
            </p>
          </div>
          
          {/* 3 Factors */}
          <div className="p-4 space-y-4">
            {/* Value Factor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-900">Value</span>
                </div>
                <span className="text-sm font-semibold text-slate-700">
                  {analysis.factors.value.label}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all",
                      analysis.factors.value.score >= 60 ? "bg-emerald-500" :
                      analysis.factors.value.score >= 40 ? "bg-amber-500" : "bg-red-500"
                    )}
                    style={{ width: `${analysis.factors.value.score}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500 w-24 text-right">
                  {analysis.factors.value.detail}
                </span>
              </div>
            </div>
            
            {/* Skill Factor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-900">Skill</span>
                </div>
                <span className="text-sm font-semibold text-slate-700">
                  {analysis.factors.skill.label}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all",
                      analysis.factors.skill.score >= 60 ? "bg-emerald-500" :
                      analysis.factors.skill.score >= 40 ? "bg-amber-500" : "bg-red-500"
                    )}
                    style={{ width: `${analysis.factors.skill.score}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500 w-24 text-right">
                  {analysis.factors.skill.detail}
                </span>
              </div>
            </div>
            
            {/* Conviction Factor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-900">Conviction</span>
                </div>
                <span className="text-sm font-semibold text-slate-700">
                  {analysis.factors.conviction.label}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all",
                      analysis.factors.conviction.score >= 60 ? "bg-emerald-500" :
                      analysis.factors.conviction.score >= 40 ? "bg-amber-500" : "bg-red-500"
                    )}
                    style={{ width: `${analysis.factors.conviction.score}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500 w-24 text-right">
                  {analysis.factors.conviction.detail}
                </span>
              </div>
            </div>
          </div>
          
          {/* Warnings (if any) */}
          {analysis.warnings.length > 0 && (
            <div className="px-4 py-3 bg-amber-50 border-t border-amber-100">
              <p className="text-xs font-medium text-amber-800 mb-1">Warnings:</p>
              <ul className="text-xs text-amber-700 space-y-0.5">
                {analysis.warnings.map((warning, idx) => (
                  <li key={idx}>• {warning}</li>
                ))}
              </ul>
            </div>
          )}
          
          {/* AI Confidence Footer */}
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400">
                AI Win Prob: {((data.valuation?.ai_fair_value ?? data.prediction?.probability ?? 0.5) * 100).toFixed(0)}%
              </span>
              <span className="text-[10px] text-slate-400">
                Composite Score: {analysis.score}/100
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
