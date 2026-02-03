'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { PolyScoreDrawer } from './PolyScoreDrawer'
import { getPolyScore, PolyScoreRequest, PolyScoreResponse } from '@/lib/polyscore/get-polyscore'
import { Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

interface GetPolyScoreButtonProps {
  request: PolyScoreRequest
  className?: string
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  children?: React.ReactNode
  accessToken?: string
}

// Helper function to ensure market exists in database
async function ensureMarketExists(
  conditionId: string,
  marketContext: PolyScoreRequest['market_context']
) {
  try {
    // Parse tags
    let tags: string[] | null = null;
    if (marketContext.market_tags) {
      if (typeof marketContext.market_tags === 'string') {
        try {
          tags = JSON.parse(marketContext.market_tags);
        } catch {
          tags = [marketContext.market_tags];
        }
      } else if (Array.isArray(marketContext.market_tags)) {
        tags = marketContext.market_tags;
      }
    }

    // Parse timestamps
    const startTimeUnix = marketContext.market_start_time_unix 
      ? Number(marketContext.market_start_time_unix)
      : null;
    const endTimeUnix = marketContext.market_end_time_unix
      ? Number(marketContext.market_end_time_unix)
      : null;
    
    const startTime = startTimeUnix ? new Date(startTimeUnix * 1000).toISOString() : null;
    const endTime = endTimeUnix ? new Date(endTimeUnix * 1000).toISOString() : null;
    const gameStartTime = marketContext.game_start_time || null;

    // Build market row - only include fields that exist in the table
    const marketRow: Record<string, any> = {
      condition_id: conditionId,
      title: marketContext.market_title || null,
      tags: tags,
      volume_total: marketContext.market_volume_total || null,
      volume_1_week: marketContext.market_volume_1_week || null,
      volume_1_month: marketContext.market_volume_1_month || null,
      start_time_unix: startTimeUnix,
      end_time_unix: endTimeUnix,
      bet_structure: marketContext.market_bet_structure || null,
      status: 'open',
      raw_dome: {},
      updated_at: new Date().toISOString(),
    };

    // Only add these if they have values to avoid triggering relationship lookups
    if (startTime) marketRow.start_time = startTime;
    if (endTime) marketRow.end_time = endTime;
    if (gameStartTime) {
      marketRow.game_start_time = gameStartTime;
      marketRow.game_start_time_raw = gameStartTime;
    }
    // Note: Skipping market_slug and event_slug entirely - no events table exists yet

    // Upsert market - catch and log errors but don't fail the whole flow
    const { error } = await supabase
      .from('markets')
      .upsert(marketRow, { 
        onConflict: 'condition_id',
        // Explicitly specify columns to avoid relationship resolution
        ignoreDuplicates: false
      });

    if (error) {
      console.warn('[ensureMarketExists] Failed to create market:', error);
      // Don't throw - market creation failure shouldn't block PolyScore
      return false;
    }

    return true;
  } catch (err) {
    console.warn('[ensureMarketExists] Error:', err);
    return false;
  }
}

// Note: Classification is now handled by predict-trade edge function

export function GetPolyScoreButton({
  request,
  className,
  variant = 'outline',
  size = 'default',
  children,
  accessToken,
}: GetPolyScoreButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [data, setData] = useState<PolyScoreResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [userAccessToken, setUserAccessToken] = useState<string | undefined>(accessToken)

  // Get user session token if not provided
  useEffect(() => {
    if (!accessToken) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.access_token) {
          setUserAccessToken(session.access_token)
        }
      })
    }
  }, [accessToken])

  const handleClick = async () => {
    setIsOpen(true)
    setIsLoading(true)
    setError(null)
    setData(null)

    try {
      // Get fresh session token if we don't have one
      let token = userAccessToken
      if (!token) {
        const { data: { session } } = await supabase.auth.getSession()
        token = session?.access_token
      }

      const conditionId = request.original_trade.condition_id
      const marketTitle = request.market_context.market_title || undefined
      const marketTags = request.market_context.market_tags 
        ? (typeof request.market_context.market_tags === 'string' 
            ? JSON.parse(request.market_context.market_tags) 
            : request.market_context.market_tags)
        : undefined
      const betStructure = request.market_context.market_bet_structure || undefined

      // Step 1: Ensure market exists in database (non-blocking)
      // If this fails, we continue anyway - edge function uses request body data
      ensureMarketExists(conditionId, request.market_context)
        .catch(err => {
          console.warn('[ensureMarketExists] Error (non-blocking):', err)
          // Continue anyway - edge function doesn't query DB anymore
        })

      // Step 2: Get PolyScore (predict-trade handles everything including classification)
      const response = await getPolyScore(request, token)
      setData(response)
    } catch (err: any) {
      // Check if it's an auth error and provide helpful message
      if (err?.message?.includes('401') || err?.message?.includes('Authentication failed')) {
        setError('Please log in to use PolyScore analysis')
      } else {
        setError(err?.message || 'Failed to fetch PolyScore')
      }
      console.error('PolyScore error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Button
        onClick={handleClick}
        variant={variant}
        size={size}
        className={cn('gap-2', className)}
      >
        {isLoading && isOpen ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            {children || 'Get PolyScore'}
          </>
        )}
      </Button>

      <PolyScoreDrawer
        open={isOpen}
        onOpenChange={setIsOpen}
        data={data}
        isLoading={isLoading}
        error={error}
      />
    </>
  )
}
