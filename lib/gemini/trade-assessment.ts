export type GeminiChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type TradeAssessmentSnapshot = {
  tradeId?: string | null
  trader: {
    name: string
    wallet: string
    roi?: number | null
    nicheWinRate?: number | null
    nicheRoiPct?: number | null
    recentWinRate?: number | null
    convictionScore?: number | null
  }
  market: {
    title: string
    category?: string | null
    isSports?: boolean | null
    position: string
    action: 'Buy' | 'Sell'
    conditionId?: string | null
    tokenId?: string | null
    marketSlug?: string | null
    polymarketUrl?: string | null
    espnUrl?: string | null
    betStructure?: string | null
  }
  numbers: {
    entryPrice: number
    size: number
    totalUsd: number
    currentPrice?: number | null
    roiFromLive?: number | null
    priceEdgePct?: number | null
  }
  timing: {
    tradeTimestamp?: number | null
    eventStartTime?: string | null
    eventEndTime?: string | null
    liveStatus?: string | null
    eventStatus?: string | null
    currentTimestampIso: string
    minutesToStart?: number | null
    minutesToEnd?: number | null
  }
  live: {
    liveScore?: string | null
    liveStatusSource?: string | null
    gameTimeInfo?: string | null
    minsBeforeClose?: number | null
  }
  insights?: {
    fireReasons?: string[] | null
    fireScore?: number | null
    fireWinRate?: number | null
    fireRoi?: number | null
    fireConviction?: number | null
  }
}

export type GeminiAssessment = {
  recommendation: 'copy' | 'lean_copy' | 'pass' | 'watch' | 'uncertain'
  betSize: 'small' | 'regular' | 'large' | 'high'
  confidence?: number
  headline?: string
  rationale?: string[]
  liveInsights?: string[]
  riskNotes?: string[]
  timingCallout?: string
  rawText?: string
}

const formatNumber = (value?: number | null, decimals = 2) => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a'
  return value.toFixed(decimals)
}

const formatCurrency = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a'
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

const describeTiming = (timing: TradeAssessmentSnapshot['timing']) => {
  const now = new Date(timing.currentTimestampIso)
  const start = timing.eventStartTime ? new Date(timing.eventStartTime) : null
  const end = timing.eventEndTime ? new Date(timing.eventEndTime) : null

  if (start && !Number.isNaN(start.getTime()) && start > now) {
    const mins = Math.max(0, Math.round((start.getTime() - now.getTime()) / 60000))
    return `Event starts in ~${mins}m (${start.toISOString()})`
  }

  if (start && end && start <= now && end > now) {
    const minsRemaining = Math.max(0, Math.round((end.getTime() - now.getTime()) / 60000))
    return `In-play, ~${minsRemaining}m to resolution (end ${end.toISOString()})`
  }

  if (end && !Number.isNaN(end.getTime()) && end <= now) {
    return `Event likely finished; listed end ${end.toISOString()}`
  }

  return `Timing unclear; now ${now.toISOString()}`
}

export const buildTradeContextBlock = (snapshot: TradeAssessmentSnapshot) => {
  const { trader, market, numbers, timing, live, insights } = snapshot
  const timingLine = describeTiming(timing)
  const fireBits = insights?.fireReasons?.length
    ? `Fire tags: ${insights.fireReasons.join(', ')}`
    : null
  const traderBits =
    trader.nicheWinRate !== undefined || trader.nicheRoiPct !== undefined
      ? `Trader niche perf → win rate:${formatNumber((trader.nicheWinRate ?? 0) * 100, 1)}% roi:${formatNumber((trader.nicheRoiPct ?? 0) * 100, 1)}%`
      : null

  const parts = [
    `Trader: ${trader.name} (${trader.wallet}) ROI:${formatNumber(trader.roi)}`,
    `Market: ${market.title} [${market.category ?? 'uncat'}] | Structure: ${market.betStructure ?? 'n/a'}`,
    `Position: ${market.action} ${market.position} @ ${formatNumber(numbers.entryPrice, 4)} for ${formatCurrency(numbers.totalUsd)} (${formatNumber(numbers.size, 2)} contracts)`,
    `Live price: ${numbers.currentPrice !== undefined ? formatNumber(numbers.currentPrice, 4) : 'n/a'} | Edge vs entry: ${
      numbers.priceEdgePct !== null && numbers.priceEdgePct !== undefined
        ? `${numbers.priceEdgePct >= 0 ? '+' : ''}${formatNumber(numbers.priceEdgePct, 2)} pts`
        : 'n/a'
    } | Est. ROI from live: ${
      numbers.roiFromLive !== undefined && numbers.roiFromLive !== null
        ? `${numbers.roiFromLive >= 0 ? '+' : ''}${formatNumber(numbers.roiFromLive, 2)}%`
        : 'n/a'
    }`,
    `Live score/status: ${live.liveScore ?? 'n/a'} (${timing.liveStatus ?? 'unknown'} / ${timing.eventStatus ?? 'unknown'}) ${live.gameTimeInfo ? `| clock ${live.gameTimeInfo}` : ''}`,
    timingLine,
    fireBits ? fireBits : null,
    traderBits,
    insights?.fireScore !== undefined && insights?.fireScore !== null
      ? `Fire score ${formatNumber(insights.fireScore, 1)} | Win rate ${formatNumber(insights.fireWinRate, 1)}% | ROI ${formatNumber(insights.fireRoi, 1)}%`
      : null,
    market.polymarketUrl ? `Reference: ${market.polymarketUrl}` : null,
  ].filter(Boolean)

  return parts.join('\n')
}
