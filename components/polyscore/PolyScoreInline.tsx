'use client'

import { Badge } from '@/components/ui/badge'
import { 
  Loader2,
  ChevronUp,
  Info
} from 'lucide-react'
import { PolyScoreResponse } from '@/lib/polyscore/get-polyscore'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { PolyScoreDrawer } from './PolyScoreDrawer'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface PolyScoreInlineProps {
  data: PolyScoreResponse | null
  isLoading?: boolean
  error?: string | null
}

export function PolyScoreInline({ 
  data, 
  isLoading = false,
  error = null 
}: PolyScoreInlineProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Analyzing...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
        <p className="text-xs text-red-700">{error}</p>
      </div>
    )
  }

  if (!data) return null

  // Use new verdict structure if available, fallback to legacy
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
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setDrawerOpen(true)}
              className={cn(
                'mt-3 w-full rounded-lg border-2 px-3 py-2.5 transition-all hover:shadow-md',
                'flex items-center justify-between gap-2',
                'cursor-pointer'
              )}
              style={{
                borderColor: verdict.color,
                backgroundColor: `${verdict.color}15`, // 15% opacity
              }}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-lg" aria-hidden="true">{verdict.icon}</span>
                <div className="flex flex-col items-start min-w-0 flex-1">
                  <div className="flex items-center gap-2 w-full">
                    <Badge 
                      variant="outline"
                      className={cn(
                        'text-xs font-semibold px-2 py-0.5',
                        'border-current'
                      )}
                      style={{
                        color: verdict.color,
                        borderColor: verdict.color,
                      }}
                    >
                      {verdict.label}
                    </Badge>
                    {polyscore !== undefined && (
                      <span 
                        className="text-xs font-bold ml-auto"
                        style={{ color: verdict.color }}
                      >
                        {polyscore}
                      </span>
                    )}
                  </div>
                  {verdict.tooltip && (
                    <p className="text-xs text-slate-600 mt-0.5 line-clamp-1 text-left w-full">
                      {verdict.tooltip}
                    </p>
                  )}
                </div>
              </div>
              <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs">{verdict.tooltip}</p>
            <p className="text-xs text-slate-500 mt-1">Click for full analysis</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PolyScoreDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        data={data}
        isLoading={isLoading}
        error={error}
      />
    </>
  )
}
