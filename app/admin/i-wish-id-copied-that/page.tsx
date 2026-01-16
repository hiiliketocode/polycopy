import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin'
import IWishCopiedFeed from './IWishCopiedFeed'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const LOOKBACK_HOURS = 24
const LATE_WINDOW_MINUTES = 120
const HIGH_ROI_THRESHOLD = 30
const HUGE_ROI_THRESHOLD = 75
const CONTRARIAN_PRICE_MAX = 0.2
const BIG_TICKET_USD = 1000
const MAX_TRADES = 500
const MAX_RESULTS = 40

type TradeRow = {
  id: string
  wallet_address: string
  timestamp: string
  side: string
  shares_normalized: number
  price: number
  token_label: string | null
  condition_id: string | null
  market_slug: string | null
  title: string | null
}

type PublicTradeRow = {
  trade_id: string
  trader_wallet: string
  trade_timestamp: string
  side: string | null
  size: number | null
  price: number | null
  outcome: string | null
  condition_id: string | null
  market_slug: string | null
  market_title: string | null
}

type MarketRow = {
  condition_id: string
  slug: string | null
  question: string | null
  category: string | null
  outcomes: unknown
  outcome_prices: unknown
  volume: number | null
  liquidity: number | null
  closed: boolean | null
  end_date: string | null
  icon: string | null
  twitter_card_image: string | null
  raw_gamma: Record<string, any> | null
}

type TweetCandidate = {
  id: string
  wallet: string
  marketTitle: string
  marketSlug: string | null
  conditionId: string | null
  outcome: string
  price: number
  shares: number
  investedUsd: number
  timestamp: string
  currentPrice: number | null
  roiPct: number | null
  lateWindowMinutes: number | null
  reason: string
  reasonTags: string[]
  category: string | null
  marketEndDate: string | null
  marketClosed: boolean | null
  marketVolume: number | null
  marketIcon: string | null
  twitterCardImage: string | null
  score: number
}

const normalizeLabel = (value: string | null | undefined) => value?.trim().toLowerCase() ?? ''

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry : String(entry ?? '').trim()))
      .filter(Boolean)
  }
  return []
}

const asNumberArray = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => Number(entry))
      .filter((entry) => Number.isFinite(entry))
  }
  return []
}

const resolveOutcomes = (market: MarketRow | undefined | null): string[] => {
  if (!market) return []
  const direct = asStringArray(market.outcomes)
  if (direct.length) return direct
  const gammaOutcomes = asStringArray(market.raw_gamma?.outcomes)
  if (gammaOutcomes.length) return gammaOutcomes
  const tokens = Array.isArray(market.raw_gamma?.tokens) ? market.raw_gamma?.tokens : []
  if (Array.isArray(tokens)) {
    return tokens
      .map((token: any) => (typeof token?.outcome === 'string' ? token.outcome.trim() : ''))
      .filter(Boolean)
  }
  return []
}

const resolveOutcomePrices = (market: MarketRow | undefined | null): number[] => {
  if (!market) return []
  const direct = asNumberArray(market.outcome_prices)
  if (direct.length) return direct
  const gammaPrices = asNumberArray(market.raw_gamma?.outcomePrices ?? market.raw_gamma?.outcome_prices)
  if (gammaPrices.length) return gammaPrices
  return []
}

const findOutcomePrice = (market: MarketRow | undefined | null, outcome: string | null): number | null => {
  if (!market || !outcome) return null
  const outcomes = resolveOutcomes(market)
  const prices = resolveOutcomePrices(market)
  if (!outcomes.length || !prices.length) return null
  const normalizedTarget = normalizeLabel(outcome)
  if (!normalizedTarget) return null
  const index = outcomes.findIndex((label) => normalizeLabel(label) === normalizedTarget)
  if (index === -1 || index >= prices.length) return null
  const price = prices[index]
  return Number.isFinite(price) ? price : null
}

const formatPercent = (value: number | null, digits = 1) => {
  if (value === null || !Number.isFinite(value)) return '--'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

const formatPrice = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return '--'
  return `$${value.toFixed(2).replace(/\.00$/, '')}`
}

const formatCurrency = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(value)
}

const chunkArray = <T,>(items: T[], size: number) => {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

type PageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function IWishCopiedThatPage({ searchParams }: PageProps) {
  const adminUser = await getAdminSessionUser()
  const resolvedSearchParams = await searchParams

  if (!adminUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#05070E] text-white">
        <p className="max-w-md text-center text-lg">
          Access denied. Please log in with an admin account to view this page.
        </p>
      </div>
    )
  }

  const supabase = createAdminServiceClient()
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString()

  const tradesResult = await supabase
    .from('trades')
    .select('id, wallet_address, timestamp, side, shares_normalized, price, token_label, condition_id, market_slug, title')
    .gte('timestamp', since)
    .eq('side', 'BUY')
    .order('timestamp', { ascending: false })
    .limit(MAX_TRADES)

  if (tradesResult.error) {
    console.error('[admin/i-wish-id-copied-that] failed to load trades', tradesResult.error)
  }

  let trades = (tradesResult.data ?? []) as TradeRow[]
  let usedPublicTrades = false

  if (trades.length < 10) {
    const publicTradesResult = await supabase
      .from('trades_public')
      .select('trade_id, trader_wallet, trade_timestamp, side, size, price, outcome, condition_id, market_slug, market_title')
      .gte('trade_timestamp', since)
      .eq('side', 'BUY')
      .order('trade_timestamp', { ascending: false })
      .limit(MAX_TRADES)

    if (publicTradesResult.error) {
      console.error('[admin/i-wish-id-copied-that] failed to load public trades', publicTradesResult.error)
    }

    const publicTrades = (publicTradesResult.data ?? []) as PublicTradeRow[]
    const merged = new Map<string, TradeRow>()
    trades.forEach((trade) => merged.set(trade.id, trade))
    publicTrades.forEach((trade) => {
      const priceValue = Number(trade.price)
      const sizeValue = Number(trade.size)
      merged.set(trade.trade_id, {
        id: trade.trade_id,
        wallet_address: trade.trader_wallet,
        timestamp: trade.trade_timestamp,
        side: trade.side ?? 'BUY',
        shares_normalized: Number.isFinite(sizeValue) ? sizeValue : Number.NaN,
        price: Number.isFinite(priceValue) ? priceValue : Number.NaN,
        token_label: trade.outcome,
        condition_id: trade.condition_id,
        market_slug: trade.market_slug,
        title: trade.market_title
      })
    })
    trades = Array.from(merged.values())
    usedPublicTrades = true
  }
  const conditionIds = Array.from(
    new Set(trades.map((trade) => trade.condition_id).filter(Boolean))
  ) as string[]

  const marketRows: MarketRow[] = []
  const conditionChunks = chunkArray(conditionIds, 200)
  for (const chunk of conditionChunks) {
    const marketsResult = await supabase
      .from('markets')
      .select(
        'condition_id, slug, question, category, outcomes, outcome_prices, volume, liquidity, closed, end_date, icon, twitter_card_image, raw_gamma'
      )
      .in('condition_id', chunk)

    if (marketsResult.error) {
      console.error('[admin/i-wish-id-copied-that] failed to load markets', marketsResult.error)
    }
    if (marketsResult.data) {
      marketRows.push(...(marketsResult.data as MarketRow[]))
    }
  }

  const marketMap = new Map<string, MarketRow>()
  marketRows.forEach((market) => {
    if (market.condition_id) {
      marketMap.set(market.condition_id, market)
    }
  })

  const candidates: TweetCandidate[] = trades
    .map((trade) => {
      const market = trade.condition_id ? marketMap.get(trade.condition_id) : undefined
      const currentPrice = findOutcomePrice(market, trade.token_label)
      const investedUsd = Number(trade.price) * Number(trade.shares_normalized)
      const roiPct =
        currentPrice !== null && Number.isFinite(trade.price) && trade.price > 0
          ? ((currentPrice - trade.price) / trade.price) * 100
          : null

      let lateWindowMinutes: number | null = null
      if (market?.end_date) {
        const endTime = new Date(market.end_date).getTime()
        const tradeTime = new Date(trade.timestamp).getTime()
        if (!Number.isNaN(endTime) && !Number.isNaN(tradeTime)) {
          const deltaMinutes = (endTime - tradeTime) / 60000
          if (deltaMinutes >= 0 && deltaMinutes <= LATE_WINDOW_MINUTES) {
            lateWindowMinutes = Math.round(deltaMinutes)
          }
        }
      }

      const isContrarian = Number.isFinite(trade.price) && trade.price <= CONTRARIAN_PRICE_MAX
      const isBigTicket = Number.isFinite(investedUsd) && investedUsd >= BIG_TICKET_USD
      const isHighRoi = roiPct !== null && roiPct >= HIGH_ROI_THRESHOLD
      const isHugeRoi = roiPct !== null && roiPct >= HUGE_ROI_THRESHOLD
      const isLate = lateWindowMinutes !== null

      let score = 0
      if (isHugeRoi) score += 3
      else if (isHighRoi) score += 2
      if (isLate) score += 2
      if (isContrarian) score += 1
      if (isBigTicket) score += 1
      if (!market) score += 0.25

      const reasonTags: string[] = []
      const reasonParts: string[] = []

      if (isHighRoi && roiPct !== null) {
        const priceText = currentPrice ? `${formatPrice(currentPrice)} now` : 'now trending'
        reasonTags.push('High ROI')
        reasonParts.push(`High ROI move: entry ${formatPrice(trade.price)} ${priceText} (${formatPercent(roiPct)})`)
      }

      if (isLate && lateWindowMinutes !== null) {
        reasonTags.push('Late swing')
        reasonParts.push(`Late swing: entered ${lateWindowMinutes}m before market end`)
      }

      if (isContrarian) {
        reasonTags.push('Contrarian')
        reasonParts.push(`Contrarian entry at ${(trade.price * 100).toFixed(0)}% odds`)
      }

      if (isBigTicket) {
        reasonTags.push('Big ticket')
        reasonParts.push(`Big ticket size: ${formatCurrency(investedUsd)}`)
      }

      if (!market && (isContrarian || isBigTicket)) {
        reasonTags.push('Fresh tape')
        reasonParts.push('Fresh public tape trade with limited market metadata')
      }

      const reason = reasonParts.join(' | ')

      return {
        id: trade.id,
        wallet: trade.wallet_address,
        marketTitle: market?.question || trade.title || 'Unknown market',
        marketSlug: market?.slug || trade.market_slug || null,
        conditionId: trade.condition_id,
        outcome: trade.token_label || 'Outcome',
        price: Number(trade.price),
        shares: Number(trade.shares_normalized),
        investedUsd,
        timestamp: trade.timestamp,
        currentPrice,
        roiPct,
        lateWindowMinutes,
        reason,
        reasonTags,
        category: market?.category ?? null,
        marketEndDate: market?.end_date ?? null,
        marketClosed: market?.closed ?? null,
        marketVolume: market?.volume ?? null,
        marketIcon: market?.icon ?? null,
        twitterCardImage: market?.twitter_card_image ?? null,
        score
      }
    })
    .filter((candidate) => {
      const hasReason = candidate.reasonTags.length > 0
      return candidate.score >= 1.5 && hasReason
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const roiA = a.roiPct ?? -Infinity
      const roiB = b.roiPct ?? -Infinity
      if (roiB !== roiA) return roiB - roiA
      if (b.investedUsd !== a.investedUsd) return b.investedUsd - a.investedUsd
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    })
    .slice(0, MAX_RESULTS)

  return (
    <IWishCopiedFeed
      adminUser={adminUser}
      candidates={candidates}
      stats={{
        tradesScanned: trades.length,
        marketsMatched: marketMap.size,
        dataSource: usedPublicTrades ? 'trades + trades_public' : 'trades'
      }}
      showNav={resolvedSearchParams?.embed !== '1'}
      rules={{
        lookbackHours: LOOKBACK_HOURS,
        lateWindowMinutes: LATE_WINDOW_MINUTES,
        highRoiThreshold: HIGH_ROI_THRESHOLD,
        hugeRoiThreshold: HUGE_ROI_THRESHOLD,
        contrarianPriceMax: CONTRARIAN_PRICE_MAX,
        bigTicketUsd: BIG_TICKET_USD
      }}
    />
  )
}
