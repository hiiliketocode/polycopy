'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Target, Gem, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PolyScoreResponse } from '@/lib/polyscore/get-polyscore'

interface PolyPredictBadgeProps {
  data: PolyScoreResponse | null
  loading?: boolean
  niche?: string
}

// V10 features type (may be added to the response in the future)
interface V10Features {
  trade_size_tier?: string
  trader_sells_ratio?: number
  is_hedging?: boolean
  is_in_best_niche?: boolean
  trader_best_niche?: string
  is_with_crowd?: boolean
  market_age_bucket?: string
  niche_experience_pct?: number
  trader_selectivity?: number
  price_vs_trader_avg?: number
}

// Calculate Value Score (0-100) combining edge and signal strength
function calculateValueScore(data: PolyScoreResponse): {
  score: number
  label: string
  color: string
  bgColor: string
  borderColor: string
  edge: number
  signalScore: number
  signals: { label: string; value: number; icon: string; positive: boolean }[]
} {
  const { valuation, analysis, drawer } = data
  // Try to get v10_features from analysis.prediction_stats (future) or derive from drawer data
  const v10 = (analysis?.prediction_stats as any)?.v10_features as V10Features | undefined

  // Calculate edge component (0-50 points)
  // Positive edge = good, negative edge = bad
  const edgePct = valuation?.real_edge_pct ?? 0
  const edgeScore = Math.min(50, Math.max(0, 25 + (edgePct * 2.5))) // -10% edge = 0, 0% = 25, +10% = 50

  // Calculate signal component (0-50 points) from available data
  const signals: { label: string; value: number; icon: string; positive: boolean }[] = []
  let signalTotal = 25 // Start at neutral

  // Use V10 features if available
  if (v10) {
    // is_in_best_niche (+10 if true)
    if (v10.is_in_best_niche) {
      signals.push({ label: 'In their specialty', value: 10, icon: '🎯', positive: true })
      signalTotal += 10
    }

    // trade_size_tier (+8 for WHALE, +5 for LARGE)
    if (v10.trade_size_tier === 'WHALE') {
      signals.push({ label: 'Whale-size conviction', value: 8, icon: '🐋', positive: true })
      signalTotal += 8
    } else if (v10.trade_size_tier === 'LARGE') {
      signals.push({ label: 'Large conviction bet', value: 5, icon: '💪', positive: true })
      signalTotal += 5
    }

    // is_with_crowd (+7 if true)
    if (v10.is_with_crowd) {
      signals.push({ label: 'Following consensus', value: 7, icon: '📈', positive: true })
      signalTotal += 7
    } else if (v10.is_with_crowd === false) {
      signals.push({ label: 'Against the crowd', value: -3, icon: '🔄', positive: false })
      signalTotal -= 3
    }

    // trader_sells_ratio (low = good, they hold positions)
    if (v10.trader_sells_ratio !== undefined) {
      if (v10.trader_sells_ratio < 0.1) {
        signals.push({ label: 'Diamond hands (holds)', value: 5, icon: '💎', positive: true })
        signalTotal += 5
      } else if (v10.trader_sells_ratio > 0.4) {
        signals.push({ label: 'Frequent seller', value: -5, icon: '📉', positive: false })
        signalTotal -= 5
      }
    }

    // market_age_bucket (WEEK_1 or MONTH_1 is optimal)
    if (v10.market_age_bucket === 'WEEK_1' || v10.market_age_bucket === 'MONTH_1') {
      signals.push({ label: 'Good timing', value: 5, icon: '⏰', positive: true })
      signalTotal += 5
    } else if (v10.market_age_bucket === 'OLDER') {
      signals.push({ label: 'Late entry', value: -5, icon: '⚠️', positive: false })
      signalTotal -= 5
    }

    // is_hedging (negative signal - uncertainty)
    if (v10.is_hedging) {
      signals.push({ label: 'Hedging (both sides)', value: -8, icon: '⚖️', positive: false })
      signalTotal -= 8
    }
  } else {
    // Fallback: derive signals from existing drawer data
    // Check conviction from drawer
    if (drawer?.conviction) {
      if (drawer.conviction.is_outlier || drawer.conviction.z_score > 1.5) {
        signals.push({ label: 'High conviction', value: 8, icon: '💪', positive: true })
        signalTotal += 8
      }
    }

    // Check if hedged from tactical
    if (drawer?.tactical?.is_hedged) {
      signals.push({ label: 'Hedging (both sides)', value: -8, icon: '⚖️', positive: false })
      signalTotal -= 8
    }

    // Check competency (niche expertise)
    if (drawer?.competency) {
      if (drawer.competency.niche_win_rate > 60) {
        signals.push({ label: 'Niche expert', value: 10, icon: '🎯', positive: true })
        signalTotal += 10
      } else if (drawer.competency.niche_win_rate > 50) {
        signals.push({ label: 'Above average in niche', value: 5, icon: '📊', positive: true })
        signalTotal += 5
      } else if (drawer.competency.niche_win_rate < 45) {
        signals.push({ label: 'Weak in this niche', value: -5, icon: '⚠️', positive: false })
        signalTotal -= 5
      }
    }

    // Check momentum
    if (drawer?.momentum) {
      if (drawer.momentum.is_hot) {
        signals.push({ label: 'On a hot streak', value: 7, icon: '🔥', positive: true })
        signalTotal += 7
      }
    }
  }

  const signalScore = Math.min(50, Math.max(0, signalTotal))
  const totalScore = Math.round(edgeScore + signalScore)

  // Determine label and colors based on score
  let label: string
  let color: string
  let bgColor: string
  let borderColor: string

  if (edgePct < -5) {
    // Negative edge override - regardless of signals
    label = 'AVOID'
    color = 'text-red-700'
    bgColor = 'bg-red-50'
    borderColor = 'border-red-200'
  } else if (totalScore >= 75) {
    label = 'STRONG COPY'
    color = 'text-emerald-700'
    bgColor = 'bg-emerald-50'
    borderColor = 'border-emerald-200'
  } else if (totalScore >= 55) {
    label = 'COPY'
    color = 'text-green-700'
    bgColor = 'bg-green-50'
    borderColor = 'border-green-200'
  } else if (totalScore >= 40) {
    label = 'WATCH'
    color = 'text-amber-700'
    bgColor = 'bg-amber-50'
    borderColor = 'border-amber-200'
  } else {
    label = 'AVOID'
    color = 'text-red-700'
    bgColor = 'bg-red-50'
    borderColor = 'border-red-200'
  }

  return {
    score: totalScore,
    label,
    color,
    bgColor,
    borderColor,
    edge: edgePct,
    signalScore,
    signals,
  }
}

export function PolyPredictBadge({ data, loading, niche }: PolyPredictBadgeProps) {
  const [isOpen, setIsOpen] = useState(false)
  
  // Debug logging
  console.log('[PolyPredictBadge] Render:', { 
    loading, 
    hasData: !!data, 
    hasValuation: !!data?.valuation,
    polyscore: data?.polyscore,
    niche 
  })
  
  const valueAnalysis = useMemo(() => {
    if (!data) return null
    return calculateValueScore(data)
  }, [data])
  
  if (loading) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200">
        <div className="w-3 h-3 rounded-full bg-slate-300 animate-pulse" />
        <span className="text-xs font-medium text-slate-500">Analyzing...</span>
      </div>
    )
  }
  
  if (!data) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200">
        <Gem className="w-3 h-3 text-slate-400" />
        <span className="text-xs font-medium text-slate-400">Awaiting analysis...</span>
      </div>
    )
  }
  
  if (!valueAnalysis || !data.valuation) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200">
        <Gem className="w-3 h-3 text-amber-500" />
        <span className="text-xs font-medium text-amber-600">Valuation unavailable</span>
      </div>
    )
  }
  
  const { score, label, color, bgColor, borderColor, edge, signalScore, signals } = valueAnalysis
  const { valuation, polyscore } = data
  
  return (
    <div className="w-full">
      {/* Badge - Clickable */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all",
          bgColor,
          borderColor,
          "hover:shadow-sm cursor-pointer"
        )}
      >
        <Gem className={cn("w-3.5 h-3.5", color)} />
        <span className="text-xs font-medium text-slate-600">Value Score:</span>
        <span className={cn("text-xs font-bold uppercase tracking-wide", color)}>
          {label}
        </span>
        <span className={cn("text-sm font-semibold", color)}>
          {score}
        </span>
        {isOpen ? (
          <ChevronUp className={cn("w-3.5 h-3.5", color)} />
        ) : (
          <ChevronDown className={cn("w-3.5 h-3.5", color)} />
        )}
      </button>
      
      {/* Drawer - Expandable Analysis */}
      {isOpen && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">PolyPredict Analysis</h3>
            <p className="text-xs text-slate-500 mt-0.5">AI-powered trade assessment</p>
          </div>
          
          {/* Edge Section */}
          <div className="px-4 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2 mb-3">
              {edge >= 0 ? (
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-600" />
              )}
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Price Edge</span>
            </div>
            
            <div className="flex items-center justify-between mb-2">
              <div className="text-center">
                <p className="text-xs text-slate-500 mb-1">AI Fair Value</p>
                <p className="text-lg font-bold text-slate-900">
                  {(valuation.ai_fair_value * 100).toFixed(0)}¢
                </p>
              </div>
              <div className="flex-1 mx-4">
                <div className="flex items-center justify-center">
                  <div className="h-0.5 flex-1 bg-slate-200" />
                  <div className={cn(
                    "px-3 py-1 rounded-full text-xs font-bold",
                    edge >= 5 ? "bg-emerald-100 text-emerald-700" :
                    edge >= 0 ? "bg-green-50 text-green-700" :
                    edge >= -5 ? "bg-amber-50 text-amber-700" :
                    "bg-red-50 text-red-700"
                  )}>
                    {edge >= 0 ? '+' : ''}{edge.toFixed(1)}%
                  </div>
                  <div className="h-0.5 flex-1 bg-slate-200" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500 mb-1">Your Price</p>
                <p className="text-lg font-bold text-slate-900">
                  {(valuation.estimated_fill * 100).toFixed(0)}¢
                </p>
              </div>
            </div>
            
            <p className={cn(
              "text-xs text-center mt-2",
              edge >= 5 ? "text-emerald-600" :
              edge >= 0 ? "text-green-600" :
              edge >= -5 ? "text-amber-600" :
              "text-red-600"
            )}>
              {edge >= 5 ? "✅ Buying at a significant discount" :
               edge >= 0 ? "✅ Buying at fair value or better" :
               edge >= -5 ? "⚠️ Slightly overpaying" :
               "🚫 Significantly overpaying"}
            </p>
          </div>
          
          {/* Trader Signals Section */}
          <div className="px-4 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Trader Signals</span>
              <span className="ml-auto text-xs font-medium text-slate-500">
                Signal strength: {signalScore}/50
              </span>
            </div>
            
            {signals.length > 0 ? (
              <div className="space-y-2">
                {signals.map((signal, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-xs",
                      signal.positive ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    )}
                  >
                    <span>{signal.icon}</span>
                    <span className="font-medium flex-1">{signal.label}</span>
                    <span className="font-semibold">
                      {signal.value >= 0 ? '+' : ''}{signal.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No strong signals detected</p>
            )}
          </div>
          
          {/* Risk-Reward Assessment */}
          <div className="px-4 py-4 bg-slate-50">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-slate-600" />
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Copy Assessment</span>
            </div>
            
            {/* Visual Matrix */}
            <div className="relative h-24 bg-white rounded-lg border border-slate-200 mb-3 overflow-hidden">
              {/* Quadrant labels */}
              <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 text-[10px] text-slate-400">
                <div className="flex items-start justify-start p-2 border-r border-b border-slate-100">
                  <span>WATCH</span>
                </div>
                <div className="flex items-start justify-end p-2 border-b border-slate-100">
                  <span className="text-emerald-500 font-medium">STRONG COPY</span>
                </div>
                <div className="flex items-end justify-start p-2 border-r border-slate-100">
                  <span className="text-red-400">AVOID</span>
                </div>
                <div className="flex items-end justify-end p-2">
                  <span className="text-amber-500">CAUTION</span>
                </div>
              </div>
              
              {/* Axis labels */}
              <div className="absolute left-1/2 top-0 -translate-x-1/2 text-[9px] text-slate-400 px-1 bg-white">
                EDGE →
              </div>
              <div className="absolute left-0 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 px-1 bg-white -rotate-90 origin-center">
                SIGNAL →
              </div>
              
              {/* Position marker */}
              <div
                className="absolute w-4 h-4 rounded-full bg-indigo-500 border-2 border-white shadow-lg transform -translate-x-1/2 -translate-y-1/2 transition-all"
                style={{
                  left: `${Math.min(95, Math.max(5, 50 + (edge * 4)))}%`,
                  top: `${Math.min(95, Math.max(5, 100 - signalScore * 2))}%`,
                }}
              >
                <div className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-50" />
              </div>
            </div>
            
            {/* Final Verdict */}
            <div className={cn(
              "flex items-center justify-center gap-2 px-4 py-3 rounded-lg",
              bgColor,
              "border",
              borderColor
            )}>
              <span className={cn("text-sm font-bold", color)}>
                {label}
              </span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs text-slate-600">
                {label === 'STRONG COPY' && "Good value + strong signals"}
                {label === 'COPY' && "Acceptable value with decent signals"}
                {label === 'WATCH' && "Monitor for better entry"}
                {label === 'AVOID' && "Poor value or weak signals"}
              </span>
            </div>
          </div>
          
          {/* Model Info Footer */}
          <div className="px-4 py-2 bg-slate-100 border-t border-slate-200">
            <p className="text-[10px] text-slate-400 text-center">
              PolyPredict V10 • Win Prob: {polyscore}% • {niche || data.analysis?.niche_name || 'Unknown'} Market
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
