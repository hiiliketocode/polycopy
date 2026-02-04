'use client'

import { X, TrendingUp, Award, Target, DollarSign } from 'lucide-react'
import { PolyScoreResponse } from '@/lib/polyscore/get-polyscore'

interface PolyScoreResultsProps {
  data: PolyScoreResponse
  onClose: () => void
}

export function PolyScoreResults({ data, onClose }: PolyScoreResultsProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-emerald-50 border-emerald-200'
    if (score >= 60) return 'bg-yellow-50 border-yellow-200'
    return 'bg-red-50 border-red-200'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-2xl rounded-lg border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-xl font-semibold text-slate-900">PolyScore Analysis</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Main PolyScore */}
          <div className="text-center">
            <div className={`inline-flex items-center justify-center w-32 h-32 rounded-full border-4 ${getScoreBgColor(data.polyscore ?? 0)} border-slate-300`}>
              <span className={`text-4xl font-bold ${getScoreColor(data.polyscore ?? 0)}`}>
                {data.polyscore ?? 'N/A'}
              </span>
            </div>
            <p className="mt-4 text-sm text-slate-600">Overall PolyScore</p>
          </div>

          {/* Score Breakdown */}
          {data.drawer && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Competency Score (Alpha) */}
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="h-5 w-5 text-slate-600" />
                  <h3 className="font-medium text-slate-900">Competency</h3>
                </div>
                <p className={`text-2xl font-bold ${getScoreColor((data.drawer.competency.niche_win_rate * 100))}`}>
                  {Math.round(data.drawer.competency.niche_win_rate * 100)}
                </p>
                <p className="text-xs text-slate-500 mt-1">Niche Win Rate</p>
              </div>

              {/* Conviction Score */}
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-5 w-5 text-slate-600" />
                  <h3 className="font-medium text-slate-900">Conviction</h3>
                </div>
                <p className={`text-2xl font-bold ${getScoreColor(Math.abs(data.drawer.conviction.z_score) * 10)}`}>
                  {Math.round(Math.abs(data.drawer.conviction.z_score) * 10)}
                </p>
                <p className="text-xs text-slate-500 mt-1">Z-Score Based</p>
              </div>

              {/* Value Score */}
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-5 w-5 text-slate-600" />
                  <h3 className="font-medium text-slate-900">Edge</h3>
                </div>
                <p className={`text-2xl font-bold ${getScoreColor(data.drawer.valuation.edge_percent + 50)}`}>
                  {data.drawer.valuation.edge_percent > 0 ? '+' : ''}{data.drawer.valuation.edge_percent.toFixed(1)}%
                </p>
                <p className="text-xs text-slate-500 mt-1">Price Edge</p>
              </div>
            </div>
          )}

          {/* Deep Dive Section */}
          <div className="border-t border-slate-200 pt-6">
            <h3 className="font-semibold text-slate-900 mb-4">Deep Dive Insights</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">AI Profit Probability</span>
                <span className="font-medium text-slate-900">
                  {(data.prediction.probability * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">Edge Percentage</span>
                <span className="font-medium text-slate-900">
                  {data.prediction.edge_percent > 0 ? '+' : ''}{data.prediction.edge_percent.toFixed(1)}%
                </span>
              </div>
              {data.drawer && (
                <>
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-sm text-slate-600">Niche Win Rate</span>
                    <span className="font-medium text-slate-900">
                      {(data.drawer.competency.niche_win_rate * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-sm text-slate-600">Global Win Rate</span>
                    <span className="font-medium text-slate-900">
                      {(data.drawer.competency.global_win_rate * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-sm text-slate-600">Total Trades</span>
                    <span className="font-medium text-slate-900">{data.drawer.competency.total_trades}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-sm text-slate-600">Momentum</span>
                    <span className="font-medium text-slate-900">
                      {data.drawer.momentum.is_hot ? '🔥 Hot' : 'Normal'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-slate-600">Strategy</span>
                    <span className="font-medium text-slate-900">
                      {data.drawer.tactical.strategy_type || 'N/A'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 bg-slate-50">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
