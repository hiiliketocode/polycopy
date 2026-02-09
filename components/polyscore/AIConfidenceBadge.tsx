'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, Brain, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PolyScoreResponse } from '@/lib/polyscore/get-polyscore'

interface AIConfidenceBadgeProps {
  data: PolyScoreResponse | null
  loading?: boolean
  entryPrice?: number
}

interface TraderContext {
  nicheWinRate: number | null
  globalWinRate: number | null
  totalTrades: number
  convictionMultiplier: number | null
  isHotStreak: boolean
  isHedging: boolean
  isLowSample: boolean
  niche: string | null
}

interface Alert {
  type: 'positive' | 'warning' | 'neutral'
  icon: string
  text: string
}

function extractContext(data: PolyScoreResponse): TraderContext {
  return {
    nicheWinRate: data.drawer?.competency?.niche_win_rate ?? 
                  data.analysis?.prediction_stats?.trader_win_rate ?? null,
    globalWinRate: data.drawer?.competency?.global_win_rate ?? null,
    totalTrades: data.drawer?.competency?.total_trades ?? 
                 data.analysis?.prediction_stats?.trade_count ?? 0,
    convictionMultiplier: data.analysis?.prediction_stats?.conviction_multiplier ?? null,
    isHotStreak: data.drawer?.momentum?.is_hot ?? false,
    isHedging: data.drawer?.tactical?.is_hedged ?? false,
    isLowSample: (data.drawer?.competency?.total_trades ?? 
                  data.analysis?.prediction_stats?.trade_count ?? 0) < 5,
    niche: data.analysis?.niche_name ?? null,
  }
}

function getAlerts(context: TraderContext, aiConfidence: number, entryPrice?: number): Alert[] {
  const alerts: Alert[] = []
  
  // Positive signals
  if (context.isHotStreak) {
    alerts.push({ type: 'positive', icon: '🔥', text: 'On a hot streak' })
  }
  
  if (context.convictionMultiplier && context.convictionMultiplier >= 2) {
    alerts.push({ type: 'positive', icon: '💪', text: `${context.convictionMultiplier.toFixed(1)}x normal bet size` })
  }
  
  if (context.nicheWinRate && context.nicheWinRate >= 0.60 && context.totalTrades >= 10) {
    alerts.push({ type: 'positive', icon: '🎯', text: 'Niche expert' })
  }
  
  // Warning signals
  if (context.isHedging) {
    alerts.push({ type: 'warning', icon: '⚖️', text: 'Hedging (bet both sides)' })
  }
  
  if (context.isLowSample) {
    alerts.push({ type: 'warning', icon: '📊', text: 'Limited track record' })
  }
  
  if (context.nicheWinRate && context.nicheWinRate < 0.45 && context.totalTrades >= 10) {
    alerts.push({ type: 'warning', icon: '📉', text: 'Below average in this niche' })
  }
  
  // Entry price comparison (if we have it and current AI estimate)
  if (entryPrice && aiConfidence) {
    const edge = (aiConfidence - entryPrice) * 100
    if (edge < -10) {
      alerts.push({ type: 'warning', icon: '💸', text: `Bought ${Math.abs(edge).toFixed(0)}% above AI estimate` })
    }
  }
  
  return alerts
}

export function AIConfidenceBadge({ data, loading, entryPrice }: AIConfidenceBadgeProps) {
  const [isOpen, setIsOpen] = useState(false)
  
  // Extract AI confidence (the main signal)
  const aiConfidence = useMemo(() => {
    if (!data) return null
    // AI win probability is the core output
    return data.valuation?.ai_fair_value ?? data.prediction?.probability ?? null
  }, [data])
  
  // Extract trader context
  const context = useMemo(() => {
    if (!data) return null
    return extractContext(data)
  }, [data])
  
  // Get alerts
  const alerts = useMemo(() => {
    if (!context || !aiConfidence) return []
    return getAlerts(context, aiConfidence, entryPrice)
  }, [context, aiConfidence, entryPrice])
  
  // Loading state
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 border border-slate-200">
        <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
        <span className="text-sm font-medium text-slate-500">Analyzing...</span>
      </div>
    )
  }
  
  // No data state
  if (!data || aiConfidence === null) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
        <Brain className="w-4 h-4 text-slate-400" />
        <span className="text-sm text-slate-400">Analysis unavailable</span>
      </div>
    )
  }
  
  // Determine confidence level for styling
  const confidencePercent = Math.round(aiConfidence * 100)
  const isHighConfidence = confidencePercent >= 65
  const isLowConfidence = confidencePercent <= 40
  
  // Calculate edge if we have entry price
  const edge = entryPrice ? (aiConfidence - entryPrice) * 100 : null
  const hasPositiveEdge = edge !== null && edge > 0
  
  // Positive and warning alerts
  const positiveAlerts = alerts.filter(a => a.type === 'positive')
  const warningAlerts = alerts.filter(a => a.type === 'warning')
  
  return (
    <div className="w-full">
      {/* Main Badge - Tappable */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all",
          "hover:shadow-md active:scale-[0.99] cursor-pointer",
          isHighConfidence 
            ? "bg-emerald-50 border-emerald-200" 
            : isLowConfidence 
              ? "bg-amber-50 border-amber-200"
              : "bg-slate-50 border-slate-200"
        )}
      >
        {/* AI Icon + Confidence */}
        <div className="flex items-center gap-3 flex-1">
          <div className={cn(
            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
            isHighConfidence 
              ? "bg-emerald-500" 
              : isLowConfidence 
                ? "bg-amber-500"
                : "bg-slate-500"
          )}>
            <Brain className="w-5 h-5 text-white" />
          </div>
          
          <div className="flex-1 text-left">
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-lg font-bold",
                isHighConfidence 
                  ? "text-emerald-700" 
                  : isLowConfidence 
                    ? "text-amber-700"
                    : "text-slate-700"
              )}>
                {confidencePercent}%
              </span>
              <span className="text-sm text-slate-500">AI confidence</span>
            </div>
            
            {/* Entry comparison if available */}
            {edge !== null && (
              <div className="flex items-center gap-1 mt-0.5">
                {hasPositiveEdge ? (
                  <TrendingUp className="w-3 h-3 text-emerald-600" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-red-500" />
                )}
                <span className={cn(
                  "text-xs font-medium",
                  hasPositiveEdge ? "text-emerald-600" : "text-red-500"
                )}>
                  {hasPositiveEdge ? '+' : ''}{edge.toFixed(0)}% vs entry price
                </span>
              </div>
            )}
          </div>
        </div>
        
        {/* Alert indicators */}
        {alerts.length > 0 && (
          <div className="flex items-center gap-1">
            {positiveAlerts.length > 0 && (
              <span className="text-sm">{positiveAlerts[0].icon}</span>
            )}
            {warningAlerts.length > 0 && (
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            )}
          </div>
        )}
        
        {/* Expand indicator */}
        <div className="text-slate-400">
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>
      
      {/* Expanded Details */}
      {isOpen && context && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* Confidence Bar */}
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>AI Win Probability</span>
              <span className="font-medium">{confidencePercent}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full rounded-full transition-all",
                  isHighConfidence 
                    ? "bg-emerald-500" 
                    : isLowConfidence 
                      ? "bg-amber-500"
                      : "bg-slate-400"
                )}
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              Based on trader history, market conditions, and bet characteristics
            </p>
          </div>
          
          {/* Trader Context */}
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
              Trader Context {context.niche && `(${context.niche})`}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-slate-500">Niche Win Rate</p>
                <p className={cn(
                  "text-sm font-semibold",
                  context.nicheWinRate && context.nicheWinRate >= 0.55 
                    ? "text-emerald-600" 
                    : context.nicheWinRate && context.nicheWinRate < 0.45
                      ? "text-red-500"
                      : "text-slate-700"
                )}>
                  {context.nicheWinRate 
                    ? `${(context.nicheWinRate * 100).toFixed(0)}%` 
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">Total Trades</p>
                <p className="text-sm font-semibold text-slate-700">
                  {context.totalTrades}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">Global Win Rate</p>
                <p className="text-sm font-semibold text-slate-700">
                  {context.globalWinRate 
                    ? `${(context.globalWinRate * 100).toFixed(0)}%` 
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">Bet Size</p>
                <p className={cn(
                  "text-sm font-semibold",
                  context.convictionMultiplier && context.convictionMultiplier >= 1.5
                    ? "text-emerald-600"
                    : "text-slate-700"
                )}>
                  {context.convictionMultiplier 
                    ? `${context.convictionMultiplier.toFixed(1)}x normal`
                    : 'Normal'}
                </p>
              </div>
            </div>
          </div>
          
          {/* Alerts */}
          {alerts.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                Signals
              </p>
              <div className="flex flex-wrap gap-2">
                {alerts.map((alert, idx) => (
                  <span
                    key={idx}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                      alert.type === 'positive' 
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : alert.type === 'warning'
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-slate-50 text-slate-600 border border-slate-200"
                    )}
                  >
                    <span>{alert.icon}</span>
                    <span>{alert.text}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* Footer explanation */}
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 text-center">
              AI confidence is the ML model's estimated win probability for this trade
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
