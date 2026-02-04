'use client'

import { useEffect, useState } from 'react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Zap, 
  Brain, 
  DollarSign,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Info
} from 'lucide-react'
import { PolyScoreResponse } from '@/lib/polyscore/get-polyscore'
import { cn } from '@/lib/utils'

interface PolyScoreDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: PolyScoreResponse | null
  isLoading?: boolean
  error?: string | null
}

export function PolyScoreDrawer({ 
  open, 
  onOpenChange, 
  data, 
  isLoading = false,
  error = null 
}: PolyScoreDrawerProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  const getVerdictConfig = () => {
    if (!data) return { color: 'gray', bgColor: 'bg-gray-100', borderColor: 'border-gray-200', icon: AlertCircle }
    
    const { verdict, verdict_color } = data.ui_presentation
    
    if (verdict_color === 'green') {
      return {
        color: 'text-emerald-700',
        bgColor: 'bg-emerald-50',
        borderColor: 'border-emerald-200',
        icon: CheckCircle2,
        gradient: 'from-emerald-500 to-emerald-600'
      }
    } else if (verdict_color === 'yellow') {
      return {
        color: 'text-amber-700',
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-200',
        icon: AlertCircle,
        gradient: 'from-amber-500 to-amber-600'
      }
    } else {
      return {
        color: 'text-red-700',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        icon: XCircle,
        gradient: 'from-red-500 to-red-600'
      }
    }
  }

  const verdictConfig = getVerdictConfig()
  const VerdictIcon = verdictConfig.icon

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600'
    if (score >= 60) return 'text-amber-600'
    return 'text-red-600'
  }

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-emerald-50'
    if (score >= 60) return 'bg-amber-50'
    return 'bg-red-50'
  }

  const getProgressColor = (score: number) => {
    if (score >= 80) return 'bg-emerald-500'
    if (score >= 60) return 'bg-amber-500'
    return 'bg-red-500'
  }

  return (
    <TooltipProvider>
      <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="border-b border-slate-200 pb-4">
            <DrawerTitle className="text-xl font-bold text-slate-900">
              PolyScore Analysis
            </DrawerTitle>
            <DrawerDescription className="text-sm text-slate-600">
              AI-powered trade intelligence
            </DrawerDescription>
          </DrawerHeader>

          <div className="overflow-y-auto px-4 py-6">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400 mb-4" />
              <p className="text-sm text-slate-600">Analyzing trade...</p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600" />
                <p className="text-sm font-medium text-red-900">Error</p>
              </div>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          )}

          {data && !isLoading && !error && (
            <div className="space-y-6">
              {/* Verdict Banner - Using new verdict structure */}
              {(() => {
                const verdict = data.verdict || {
                  label: data.ui_presentation.verdict.replace('_', ' '),
                  icon: '⚖️',
                  color: data.ui_presentation.verdict_color === 'green' ? '#10B981' : 
                         data.ui_presentation.verdict_color === 'yellow' ? '#F59E0B' : '#EF4444',
                  tooltip: data.ui_presentation.takeaway || data.ui_presentation.headline,
                  type: 'STANDARD'
                }
                const polyscore = data.polyscore || data.prediction.score_0_100
                
                return (
                  <div 
                    className="rounded-xl border-2 p-6"
                    style={{
                      borderColor: verdict.color,
                      backgroundColor: `${verdict.color}15`, // 15% opacity
                    }}
                  >
                    <div className="flex items-start gap-4">
                      <div 
                        className="rounded-full p-3 border-2"
                        style={{
                          borderColor: verdict.color,
                          backgroundColor: `${verdict.color}20`, // 20% opacity
                        }}
                      >
                        <span className="text-2xl">{verdict.icon}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge 
                            variant="outline" 
                            className="font-semibold text-sm px-3 py-1"
                            style={{
                              color: verdict.color,
                              borderColor: verdict.color,
                            }}
                          >
                            {verdict.label}
                          </Badge>
                          {polyscore !== undefined && (
                            <span 
                              className="text-2xl font-bold ml-auto"
                              style={{ color: verdict.color }}
                            >
                              {polyscore}
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 mb-2">
                          {data.ui_presentation.headline}
                        </h3>
                        {verdict.tooltip && (
                          <p className="text-sm text-slate-600 mb-3">{verdict.tooltip}</p>
                        )}
                        {data.ui_presentation.badges && data.ui_presentation.badges.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {data.ui_presentation.badges.map((badge, idx) => (
                              <Badge
                                key={idx}
                                variant="secondary"
                                className="text-xs font-medium"
                              >
                                <span className="mr-1">{badge.icon}</span>
                                {badge.label}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Score Gauge */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-slate-900">Confidence Score</h4>
                  <span className={cn('text-2xl font-bold', getScoreColor(data.prediction.score_0_100))}>
                    {data.prediction.score_0_100}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={cn(
                        "h-full transition-all",
                        getProgressColor(data.prediction.score_0_100)
                      )}
                      style={{ width: `${data.prediction.score_0_100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Low</span>
                    <span>High</span>
                  </div>
                </div>
              </div>

              {/* 5 Pillars from Drawer */}
              {data.drawer && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                  <h4 className="text-sm font-semibold text-slate-900 mb-4">Analysis Pillars</h4>
                  <div className="space-y-3">
                    {/* Valuation Pillar */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-slate-900">Valuation</span>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="h-3.5 w-3.5 text-slate-400" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs max-w-xs">{data.drawer.valuation.tooltip || 'Valuation analysis based on market price vs AI fair value'}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-600">{data.drawer.valuation.label || 'Edge'}</span>
                          <span className={cn(
                            'text-lg font-bold',
                            data.drawer.valuation.value?.startsWith('+') ? 'text-emerald-900' :
                            data.drawer.valuation.value?.includes('-') && !data.drawer.valuation.value?.startsWith('-') ? 'text-red-900' :
                            'text-slate-900'
                          )}>
                            {data.drawer.valuation.value || `${data.drawer.valuation.edge_percent > 0 ? '+' : ''}${data.drawer.valuation.edge_percent.toFixed(1)}%`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Competency Pillar */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-slate-900">Competency</span>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="h-3.5 w-3.5 text-slate-400" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs max-w-xs">{data.drawer.competency.tooltip || `Niche win rate: ${(data.drawer.competency.niche_win_rate * 100).toFixed(1)}%, Global: ${(data.drawer.competency.global_win_rate * 100).toFixed(1)}%`}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-600">{data.drawer.competency.label || 'Win Rate'}</span>
                          <span className="text-lg font-bold text-slate-900">
                            {data.drawer.competency.value || `${(data.drawer.competency.niche_win_rate * 100).toFixed(1)}%`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Momentum Pillar */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-slate-900">Momentum</span>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="h-3.5 w-3.5 text-slate-400" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs max-w-xs">{data.drawer.momentum.tooltip || `Recent win rate: ${(data.drawer.momentum.recent_win_rate * 100).toFixed(1)}%, Hot streak: ${data.drawer.momentum.current_streak}`}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-600">{data.drawer.momentum.label || 'Momentum'}</span>
                          <span className="text-lg font-bold text-slate-900">
                            {data.drawer.momentum.value || (data.drawer.momentum.is_hot ? 'Hot' : 'Normal')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Conviction Pillar */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-slate-900">Conviction</span>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="h-3.5 w-3.5 text-slate-400" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs max-w-xs">{data.drawer.conviction.tooltip}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-600">{data.drawer.conviction.label}</span>
                          <span className="text-lg font-bold text-slate-900">
                            {data.drawer.conviction.value}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Timing Pillar */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-slate-900">Timing</span>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="h-3.5 w-3.5 text-slate-400" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs max-w-xs">{data.drawer.timing?.tooltip || data.drawer.tactical?.timing || 'Timing analysis'}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-600">{data.drawer.timing?.label || 'Timing'}</span>
                          <span className="text-lg font-bold text-slate-900">
                            {data.drawer.timing?.value || data.drawer.tactical?.timing || 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Key Metrics Grid */}
              <div className="grid grid-cols-2 gap-4">
                {/* Probability */}
                <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-medium text-slate-600">Probability</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-900">
                    {(data.prediction.probability * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Model Confidence</p>
                </div>

                {/* Edge */}
                <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-emerald-50 to-green-50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-medium text-slate-600">Edge</span>
                  </div>
                  <p className={cn(
                    "text-2xl font-bold",
                    data.prediction.edge_percent >= 0 ? "text-emerald-900" : "text-red-900"
                  )}>
                    {data.prediction.edge_percent >= 0 ? '+' : ''}{data.prediction.edge_percent.toFixed(1)}%
                  </p>
                  <p className="text-xs text-slate-500 mt-1">ROI Potential</p>
                </div>
              </div>

              {/* Analysis Factors */}
              {data.analysis?.factors && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                  <h4 className="text-sm font-semibold text-slate-900 mb-4">Analysis Factors</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200">
                      <div className="flex items-center gap-2">
                        <Brain className={cn(
                          'h-4 w-4',
                          data.analysis.factors.is_smart_money ? 'text-emerald-600' : 'text-slate-400'
                        )} />
                        <span className="text-sm font-medium text-slate-900">Smart Money</span>
                      </div>
                      {data.analysis.factors.is_smart_money ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-slate-300" />
                      )}
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200">
                      <div className="flex items-center gap-2">
                        <DollarSign className={cn(
                          'h-4 w-4',
                          data.analysis.factors.is_value_bet ? 'text-emerald-600' : 'text-slate-400'
                        )} />
                        <span className="text-sm font-medium text-slate-900">Value Bet</span>
                      </div>
                      {data.analysis.factors.is_value_bet ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-slate-300" />
                      )}
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200">
                      <div className="flex items-center gap-2">
                        <Zap className={cn(
                          'h-4 w-4',
                          data.analysis.factors.is_heavy_bet ? 'text-emerald-600' : 'text-slate-400'
                        )} />
                        <span className="text-sm font-medium text-slate-900">Heavy Bet</span>
                      </div>
                      {data.analysis.factors.is_heavy_bet ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-slate-300" />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Debug Info (Collapsible) */}
              {data.analysis?.debug && (
                <details className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <summary className="text-xs font-medium text-slate-600 cursor-pointer">
                    Debug Information
                  </summary>
                  <div className="mt-3 space-y-2 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span>Z-Score:</span>
                      <span className="font-mono">{data.analysis.debug.z_score.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Niche:</span>
                      <span className="font-medium">{data.analysis.debug.niche}</span>
                    </div>
                  </div>
                </details>
              )}
            </div>
          )}
          </div>
        </DrawerContent>
      </Drawer>
    </TooltipProvider>
  )
}
