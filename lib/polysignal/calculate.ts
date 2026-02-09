/**
 * FT-Learnings-Based PolySignal Score
 * Shared by fire-feed and /api/polysignal
 * Based on Feb 2026 forward test analysis:
 * - Conviction 3x+ profitable; <1x lost
 * - Trader WR 55-60% sweet spot
 * - Entry 20-40¢ sweet spot; <20¢ toxic
 * - Crypto short-term -91% PnL drag
 */

export type PolySignalRecommendation = 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'AVOID' | 'TOXIC';

export const POLYSIGNAL_BUY_THRESHOLD = 60;
export const POLYSIGNAL_STRONG_BUY_THRESHOLD = 75;

export function isCryptoShortTerm(title?: string): boolean {
  if (!title || typeof title !== 'string') return false;
  const t = title.toLowerCase();
  const hasCrypto = /bitcoin|btc|ethereum|eth|solana|sol\b|crypto/.test(t);
  const isShortTerm = /up or down|today|tomorrow|next (hour|day)|february \d|march \d/i.test(t) || /\d{1,2}(am|pm)/i.test(t);
  return hasCrypto && isShortTerm;
}

export interface PolySignalStats {
  profileWinRate?: number | null;
  globalWinRate?: number | null;
  profileTrades?: number;
  globalTrades?: number;
  avgBetSizeUsd?: number | null;
  isHedging?: boolean;
}

export interface PolySignalTrade {
  price: number;
  size?: number;
  shares_normalized?: number;
  amount?: number;
  title?: string;
  question?: string;
  market?: string;
}

export function calculatePolySignalScore(
  trade: PolySignalTrade,
  stats: PolySignalStats,
  aiWinProb?: number
): { score: number; recommendation: PolySignalRecommendation; factors: Record<string, unknown>; indicators: Record<string, { value: unknown; label: string; status: string }> } {
  const price = Number(trade.price || 0);
  const size = Number(trade.size ?? trade.shares_normalized ?? trade.amount ?? 0);
  const tradeValue = price * size;
  const title = trade.title || trade.question || trade.market || '';

  const winProb = aiWinProb ?? price;
  const nicheWinRate = stats?.profileWinRate ?? stats?.globalWinRate ?? 0.5;
  const totalTrades = stats?.profileTrades ?? stats?.globalTrades ?? 0;
  const avgBetSize = stats?.avgBetSizeUsd ?? tradeValue;
  const convictionMult = avgBetSize > 0 ? tradeValue / avgBetSize : 1;
  const isHedging = stats?.isHedging ?? false;
  const rawEdge = (winProb - price) * 100;

  const inSweetSpot = price >= 0.20 && price < 0.40;
  const isLongshot = price < 0.20;
  const isMidRange = price >= 0.40 && price < 0.60;
  const isFavorite = price >= 0.60;

  const convictionStrong = convictionMult >= 3;
  const convictionGood = convictionMult >= 2;
  const convictionWeak = convictionMult < 1;

  const wrSweetSpot = nicheWinRate >= 0.55 && nicheWinRate < 0.65;
  const wrGood = nicheWinRate >= 0.50 && nicheWinRate < 0.70;
  const wrBad = nicheWinRate < 0.45 && totalTrades >= 15;

  const isCrypto = isCryptoShortTerm(title);

  let convictionContrib = 0;
  if (convictionStrong) convictionContrib = 25;
  else if (convictionGood) convictionContrib = 15;
  else if (convictionWeak) convictionContrib = -15;

  let priceBandContrib = 0;
  if (inSweetSpot) priceBandContrib = 25;
  else if (isLongshot) priceBandContrib = -20;
  else if (isMidRange) priceBandContrib = -5;
  else if (isFavorite) priceBandContrib = 5;

  let wrContrib = 0;
  if (wrSweetSpot) wrContrib = 20;
  else if (wrGood) wrContrib = 10;
  else if (wrBad) wrContrib = -20;

  let marketContrib = 0;
  if (isCrypto) marketContrib = -20;
  else marketContrib = 5;

  // ML edge: quite strong weight (±15) – AI win prob vs entry price
  const edgeContrib = Math.max(-15, Math.min(15, rawEdge * 0.75));

  const totalContrib = convictionContrib + priceBandContrib + wrContrib + marketContrib + edgeContrib;
  const finalScore = Math.max(0, Math.min(100, 50 + totalContrib));

  let recommendation: PolySignalRecommendation;
  if (isHedging && rawEdge < 0) recommendation = 'TOXIC';
  else if (wrBad) recommendation = 'TOXIC';
  else if (isCrypto && convictionMult < 2) recommendation = 'AVOID';
  else if (isLongshot && nicheWinRate < 0.50) recommendation = 'TOXIC';
  else if (rawEdge < -15) recommendation = 'TOXIC';
  else if (finalScore >= POLYSIGNAL_STRONG_BUY_THRESHOLD) recommendation = 'STRONG_BUY';
  else if (finalScore >= POLYSIGNAL_BUY_THRESHOLD) recommendation = 'BUY';
  else if (finalScore >= 45) recommendation = 'NEUTRAL';
  else if (finalScore >= 30) recommendation = 'AVOID';
  else recommendation = 'TOXIC';

  return {
    score: Math.round(finalScore),
    recommendation,
    factors: {
      conviction: { value: convictionContrib, multiplier: convictionMult, band: convictionStrong ? '3x+' : convictionGood ? '2x+' : convictionWeak ? '<1x' : '1-2x' },
      priceBand: { value: priceBandContrib, inSweetSpot, isLongshot, entryPrice: price },
      traderWr: { value: wrContrib, winRate: nicheWinRate, trades: totalTrades, inSweetSpot: wrSweetSpot },
      marketType: { value: marketContrib, isCryptoShortTerm: isCrypto },
      edge: { value: edgeContrib, rawEdge },
    },
    indicators: {
      conviction: { value: convictionMult, label: `${convictionMult.toFixed(1)}x`, status: convictionStrong ? 'strong' : convictionGood ? 'good' : convictionWeak ? 'weak' : 'neutral' },
      traderWr: { value: nicheWinRate, label: `${(nicheWinRate * 100).toFixed(0)}%`, status: wrSweetSpot ? 'sweet_spot' : wrGood ? 'good' : wrBad ? 'avoid' : 'neutral' },
      entryBand: { value: price, label: `${(price * 100).toFixed(0)}¢`, status: inSweetSpot ? 'sweet_spot' : isLongshot ? 'avoid' : 'neutral' },
      marketType: { value: isCrypto ? 'crypto_short' : 'other', label: isCrypto ? 'Crypto short-term' : 'Non-crypto', status: isCrypto ? 'caution' : 'ok' },
      edge: { value: rawEdge, label: `${rawEdge >= 0 ? '+' : ''}${rawEdge.toFixed(1)}%`, status: rawEdge >= 10 ? 'strong' : rawEdge >= 5 ? 'good' : rawEdge < 0 ? 'negative' : 'neutral' },
    },
  };
}
