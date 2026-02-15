# Copy Trading Improvements: Learning from MargaratDavis Bot

## Executive Summary

This document outlines specific, actionable improvements to Polycopy's copy trading system based on analysis of the most-starred Polymarket copy trading bot on GitHub. These improvements focus on **reliability, user experience, and intelligent position sizing** while maintaining Polycopy's advantages as a multi-user SaaS platform.

---

## 1. Health Check System

### Current State
- No pre-flight validation before users start copy trading
- Users discover connection issues only after attempting their first trade
- Errors are generic and don't provide actionable guidance

### Implementation Plan

#### 1.1 Create Health Check API Endpoint

**File:** `app/api/copy-trading/health-check/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedClobClientForUser } from '@/lib/polymarket/authed-client'

interface HealthCheckResult {
  healthy: boolean
  checks: {
    authentication: CheckResult
    walletConnection: CheckResult
    clobCredentials: CheckResult
    balance: CheckResult
    gasBalance: CheckResult
    apiConnectivity: CheckResult
  }
  recommendations: string[]
}

interface CheckResult {
  status: 'pass' | 'warning' | 'fail'
  message: string
  details?: any
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({
      healthy: false,
      error: 'Not authenticated'
    }, { status: 401 })
  }

  const result: HealthCheckResult = {
    healthy: true,
    checks: {
      authentication: { status: 'pass', message: 'User authenticated' },
      walletConnection: { status: 'fail', message: 'Not checked yet' },
      clobCredentials: { status: 'fail', message: 'Not checked yet' },
      balance: { status: 'fail', message: 'Not checked yet' },
      gasBalance: { status: 'fail', message: 'Not checked yet' },
      apiConnectivity: { status: 'fail', message: 'Not checked yet' },
    },
    recommendations: []
  }

  // Check 1: Wallet Connection
  try {
    const { data: credentials } = await supabase
      .from('clob_credentials')
      .select('polymarket_account_address')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!credentials?.polymarket_account_address) {
      result.checks.walletConnection = {
        status: 'fail',
        message: 'No wallet connected',
        details: { action: 'Connect your Polymarket wallet in Settings' }
      }
      result.healthy = false
      result.recommendations.push('Connect your Polymarket wallet to start copy trading')
    } else {
      result.checks.walletConnection = {
        status: 'pass',
        message: 'Wallet connected',
        details: { address: credentials.polymarket_account_address }
      }
    }
  } catch (error) {
    result.checks.walletConnection = {
      status: 'fail',
      message: 'Failed to check wallet connection'
    }
    result.healthy = false
  }

  // Check 2: CLOB Credentials
  if (result.checks.walletConnection.status === 'pass') {
    try {
      const { client } = await getAuthedClobClientForUser(user.id)
      result.checks.clobCredentials = {
        status: 'pass',
        message: 'CLOB client configured'
      }

      // Check 3: API Connectivity (test with simple getBook call)
      try {
        // Use a known popular market for testing
        const testTokenId = '21742633143463906290569050155826241533067272736897614950488156847949938836455'
        await client.getOrderBook(testTokenId)
        
        result.checks.apiConnectivity = {
          status: 'pass',
          message: 'Polymarket API accessible'
        }
      } catch (apiError: any) {
        result.checks.apiConnectivity = {
          status: 'fail',
          message: 'Cannot reach Polymarket API',
          details: { error: apiError.message }
        }
        result.healthy = false
        result.recommendations.push('Check your internet connection or try again later')
      }

      // Check 4: Check Balance
      try {
        const { data: credentials } = await supabase
          .from('clob_credentials')
          .select('polymarket_account_address')
          .eq('user_id', user.id)
          .maybeSingle()

        if (credentials?.polymarket_account_address) {
          const positionsUrl = `https://data-api.polymarket.com/positions?user=${credentials.polymarket_account_address}`
          const response = await fetch(positionsUrl, { cache: 'no-store' })
          const positions = await response.json()

          let totalValue = 0
          if (Array.isArray(positions)) {
            totalValue = positions.reduce((sum, pos) => sum + (pos.currentValue || 0), 0)
          }

          // Check USDC balance via balance API
          const balanceResponse = await fetch(
            `https://data-api.polymarket.com/balance?user=${credentials.polymarket_account_address}`,
            { cache: 'no-store' }
          )
          const balanceData = await balanceResponse.json()
          const usdcBalance = parseFloat(balanceData?.balance || '0')

          if (usdcBalance < 1) {
            result.checks.balance = {
              status: 'warning',
              message: 'Low balance',
              details: { balance: usdcBalance }
            }
            result.recommendations.push(`Add USDC to your wallet (current balance: $${usdcBalance.toFixed(2)})`)
          } else if (usdcBalance < 10) {
            result.checks.balance = {
              status: 'warning',
              message: 'Limited balance',
              details: { balance: usdcBalance }
            }
            result.recommendations.push(`Consider adding more USDC for better copy trading (current: $${usdcBalance.toFixed(2)})`)
          } else {
            result.checks.balance = {
              status: 'pass',
              message: 'Sufficient balance',
              details: { 
                usdcBalance: usdcBalance.toFixed(2),
                positionValue: totalValue.toFixed(2),
                total: (usdcBalance + totalValue).toFixed(2)
              }
            }
          }
        }
      } catch (balanceError) {
        result.checks.balance = {
          status: 'warning',
          message: 'Could not check balance'
        }
      }

      // Check 5: Gas Balance (POL/MATIC)
      // Note: This requires additional RPC call - implement if needed
      result.checks.gasBalance = {
        status: 'pass',
        message: 'Gas balance check not implemented'
      }

    } catch (clobError: any) {
      result.checks.clobCredentials = {
        status: 'fail',
        message: 'CLOB client configuration failed',
        details: { error: clobError.message }
      }
      result.healthy = false
      result.recommendations.push('Reconnect your wallet in Settings')
    }
  }

  return NextResponse.json(result)
}
```

#### 1.2 Health Check UI Component

**File:** `components/copy-trading/HealthCheckPanel.tsx`

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Check, X, AlertTriangle, Loader2 } from 'lucide-react'

interface HealthCheckPanelProps {
  onComplete?: (healthy: boolean) => void
}

export function HealthCheckPanel({ onComplete }: HealthCheckPanelProps) {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<any>(null)

  const runHealthCheck = async () => {
    setChecking(true)
    try {
      const response = await fetch('/api/copy-trading/health-check', {
        method: 'POST',
      })
      const data = await response.json()
      setResult(data)
      onComplete?.(data.healthy)
    } catch (error) {
      console.error('Health check failed:', error)
    } finally {
      setChecking(false)
    }
  }

  const getStatusIcon = (status: 'pass' | 'warning' | 'fail') => {
    switch (status) {
      case 'pass':
        return <Check className="w-5 h-5 text-green-600" />
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />
      case 'fail':
        return <X className="w-5 h-5 text-red-600" />
    }
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Copy Trading Health Check</h3>
      
      {!result && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Run a quick health check to verify your copy trading setup is ready.
          </p>
          <Button onClick={runHealthCheck} disabled={checking}>
            {checking && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {checking ? 'Checking...' : 'Run Health Check'}
          </Button>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            {result.healthy ? (
              <>
                <Check className="w-6 h-6 text-green-600" />
                <span className="font-semibold text-green-600">All Systems Operational</span>
              </>
            ) : (
              <>
                <X className="w-6 h-6 text-red-600" />
                <span className="font-semibold text-red-600">Issues Detected</span>
              </>
            )}
          </div>

          <div className="space-y-2">
            {Object.entries(result.checks).map(([key, check]: [string, any]) => (
              <div key={key} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  {getStatusIcon(check.status)}
                  <div>
                    <div className="font-medium text-sm capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </div>
                    <div className="text-xs text-slate-600">{check.message}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {result.recommendations && result.recommendations.length > 0 && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="font-semibold text-sm text-yellow-800 mb-2">Recommendations:</h4>
              <ul className="space-y-1">
                {result.recommendations.map((rec: string, idx: number) => (
                  <li key={idx} className="text-sm text-yellow-700">• {rec}</li>
                ))}
              </ul>
            </div>
          )}

          <Button onClick={runHealthCheck} variant="outline" size="sm">
            Run Check Again
          </Button>
        </div>
      )}
    </Card>
  )
}
```

---

## 2. Intelligent Position Sizing System

### Current State
- No configurable position sizing strategy
- Users copy trades at fixed sizes without adjustment based on their capital
- No tiered multipliers or adaptive sizing
- No position limits or risk management

### Implementation Plan

#### 2.1 Database Schema for Position Sizing Configuration

**File:** `supabase/migrations/20260215_add_position_sizing_config.sql`

```sql
-- Position sizing configuration per user
CREATE TABLE IF NOT EXISTS public.copy_trading_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Strategy type
  strategy text NOT NULL DEFAULT 'percentage' CHECK (strategy IN ('percentage', 'fixed', 'adaptive')),
  
  -- Main parameter (meaning depends on strategy)
  copy_size numeric NOT NULL DEFAULT 10.0 CHECK (copy_size > 0),
  
  -- Adaptive strategy parameters
  adaptive_min_percent numeric CHECK (adaptive_min_percent > 0),
  adaptive_max_percent numeric CHECK (adaptive_max_percent > 0),
  adaptive_threshold_usd numeric CHECK (adaptive_threshold_usd > 0),
  
  -- Tiered multipliers (JSONB array)
  -- Example: [{"min": 0, "max": 50, "multiplier": 0.5}, {"min": 50, "max": 200, "multiplier": 1.0}]
  tiered_multipliers jsonb,
  
  -- Single multiplier (fallback if no tiers)
  trade_multiplier numeric DEFAULT 1.0 CHECK (trade_multiplier > 0),
  
  -- Risk limits
  max_order_size_usd numeric NOT NULL DEFAULT 100.0 CHECK (max_order_size_usd > 0),
  min_order_size_usd numeric NOT NULL DEFAULT 1.0 CHECK (min_order_size_usd > 0),
  max_position_size_usd numeric CHECK (max_position_size_usd IS NULL OR max_position_size_usd > 0),
  max_daily_volume_usd numeric CHECK (max_daily_volume_usd IS NULL OR max_daily_volume_usd > 0),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.copy_trading_config ENABLE ROW LEVEL SECURITY;

-- Users can only see/edit their own config
CREATE POLICY "Users can view their own config"
  ON public.copy_trading_config
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own config"
  ON public.copy_trading_config
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own config"
  ON public.copy_trading_config
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Function to get or create default config
CREATE OR REPLACE FUNCTION public.get_copy_trading_config(p_user_id uuid)
RETURNS public.copy_trading_config
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config public.copy_trading_config;
BEGIN
  -- Try to get existing config
  SELECT * INTO v_config
  FROM public.copy_trading_config
  WHERE user_id = p_user_id;
  
  -- If no config exists, create default
  IF NOT FOUND THEN
    INSERT INTO public.copy_trading_config (user_id)
    VALUES (p_user_id)
    RETURNING * INTO v_config;
  END IF;
  
  RETURN v_config;
END;
$$;

-- Track daily volume for risk management
CREATE TABLE IF NOT EXISTS public.copy_trading_daily_volume (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_date date NOT NULL DEFAULT CURRENT_DATE,
  total_volume_usd numeric NOT NULL DEFAULT 0,
  trade_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, trade_date)
);

ALTER TABLE public.copy_trading_daily_volume ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own volume"
  ON public.copy_trading_daily_volume
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
```

#### 2.2 Position Sizing Library

**File:** `lib/copy-trading/position-sizing.ts`

```typescript
export enum CopyStrategy {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
  ADAPTIVE = 'adaptive',
}

export interface MultiplierTier {
  min: number
  max: number | null
  multiplier: number
}

export interface CopyTradingConfig {
  strategy: CopyStrategy
  copySize: number
  adaptiveMinPercent?: number
  adaptiveMaxPercent?: number
  adaptiveThresholdUsd?: number
  tieredMultipliers?: MultiplierTier[]
  tradeMultiplier?: number
  maxOrderSizeUsd: number
  minOrderSizeUsd: number
  maxPositionSizeUsd?: number
  maxDailyVolumeUsd?: number
}

export interface OrderSizeCalculation {
  traderOrderSize: number
  baseAmount: number
  finalAmount: number
  strategy: CopyStrategy
  multiplier: number
  cappedByMax: boolean
  reducedByBalance: boolean
  reducedByPosition: boolean
  reducedByDailyVolume: boolean
  belowMinimum: boolean
  reasoning: string
}

/**
 * Calculate order size based on copy strategy
 */
export function calculateOrderSize(
  config: CopyTradingConfig,
  traderOrderSize: number,
  availableBalance: number,
  currentPositionValue: number = 0,
  todayVolume: number = 0
): OrderSizeCalculation {
  let baseAmount: number
  let reasoning: string

  // Step 1: Calculate base amount based on strategy
  switch (config.strategy) {
    case CopyStrategy.PERCENTAGE:
      baseAmount = traderOrderSize * (config.copySize / 100)
      reasoning = `${config.copySize}% of trader's $${traderOrderSize.toFixed(2)} = $${baseAmount.toFixed(2)}`
      break

    case CopyStrategy.FIXED:
      baseAmount = config.copySize
      reasoning = `Fixed amount: $${baseAmount.toFixed(2)}`
      break

    case CopyStrategy.ADAPTIVE:
      const adaptivePercent = calculateAdaptivePercent(config, traderOrderSize)
      baseAmount = traderOrderSize * (adaptivePercent / 100)
      reasoning = `Adaptive ${adaptivePercent.toFixed(1)}% of trader's $${traderOrderSize.toFixed(2)} = $${baseAmount.toFixed(2)}`
      break

    default:
      throw new Error(`Unknown strategy: ${config.strategy}`)
  }

  // Step 2: Apply multiplier
  const multiplier = getTradeMultiplier(config, traderOrderSize)
  let finalAmount = baseAmount * multiplier

  if (multiplier !== 1.0) {
    reasoning += ` × ${multiplier}x multiplier = $${finalAmount.toFixed(2)}`
  }

  let cappedByMax = false
  let reducedByBalance = false
  let reducedByPosition = false
  let reducedByDailyVolume = false
  let belowMinimum = false

  // Step 3: Apply max order size
  if (finalAmount > config.maxOrderSizeUsd) {
    finalAmount = config.maxOrderSizeUsd
    cappedByMax = true
    reasoning += ` → Capped at max $${config.maxOrderSizeUsd}`
  }

  // Step 4: Apply max position size
  if (config.maxPositionSizeUsd) {
    const newTotalPosition = currentPositionValue + finalAmount
    if (newTotalPosition > config.maxPositionSizeUsd) {
      const allowedAmount = Math.max(0, config.maxPositionSizeUsd - currentPositionValue)
      if (allowedAmount < config.minOrderSizeUsd) {
        finalAmount = 0
        reducedByPosition = true
        reasoning += ` → Position limit reached ($${config.maxPositionSizeUsd} max)`
      } else {
        finalAmount = allowedAmount
        reducedByPosition = true
        reasoning += ` → Reduced to $${allowedAmount.toFixed(2)} (position limit)`
      }
    }
  }

  // Step 5: Apply daily volume limit
  if (finalAmount > 0 && config.maxDailyVolumeUsd) {
    const newDailyVolume = todayVolume + finalAmount
    if (newDailyVolume > config.maxDailyVolumeUsd) {
      const allowedAmount = Math.max(0, config.maxDailyVolumeUsd - todayVolume)
      if (allowedAmount < config.minOrderSizeUsd) {
        finalAmount = 0
        reducedByDailyVolume = true
        reasoning += ` → Daily volume limit reached ($${config.maxDailyVolumeUsd} max)`
      } else {
        finalAmount = allowedAmount
        reducedByDailyVolume = true
        reasoning += ` → Reduced to $${allowedAmount.toFixed(2)} (daily volume limit)`
      }
    }
  }

  // Step 6: Check balance (with 1% safety buffer)
  if (finalAmount > 0) {
    const maxAffordable = availableBalance * 0.99
    if (finalAmount > maxAffordable) {
      finalAmount = Math.max(0, maxAffordable)
      reducedByBalance = true
      reasoning += ` → Reduced to $${finalAmount.toFixed(2)} (available balance)`
    }
  }

  // Step 7: Check minimum
  if (finalAmount < config.minOrderSizeUsd && finalAmount > 0) {
    belowMinimum = true
    reasoning += ` → Below minimum $${config.minOrderSizeUsd}`
    finalAmount = 0
  }

  return {
    traderOrderSize,
    baseAmount,
    finalAmount,
    strategy: config.strategy,
    multiplier,
    cappedByMax,
    reducedByBalance,
    reducedByPosition,
    reducedByDailyVolume,
    belowMinimum,
    reasoning,
  }
}

/**
 * Calculate adaptive percentage based on trader's order size
 */
function calculateAdaptivePercent(config: CopyTradingConfig, traderOrderSize: number): number {
  const minPercent = config.adaptiveMinPercent ?? config.copySize
  const maxPercent = config.adaptiveMaxPercent ?? config.copySize
  const threshold = config.adaptiveThresholdUsd ?? 500

  if (traderOrderSize >= threshold) {
    // Large order: scale down to minPercent
    const factor = Math.min(1, (traderOrderSize / threshold - 1) / 2)
    return lerp(config.copySize, minPercent, factor)
  } else {
    // Small order: scale up to maxPercent
    const factor = traderOrderSize / threshold
    return lerp(maxPercent, config.copySize, factor)
  }
}

/**
 * Linear interpolation
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

/**
 * Get multiplier for trade size
 */
export function getTradeMultiplier(config: CopyTradingConfig, traderOrderSize: number): number {
  // Use tiered multipliers if configured
  if (config.tieredMultipliers && config.tieredMultipliers.length > 0) {
    for (const tier of config.tieredMultipliers) {
      if (traderOrderSize >= tier.min) {
        if (tier.max === null || traderOrderSize < tier.max) {
          return tier.multiplier
        }
      }
    }
    // Fallback to last tier
    return config.tieredMultipliers[config.tieredMultipliers.length - 1].multiplier
  }

  // Use single multiplier if configured
  return config.tradeMultiplier ?? 1.0
}

/**
 * Parse tiered multipliers from user input
 */
export function parseTieredMultipliers(tiersString: string): MultiplierTier[] {
  const tiers: MultiplierTier[] = []
  const tierDefs = tiersString.split(',').map(t => t.trim()).filter(t => t)

  for (const tierDef of tierDefs) {
    const parts = tierDef.split(':')
    if (parts.length !== 2) {
      throw new Error(`Invalid tier format: "${tierDef}"`)
    }

    const [range, multiplierStr] = parts
    const multiplier = parseFloat(multiplierStr)

    if (isNaN(multiplier) || multiplier < 0) {
      throw new Error(`Invalid multiplier: ${multiplierStr}`)
    }

    if (range.endsWith('+')) {
      const min = parseFloat(range.slice(0, -1))
      if (isNaN(min) || min < 0) {
        throw new Error(`Invalid min value: ${range}`)
      }
      tiers.push({ min, max: null, multiplier })
    } else if (range.includes('-')) {
      const [minStr, maxStr] = range.split('-')
      const min = parseFloat(minStr)
      const max = parseFloat(maxStr)
      if (isNaN(min) || min < 0 || isNaN(max) || max <= min) {
        throw new Error(`Invalid range: ${range}`)
      }
      tiers.push({ min, max, multiplier })
    } else {
      throw new Error(`Invalid range format: ${range}`)
    }
  }

  // Sort by min
  tiers.sort((a, b) => a.min - b.min)

  return tiers
}

/**
 * Get recommended config based on balance
 */
export function getRecommendedConfig(balanceUsd: number): CopyTradingConfig {
  if (balanceUsd < 500) {
    return {
      strategy: CopyStrategy.PERCENTAGE,
      copySize: 5.0,
      maxOrderSizeUsd: 20.0,
      minOrderSizeUsd: 1.0,
      maxPositionSizeUsd: 50.0,
      maxDailyVolumeUsd: 100.0,
    }
  } else if (balanceUsd < 2000) {
    return {
      strategy: CopyStrategy.PERCENTAGE,
      copySize: 10.0,
      maxOrderSizeUsd: 50.0,
      minOrderSizeUsd: 1.0,
      maxPositionSizeUsd: 200.0,
      maxDailyVolumeUsd: 500.0,
    }
  } else {
    return {
      strategy: CopyStrategy.ADAPTIVE,
      copySize: 10.0,
      adaptiveMinPercent: 5.0,
      adaptiveMaxPercent: 15.0,
      adaptiveThresholdUsd: 300.0,
      maxOrderSizeUsd: 100.0,
      minOrderSizeUsd: 1.0,
      maxPositionSizeUsd: 1000.0,
      maxDailyVolumeUsd: 2000.0,
    }
  }
}
```

#### 2.3 Integrate Position Sizing into Order Placement

**File:** `lib/copy-trading/apply-position-sizing.ts`

```typescript
import { SupabaseClient } from '@supabase/supabase-js'
import { calculateOrderSize, CopyTradingConfig } from './position-sizing'

/**
 * Get user's copy trading config and calculate order size
 */
export async function calculateCopyOrderSize(
  supabase: SupabaseClient,
  userId: string,
  traderOrderSize: number,
  marketId: string,
  outcome: string
): Promise<{
  finalAmount: number
  reasoning: string
  config: CopyTradingConfig
  calculation: ReturnType<typeof calculateOrderSize>
}> {
  // Get user's config
  const { data: config, error } = await supabase
    .rpc('get_copy_trading_config', { p_user_id: userId })
    .single()

  if (error) {
    throw new Error(`Failed to get copy trading config: ${error.message}`)
  }

  // Get user's balance
  const { data: credentials } = await supabase
    .from('clob_credentials')
    .select('polymarket_account_address')
    .eq('user_id', userId)
    .maybeSingle()

  let availableBalance = 0
  if (credentials?.polymarket_account_address) {
    const balanceResponse = await fetch(
      `https://data-api.polymarket.com/balance?user=${credentials.polymarket_account_address}`,
      { cache: 'no-store' }
    )
    const balanceData = await balanceResponse.json()
    availableBalance = parseFloat(balanceData?.balance || '0')
  }

  // Get current position size for this market/outcome
  let currentPositionValue = 0
  if (credentials?.polymarket_account_address) {
    const positionsUrl = `https://data-api.polymarket.com/positions?user=${credentials.polymarket_account_address}`
    const positionsResponse = await fetch(positionsUrl, { cache: 'no-store' })
    const positions = await positionsResponse.json()

    if (Array.isArray(positions)) {
      const matchingPosition = positions.find(
        p => p.conditionId === marketId && p.outcome?.toUpperCase() === outcome.toUpperCase()
      )
      if (matchingPosition) {
        currentPositionValue = matchingPosition.currentValue || 0
      }
    }
  }

  // Get today's volume
  const { data: volumeData } = await supabase
    .from('copy_trading_daily_volume')
    .select('total_volume_usd')
    .eq('user_id', userId)
    .eq('trade_date', new Date().toISOString().split('T')[0])
    .maybeSingle()

  const todayVolume = volumeData?.total_volume_usd || 0

  // Calculate order size
  const calculation = calculateOrderSize(
    config as CopyTradingConfig,
    traderOrderSize,
    availableBalance,
    currentPositionValue,
    todayVolume
  )

  return {
    finalAmount: calculation.finalAmount,
    reasoning: calculation.reasoning,
    config: config as CopyTradingConfig,
    calculation,
  }
}

/**
 * Update daily volume after successful order
 */
export async function updateDailyVolume(
  supabase: SupabaseClient,
  userId: string,
  orderSize: number
): Promise<void> {
  const today = new Date().toISOString().split('T')[0]

  await supabase.rpc('increment_daily_volume', {
    p_user_id: userId,
    p_trade_date: today,
    p_volume_usd: orderSize,
  })
}
```

**Add SQL function:**

```sql
-- Function to increment daily volume atomically
CREATE OR REPLACE FUNCTION public.increment_daily_volume(
  p_user_id uuid,
  p_trade_date date,
  p_volume_usd numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.copy_trading_daily_volume (user_id, trade_date, total_volume_usd, trade_count)
  VALUES (p_user_id, p_trade_date, p_volume_usd, 1)
  ON CONFLICT (user_id, trade_date)
  DO UPDATE SET
    total_volume_usd = copy_trading_daily_volume.total_volume_usd + p_volume_usd,
    trade_count = copy_trading_daily_volume.trade_count + 1,
    updated_at = now();
END;
$$;
```

#### 2.4 Settings UI for Position Sizing

**File:** `components/copy-trading/PositionSizingSettings.tsx`

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Info } from 'lucide-react'

export function PositionSizingSettings() {
  const [strategy, setStrategy] = useState('percentage')
  const [copySize, setCopySize] = useState(10)
  const [maxOrderSize, setMaxOrderSize] = useState(100)
  const [tieredMultipliers, setTieredMultipliers] = useState('')
  const [maxPositionSize, setMaxPositionSize] = useState<number | null>(null)
  const [maxDailyVolume, setMaxDailyVolume] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  // ... load and save logic

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Position Sizing Strategy</h3>

      <div className="space-y-6">
        {/* Strategy Selection */}
        <div>
          <Label>Strategy Type</Label>
          <RadioGroup value={strategy} onValueChange={setStrategy} className="mt-2">
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="percentage" id="percentage" />
              <Label htmlFor="percentage" className="cursor-pointer">
                Percentage - Copy a fixed % of trader's order
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="fixed" id="fixed" />
              <Label htmlFor="fixed" className="cursor-pointer">
                Fixed USD - Copy the same dollar amount every time
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="adaptive" id="adaptive" />
              <Label htmlFor="adaptive" className="cursor-pointer">
                Adaptive - Adjust % based on trade size
                <Badge variant="secondary" className="ml-2">Advanced</Badge>
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Copy Size */}
        {strategy === 'percentage' && (
          <div>
            <Label>Copy Percentage</Label>
            <div className="flex items-center gap-4 mt-2">
              <Slider
                value={[copySize]}
                onValueChange={([value]) => setCopySize(value)}
                min={1}
                max={100}
                step={1}
                className="flex-1"
              />
              <span className="text-sm font-medium w-12">{copySize}%</span>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              If a trader places a $100 order, you'll copy ${(copySize * 1).toFixed(0)}
            </p>
          </div>
        )}

        {strategy === 'fixed' && (
          <div>
            <Label>Fixed Amount (USD)</Label>
            <Input
              type="number"
              value={copySize}
              onChange={(e) => setCopySize(parseFloat(e.target.value))}
              min={1}
              step={1}
            />
            <p className="text-sm text-slate-600 mt-1">
              Every trade will be ${copySize} regardless of trader's size
            </p>
          </div>
        )}

        {/* Max Order Size */}
        <div>
          <Label>Maximum Order Size (USD)</Label>
          <Input
            type="number"
            value={maxOrderSize}
            onChange={(e) => setMaxOrderSize(parseFloat(e.target.value))}
            min={1}
            step={10}
          />
          <p className="text-sm text-slate-600 mt-1">
            Never place an order larger than this amount
          </p>
        </div>

        {/* Tiered Multipliers */}
        <div>
          <Label>Tiered Multipliers (Optional)</Label>
          <Input
            value={tieredMultipliers}
            onChange={(e) => setTieredMultipliers(e.target.value)}
            placeholder="0-50:0.5,50-200:1.0,200+:2.0"
          />
          <p className="text-sm text-slate-600 mt-1">
            Adjust multiplier based on trader's order size
          </p>
          <div className="mt-2 p-3 bg-blue-50 rounded-lg">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-blue-700">
                <strong>Example:</strong> "0-50:0.5,50-200:1.0,200+:2.0"
                <ul className="mt-1 space-y-1">
                  <li>• $0-50 trades: 0.5x (cautious on small trades)</li>
                  <li>• $50-200 trades: 1.0x (normal sizing)</li>
                  <li>• $200+ trades: 2.0x (aggressive on large trades)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Position Limit */}
        <div>
          <Label>Max Position Size (Optional)</Label>
          <Input
            type="number"
            value={maxPositionSize || ''}
            onChange={(e) => setMaxPositionSize(e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="No limit"
          />
          <p className="text-sm text-slate-600 mt-1">
            Maximum total value for a single market position
          </p>
        </div>

        {/* Daily Volume Limit */}
        <div>
          <Label>Max Daily Volume (Optional)</Label>
          <Input
            type="number"
            value={maxDailyVolume || ''}
            onChange={(e) => setMaxDailyVolume(e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="No limit"
          />
          <p className="text-sm text-slate-600 mt-1">
            Maximum total trading volume per day
          </p>
        </div>

        <Button onClick={() => {/* save logic */}} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </Card>
  )
}
```

---

## 3. Trade Aggregation for Small Positions

### Current State
- Each trade is executed individually, regardless of size
- Small trades below Polymarket's $1 minimum fail
- High-frequency traders cause many small failed orders

### Implementation Plan

#### 3.1 Trade Aggregation Buffer

**File:** `lib/copy-trading/trade-aggregation.ts`

```typescript
interface PendingTrade {
  tradeId: string
  traderId: string
  traderWallet: string
  marketId: string
  tokenId: string
  outcome: string
  side: 'BUY' | 'SELL'
  size: number
  price: number
  timestamp: number
  userId: string
}

interface AggregatedTrade {
  marketId: string
  tokenId: string
  outcome: string
  side: 'BUY' | 'SELL'
  trades: PendingTrade[]
  totalSize: number
  avgPrice: number
  firstTradeTime: number
  lastTradeTime: number
}

const AGGREGATION_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
const MIN_ORDER_SIZE_USD = 1.0

class TradeAggregator {
  private buffer: Map<string, AggregatedTrade> = new Map()

  /**
   * Get aggregation key for grouping trades
   */
  private getKey(trade: PendingTrade): string {
    return `${trade.userId}:${trade.marketId}:${trade.outcome}:${trade.side}`
  }

  /**
   * Add trade to aggregation buffer
   */
  addTrade(trade: PendingTrade): void {
    const key = this.getKey(trade)
    const existing = this.buffer.get(key)
    const now = Date.now()

    if (existing) {
      existing.trades.push(trade)
      existing.totalSize += trade.size
      existing.avgPrice = this.calculateWeightedAvg(existing.trades)
      existing.lastTradeTime = now
    } else {
      this.buffer.set(key, {
        marketId: trade.marketId,
        tokenId: trade.tokenId,
        outcome: trade.outcome,
        side: trade.side,
        trades: [trade],
        totalSize: trade.size,
        avgPrice: trade.price,
        firstTradeTime: now,
        lastTradeTime: now,
      })
    }
  }

  /**
   * Get trades ready for execution
   */
  getReadyTrades(): AggregatedTrade[] {
    const ready: AggregatedTrade[] = []
    const now = Date.now()

    for (const [key, agg] of this.buffer.entries()) {
      const elapsed = now - agg.firstTradeTime

      // Window has passed
      if (elapsed >= AGGREGATION_WINDOW_MS) {
        if (agg.totalSize >= MIN_ORDER_SIZE_USD) {
          // Ready to execute
          ready.push(agg)
        } else {
          // Too small, skip
          console.log(
            `Skipping aggregated trade: $${agg.totalSize.toFixed(2)} below minimum`
          )
        }
        this.buffer.delete(key)
      }
    }

    return ready
  }

  /**
   * Calculate weighted average price
   */
  private calculateWeightedAvg(trades: PendingTrade[]): number {
    let totalValue = 0
    let totalSize = 0

    for (const trade of trades) {
      totalValue += trade.price * trade.size
      totalSize += trade.size
    }

    return totalSize > 0 ? totalValue / totalSize : 0
  }

  /**
   * Check if immediate execution is needed (trade above minimum)
   */
  shouldExecuteImmediately(tradeSize: number): boolean {
    return tradeSize >= MIN_ORDER_SIZE_USD
  }

  /**
   * Remove trades from buffer (on error or completion)
   */
  removeTrades(key: string): void {
    this.buffer.delete(key)
  }
}

export const tradeAggregator = new TradeAggregator()
```

#### 3.2 Integrate into Order Flow

Modify the order placement route to check if aggregation is needed:

```typescript
// In app/api/polymarket/orders/place/route.ts

import { tradeAggregator } from '@/lib/copy-trading/trade-aggregation'

// After calculating final order size...
const shouldAggregate = finalAmount < 1.0 && finalAmount > 0

if (shouldAggregate) {
  // Add to aggregation buffer
  tradeAggregator.addTrade({
    tradeId: copiedTradeId,
    traderId: copiedTraderId,
    traderWallet: copiedTraderWallet,
    marketId,
    tokenId,
    outcome,
    side,
    size: finalAmount,
    price,
    timestamp: Date.now(),
    userId,
  })

  return NextResponse.json({
    ok: true,
    aggregated: true,
    message: 'Trade queued for aggregation',
    size: finalAmount,
    estimatedExecutionTime: '5 minutes',
  })
}

// Otherwise execute immediately...
```

#### 3.3 Background Job to Process Aggregated Trades

**File:** `app/api/copy-trading/process-aggregated/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { tradeAggregator } from '@/lib/copy-trading/trade-aggregation'

/**
 * Cron job to process aggregated trades
 * Run every 30 seconds via Vercel Cron or similar
 */
export async function GET() {
  const ready = tradeAggregator.getReadyTrades()

  console.log(`Processing ${ready.length} aggregated trades`)

  for (const agg of ready) {
    try {
      // Execute aggregated trade
      // Use the same placeOrderCore logic
      console.log(`Executing aggregated trade: ${agg.trades.length} trades, $${agg.totalSize.toFixed(2)} total`)
      
      // ... execute order with agg.totalSize and agg.avgPrice
      
    } catch (error) {
      console.error('Failed to execute aggregated trade:', error)
    }
  }

  return NextResponse.json({ processed: ready.length })
}
```

---

## 4. Enhanced Sell Tracking

### Current State
- Sell orders don't track original purchase information
- Partial sells can cause position drift
- No relationship between buys and sells

### Implementation Plan

#### 4.1 Add Purchase Tracking to Orders Table

**File:** `supabase/migrations/20260216_add_purchase_tracking.sql`

```sql
-- Track purchased tokens for accurate sells
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tokens_purchased numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_tracking jsonb DEFAULT '[]'::jsonb;

-- Function to track purchases
CREATE OR REPLACE FUNCTION public.track_order_purchase(
  p_order_id text,
  p_tokens_purchased numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.orders
  SET 
    tokens_purchased = p_tokens_purchased,
    updated_at = now()
  WHERE order_id = p_order_id;
END;
$$;

-- Function to get total tokens purchased for a position
CREATE OR REPLACE FUNCTION public.get_total_tokens_purchased(
  p_user_id uuid,
  p_market_id text,
  p_outcome text,
  p_trader_wallet text
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total numeric;
BEGIN
  SELECT COALESCE(SUM(tokens_purchased), 0)
  INTO v_total
  FROM public.orders
  WHERE 
    copy_user_id = p_user_id
    AND market_id = p_market_id
    AND outcome = p_outcome
    AND copied_trader_wallet = p_trader_wallet
    AND side = 'buy'
    AND tokens_purchased > 0
    AND user_closed_at IS NULL;
    
  RETURN v_total;
END;
$$;

-- Function to update purchase tracking after sell
CREATE OR REPLACE FUNCTION public.update_purchase_tracking_after_sell(
  p_user_id uuid,
  p_market_id text,
  p_outcome text,
  p_trader_wallet text,
  p_tokens_sold numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_buy_order RECORD;
  v_remaining numeric := p_tokens_sold;
  v_to_deduct numeric;
BEGIN
  -- Reduce tokens_purchased from BUY orders (FIFO)
  FOR v_buy_order IN
    SELECT order_id, tokens_purchased
    FROM public.orders
    WHERE 
      copy_user_id = p_user_id
      AND market_id = p_market_id
      AND outcome = p_outcome
      AND copied_trader_wallet = p_trader_wallet
      AND side = 'buy'
      AND tokens_purchased > 0
    ORDER BY created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    
    v_to_deduct := LEAST(v_buy_order.tokens_purchased, v_remaining);
    
    UPDATE public.orders
    SET tokens_purchased = tokens_purchased - v_to_deduct
    WHERE order_id = v_buy_order.order_id;
    
    v_remaining := v_remaining - v_to_deduct;
  END LOOP;
END;
$$;
```

#### 4.2 Track Purchases in Order Placement

Update the order placement code to track tokens purchased:

```typescript
// After successful BUY order execution
if (side === 'BUY' && orderId) {
  const tokensPurchased = adjustedAmount / roundedPrice
  
  await supabase.rpc('track_order_purchase', {
    p_order_id: orderId,
    p_tokens_purchased: tokensPurchased,
  })
}
```

#### 4.3 Calculate Sell Size Based on Purchase Tracking

```typescript
// When executing SELL order
if (side === 'SELL') {
  // Get total tokens purchased
  const { data: totalPurchased } = await supabase.rpc('get_total_tokens_purchased', {
    p_user_id: userId,
    p_market_id: marketId,
    p_outcome: outcome,
    p_trader_wallet: copiedTraderWallet,
  })

  // Calculate sell percentage based on trader's action
  const traderSellPercent = traderOrderSize / (traderCurrentPosition + traderOrderSize)
  
  // Apply to our tracked purchases
  const tokensToSell = totalPurchased * traderSellPercent
  
  // Execute sell...
  
  // After successful sell, update tracking
  await supabase.rpc('update_purchase_tracking_after_sell', {
    p_user_id: userId,
    p_market_id: marketId,
    p_outcome: outcome,
    p_trader_wallet: copiedTraderWallet,
    p_tokens_sold: actualTokensSold,
  })
}
```

---

## 5. Improved Error Handling & Recovery

### Current State
- Generic error messages
- No retry logic for temporary failures
- No distinction between fatal vs. recoverable errors

### Implementation Plan

#### 5.1 Error Classification System

**File:** `lib/copy-trading/error-handling.ts`

```typescript
export enum ErrorSeverity {
  RECOVERABLE = 'recoverable',    // Retry immediately
  TEMPORARY = 'temporary',        // Retry with backoff
  PERMANENT = 'permanent',        // Don't retry
  CRITICAL = 'critical',          // Alert user immediately
}

export interface CopyTradingError {
  code: string
  message: string
  severity: ErrorSeverity
  retryable: boolean
  userMessage: string
  actionRequired?: string
}

/**
 * Classify errors for appropriate handling
 */
export function classifyError(error: any): CopyTradingError {
  const message = error?.message || String(error)
  const code = error?.code || 'unknown'

  // Insufficient balance
  if (message.includes('insufficient') || message.includes('balance')) {
    return {
      code: 'insufficient_balance',
      message,
      severity: ErrorSeverity.PERMANENT,
      retryable: false,
      userMessage: 'Insufficient balance to execute trade',
      actionRequired: 'Add USDC to your wallet to continue copy trading',
    }
  }

  // API rate limit
  if (message.includes('rate limit') || error?.status === 429) {
    return {
      code: 'rate_limited',
      message,
      severity: ErrorSeverity.TEMPORARY,
      retryable: true,
      userMessage: 'Too many requests, will retry shortly',
    }
  }

  // Network timeout
  if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
    return {
      code: 'network_timeout',
      message,
      severity: ErrorSeverity.RECOVERABLE,
      retryable: true,
      userMessage: 'Network timeout, retrying...',
    }
  }

  // Cloudflare block
  if (message.includes('cloudflare') || message.includes('blocked')) {
    return {
      code: 'blocked_by_cloudflare',
      message,
      severity: ErrorSeverity.TEMPORARY,
      retryable: true,
      userMessage: 'Proxy issue detected, rotating...',
    }
  }

  // Price slippage
  if (message.includes('slippage') || message.includes('price')) {
    return {
      code: 'excessive_slippage',
      message,
      severity: ErrorSeverity.TEMPORARY,
      retryable: true,
      userMessage: 'Price moved unfavorably, will retry',
    }
  }

  // Market closed
  if (message.includes('closed') || message.includes('resolved')) {
    return {
      code: 'market_closed',
      message,
      severity: ErrorSeverity.PERMANENT,
      retryable: false,
      userMessage: 'Market has closed or resolved',
    }
  }

  // Generic error
  return {
    code: code || 'unknown_error',
    message,
    severity: ErrorSeverity.CRITICAL,
    retryable: false,
    userMessage: 'Trade execution failed',
    actionRequired: 'Check your wallet and settings',
  }
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    initialDelay?: number
    maxDelay?: number
    shouldRetry?: (error: any) => boolean
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    shouldRetry = (error) => classifyError(error).retryable,
  } = options

  let lastError: any
  let delay = initialDelay

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const classified = classifyError(error)

      if (!shouldRetry(error) || attempt === maxRetries - 1) {
        throw error
      }

      console.log(
        `Attempt ${attempt + 1}/${maxRetries} failed: ${classified.userMessage}. Retrying in ${delay}ms...`
      )

      await new Promise(resolve => setTimeout(resolve, delay))
      delay = Math.min(delay * 2, maxDelay)
    }
  }

  throw lastError
}
```

#### 5.2 User-Friendly Error Notifications

**File:** `components/copy-trading/ErrorNotification.tsx`

```typescript
'use client'

import { AlertTriangle, XCircle, Info, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface ErrorNotificationProps {
  error: {
    code: string
    userMessage: string
    actionRequired?: string
    severity: string
  }
  onRetry?: () => void
  onDismiss?: () => void
}

export function ErrorNotification({ error, onRetry, onDismiss }: ErrorNotificationProps) {
  const getSeverityIcon = () => {
    switch (error.severity) {
      case 'critical':
      case 'permanent':
        return <XCircle className="w-5 h-5 text-red-600" />
      case 'temporary':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />
      default:
        return <Info className="w-5 h-5 text-blue-600" />
    }
  }

  const getSeverityColor = () => {
    switch (error.severity) {
      case 'critical':
      case 'permanent':
        return 'bg-red-50 border-red-200'
      case 'temporary':
        return 'bg-yellow-50 border-yellow-200'
      default:
        return 'bg-blue-50 border-blue-200'
    }
  }

  return (
    <Card className={`p-4 border ${getSeverityColor()}`}>
      <div className="flex items-start gap-3">
        {getSeverityIcon()}
        <div className="flex-1">
          <p className="font-medium text-sm">{error.userMessage}</p>
          {error.actionRequired && (
            <p className="text-sm text-slate-600 mt-1">
              {error.actionRequired}
            </p>
          )}
          <div className="flex items-center gap-2 mt-3">
            {onRetry && error.severity !== 'permanent' && (
              <Button onClick={onRetry} size="sm" variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            )}
            {onDismiss && (
              <Button onClick={onDismiss} size="sm" variant="ghost">
                Dismiss
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
```

---

## 6. Simplified Onboarding Flow

### Implementation Plan

#### 6.1 Copy Trading Setup Wizard

**File:** `components/copy-trading/SetupWizard.tsx`

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Check, ArrowRight, Wallet, Settings, Users, PlayCircle } from 'lucide-react'
import { HealthCheckPanel } from './HealthCheckPanel'
import { PositionSizingSettings } from './PositionSizingSettings'

type Step = 'wallet' | 'settings' | 'traders' | 'test' | 'complete'

export function CopyTradingSetupWizard() {
  const [currentStep, setCurrentStep] = useState<Step>('wallet')
  const [completedSteps, setCompletedSteps] = useState<Set<Step>>(new Set())

  const steps: Array<{ id: Step; title: string; icon: any }> = [
    { id: 'wallet', title: 'Connect Wallet', icon: Wallet },
    { id: 'settings', title: 'Configure Strategy', icon: Settings },
    { id: 'traders', title: 'Follow Traders', icon: Users },
    { id: 'test', title: 'Health Check', icon: PlayCircle },
  ]

  const markStepComplete = (step: Step) => {
    setCompletedSteps(prev => new Set([...prev, step]))
  }

  const goToNextStep = () => {
    const currentIndex = steps.findIndex(s => s.id === currentStep)
    if (currentIndex < steps.length - 1) {
      markStepComplete(currentStep)
      setCurrentStep(steps[currentIndex + 1].id)
    } else {
      markStepComplete(currentStep)
      setCurrentStep('complete')
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isComplete = completedSteps.has(step.id)
            const isCurrent = currentStep === step.id

            return (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isComplete
                        ? 'bg-green-600 text-white'
                        : isCurrent
                        ? 'bg-polycopy-yellow text-slate-900'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {isComplete ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <span className="text-xs mt-2 text-center">{step.title}</span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 ${
                      isComplete ? 'bg-green-600' : 'bg-slate-200'
                    }`}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Step Content */}
      <Card className="p-6">
        {currentStep === 'wallet' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Connect Your Wallet</h2>
            <p className="text-slate-600">
              Connect your Polymarket wallet to start copy trading. This will allow Polycopy to
              place trades on your behalf.
            </p>
            {/* Wallet connection UI */}
            <Button onClick={goToNextStep}>
              Continue <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {currentStep === 'settings' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Configure Your Strategy</h2>
            <p className="text-slate-600">
              Set up how much you want to copy from traders. You can always change this later.
            </p>
            <PositionSizingSettings />
            <Button onClick={goToNextStep}>
              Continue <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {currentStep === 'traders' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Follow Traders</h2>
            <p className="text-slate-600">
              Choose which traders you want to copy. Start with 2-3 traders to diversify.
            </p>
            {/* Trader selection UI */}
            <Button onClick={goToNextStep}>
              Continue <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {currentStep === 'test' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Run Health Check</h2>
            <p className="text-slate-600">
              Let's verify everything is set up correctly before you start trading.
            </p>
            <HealthCheckPanel onComplete={(healthy) => {
              if (healthy) goToNextStep()
            }} />
          </div>
        )}

        {currentStep === 'complete' && (
          <div className="space-y-4 text-center">
            <Check className="w-16 h-16 text-green-600 mx-auto" />
            <h2 className="text-2xl font-bold">You're All Set!</h2>
            <p className="text-slate-600">
              Your copy trading is now active. When traders you follow place orders, Polycopy will
              automatically copy them based on your settings.
            </p>
            <Button size="lg">Go to Dashboard</Button>
          </div>
        )}
      </Card>
    </div>
  )
}
```

---

## Implementation Priority

### Phase 1: Foundation (Week 1-2)
1. ✅ Health Check System
2. ✅ Position Sizing Database Schema
3. ✅ Position Sizing Library

### Phase 2: Core Features (Week 3-4)
4. ✅ Integrate Position Sizing into Order Flow
5. ✅ Settings UI for Position Sizing
6. ✅ Enhanced Error Handling

### Phase 3: Advanced Features (Week 5-6)
7. ✅ Trade Aggregation System
8. ✅ Purchase Tracking for Sells
9. ✅ Setup Wizard

### Phase 4: Polish (Week 7-8)
10. ✅ User Documentation
11. ✅ Testing & Bug Fixes
12. ✅ Performance Optimization

---

## Success Metrics

- **Health Check Adoption**: % of users who run health check before first trade
- **Error Recovery Rate**: % of failed orders that succeed on retry
- **Position Sizing Usage**: % of users with custom sizing configs
- **Trade Aggregation**: Reduction in failed orders below $1 minimum
- **User Satisfaction**: Reduced support tickets related to copy trading

---

## Conclusion

These improvements will make Polycopy's copy trading system **more reliable, more intelligent, and easier to use** while maintaining its advantages as a full-featured platform. The key is borrowing the MargaratDavis bot's emphasis on **simplicity and robustness** while keeping Polycopy's superior **analytics, UI, and multi-user architecture**.
