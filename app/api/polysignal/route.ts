import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculatePolySignalScore } from '@/lib/polysignal/calculate'
import { getPolyScore } from '@/lib/polyscore/get-polyscore'
import { verifyAdminAuth } from '@/lib/auth/verify-admin'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('[polysignal] Missing Supabase configuration')
}

const supabase = createClient(supabaseUrl || '', serviceKey || '', {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function fetchAiWinProb(
  conditionId: string,
  wallet: string,
  price: number,
  size: number,
  outcome: string,
  title: string
): Promise<number | null> {
  try {
    const marketRes = await fetch(
      `https://gamma-api.polymarket.com/markets?condition_id=${encodeURIComponent(conditionId)}`,
      { cache: 'no-store' }
    )
    if (!marketRes.ok) return null
    const marketData = await marketRes.json()
    const gammaMarket = Array.isArray(marketData) && marketData.length > 0 ? marketData[0] : null
    if (!gammaMarket) return null
    let currentPrice = price
    if (gammaMarket.outcomePrices && gammaMarket.outcomes) {
      const outcomes = typeof gammaMarket.outcomes === 'string' ? JSON.parse(gammaMarket.outcomes) : gammaMarket.outcomes
      const prices = typeof gammaMarket.outcomePrices === 'string' ? JSON.parse(gammaMarket.outcomePrices) : gammaMarket.outcomePrices
      if (Array.isArray(outcomes) && Array.isArray(prices)) {
        const idx = outcomes.findIndex((o: string) => o.toLowerCase() === (outcome || 'yes').toLowerCase())
        if (idx >= 0 && prices[idx] != null) currentPrice = Number(prices[idx])
      }
    }

    const polyRes = await getPolyScore({
      original_trade: {
        wallet_address: wallet,
        condition_id: conditionId,
        side: 'BUY',
        price,
        shares_normalized: size,
        timestamp: new Date().toISOString(),
      },
      market_context: {
        current_price: currentPrice,
        current_timestamp: new Date().toISOString(),
        market_title: title || null,
      },
      user_slippage: 0.05,
    }, serviceKey)

    if (!polyRes?.success) return null
    let prob = polyRes.valuation?.ai_fair_value ?? polyRes.prediction?.probability ?? polyRes.analysis?.prediction_stats?.ai_fair_value ?? null
    if (prob != null && prob > 1) prob = prob / 100
    return prob != null && Number.isFinite(prob) ? prob : null
  } catch {
    return null
  }
}

function normalizeWinRateValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  if (value > 1.01) return value / 100
  if (value < 0) return null
  return value
}

function pickNumber(...values: Array<number | null | undefined | string>): number | null {
  for (const v of values) {
    if (v === null || v === undefined) continue
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
    if (typeof v === 'string') {
      const num = Number(v)
      if (Number.isFinite(num) && num > 0) return num
    }
  }
  return null
}

const MIN_RELIABLE_TRADES = 10

export async function GET(request: Request) {
  const authResult = await verifyAdminAuth()
  if (!authResult.isAdmin) {
    return NextResponse.json(
      { error: authResult.error || 'Admin access required' },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const wallet = searchParams.get('wallet')?.toLowerCase().trim()
  const price = searchParams.get('price')
  const size = searchParams.get('size')
  const title = searchParams.get('title') || searchParams.get('market') || ''
  const category = searchParams.get('category') || searchParams.get('marketSubtype') || ''
  const conditionId = searchParams.get('conditionId')?.trim() || searchParams.get('condition_id')?.trim()
  const outcome = searchParams.get('outcome') || 'YES'

  if (!wallet) {
    return NextResponse.json({ error: 'wallet is required' }, { status: 400 })
  }

  const priceNum = price ? Number(price) : 0
  const sizeNum = size ? Number(size) : 0

  if (!Number.isFinite(priceNum) || priceNum <= 0) {
    return NextResponse.json({ error: 'valid price is required' }, { status: 400 })
  }

  try {
    const [globalRes, profileRes] = await Promise.all([
      supabase
        .from('trader_global_stats')
        .select('l_win_rate, d30_win_rate, l_total_roi_pct, d30_total_roi_pct, l_count, d30_count, l_avg_trade_size_usd, d30_avg_trade_size_usd, l_avg_pos_size_usd')
        .eq('wallet_address', wallet)
        .maybeSingle(),
      supabase
        .from('trader_profile_stats')
        .select('final_niche, d30_count, l_count, d30_win_rate, l_win_rate, d30_avg_trade_size_usd, l_avg_trade_size_usd')
        .eq('wallet_address', wallet),
    ])

    if (globalRes.error) {
      console.error('[polysignal] global stats error:', globalRes.error)
    }
    if (profileRes.error) {
      console.error('[polysignal] profile stats error:', profileRes.error)
    }

    const globalRow = globalRes.data
    const profiles = profileRes.data || []

    const globalWinRate = normalizeWinRateValue(globalRow?.d30_win_rate) ?? normalizeWinRateValue(globalRow?.l_win_rate)
    const globalTrades = pickNumber(globalRow?.d30_count, globalRow?.l_count) ?? 0
    const avgBetSizeUsd = pickNumber(
      globalRow?.d30_avg_trade_size_usd,
      globalRow?.l_avg_trade_size_usd,
      globalRow?.l_avg_pos_size_usd
    )

    const normalizedCategory = (category || '').toLowerCase().trim()
    const matchingProfiles = normalizedCategory && profiles.length > 0
      ? profiles.filter((p: { final_niche?: string }) => {
          const niche = (p.final_niche || '').toLowerCase()
          if (!niche) return false
          return niche === normalizedCategory || niche.includes(normalizedCategory) || normalizedCategory.includes(niche)
        })
      : []

    let aggregatedStats: { tradeCount: number; winRate: number; avgTradeSize: number } | null = null
    if (matchingProfiles.length > 0) {
      const agg = matchingProfiles.reduce(
        (acc: { totalTrades: number; winWeighted: number; sizeWeighted: number }, p: any) => {
          const count = pickNumber(p.d30_count, p.l_count, p.trade_count) ?? 0
          const wr = normalizeWinRateValue(p.d30_win_rate) ?? normalizeWinRateValue(p.l_win_rate) ?? 0.5
          const avgSize = pickNumber(p.d30_avg_trade_size_usd, p.l_avg_trade_size_usd) ?? 0
          acc.totalTrades += count
          acc.winWeighted += wr * count
          acc.sizeWeighted += avgSize * count
          return acc
        },
        { totalTrades: 0, winWeighted: 0, sizeWeighted: 0 }
      )
      if (agg.totalTrades > 0) {
        aggregatedStats = {
          tradeCount: agg.totalTrades,
          winRate: agg.winWeighted / agg.totalTrades,
          avgTradeSize: agg.sizeWeighted / agg.totalTrades,
        }
      }
    }

    const nicheTradeCount = aggregatedStats?.tradeCount ?? 0
    const useNicheStats = aggregatedStats && nicheTradeCount >= MIN_RELIABLE_TRADES

    const polySignalStats = {
      profileWinRate: useNicheStats ? aggregatedStats!.winRate : (globalWinRate ?? null),
      globalWinRate: globalWinRate ?? null,
      profileTrades: useNicheStats ? nicheTradeCount : globalTrades,
      globalTrades,
      avgBetSizeUsd: useNicheStats ? aggregatedStats!.avgTradeSize : (avgBetSizeUsd ?? null),
      isHedging: false,
    }

    const trade = {
      price: priceNum,
      size: sizeNum,
      shares_normalized: sizeNum,
      amount: sizeNum,
      title,
      question: title,
      market: title,
    }

    let aiWinProb: number | null = null
    if (conditionId && conditionId.startsWith('0x')) {
      aiWinProb = await fetchAiWinProb(conditionId, wallet, priceNum, sizeNum, outcome, title)
    }

    const result = calculatePolySignalScore(trade, polySignalStats, aiWinProb ?? undefined)

    return NextResponse.json({
      score: result.score,
      recommendation: result.recommendation,
      indicators: result.indicators,
      factors: result.factors,
    })
  } catch (err: any) {
    console.error('[polysignal] exception:', err)
    return NextResponse.json({ error: err?.message || 'failed to compute polysignal' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
