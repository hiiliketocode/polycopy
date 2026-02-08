/**
 * FT / Fire Feed excluded traders
 *
 * Traders to exclude from copy-trading and fire feed due to poor performance
 * (e.g. single toxic trader causing ~$10k losses).
 *
 * Set FT_EXCLUDED_TRADERS env var: comma-separated addresses (e.g. "0xa42f127d,...")
 * Default includes known toxic trader from Feb 2026 FT analysis.
 */
const DEFAULT_EXCLUDED = ['0xa42f127d'];

let _cached: Set<string> | null = null;

export function getExcludedTraders(): Set<string> {
  if (_cached) return _cached;
  const raw = process.env.FT_EXCLUDED_TRADERS;
  const list = raw
    ? raw.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_EXCLUDED;
  _cached = new Set(list);
  return _cached;
}

export function isTraderExcluded(wallet: string): boolean {
  return getExcludedTraders().has((wallet || '').toLowerCase());
}
